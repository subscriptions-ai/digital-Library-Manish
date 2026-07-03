import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
        toast.error(data.error || 'Failed to check email');
      }
    } catch (err) {
      toast.error('Network error');
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
        toast.error(data.error || 'Invalid OTP');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="email" 
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={(isVerified && isVerificationRequired) || showOtp}
            placeholder={placeholder}
            className={`w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 transition-all ${(isVerified && isVerificationRequired) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'focus:bg-white'}`}
          />
        </div>
        {isVerificationRequired && (
          <>
            {!isVerified && !showOtp && (
              <button
                type="button"
                onClick={checkEmail}
                disabled={isChecking || !value}
                className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 shrink-0 transition-all h-[46px]"
              >
                {isChecking ? <Loader2 className="animate-spin" size={16} /> : 'Verify'}
              </button>
            )}
            {isVerified && (
              <div className="px-4 py-3 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-bold flex items-center gap-2 shrink-0 h-[46px]">
                <CheckCircle size={18} /> Already Verified
              </div>
            )}
          </>
        )}
      </div>

      {showOtp && !isVerified && (
        <div className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-medium text-blue-800">Enter the 6-digit OTP sent to your email.</p>
            <button 
              type="button" 
              onClick={() => setShowOtp(false)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Change Email
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center tracking-[0.5em] font-bold outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={verifyOtp}
              disabled={isChecking || otp.length !== 6}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isChecking ? <Loader2 className="animate-spin" size={16} /> : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
