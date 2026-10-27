import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Building2, CreditCard, FileText, Minus, SendHorizonal, X } from 'lucide-react';
import { COMPANY_DETAILS } from '../config';
import { markAiAssistantDisabled, useAiAssistantEnabled } from '../lib/useAiAssistantEnabled';
import { useAuth } from '../contexts/AuthContext';
import {
  VISITOR_LIMITS, firstName, isValidEmail, isValidIndianMobile, normaliseEmail, normalisePhone, validateVisitor,
  type VisitorErrors,
} from '../lib/visitorDetails';

/** Staff tools. A visitor-facing assistant has no place inside them. */
const HIDDEN_PREFIXES = ['/admin', '/manager', '/sales', '/studio'];

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const SESSION_KEY = 'ai-assistant-session';
/** Set when the launcher's bubble has been closed (or the chat opened): it stays away for the rest of the browser session. */
const GREETING_KEY = 'ai-assistant-greeted';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; action?: 'quote' };

/** Where the visitor stands. The server decides; this is only what it last said, for display. */
type Quota = { tier: 'anonymous' | 'lead'; limit: number; used: number; remaining: number };

/** Why the last question got no answer. None of them costs the visitor a question. */
type Failure = { kind: 'timeout' | 'unavailable' | 'busy'; text: string; message?: string };

/** Longer than the server's own deadline, so the server's answer is normally the one that arrives. */
const CLIENT_TIMEOUT_MS = 20_000;
/** Long enough to see the last answer land, short enough not to make the visitor wait for the form. */
const HANDOFF_DELAY_MS = 900;
const WHATSAPP_HREF = `https://wa.me/${COMPANY_DETAILS.whatsapp.replace(/\D/g, '')}`;

const PURPOSES = [
  'Request a subscription quote',
  'Request a demo',
  'Institutional access for my library',
  'Content or licensing question',
  'Something else',
] as const;

const EMPTY_LEAD = { name: '', email: '', phone: '', organization: '', purpose: PURPOSES[0] as string, message: '' };

/** Quick actions that ask the assistant. Each is an ordinary question, so it counts against the allowance like any other. */
const QUICK_QUESTIONS = [
  { label: 'Find resources', icon: BookOpen, question: 'How can I find journals, articles and books in the library?' },
  { label: 'Subscription plans', icon: CreditCard, question: 'What subscription plans are available?' },
  { label: 'Institutional access', icon: Building2, question: 'How does institutional access work for my library?' },
] as const;

const EMPTY_VISITOR = { name: '', email: '', phone: '' };
const START_FAILED = "We couldn't start the assistant. Please try again.";

/**
 * A signed-in member's own name, email and number, for the pre-chat form — each only when it already passes the form's
 * rules, so one tap is enough and a stale number never blocks them. Read from their own profile in this browser.
 */
function profileDefaults(profile: any): typeof EMPTY_VISITOR | null {
  if (!profile) return null;
  const name = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  const email = normaliseEmail(profile.email);
  const phone = normalisePhone(profile.contact || profile.whatsapp || '');
  return {
    name: name.slice(0, VISITOR_LIMITS.name),
    email: isValidEmail(email) ? email : '',
    phone: isValidIndianMobile(phone) ? phone : '',
  };
}

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

function greetedThisSession(): boolean {
  try { return sessionStorage.getItem(GREETING_KEY) === '1'; } catch { return true; }
}
function markGreeted() {
  try { sessionStorage.setItem(GREETING_KEY, '1'); } catch { /* the bubble just shows again on the next page load */ }
}

