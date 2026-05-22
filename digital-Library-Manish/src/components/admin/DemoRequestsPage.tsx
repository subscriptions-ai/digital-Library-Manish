import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Mail, Phone, Building2, MapPin, Briefcase, CheckCircle2, Clock, Search, X, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function DemoRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [provisionDuration, setProvisionDuration] = useState(14);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/demo-requests', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      toast.error('Could not load demo requests');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdateLoading(true);
      const response = await fetch(`/api/admin/demo-requests/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ status: newStatus, adminNotes })
      });
      
      if (!response.ok) throw new Error('Failed to update status');
      
      toast.success('Request updated successfully');
      fetchRequests();
      if (selectedRequest && selectedRequest.id === id) {
        setSelectedRequest({ ...selectedRequest, status: newStatus, adminNotes });
      }
    } catch (error) {
      toast.error('Failed to update request');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleProvision = async () => {
    try {
      setProvisionLoading(true);
      const response = await fetch(`/api/admin/demo-requests/${selectedRequest.id}/provision`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ durationDays: provisionDuration })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to provision access');
      
      toast.success('Demo account provisioned successfully! Email sent.');
      fetchRequests();
      setSelectedRequest(data.request);
      setAdminNotes(data.request.adminNotes);
    } catch (error: any) {
      toast.error(error.message || 'Failed to provision demo access');
    } finally {
      setProvisionLoading(false);
    }
  };

  const handleResendCredentials = async () => {
    try {
      setResendLoading(true);
      const response = await fetch(`/api/admin/demo-requests/${selectedRequest.id}/resend-credentials`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        }
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to resend credentials');
      
      toast.success('Credentials reset and resent successfully!');
      fetchRequests();
      setSelectedRequest(data.request);
      setAdminNotes(data.request.adminNotes);
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend credentials');
    } finally {
      setResendLoading(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.institutionName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.institutionalEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Contacted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTypeColor = (type: string = 'Institution') => {
    switch(type) {
      case 'Student': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'Corporate': return 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100';
      default: return 'bg-sky-50 text-sky-600 border-sky-100';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by institution, name, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {['All', 'Pending', 'Contacted', 'Completed'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                statusFilter === status
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Institution</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Contact Person</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Department</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                    {format(new Date(req.createdAt), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-slate-900">{req.institutionName}</div>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${getTypeColor(req.requestType)}`}>
                        {req.requestType || 'Institution'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {req.city || 'N/A'}, {req.state || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{req.fullName}</div>
                    <div className="text-xs text-slate-500">{req.institutionalEmail}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      {req.department}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setAdminNotes(req.adminNotes || '');
                      }}
                      className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No demo requests found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedRequest(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-xl font-bold text-slate-900">Demo Request Details</h3>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Inst Details */}
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-100 pb-2">Institution Information</h4>
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Building2 size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">
                              {selectedRequest.requestType === 'Student' ? 'University / College' : selectedRequest.requestType === 'Corporate' ? 'Company / Corporate' : 'Institution Name'}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-slate-900">{selectedRequest.institutionName}</div>
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${getTypeColor(selectedRequest.requestType)}`}>
                                {selectedRequest.requestType || 'Institution'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <MapPin size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">Location</div>
                            <div className="font-semibold text-slate-900">
                              {[selectedRequest.city, selectedRequest.state].filter(Boolean).join(', ') || 'Not specified'}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Briefcase size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">Department</div>
                            <div className="font-semibold text-slate-900">{selectedRequest.department}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-100 pb-2">Contact Person</h4>
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Mail size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">Name & Email</div>
                            <div className="font-semibold text-slate-900">{selectedRequest.fullName}</div>
                            <a href={`mailto:${selectedRequest.institutionalEmail}`} className="text-sm text-blue-600 hover:underline">
                              {selectedRequest.institutionalEmail}
                            </a>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Phone size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">WhatsApp Number</div>
                            <div className="font-semibold text-slate-900">
                              {selectedRequest.whatsappNumber ? (
                                <a href={`https://wa.me/${selectedRequest.whatsappNumber.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1">
                                  {selectedRequest.whatsappNumber}
                                </a>
                              ) : 'Not provided'}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="mt-0.5 h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Briefcase size={16} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-500">Designation</div>
                            <div className="font-semibold text-slate-900">{selectedRequest.designation || 'Not provided'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Admin Notes & Status */}
                <div className="mt-8 pt-8 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Request Management</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Update Status</label>
                      <div className="flex flex-wrap gap-2">
                        {['Pending', 'Contacted', 'Completed'].map(status => (
                          <button
                            key={status}
                            disabled={updateLoading}
                            onClick={() => handleStatusChange(selectedRequest.id, status)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                              selectedRequest.status === status
                                ? getStatusColor(status).replace('text-', 'bg-').replace('bg-', 'bg-').split(' ')[0] + ' text-white shadow-md'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {status === 'Pending' && <Clock size={16} />}
                            {status === 'Completed' && <CheckCircle2 size={16} />}
                            {status === 'Contacted' && <Mail size={16} />}
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Admin Notes</label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add private notes about this demo request..."
                        className="w-full rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 min-h-[100px] resize-y"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => handleStatusChange(selectedRequest.id, selectedRequest.status)}
                          disabled={updateLoading || adminNotes === selectedRequest.adminNotes}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
                        >
                          Save Notes
                        </button>
                      </div>
                    </div>
                    
                    {selectedRequest.status !== 'Completed' && (
                      <div className="pt-6 mt-6 border-t border-slate-100">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Automated Provisioning</label>
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                          <p className="text-sm text-indigo-800 mb-4">
                            Instantly create a temporary Demo Account for this institution. The user will receive an automated email with their secure login credentials granting access to <strong>{selectedRequest.department}</strong>.
                          </p>
                          <div className="flex flex-wrap items-center gap-4">
                            <select
                              value={provisionDuration}
                              onChange={(e) => setProvisionDuration(Number(e.target.value))}
                              className="px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 text-indigo-900 font-medium"
                            >
                              <option value={7}>7 Days Access</option>
                              <option value={14}>14 Days Access</option>
                              <option value={30}>30 Days Access</option>
                            </select>
                            
                            <button
                              onClick={handleProvision}
                              disabled={provisionLoading}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-200"
                            >
                              {provisionLoading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Key size={16} />
                              )}
                              Provision Demo Access
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedRequest.status === 'Completed' && (
                      <div className="pt-6 mt-6 border-t border-slate-100">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Demo Credentials Management</label>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                          <p className="text-sm text-emerald-800 mb-4">
                            This demo has been successfully provisioned. If the user is having trouble logging in, you can reset their password and resend their credentials.
                          </p>
                          <div className="flex flex-wrap items-center gap-4">
                            <button
                              onClick={handleResendCredentials}
                              disabled={resendLoading}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm shadow-emerald-200"
                            >
                              {resendLoading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Mail size={16} />
                              )}
                              Resend Credentials
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
