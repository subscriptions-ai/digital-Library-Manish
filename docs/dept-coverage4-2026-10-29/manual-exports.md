# Official exports that need an ordinary interactive download

Neither route below was bypassed. Both answered the automated request with an anti-bot challenge page, so the files have to be downloaded by a person in a normal browser. Once saved at the path given, the existing pipeline picks them up (`scripts/dept-coverage/build_pool2.py` already parses the Wiley file; nothing else changes): rebuild the pool, then run `classify2.ts`, `stage1b.py`, `aims_scope.py` for new homepages, `stage2b.py` and `freeze2.py`. KBART dates, access types and list membership are discovery and identity hints only; current publication still comes from Crossref (or an independent corroboration) and scope from two kinds of evidence. A person should also read the download page's terms of use before saving.

## Wiley: KBART title lists

* Page: https://onlinelibrary.wiley.com/library-info/resources/discovery/kbart2019 (the automated request received a Cloudflare "Just a moment / enable JavaScript and cookies" page, HTTP 403).
* Steps: open the page in a browser; accept the challenge; download the KBART file for **all Wiley journals** (the page offers tab-separated `.txt` files, sometimes zipped); if there are several files (by package), download the complete journals list or all packages; unzip if needed.
* Save as `data/dept-coverage4/raw/wiley-kbart-journals.txt` (any name matching `wiley-kbart*.txt` is read; tab-separated, UTF-8, the standard KBART header row).
* Columns used: `publication_title`, `print_identifier`, `online_identifier`, `date_first_issue_online`, `date_last_issue_online`, `title_url`, `publisher_name`, `publication_type` (only `serial`).

## IET: journal portfolio

* Page: https://www.theiet.org/publishing/publishing-with-the-iet/publishing-with-iet-journals (the automated request received an Imperva/Incapsula challenge: a 212-byte page with a script and no content). digital-library.theiet.org answers HTTP 403.
* Steps: open the page in a browser and copy the journal list (title, ISSN, e-ISSN) into a CSV; or ask IET (librarian/support contact on the same site) for the journal title list or KBART file.
* Save as `data/dept-coverage4/raw/iet-journals.csv` with columns `title,issn,eissn,url`. (The pipeline has no IET-specific parser yet: ask for it once the file exists; it is the same small change as the Wiley one.)
* Already covered without this file: IET's own Crossref deposits (member 265): 51 journals, 47 already in the catalogue, 3 net-new, 1 title conflict, evaluated and held or ineligible in earlier runs.

## Not used and why

* IEEE KBART title lists and the IEEE Xplore browse pages: a script-driven application behind an anti-bot layer (HTTP 418). IEEE's own Crossref deposits are covered (276 journals).
