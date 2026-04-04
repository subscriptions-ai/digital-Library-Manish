import React, { useState, useEffect } from 'react';
import { Search, ShieldAlert, ShieldCheck, Mail, Calendar, CreditCard, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function UserManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Expanded user ID tracker
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error("Failed to load users");
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error(error);
      toast.error("Could not fetch user data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleBlock = async (id: string, isBlocked: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isBlocked })
      });
      if (!res.ok) throw new Error('Toggle failed');
      
      toast.success(isBlocked ? 'User blocked' : 'User unblocked');
      fetchUsers(); // Refresh
    } catch (error) {
      console.error(error);
      toast.error('Failed to update user status');
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    (u.displayName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">View users, subscriptions, and manage access.</p>
        </div>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 box-border">
              <tr>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">User Details</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">Role & Org</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                <th className="px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Loading users...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No users found.</td></tr>
              ) : (
                filteredUsers.map((user) => (
                  <React.Fragment key={user.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                            {user.displayName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{user.displayName || 'Unnamed User'}</div>
                            <div className="text-sm text-slate-500 flex items-center gap-1">
                              <Mail size={12} /> {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{user.role}</div>
                        <div className="text-xs text-slate-500 mt-1">{user.organization || 'Independent'}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          user.isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {user.isBlocked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                          {user.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleToggleBlock(user.id, !user.isBlocked)}
                            className={`p-2 rounded-lg text-sm font-bold transition-colors ${
                              user.isBlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'
                            }`}
                          >
                            {user.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                          <button 
                            onClick={() => setExpandedRow(expandedRow === user.id ? null : user.id)}
                            className="flex items-center gap-1 p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            Details <ChevronDown size={16} className={`transition-transform ${expandedRow === user.id ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {expandedRow === user.id && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={4} className="px-6 py-4 border-b border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Subscriptions */}
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                                <Calendar size={16} className="text-blue-600" /> Active Subscriptions
                              </h4>
                              {user.subscriptions?.length > 0 ? (
                                <ul className="space-y-2">
                                  {user.subscriptions.map((sub: any) => (
                                    <li key={sub.id} className="bg-white p-3 rounded-xl border border-slate-200 text-sm flex justify-between items-center">
                                      <div>
                                        <div className="font-bold text-slate-800">{sub.planName} <span className="text-slate-400 font-normal">({sub.domainName})</span></div>
                                        <div className="text-xs text-slate-500">Expires: {new Date(sub.endDate).toLocaleDateString()}</div>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${sub.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sub.status}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm text-slate-500">No active subscriptions.</div>
                              )}
                            </div>
                            
                            {/* Payments */}
                            <div>
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                                <CreditCard size={16} className="text-blue-600" /> Recent Payments
                              </h4>
                              {user.payments?.length > 0 ? (
                                <ul className="space-y-2">
                                  {user.payments.map((payment: any) => (
                                    <li key={payment.id} className="bg-white p-3 rounded-xl border border-slate-200 text-sm flex justify-between items-center">
                                      <div>
                                        <div className="font-bold text-slate-800">₹{payment.amount}</div>
                                        <div className="text-xs text-slate-500">{new Date(payment.createdAt).toLocaleDateString()}</div>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${payment.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{payment.status}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm text-slate-500">No payment history.</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
