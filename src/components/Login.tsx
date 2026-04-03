import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Mail, Lock, ArrowRight } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-hot-toast";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Logged in successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <BookOpen size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">STM Library</span>
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
                <Link to="/forgot-password" title="Forgot Password?" className="text-xs font-bold text-blue-600 hover:text-blue-700">Forgot?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
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
              Don't have an account? <Link to="/signup" className="font-bold text-blue-600 hover:text-blue-700">Sign up for free</Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/institutional-access" className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600">
            Institutional Login via IP / Shibboleth
          </Link>
        </div>
      </div>
    </div>
  );
}
