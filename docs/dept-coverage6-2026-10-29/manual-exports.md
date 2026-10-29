# Exports and user actions still needed (updated 2026-10-29, round 5)

Nothing here was bypassed. `scripts/dept-coverage/build_pool2.py` already reads a Wiley KBART file placed as described; after saving a file, re-run the pool, `classify2.ts`, `stage1b.py`, `aims_scope.py`, `stage2b.py` and `freeze2.py`. KBART dates and list membership are identity and discovery hints only; current publication still comes from Crossref (or an independent corroboration), and scope from two kinds of evidence. Read the download page's terms of use before saving.

## 1. Wiley KBART (needs a person) — the one file that matters

* URL: https://onlinelibrary.wiley.com/library-info/resources/discovery/kbart2019 (re-tested this round: HTTP 403, Cloudflare "Just a moment… enable JavaScript and cookies").
* Action: in a normal browser, open the page, pass the check, download the KBART file for **all Wiley journals** (tab-separated `.txt`, possibly zipped; if the page splits it by package, take the complete journals list).
* Save as: `data/dept-coverage4/raw/wiley-kbart-journals.txt` (any `wiley-kbart*.txt` is read). Columns used: `publication_title`, `print_identifier`, `online_identifier`, `date_first_issue_online`, `date_last_issue_online`, `title_url`, `publisher_name`, `publication_type` (only `serial`).
* Why it matters: Wiley hosts the IET journals and many electrical, electronics and biotechnology titles; their scope pages are also behind the same challenge.

## 2. IET journal portfolio: no separate file needed

* The page https://www.theiet.org/publishing/publishing-with-the-iet/publishing-with-iet-journals **answered normally this round** (HTTP 200; the earlier challenge page was transient) but contains no journal list: it links to the IET Research Hub on Wiley Online Library (`ietresearch.onlinelibrary.wiley.com`, HTTP 403 Cloudflare). The IET FAQ page names 11 partnership journals; 10 are already in the catalogue (*High Voltage*, *IET Energy Systems Integration*, *IET Smart Energy Systems*, *Energy Internet*, *Electrical Materials and Applications*, … in their existing departments) and 1 (*AI for Engineering*) is outside these departments. IET's own Crossref deposits (member 265: 51 journals, 47 held, 3 net-new) were evaluated in earlier rounds.
* So the IET portfolio list will come from the Wiley file in step 1. If a person prefers, an IET librarian contact (journals@theiet.org is named on the FAQ page) can send the IET title list; save it as `data/dept-coverage4/raw/iet-journals.csv` (`title,issn,eissn,url`) and ask for a parser.

## 3. Springer-hosted journals: scope cannot be read automatically

* `link.springer.com` disallows all automated access (robots.txt), including `/journal/<id>/aims-and-scope`. For the Springer journals in the single-evidence pool the aims-and-scope text has to be read by a person, or supplied through Springer Nature's own export for registered librarians (the Metadata Downloader / Librarian Portal) if the organisation has such an account.

## 4. Others not tried

* IEEE KBART title lists: script-driven application behind an anti-bot layer; IEEE's own Crossref deposits (276 journals) are covered.

## Status at 2026-10-29 08:05 UTC (round 6)

No Wiley file had been supplied (`data/dept-coverage4/raw/wiley-kbart*.txt` absent) and the Wiley page still answers HTTP 403 with a Cloudflare challenge; the request was not repeated further. When the file arrives: save it under the exact name above, then run `RUN_DIR=dept-coverage6 python3 scripts/dept-coverage/build_pool2.py` (it reads Wiley KBART records), `classify2.ts`, `stage1b.py`, `stage2b.py`. KBART is identity/discovery evidence only: it never supplies subject scope, current publication or rights.
