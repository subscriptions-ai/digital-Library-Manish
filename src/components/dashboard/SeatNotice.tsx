import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
    <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="font-bold">{expired ? 'Subscription expired' : 'Subscription access has not been assigned to your account.'}</p>
      <p className="mt-1 text-sm">
        {info.seatsFull
          ? 'All licensed user seats are currently assigned. Please contact your institution administrator or STM Digital Library support if additional access is required.'
          : `Your account is linked to ${info.institutionName}, but a licensed subscription seat has not yet been assigned. Please contact your institution administrator for access.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`mailto:?subject=${encodeURIComponent('Subscription access request')}&body=${encodeURIComponent(mail)}`}
          className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-bold hover:bg-amber-100">Contact Institution Administrator</a>
        <button onClick={() => navigate('/contact', { state: { prefill: {
          fullName: profile?.displayName || '', email: profile?.email || '', organization: info.institutionName, message: mail } } })}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">Contact Us</button>
      </div>
    </div>
  );
}
