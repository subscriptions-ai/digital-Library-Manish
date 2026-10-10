/**
 * Read a licence out of a publisher's sentence about its licensing.
 *
 * DOAJ declares a licence per journal with an explicit non-commercial flag.
 * DOAB declares nothing of the kind. What it carries is `publisher.oalicense`,
 * free prose written by the publisher about its books in general — "Springer
 * Nature books are published under the Creative Commons…" — and it is present on
 * fewer than half the records. Publishers spell it three ways: a licence URL, a
 * code such as CC BY-NC-ND, or the words written out in full.
 *
 * A blanket sentence about a publisher's catalogue is weaker evidence than a
 * per-title declaration, so what this returns is recorded under its own rights
 * basis and is never on its own grounds to host anything.
 */
export function licenceFromProse(raw?: string | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;

  const url = t.match(/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z0-9-]+)/i);
  if (url) {
    const code = url[1].toLowerCase();
    return code === 'zero' || code === 'mark' ? 'CC0' : `CC ${code.toUpperCase()}`;
  }
  if (/\bCC[\s-]?0\b/i.test(t)) return 'CC0';

  const code = t.match(/\bCC[\s-]?(BY(?:[\s-]?(?:NC|ND|SA))*)\b/i);
  if (code) return `CC ${code[1].replace(/[\s-]+/g, '-').toUpperCase()}`;

  if (/creative commons/i.test(t) && /attribution/i.test(t)) {
    const parts = ['BY'];
    if (/non[\s-]?commercial/i.test(t)) parts.push('NC');
    if (/no[\s-]?deriv/i.test(t)) parts.push('ND');
    if (/share[\s-]?alike/i.test(t)) parts.push('SA');
    return `CC ${parts.join('-')}`;
  }
  return null;
}
