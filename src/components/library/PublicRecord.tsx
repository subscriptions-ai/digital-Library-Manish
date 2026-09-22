import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, BookOpen, Building2, Calendar, FileText, Hash, Layers } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * One article, or one book, on a page of its own.
 *
 * Until now nothing in the library could be linked to from outside it: an
 * article lived behind the reader and a book had no page at all, so every link
 * anywhere on the public side had to point at the browse screen. Clicking three
 * different things and landing on the same list is the fault this fixes.
 *
 * What a stranger gets here is the record — title, authors, where it was
 * published, what it is about — and one way in. A member goes straight to the
 * reader; anybody else is asked to register, which is free, rather than being
 * shown a login they did not ask for.
 */

const LABEL = 'font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint';
const n = (x?: number | null) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '');

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</div>;
}

function Missing({ what }: { what: string }) {
  return (
    <Shell>
      <h1 className="font-serif text-[26px] text-ink">That {what} is not here</h1>
      <p className="mt-2 text-[14.5px] text-muted">
        It may have been withdrawn, or the link may be wrong.
      </p>
      <Link to="/digital-library" className="mt-5 inline-block text-[14px] font-semibold text-accent hover:underline">
        Browse the library
      </Link>
    </Shell>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!shown.length) return null;
  return (
    <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k} className="bg-surface px-5 py-3.5">
          <dt className={LABEL}>{k}</dt>
          <dd className="mt-1 text-[14px] leading-snug text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The one thing to do with a record: open it, or join so you can. */
function OpenIt({ to, label }: { to: string; label: string }) {
  const { profile } = useAuth();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-surface p-5">
      {profile ? (
        <Link to={to} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover">
          {label} <ArrowRight size={16} />
        </Link>
      ) : (
        <>
          <Link to="/signup?ref=record" className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-[14px] font-semibold text-surface hover:opacity-90">
            Register free to read it <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="text-[13.5px] font-semibold text-accent hover:underline">Already a member? Sign in</Link>
        </>
      )}
    </div>
  );
}

export function ArticleRecord() {
  const { id = '' } = useParams();
  const [item, setItem] = useState<any>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch(`/api/library/article/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => (d?.id ? setItem(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <Missing what="article" />;
  if (!item) return <Shell><div className="h-72 animate-pulse rounded-2xl bg-surface-2" /></Shell>;

  const where = [item.journalName, item.volume && `Volume ${item.volume}`, item.issue && `Issue ${item.issue}`]
    .filter(Boolean).join(' · ');

  return (
    <Shell>
      <Helmet>
        <title>{`${item.title} — STM Digital Library`}</title>
        {item.abstract && <meta name="description" content={String(item.abstract).slice(0, 300)} />}
      </Helmet>

      <Link to="/digital-library?kind=articles" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft size={15} /> All articles
      </Link>

      <p className={`${LABEL} mt-7`}>
        <FileText size={12} className="mr-1.5 inline" />Research article{item.domain ? ` · ${item.domain}` : ''}
      </p>
      <h1 className="mt-3 font-serif text-[30px] font-medium leading-snug text-ink sm:text-[34px]">{item.title}</h1>
      {item.authors && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{item.authors}</p>}
      {where && <p className="mt-1.5 font-mono text-[12px] text-faint">{where}</p>}

      {item.abstract && (
        <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-muted">{item.abstract}</p>
      )}

      <OpenIt to={`/library/article/${item.id}`} label="Read it in the library" />

      <Facts rows={[
        ['Journal', item.journalName],
        ['Published', item.year],
        ['Volume / issue', [item.volume, item.issue].filter(Boolean).join(' / ')],
        ['Pages', item.pages],
        ['Department', item.domain],
        ['Subject', item.subject],
        ['DOI', item.doi ? <span className="font-mono text-[12.5px]">{item.doi}</span> : null],
        ['Language', item.language],
      ]} />

      <div className="mt-8 flex flex-wrap gap-3">
        {item.domain && (
          <Link to={`/domain/${String(item.domain).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
            className="inline-flex items-center gap-2 rounded-xl border border-rule px-4 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface-2">
            <Layers size={15} /> More in {item.domain}
          </Link>
        )}
        {item.journalId && (
          <Link to={`/journal/${item.journalId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-rule px-4 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface-2">
            <BookOpen size={15} /> The journal
          </Link>
        )}
      </div>
    </Shell>
  );
}

export function BookRecord() {
  const { id = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch(`/api/library/book/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => (d?.book ? setData(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) return <Missing what="book" />;
  if (!data) return <Shell><div className="h-72 animate-pulse rounded-2xl bg-surface-2" /></Shell>;

  const b = data.book;
  const alongside: any[] = data.alongside || [];

  return (
    <Shell>
      <Helmet>
        <title>{`${b.title} — STM Digital Library`}</title>
        {b.description && <meta name="description" content={String(b.description).slice(0, 300)} />}
      </Helmet>

      <Link to="/digital-library?kind=books" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft size={15} /> All books
      </Link>

      <div className="mt-7 flex flex-col gap-6 sm:flex-row">
        <div className="h-60 w-40 shrink-0 overflow-hidden rounded-2xl border border-rule bg-accent-soft">
          {/* Through our own cache, which keeps a copy and refuses the heavy ones. */}
          <img src={`/api/library/cover/${b.id}`} alt="" loading="lazy"
            className="h-full w-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="min-w-0">
          <p className={LABEL}>
            <BookOpen size={12} className="mr-1.5 inline" />Book{b.domain ? ` · ${b.domain}` : ''}
          </p>
          <h1 className="mt-3 font-serif text-[28px] font-medium leading-snug text-ink sm:text-[32px]">{b.title}</h1>
          {b.authors && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{b.authors}</p>}
          <p className="mt-1.5 font-mono text-[12px] text-faint">
            {[b.publisherName, b.year].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {b.description && (
        <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-muted">{b.description}</p>
      )}

      <OpenIt to={`/library/book/${b.id}`} label="Open it in the library" />

      <Facts rows={[
        ['Publisher', b.publisherName],
        ['Published', b.year],
        ['Edition', b.edition],
        ['Pages', b.pages],
        ['Chapters', b.chapterCount || null],
        ['Department', b.domain],
        ['Subject', b.subject],
        ['ISBN', b.isbn ? <span className="font-mono text-[12.5px]">{b.isbn}</span> : null],
        ['DOI', b.doi ? <span className="font-mono text-[12.5px]">{b.doi}</span> : null],
        ['Language', b.language],
      ]} />

      {alongside.length > 0 && (
        <section className="mt-10">
          <p className={LABEL}>On the same shelf</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {alongside.map(x => (
              <Link key={x.id} to={`/book/${x.id}`}
                className="group flex gap-3 rounded-2xl border border-rule bg-surface p-4 hover:shadow-md">
                <span className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                  <img src={`/api/library/cover/${x.id}`} alt="" loading="lazy"
                    className="h-full w-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13.5px] leading-snug text-ink-2 group-hover:text-accent">{x.title}</span>
                  <span className="mt-1 block truncate font-mono text-[10.5px] text-faint">
                    {[x.authors, x.year].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {b.domain && (
          <Link to={`/domain/${String(b.domain).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
            className="inline-flex items-center gap-2 rounded-xl border border-rule px-4 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface-2">
            <Layers size={15} /> More in {b.domain}
          </Link>
        )}
        <Link to="/digital-library?kind=books"
          className="inline-flex items-center gap-2 rounded-xl border border-rule px-4 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface-2">
          <Building2 size={15} /> Every book
        </Link>
      </div>
    </Shell>
  );
}
