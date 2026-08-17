import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Mail, Lock, ArrowRight, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { login, profile } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      // login updates the profile in context, but for immediate redirection 
      // we might need to rely on what the context will have. 
      // However, we can also just wait for the profile to be updated or use the return from login if we modified it.
      // Since login in AuthContext doesn't return the profile yet, let's just re-fetch it or assume success.
      // Actually, let's update Login with a small delay or use the profile after state update.
      // Better yet, let's make login return the user profile.
      toast.success('Logged in successfully!');
      // Redirection will be handled by the useEffect or just navigate here 
      // but we need the role. Let's assume we can navigate to /dashboard 
      // and it will redirect if admin. Or better, check current profile if available.
    } catch (error: any) {
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  // Effect to navigate after login
  React.useEffect(() => {
    if (profile) {
      const role = profile.role;
      if (role === 'SuperAdmin' || role === 'Admin') {
        navigate('/admin');
      } else if (role === 'SubscriptionManager') {
        navigate('/manager');
      } else if (role === 'Institution') {
        navigate('/institution');
      } else if (role === 'SalesExecutive' || role === 'SalesManager') {
        navigate('/sales');
      } else if (role === 'Publisher') {
        navigate('/publisher');
      } else {
        // Student, Subscriber, Normal User → shared dashboard
        navigate('/dashboard');
      }
    }
  }, [profile, navigate]);

  const handleForgotPassword = async () => {
    setShowForgotModal(true);
    setForgotStep(1);
    setForgotEmail(email);
    setForgotOtp('');
    setForgotNewPassword('');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      toast.error('Please enter your email');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      toast.success(data.message);
      setForgotStep(2);
    } catch (err: any) {
      toast.error(err.message || 'Network error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp || forgotOtp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    if (forgotNewPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword: forgotNewPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      toast.success(data.message);
      setShowForgotModal(false);
      setPassword(''); // Clear current password field
    } catch (err: any) {
      toast.error(err.message || 'Network error');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-3 mb-8">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-12 w-12 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-xl font-bold tracking-tight text-slate-900">STM Library</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mt-1">Digital Access</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your credentials to access your account</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-slate-700">Password</label>
                <button 
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-4 text-sm font-bold text-white hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'} <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Don't have an account? <Link to="/signup" className="font-bold text-blue-600 hover:text-blue-700">Create an account</Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/institutional-access" className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600">
            Institutional Login via IP / Shibboleth
          </Link>
        </div>

        {/* Forgot Password Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Reset Password</h3>
                <button onClick={() => setShowForgotModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                {forgotStep === 1 ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <p className="text-sm text-slate-600">Enter your registered email address to receive a 6-digit OTP for password reset.</p>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="email" 
                          required
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="name@university.edu"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {forgotLoading ? <Loader2 className="animate-spin" size={16} /> : 'Send OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <p className="text-sm text-slate-600">An OTP has been sent to <strong>{forgotEmail}</strong>. Please enter it below along with your new password.</p>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">6-Digit OTP</label>
                      <input 
                        type="text" 
                        required
                        maxLength={6}
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center tracking-[0.5em] font-bold outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type={showForgotNewPassword ? "text" : "password"} 
                          required
                          minLength={8}
                          value={forgotNewPassword}
                          onChange={(e) => setForgotNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm outline-none focus:border-blue-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showForgotNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                    >
                      {forgotLoading ? <Loader2 className="animate-spin" size={16} /> : 'Reset Password'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
