import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, SendHorizonal, X, Loader2 } from 'lucide-react';

/** Staff tools. A visitor-facing assistant has no place inside them. */
const HIDDEN_PREFIXES = ['/admin', '/manager', '/sales', '/studio'];

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const SESSION_KEY = 'ai-assistant-session';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };

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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'quote'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lead, setLead] = useState({ name: '', email: '', phone: '', organization: '', purpose: PURPOSES[0] as string });
  const [consent, setConsent] = useState(false);
  const [leadSending, setLeadSending] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const sid = useRef(getSessionId());

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

  const close = () => setOpen(false);

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    setError(null);
    setDraft('');
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: clean }]);
    setSending(true);
    try {
      const res = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid.current, message: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? 'Too many messages right now. Please wait a minute and try again.'
            : 'The assistant is temporarily unavailable. Please try again shortly.'
        );
      }
      const reply =
        typeof data.text === 'string' && data.text.trim()
          ? data.text
          : "I'm sorry, I couldn't generate a response.";
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is temporarily unavailable.');
    } finally {
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
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Could not submit your details.');
    } finally {
      setLeadSending(false);
    }
  }

  const fabStack = `${pathname === '/signup' ? 'fab-avoid-form ' : ''}fixed right-[var(--fab-right)] mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] z-40`;
  const triggerBottom = 'bottom-[calc(var(--fab-bottom)+48px+var(--fab-gap))]';

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className={`${fabStack} ${triggerBottom} flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white shadow-[var(--shadow-pop)] transition-colors duration-200 hover:bg-navy-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:h-14 sm:w-14`}
        >
          <MessageCircle size={22} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          id="ai-assistant-panel"
          role="dialog"
          aria-label="STM Digital Library assistant"
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
          className={`${fabStack} ${triggerBottom} flex max-h-[min(72vh,680px)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow-pop)]`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                <MessageCircle size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">STM Digital Library</p>
                <p className="text-xs text-muted">AI Assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close assistant"
              className="btn btn-ghost btn-sm btn-icon"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Assistant panels" className="flex border-b border-rule">
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
          </div>

          {tab === 'chat' ? (
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
                className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
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
                <p role="alert" className="border-t border-rule bg-surface px-4 py-2 text-xs font-medium text-alarm">
                  {error}
                </p>
              )}

              {/* Input */}
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}
                className="flex items-center gap-2 border-t border-rule p-3"
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
          ) : leadSent ? (
            <div
              role="tabpanel"
              id="ai-assistant-panel-quote"
              aria-labelledby="ai-assistant-tab-quote"
              className="flex-1 overflow-y-auto px-4 py-6"
            >
              <div className="rounded-xl border border-rule bg-surface-2 p-4">
                <p className="text-sm font-semibold text-ink">Thank you!</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                  Your request has been recorded. Our team will reach out during business hours
                  at the contact details you provided.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setLeadSent(false); setLead({ name: '', email: '', phone: '', organization: '', purpose: PURPOSES[0] }); setConsent(false); }}
                className="btn btn-ghost btn-sm mt-3"
              >
                Submit another request
              </button>
            </div>
          ) : (
            /* Lead capture — the CRM receives a short summary, never a transcript. */
            <form
              role="tabpanel"
              id="ai-assistant-panel-quote"
              aria-labelledby="ai-assistant-tab-quote"
              onSubmit={submitLead}
              aria-label="Request a quote or demo"
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
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

              {leadError && (
                <p role="alert" className="field-error">{leadError}</p>
              )}

              <button
                type="submit"
                className="btn btn-brand btn-block"
                disabled={leadSending}
                aria-busy={leadSending}
              >
                {leadSending ? 'Submitting…' : 'Submit request'}
              </button>
              <p className="field-help">A team member responds during business hours. Your details stay with us.</p>
            </form>
          )}
        </div>
      )}
    </>
  );
}
