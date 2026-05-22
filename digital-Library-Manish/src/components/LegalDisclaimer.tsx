import React from "react";
import { ShieldAlert, Scale, Info, Mail } from "lucide-react";

export const LegalDisclaimer: React.FC = () => {
  return (
    <div className="bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <ShieldAlert className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">Legal Disclaimer</h1>
          </div>
          <p className="text-slate-400">Last Updated: April 27, 2026</p>
        </div>

        <div className="p-8 prose prose-slate max-w-none">
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Info className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">Nature of Content</h2>
            </div>
            <p>The Platform provides access to a combination of proprietary content owned by <strong>Consortium eLearning Network Pvt. Ltd.</strong> and its various divisions and sister concern companies, as well as third-party content sourced from publicly available or open-access repositories.</p>
            <p className="mt-4">For the purposes of this Platform, content published by the various divisions and sister concern companies of Consortium eLearning Network Pvt. Ltd. shall be treated as the Company’s own content or affiliated proprietary content, as applicable. Any content beyond such divisions and sister concern companies, including content sourced from third-party websites, repositories, publishers, or external platforms, shall not be regarded as owned by the Company unless expressly stated otherwise.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Scale className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">No Guarantees</h2>
            </div>
            <p>While reasonable efforts are made to ensure that third-party content is used in accordance with applicable licenses and permissions, the Platform does not guarantee the completeness, accuracy, legality, or continued availability of such third-party content at all times.</p>
            <p className="mt-4">All third-party materials remain the intellectual property of their respective authors, publishers, or rights holders. The inclusion of any such content on the Platform does not imply ownership, endorsement, or exclusive rights by the Platform.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Info className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">Service Model</h2>
            </div>
            <p>The Platform operates as a value-added academic discovery and access service. Subscription fees apply to platform services, including aggregation, indexing, search, curation, and access tools, and do not represent a sale of third-party content.</p>
            <p className="mt-4">Users are responsible for ensuring that their use of any content complies with applicable copyright laws, license terms, and other legal requirements.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">Third-Party Links & Safety</h2>
            </div>
            <p>The Company does not control or endorse third-party websites and shall not be held responsible for any anti-national, pornographic, religiously sensitive, defamatory, unlawful, or otherwise inappropriate content that may appear on such third-party websites or external links.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Mail className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">Rights Holders & Takedowns</h2>
            </div>
            <p>If you are a rights holder and believe that any content available on the Platform infringes your rights, please contact us at <strong>info@celnet.in</strong> with relevant details. We will review the matter and take appropriate action in accordance with applicable laws.</p>
          </section>

          <section className="mb-10 border-t border-slate-100 pt-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Limitation of Liability</h2>
            <p>The Platform shall not be held liable for any damages arising from the use of, reliance on, or access to third-party content, including but not limited to inaccuracies, omissions, or copyright issues.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
