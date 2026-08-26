import React from "react";
import { Link } from "react-router-dom";
import { COMPANY_DETAILS } from "../config";
import { FileText, UserCheck, KeyRound, ShieldAlert, Scale, MapPin } from "lucide-react";

export const TermsAndConditions: React.FC = () => {
  return (
    <div className="bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">Terms & Conditions</h1>
          </div>
          <p className="text-slate-400">Last Updated: April 2, 2026</p>
        </div>

        <div className="p-8 prose prose-slate max-w-none">
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">1. Introduction</h2>
            </div>
            <p>This platform (“Platform”) is operated by <strong>Consortium e-Learning Network Pvt. Ltd.</strong> By accessing or using our services, you agree to comply with these Terms.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Scale className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">2. Nature of Service</h2>
            </div>
            <p>The Platform provides:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access to proprietary content owned by the Company (Books, Periodicals, Theses, Conference Proceedings, Educational Videos, etc.)</li>
              <li>Aggregated access to selected open-access academic content from third-party sources</li>
            </ul>
            <p className="mt-4">The Platform offers value-added services including search, indexing, categorization, and discovery tools.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">3. Content Ownership</h2>
            </div>
            <p>All proprietary content published by the Company, including content sourced from the various divisions and sister concern companies of {COMPANY_DETAILS.legalName}, remains the intellectual property of the Company.</p>
            <p className="mt-2">Content sourced from the various divisions and sister concern companies of {COMPANY_DETAILS.legalName} is regarded as our own content for the purposes of this Platform.</p>
            <p className="mt-2">Third-party content available on the Platform remains the property of its respective authors/publishers, and the Platform does not claim ownership of any content beyond the content expressly identified above as owned by the Company.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">4. Use of Open Access Content</h2>
            </div>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Open access content is used in accordance with applicable licenses (e.g., Creative Commons).</li>
              <li>Proper attribution is provided wherever required.</li>
              <li>The Platform provides curation, indexing, hosting and related software services; it does not claim ownership of third-party content.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">5. User Responsibilities</h2>
            </div>
            <p>Users agree to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access and use the Platform and its content only in accordance with these Terms, applicable law, and any licence restrictions applicable to your account;</li>
              <li>Not to copy, reproduce, download, distribute, transmit, publish, display, sell, sublicense, or commercially exploit any content, in whole or in part, without prior written authorization from the Platform or the relevant rights holder, as applicable;</li>
              <li>Not to share login credentials, circumvent access controls, scrape, harvest, or otherwise misuse the Platform or its content;</li>
              <li>Not to modify, reverse engineer, decompile, or create derivative works from the Platform or its content except where expressly permitted by law;</li>
              <li>Not to use the Platform in any manner that is unlawful, fraudulent, abusive, or harmful to the Platform, its users, or third-party rights.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <KeyRound className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">6. Access &amp; Commercial Terms</h2>
            </div>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access to the Platform is provided under a written service agreement executed separately with each individual or institution.</li>
              <li>The scope of access, its duration, and all commercial terms are set out in that agreement and not on this website.</li>
              <li><strong>Refunds and cancellation:</strong> Any refund or cancellation entitlement is governed exclusively by the terms of your executed service agreement. Please contact us for a copy of the terms applicable to your account.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Scale className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">7. Intellectual Property Rights</h2>
            </div>
            <p>Any unauthorized use, reproduction, distribution, modification, or commercial exploitation of the content available on the Platform may result in appropriate legal action under applicable laws. In the event of any dispute, claim, or legal proceeding arising out of or in connection with the use of the Platform or its content, the jurisdiction shall be exclusively limited to the competent courts in <strong>Delhi, India</strong>.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">8. Content Removal (Takedown Policy)</h2>
            </div>
            <p>If you believe any content on the Platform infringes your rights, you may submit a request through our <Link to="/content-removal" className="font-bold text-blue-600 hover:underline">content removal form</Link>, or by writing to <strong>{COMPANY_DETAILS.email}</strong>.</p>
            <p className="mt-2">Each request is logged with a reference number and acknowledged. We aim to review every request and respond within <strong>7 days</strong> of receipt, and will remove or restrict the content in question where the request is verified.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Scale className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">9. Limitation of Liability</h2>
            </div>
            <p className="mb-4">The Platform is provided “as is” and “as available,” without any warranties, representations, or guarantees of any kind, whether express or implied, regarding the completeness, accuracy, reliability, timeliness, legality, or suitability of any third-party content made available through the Platform.</p>
            <p className="mb-4">While we make reasonable efforts to curate and present content responsibly, we do not warrant that third-party materials will be error-free, up to date, uninterrupted, or free from omissions, and users acknowledge that any reliance on such content is at their own risk.</p>
            <p>We are not responsible for any content hosted on third-party websites that may be anti-national, pornographic, offensive, inappropriate, or otherwise objectionable, and access to such third-party content is solely at the user’s discretion and risk.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">10. Governing Law</h2>
            </div>
            <p className="mb-4">These Terms shall be governed by and construed in accordance with the laws of India. The Platform is owned and operated by <strong>{COMPANY_DETAILS.legalName}</strong>, having its registered office in New Delhi.</p>
            <p className="mb-4">Any disputes, claims, or legal proceedings arising out of or in connection with the use of the Platform shall be subject to the exclusive jurisdiction of the competent courts located in <strong>Delhi, India</strong>. Users expressly agree that any such dispute shall be resolved exclusively before the competent courts in Delhi and waive any objection to such jurisdiction.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
