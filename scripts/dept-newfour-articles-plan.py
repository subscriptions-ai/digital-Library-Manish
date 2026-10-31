#!/usr/bin/env python3
"""
Builds the frozen article plans (a canary and a wave) for scripts/dept-newfour-articles-apply.cjs: Radiology, Medical Laboratory Technology or Paramedical Sciences.
READ-ONLY: it asks Crossref for public records and writes plan JSON files with their sha256. It never touches the database or production.

  python3 scripts/dept-newfour-articles-plan.py --department Radiology --journals <journals.json> --out <dir> [--canary 200] [--wave-limit N] [--exclude-plan <plan>]...

journals.json is the department's MetadataOnly journals from production, read-only: [{id, issn, eissn, title, domain, status}] (the coordinator-held Paramedical journals are not in it).
For every journal it walks Crossref (/journals/<issn>/works, the DB's issn first, then the e-ISSN: the DB's issn can be an obsolete number Crossref answers 404 for), 2020 on, journal
articles that carry a licence, and keeps a record only when ITS OWN licence entry is in force and commercial-OK: delay-in-days 0, start not after today, content-version vor or unspecified,
a Creative Commons BY / BY-SA / BY-ND / CC0 / public-domain URL; the record must name one of the journal's ISSNs; a title, a DOI, a year 2020..next year. Nothing is guessed or repaired.
The canary is spread over the journals (round robin); the wave is the rest. The two never share a DOI. Europe PMC is not used (its licence string has no URL; those DOIs wait).
"""
import argparse, hashlib, importlib.util, json, os, random, re, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("opt_plan", os.path.join(here, "dept-optometry-ophthalmology-articles-plan.py"))
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)      # the tested helpers: get, norm_doi, crossref_licence, MAIL, YEAR_FLOOR
SLUGS = {"Radiology": "radiology", "Medical Laboratory Technology": "mlt", "Paramedical Sciences": "paramedical"}
SELECT = "DOI,title,author,issued,container-title,ISSN,volume,issue,license,type"


