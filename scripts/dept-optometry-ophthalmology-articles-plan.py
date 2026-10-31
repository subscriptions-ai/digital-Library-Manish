#!/usr/bin/env python3
"""
Builds a frozen article plan for scripts/dept-optometry-ophthalmology-articles-apply.cjs. READ-ONLY: it asks Crossref and Europe PMC for public records and writes two files
(plan JSON + its sha256). It never touches the database or production.

  python3 scripts/dept-optometry-ophthalmology-articles-plan.py --out <dir> --canary 200 [--epmc-only 30] [--seed 20261031]

Candidates come from the Phase A enumeration (raw/enum-*.ndjson in the evidence folder), restricted to the journals of plan-journals.json. Every chosen DOI is then fetched AGAIN from the
source and judged on the fresh record: the licence must be stated by that record and be one the existing rule serves (CC BY, BY-SA, BY-ND, CC0, public domain), the record must name one of
the journal's ISSNs, the year must be 2020 or later. A DOI that fails is dropped and counted, never repaired. Nothing is guessed: a licence is copied as the source states it.

  Crossref: /works?filter=doi:... ; the licence is a Crossref licence entry that is IN FORCE: delay-in-days 0 (no embargo), start date not after today, and content-version
  vor or unspecified (an "am" accepted manuscript or a "tdm" text-mining licence is not the article's licence). The version of record is preferred; the URL, version and start are kept.
  Europe PMC: resultType=core; the licence is the record's own `license` string. It has no URL, so the DOI is looked up on Crossref and the URL is stored only when a Crossref
  licence entry in force (same rule) names the SAME licence; if Crossref has none, or names another, the DOI is held for wave 2 (wave2-hold.json), not planned.
  A journal is matched by ISSN or e-ISSN (the database's issn can be an obsolete print number that Crossref answers 404 for, so both are tried).
"""
import argparse, hashlib, json, os, random, re, sys, time, urllib.error, urllib.parse, urllib.request

MAIL = "library-ops@journalslibrary.com"
UA = {"User-Agent": f"STM-Digital-Library-article-plan/1.0 (mailto:{MAIL})"}
DEPARTMENT = "Optometry & Ophthalmology"
YEAR_FLOOR = 2020
COMMERCIAL_OK = re.compile(r"^(cc[\s-]?by([\s-]?(sa|nd))?|cc0|public[\s-]?domain)$", re.I)       # eligibility.ts:15


def licence_ok(raw):
    t = str(raw or "").strip()
    if not t or re.search("nc", re.sub(r"[^a-z]", "", t, flags=re.I), re.I):
        return False
    return bool(COMMERCIAL_OK.match(re.sub(r"\s+", " ", t)))


def cc_from_url(url):
    u = str(url or "")
    m = re.search(r"creativecommons\.org/licenses/(by(?:-(?:nc|nd|sa))*)(?:/|$)", u, re.I)
    if m:
        return "cc-" + m.group(1).lower()
    if re.search(r"creativecommons\.org/publicdomain/zero", u, re.I):
        return "cc0"
    if re.search(r"creativecommons\.org/publicdomain/mark", u, re.I):
        return "public domain"
    return None


def norm_doi(d):
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", str(d or "").strip(), flags=re.I).strip().lower()
    return d or None


def licence_token(raw):
    """'cc by' -> 'cc-by', 'CC BY-SA' -> 'cc-by-sa', 'public domain' -> 'public domain': one spelling to compare an Europe PMC string with a URL's."""
    t = re.sub(r"\s+", " ", str(raw or "").strip().lower())
    if re.match(r"^cc[ -]by", t):
        return t.replace(" ", "-")
    if re.match(r"^public[ -]domain$", t):
        return "public domain"
    return t


