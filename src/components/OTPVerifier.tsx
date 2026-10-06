import React, { useState } from 'react';
import { Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, friendlyError } from './ui';

interface OTPVerifierProps {
  email: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OTPVerifier({ email, isOpen, onClose, onSuccess }: OTPVerifierProps) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verify/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        onSuccess();
      } else {
        setError(friendlyError(data?.error, 'That OTP is not valid. Please check it and try again.'));
      }
    } catch (err) {
      setError(friendlyError(err, 'We could not reach the server. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/60 p-4 pt-10 backdrop-blur-sm sm:items-center sm:pt-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-verifier-title"
          aria-describedby="otp-verifier-desc"
          className="w-full max-w-md rounded-2xl border border-rule bg-surface p-6 shadow-2xl sm:p-8"
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
            <Mail size={28} />
          </div>

          <h2 id="otp-verifier-title" className="mb-2 text-center text-xl font-bold text-ink">Verify Your Email</h2>
          <p id="otp-verifier-desc" className="mb-6 text-center text-sm text-muted">
            We've sent a 6-digit OTP to <strong className="break-all text-ink">{email}</strong>. Please enter it below to continue.
          </p>

          <form onSubmit={handleVerify} className="space-y-5">
            <div className="field">
              <label htmlFor="otp-verifier-code" className="field-label">6-digit OTP</label>
              <input
                id="otp-verifier-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'otp-verifier-error' : undefined}
                className="input h-14 text-center text-2xl font-bold tracking-[0.5em]"
                required
              />
            </div>

            {error && (
              <p id="otp-verifier-error" role="alert" className="flex items-start gap-2 rounded-lg bg-alarm-soft p-3 text-sm text-alarm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                variant="outline"
                size="lg"
                block
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="brand"
                size="lg"
                block
                loading={loading}
                disabled={otp.length !== 6}
              >
                {loading ? 'Verifying...' : <>Verify OTP <ArrowRight size={16} aria-hidden="true" /></>}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
