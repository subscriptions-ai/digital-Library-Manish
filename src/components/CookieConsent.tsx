import React, { useState, useEffect } from 'react';
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
  };

  const handleSavePreferences = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      ...preferences,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
  };

  const handleRejectAll = () => {
    localStorage.setItem('cookie-consent', JSON.stringify({
      essential: true, // Essential is always required
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 150, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 150, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[100] p-4 sm:p-6 pointer-events-none"
        >
          <div className="max-w-5xl mx-auto bg-slate-900 text-slate-200 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto border border-slate-700/50 backdrop-blur-xl">
            {!showPreferences ? (
              <div className="p-6 md:p-8 flex flex-col lg:flex-row items-center gap-8">
                <div className="flex-1 flex gap-5 items-start">
                  <div className="h-12 w-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center shrink-0">
                    <Cookie size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight mb-2">We value your privacy</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
                      By clicking "Accept All", you consent to our use of cookies in accordance with the DPDP Act and GDPR guidelines.
                      <Link to="/privacy-policy" className="text-indigo-400 hover:text-indigo-300 font-medium ml-1 underline underline-offset-2">Read our Privacy Policy.</Link>
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 shrink-0 lg:flex-col lg:items-stretch w-full lg:w-auto">
                  <button 
                    onClick={handleAcceptAll}
                    className="flex-1 lg:flex-none px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                  >
                    Accept All
                  </button>
                  <div className="flex gap-3 w-full lg:w-auto">
                    <button 
                      onClick={() => setShowPreferences(true)}
                      className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all active:scale-95 border border-slate-700"
                    >
                      Preferences
                    </button>
                    <button 
                      onClick={handleRejectAll}
                      className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all active:scale-95 border border-slate-700"
                    >
                      Reject All
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Shield className="text-indigo-400" size={24} />
                    <h3 className="text-xl font-bold text-white">Privacy Preferences</h3>
                  </div>
                  <button 
                    onClick={() => setShowPreferences(false)}
                    className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-4 mb-8">
                  {/* Essential */}
                  <div className="flex items-start justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <div className="pr-8">
                      <h4 className="font-bold text-slate-200 mb-1">Strictly Necessary Cookies</h4>
                      <p className="text-xs text-slate-400">These cookies are essential for the website to function properly and cannot be disabled. They include security and session management.</p>
                    </div>
                    <div className="shrink-0 pt-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Required</span>
                      <div className="w-11 h-6 bg-indigo-600 rounded-full flex items-center p-1 justify-end cursor-not-allowed opacity-50">
                        <div className="w-4 h-4 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </div>

                  {/* Analytics */}
                  <div className="flex items-start justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
                       onClick={() => setPreferences(p => ({ ...p, analytics: !p.analytics }))}>
                    <div className="pr-8">
                      <h4 className="font-bold text-slate-200 mb-1">Analytics Cookies</h4>
                      <p className="text-xs text-slate-400">Help us understand how visitors interact with the website by collecting and reporting information anonymously.</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${preferences.analytics ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'}`}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                      </div>
                    </div>
                  </div>

                  {/* Marketing */}
                  <div className="flex items-start justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
                       onClick={() => setPreferences(p => ({ ...p, marketing: !p.marketing }))}>
                    <div className="pr-8">
                      <h4 className="font-bold text-slate-200 mb-1">Marketing Cookies</h4>
                      <p className="text-xs text-slate-400">Used to track visitors across websites. The intention is to display ads that are relevant and engaging for the individual user.</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${preferences.marketing ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'}`}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button 
                    onClick={handleSavePreferences}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                  >
                    <Check size={18} /> Save Preferences
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
