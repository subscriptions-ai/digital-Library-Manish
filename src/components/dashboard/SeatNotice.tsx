import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, StatusBadge } from '../ui';

/**
 * Shown to a member of an institution that manages licensed seats when none
 * has been assigned to them. They can still sign in, search and read whatever
 * is open to everyone; this says why the institution's subscription is not
 * theirs, and who to ask.
 */
export function SeatNotice() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/api/me/institution-access', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => (r.ok ? r.json() : null)).then(setInfo).catch(() => {});
  }, []);

  if (!info?.managed || info.hasAccess) return null;
  const expired = info.status === 'Subscription Expired';
  const mail = `Hello, subscription access has not been assigned to my account at ${info.institutionName}. Could you please help?`;

  return (
    <div role="status" className="mb-6 flex gap-3 rounded-xl border border-caution bg-caution-soft p-4">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{expired ? 'Subscription Expired' : 'Subscription access has not been assigned to your account.'}</p>
          {!expired && <StatusBadge status="no-seat-assigned" />}
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {info.seatsFull
            ? 'All licensed user seats are currently assigned. Please contact your institution administrator or STM Digital Library support if additional access is required.'
            : `Your account is linked to ${info.institutionName}, but a licensed subscription seat has not yet been assigned. Please contact your institution administrator for access.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`mailto:?subject=${encodeURIComponent('Subscription access request')}&body=${encodeURIComponent(mail)}`}
            className="btn btn-outline btn-sm">Contact Institution Administrator</a>
          <Button size="sm" onClick={() => navigate('/contact', { state: { prefill: {
            fullName: profile?.displayName || '', email: profile?.email || '', organization: info.institutionName, message: mail } } })}
          >Contact Us</Button>
        </div>
      </div>
    </div>
  );
}
