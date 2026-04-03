import { LayoutDashboard, BookOpen, Users, Settings, BarChart3, Bell, Search, LogOut, ChevronRight, FileText, CreditCard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "react-hot-toast";

export function Dashboard() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { profile, logout, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    
    if (profile) {
      const fetchData = async () => {
        try {
          setUserProfile(profile);

          // Fetch user quotations
          const qQuotations = query(collection(db, 'quotations'), where('userId', '==', profile.uid));
          const querySnapshot = await getDocs(qQuotations);
          setQuotations(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          // Fetch user subscriptions
          const qSubs = query(collection(db, 'subscriptions'), where('userId', '==', profile.uid));
          const subSnapshot = await getDocs(qSubs);
          setSubscriptions(subSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          // Fetch user submissions
          const qSubmissions = query(collection(db, 'submissions'), where('userId', '==', profile.uid));
          const submissionSnapshot = await getDocs(qSubmissions);
          setSubmissions(submissionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        } catch (error) {
          console.error("Error fetching dashboard data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      navigate('/login');
    }
  }, [profile, authLoading, navigate]);

  const handleSignOut = async () => {
    try {
      logout();
      toast.success('Signed out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white hidden lg:flex flex-col">
        <div className="p-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500 text-white">
              <BookOpen size={18} />
            </div>
            <span className="font-bold tracking-tight">STM Dashboard</span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[
            { icon: LayoutDashboard, label: "Overview", active: true },
            { icon: BookOpen, label: "My Library" },
            { icon: FileText, label: "My Quotations" },
            { icon: CreditCard, label: "Billing" },
            { icon: Bell, label: "Notifications" },
            { icon: Settings, label: "Settings" }
          ].map((item, i) => (
            <button key={i} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${item.active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <Search size={18} className="text-slate-400" />
            <input type="text" placeholder="Search in your library..." className="bg-transparent text-sm outline-none w-full" />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-900 transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white" />
            </button>
            <div className="h-8 w-8 rounded-full bg-slate-200 overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.displayName || 'User')}&background=random`} alt="User" />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Welcome back, {userProfile?.displayName?.split(' ')[0] || 'Researcher'}</h1>
              <p className="text-sm text-slate-500">Here's what's happening with your research library today.</p>
            </div>
            <Link to="/digital-library" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 transition-all">
              Browse Library
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              { label: "Active Subscriptions", value: subscriptions.length.toString(), change: "Access to journals", color: "blue" },
              { label: "Quotations", value: quotations.length.toString(), change: quotations.filter(q => q.status === 'Sent').length + " pending", color: "amber" },
              { label: "My Submissions", value: submissions.length.toString(), change: submissions.filter(s => s.status === 'Pending').length + " in review", color: "purple" },
              { label: "Reading Time", value: "0h", change: "Avg 0h/day", color: "green" }
            ].map((stat, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-sm font-medium text-slate-500">{stat.label}</div>
                <div className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</div>
                <div className={`text-xs font-bold mt-2 ${stat.color === 'green' ? 'text-green-600' : stat.color === 'amber' ? 'text-amber-600' : stat.color === 'purple' ? 'text-purple-600' : 'text-blue-600'}`}>
                  {stat.change}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent Activity */}
            <div className="lg:col-span-2 space-y-6">
              {/* Recent Submissions */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">My Content Submissions</h3>
                  <Link to="/contribute" className="text-xs font-bold text-blue-600 hover:text-blue-700">Submit New</Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {submissions.length > 0 ? submissions.slice(0, 5).map((s) => (
                    <div key={s.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                          <FileText size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{s.title}</div>
                          <div className="text-xs text-slate-500">{s.contentType} • {s.publishingMode} • {s.status}</div>
                        </div>
                      </div>
                      <div className={`text-xs font-bold px-3 py-1 rounded-full ${
                        s.status === 'Approved' ? 'bg-green-100 text-green-700' : 
                        s.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {s.status}
                      </div>
                    </div>
                  )) : (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No content submitted yet. <Link to="/contribute" className="text-blue-600 font-bold hover:underline">Start contributing</Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Recent Quotations</h3>
                  <button className="text-xs font-bold text-blue-600 hover:text-blue-700">View All</button>
                </div>
                <div className="divide-y divide-slate-100">
                  {quotations.length > 0 ? quotations.slice(0, 5).map((q) => (
                    <div key={q.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                          <FileText size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{q.quotationId}</div>
                          <div className="text-xs text-slate-500">Amount: ₹{q.total?.toLocaleString()} • {q.status}</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  )) : (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No quotations generated yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recommended */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-900 mb-6">Recommended for You</h3>
                <div className="space-y-6">
                  {[1, 2].map((i) => (
                    <div key={i} className="group">
                      <div className="aspect-video rounded-xl bg-slate-100 mb-3 overflow-hidden">
                        <img src={`https://picsum.photos/seed/rec${i}/400/225`} alt="Rec" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Quantum Computing: A Practical Guide</h4>
                      <p className="text-xs text-slate-500 mt-1">Based on your interest in Applied Physics</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