def crossref_licence(entries, today):
    """The Crossref licence entry that is in force and commercial-OK, or (None, why). In force = no embargo (delay-in-days 0), started (start <= today),
    content-version vor or unspecified. Returns ((token, url, version, start, delay), None)."""
    best, why = None, "no licence entry"
    for l in entries or []:
        tok = cc_from_url(l.get("URL"))
        if not tok:
            why = "licence entry is not a Creative Commons licence" if why == "no licence entry" else why
            continue
        if not licence_ok(tok):
            why = "CC licence is not commercial-OK"
            continue
        try:
            delay = int(l.get("delay-in-days") or 0)
        except Exception:
            why = "unreadable delay-in-days"; continue
        if delay != 0:
            why = "licence is embargoed (delay-in-days > 0)"; continue
        version = l.get("content-version") or "unspecified"
        if version not in ("vor", "unspecified"):
            why = f"licence entry is content-version {version}"; continue
        st = l.get("start") or {}
        start = (st.get("date-time") or "")[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", start):
            dp = (st.get("date-parts") or [[None]])[0]
            start = "-".join(f"{int(x):02d}" if i else f"{int(x):04d}" for i, x in enumerate(dp) if x is not None) if dp and dp[0] and len(dp) >= 3 else ""
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", start):
            why = "licence entry has no readable start date"; continue
        if start > today:
            why = f"licence starts {start}, after today"; continue
        cand = (tok, l["URL"], version, start, delay)
        if best is None or (version == "vor" and best[2] != "vor"):
            best = cand
    return (best, None) if best else (None, why)


def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as f:
                return json.load(f)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"_http": 404}
            if e.code in (429, 500, 502, 503):
                time.sleep(3 * (k + 1))
                continue
            return {"_http": e.code}
        except Exception:
            time.sleep(2 + k)
    return {"_http": "fail"}


