import { Link } from 'react-router-dom';
import { BookOpen, ShieldCheck, FileText, MessageSquare } from 'lucide-react';
import { COMPANY_DETAILS } from '../config';

const cards = [
  { title: 'Content Provenance', text: 'See where academic content originates and how it is identified.', icon: BookOpen, to: '/content-sources' },
  { title: 'Secure Access', text: 'Role-based and subscription-based controls help protect user and institutional access.', icon: ShieldCheck },
  { title: 'Rights & Licensing', text: 'Content source and access information is presented transparently wherever available.', icon: FileText, to: '/content-sources' },
  { title: 'Content Removal', text: 'Rights holders and users can report content concerns through a documented review process.', icon: MessageSquare, to: '/content-removal' },
];

export function TrustFoundation() {
  return <section aria-labelledby="trust-heading" className="container-public border-t border-rule py-10 sm:py-12">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Trust &amp; Transparency</p>
    <h2 id="trust-heading" className="mt-3 text-2xl font-bold text-ink sm:text-3xl">Built for Transparent Academic Discovery</h2>
    <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-2">Clear content sources, secure access controls and transparent policies help researchers and institutions understand how STM Digital Library works.</p>
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ title, text, icon: Icon, to }) => <li key={title} className="min-w-0 rounded-xl border border-rule bg-surface p-5">
        <Icon size={22} aria-hidden="true" className="text-accent" />
        <h3 className="mt-3 text-base font-semibold text-ink">{to ? <Link to={to} className="rounded underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{title}</Link> : title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
      </li>)}
    </ul>
  </section>;
}

export function CompanyTrustBlock() {
  return <section aria-labelledby="operator-heading" className="container-public py-8">
    <div className="rounded-xl border border-rule bg-surface-2 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Operated by</p>
      <h2 id="operator-heading" className="mt-2 break-words text-lg font-semibold text-ink">{COMPANY_DETAILS.legalName}</h2>
      <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
        {[
          ['Registered office', COMPANY_DETAILS.registeredAddress],
          ['Sales / marketing office', COMPANY_DETAILS.address],
          ['GSTIN', COMPANY_DETAILS.gstin], ['CIN', COMPANY_DETAILS.cin],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-semibold text-ink">{label}</dt><dd className="mt-1 break-words leading-relaxed text-ink-2">{value}</dd></div>)}
        <div><dt className="font-semibold text-ink">Official contact</dt><dd className="mt-1"><a className="break-all text-accent underline" href={`mailto:${COMPANY_DETAILS.email}`}>{COMPANY_DETAILS.email}</a></dd></div>
      </dl>
    </div>
  </section>;
}
