import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText, MessageCircle, SendHorizonal, X, Loader2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../config';
import { markAiAssistantDisabled, useAiAssistantEnabled } from '../lib/useAiAssistantEnabled';

/** Staff tools. A visitor-facing assistant has no place inside them. */
const HIDDEN_PREFIXES = ['/admin', '/manager', '/sales', '/studio'];

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const SESSION_KEY = 'ai-assistant-session';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; action?: 'quote' };

/** Where the visitor stands. The server decides; this is only what it last said, for display. */
type Quota = { tier: 'anonymous' | 'lead'; limit: number; used: number; remaining: number };

/** Why the last question got no answer. Neither costs the visitor a question. */
type Failure = { kind: 'timeout' | 'unavailable'; text: string };

/** Longer than the server's own deadline, so the server's answer is normally the one that arrives. */
const CLIENT_TIMEOUT_MS = 20_000;
/** Long enough to see the last answer land, short enough not to make the visitor wait for the form. */
const HANDOFF_DELAY_MS = 900;
const WHATSAPP_HREF = `https://wa.me/${COMPANY_DETAILS.whatsapp.replace(/\D/g, '')}`;

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: "Hello! I'm the STM Digital Library assistant. I can help you explore the catalogue, explain institutional subscriptions and pricing, or point you to the right page.",
};

const PURPOSES = [
  'Request a subscription quote',
  'Request a demo',
  'Institutional access for my library',
  'Content or licensing question',
  'Something else',
] as const;

const EMPTY_LEAD = { name: '', email: '', phone: '', organization: '', purpose: PURPOSES[0] as string, message: '' };

