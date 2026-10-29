# Multilingual title vocabulary: what was added, what was rejected, and why

Method: every proposed term was run against the titles of the whole candidate pool (91,626 distinct journals, all statuses) and the matches were read. No automatic translation was used as evidence; a term enters the vocabulary only when the matched titles are journals of that field. A title term is still only ONE kind of evidence: placement needs a second, independent kind (topics, society list, catalogue subject, or the journal's own scope).

| Term (language) | Matches in the pool | Verdict |
|---|---|---|
| `listrik` (Indonesian, "electricity") | 9 titles, all electrical-engineering journals (*Jurnal Litek … Listrik Telekomunikasi Elektronika*, *JITEL … Listrik Tenaga*, …) | **added** (Electrical); a title naming other departments too (*Teknik Mesin, Listrik dan Sipil*) is not placed |
| `elektrotechniek`, `elektrotechnika`, `elettrotecnica`, `électrotechnique` (Dutch, Czech/Polish, Italian, French) | 4 titles (e.g. *Revue Roumaine … Série Électrotechnique*) | **added** (Electrical) |
| `elettronica`, `électronique` (Italian, French) with `elektronika` (Polish, Lithuanian, Indonesian) | 31 titles, electronics journals | **added / kept** (Electronics & Telecom) |
| `teknik elektronik`, `kejuruteraan elektronik` (Indonesian, Malay: electronic engineering) | specific forms only | **added** |
| `bioteknoloji`, `biyoteknoloji`, `biotechnologia` (Turkish, Polish) | 17 titles (*Acta Scientiarum Polonorum. Biotechnologia*, …) | **added** (Bio Technology) |
| bare `elektronik` (Turkish, Malay, German) | 13 titles, mostly **online** journals (*Elektronik Dergisi*, *Jurnal Elektronik Ilmu Komputer*, *Jurnal Elektronik Mahasiswa*) | **removed** (it was in the previous round's list); no inserted journal relied on it |
| bare `electrónica`, `eletrônica` (Spanish, Portuguese) | 130 titles, almost all **e-journals** (*Revista Electrónica de Geografía*, *Revista Eletrônica de História Social*) | **rejected**; only *ingeniería/engenharia electrónica/eletrônica* (engineering) counts |
| `điện tử` (Vietnamese) | 6 titles, all "online journal" (*Tạp chí điện tử …*) | **rejected**; no safe Vietnamese term found |
| `kejuruteraan elektrik`, `teknik elektrik`, `kỹ thuật điện`, `elektrik mühendisliği`, `inżynieria elektryczna` | 0–1 titles | not added (no verified matches to review) |

Tests (`test-title-topic-department.ts`, 22 cases) pin both sides: the added terms name the department, and the false-positive titles above do not; word boundaries (*Elektrokardiographie*, *Elektronische Bibliothek*) and multi-department titles are covered. All 66 inserted journals that relied on a title term still match the tightened vocabulary.
