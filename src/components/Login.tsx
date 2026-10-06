import React, { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertTriangle, Building2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";
import { Button, Dialog, friendlyError } from "./ui";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Set when the server says this account is already signed in elsewhere.
  const [sessionElsewhere, setSessionElsewhere] = useState(false);

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { login, profile } = useAuth();

  // Left by the global fetch guard when a revoked or expired session sent us here.
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem('sessionEnded')) {
        sessionStorage.removeItem('sessionEnded');
        toast.error('Your session has ended. Please sign in again.');
      }
    } catch { /* storage unavailable — the redirect itself is the message */ }
  }, []);

  const handleLogin = async (e: React.FormEvent, replaceExisting = false) => {
    e.preventDefault();
    setSessionElsewhere(false);
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email, password, replaceExisting);
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
      if (error?.code === 'ACTIVE_SESSION_EXISTS') setSessionElsewhere(true);
      else toast.error(friendlyError(error, 'We could not sign you in. Please check your email and password and try again.'));
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
      } else if (role === 'ContentManager') {
        // The editor writes the blog and does nothing else here; the admin
        // dashboard would only bounce them.
        navigate('/studio');
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
      toast.error(friendlyError(err, 'We could not send the OTP. Please try again.'));
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
      toast.error(friendlyError(err, 'We could not reset your password. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  // Stable, because the Dialog re-runs its focus handling whenever onClose
  // changes — an inline arrow would move focus away on every keystroke.
  const closeForgotModal = useCallback(() => setShowForgotModal(false), []);

  return (
    // The public layout already supplies the header and footer, so the page
    // only needs a little top padding: a min-h-screen + vertical centring
    // here pushed the card hundreds of pixels down the page.
    <div className="bg-ground px-4 pt-6 pb-12 sm:pt-12 lg:pt-16">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="mb-6 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-3">
            <img src="/logo.png" alt="STM Digital Library Logo" className="h-10 w-10 object-contain" />
            <div className="flex flex-col text-left leading-none">
              <span className="text-lg font-bold tracking-tight text-ink">STM Library</span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-widest text-accent">Digital Access</span>
            </div>
          </Link>
          <h1 className="type-page-title text-ink">Welcome Back</h1>
          <p className="mt-2 text-sm text-muted">Enter your credentials to access your account</p>
        </div>

        <div className="card card-pad sm:p-8">
          <form className="space-y-5" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="login-email" className="field-label">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="input h-11 pl-10"
                />
              </div>
            </div>
            <div className="field">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="field-label">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm font-semibold text-accent hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="input h-11 pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {sessionElsewhere && (
              <div role="alert" className="rounded-lg border border-caution/30 bg-caution-soft p-4 text-sm text-ink-2">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <AlertTriangle size={16} className="shrink-0 text-caution" aria-hidden="true" />
                  Already signed in elsewhere
                </p>
                <p className="mt-1">This account is already signed in on another device or browser. Please sign out from the active session before signing in here.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  loading={loading}
                  onClick={(e) => handleLogin(e as any, true)}
                >
                  Sign out the other session and sign in here
                </Button>
                <p className="mt-2 text-xs text-muted">Uses the password you entered above.</p>
              </div>
            )}
            <Button type="submit" variant="brand" size="lg" block loading={loading}>
              {loading ? 'Signing In...' : <>Sign In <ArrowRight size={16} aria-hidden="true" /></>}
            </Button>
          </form>

          <div className="mt-6 border-t border-rule pt-6 text-center">
            <p className="text-sm text-muted">
              Don't have an account? <Link to="/signup" className="font-semibold text-accent hover:underline">Create an account</Link>
            </p>
          </div>
        </div>

        {/* Institutional access is a separate route (IP range / Shibboleth),
            so it sits below the card as a quiet secondary option. */}
        <div className="mt-4 rounded-xl border border-rule bg-surface p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
              <Building2 size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Institutional access</p>
              <p className="mt-1 text-sm text-muted">Reading through your university or library? Access is available via IP range or Shibboleth.</p>
              <Link to="/institutional-access" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Institutional login options <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          Need help signing in? <Link to="/contact" className="font-semibold text-accent hover:underline">Contact support</Link>
        </p>

        {/* Forgot Password Modal */}
        <Dialog
          open={showForgotModal}
          onClose={closeForgotModal}
          title="Reset Password"
          description={forgotStep === 1
            ? 'Enter your registered email address to receive a 6-digit OTP for password reset.'
            : <>An OTP has been sent to <strong className="text-ink">{forgotEmail}</strong>. Please enter it below along with your new password.</>}
        >
          {forgotStep === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="field">
                <label htmlFor="forgot-email" className="field-label">Email Address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@university.edu"
                    className="input h-11 pl-10"
                  />
                </div>
              </div>
              <Button type="submit" variant="brand" block loading={forgotLoading}>
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="field">
                <label htmlFor="forgot-otp" className="field-label">6-Digit OTP</label>
                <input
                  id="forgot-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="input h-12 text-center text-lg font-semibold tracking-[0.5em]"
                />
              </div>
              <div className="field">
                <label htmlFor="forgot-new-password" className="field-label">New Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={18} aria-hidden="true" />
                  <input
                    id="forgot-new-password"
                    type={showForgotNewPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="input h-11 pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                    aria-label={showForgotNewPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showForgotNewPassword}
                    className="btn btn-ghost btn-sm btn-icon absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
                  >
                    {showForgotNewPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
                <p className="field-help">Use at least 8 characters.</p>
              </div>
              <Button type="submit" variant="brand" block loading={forgotLoading}>
                Reset Password
              </Button>
            </form>
          )}
        </Dialog>
      </div>
    </div>
  );
}
