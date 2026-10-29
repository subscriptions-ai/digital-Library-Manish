# Books count reconciliation — production, 2026-10-29T06:55:30.898Z

Read-only, one REPEATABLE READ snapshot (`scripts/books-reconcile.cjs`), database `postgres`. Every row is in exactly one bucket.

## Where each screenshot figure comes from

| Figure | UI → API → query | Value |
|---|---|---|
| Public `/digital-library` “Academic E-Books” | `/api/public/content-type-counts` → `contentTypeCounts` → Book `status='Published'` + Content `contentType='Books' and status<>'Draft'` | **94,926** |
| Admin `/admin/books` **New** | `/api/admin/library/items?contentType=Books` → `Book` count, every status | **102,190** |
| Admin `/admin/books` **Archived** | `/api/admin/content?contentType=Books` → `Content` where `contentType='Books'`, every status | **48,984** |

New and Archived are **collections** (two tables), not lifecycle states. A Published archived book is listed publicly exactly like a structured one.

## Mutually exclusive reconciliation

### New collection (`Book`)

| Bucket | Books |
|---|---:|
| public · catalogue record only (links to the source) | 65,582 |
| held · Draft, no department (review queue) | 36,508 |
| held · Draft, department assigned | 100 |
| **Total rows** | **102,190** |

### Archived collection (`Content`, type Books)

| Bucket | Books |
|---|---:|
| public · full text served here | 27,352 |
| public · listed, file not validated | 1,992 |
| held · Draft, file check failed | 19,555 |
| held · Draft though the file validated (hidden by an admin) | 85 |
| **Total rows** | **48,984** |

### Putting them together

- Unique book ids: **151,174** (102,190 + 48,984); the two tables share **0** ids, and ids are unique inside each table.
- Publicly listed: 65,582 + 29,344 = **94,926** (matches the live API at 06:55 UTC).
- Held / not public: 36,608 + 19,640 = 56,248.
- **Not merged, reported:** 4,359 of the 65,582 public structured titles also appear (same normalised title) among the 29,344 public legacy books, so the 94,926 listed *records* correspond to about **81,973 distinct titles**. Two collections of one library overlap; deleting or hiding either side is a separate, reviewed decision.

## What “readable” means

Listed ≠ readable. `Book` rows are catalogue records that link to the source (access `LinkOnly`/`MetadataOnly`, no hosted file): **0** are served from here. Legacy books with a validated file: **27,352** (a further 1,992 are listed but not validated). The public site now says so.

## By department (all non-deleted records, then public)

| Department | New total | New public | Archived total | Archived public |
|---|---:|---:|---:|---:|
| (none) | 36,508 | 0 | 0 | 0 |
| Nursing | 14,777 | 14,777 | 2,068 | 939 |
| Medical Sciences | 13,874 | 13,870 | 2,841 | 1,656 |
| Law | 8,505 | 8,505 | 5,168 | 2,828 |
| Agriculture | 7,758 | 7,758 | 1,888 | 1,240 |
| Energy | 5,138 | 5,138 | 2,301 | 1,487 |
| Computer / IT | 4,888 | 4,888 | 1,034 | 1,034 |
| Pharmacy | 2,061 | 2,061 | 1,999 | 694 |
| Life Sciences | 1,589 | 1,589 | 1,499 | 896 |
| Dental | 1,574 | 1,478 | 1,996 | 1,051 |
| Education and Social Sciences | 1,217 | 1,217 | 2,146 | 1,341 |
| Bio Technology | 970 | 970 | 2,136 | 1,410 |
| Chemistry | 893 | 893 | 2,302 | 1,425 |
| Arts | 874 | 874 | 1,993 | 1,992 |
| Commerce | 432 | 432 | 1,995 | 1,310 |
| Science | 428 | 428 | 0 | 0 |
| Architecture | 191 | 191 | 0 | 0 |
| Management | 173 | 173 | 261 | 72 |
| Physiotherapy | 173 | 173 | 0 | 0 |
| Electronics & Telecommunication Engineering | 45 | 45 | 435 | 385 |
| Civil / Construction Engineering | 45 | 45 | 2,114 | 1,311 |
| Mechanical Engineering | 42 | 42 | 132 | 49 |
| Electrical Engineering | 21 | 21 | 1,062 | 1,062 |
| Material Science | 9 | 9 | 680 | 473 |
| Chemical Engineering | 3 | 3 | 150 | 112 |
| Applied Mechanics | 2 | 2 | 2,064 | 1,211 |
| Social Sciences | 0 | 0 | 23 | 12 |
| Engineering | 0 | 0 | 4,090 | 1,624 |
| Medical | 0 | 0 | 2,061 | 0 |
| Applied Sciences | 0 | 0 | 2,052 | 2,016 |
| Multidisciplinary | 0 | 0 | 47 | 28 |
| Nano Technology | 0 | 0 | 2,439 | 1,682 |
| Physiotheraphy | 0 | 0 | 4 | 2 |
| Ayurveda | 0 | 0 | 4 | 2 |

Legacy rows keep the spelling they were scraped with (“Engineering”, “Applied Sciences”, “Physiotheraphy”). The admin panel folds recognised spellings into the 29 official departments and lists the rest under *Unassigned / unrecognised*; nothing is rewritten.
