# Bioinformatics titles: sample against the existing definitions (decision pending; all 54 stay held)

54 candidate journals carry *bioinformatics* or *biostatistics* in the title. They are **held, not classified**: no Bio Technology or Computer / IT assignment was made and no existing journal was touched.

## What the existing definitions say

| Definition | Source in the code | Bioinformatics |
|---|---|---|
| Bio Technology (books) | `books/classifier.ts` keyword list: *biotechnology, genetic engineering, bioprocess, **bioinformatics**, synthetic biology, CRISPR, bioengineering* | **named** |
| Bio Technology (journals) | DOAJ import title rule and the title-mapping audit: *biotechnolog\** only | **not named** |
| Computer / IT (books) | `books/classifier.ts`: computer science, computing, software, algorithms, machine learning, AI, data science, databases, cybersecurity, IT, operating systems, networks, IoT, blockchain, HCI | **not named** |
| What OpenAlex says the articles are about | topic shares per journal (below) | mostly **Life Sciences** |

So the books and journal definitions of Bio Technology disagree, and Computer / IT does not claim bioinformatics either. Among the 54, the department with the largest OpenAlex topic share is Life Sciences for 40, Medical Sciences for 6, Computer / IT for 4 and none or other for 4.

## Representative sample (OpenAlex topic share of each journal's works)

| Journal | Publisher | Computer / IT | Bio Technology (subfield table) | Life Sciences | Biotech scope lexicon | Works |
|---|---|---|---|---|---|---|
| Proteins: Structure, Function and Bioinformatics | Wiley | 6% | 0% | 63% | 2% | 20,682 |
| Journal of Bioinformatics and Computational Biology | Imperial College Press | 9% | 0% | 85% | 4% | 2,862 |
| Current Bioinformatics | Bentham Science | 10% | 0% | 84% | 1% | 2,718 |
| EURASIP Journal on Bioinformatics and Systems Biology | Springer | 7% | 0% | 82% | 6% | 456 |
| Advances in Bioinformatics | Hindawi | 9% | 0% | 82% | 4% | 353 |
| Applied Bioinformatics | Springer | 2% | 0% | 86% | 1% | 243 |
| IPSJ Transactions on Bioinformatics | Information Processing Society of Japan | 18% | 0% | 72% | 5% | 198 |
| International Journal of Bioscience, Biochemistry and Bioinformatics | (none listed) | 11% | 4% | 43% | 9% | 373 |
| CiiT International Journal of Biometrics and Bioinformatics | (none listed) | 57% | 0% | 5% | 0% | 575 |
| MOJ Proteomics & Bioinformatics | MedCrave | 8% | 2% | 58% | 7% | 302 |

## Reading of the sample

The journals' own article topics are computational biology and genomics, filed under Life Sciences, not under biotechnology subfields (industrial biotechnology, bioprocessing, synthetic biology) and not under computing. Admitting them as Bio Technology would follow the books definition but would add journals whose scope is general computational biology, which the rules forbid broadening to ("general biology"); admitting them as Computer / IT has no support in either definition. They stay held.

## Decision needed

(1) Keep held (default; recommended until the definitions agree); (2) treat *bioinformatics* as Bio Technology for journals, as the books classifier does, and require two kinds of evidence plus an explicit biotechnology scope statement; (3) leave them to the Life Sciences department. The pipeline needs no change for (1); for (2) one title term and a test would be added.