/** One session per visitor, so a conversation keeps its thread. */
function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function AIAssistantChat() {
  const { pathname } = useLocation();
  // The master switch, as the server says it: null until the first answer (nothing is drawn), then true or false. Off, the
  // widget is the quote form alone — no assistant tab, transcript, greeting, allowance or notice, and no mention of AI.
  const aiState = useAiAssistantEnabled();
  const aiOn = aiState === true;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'quote'>('chat');
  const activeTab = aiOn ? tab : 'quote';
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  const [lead, setLead] = useState(EMPTY_LEAD);
  const [consent, setConsent] = useState(false);
  const [leadSending, setLeadSending] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const quoteBodyRef = useRef<HTMLDivElement>(null);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const sid = useRef(getSessionId());
  // A state update lands after the click that caused it, so a fast second click would still see "not sending".
  const inFlight = useRef(false);

  // Public site only — the same staff areas the WhatsApp button skips.
  if (HIDDEN_PREFIXES.some(p => startsWithSegment(pathname, p))) return null;

  // Keep the newest message in view.
  useEffect(() => {
    const el = logRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  // Focus the input when the panel opens; hand focus back to the
  // trigger when it closes.
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    if (was) triggerRef.current?.focus();
  }, [open]);

  // The details form always starts at its top, on its first field — never halfway down a scrolled panel.
  useEffect(() => {
    if (!open || activeTab !== 'quote') return;
    quoteBodyRef.current?.scrollTo({ top: 0 });
    const t = setTimeout(() => {
      quoteBodyRef.current?.scrollTo({ top: 0 });
      document.getElementById('lead-name')?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [open, activeTab]);

  // While the panel is open the page tells the floating helpers to step aside (see index.css).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute('data-ai-open', '');
    return () => root.removeAttribute('data-ai-open');
  }, [open]);

  useEffect(() => () => { if (handoffTimer.current) clearTimeout(handoffTimer.current); }, []);

  const close = () => setOpen(false);

  /** The free questions were just used up: let the answer land, then move the visitor to the form. */
  function handOffToDetails() {
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    handoffTimer.current = setTimeout(() => { handoffTimer.current = null; setTab('quote'); }, HANDOFF_DELAY_MS);
  }

  // The free questions are spent and the visitor has not shared details yet.
  const quotaSpent = aiOn && !!quota && quota.tier === 'anonymous' && quota.remaining <= 0 && !leadSent;

  // The allowance lives on the server; ask it, so a refresh or a cleared browser store changes nothing.
  async function loadQuota() {
    try {
      const res = await fetch(`/api/ai-assistant/status?sessionId=${encodeURIComponent(sid.current)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.quota) setQuota(data.quota);
    } catch { /* the page works without it; the server still enforces */ }
  }
  useEffect(() => { if (aiOn && open && !quota) loadQuota(); }, [open, aiOn]);

  async function sendMessage(text: string, retry = false) {
    const clean = text.trim();
    if (!clean || sending || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setFailure(null);
    setDraft('');
    if (!retry) setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: clean }]);
    setSending(true);
    try {
      const res = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid.current, message: clean }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      if (data.code === 'AI_ASSISTANT_DISABLED') {
        // Switched off while this panel was open. Nothing is retried; the panel says so and offers the other ways to reach us.
        markAiAssistantDisabled();
        return;
      }
      if (data.quota) setQuota(data.quota);
      const spent = !!data.quota && data.quota.tier === 'anonymous' && data.quota.remaining <= 0;

      if (res.ok) {
        const reply =
          typeof data.text === 'string' && data.text.trim()
            ? data.text
            : "I'm sorry, I couldn't generate a response.";
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply, ...(data.action === 'quote' ? { action: 'quote' as const } : {}) }]);
        if (spent) handOffToDetails();
      } else if (res.status === 429 && data.code === 'quota_reached') {
        // The allowance is spent: the server said so without calling the model. The details form takes over.
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: typeof data.text === 'string' ? data.text : 'You have used your complimentary questions.' }]);
        handOffToDetails();
      } else if (res.status === 409) {
        // Another question of this session is still being answered; this one was not taken.
      } else if (res.status === 504 || data.code === 'timeout') {
        setFailure({ kind: 'timeout', text: clean });
      } else if (res.status === 429) {
        setError(typeof data.error === 'string' ? data.error : 'Too many messages right now. Please wait a minute and try again.');
      } else {
        setFailure({ kind: 'unavailable', text: clean });
      }
    } catch (err) {
      // No answer inside the page's own limit, or no connection: the same way out as a server timeout.
      setFailure({ kind: (err as Error)?.name === 'TimeoutError' ? 'timeout' : 'unavailable', text: clean });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (leadSending) return;
    // Email or phone — never both required.
    if (!lead.email.trim() && !lead.phone.trim()) {
      setLeadError('Please provide an email address or a phone number so we can reply.');
      return;
    }
    setLeadError(null);
    setLeadSending(true);
    try {
      const res = await fetch('/api/ai-assistant/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid.current,
          name: lead.name.trim(),
          email: lead.email.trim(),
          phone: lead.phone.trim(),
          organization: lead.organization.trim(),
          purpose: lead.purpose,
          message: lead.message.trim(),
          marketingConsent: consent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' && data.error
            ? data.error
            : 'Could not submit your details. Please try again.'
        );
      }
      setLeadSent(true);
      if (data.quota) setQuota(data.quota);
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: 'Thank you. Your details are saved and our team will be in touch. You can keep asking questions here.' }]);
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Could not submit your details.');
    } finally {
      setLeadSending(false);
    }
  }

  /** The details form's fields. One form, in the Get a quote tab only; the CRM endpoint and its rules are unchanged. */
  const leadFields = () => (
    <>
      <div className="field">
        <label htmlFor="lead-name" className="field-label">
          Full name <span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="lead-name"
          className="input"
          value={lead.name}
          onChange={(e) => setLead({ ...lead, name: e.target.value })}
          maxLength={100}
          required
          autoComplete="name"
        />
      </div>

      <div className="field">
        <label htmlFor="lead-email" className="field-label">Email</label>
        <input
          id="lead-email"
          type="email"
          className="input"
          value={lead.email}
          onChange={(e) => setLead({ ...lead, email: e.target.value })}
          maxLength={100}
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label htmlFor="lead-phone" className="field-label">Phone</label>
        <input
          id="lead-phone"
          type="tel"
          className="input"
          value={lead.phone}
          onChange={(e) => setLead({ ...lead, phone: e.target.value })}
          maxLength={100}
          autoComplete="tel"
        />
        <p className="field-help">An email address or a phone number — at least one, so we can reply.</p>
      </div>

      <div className="field">
        <label htmlFor="lead-org" className="field-label">Organization</label>
        <input
          id="lead-org"
          className="input"
          value={lead.organization}
          onChange={(e) => setLead({ ...lead, organization: e.target.value })}
          maxLength={150}
          autoComplete="organization"
        />
      </div>

      <div className="field">
        <label htmlFor="lead-purpose" className="field-label">
          I&rsquo;m interested in <span className="req" aria-hidden="true">*</span>
        </label>
        <select
          id="lead-purpose"
          className="input"
          value={lead.purpose}
          onChange={(e) => setLead({ ...lead, purpose: e.target.value })}
        >
          {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="lead-message" className="field-label">Message / requirement</label>
        <textarea
          id="lead-message"
          className="input"
          rows={3}
          value={lead.message}
          onChange={(e) => setLead({ ...lead, message: e.target.value })}
          maxLength={500}
        />
      </div>

      <p className="text-sm leading-relaxed text-ink-2">
        We&rsquo;ll use these details only to respond to your enquiry or requested follow-up. See our{' '}
        <Link to="/privacy-policy" className="font-semibold text-accent hover:underline">
          Privacy Policy
        </Link>.
      </p>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>Send me academic updates and STM Digital Library announcements.</span>
      </label>
    </>
  );

  // Phones get the whole screen; from sm up it is a card anchored above the chat button, wide enough for a form.
  const panelShell =
    'fixed inset-0 z-[110] flex h-[100dvh] w-full flex-col overflow-hidden bg-surface ' +
    'sm:inset-auto sm:z-40 sm:h-auto sm:max-h-[min(720px,calc(100dvh-var(--fab-bottom)-48px-var(--fab-gap)-max(var(--pwa-offset,0px),var(--cookie-offset,0px))-5rem))] sm:w-[min(480px,calc(100vw-2rem))] ' +
    'sm:right-[var(--fab-right)] sm:mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] ' +
    'sm:rounded-2xl sm:border sm:border-rule sm:shadow-[var(--shadow-pop)]';
  const fabStack = `${pathname === '/signup' ? 'fab-avoid-form ' : ''}fixed right-[var(--fab-right)] mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] z-40`;
  const triggerBottom = 'bottom-[calc(var(--fab-bottom)+48px+var(--fab-gap))]';

  // Not known yet: draw nothing, so the widget never appears as one thing and then turns into the other.
  if (aiState === null) return null;

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={aiOn ? 'Open AI assistant' : 'Get a quote'}
          className={`${fabStack} ${triggerBottom} flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white shadow-[var(--shadow-pop)] transition-colors duration-200 hover:bg-navy-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:h-14 sm:w-14`}
        >
          {aiOn ? <MessageCircle size={22} aria-hidden="true" /> : <FileText size={22} aria-hidden="true" />}
        </button>
      )}

      {open && (
        <div
          id="ai-assistant-panel"
          role="dialog"
          aria-label={aiOn ? 'STM Digital Library assistant' : 'STM Digital Library, get a quote'}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
          className={`${panelShell} sm:bottom-[calc(var(--fab-bottom)+48px+var(--fab-gap))]`}
        >
          {/* Header — fixed; only the body below scrolls */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                {aiOn ? <MessageCircle size={16} /> : <FileText size={16} />}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">STM Digital Library</p>
                <p className="text-xs text-muted">{aiOn ? 'AI Assistant' : 'Get a quote'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={aiOn ? 'Close assistant' : 'Close form'}
              className="btn btn-ghost btn-sm btn-icon"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Tabs — only while the assistant is on. Off, there is nothing to switch between. */}
          {aiOn && <div role="tablist" aria-label="Assistant panels" className="flex shrink-0 border-b border-rule">
            {([
              ['chat', 'Assistant'],
              ['quote', 'Get a quote'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`ai-assistant-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`ai-assistant-panel-${key}`}
                onClick={() => setTab(key)}
                className={`flex-1 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  tab === key
                    ? 'border-b-2 border-accent text-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>}

          {activeTab === 'chat' ? (
            <div
              role="tabpanel"
              id="ai-assistant-panel-chat"
              aria-labelledby="ai-assistant-tab-chat"
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Messages */}
              <div
                ref={logRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto px-4 py-4"
              >
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-br-md bg-navy text-white'
                          : 'rounded-bl-md border border-rule bg-surface-2 text-ink'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.action === 'quote' && (
                        <button type="button" onClick={() => setTab('quote')} className="btn btn-brand btn-sm mt-2">
                          Open Get a quote
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start" aria-label="Assistant is typing">
                    <div className="rounded-2xl rounded-bl-md border border-rule bg-surface-2 px-3.5 py-2.5">
                      <Loader2 size={14} className="animate-spin text-muted" aria-hidden="true" />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="shrink-0 border-t border-rule bg-surface px-4 py-2 text-xs font-medium text-alarm">
                  {error}
                </p>
              )}

              {failure && (
                <div role="alert" className="shrink-0 space-y-2 border-t border-rule bg-surface px-4 py-3">
                  <p className="text-sm font-medium text-ink">
                    {failure.kind === 'timeout' ? 'That response is taking longer than expected.' : 'The assistant is temporarily unavailable.'}
                  </p>
                  <p className="text-xs text-muted">This did not use one of your questions.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => sendMessage(failure.text, true)} disabled={sending}>Retry</button>
                    <Link to="/search" className="btn btn-ghost btn-sm" onClick={close}>Search Library</Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab('quote')}>Get a quote</button>
                    <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">WhatsApp</a>
                  </div>
                </div>
              )}

              {quotaSpent && quota ? (
                /* The free questions are used. The form lives in Get a quote; this is only the way there. */
                <div className="shrink-0 space-y-3 border-t border-rule px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <p className="text-sm leading-relaxed text-ink">
                    <span className="font-semibold">You&rsquo;ve used your {quota.limit} complimentary AI questions.</span>{' '}
                    Share your details to continue, request a quotation, or speak with our team.
                  </p>
                  <button type="button" className="btn btn-brand btn-block" onClick={() => setTab('quote')}>
                    Continue with your details
                  </button>
                </div>
              ) : quota && quota.remaining <= 0 ? (
                <p className="shrink-0 border-t border-rule px-4 py-3 text-sm text-ink-2">
                  You have reached the hourly limit for questions. You can still use Get a quote or reach our team on{' '}
                  <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">WhatsApp</a>.
                </p>
              ) : (
                <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
                  {quota && quota.tier === 'anonymous' && (
                    <p className="px-4 pt-2 text-xs text-muted" aria-live="polite">
                      {quota.remaining === 1 ? '1 complimentary question remaining' : `${quota.remaining} of ${quota.limit} complimentary questions remaining`}
                    </p>
                  )}
                  <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}
                    className="flex items-center gap-2 p-3"
                  >
                    <label htmlFor="ai-assistant-input" className="sr-only">
                      Message the assistant
                    </label>
                    <input
                      id="ai-assistant-input"
                      ref={inputRef}
                      className="input flex-1"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onFocus={() => {
                        // Best-effort against mobile keyboards: browsers that
                        // shrink the viewport when the keyboard opens reflow
                        // the fixed panel; scrolling the input into view
                        // helps the ones that do not.
                        setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest' }), 300);
                      }}
                      placeholder="Ask about content, access or pricing…"
                      maxLength={1000}
                      disabled={sending}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-icon"
                      disabled={sending || !draft.trim()}
                      aria-label="Send message"
                    >
                      <SendHorizonal size={16} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : leadSent ? (
            <div
              role={aiOn ? 'tabpanel' : undefined}
              id="ai-assistant-panel-quote"
              aria-labelledby={aiOn ? 'ai-assistant-tab-quote' : undefined}
              ref={quoteBodyRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
            >
              <div className="rounded-xl border border-rule bg-surface-2 p-4" role="status">
                <p className="text-base font-semibold text-ink">Thank you &mdash; your request has been received.</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                  {aiOn ? 'Our team will reach out during business hours at the contact details you provided.' : 'Our team will contact you during business hours.'}
                </p>
              </div>
              {aiOn ? (
                <>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      className="btn btn-brand"
                      onClick={() => { setTab('chat'); setTimeout(() => inputRef.current?.focus(), 60); }}
                    >
                      Return to assistant
                    </button>
                    <Link to="/search" className="btn btn-ghost" onClick={close}>Search the library</Link>
                    <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">WhatsApp</a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeadSent(false)}
                    className="mt-4 text-sm font-semibold text-accent hover:underline"
                  >
                    Send another request
                  </button>
                </>
              ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-brand">WhatsApp</a>
                  {/* Closing also clears the thank-you and what was typed, so the next time the form opens it is a fresh one. */}
                  <button type="button" className="btn btn-ghost" onClick={() => { setLeadSent(false); setLead(EMPTY_LEAD); setConsent(false); close(); }}>Close</button>
                </div>
              )}
            </div>
          ) : (
            /* Lead capture — the CRM receives a short summary, never a transcript. */
            <form
              role={aiOn ? 'tabpanel' : undefined}
              id="ai-assistant-panel-quote"
              aria-labelledby={aiOn ? 'ai-assistant-tab-quote' : undefined}
              onSubmit={submitLead}
              aria-label="Continue with our team"
              className="flex min-h-0 flex-1 flex-col"
            >
              <div ref={quoteBodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {quotaSpent && quota ? (
                  /* Arrived here because the free questions ran out: say so, briefly. */
                  <div className="rounded-xl border border-rule bg-surface-2 p-3.5">
                    <h2 className="text-sm font-semibold text-ink">Continue with our team</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">
                      You&rsquo;ve used your {quota.limit} complimentary AI questions. Share your details and we&rsquo;ll help with subscriptions, demonstrations, quotations, or academic content access.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-base font-semibold text-ink">Continue with our team</h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">
                      Share your details and we&rsquo;ll help with subscriptions, demonstrations, quotations, or academic content access.
                    </p>
                  </div>
                )}
                {leadFields()}
              </div>

              {/* Submit stays in reach however long the form is. */}
              <div className="shrink-0 space-y-2 border-t border-rule bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {leadError && <p role="alert" className="field-error">{leadError}</p>}
                <button
                  type="submit"
                  className="btn btn-brand btn-block"
                  disabled={leadSending}
                  aria-busy={leadSending}
                >
                  {leadSending ? 'Submitting…' : 'Submit request'}
                </button>
                <p className="field-help">A team member responds during business hours. Your details stay with us.</p>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
