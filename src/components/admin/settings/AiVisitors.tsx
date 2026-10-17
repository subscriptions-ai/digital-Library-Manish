import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Search, UserCheck, UserPlus, HelpCircle, CheckCircle2, FileText } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorState, MetricCard, SkeletonRows, type BadgeTone } from '../../ui';
import { ago } from '../ingestion/format';

/**
 * AI visitors — the people who filled in the assistant's pre-chat form — and their conversations. Every number here comes
 * from the server's stored rows; the page computes nothing. Contact details are CRM data and are shown to super admins only.
 */

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: auth(), cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error || 'Could not load');
  return body as T;
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const mobile = (p: string | null | undefined) => (p ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : null);

const QUOTE_TONE: Record<string, BadgeTone> = { 'Not requested': 'neutral', Requested: 'caution', Converted: 'success' };

// ── Overview cards ─────────────────────────────────────────────────────────

type Overview = {
  uniqueVisitors: number; newContacts: number; conversations: number; questionsAsked: number;
  successfulAnswers: number; failedAnswers: number; quoteRequests: number; totalVisitors: number;
};

export function AiOverviewCards() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try { setData(await getJson<Overview>('/api/admin/ai-assistant/overview')); setFailed(false); } catch { setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failed && !data) return <Card className="mt-4"><ErrorState title="The visitor figures could not be loaded" onRetry={load} /></Card>;
  const cards: [string, number | undefined, typeof UserCheck, string?][] = [
    ['Unique AI visitors', data?.uniqueVisitors, UserCheck, 'Active in the last 24 h'],
    ['New AI contacts', data?.newContacts, UserPlus, data ? `${data.totalVisitors} in total` : undefined],
    ['AI conversations', data?.conversations, MessageSquare, 'With a question in 24 h'],
    ['Questions asked', data?.questionsAsked, HelpCircle, 'Visitor questions, not provider calls'],
    ['Successful answers', data?.successfulAnswers, CheckCircle2, data && data.failedAnswers ? `${data.failedAnswers} unanswered` : 'None unanswered'],
    ['Quote requests', data?.quoteRequests, FileText, 'From the assistant'],
  ];
  return (
    <section className="mt-4" aria-label="AI visitors, last 24 hours">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Visitors · last 24 hours</h2>
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value, Icon, context]) => (
          <MetricCard key={label} label={label} value={value} icon={Icon} context={context} loading={!data} />
        ))}
      </div>
    </section>
  );
}

// ── Visitors table ─────────────────────────────────────────────────────────

type VisitorRow = {
  id: string; name: string; email: string | null; phone: string | null; userType: 'Logged-in' | 'Guest';
  questions: number; answers: number; failed: number; conversations: number; quoteStatus: string;
  firstSeenAt: string; lastActiveAt: string;
};
type Page<T> = { total: number; page: number; pageSize: number; rows: T[] };

