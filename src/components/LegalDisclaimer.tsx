import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ShieldAlert, Scale, Info, Mail, BookOpen, ExternalLink, RefreshCw, FileText } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export const LegalDisclaimer: React.FC = () => {
  return (
    <div className="bg-ground">
      <Helmet>
        <title>Legal Disclaimer — STM Digital Library</title>
        <meta
          name="description"
          content="Legal disclaimer outlining the academic discovery model, third-party content terms, intellectual property responsibilities, and limitation of liability for STM Digital Library."
        />
      </Helmet>

      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Legal Disclaimer</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">
            STM Digital Library · Operated by {COMPANY_DETAILS.operatorDisplayName}
          </p>
          <p className="on-dark-2 mx-auto mt-1 text-xs">Last Updated: October 8, 2026</p>
        </div>
      </section>

      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0 space-y-8">
          {/* 1. General Informational & Educational Purpose */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Info size={20} aria-hidden="true" className="shrink-0 text-accent" />
              1. General Informational &amp; Academic Purpose
            </h2>
            <p className="text-ink-2 leading-relaxed">
              The information, literature, and index services provided on <strong>{COMPANY_DETAILS.name}</strong> (&ldquo;the Platform&rdquo;),
              operated by <strong>{COMPANY_DETAILS.legalName}</strong> (&ldquo;the Company&rdquo;), are offered solely for educational, research,
              academic discovery, and informational purposes.
            </p>
            <p className="text-ink-2 leading-relaxed">
              The Platform does not provide professional, legal, medical, or financial advice. Readers, researchers, and institutional members
              are advised to independently verify facts, methodology, data, and conclusions prior to relying on any research or scholarly material indexed here.
            </p>
          </section>

          {/* 2. Service Model & Discovery Platform */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <BookOpen size={20} aria-hidden="true" className="shrink-0 text-accent" />
              2. Nature of Platform &amp; Discovery Model
            </h2>
            <p className="text-ink-2 leading-relaxed">
              The Platform functions as a value-added academic discovery, cataloguing, and access gateway for journals, books, and research literature.
              What <strong>{COMPANY_DETAILS.legalName}</strong> provides and maintains is the discovery platform itself—including the software infrastructure,
              indexing architecture, search mechanisms, curated taxonomies, and reading interfaces.
            </p>
            <p className="text-ink-2 leading-relaxed">
              The Company does not claim proprietary ownership of the scholarly works, journal articles, books, or datasets indexed on the Platform,
              which remain under the ownership, copyright, and licensing terms of their respective authors, publishers, or repositories.
            </p>
          </section>

          {/* 3. Third-Party & Open-Access Source Content */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              3. Third-Party &amp; Open-Access Content
            </h2>
            <p className="text-ink-2 leading-relaxed">
              The Platform indexes academic material sourced from legitimate open-access repositories, public archives, and publishers that have agreed
              to catalogue integration (see <Link to="/content-sources" className="text-accent underline hover:text-accent-hover">Content Sources</Link>).
            </p>
            <p className="text-ink-2 leading-relaxed">
              Inclusion of any third-party content, journal, publisher, or repository on the Platform does not constitute an endorsement, sponsorship, or
              guarantee by the Company, nor does it imply an exclusive partnership unless expressly stated in writing.
            </p>
          </section>

          {/* 4. Accuracy, Completeness & Availability */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              4. Accuracy, Completeness &amp; System Availability
            </h2>
            <p className="text-ink-2 leading-relaxed">
              While the Company takes reasonable care to curate verified metadata, maintain accurate catalogue classifications, and ensure service uptime,
              the Platform and all associated content are provided on an <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as available&rdquo;</strong> basis
              without express or implied warranties of any kind.
            </p>
            <p className="text-ink-2 leading-relaxed">
              We do not warrant that catalogue records will be error-free, uninterrupted, free of omissions, or continuously available at all times. Periodic
              maintenance, repository updates, or third-party server changes may affect access to particular titles or files.
            </p>
          </section>

          {/* 5. External Links */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <ExternalLink size={20} aria-hidden="true" className="shrink-0 text-accent" />
              5. External Links &amp; Third-Party Sites
            </h2>
            <p className="text-ink-2 leading-relaxed">
              The Platform may provide hyperlinks to external publisher platforms, DOI resolution servers, preprint repositories, or institutional portals.
              These external links are provided strictly for research convenience.
            </p>
            <p className="text-ink-2 leading-relaxed">
              The Company exercises no control over third-party domains and assumes no responsibility for their content, availability, privacy policies,
              or security practices. Navigating to external websites is undertaken entirely at the user&rsquo;s own risk.
            </p>
          </section>

          {/* 6. Intellectual Property & User Responsibility */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              6. Intellectual Property &amp; User Responsibility
            </h2>
            <p className="text-ink-2 leading-relaxed">
              Users and institutional readers are solely responsible for ensuring that their downloading, citation, reproduction, or redistribution of indexed
              material adheres strictly to the applicable Creative Commons or publisher-specific license accompanying the individual work, as well as Indian and
              international copyright statutes.
            </p>
            <p className="text-ink-2 leading-relaxed">
              Unauthorised systematic scraping, bulk downloading, commercial re-licensing, or redistribution of indexed literature beyond permitted statutory fair
              use is strictly prohibited under our <Link to="/terms-and-conditions" className="text-accent underline hover:text-accent-hover">Terms &amp; Conditions</Link>.
            </p>
          </section>

          {/* 7. Rights Holders & Content Removal */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              7. Rights Holders &amp; Takedown Requests
            </h2>
            <p className="text-ink-2 leading-relaxed">
              {COMPANY_DETAILS.name} fully respects the legitimate intellectual property rights of creators and copyright holders. If you are a copyright owner
              or legal representative and believe that any metadata or indexed file on the Platform infringes your copyright or licensing rights, you may submit
              a formal takedown notification via our dedicated <Link to="/content-removal" className="text-accent underline hover:text-accent-hover font-semibold">Content Removal Form</Link> or
              write directly to <strong>{COMPANY_DETAILS.email}</strong>.
            </p>
            <p className="text-ink-2 leading-relaxed">
              Every takedown notice is logged with a formal tracking reference and reviewed expeditiously in compliance with Indian Information Technology regulations.
            </p>
          </section>

          {/* 8. Limitation of Liability */}
          <section className="space-y-4 border-t border-rule pt-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              8. Limitation of Liability
            </h2>
            <p className="text-ink-2 leading-relaxed">
              To the fullest extent permitted by applicable law, neither <strong>{COMPANY_DETAILS.legalName}</strong> nor its directors, employees, affiliates,
              or agents shall be held liable for any direct, indirect, incidental, consequential, special, or exemplary damages—including but not limited to loss
              of academic research data, service interruption, loss of goodwill, or costs of substitute services—arising out of or in connection with the use of,
              inability to use, or reliance on any material or functionality of the Platform.
            </p>
          </section>

          {/* 9. Policy Amendments */}
          <section className="space-y-4 border-t border-rule pt-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <RefreshCw size={20} aria-hidden="true" className="shrink-0 text-accent" />
              9. Policy Updates &amp; Amendments
            </h2>
            <p className="text-ink-2 leading-relaxed">
              The Company reserves the right to revise and update this Legal Disclaimer periodically to reflect regulatory adjustments, platform enhancements,
              or operational changes. Continued use of the Platform after the posting of revised terms constitutes acceptance of those revisions.
            </p>
          </section>

          {/* 10. Contact Information */}
          <section className="space-y-4 border-t border-rule pt-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Mail size={20} aria-hidden="true" className="shrink-0 text-accent" />
              10. Contact &amp; Legal Notices
            </h2>
            <p className="text-ink-2 leading-relaxed">
              For questions, clarifications, or legal communications regarding this Disclaimer, please reach our administrative office:
            </p>
            <div className="rounded-xl border border-rule bg-surface p-5 text-sm text-ink-2 space-y-1">
              <p className="font-semibold text-ink">{COMPANY_DETAILS.legalName}</p>
              <p className="text-muted">{COMPANY_DETAILS.salesOfficeLabel}: {COMPANY_DETAILS.address}</p>
              <p className="text-muted">Telephone: {COMPANY_DETAILS.tel.join(" / ")}</p>
              <p className="text-muted">Email: <a href={`mailto:${COMPANY_DETAILS.email}`} className="text-accent underline">{COMPANY_DETAILS.email}</a></p>
            </div>
            <div className="flex flex-wrap gap-4 pt-4 text-sm">
              <Link to="/privacy-policy" className="text-accent hover:underline">Privacy Policy →</Link>
              <Link to="/terms-and-conditions" className="text-accent hover:underline">Terms &amp; Conditions →</Link>
              <Link to="/returns-refunds-cancellation" className="text-accent hover:underline">Returns, Refunds &amp; Cancellation →</Link>
              <Link to="/content-removal" className="text-accent hover:underline">Content Removal →</Link>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};

export default LegalDisclaimer;
