import React, { useState, useEffect } from 'react';


import { UserProfile, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, 
  UserPlus, 
  MoreVertical, 
  Shield, 
  Mail, 
  Calendar,
  CheckCircle2,
  XCircle,
  Filter,
  Download
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { bulkImportUsers, bulkExportToCSV, getBulkUserTemplate } from '../lib/bulkOperations';

export function UserManagement() {
  const { profile, isAdmin, isSubscriptionManager, isInstitutionAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    fetchUsers();
  }, [profile]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      let q;
      
      if (isAdmin || isSubscriptionManager) {
        // Admins see all users
        q = query(collection(db, 'users'));
      } else if (isInstitutionAdmin) {
        // Institution admins see only their sub-users
        q = query(collection(db, 'users'), where('institutionId', '==', profile?.institutionId));
      } else {
        setLoading(false);
        return;
      }

      const querySnapshot = await getDocs(q);
      const fetchedUsers = querySnapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (uid: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      await Promise.resolve();
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, status: newStatus as any } : u));
      toast.success(`User marked as ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         user.displayName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const count = await bulkImportUsers(file, profile?.institutionId);
      toast.success(`Successfully imported ${count} users`);
      fetchUsers();
    } catch (error) {
      console.error('Bulk import error:', error);
      toast.error('Failed to import users. Check CSV format.');
    }
  };

  const handleExport = () => {
    bulkExportToCSV(filteredUsers, 'users_export');
    toast.success('Users exported successfully');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500">Manage platform users, roles, and permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all"
          >
            <Download size={18} />
            Export
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all cursor-pointer">
            <UserPlus size={18} />
            Bulk Import
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleBulkImport}
            />
          </label>
          <button 
            onClick={getBulkUserTemplate}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            Download Template
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Filter size={18} />
            Filter by Role:
          </div>
          <select 
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="SuperAdmin">Super Admin</option>
            <option value="SubscriptionManager">Subscription Manager</option>
            <option value="ContentManager">Content Manager</option>
            <option value="Subscriber">Subscriber</option>
            <option value="Student">Student</option>
            <option value="College">College</option>
            <option value="University">University</option>
            <option value="Corporate">Corporate</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">User</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Role</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Joined</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 font-medium">Loading users...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-500 font-medium">No users found matching your criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                          {user.displayName?.[0] || user.email[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{user.displayName || 'Unnamed User'}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail size={12} />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.role.includes('Admin') ? 'bg-purple-50 text-purple-600' :
                        user.role.includes('Manager') ? 'bg-blue-50 text-blue-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        <Shield size={12} />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {user.status === 'Active' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar size={12} />
                        {user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => toggleUserStatus(user.uid, user.status)}
                          className={`p-2 rounded-lg transition-all ${
                            user.status === 'Active' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-green-50 text-green-600'
                          }`}
                          title={user.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          {user.status === 'Active' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                        </button>
                        <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-all">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
