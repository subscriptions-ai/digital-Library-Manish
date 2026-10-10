/**
 * A reader for OAI-PMH pages in the `xoai` format that DOAB and OAPEN (both DSpace) serve.
 *
 * xoai is chosen over oai_dc because it carries what Dublin Core drops: the DOI, the ISBN, the
 * publisher, the BIC subject codes, the cover and — decisively — a licence per title on the
 * bitstream, which is better evidence than the publisher-wide sentence the REST API gave us.
 *
 * The format is regular enough (nested <element name=…> ending in <field name="value">) that a
 * small tree reader is all it needs, and it adds no dependency.
 */

export type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; fields: { name: string; value: string }[] };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENT[e.toLowerCase()] ?? m;
});

function attrsOf(s: string) {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

/** Parse into a tree. Tolerant: unknown tags are nodes, text outside <field> is ignored. */
export function parseTree(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], fields: [] };
  const stack: XNode[] = [root];
  let field: { name: string; value: string } | null = null;
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) { if (field) field.value += m[1]; continue; }
    if (m[6] !== undefined) { if (field) field.value += decode(m[6]); continue; }
    if (m[3] === undefined) continue;
    const closing = m[2] === '/', selfClose = m[5] === '/', tag = m[3];
    if (tag === 'field') {
      if (closing) { if (field) { stack[stack.length - 1].fields.push(field); field = null; } continue; }
      const f = { name: attrsOf(m[4]).name || '', value: '' };
      if (selfClose) stack[stack.length - 1].fields.push(f); else field = f;
      continue;
    }
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const node: XNode = { name: tag, attrs: attrsOf(m[4]), children: [], fields: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

export const find = (n: XNode, name: string): XNode | undefined => {
  if (n.name === name) return n;
  for (const c of n.children) { const r = find(c, name); if (r) return r; }
  return undefined;
};
export const findAll = (n: XNode, name: string, out: XNode[] = []): XNode[] => {
  if (n.name === name) out.push(n);
  for (const c of n.children) findAll(c, name, out);
  return out;
};

/** <element name="bundle"> — xoai names its structure in an attribute, not in the tag. */
const findAllNamed = (n: XNode, name: string, out: XNode[] = []): XNode[] => {
  if (n.name === 'element' && n.attrs.name === name) out.push(n);
  for (const c of n.children) findAllNamed(c, name, out);
  return out;
};

export type OaiBitstream = {
  bundle: string; name: string; format: string; url: string;
  rights: string | null; rightsUri: string | null; downloadUrl: string | null;
};

export type OaiRecord = {
  identifier: string;
  /** The Handle, "20.500.12854/182316" — the provider's own id for the title. */
  handle: string | null;
  datestamp: string | null;
  deleted: boolean;
  /** Dotted metadata path → values, in order: "dc.title", "dc.contributor.editor", "oapen.identifier.doi"… */
  meta: Map<string, string[]>;
  bitstreams: OaiBitstream[];
  publisherName: string | null;
};

export type OaiPage = {
  records: OaiRecord[];
  resumptionToken: string | null;
  completeListSize: number | null;
  /** An OAI-PMH error code, e.g. badResumptionToken, noRecordsMatch. */
  error: { code: string; message: string } | null;
};

/** Walk <element name=a><element name=b><element name=en_US><field value> into "a.b" (language level dropped). */
function flattenMeta(node: XNode, path: string[], into: Map<string, string[]>) {
  for (const f of node.fields) {
    if (f.name !== 'value' || !f.value.trim()) continue;
    const key = path.slice(0, -1).join('.');          // the last level is the language, not part of the name
    if (!key) continue;
    const list = into.get(key) || [];
    list.push(f.value.trim());
    into.set(key, list);
  }
  for (const c of node.children) if (c.name === 'element') flattenMeta(c, [...path, c.attrs.name || ''], into);
}

export function parseOaiPage(xml: string): OaiPage {
  const tree = parseTree(xml);
  const err = find(tree, 'error');
  const out: OaiPage = {
    records: [],
    resumptionToken: null,
    completeListSize: null,
    error: err ? { code: err.attrs.code || 'error', message: '' } : null,
  };
  // The resumptionToken's text is not inside a <field>, so read it straight from the markup.
  const rtm = /<resumptionToken([^>]*?)(?:\/>|>([^<]*)<\/resumptionToken>)/.exec(xml);
  if (rtm) {
    const token = decode((rtm[2] || '').trim());
    out.resumptionToken = token || null;
    const size = Number(attrsOf(rtm[1]).completeListSize);
    out.completeListSize = Number.isFinite(size) && size > 0 ? size : null;
  }
  const em = /<error[^>]*>([^<]*)<\/error>/.exec(xml);
  if (out.error && em) out.error.message = decode(em[1]);

  for (const rec of findAll(tree, 'record')) {
    const header = find(rec, 'header');
    out.records.push({ identifier: '', handle: null, datestamp: null, deleted: header?.attrs.status === 'deleted', meta: new Map(), bitstreams: [], publisherName: null });
  }
  // Header values are plain elements, so read them from the markup record by record.
  const raw = xml.split('<record>').slice(1);
  raw.forEach((chunk, i) => {
    const r = out.records[i];
    if (!r) return;
    r.identifier = decode(/<identifier>([^<]*)<\/identifier>/.exec(chunk)?.[1] || '');
    r.datestamp = /<datestamp>([^<]*)<\/datestamp>/.exec(chunk)?.[1] || null;
    r.handle = /oai:[^:]+:([0-9.]+\/[0-9]+)/.exec(r.identifier)?.[1] || null;
  });

  const recNodes = findAll(tree, 'record');
  recNodes.forEach((rec, i) => {
    const r = out.records[i];
    const md = findAll(rec, 'metadata').pop();            // the inner xoai <metadata>
    if (!md) return;
    for (const top of md.children) {
      if (top.name !== 'element') continue;
      const nm = top.attrs.name;
      if (nm === 'dc' || nm === 'oapen' || nm === 'publisher' || nm === 'dcterms' || nm === 'relation') {
        flattenMeta(top, [nm], r.meta);
      } else if (nm === 'bundles') {
        for (const b of findAllNamed(top, 'bundle')) {
          const bundle = b.fields.find(f => f.name === 'name')?.value || '';
          for (const bs of findAllNamed(b, 'bitstream')) {
            const g = (n: string) => bs.fields.find(f => f.name === n)?.value || null;
            r.bitstreams.push({
              bundle, name: g('name') || '', format: g('format') || '', url: g('url') || '',
              rights: g('rights'), rightsUri: g('rightsuri'), downloadUrl: g('oapenidentifierdownloadUrl'),
            });
          }
        }
      } else if (nm === 'linkedItemsMetadata') {
        r.publisherName = findAll(top, 'element').find(e => e.attrs.name === 'publisher.name')?.fields.find(f => f.name === 'value')?.value || null;
      }
    }
    // Some records put the publisher under metadata directly.
    if (!r.publisherName) r.publisherName = r.meta.get('publisher.name')?.[0] ?? r.meta.get('oapen.imprint')?.[0] ?? null;
  });
  return out;
}
