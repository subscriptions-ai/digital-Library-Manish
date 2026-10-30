/**
 * The photograph at the top of a department page, and where it came from.
 *
 * Every department needs its OWN picture. The four departments added on 2026-10-30 were all pointed at the Medical Sciences
 * photograph, so four different pages showed one image; scripts/test-department-hero-images.ts now fails if two share one.
 *
 * The files under /hero/departments are served by us (public/hero/departments). They are Wikimedia Commons photographs under
 * licences that permit this use; `attributionRequired` is true only where the licence asks for it (CC BY), and the page credits
 * every one of them either way. Full provenance — source, author, licence, retrieval date, checksum — is in
 * docs/department-hero-images-2026-10-30.md. The remaining departments use photographs hosted by Unsplash.
 */
export const HERO_IMAGES: Record<string, string> = {
  "electrical-engineering":    "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=900&q=80",
  "computer-it":               "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&q=80",
  "medical-sciences":          "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=900&q=80",
  "management":                "https://images.unsplash.com/photo-1552664730-d307ca884978?w=900&q=80",
  "chemistry":                 "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&q=80",
  "mechanical-engineering":    "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=900&q=80",
  "pharmacy":                  "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=900&q=80",
  "civil-construction":        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&q=80",
  "nano-technology":           "https://images.unsplash.com/photo-1628595351029-c2bf17511435?w=900&q=80",
  "bio-technology":            "https://images.unsplash.com/photo-1576086213369-97a306d36557?w=900&q=80",
  "energy":                    "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=900&q=80",
  "life-sciences":             "https://images.unsplash.com/photo-1518152006812-edab29b069ac?w=900&q=80",
  "law":                       "https://images.unsplash.com/photo-1505664194779-8beaceb93744?w=900&q=80",
  "agriculture":               "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=900&q=80",
  "nursing":                   "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=900&q=80",
  "education-social-sciences": "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900&q=80",
  "applied-sciences":          "https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=900&q=80",
  "multidisciplinary":         "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=900&q=80",
  "electronics-telecommunication": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80",
  "chemical-engineering":      "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=900&q=80",
  "ayurveda":                  "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&q=80",
  "architecture":              "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=900&q=80",
  "material-science":          "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=900&q=80",
  "applied-mechanics":         "https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=900&q=80",
  "dental":                    "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=900&q=80",
  "physiotherapy":             "https://images.unsplash.com/photo-1576678927484-cc907957088c?w=900&q=80",
  "paramedical-sciences":          "/hero/departments/paramedical-sciences.jpg",
  "radiology":                     "/hero/departments/radiology.jpg",
  "medical-laboratory-technology": "/hero/departments/medical-laboratory-technology.jpg",
  "optometry-ophthalmology":       "/hero/departments/optometry-ophthalmology.jpg",
  "commerce":                  "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=900&q=80",
  "arts":                      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=900&q=80",
  "science":                   "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&q=80",
};

/**
 * Where each self-hosted department photograph came from, so the page can credit it and a reader can check it.
 * Every file in /hero/departments is a Wikimedia Commons photograph under a licence that permits this use; `attributionRequired`
 * is true only where the licence asks for it (CC BY). Full provenance, including the retrieval date and each file's checksum,
 * is in docs/department-hero-images-2026-10-30.md.
 */
export type HeroCredit = { author: string; licence: string; licenceUrl: string; source: string; attributionRequired: boolean };
export const HERO_CREDITS: Record<string, HeroCredit> = {
  "paramedical-sciences": { author: "U.S. Army photo by Staff Sgt. Catessa Palone", licence: "Public domain", licenceUrl: "", source: "https://commons.wikimedia.org/wiki/File%3AUS_teach_basic_life_support_to_Ghana_EMT_trainees_during_AL26_%289666427%29.jpg", attributionRequired: false },
  "radiology": { author: "S\u00e9rgio Valle Duarte", licence: "CC BY 3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0", source: "https://commons.wikimedia.org/wiki/File%3ACT_Scan_Liver-Kidneys.jpg", attributionRequired: true },
  "medical-laboratory-technology": { author: "Nenad Stojkovic", licence: "CC BY 2.0", licenceUrl: "https://creativecommons.org/licenses/by/2.0", source: "https://commons.wikimedia.org/wiki/File%3ADoctor_looking_in_the_microscope.jpg", attributionRequired: true },
  "optometry-ophthalmology": { author: "U.S. Air Force photo by Senior Airman Brooke Keisler", licence: "Public domain", licenceUrl: "", source: "https://commons.wikimedia.org/wiki/File%3AOptometry_cares_for_Wyverns_in_the_blink_of_an_eye_%286980389%29.jpg", attributionRequired: false },
};

/** What each self-hosted department photograph shows, for readers who cannot see it. */
export const HERO_ALT: Record<string, string> = {
  "paramedical-sciences": "Basic life support training for emergency medical technician trainees",
  "radiology": "Computed tomography image series",
  "medical-laboratory-technology": "Clinical laboratory microscopy and specimen tubes",
  "optometry-ophthalmology": "Slit-lamp eye examination",
};