/** The assistant's face: a white robot with a navy visor. Decorative; the control around it carries the name. */
function RobotIcon({ className, visor = 'var(--stm-navy)', body = '#fff', eyes = '#fff' }: { className?: string; visor?: string; body?: string; eyes?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="4.6" r="1.9" fill={body} />
      <path d="M16 6.4v3" stroke={body} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="2.6" y="14.6" width="2.6" height="6" rx="1.3" fill={body} />
      <rect x="26.8" y="14.6" width="2.6" height="6" rx="1.3" fill={body} />
      <rect x="5.6" y="9.4" width="20.8" height="16.6" rx="6" fill={body} />
      <rect x="8.6" y="12.6" width="14.8" height="10.2" rx="4.2" fill={visor} />
      <circle cx="12.9" cy="17.1" r="1.75" fill={eyes} />
      <circle cx="19.1" cy="17.1" r="1.75" fill={eyes} />
      <path d="M13.6 20.2c1.35.9 3.45.9 4.8 0" stroke={eyes} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The assistant's identity, the launcher's look at three sizes: a white disc with a thin teal ring and the teal robot. `md` (header, welcome) adds the
 * amber AI badge and the green online dot; `sm` (beside each reply) is the disc alone. Decorative; the control or heading around it carries the name.
 */
function RobotAvatar({ size, welcome, icon: Icon }: { size: 'sm' | 'md'; welcome?: boolean; icon?: typeof FileText }) {
  const box = size === 'sm' ? 'h-7 w-7' : welcome ? 'h-12 w-12' : 'h-9 w-9 sm:h-10 sm:w-10';
  const glyph = size === 'sm' ? 'h-[18px] w-[18px]' : welcome ? 'h-7 w-7' : 'h-[22px] w-[22px] sm:h-6 sm:w-6';
  return (
    <span className={`relative flex ${box} shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-surface`} aria-hidden="true">
      {Icon ? <Icon className={`${glyph} text-[var(--accent)]`} /> : <RobotIcon className={glyph} body="var(--accent)" visor="#fff" eyes="var(--accent)" />}
      {size === 'md' && !Icon && (
        <>
          <span className={`absolute -left-1.5 -top-1.5 rounded-full bg-[#f59e0b] px-1 text-[8px] font-bold leading-[14px] tracking-wide text-[#1c1917] ring-2 ${welcome ? 'ring-[var(--surface)]' : 'ring-[var(--stm-navy)]'}`}>AI</span>
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-[#22c55e] ${welcome ? 'border-[var(--surface)]' : 'border-[var(--stm-navy)]'}`} />
        </>
      )}
    </span>
  );
}

export function AIAssistantChat() {
  const { pathname } = useLocation();
  // The master switch, as the server says it: null until the first answer (nothing is drawn), then true or false. Off, the
  // widget is the quote form alone — no assistant tab, transcript, greeting, allowance or notice, and no mention of AI.
  const aiState = useAiAssistantEnabled();
  const { profile } = useAuth();
  const aiOn = aiState === true;
  const hidden = HIDDEN_PREFIXES.some(p => startsWithSegment(pathname, p));
  const [open, setOpen] = useState(false);
  /** Minimised keeps the conversation and marks a reply that lands meanwhile; closed is the same, without the mark. */
  const [unread, setUnread] = useState(false);
  const [tab, setTab] = useState<'chat' | 'quote'>('chat');
  const activeTab = aiOn ? tab : 'quote';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [greeting, setGreeting] = useState(false);

  // The pre-chat gate. The server decides whether this session has given its details; until it has said, nothing is
  // assumed either way. Only the first name ever comes back from it.
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [visitor, setVisitor] = useState<{ firstName: string } | null>(null);
  const [details, setDetails] = useState(EMPTY_VISITOR);
  const [detailsTouched, setDetailsTouched] = useState<Record<string, boolean>>({});
  const [detailsTried, setDetailsTried] = useState(false);
  const [detailsSending, setDetailsSending] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<VisitorErrors>({});
  const prefilled = useRef(false);

  const [lead, setLead] = useState(EMPTY_LEAD);
  const [consent, setConsent] = useState(false);
  const [leadSending, setLeadSending] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const quoteBodyRef = useRef<HTMLDivElement>(null);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const gateNameRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const sid = useRef(getSessionId());
  // A state update lands after the click that caused it, so a fast second click would still see "not sending".
  const inFlight = useRef(false);

  // Keep the newest message in view. The welcome screen, with no messages yet, starts at its top.
  useEffect(() => {
    const el = logRef.current;
    if (el && open && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending, failure]);

  // Focus the input when the panel opens; hand focus back to the launcher when it closes.
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    if (open) {
      const t = setTimeout(() => (inputRef.current ?? panelRef.current)?.focus({ preventScroll: true }), 60);
      return () => clearTimeout(t);
    }
    if (was) setTimeout(() => triggerRef.current?.focus(), 0);
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

  // While the panel is open the page tells the floating helpers to step aside (see index.css), and Escape closes it
  // from anywhere on the page, not only from inside the panel.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute('data-ai-open', '');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { root.removeAttribute('data-ai-open'); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // On a phone the panel follows the visible viewport, so an open keyboard never covers the message box.
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!open || !vv || !el) return;
    const sync = () => {
      el.style.setProperty('--ai-vv-h', `${vv.height}px`);
      // Where a keyboard that does not resize the page (iOS) covers the bottom; 0 where the page itself shrinks.
      el.style.setProperty('--ai-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, [open]);

  // The "Ask me anything" bubble: there from the start while the assistant is on, until it is closed or the chat is opened.
  // Closing it is remembered for this browser session only (the same session key as before); the button itself is never affected.
  useEffect(() => {
    if (!aiOn || hidden || greetedThisSession()) { setGreeting(false); return; }
    setGreeting(true);
  }, [aiOn, hidden]);
  useEffect(() => { if (open) setGreeting(false); }, [open]);

  useEffect(() => () => { if (handoffTimer.current) clearTimeout(handoffTimer.current); }, []);

  // The textarea grows with what is typed, up to a few lines, then scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft, open, activeTab]);

  const openPanel = () => { markGreeted(); setGreeting(false); setUnread(false); setOpen(true); };
  const close = () => { setUnread(false); setOpen(false); };
  const minimise = () => setOpen(false);

  /** The free questions were just used up: let the answer land, then move the visitor to the form. */
  function handOffToDetails() {
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    handoffTimer.current = setTimeout(() => { handoffTimer.current = null; setTab('quote'); }, HANDOFF_DELAY_MS);
  }

  function openQuote() {
    setLead(l => (l.name || l.email || l.phone || l.message ? l : { ...l, purpose: PURPOSES[0] }));
    setTab('quote');
  }

  // The free questions are spent and the visitor has not shared details yet.
  const quotaSpent = aiOn && !!quota && quota.tier === 'anonymous' && quota.remaining <= 0 && !leadSent;
  const outOfQuestions = !!quota && quota.remaining <= 0;

  // The allowance lives on the server; ask it, so a refresh or a cleared browser store changes nothing.
  async function loadStatus() {
    try {
      const res = await fetch(`/api/ai-assistant/status?sessionId=${encodeURIComponent(sid.current)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.quota) setQuota(data.quota);
      if (res.ok) setVisitor(data.visitor?.firstName !== undefined ? { firstName: String(data.visitor.firstName) } : null);
    } catch { /* unknown: the form shows, and the server still enforces */ }
    finally { setStatusLoaded(true); }
  }
  useEffect(() => { if (aiOn && open && !statusLoaded) loadStatus(); }, [open, aiOn]);

  const showGate = aiOn && statusLoaded && !visitor;

  // A signed-in member finds the form already filled from their own profile; they only press Continue.
  useEffect(() => {
    if (!showGate || prefilled.current) return;
    const d = profileDefaults(profile);
    if (!d) return;
    prefilled.current = true;
    setDetails(cur => (cur.name || cur.email || cur.phone ? cur : d));
  }, [showGate, profile]);

  // The form's first field takes focus when it appears — on a wide screen. On a phone that would throw up the keyboard
  // over a form the visitor has not read yet.
  useEffect(() => {
    if (!open || !showGate || activeTab !== 'chat') return;
    if (!window.matchMedia('(min-width: 640px)').matches) return;
    const t = setTimeout(() => gateNameRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [open, showGate, activeTab]);

  /** The same rules the server applies. Errors show for a field once it has been left, and for all after a submit. */
  const detailsCheck = validateVisitor(details);
  const detailsErrors: VisitorErrors = 'errors' in detailsCheck ? detailsCheck.errors : {};
  const shownError = (field: keyof VisitorErrors) =>
    serverErrors[field] ?? (detailsTried || detailsTouched[field] ? detailsErrors[field] : undefined);
  const contactError = detailsTried || (detailsTouched.email && detailsTouched.phone) ? (serverErrors.contact ?? detailsErrors.contact) : serverErrors.contact;

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (detailsSending) return;
    setDetailsTried(true);
    setServerErrors({});
    setDetailsError(null);
    if ('errors' in detailsCheck) {
      const first = (['name', 'email', 'phone'] as const).find(f => detailsCheck.errors[f]) ?? (detailsCheck.errors.contact ? 'email' : null);
      if (first) document.getElementById(`visitor-${first}`)?.focus();
      return;
    }
    setDetailsSending(true);
    try {
      const res = await fetch('/api/ai-assistant/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}) },
        body: JSON.stringify({ sessionId: sid.current, ...detailsCheck.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.code === 'AI_ASSISTANT_DISABLED') { markAiAssistantDisabled(); return; }
      if (!res.ok) {
        // A field the server refused is shown on that field. Anything else — a missing route, a server error — gets one
        // plain sentence; the page never shows what went wrong inside.
        if (res.status === 400 && data.errors && typeof data.errors === 'object') {
          setServerErrors(data.errors);
          throw new Error('Please check the highlighted fields.');
        }
        throw new Error(START_FAILED);
      }
      if (data.quota) setQuota(data.quota);
      const v = { ...detailsCheck.value, ...(data.contact ? { name: data.contact.name || detailsCheck.value.name, email: data.contact.email || detailsCheck.value.email, phone: data.contact.mobile || detailsCheck.value.phone } : {}) };
      setVisitor({ firstName: typeof data.visitor?.firstName === 'string' ? data.visitor.firstName : firstName(v.name) });
      // Get a quote starts from what was just given, so nobody types it twice.
      setLead(l => ({ ...l, name: l.name || v.name, email: l.email || v.email, phone: l.phone || v.phone }));
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    } catch (err) {
      setDetailsError(err instanceof Error && err.message === 'Please check the highlighted fields.' ? err.message : START_FAILED);
    } finally {
      setDetailsSending(false);
    }
  }

  function addAssistant(text: string, action?: 'quote') {
    setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text, ...(action ? { action } : {}) }]);
    if (!openRef.current) setUnread(true);
  }

  async function sendMessage(text: string, retry = false) {
    const clean = text.trim();
    if (!clean || sending || inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    if (!retry) {
      setDraft('');
      setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: clean }]);
    }
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
        // Switched off while this panel was open. Nothing is retried; the panel turns into the quote form.
        markAiAssistantDisabled();
        return;
      }
      if (res.status === 403 && data.code === 'details_required') {
        // The server does not know this visitor (a new session, or the details were removed): back to the form, question kept.
        if (!retry) { setMessages(prev => prev.slice(0, -1)); setDraft(clean); }
        setVisitor(null);
        return;
      }
      if (data.quota) setQuota(data.quota);
      const spent = !!data.quota && data.quota.tier === 'anonymous' && data.quota.remaining <= 0;

      if (res.ok) {
        const reply =
          typeof data.text === 'string' && data.text.trim()
            ? data.text
            : "I'm sorry, I couldn't generate a response.";
        addAssistant(reply, data.action === 'quote' ? 'quote' : undefined);
        if (spent) handOffToDetails();
      } else if (res.status === 429 && data.code === 'quota_reached') {
        // The allowance is spent: the server said so without calling the model. The details form takes over.
        addAssistant(typeof data.text === 'string' ? data.text : 'You have used your complimentary questions.');
        handOffToDetails();
      } else if (res.status === 409) {
        // Another question of this session is still being answered; this one was not taken.
        setFailure({ kind: 'busy', text: clean, message: 'Your previous question is still being answered. Please try again in a moment.' });
      } else if (res.status === 504 || data.code === 'timeout') {
        setFailure({ kind: 'timeout', text: clean });
      } else if (res.status === 429) {
        setFailure({ kind: 'busy', text: clean, message: typeof data.error === 'string' ? data.error : 'Too many messages right now. Please wait a minute and try again.' });
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
        <Link to="/privacy-policy" className="font-semibold text-[var(--stm-blue-ink)] hover:underline">
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

  // Not known yet: draw nothing, so the widget never appears as one thing and then turns into the other.
  if (hidden || aiState === null) return null;

  const offsets = 'mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))]';
  const avoidForm = pathname === '/signup' ? 'fab-avoid-form ' : '';
  const aboveFeedback = ['/dashboard', '/institution'].some(p => pathname === p || pathname.startsWith(`${p}/`));
  const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stm-blue)] focus-visible:ring-offset-2';
  const headerBtn =
    'flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
  // A phone gets a card 8px in from the right and the bottom (and above the keyboard), as tall as its content up to about
  // three quarters of the screen; from sm up a 400px card above the launcher's spot, as before.
  const panelShell =
    `${avoidForm}ai-pop fixed z-[110] flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow-modal)] ` +
    'left-auto right-2 w-[min(calc(100vw-16px),480px)] bottom-[calc(max(8px,env(safe-area-inset-bottom))+var(--ai-kb,0px))] ' +
    'max-h-[min(76dvh,640px,calc(var(--ai-vv-h,100dvh)-24px))] ' +
    `sm:z-40 sm:max-h-none sm:right-[var(--fab-right)] sm:bottom-[var(--ai-launcher-bottom)] sm:mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] sm:w-[min(400px,calc(100vw-2rem))] ` +
    'sm:h-[min(640px,calc(100dvh-var(--ai-launcher-bottom)-max(var(--pwa-offset,0px),var(--cookie-offset,0px))-5.5rem))] sm:min-h-[360px]';
  const hasConversation = messages.length > 0;

  const quickButton =
    `flex w-full min-w-0 items-center gap-2 rounded-xl border border-rule bg-surface px-2.5 py-2.5 text-left text-[13px] font-semibold leading-snug text-ink ` +
    `sm:flex-col sm:items-start sm:p-3 sm:text-sm ` +
    `transition-colors hover:border-[var(--stm-blue)] hover:bg-[var(--stm-blue-soft)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

  return (
    <>
      {!open && (
        // One vertical stack on the WhatsApp button's centre line: bubble, AI badge, the round button. WhatsApp sits 12px below it.
        // Dashboard and institution pages carry the Feedback widget under WhatsApp, so the stack rises by the same amount there.
        <div className={`${avoidForm}fixed right-[var(--fab-right)] ${aboveFeedback ? 'bottom-[calc(var(--fab-bottom)+var(--fab-wa-size)+12px+48px+var(--fab-gap))]' : 'bottom-[calc(var(--fab-bottom)+var(--fab-wa-size)+12px)]'} ${offsets} z-40 flex w-[var(--fab-wa-size)] flex-col items-center`}>
          {(greeting || !aiOn) && (
            <div role="status" className="relative mb-2.5 flex max-w-[calc(100vw-2rem)] items-center self-end whitespace-nowrap rounded-xl border border-rule bg-surface py-1.5 pl-3 pr-1 text-[13px] font-medium text-ink shadow-[var(--shadow-pop)] sm:text-sm">
              <button type="button" onClick={openPanel} className={`rounded-md text-left ${focusRing}`}>
                {aiOn ? 'Ask me anything' : 'Get a quote'}
              </button>
              {aiOn ? (
                <button
                  type="button"
                  onClick={() => { markGreeted(); setGreeting(false); }}
                  aria-label="Close AI suggestion"
                  className={`ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink ${focusRing}`}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : <span className="w-2" aria-hidden="true" />}
              {/* The pointer, over the middle of the button below. */}
              <span aria-hidden="true" className="absolute -bottom-[6px] right-[calc(var(--fab-wa-size)/2_-_6px)] h-3 w-3 rotate-45 border-b border-r border-rule bg-surface" />
            </div>
          )}
          <button
            ref={triggerRef}
            type="button"
            onClick={openPanel}
            aria-label={aiOn ? `Ask AI — open the STM AI Assistant${unread ? ' (new reply)' : ''}` : 'Get a quote'}
            aria-expanded={false}
            aria-controls="ai-assistant-panel"
            className={`group relative flex flex-col items-center rounded-full ${focusRing}`}
          >
            {aiOn && (
              <span className="relative z-10 -mb-2.5 rounded-full bg-[#f59e0b] px-2 py-[1px] text-[10px] font-bold leading-4 tracking-wide text-[#1c1917] shadow-sm ring-2 ring-surface" aria-hidden="true">AI</span>
            )}
            <span className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full border-2 border-[var(--accent)] bg-surface shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent),0_6px_16px_rgba(15,23,43,0.18)] transition-[transform,box-shadow] duration-200 group-hover:scale-[1.04] group-hover:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent),0_10px_22px_rgba(15,23,43,0.26)] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:h-[62px] sm:w-[62px]">
              {aiOn
                ? <RobotIcon className="h-8 w-8 sm:h-9 sm:w-9" body="var(--accent)" visor="#fff" eyes="var(--accent)" />
                : <FileText size={24} className="text-[var(--accent)]" aria-hidden="true" />}
              {aiOn && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-[#22c55e]" aria-hidden="true" />}
              {unread && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-surface bg-[#f59e0b]" aria-hidden="true" />}
            </span>
          </button>
        </div>
      )}

      {open && (
        <div
          id="ai-assistant-panel"
          ref={panelRef}
          role="dialog"
          aria-labelledby="ai-assistant-title"
          aria-describedby="ai-assistant-subtitle"
          tabIndex={-1}
          // Focus lands on the panel only so keyboard users start inside it; it is not a control, so no ring around the card.
          style={{ outline: 'none' }}
          className={panelShell}
        >
          {/* Header — fixed; only the body below scrolls */}
          <div className="flex shrink-0 items-center gap-2.5 bg-[var(--stm-navy)] px-3 py-2 text-white sm:gap-3 sm:px-4 sm:py-3">
            {aiOn ? <RobotAvatar size="md" /> : (
              <RobotAvatar size="md" icon={FileText} />
            )}
            <div className="min-w-0 flex-1">
              <h2 id="ai-assistant-title" className="truncate text-[15px] font-semibold leading-tight text-white">
                {aiOn ? 'STM AI Assistant' : 'STM Digital Library'}
              </h2>
              <p id="ai-assistant-subtitle" className="truncate text-xs text-white/75">
                {aiOn ? 'Your digital library guide' : 'Get a quote'}
              </p>
            </div>
            <button type="button" onClick={minimise} aria-label={aiOn ? 'Minimize assistant' : 'Minimize form'} className={headerBtn}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={close} aria-label={aiOn ? 'Close assistant' : 'Close form'} className={headerBtn}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Tabs — only while the assistant is on. Off, there is nothing to switch between. */}
          {aiOn && <div role="tablist" aria-label="Assistant panels" className="flex shrink-0 border-b border-rule bg-surface">
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
                onClick={() => (key === 'quote' ? openQuote() : setTab('chat'))}
                className={`flex-1 border-b-2 px-3 py-2 text-sm font-semibold sm:py-2.5 transition-colors focus:outline-none focus-visible:bg-[var(--stm-blue-soft)] ${
                  tab === key
                    ? 'border-[var(--stm-blue)] text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>}

          {activeTab === 'chat' && !statusLoaded ? (
            <div
              role="tabpanel"
              id="ai-assistant-panel-chat"
              aria-labelledby="ai-assistant-tab-chat"
              aria-busy="true"
              className="flex min-h-[200px] flex-1 items-center justify-center px-4 py-8 text-sm text-muted"
            >
              Loading…
            </div>
          ) : activeTab === 'chat' && showGate ? (
            /* The pre-chat gate: a name, and an email or a mobile number. The assistant does not answer before it. */
            <form
              role="tabpanel"
              id="ai-assistant-panel-chat"
              aria-labelledby="ai-assistant-tab-chat"
              onSubmit={submitDetails}
              noValidate
              className="flex min-h-0 flex-1 flex-col"
            >
              <div
                className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3 sm:space-y-3 sm:py-4"
                onFocus={(e) => {
                  // Keep the field being typed into in view when a phone keyboard takes half the screen.
                  const t = e.target as HTMLElement;
                  setTimeout(() => t.scrollIntoView?.({ block: 'nearest' }), 300);
                }}
              >
                <div>
                  <h3 className="text-base font-semibold text-ink">Before we begin</h3>
                  <p className="mt-0.5 text-sm leading-snug text-ink-2">
                    Please share your name and either your email address or mobile number to start the assistant.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="visitor-name" className="field-label">
                    Full Name <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="visitor-name"
                    ref={gateNameRef}
                    className="input"
                    value={details.name}
                    onChange={(e) => { setDetails({ ...details, name: e.target.value }); setServerErrors(({ name: _, ...rest }) => rest); }}
                    onBlur={() => setDetailsTouched(t => ({ ...t, name: true }))}
                    maxLength={VISITOR_LIMITS.name}
                    required
                    aria-required="true"
                    autoComplete="name"
                    aria-invalid={!!shownError('name')}
                    aria-describedby={shownError('name') ? 'visitor-name-error' : undefined}
                  />
                  {shownError('name') && <p id="visitor-name-error" className="field-error">{shownError('name')}</p>}
                </div>

                <div className="field">
                  <label htmlFor="visitor-email" className="field-label">Email Address</label>
                  <input
                    id="visitor-email"
                    type="email"
                    inputMode="email"
                    className="input"
                    value={details.email}
                    onChange={(e) => { setDetails({ ...details, email: e.target.value }); setServerErrors(({ email: _, contact: __, ...rest }) => rest); }}
                    onBlur={() => setDetailsTouched(t => ({ ...t, email: true }))}
                    maxLength={VISITOR_LIMITS.email}
                    autoComplete="email"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-invalid={!!(shownError('email') || contactError)}
                    aria-describedby={`visitor-contact-help${shownError('email') ? ' visitor-email-error' : ''}`}
                  />
                  {shownError('email') && <p id="visitor-email-error" className="field-error">{shownError('email')}</p>}
                </div>

                <div className="-my-0.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-rule" />or<span className="h-px flex-1 bg-rule" />
                </div>

                <div className="field">
                  <label htmlFor="visitor-phone" className="field-label">Mobile Number</label>
                  <input
                    id="visitor-phone"
                    type="tel"
                    inputMode="tel"
                    className="input"
                    value={details.phone}
                    onChange={(e) => { setDetails({ ...details, phone: e.target.value }); setServerErrors(({ phone: _, contact: __, ...rest }) => rest); }}
                    onBlur={() => setDetailsTouched(t => ({ ...t, phone: true }))}
                    maxLength={VISITOR_LIMITS.phoneRaw}
                    autoComplete="tel-national"
                    placeholder="98100 78958"
                    aria-invalid={!!(shownError('phone') || contactError)}
                    aria-describedby={`visitor-contact-help${shownError('phone') ? ' visitor-phone-error' : ''}`}
                  />
                  {shownError('phone') && <p id="visitor-phone-error" className="field-error">{shownError('phone')}</p>}
                  {contactError
                    ? <p id="visitor-contact-help" className="field-error">{contactError}</p>
                    : <p id="visitor-contact-help" className="field-help">Provide either email or mobile number.</p>}
                </div>
              </div>

              {/* Continue stays in reach, above the keyboard, however the form scrolls. */}
              <div className="shrink-0 space-y-2 border-t border-rule bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {detailsError && <p role="alert" className="field-error">{detailsError}</p>}
                <button
                  type="submit"
                  className={`btn btn-block ai-btn ${focusRing}`}
                  disabled={detailsSending}
                  aria-busy={detailsSending}
                >
                  {detailsSending ? 'Please wait…' : 'Continue to Assistant'}
                </button>
              </div>
            </form>
          ) : activeTab === 'chat' ? (
            <div
              role="tabpanel"
              id="ai-assistant-panel-chat"
              aria-labelledby="ai-assistant-tab-chat"
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Conversation — the only part that scrolls */}
              <div
                ref={logRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
              >
                {!hasConversation ? (
                  <div className="flex flex-col items-center text-center sm:pt-2">
                    <span className="hidden sm:block"><RobotAvatar size="md" welcome /></span>
                    {visitor?.firstName ? (
                      <p className="text-base font-semibold text-ink sm:mt-3">
                        Hello, {visitor.firstName}!<br />How can I help you today?
                      </p>
                    ) : (
                      <p className="text-base font-semibold text-ink sm:mt-3">Hello! How can I help you today?</p>
                    )}
                    <p className="mt-1 text-sm leading-snug text-ink-2 sm:leading-relaxed">Explore resources, subscriptions and institutional access.</p>
                    <div className="mt-3 grid w-full grid-cols-2 gap-2 sm:mt-5">
                      {QUICK_QUESTIONS.map(q => (
                        <button
                          key={q.label}
                          type="button"
                          className={quickButton}
                          onClick={() => sendMessage(q.question)}
                          disabled={sending || outOfQuestions}
                        >
                          <q.icon size={18} className="shrink-0 text-[var(--stm-blue-ink)]" aria-hidden="true" />
                          {q.label}
                        </button>
                      ))}
                      <button type="button" className={quickButton} onClick={openQuote}>
                        <FileText size={18} className="shrink-0 text-[var(--stm-blue-ink)]" aria-hidden="true" />
                        Get a quotation
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {messages.map(m => (
                      <li key={m.id} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && <RobotAvatar size="sm" />}
                        <div
                          className={`min-w-0 max-w-[82%] break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            m.role === 'user'
                              ? 'rounded-br-md bg-[var(--stm-blue)] text-[var(--accent-on)]'
                              : 'rounded-bl-md border border-rule bg-surface-2 text-ink'
                          }`}
                        >
                          <span className="sr-only">{m.role === 'user' ? 'You said: ' : 'Assistant: '}</span>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                          {m.action === 'quote' && (
                            <button type="button" onClick={openQuote} className={`btn btn-sm ai-btn mt-2 ${focusRing}`}>
                              Open Get a quote
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                    {sending && (
                      <li className="flex items-end gap-2" role="status">
                        <RobotAvatar size="sm" />
                        <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-rule bg-surface-2 px-3.5 py-3.5">
                          <span className="sr-only">The assistant is typing</span>
                          <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                          <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                          <span className="ai-typing-dot h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {failure && (
                <div role="alert" className="shrink-0 space-y-2 border-t border-rule bg-[var(--alarm-soft)] px-4 py-3">
                  <p className="text-sm font-semibold text-ink">
                    {failure.message ?? (failure.kind === 'timeout' ? 'That response is taking longer than expected.' : 'The assistant is temporarily unavailable.')}
                  </p>
                  <p className="text-xs text-ink-2">This did not use one of your questions.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`btn btn-sm ai-btn ${focusRing}`} onClick={() => sendMessage(failure.text, true)} disabled={sending}>Retry</button>
                    <Link to="/search" className="btn btn-ghost btn-sm" onClick={minimise}>Search Library</Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={openQuote}>Get a quote</button>
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
                  <button type="button" className={`btn btn-block ai-btn ${focusRing}`} onClick={openQuote}>
                    Continue with your details
                  </button>
                </div>
              ) : quota && quota.remaining <= 0 ? (
                <p className="shrink-0 border-t border-rule px-4 py-3 text-sm text-ink-2">
                  You have reached the hourly limit for questions. You can still use Get a quote or reach our team on{' '}
                  <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--stm-blue-ink)] hover:underline">WhatsApp</a>.
                </p>
              ) : (
                <div className="shrink-0 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)]">
                  {quota && quota.tier === 'anonymous' && (
                    <p className="px-4 pt-2 text-xs text-muted" aria-live="polite">
                      {quota.remaining === 1 ? '1 complimentary question remaining' : `${quota.remaining} of ${quota.limit} complimentary questions remaining`}
                    </p>
                  )}
                  <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(draft); }}
                    className="flex items-end gap-2 px-3 pb-1 pt-2.5"
                  >
                    <label htmlFor="ai-assistant-input" className="sr-only">
                      Type your question
                    </label>
                    <textarea
                      id="ai-assistant-input"
                      ref={inputRef}
                      rows={1}
                      className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5 leading-snug"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter sends; Shift+Enter is a new line; Enter that finishes an IME composition is not a send.
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          sendMessage(draft);
                        }
                      }}
                      onFocus={() => {
                        // Best-effort against mobile keyboards that do not resize the visual viewport.
                        setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest' }), 300);
                      }}
                      placeholder="Type your question..."
                      maxLength={1000}
                      autoComplete="off"
                      aria-describedby="ai-assistant-disclaimer"
                    />
                    <button
                      type="submit"
                      className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl ai-btn transition-colors disabled:cursor-not-allowed ${focusRing}`}
                      disabled={sending || !draft.trim()}
                      aria-label="Send message"
                    >
                      <SendHorizonal size={18} aria-hidden="true" />
                    </button>
                  </form>
                  <p id="ai-assistant-disclaimer" className="px-4 pb-2.5 pt-1 text-center text-[11px] text-muted">
                    AI responses may need verification.
                  </p>
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
                      className={`btn ai-btn ${focusRing}`}
                      onClick={() => { setTab('chat'); setTimeout(() => inputRef.current?.focus(), 60); }}
                    >
                      Return to assistant
                    </button>
                    <Link to="/search" className="btn btn-ghost" onClick={minimise}>Search the library</Link>
                    <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">WhatsApp</a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeadSent(false)}
                    className="mt-4 text-sm font-semibold text-[var(--stm-blue-ink)] hover:underline"
                  >
                    Send another request
                  </button>
                </>
              ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <a href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className={`btn ai-btn ${focusRing}`}>WhatsApp</a>
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
              <div ref={quoteBodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
                {quotaSpent && quota ? (
                  /* Arrived here because the free questions ran out: say so, briefly. */
                  <div className="rounded-xl border border-rule bg-surface-2 p-3.5">
                    <h3 className="text-sm font-semibold text-ink">Continue with our team</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">
                      You&rsquo;ve used your {quota.limit} complimentary AI questions. Share your details and we&rsquo;ll help with subscriptions, demonstrations, quotations, or academic content access.
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-base font-semibold text-ink">Continue with our team</h3>
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
                  className={`btn btn-block ai-btn ${focusRing}`}
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
