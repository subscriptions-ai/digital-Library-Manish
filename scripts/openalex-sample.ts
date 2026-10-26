/**
 * A small OpenAlex-format snapshot for tests: the official layout (data/jsonl/works/updated_date=YYYY-MM-DD/part_NNNN.gz + manifest.json) and the real field names, with a
 * deterministic shape so a test can predict every count. Never touches a network; writes only under the directory it is given.
 *
 * Work i (k = i % 10, journal = floor(i / 4) % n of the journals passed in):
 *   k 0  type "dataset"                         not relevant        k 5–9  a relevant, open-access journal article in one of OUR journals
 *   k 1  primary source is a repository          not relevant               i % 25 = 0  published 2015 (refused by the year policy)    i % 25 = 1  no year (waits for review)
 *   k 2  not open access                         not relevant               i % 4 = 0   no licence stated, otherwise "cc-by" ("cc-by-nc" when i % 30 = 15)
 *   k 3  retracted article in our journal        refused            k 4    article in a journal we do NOT hold   not relevant
 *   i % 7 = 0 offers a pdf_url (…/ok-i.pdf, or …/bad-i.pdf when i % 14 = 0).   volume "12" when i % 3 = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';

export type SampleJournal = { issn: string; title: string };
export type SampleOpts = { dir: string; total: number; files?: number; seed: string; journals: SampleJournal[]; foreignIssn: string; release?: string; padBytes?: number; noDoi?: boolean; extraLines?: (fileIndex: number) => string[] };

export const sampleDoi = (seed: string, i: number) => `10.8888/oa.${seed}.${i}`;
/** Work ids differ per seed (as real ids differ per work), so two samples never collide on sourceRecordId. */
const seedNum = (seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 900; return 100 + h; };
export const sampleId = (i: number, seed: string) => `https://openalex.org/W${seedNum(seed) * 1_000_000 + i}`;

export function sampleWork(i: number, o: Pick<SampleOpts, 'seed' | 'journals' | 'foreignIssn' | 'padBytes' | 'noDoi'>): any {
  const k = i % 10, j = o.journals[Math.floor(i / 4) % o.journals.length];
  const special = i % 25;
  const year = special === 0 && k >= 5 ? 2015 : special === 1 && k >= 5 ? null : 2021 + (i % 4);
  const lic = i % 30 === 15 ? 'cc-by-nc' : i % 4 === 0 ? null : 'cc-by';
  const pdf = i % 7 === 0 ? `https://files.example.org/${i % 14 === 0 ? 'bad' : 'ok'}-${i}.pdf` : null;
  const issn = k === 4 ? o.foreignIssn : j.issn;
  const src = { id: 'https://openalex.org/S1', display_name: k === 4 ? 'A journal we do not hold' : j.title, issn_l: issn, issn: [issn], type: k === 1 ? 'repository' : 'journal', host_organization_name: 'Sample Press' };
  const pad: Record<string, number[]> = {};
  for (let p = 0, bytes = 0; bytes < (o.padBytes ?? 0); p++) { const w = `word${p}x`; pad[w] = [p]; bytes += w.length + 8; }
  return {
    id: sampleId(i, o.seed), doi: o.noDoi ? null : `https://doi.org/${sampleDoi(o.seed, i)}`, title: `OpenAlex sample ${o.seed} ${i}`, display_name: `OpenAlex sample ${o.seed} ${i}`,
    publication_year: year, publication_date: year ? `${year}-0${1 + (i % 9)}-15` : null,
    type: k === 0 ? 'dataset' : 'article', is_retracted: k === 3, is_paratext: false, updated_date: '2026-03-01T00:00:00.000Z', created_date: '2026-01-01',
    open_access: { is_oa: k !== 2, oa_url: pdf }, biblio: { volume: i % 3 === 0 ? '12' : null, issue: '2' },
    authorships: [{ author: { display_name: `Author ${i}` } }, { author: { display_name: `Coauthor ${i}` } }],
    primary_topic: { display_name: 'Computing', field: { display_name: 'Computer Science' } },
    primary_location: { source: src, license: lic, pdf_url: pdf, is_oa: k !== 2 },
    best_oa_location: k === 2 ? null : { source: src, license: lic, pdf_url: pdf, is_oa: true },
    abstract_inverted_index: pad, ids: { openalex: sampleId(i, o.seed) },
  };
}

export async function makeSample(o: SampleOpts): Promise<{ files: { rel: string; lines: number; bytes: number }[]; lines: number }> {
  const works = path.join(o.dir, 'data', 'jsonl', 'works');
  fs.rmSync(o.dir, { recursive: true, force: true });
  const nFiles = o.files ?? 1, per = Math.ceil(o.total / nFiles), out: { rel: string; lines: number; bytes: number }[] = [];
  let i = 0;
  for (let f = 0; f < nFiles; f++) {
    const d = path.join(works, `updated_date=2026-03-0${f + 1}`); fs.mkdirSync(d, { recursive: true });
    const file = path.join(d, `part_0000.gz`);
    const gz = zlib.createGzip(); const ws = fs.createWriteStream(file); gz.pipe(ws);
    let lines = 0;
    for (const extra of o.extraLines?.(f) ?? []) { if (!gz.write(extra + '\n')) await once(gz, 'drain'); lines++; }
    for (; i < Math.min(o.total, (f + 1) * per); i++) { if (!gz.write(JSON.stringify(sampleWork(i, o)) + '\n')) await once(gz, 'drain'); lines++; }
    gz.end(); await once(ws, 'finish');
    out.push({ rel: `updated_date=2026-03-0${f + 1}/part_0000.gz`, lines, bytes: fs.statSync(file).size });
  }
  const manifest = { date: o.release ?? '2026-10-14', format: 'jsonl', entity: 'works', record_count: out.reduce((n, x) => n + x.lines, 0), content_length: out.reduce((n, x) => n + x.bytes, 0),
    files: out.map(x => ({ url: `s3://openalex/data/jsonl/works/${x.rel}`, meta: { content_length: x.bytes, record_count: x.lines } })) };
  fs.writeFileSync(path.join(works, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return { files: out, lines: manifest.record_count };
}
