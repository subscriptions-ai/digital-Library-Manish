import React, { useState, useEffect } from 'react';
import { Mail, Key, Shield, Save, Send, RefreshCw, CheckCircle, AlertTriangle, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

export function AdminEmailSettings() {
  const [activeTab, setActiveTab] = useState<'config' | 'test' | 'logs'>('config');
  
  // Settings State
  const [settings, setSettings] = useState({
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: '',
    emailFrom: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Test Email State
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings/email', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          awsAccessKeyId: data.awsAccessKeyId || '',
          awsSecretAccessKey: data.awsSecretAccessKey || '',
          awsRegion: data.awsRegion || '',
          emailFrom: data.emailFrom || ''
        });
      }
    } catch (err) {
      toast.error('Failed to load email settings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/email-logs', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      toast.error('Failed to load email logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const saveSettings = async () => {
    if (!settings.awsAccessKeyId || !settings.awsSecretAccessKey || !settings.awsRegion || !settings.emailFrom) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/settings/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Email settings saved successfully');
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/admin/settings/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ to: testEmail })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Test email sent successfully!');
        setTestEmail('');
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (err) {
      toast.error('Network error while sending test email');
    } finally {
      setIsTesting(false);
    }
  };

  const resendEmail = async (logId: string) => {
    try {
      const res = await fetch(`/api/admin/email-logs/${logId}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Email resent successfully!');
        fetchLogs(); // Refresh the logs to show the new status
      } else {
        toast.error(data.error || 'Failed to resend email');
      }
    } catch (err) {
      toast.error('Network error while resending email');
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><RefreshCw className="animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SMTP & Email Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">Manage AWS SES credentials, test connectivity, and view email logs like Fluent SMTP.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('config')}
          className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'config' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('test')}
          className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'test' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Email Test
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-4 px-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'logs' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Email Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'config' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden max-w-3xl">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">AWS SES Integration</h2>
              <p className="text-xs text-slate-500">Provide your AWS credentials to enable outbound emails.</p>
            </div>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">AWS Access Key ID</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={settings.awsAccessKeyId}
                    onChange={e => setSettings({ ...settings, awsAccessKeyId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    placeholder="AKIA..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">AWS Secret Access Key</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="password"
                    value={settings.awsSecretAccessKey}
                    onChange={e => setSettings({ ...settings, awsSecretAccessKey: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    placeholder="********"
                  />
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">AWS Region</label>
                <input
                  type="text"
                  value={settings.awsRegion}
                  onChange={e => setSettings({ ...settings, awsRegion: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  placeholder="eu-west-1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">From Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    value={settings.emailFrom}
                    onChange={e => setSettings({ ...settings, emailFrom: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    placeholder="noreply@domain.com"
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden max-w-xl">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
              <Send size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Send Test Email</h2>
              <p className="text-xs text-slate-500">Verify your SES credentials by sending a test message.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Send To</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-emerald-500 outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <button
              onClick={sendTestEmail}
              disabled={isTesting || !testEmail}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            >
              {isTesting ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
              Send Test Email
            </button>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-bold text-slate-800">Recent Email Logs (Last 100)</h2>
            <button onClick={fetchLogs} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <RefreshCw size={18} className={isLoadingLogs ? "animate-spin" : ""} />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">To</th>
                  <th className="px-6 py-4 font-bold">Subject</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No email logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                        {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {log.to}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {log.subject}
                      </td>
                      <td className="px-6 py-4">
                        {log.status === 'Sent' ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                            <CheckCircle size={14} /> Sent
                          </div>
                        ) : (
                          <div className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-xs font-bold border border-rose-100 cursor-help">
                            <AlertTriangle size={14} /> Failed
                            {log.error && (
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 break-words pointer-events-none">
                                {log.error}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {log.status === 'Failed' && (
                          <button
                            onClick={() => resendEmail(log.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition-colors border border-blue-100 hover:border-blue-600"
                            title="Resend this email"
                          >
                            <Send size={14} /> Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