def walk_journal(j, today, this_year, drops):
    ids = [x for x in (j["issn"], j["eissn"]) if x]
    mine = {x.upper() for x in ids}
    rows, seen_any = [], False
    for use in ids:
        cursor = "*"
        while True:
            d = base.get(f"https://api.crossref.org/journals/{use}/works?filter=type:journal-article,from-pub-date:{base.YEAR_FLOOR}-01-01,has-license:true&rows=1000"
                         f"&cursor={urllib.parse.quote(cursor)}&select={SELECT}&mailto={base.MAIL}")
            if "_http" in d:
                if d["_http"] != 404:
                    drops[f"crossref http {d['_http']} on {use}"] = drops.get(f"crossref http {d['_http']} on {use}", 0) + 1
                break
            seen_any = True
            items = d["message"]["items"]
            for it in items:
                doi = base.norm_doi(it.get("DOI"))
                def drop(why):
                    drops[why] = drops.get(why, 0) + 1
                if not doi:
                    drop("no DOI"); continue
                if it.get("type") != "journal-article":
                    drop("not a journal-article"); continue
                if not ({x.upper() for x in (it.get("ISSN") or [])} & mine):
                    drop("record names another journal's ISSN"); continue
                title = (it.get("title") or [""])[0].strip()
                year = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
                if not title:
                    drop("no title"); continue
                if not isinstance(year, int) or year < base.YEAR_FLOOR or year > this_year + 1:
                    drop("year outside 2020..next year"); continue
                lic, why = base.crossref_licence(it.get("license"), today)
                if not lic:
                    drop(why); continue
                authors = ", ".join(x for x in ((au.get("name") or " ".join(p for p in (au.get("given"), au.get("family")) if p)).strip() for au in (it.get("author") or [])) if x) or None
                rows.append({"doi": doi, "title": title, "authors": authors, "year": year, "volume": it.get("volume"), "issue": it.get("issue"), "journalId": j["id"],
                             "licence": lic[0], "licenceUrl": lic[1], "licenceContentVersion": lic[2], "licenceStart": lic[3], "licenceDelayDays": lic[4],
                             "licenceSource": "Crossref", "licenceUrlSource": "Crossref", "source": "Crossref", "sourceRecordId": f"crossref:{doi}"})
            nxt = d["message"].get("next-cursor")
            if not items or not nxt or nxt == cursor:
                break
            cursor = nxt
        if seen_any:
            break                                   # the first ISSN Crossref knows is enough: both name the same journal
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--department", required=True, choices=sorted(SLUGS))
    ap.add_argument("--journals", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--canary", type=int, default=200)
    ap.add_argument("--wave-limit", type=int, default=0, help="0 = every remaining row")
    ap.add_argument("--exclude-plan", action="append", default=[])
    ap.add_argument("--seed", type=int, default=20261031)
    a = ap.parse_args()
    slug = SLUGS[a.department]
    os.makedirs(a.out, exist_ok=True)
    journals = [j for j in json.load(open(a.journals)) if j["domain"] == a.department and j["status"] == "MetadataOnly" and j["issn"]]
    today = time.strftime("%Y-%m-%d", time.gmtime()); this_year = int(today[:4])
    excluded = set()
    for ex in a.exclude_plan:
        excluded |= {r["doi"] for r in json.load(open(ex))["rows"]}
    drops = {}
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=3) as ex:
        per_journal = list(ex.map(lambda j: walk_journal(j, today, this_year, drops), journals))
    seen, rows = set(), []
    for rr in per_journal:
        for r in rr:
            if r["doi"] in seen or r["doi"] in excluded:
                continue
            seen.add(r["doi"]); rows.append(r)
    rnd = random.Random(a.seed)
    by = {}
    for r in rows:
        by.setdefault(r["journalId"], []).append(r)
    for v in by.values():
        rnd.shuffle(v)
    order = list(by); rnd.shuffle(order)
    canary = []
    while len(canary) < a.canary and any(by.values()):
        for jid in order:
            if by[jid] and len(canary) < a.canary:
                canary.append(by[jid].pop())
    wave = [r for v in by.values() for r in v]
    rnd.shuffle(wave)
    if a.wave_limit:
        wave = wave[: a.wave_limit]

    def write(kind, rs):
        if not rs:
            return None
        run_id = f"dept-{slug}-articles-{today}-{hashlib.sha256(json.dumps(rs, sort_keys=True).encode()).hexdigest()[:8]}"
        plan = {"runId": run_id, "department": a.department, "source": "Crossref", "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "window": {"fromYear": base.YEAR_FLOOR},
                "rule": "commercial-OK Creative Commons only (CC BY, BY-SA, BY-ND, CC0, public domain), from a Crossref licence entry in force (no embargo, started, version of record or unspecified) with its URL; no abstract; LinkOnly",
                "journals": [{"journalId": j["id"], "issn": j["issn"], "eissn": j["eissn"], "status": j["status"]} for j in journals], "rows": rs}
        path = f"{a.out}/plan-{slug}-{kind}-{len(rs)}.json"
        json.dump(plan, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
        sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
        open(path[:-5] + ".sha256", "w").write(f"{sha}  {os.path.basename(path)}\n")
        return {"file": os.path.basename(path), "runId": run_id, "rows": len(rs), "journals": len({r['journalId'] for r in rs}), "sha256": sha,
                "licences": {k: sum(1 for r in rs if r["licence"] == k) for k in sorted({r["licence"] for r in rs})}}
    rep = {"department": a.department, "journalsWalked": len(journals), "journalsWithRows": len(by) + sum(1 for r in canary if r["journalId"] not in by), "eligibleRows": len(rows),
           "droppedOnFreshRecord": dict(sorted(drops.items(), key=lambda x: -x[1])), "seconds": round(time.time() - t0), "canary": write("canary", canary), "wave": write("wave", wave)}
    json.dump(rep, open(f"{a.out}/build-report-{slug}.json", "w"), indent=1)
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
