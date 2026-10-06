import React, { useState, useEffect, useId } from 'react';
import { Mail, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, friendlyError } from './ui';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onVerified: (verified: boolean) => void;
  label?: string;
  placeholder?: string;
}

export function EmailVerificationInput({ 
  value, 
  onChange, 
  onVerified, 
  label = "Email Address", 
  placeholder = "name@domain.com" 
}: Props) {
  const [isVerified, setIsVerified] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerificationRequired, setIsVerificationRequired] = useState(true);
  // Ids for the label and OTP field; this input appears on more than one form.
  const uid = useId();

  // Fetch settings to check if email verification is enabled globally
  useEffect(() => {
    fetch('/api/public/settings')
      .then(res => res.json())
      .then(data => {
        if (data.emailVerificationEnabled === false) {
          setIsVerificationRequired(false);
          onVerified(true);
        }
      })
      .catch(() => {});
  }, []);

  // Whenever value changes, reset verification status if it was verified
  useEffect(() => {
    if (!isVerificationRequired) {
      onVerified(true);
      return;
    }
    if (isVerified) {
      setIsVerified(false);
      onVerified(false);
      setShowOtp(false);
    }
  }, [value, isVerificationRequired]);

  const checkEmail = async () => {
    if (!value || !value.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    setIsChecking(true);
    try {
      const res = await fetch('/api/verify/check-or-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value })
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setIsVerified(true);
        onVerified(true);
        setShowOtp(false);
      } else if (res.ok && data.otpSent) {
        setShowOtp(true);
        toast.success('OTP sent to your email');
      } else {
        toast.error(friendlyError(data?.error, 'We could not check this email address. Please try again.'));
      }
    } catch (err) {
      toast.error(friendlyError(err, 'We could not reach the server. Check your connection and try again.'));
    } finally {
      setIsChecking(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsChecking(true);
    try {
      const res = await fetch('/api/verify/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, otp })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsVerified(true);
        onVerified(true);
        setShowOtp(false);
        toast.success('Email verified successfully!');
      } else {
        toast.error(friendlyError(data?.error, 'That OTP is not valid. Please check it and try again.'));
      }
    } catch (err) {
      toast.error(friendlyError(err, 'We could not reach the server. Check your connection and try again.'));
    } finally {
      setIsChecking(false);
    }
  };

  const verifiedLocked = isVerified && isVerificationRequired;

  return (
    <div className="field">
      <label htmlFor={`${uid}-email`} className="field-label">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Mail className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${verifiedLocked ? 'text-success' : 'text-faint'}`} size={18} aria-hidden="true" />
          <input
            id={`${uid}-email`}
            type="email"
            required
            autoComplete="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={verifiedLocked || showOtp}
            placeholder={placeholder}
            className={`input h-11 pl-10 ${verifiedLocked ? 'border-success/40 bg-success-soft text-ink' : ''}`}
          />
        </div>
        {isVerificationRequired && (
          <>
            {!isVerified && !showOtp && (
              <Button
                variant="brand"
                onClick={checkEmail}
                loading={isChecking}
                disabled={!value}
                className="h-11 shrink-0"
              >
                Verify
              </Button>
            )}
            {isVerified && (
              <span role="status" className="badge badge-success h-11 shrink-0 justify-center gap-2 rounded-lg px-4 text-sm">
                <CheckCircle size={16} aria-hidden="true" /> Already Verified
              </span>
            )}
          </>
        )}
      </div>

      {showOtp && !isVerified && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${uid}-otp`} className="text-sm font-medium text-ink-2">Enter the 6-digit OTP sent to your email.</label>
            <button
              type="button"
              onClick={() => setShowOtp(false)}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Change Email
            </button>
          </div>
          <div className="flex gap-2">
            <input
              id={`${uid}-otp`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="input h-11 min-w-0 flex-1 text-center text-lg font-semibold tracking-[0.5em]"
            />
            <Button
              variant="brand"
              onClick={verifyOtp}
              loading={isChecking}
              disabled={otp.length !== 6}
              className="h-11 shrink-0"
            >
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
