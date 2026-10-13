import { Children, Fragment, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from 'react';

/**
 * `<Helmet>`: the page's title, description, canonical, robots, social and structured-data tags, kept in <head>.
 *
 * The site used to use react-helmet-async, which on React 19 simply adds every tag it is given next to the others and never removes
 * the server's. A page with its own metadata plus the route's defaults therefore ended up with two descriptions and two canonicals,
 * and a page the server had already written metadata for would have had a third copy. This does what was always intended:
 *
 *  - every tag it manages is marked data-rh and is replaced as a set, so the server's tags are taken over, never doubled;
 *  - several <Helmet>s may be on screen (the route's defaults, then the page's own); for the same thing (the description, the
 *    canonical, the title...) the one mounted last wins, so a page overrides the route's defaults;
 *  - when a page goes away its tags go with it and the defaults show again.
 *
 * It accepts the same children the old component did: <title>, <meta>, <link>, <script>.
 */
type Tag = { tag: 'meta' | 'link' | 'script'; attrs: Record<string, string>; text?: string; key: string } | { tag: 'title'; text: string; key: 'title'; attrs: {} };

const ATTR: Record<string, string> = { httpEquiv: 'http-equiv', hrefLang: 'hreflang', crossOrigin: 'crossorigin', charSet: 'charset', fetchPriority: 'fetchpriority' };
const asText = (c: ReactNode): string => Children.toArray(c).filter(x => typeof x === 'string' || typeof x === 'number').join('');

function collect(children: ReactNode, out: Tag[] = []): Tag[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<any>;
    if (el.type === Fragment) { collect(el.props.children, out); return; }
    if (typeof el.type !== 'string') return;
    const { children: inner, ...props } = el.props as Record<string, any>;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false && typeof v !== 'object' && typeof v !== 'function') attrs[ATTR[k] || k] = v === true ? '' : String(v);
    const n = out.length;
    if (el.type === 'title') out.push({ tag: 'title', text: asText(inner), key: 'title', attrs: {} });
    else if (el.type === 'meta') {
      const key = attrs.name ? `meta:name:${attrs.name}` : attrs.property ? `meta:property:${attrs.property}` : attrs['http-equiv'] ? `meta:http:${attrs['http-equiv']}` : `meta:other:${n}:${JSON.stringify(attrs)}`;
      out.push({ tag: 'meta', attrs, key });
    } else if (el.type === 'link') out.push({ tag: 'link', attrs, key: attrs.rel === 'canonical' ? 'link:canonical' : `link:${attrs.rel}:${attrs.href}` });
    else if (el.type === 'script') out.push({ tag: 'script', attrs, text: asText(inner), key: `script:${n}:${attrs.type || ''}:${asText(inner).length}` });
  });
  return out;
}

const entries = new Map<number, Tag[]>();
let nextId = 1;
let queued = false;

function apply() {
  queued = false;
  if (typeof document === 'undefined') return;
  const merged = new Map<string, Tag>();
  for (const tags of entries.values()) for (const t of tags) merged.set(t.key, t);
  const title = merged.get('title');
  if (title && title.tag === 'title' && title.text) document.title = title.text;
  document.head.querySelectorAll('[data-rh]').forEach(e => e.remove());
  for (const t of merged.values()) {
    if (t.tag === 'title') continue;
    const el = document.createElement(t.tag);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    if (t.tag === 'script' && t.text) el.textContent = t.text;
    el.setAttribute('data-rh', 'true');
    document.head.appendChild(el);
  }
}
const schedule = () => { if (!queued) { queued = true; queueMicrotask(apply); } };

export function Helmet({ children }: { children?: ReactNode }) {
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  const tags = collect(children);
  const signature = JSON.stringify(tags);
  // Mounting takes a place in the order; unmounting gives it up. Updating never moves it, so a route's defaults stay beneath its page.
  useEffect(() => { const mine = id.current; entries.set(mine, []); return () => { entries.delete(mine); schedule(); }; }, []);
  useEffect(() => { entries.set(id.current, tags); schedule(); }, [signature]);
  return null;
}

/** Kept so the app's provider wrapper keeps working; this implementation needs no context. */
export const HelmetProvider = ({ children }: { children?: ReactNode }) => <>{children}</>;
