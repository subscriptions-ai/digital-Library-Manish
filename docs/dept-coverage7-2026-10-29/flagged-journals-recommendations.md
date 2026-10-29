# The flagged existing journals: evidence, consistency check and recommendations

Prepared for a separate bounded decision. **Nothing was deleted, reclassified or edited, and no production audit row was changed.** Page-derived text from the discarded pages is not reproduced here; only what was retained or admissible is listed.

## 1. Identification

| Journal | Journal id | Department | Added in | Production audit row (action `JOURNAL_SOURCE_IMPORT`) |
|---|---|---|---|---|
| *Biomass Conversion and Biorefinery* (ISSN 2190-6815) | `0c974174-28fc-41f5-bfcb-1a57f3581126` | Bio Technology | `dept-coverage2-2026-10-29-a8f54e56`, canary | `22b7f9b7-0a4b-4843-9115-006fdec7ff3a` |
| *Journal of Signal Processing Systems* (ISSN 1939-8018) | `efe4fb5f-2062-4ea2-8652-5a5a756b5f83` | Electronics & Telecommunication | same run, second batch | `47684ea5-70bc-491d-a5aa-f71a2e9a7828` |
| *e+i Elektrotechnik und Informationstechnik* (ISSN 0932-383X) | `089ed5cc-8b68-4b3d-9489-522f04aae818` | Electrical Engineering | `dept-coverage4-2026-10-29-9a31ea75` | `5f76b9a5-948c-4734-ab7b-aadc146d7f35` |

(The fourth affected journal, *Cellular and Molecular Bioengineering*, `d3f9c8be-7b5a-4252-8c5f-50cd15bf1623`, is not flagged: title term *bioengineering* plus an NLM Catalog subject record plus direct Crossref deposits, all admissible.) Audit rows 22b7f9b7… and 47684ea5… also list other journals of those batches; only the four journals' entries carry the withdrawn text.

## 2. Original rationale and what remains admissible

| | Original kinds of evidence | Withdrawn | Remaining admissible evidence |
|---|---|---|---|
| *Biomass Conversion and Biorefinery* | title term *biorefinery*; OpenAlex topics "moderate" (biotechnology scope lexicon 32% of topic works; the Bio Technology subfield share is 3%); website scope (4 phrases) | the website kind | title term; OpenAlex topics (aggregator analysis of the journal's articles); Crossref deposits (current publication, direct); publisher from Crossref |
| *Journal of Signal Processing Systems* | title term *signal processing*; OpenAlex topics "moderate" (Electronics & Telecom 32%, lexicon 49%; **Computer / IT 63%**); a 2025/2026 issue seen on the journal site as publication corroboration | the corroboration (publication stands on Crossref alone) | title term; OpenAlex topics; Crossref deposits; NLM relation to the journal's earlier title (same journal) |
| *e+i Elektrotechnik und Informationstechnik* | title term *Elektrotechnik*; Springer Electronics industry-sector list; the site page showed no department phrase | none was relied on | title term; the publisher's sector list (a commercial grouping); Crossref deposits; OpenAlex topics do **not** support Electrical (3%) |

Independence: a title term, a publisher grouping list, an NLM record and article-topic analysis are different kinds. OpenAlex topics and OpenAlex/Crossref publication counts repeat upstream publisher metadata, so publication evidence counts once (Crossref direct) and topic evidence is one aggregator kind, not independent confirmation of the journal's scope statement.

## 3. Consistency with the established rules

The rule set changed between insertion and today, and the three journals fall on different sides:

| Rule version | What it required of the topics kind | *Biomass…* | *J. Signal Processing Systems* | *e+i…* |
|---|---|---|---|---|
| Round 2 (when two were added): two different kinds; topics count if the department's share is at least 25% in two topics **or** a scope lexicon reaches 25%; no lead requirement | moderate | meets | meets | n/a (round 4) |
| Round 4 (when *e+i* was added): a publisher sector list counts as one catalogue kind next to a title term | none | n/a | n/a | meets |
| Current title+topics rule (`titleTopicDepartment`): department share at least 25% in two topics **and** a 5-point lead over the next department | share + lead | **fails** (3%) | **fails** (32%, but Computer / IT leads) | **fails** (3%), though the route applied was title + catalogue, not title + topics |
| Current treatment of the sector list: not sufficient alone, one catalogue kind beside another | one kind | n/a | n/a | meets (title + one catalogue kind) |

**The apparent contradiction.** "Meets every criterion" and "the second evidence is weak" are both true. The first is a statement against the criteria in force on the insertion date, which counted *how many different kinds* agreed and had no strength gradient. The second is a strength judgement the criteria did not encode then; later rounds added the lead requirement and recognised the sector list as a weak kind. So the discrepancy is rule-version drift, not a mis-evaluation, and it is what a decision-maker must resolve explicitly: either apply today's stricter bar retroactively, or keep the rules as they stood when each journal was added.

**Comparators held under the same rules.** *Waste and Biomass Valorization* (a sector list plus topics) was held in round 4 on a scope judgement (waste and environmental engineering). *Science China Information Sciences* was held as broad information science. Judged by the same title-term-plus-topics logic, *Biomass Conversion and Biorefinery* is closer to the held biomass journal than to the clear cases, which is the inconsistency the decision should settle.

## 4. Recommendations (not executed)

| Journal | Recommendation | Reason |
|---|---|---|
| *Journal of Signal Processing Systems* | **Retain; mark for a scope check** | The title term is specific and the journal's identity and activity are firm; the topics split between computing and signal processing, which is what VLSI/signal-processing systems work looks like in OpenAlex. A person confirming the aims and scope would settle it; nothing contradicts the department. |
| *e+i Elektrotechnik und Informationstechnik* | **Retain; mark for a scope check** | The title names the department explicitly in German and nothing contradicts it; the weak points are the publisher grouping and the absence of topic support (OpenAlex files the journal's articles under education/civil topics, a data-quality signal). Springer's scope page is closed to automated reading, so a person or a librarian export is needed. |
| *Biomass Conversion and Biorefinery* | **Retain pending decision (the one with a real consistency question)** | Either treat it like the held *Waste and Biomass Valorization* (remediation: remove with the guarded statement below) or accept that *biorefinery* is within the department's bioprocess/biofuel vocabulary and keep it; this needs the decision-maker's call on the Biotechnology boundary (see the taxonomy proposal). |
| *Cellular and Molecular Bioengineering* | **Retain** | Meets the criteria on admissible evidence. |

**Bounded remediation options** for the decision-maker: (a) retain all and record the review; (b) remove selected journals using `DELETE FROM "Journal" j WHERE j.id = ANY(<ids>) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id) RETURNING j.id` (dependencies today: articles, ingestion runs and library events referencing these four are all 0; the guard is essential because `Article.journalId` is `ON DELETE SET NULL`); (c) correct the production audit rows' evidence for these four only after explicit authorisation. Removal is **not** recommended without a scope check, because it is irreversible for the public listing while the evidence gap is about strength, not contradiction.
