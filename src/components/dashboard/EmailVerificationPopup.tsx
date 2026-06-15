import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MailWarning, X, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { EmailVerificationInput } from '../EmailVerificationInput';
import { toast } from 'react-hot-toast';

export function EmailVerificationPopup() {
  const { profile, checkAuth } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
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
  }, [profile]);

  const snooze = (hours: number) => {
    const time = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    localStorage.setItem('email-verify-snooze', time);
    setIsVisible(false);
    toast.success(`Reminder snoozed for ${hours === 24 ? 'tomorrow' : hours + ' hour(s)'}`);
  };

  const handleVerified = async (verified: boolean) => {
    if (verified) {
      // Re-fetch profile to update context
      await checkAuth();
      toast.success('Thank you for verifying your email!');
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-amber-100"
          >
            <div className="bg-amber-50 p-6 flex flex-col items-center text-center relative border-b border-amber-100">
              <button 
                onClick={() => setIsVisible(false)}
                className="absolute top-4 right-4 p-2 text-amber-600 hover:bg-amber-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                <MailWarning size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Verify Your Email</h3>
              <p className="text-sm text-slate-600 mb-2">
                We noticed your email address <strong>{profile?.email}</strong> is not verified yet. Please verify it to ensure you don't lose access to your account.
              </p>
            </div>

            <div className="p-6 space-y-6">
              {isVerifying ? (
                <div className="space-y-4">
                  <EmailVerificationInput 
                    value={profile?.email || ''}
                    onChange={() => {}} // Readonly
                    onVerified={handleVerified}
                  />
                  <button 
                    onClick={() => setIsVerifying(false)}
                    className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button 
                    onClick={() => setIsVerifying(true)}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20"
                  >
                    Verify Email Now
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => snooze(1)}
                      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-800 transition-colors"
                    >
                      <Clock size={16} />
                      <span className="text-xs font-bold">Remind in 1 Hour</span>
                    </button>
                    <button 
                      onClick={() => snooze(24)}
                      className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-800 transition-colors"
                    >
                      <Calendar size={16} />
                      <span className="text-xs font-bold">Remind Tomorrow</span>
                    </button>
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
