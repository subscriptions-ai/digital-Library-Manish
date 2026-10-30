# Department hero photographs, added 2026-10-30

The four departments added on 2026-10-30 (Paramedical Sciences, Radiology, Medical Laboratory Technology, Optometry & Ophthalmology)
were all pointed at the Medical Sciences photograph, so four different department pages showed the same image. Each now has its own.

The files are **served by us** from `public/hero/departments/` rather than hotlinked, so the pages do not depend on a third party and the
crop is ours. Each was cropped to the 4:3 the page renders (`aspect-[4/3]`, `object-cover`) and saved at 1200x900, JPEG quality 82, progressive.

## Where they came from

All four are Wikimedia Commons photographs, fetched through the documented `api.php` / `Special:FilePath` endpoints with a named user agent,
one request at a time. Unsplash, which the other departments use, now answers automated requests with an anti-bot challenge (HTTP 401); that
challenge was not worked around, so Commons was used instead.

### paramedical-sciences

- **File**: `public/hero/departments/paramedical-sciences.jpg` (168 KB, 1200x900)
- **sha256**: `2670bd6504950fe3f032307a550d2b0bab215c4fff2d7b520365c520c7004033`
- **Source**: https://commons.wikimedia.org/wiki/File:US_teach_basic_life_support_to_Ghana_EMT_trainees_during_AL26_(9666427).jpg
- **Original**: 6184 x 4123
- **Author**: U.S. Army photo by Staff Sgt. Catessa Palone
- **Licence**: Public domain
- **Attribution required**: no (public domain)
- **Retrieved**: 2026-10-30

### radiology

- **File**: `public/hero/departments/radiology.jpg` (218 KB, 1200x900)
- **sha256**: `50c76628e685087c3defb4593f767fbbbb422d79b4b1fdbfcba1da85066e5e72`
- **Source**: https://commons.wikimedia.org/wiki/File:CT_Scan_Liver-Kidneys.jpg
- **Original**: 5017 x 3345
- **Author**: Sérgio Valle Duarte
- **Licence**: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0
- **Attribution required**: yes — shown on the page, top right of the photograph
- **Retrieved**: 2026-10-30

### medical-laboratory-technology

- **File**: `public/hero/departments/medical-laboratory-technology.jpg` (96 KB, 1200x900)
- **sha256**: `81c285f27c659ce29ae0672bf74e6cc8f471ac1bb8b5252727161b3ed1bcca86`
- **Source**: https://commons.wikimedia.org/wiki/File:Doctor_looking_in_the_microscope.jpg
- **Original**: 7360 x 4912
- **Author**: Nenad Stojkovic
- **Licence**: CC BY 2.0 — https://creativecommons.org/licenses/by/2.0
- **Attribution required**: yes — shown on the page, top right of the photograph
- **Retrieved**: 2026-10-30

### optometry-ophthalmology

- **File**: `public/hero/departments/optometry-ophthalmology.jpg` (130 KB, 1200x900)
- **sha256**: `456fa9c2b9c19f8242695d60ec6679c5c4dec93252349c9813f6893eee124c82`
- **Source**: https://commons.wikimedia.org/wiki/File:Optometry_cares_for_Wyverns_in_the_blink_of_an_eye_(6980389).jpg
- **Original**: 7579 x 5414
- **Author**: U.S. Air Force photo by Senior Airman Brooke Keisler
- **Licence**: Public domain
- **Attribution required**: no (public domain)
- **Retrieved**: 2026-10-30

## What the page does

`src/lib/departmentHero.ts` holds the three maps (image, credit, alt text). The department page shows the credit on the photograph itself
(author and licence, linking to the Commons page) for every self-hosted image, whether or not the licence demands it.

`scripts/test-department-hero-images.ts` fails if two departments share one image, if a self-hosted file is missing from `public/`, is
absurdly small or heavy, has no credit or alt text, or if a CC BY licence is not marked as needing attribution.

## Rejected candidates

Kept here so the next person does not re-walk the same ground: a military dog X-ray and a mammography exam (Radiology — the first is not
clinical radiology, the second is a patient-private examination); a street EMS incident with bystanders and shop branding, a casualty with
simulated injuries, and a BLS workshop shot dominated by a hospital chain's branded backdrop (Paramedical). CC BY-SA images were skipped
throughout: cropping makes a derivative, and share-alike on a commercial platform is a licence question rather than a design one.