def load_ndjson(path):
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if "error" not in r:
                yield r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default=os.path.expanduser("~/stm-evidence/dept-optometry-ophthalmology-articles-2026-10-31"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--canary", type=int, default=200)
    ap.add_argument("--epmc-only", type=int, default=30)
    ap.add_argument("--seed", type=int, default=20261031)
    ap.add_argument("--exclude-plan", action="append", default=[], help="a frozen plan whose DOIs are already written (the canary); they are left out")
    ap.add_argument("--name", default="plan-canary", help="file name prefix of the plan")
    a = ap.parse_args()
    ev = a.evidence
    os.makedirs(a.out, exist_ok=True)
    rnd = random.Random(a.seed)

    scope = json.load(open(f"{ev}/plan-journals.json"))
    journals = [{"journalId": j["journalId"], "issn": j["issn"], "eissn": j["eissn"], "status": j["status"], "title": j["title"]} for j in scope["journals"]]
    jid = {j["journalId"]: j for j in journals}
    by_issn = {}
    for j in journals:
        for x in (j["issn"], j["eissn"]):
            if x:
                by_issn[x.upper()] = j["journalId"]
    prod_dois = set(json.load(open(f"{ev}/raw/prod-baseline.json"))["articleDois"])

    # candidates: DOIs the Phase A enumeration saw with a commercial-OK CC licence on Crossref, and Europe PMC's cc-flagged DOIs that Crossref does not license as CC
    cr_cc, cr_all = {}, {}
    for r in load_ndjson(f"{ev}/raw/enum-crossref.ndjson"):
        if r.get("journal") in jid and r.get("doi") and r.get("year") and r["year"] >= YEAR_FLOOR:
            cr_all[r["doi"]] = r["journal"]
            if licence_ok(r.get("lic")):
                cr_cc[r["doi"]] = r["journal"]
    ep_cc = {}
    for r in load_ndjson(f"{ev}/raw/enum-europepmc.ndjson"):
        if r.get("tag") == "cc_commercial_ok" and r.get("doi") and r.get("journal") in jid and r["doi"] not in cr_cc:
            ep_cc[r["doi"]] = r["journal"]
    for ex in a.exclude_plan:
        prod_dois |= {r["doi"] for r in json.load(open(ex))["rows"]}
    cr_cc = {d: j for d, j in cr_cc.items() if d not in prod_dois}
    ep_cc = {d: j for d, j in ep_cc.items() if d not in prod_dois}

    def spread(cands, n):
        """Round-robin over journals, so the canary is not one big journal."""
        per = {}
        for d, j in cands.items():
            per.setdefault(j, []).append(d)
        for v in per.values():
            rnd.shuffle(v)
        order = list(per)
        rnd.shuffle(order)
        out = []
        while len(out) < n and any(per.values()):
            for j in order:
                if per[j] and len(out) < n:
                    out.append(per[j].pop())
        return out

    today = time.strftime("%Y-%m-%d", time.gmtime())
    n_ep = min(a.epmc_only, a.canary)
    # ask for more than needed: some will fail the fresh check. Europe PMC rows are optional (they need a Crossref URL); Crossref rows fill the canary to its size.
    want_cr = spread(cr_cc, int(a.canary * 1.4) + 10)
    want_ep = spread(ep_cc, max(60, n_ep * 4)) if n_ep else []
    wave2 = []

    dropped = {}
    def drop(why):
        dropped[why] = dropped.get(why, 0) + 1

    rows_cr, rows_ep = [], []
    # ---- Crossref, 20 DOIs per request
    for i in range(0, len(want_cr), 20):
        chunk = want_cr[i:i + 20]
        flt = ",".join("doi:" + d for d in chunk)
        d = get(f"https://api.crossref.org/works?filter={urllib.parse.quote(flt)}&rows=20&select=DOI,title,author,issued,container-title,ISSN,volume,issue,license,type&mailto={MAIL}")
        if "_http" in d:
            for _ in chunk:
                drop(f"crossref http {d['_http']}")
            continue
        got = {norm_doi(it.get("DOI")): it for it in d["message"]["items"]}
        for doi in chunk:
            it = got.get(doi)
            if not it:
                drop("crossref: record not returned"); continue
            j = jid[cr_cc[doi]]
            mine = {x.upper() for x in (j["issn"], j["eissn"]) if x}
            theirs = {x.upper() for x in (it.get("ISSN") or [])}
            if not (mine & theirs):
                drop("crossref: record names another journal's ISSN"); continue
            if it.get("type") != "journal-article":
                drop("crossref: not a journal-article"); continue
            title = (it.get("title") or [""])[0].strip()
            year = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
            if not title or not isinstance(year, int) or year < YEAR_FLOOR:
                drop("crossref: no title or year before 2020"); continue
            lic, why = crossref_licence(it.get("license"), today)
            if not lic:
                drop("crossref: " + why); continue
            authors = ", ".join(x for x in ((au.get("name") or " ".join(p for p in (au.get("given"), au.get("family")) if p)).strip() for au in (it.get("author") or [])) if x) or None
            rows_cr.append({"doi": doi, "title": title, "authors": authors, "year": year, "volume": it.get("volume"), "issue": it.get("issue"), "journalId": j["journalId"],
                            "licence": lic[0], "licenceUrl": lic[1], "licenceContentVersion": lic[2], "licenceStart": lic[3], "licenceDelayDays": lic[4],
                            "licenceSource": "Crossref", "licenceUrlSource": "Crossref", "source": "Crossref", "sourceRecordId": f"crossref:{doi}"})
        time.sleep(0.4)
    # ---- Europe PMC, one DOI per request (core record); the URL has to come from Crossref, else the DOI waits for wave 2
    for doi in want_ep:
        q = urllib.parse.quote(f'DOI:"{doi}"')
        d = get(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={q}&resultType=core&format=json&pageSize=2")
        res = (d.get("resultList") or {}).get("result") or [] if "_http" not in d else []
        x = next((r for r in res if norm_doi(r.get("doi")) == doi), None)
        if not x:
            drop("europepmc: record not returned"); continue
        ji = x.get("journalInfo") or {}; jj = ji.get("journal") or {}
        theirs = {str(s).upper() for s in (jj.get("issn"), jj.get("essn")) if s}
        j = jid[ep_cc[doi]]
        if not ({s.upper() for s in (j["issn"], j["eissn"]) if s} & theirs):
            drop("europepmc: record names another journal's ISSN"); continue
        lic = (x.get("license") or "").strip()
        year = int(ji.get("yearOfPublication") or x.get("pubYear") or 0) or None
        if not licence_ok(lic):
            drop("europepmc: licence on the fresh record is not commercial-OK"); continue
        if not x.get("title") or not year or year < YEAR_FLOOR:
            drop("europepmc: no title or year before 2020"); continue
        base = {"doi": doi, "title": x["title"].strip(), "authors": (x.get("authorString") or None), "year": year, "volume": ji.get("volume"), "issue": ji.get("issue"),
                "journalId": j["journalId"], "licence": lic, "licenceSource": "EuropePMC", "source": "EuropePMC", "sourceRecordId": str(x.get("pmcid") or x.get("pmid") or x.get("id"))}
        cd = get(f"https://api.crossref.org/works?filter=doi:{urllib.parse.quote(doi)}&rows=1&select=DOI,license&mailto={MAIL}")
        items = (cd.get("message") or {}).get("items") or [] if "_http" not in cd else []
        entries = next((it.get("license") for it in items if norm_doi(it.get("DOI")) == doi), None)
        cl, why = crossref_licence(entries, today)
        if not cl:
            wave2.append({**base, "heldBecause": "Crossref has no usable licence URL: " + why}); continue
        if cl[0] != licence_token(lic):
            wave2.append({**base, "heldBecause": f"Crossref names {cl[0]}, Europe PMC says {lic}", "crossrefUrl": cl[1]}); continue
        rows_ep.append({**base, "licenceUrl": cl[1], "licenceContentVersion": cl[2], "licenceStart": cl[3], "licenceDelayDays": cl[4], "licenceUrlSource": "Crossref"})
        time.sleep(0.25)

    ep_rows = rows_ep[:n_ep]
    rows = ep_rows + rows_cr[: a.canary - len(ep_rows)]      # Crossref rows fill the canary to its size
    if len(rows) < a.canary:
        print(f"WARNING: only {len(rows)} rows qualified", file=sys.stderr)
    rnd.shuffle(rows)
    run_id = f"dept-optometry-ophthalmology-articles-{time.strftime('%Y-%m-%d')}-{hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:8]}"
    plan = {"runId": run_id, "department": DEPARTMENT, "source": "Crossref+EuropePMC", "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "window": {"fromYear": YEAR_FLOOR},
            "rule": "commercial-OK Creative Commons only (CC BY, BY-SA, BY-ND, CC0, public domain), as the source record states it, from a licence entry in force (no embargo, started, version of record or unspecified) with its URL; no abstract; LinkOnly",
            "journals": [{k: j[k] for k in ("journalId", "issn", "eissn", "status")} for j in journals], "rows": rows}
    path = f"{a.out}/{a.name}-{len(rows)}.json"
    json.dump(plan, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    open(f"{a.out}/{a.name}-{len(rows)}.sha256", "w").write(f"{sha}  {a.name}-{len(rows)}.json\n")
    json.dump(wave2, open(f"{a.out}/wave2-hold.json", "w"), ensure_ascii=False, indent=1)
    rep = {"runId": run_id, "rows": len(rows), "wave2Held": len(wave2), "wave2HeldReasons": {k: sum(1 for w in wave2 if w["heldBecause"].split(":")[0] == k) for k in {w["heldBecause"].split(":")[0] for w in wave2}}, "crossref": sum(1 for r in rows if r["source"] == "Crossref"), "europepmc": sum(1 for r in rows if r["source"] == "EuropePMC"),
           "journals": len({r["journalId"] for r in rows}), "droppedOnFreshCheck": dropped, "candidatesFetchedCrossref": len(want_cr), "candidatesFetchedEuropePMC": len(want_ep),
           "candidatePoolCrossref": len(cr_cc), "candidatePoolEuropePMCOnly": len(ep_cc), "builtOn": today, "sha256": sha}
    json.dump(rep, open(f"{a.out}/build-report.json", "w"), indent=1)
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
