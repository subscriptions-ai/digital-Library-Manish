import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Scale, Info, Mail } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

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
            <p>The Platform provides access to academic material sourced from open-access repositories and from publishers who have agreed to be listed. Rights in that material belong to its authors, publishers and other rights holders.</p>
            <p className="mt-4">What <strong>{COMPANY_DETAILS.legalName}</strong> owns is the Platform itself — the software, the interface, the indexing and the tools built around the material. It does not own the material.</p>
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
            <p>The Platform operates as a value-added academic discovery and access service. What the Platform provides is aggregation, indexing, search, curation, and access tools — not a sale of third-party content.</p>
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
            <p>If you are a rights holder and believe that any content available on the Platform infringes your rights, please use our <Link to="/content-removal" className="font-bold text-blue-600 hover:underline">content removal form</Link> or write to <strong>{COMPANY_DETAILS.email}</strong>. Every request receives a reference number and is reviewed within 7 days, in accordance with applicable laws.</p>
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
