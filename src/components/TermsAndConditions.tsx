import React from "react";
import { Link } from "react-router-dom";
import { COMPANY_DETAILS } from "../config";
import { FileText, UserCheck, KeyRound, ShieldAlert, Scale, MapPin } from "lucide-react";

export const TermsAndConditions: React.FC = () => {
  return (
    <div className="bg-ground">
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Terms & Conditions</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">Last Updated: April 2, 2026</p>
        </div>
      </section>

      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              1. Introduction
            </h2>
            <p>This platform (“Platform”) is operated by <strong>{COMPANY_DETAILS.legalName}</strong> By accessing or using our services, you agree to comply with these Terms.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              2. Nature of Service
            </h2>
            <p>The Platform provides:</p>
            <ul>
              <li>Discovery of and access to academic material — books, periodicals, theses, conference proceedings, educational videos and similar</li>
              <li>Aggregated access to selected open-access academic content from third-party sources</li>
            </ul>
            <p>The Platform offers value-added services including search, indexing, categorization, and discovery tools.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              3. Content Ownership
            </h2>
            <p>The Platform — its software, interface, indexing, categorisation and discovery tools — is the intellectual property of the Company.</p>
            <p>The Company does not claim ownership of the academic material made available through the Platform. Where a publisher lists content here, it does so under an agreement and retains its rights.</p>
            <p>Third-party content available on the Platform remains the property of its respective authors/publishers, and the Platform does not claim ownership of any content beyond the content expressly identified above as owned by the Company.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <UserCheck size={20} aria-hidden="true" className="shrink-0 text-accent" />
              4. Use of Open Access Content
            </h2>
            <ul>
              <li>Open access content is used in accordance with applicable licenses (e.g., Creative Commons).</li>
              <li>Proper attribution is provided wherever required.</li>
              <li>The Platform provides curation, indexing, hosting and related software services; it does not claim ownership of third-party content.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <UserCheck size={20} aria-hidden="true" className="shrink-0 text-accent" />
              5. User Responsibilities
            </h2>
            <p>Users agree to:</p>
            <ul>
              <li>Access and use the Platform and its content only in accordance with these Terms, applicable law, and any licence restrictions applicable to your account;</li>
              <li>Not to copy, reproduce, download, distribute, transmit, publish, display, sell, sublicense, or commercially exploit any content, in whole or in part, without prior written authorization from the Platform or the relevant rights holder, as applicable;</li>
              <li>Not to share login credentials, circumvent access controls, scrape, harvest, or otherwise misuse the Platform or its content;</li>
              <li>Not to modify, reverse engineer, decompile, or create derivative works from the Platform or its content except where expressly permitted by law;</li>
              <li>Not to use the Platform in any manner that is unlawful, fraudulent, abusive, or harmful to the Platform, its users, or third-party rights.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <KeyRound size={20} aria-hidden="true" className="shrink-0 text-accent" />
              6. Access &amp; Commercial Terms
            </h2>
            <ul>
              <li>Access to the Platform is provided under a written service agreement executed separately with each individual or institution.</li>
              <li>The scope of access, its duration, and all commercial terms are set out in that agreement and not on this website.</li>
              <li><strong>Refunds and cancellation:</strong> Any refund or cancellation entitlement is governed exclusively by the terms of your executed service agreement. Please contact us for a copy of the terms applicable to your account.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              7. Intellectual Property Rights
            </h2>
            <p>Any unauthorized use, reproduction, distribution, modification, or commercial exploitation of the content available on the Platform may result in appropriate legal action under applicable laws. In the event of any dispute, claim, or legal proceeding arising out of or in connection with the use of the Platform or its content, the jurisdiction shall be exclusively limited to the competent courts in <strong>Delhi, India</strong>.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              8. Content Removal (Takedown Policy)
            </h2>
            <p>If you believe any content on the Platform infringes your rights, you may submit a request through our <Link to="/content-removal" className="font-semibold">content removal form</Link>, or by writing to <strong>{COMPANY_DETAILS.email}</strong>.</p>
            <p>Each request is logged with a reference number and acknowledged. We aim to review every request and respond within <strong>7 days</strong> of receipt, and will remove or restrict the content in question where the request is verified.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              9. Limitation of Liability
            </h2>
            <p>The Platform is provided “as is” and “as available,” without any warranties, representations, or guarantees of any kind, whether express or implied, regarding the completeness, accuracy, reliability, timeliness, legality, or suitability of any third-party content made available through the Platform.</p>
            <p>While we make reasonable efforts to curate and present content responsibly, we do not warrant that third-party materials will be error-free, up to date, uninterrupted, or free from omissions, and users acknowledge that any reliance on such content is at their own risk.</p>
            <p>We are not responsible for any content hosted on third-party websites that may be anti-national, pornographic, offensive, inappropriate, or otherwise objectionable, and access to such third-party content is solely at the user’s discretion and risk.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <MapPin size={20} aria-hidden="true" className="shrink-0 text-accent" />
              10. Governing Law
            </h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of India. The Platform is owned and operated by <strong>{COMPANY_DETAILS.legalName}</strong>, having its registered office in New Delhi.</p>
            <p>Any disputes, claims, or legal proceedings arising out of or in connection with the use of the Platform shall be subject to the exclusive jurisdiction of the competent courts located in <strong>Delhi, India</strong>. Users expressly agree that any such dispute shall be resolved exclusively before the competent courts in Delhi and waive any objection to such jurisdiction.</p>
          </section>
        </article>
      </div>
    </div>
  );
};
