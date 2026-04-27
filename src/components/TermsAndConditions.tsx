import React from "react";
import { COMPANY_DETAILS } from "../config";
import { FileText, UserCheck, CreditCard, ShieldAlert, Scale, MapPin } from "lucide-react";

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
            <p>All proprietary content published by the Company, including content sourced from the various divisions and sister concern companies of Consortium eLearning Network Pvt. Ltd., remains the intellectual property of the Company.</p>
            <p className="mt-2">Content sourced from the various divisions and sister concern companies of Consortium eLearning Network Pvt. Ltd. is regarded as our own content for the purposes of this Platform.</p>
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
              <li>The Platform does not sell third-party content directly, but charges for access, curation, and platform services.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">5. User Responsibilities</h2>
            </div>
            <p>Users agree to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access and use the Platform and its content only in accordance with these Terms, applicable law, and any subscription or license restrictions;</li>
              <li>Not to copy, reproduce, download, distribute, transmit, publish, display, sell, sublicense, or commercially exploit any content, in whole or in part, without prior written authorization from the Platform or the relevant rights holder, as applicable;</li>
              <li>Not to share login credentials, circumvent access controls, scrape, harvest, or otherwise misuse the Platform or its content;</li>
              <li>Not to modify, reverse engineer, decompile, or create derivative works from the Platform or its content except where expressly permitted by law;</li>
              <li>Not to use the Platform in any manner that is unlawful, fraudulent, abusive, or harmful to the Platform, its users, or third-party rights.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">6. Subscription & Payments</h2>
            </div>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access to certain features is subscription-based.</li>
              <li>Pricing may vary based on the subscription plan selected, the duration of access, and the level of features included in each subscription.</li>
              <li><strong>Refund policy:</strong> Refunds may be requested within 7 days of purchase only if the subscription has not been substantially used and no downloadable content has been accessed. Any approved refund will be limited to 50% of the amount paid and will be processed to the original payment method within 7–10 business days. No refunds will be issued after the refund window expires, except where required by law.</li>
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
            <p>If any content violates copyright:</p>
            <p className="mt-2">Contact: <strong>info@celnet.in</strong></p>
            <p className="mt-2">Upon receiving a verified request, we will promptly remove the data/content in question.</p>
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
            <p className="mb-4">These Terms shall be governed by and construed in accordance with the laws of India. The Platform is owned and operated by <strong>Consortium eLearning Network Pvt. Ltd.</strong>, having its registered office in New Delhi.</p>
            <p className="mb-4">Any disputes, claims, or legal proceedings arising out of or in connection with the use of the Platform shall be subject to the exclusive jurisdiction of the competent courts located in <strong>Delhi, India</strong>. Users expressly agree that any such dispute shall be resolved exclusively before the competent courts in Delhi and waive any objection to such jurisdiction.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
