import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X, Check, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  
  const [preferences, setPreferences] = useState({
    essential: true, // Always true
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      // Small delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
    window.dispatchEvent(new Event('cookie-consent-saved'));
  };

  const handleSavePreferences = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      ...preferences,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
    window.dispatchEvent(new Event('cookie-consent-saved'));
  };

  const handleRejectAll = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      essential: true, // Essential is always required
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
    window.dispatchEvent(new Event('cookie-consent-saved'));
  };

  // The notice sits along the bottom of the screen; the floating WhatsApp and
  // Feedback buttons step up over it rather than covering its buttons.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!isVisible || !boxRef.current) return;
    const set = () => root.style.setProperty('--cookie-offset', `${boxRef.current?.offsetHeight ?? 0}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(boxRef.current);
    return () => { ro.disconnect(); root.style.removeProperty('--cookie-offset'); };
  }, [isVisible, showPreferences]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={boxRef}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-3 sm:p-4 pointer-events-none"
        >
          <section
            aria-labelledby="cookie-title"
            className="mx-auto max-w-4xl max-h-[calc(100dvh-24px)] overflow-y-auto rounded-xl border border-rule bg-surface text-ink shadow-[var(--shadow-modal)] pointer-events-auto"
          >
            {!showPreferences ? (
              <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
                <div className="flex flex-1 items-start gap-3">
                  <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent sm:flex" aria-hidden="true">
                    <Cookie size={18} />
                  </span>
                  <div>
                    <h2 id="cookie-title" className="text-base font-semibold text-ink">We value your privacy</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                      We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.
                      By clicking "Accept All", you consent to our use of cookies in accordance with the DPDP Act and GDPR guidelines.
                      <Link to="/privacy-policy" className="ml-1 font-medium text-accent underline underline-offset-2 hover:text-accent-hover">Read our Privacy Policy.</Link>
                    </p>
                  </div>
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-row-reverse sm:flex-wrap lg:flex-nowrap">
                  <button type="button" onClick={handleAcceptAll} className="btn btn-brand col-span-2">Accept All</button>
                  <button type="button" onClick={handleRejectAll} className="btn btn-outline">Reject All</button>
                  <button type="button" onClick={() => setShowPreferences(true)} className="btn btn-outline">Preferences</button>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Shield className="text-accent" size={20} aria-hidden="true" />
                    <h2 id="cookie-title" className="text-lg font-semibold text-ink">Privacy Preferences</h2>
                  </div>
                  <button type="button" onClick={() => setShowPreferences(false)} aria-label="Back to the cookie notice" className="btn btn-ghost btn-sm btn-icon">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className="mb-5 space-y-2">
                  <PreferenceRow
                    title="Strictly Necessary Cookies"
                    body="These cookies are essential for the website to function properly and cannot be disabled. They include security and session management."
                    checked locked
                  />
                  <PreferenceRow
                    title="Analytics Cookies"
                    body="Help us understand how visitors interact with the website by collecting and reporting information anonymously."
                    checked={preferences.analytics}
                    onToggle={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}
                  />
                  <PreferenceRow
                    title="Marketing Cookies"
                    body="Used to track visitors across websites. The intention is to display ads that are relevant and engaging for the individual user."
                    checked={preferences.marketing}
                    onToggle={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}
                  />
                </div>

                <div className="flex justify-end border-t border-rule pt-4">
                  <button type="button" onClick={handleSavePreferences} className="btn btn-brand">
                    <Check size={16} aria-hidden="true" /> Save Preferences
                  </button>
                </div>
              </div>
            )}
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** One cookie category: what it is for, and a real switch a keyboard can reach. */
function PreferenceRow({ title, body, checked, locked, onToggle }: {
  title: string; body: string; checked: boolean; locked?: boolean; onToggle?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-rule bg-surface-2 p-3.5">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {locked && <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Required</span>}
        <button
          type="button" role="switch" aria-checked={checked} aria-label={title} disabled={locked} onClick={onToggle}
          className={`flex h-6 w-11 items-center rounded-full p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'justify-end bg-accent' : 'justify-start bg-rule-2'}`}
        >
          <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
        </button>
      </div>
    </div>
  );
}
