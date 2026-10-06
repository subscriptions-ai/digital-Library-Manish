import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MailWarning, X, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { EmailVerificationInput } from '../EmailVerificationInput';
import { toast } from 'react-hot-toast';
import { Button } from '../ui';

export function EmailVerificationPopup() {
  const { profile, fetchProfile } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerificationRequired, setIsVerificationRequired] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/public/settings')
      .then(res => res.json())
      .then(data => {
        setIsVerificationRequired(data.emailVerificationEnabled !== false);
      })
      .catch(() => setIsVerificationRequired(true));
  }, []);

  useEffect(() => {
    if (isVerificationRequired === null || isVerificationRequired === false) return;

    // Only show if user is logged in and email is NOT verified
    if (!profile || profile.isEmailVerified === undefined || profile.isEmailVerified === true) {
      return;
    }

    // Check localStorage for snooze
    const snoozedUntil = localStorage.getItem('email-verify-snooze');
    if (snoozedUntil) {
      const snoozeTime = new Date(snoozedUntil).getTime();
      if (Date.now() < snoozeTime) {
        return; // Still snoozed
      }
    }

    // Small delay before showing popup
    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [profile, isVerificationRequired]);

  const snooze = (hours: number) => {
    const time = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    localStorage.setItem('email-verify-snooze', time);
    setIsVisible(false);
    toast.success(`Reminder snoozed for ${hours === 24 ? 'tomorrow' : hours + ' hour(s)'}`);
  };

  // The popup can already be closed with its X, so Escape does the same.
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsVisible(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVisible]);

  const handleVerified = async (verified: boolean) => {
    if (verified) {
      // Re-fetch profile to update context
      await fetchProfile();
      toast.success('Thank you for verifying your email!');
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-6">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-verify-title"
            aria-describedby="email-verify-desc"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-2xl"
          >
            <div className="relative flex shrink-0 flex-col items-center border-b border-rule bg-caution-soft p-6 text-center">
              <button 
                type="button"
                onClick={() => setIsVisible(false)}
                aria-label="Close"
                className="btn btn-ghost btn-icon btn-sm absolute right-3 top-3 text-ink-2"
              >
                <X size={18} aria-hidden="true" />
              </button>
              
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-caution" aria-hidden="true">
                <MailWarning size={24} />
              </div>
              <h2 id="email-verify-title" className="mb-2 type-card-title text-ink">Verify Your Email</h2>
              <p id="email-verify-desc" className="text-sm text-ink-2">
                We noticed your email address <strong>{profile?.email}</strong> is not verified yet. Please verify it to ensure you don't lose access to your account.
              </p>
            </div>

            <div className="space-y-6 overflow-y-auto p-6">
              {isVerifying ? (
                <div className="space-y-4">
                  <EmailVerificationInput 
                    value={profile?.email || ''}
                    onChange={() => {}} // Readonly
                    onVerified={handleVerified}
                  />
                  <Button variant="ghost" block onClick={() => setIsVerifying(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button size="lg" block onClick={() => setIsVerifying(true)} autoFocus>
                    Verify Email Now
                  </Button>
                  
                  <div className="grid grid-cols-1 gap-3 pt-2 min-[400px]:grid-cols-2">
                    <Button variant="outline" onClick={() => snooze(1)}>
                      <Clock size={16} aria-hidden="true" />
                      <span className="truncate">Remind in 1 Hour</span>
                    </Button>
                    <Button variant="outline" onClick={() => snooze(24)}>
                      <Calendar size={16} aria-hidden="true" />
                      <span className="truncate">Remind Tomorrow</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
