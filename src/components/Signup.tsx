import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Mail, Lock, User, Building, ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

import { EmailVerificationInput } from "./EmailVerificationInput";

export function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    contact: '',
    designation: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const proceedWithSignup = async () => {
    setLoading(true);
    try {
      await signup(formData.email, formData.password, formData.name, formData.organization, formData.contact, formData.designation);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.name) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      toast.error('You must agree to the Terms of Service and Privacy Policy to continue');
      return;
    }

    setLoading(true);
    try {
      await proceedWithSignup();
    } catch (error: any) {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-3 mb-8">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-12 w-12 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold tracking-tight text-slate-900">STM Library</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mt-1">Digital Access</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Create Your Account</h1>
          <p className="mt-2 text-sm text-slate-500">Join thousands of researchers worldwide</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <form className="space-y-5" onSubmit={handleSignup}>
            <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <EmailVerificationInput
                value={formData.email}
                onChange={(email) => setFormData({ ...formData, email })}
                onVerified={setIsEmailVerified}
              />
            </div>
            
            <div className={`space-y-5 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required={isEmailVerified}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Dr. John Doe"
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Organization / University *</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  required={isEmailVerified}
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  placeholder="Harvard University"
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Contact Number *</label>
              <div className="relative">
                <input 
                  type="tel" 
                  required={isEmailVerified}
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Designation / Role *</label>
              <div className="relative">
                <input 
                  type="text" 
                  required={isEmailVerified}
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Researcher, Student, Professor"
                  disabled={!isEmailVerified}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    required={isEmailVerified}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    disabled={!isEmailVerified}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>
            
            <div className={`pt-2 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-slate-600 leading-snug">
                    I explicitly consent and agree to the <Link to="/terms-and-conditions" className="font-bold text-blue-600 hover:underline">Terms of Service</Link>.
                  </span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="pt-0.5">
                    <input 
                      type="checkbox" 
                      checked={acceptedPrivacy}
                      onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-slate-600 leading-snug">
                    I explicitly consent to the collection, processing, and storage of my personal data as described in the <Link to="/privacy-policy" className="font-bold text-blue-600 hover:underline">Privacy Policy</Link> (in compliance with GDPR and DPDP Act).
                  </span>
                </label>
              </div>
              <button 
                type="submit"
                disabled={loading || !isEmailVerified || !acceptedTerms || !acceptedPrivacy}
                className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Account...' : 'Create Account'} <ArrowRight size={16} />
              </button>
            </div>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Already have an account? <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