const RANGES = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']] as const;

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return total ? <p className="mt-3 text-xs text-muted">{total} {total === 1 ? 'result' : 'results'}</p> : null;
  const from = (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>{from}–{to} of {total}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function AiVisitorsPanel() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<string>('all');
  const [type, setType] = useState('');
  const [quote, setQuote] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<VisitorRow> | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openVisitor, setOpenVisitor] = useState<string | null>(null);
  const [openConversation, setOpenConversation] = useState<string | null>(null);
  const seq = useRef(0);

  // Search waits for a pause in typing; every change of filter starts again at page 1.
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    const params = new URLSearchParams({ range, page: String(page), pageSize: '25' });
    if (query) params.set('q', query);
    if (type) params.set('type', type);
    if (quote) params.set('quote', quote);
    try {
      const body = await getJson<Page<VisitorRow>>(`/api/admin/ai-assistant/visitors?${params}`);
      if (mine === seq.current) { setData(body); setFailed(false); }
    } catch { if (mine === seq.current) setFailed(true); }
    finally { if (mine === seq.current) setLoading(false); }
  }, [query, range, type, quote, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="mt-4">
      <CardHeader
        title="AI visitors / leads"
        description="Everyone who filled in the assistant's details form. A visitor becomes a quote lead only when they send Get a quote."
        actions={<Button variant="ghost" size="sm" onClick={load}>Refresh</Button>}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block lg:w-72">
          <span className="sr-only">Search visitors</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="input pl-9" placeholder="Search name, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="Last active">
            {RANGES.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setPage(1); }}>{l}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="ai-visitor-type">User type</label>
          <select id="ai-visitor-type" className="input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All users</option>
            <option value="member">Logged-in</option>
            <option value="guest">Guest</option>
          </select>
          <label className="sr-only" htmlFor="ai-visitor-quote">Quote status</label>
          <select id="ai-visitor-quote" className="input w-auto" value={quote} onChange={(e) => { setQuote(e.target.value); setPage(1); }}>
            <option value="">Any quote status</option>
            <option value="yes">Quote requested</option>
            <option value="no">Not requested</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        {failed && !data ? <ErrorState title="AI visitors could not be loaded" onRetry={load} />
          : !data ? <SkeletonRows rows={6} />
          : data.rows.length === 0 ? (
            <EmptyState title={query || type || quote || range !== 'all' ? 'No visitors match these filters' : 'No AI visitors yet'}
              description="Visitors appear here once they fill in the assistant's details form." />
          ) : (
            <div className="table-wrap" aria-busy={loading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th><th scope="col">Contact</th><th scope="col">User type</th>
                    <th scope="col" className="text-right">Questions</th><th scope="col" className="text-right">Answers</th>
                    <th scope="col">Quote status</th><th scope="col">First seen</th><th scope="col">Last active</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(v => (
                    <tr key={v.id}>
                      <td className="font-semibold text-ink">{v.name}</td>
                      <td className="text-[13px]">
                        {v.email && <div className="break-all">{v.email}</div>}
                        {v.phone && <div className="whitespace-nowrap">{mobile(v.phone)}</div>}
                      </td>
                      <td><Badge tone={v.userType === 'Logged-in' ? 'accent' : 'neutral'}>{v.userType}</Badge></td>
                      <td className="text-right tabular-nums">{v.questions}</td>
                      <td className="text-right tabular-nums">{v.answers}{v.failed ? <span className="block text-[11px] text-muted">{v.failed} failed</span> : null}</td>
                      <td><Badge tone={QUOTE_TONE[v.quoteStatus] ?? 'neutral'}>{v.quoteStatus}</Badge></td>
                      <td className="whitespace-nowrap text-[13px]">{when(v.firstSeenAt)}</td>
                      <td className="whitespace-nowrap text-[13px]" title={when(v.lastActiveAt)}>{ago(v.lastActiveAt)}</td>
                      <td><Button variant="secondary" size="sm" onClick={() => setOpenVisitor(v.id)}>View<span className="sr-only"> {v.name}</span></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>

      <VisitorDialog id={openVisitor} onClose={() => setOpenVisitor(null)} onOpenConversation={setOpenConversation} />
      <ConversationDialog id={openConversation} onClose={() => setOpenConversation(null)} />
    </Card>
  );
}

// ── Visitor detail ─────────────────────────────────────────────────────────

type LeadRef = { id: string; name: string; status: string; source: string } | null;
type VisitorDetail = {
  id: string; name: string; email: string | null; phone: string | null; userType: string;
  user: { id: string; email: string; displayName: string | null; role: string } | null;
  firstSeenAt: string; lastActiveAt: string;
  totals: { conversations: number; questions: number; answers: number; failed: number };
  quoteStatus: string; quoteRequestedAt: string | null; lead: LeadRef; matchedLead: LeadRef;
  conversations: { id: string; startedAt: string; lastActivityAt: string; questionsAsked: number; successfulAnswers: number; failedAnswers: number; leadId: string | null }[];
};

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function VisitorDialog({ id, onClose, onOpenConversation }: { id: string | null; onClose: () => void; onOpenConversation: (id: string) => void }) {
  const [data, setData] = useState<VisitorDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    setData(null); setFailed(false);
    try { setData(await getJson<VisitorDetail>(`/api/admin/ai-assistant/visitors/${encodeURIComponent(id)}`)); } catch { setFailed(true); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const leadLabel = (l: LeadRef) => (l ? `${l.name} · ${l.status === 'All' ? 'New' : l.status} · ${l.source}` : '—');
  return (
    <Dialog open={!!id} onClose={onClose} side="right" size="lg" title={data?.name ?? 'AI visitor'} description="AI visitor details">
      {failed ? <ErrorState title="This visitor could not be loaded" onRetry={load} />
        : !data ? <SkeletonRows rows={6} />
        : (
          <div className="space-y-6">
            <Facts items={[
              ['Name', data.name],
              ['Email', data.email || '—'],
              ['Mobile', mobile(data.phone) || '—'],
              ['Logged-in user', data.user
                ? <Link to="/admin/users" className="font-semibold text-accent hover:underline">{data.user.displayName || data.user.email} · {data.user.role}</Link>
                : 'Guest'],
              ['First seen', when(data.firstSeenAt)],
              ['Last active', when(data.lastActiveAt)],
              ['Total conversations', data.totals.conversations],
              ['Questions asked', data.totals.questions],
              ['Successful answers', `${data.totals.answers}${data.totals.failed ? ` (${data.totals.failed} unanswered)` : ''}`],
              ['Quote requested', data.quoteRequestedAt ? `Yes · ${when(data.quoteRequestedAt)}` : 'No'],
              ['Quote / lead', data.lead
                ? <Link to="/admin/leads" className="font-semibold text-accent hover:underline">{leadLabel(data.lead)}</Link>
                : '—'],
              ['Existing CRM lead (same contact)', data.matchedLead && data.matchedLead.id !== data.lead?.id ? leadLabel(data.matchedLead) : '—'],
            ]} />

            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Recent conversations</h3>
              {data.conversations.length === 0 ? <p className="text-sm text-muted">No conversations yet.</p> : (
                <ul className="divide-y divide-rule rounded-xl border border-rule">
                  {data.conversations.map(c => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-ink">{when(c.startedAt)}</p>
                        <p className="text-xs text-muted">
                          {c.questionsAsked} {c.questionsAsked === 1 ? 'question' : 'questions'} · {c.successfulAnswers} answered
                          {c.failedAnswers ? ` · ${c.failedAnswers} unanswered` : ''} · last active {ago(c.lastActivityAt)}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => onOpenConversation(c.id)}>Open</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
    </Dialog>
  );
}

// ── Conversations ──────────────────────────────────────────────────────────

type ConversationRow = {
  id: string; startedAt: string; lastActivityAt: string; questionsAsked: number; successfulAnswers: number; failedAnswers: number;
  leadId: string | null; visitor: { id: string; name: string; userId: string | null } | null;
};

export function AiConversationsPanel() {
  const [range, setRange] = useState<string>('7d');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ConversationRow> | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await getJson<Page<ConversationRow>>(`/api/admin/ai-assistant/conversations?range=${range}&page=${page}&pageSize=25`)); setFailed(false); }
    catch { setFailed(true); }
  }, [range, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="mt-4">
      <CardHeader title="Conversations" description="One per visitor session, newest activity first." actions={<Button variant="ghost" size="sm" onClick={load}>Refresh</Button>} />
      <div className="segmented" role="group" aria-label="Last active">
        {RANGES.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); setPage(1); }}>{l}</button>
        ))}
      </div>
      <div className="mt-4">
        {failed && !data ? <ErrorState title="Conversations could not be loaded" onRetry={load} />
          : !data ? <SkeletonRows rows={6} />
          : data.rows.length === 0 ? <EmptyState title="No conversations in this period" />
          : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Visitor</th><th scope="col">Started</th><th scope="col">Last active</th>
                    <th scope="col" className="text-right">Questions</th><th scope="col" className="text-right">Answers</th>
                    <th scope="col" className="text-right">Unanswered</th><th scope="col">Quote</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(c => (
                    <tr key={c.id}>
                      <td className="font-semibold text-ink">
                        {c.visitor?.name ?? <span className="font-normal text-muted">No details (before the form)</span>}
                        {c.visitor?.userId && <Badge tone="accent" className="ml-2">Logged-in</Badge>}
                      </td>
                      <td className="whitespace-nowrap text-[13px]">{when(c.startedAt)}</td>
                      <td className="whitespace-nowrap text-[13px]" title={when(c.lastActivityAt)}>{ago(c.lastActivityAt)}</td>
                      <td className="text-right tabular-nums">{c.questionsAsked}</td>
                      <td className="text-right tabular-nums">{c.successfulAnswers}</td>
                      <td className="text-right tabular-nums">{c.failedAnswers}</td>
                      <td>{c.leadId ? <Badge tone="caution">Requested</Badge> : <span className="text-muted">—</span>}</td>
                      <td><Button variant="secondary" size="sm" onClick={() => setOpen(c.id)}>Open</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </div>
      <ConversationDialog id={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

// ── Conversation detail ────────────────────────────────────────────────────

type Message = { id: string; role: string; content: string; provider: string | null; outcome: string | null; createdAt: string };
type ConversationDetail = ConversationRow & {
  visitor: { id: string; name: string; email: string | null; phone: string | null; userId: string | null } | null;
  messages: Message[];
};

const PROVIDER_NAME: Record<string, string> = { gemini: 'Gemini', grok: 'Grok', local: 'Built-in reply' };
const EVENT_TEXT: Record<string, string> = {
  'quota:reached': 'Complimentary questions used up',
  'quote:requested': 'Get a quote submitted',
  'model:fallback': 'Primary provider failed — the fallback answered the next question',
};

function ConversationDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    setData(null); setFailed(false);
    try { setData(await getJson<ConversationDetail>(`/api/admin/ai-assistant/conversations/${encodeURIComponent(id)}`)); } catch { setFailed(true); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Dialog open={!!id} onClose={onClose} side="right" size="lg"
      title={data?.visitor?.name ? `Conversation · ${data.visitor.name}` : 'Conversation'}
      description={data ? `${data.questionsAsked} asked · ${data.successfulAnswers} answered · ${data.failedAnswers} unanswered` : undefined}>
      {failed ? <ErrorState title="This conversation could not be loaded" onRetry={load} />
        : !data ? <SkeletonRows rows={6} />
        : data.messages.length === 0 ? <EmptyState title="No messages yet" description="This visitor filled in the form but has not asked anything." />
        : (
          <ol className="space-y-3" aria-label="Messages, oldest first">
            {data.messages.map(m => {
              const time = <time className="text-[11px] text-muted" dateTime={m.createdAt}>{when(m.createdAt)}</time>;
              if (m.role === 'event') {
                return <li key={m.id} className="text-center text-xs text-muted">— {EVENT_TEXT[m.content] ?? m.content} · {when(m.createdAt)} —</li>;
              }
              const question = m.role === 'user' || m.role === 'local_user' || m.role === 'failed_user';
              return (
                <li key={m.id} className={`flex ${question ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm ${question ? 'border-transparent bg-accent-soft text-ink' : 'border-rule bg-surface-2 text-ink'}`}>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-ink-2">{question ? 'Visitor' : 'Assistant'}</span>
                      {!question && m.provider && <Badge tone="neutral">{PROVIDER_NAME[m.provider] ?? m.provider}</Badge>}
                      {m.role === 'failed_user' && <Badge tone="alarm">No answer · {m.outcome === 'timeout' ? 'timed out' : 'provider unavailable'}</Badge>}
                      {time}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </Dialog>
  );
}
