/**
 * What a book's record page may offer, decided from what the record actually says (never from where the book was listed).
 *   read       authorised full text is held here (accessStatus ViewableHere) and the viewer can open it
 *   source     the record's address leads to the book itself at its source (LinkOnly: a declared licence and a book address), or a viewable book whose reader cannot open it
 *   catalogue  a metadata-only entry: the address is the catalogue record it was listed from (for example the NLM Catalog), not a copy of the book, so it is never presented as access
 *   none       no file and no address
 */
export type BookOpenMode = 'read' | 'source' | 'catalogue' | 'none';
export function bookOpenMode(b: { accessStatus?: string | null; originalUrl?: string | null }, canRead: boolean): BookOpenMode {
  if (b.accessStatus === 'ViewableHere' && canRead) return 'read';
  if (b.originalUrl && (b.accessStatus === 'LinkOnly' || b.accessStatus === 'ViewableHere')) return 'source';
  if (b.originalUrl) return 'catalogue';
  return 'none';
}
