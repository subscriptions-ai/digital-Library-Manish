import React from "react";
import { BookOpen, FileText, CheckCircle, Info, Mail, ShieldAlert } from "lucide-react";

export const ContentSources: React.FC = () => {
  return (
    <div className="bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">Content Sources & Licensing</h1>
          </div>
          <p className="text-slate-400">Last Updated: April 27, 2026</p>
        </div>

        <div className="p-8 prose prose-slate max-w-none">
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">1. Proprietary Content</h2>
            </div>
            <p>The Platform includes original, proprietary content developed, published, or made available by <strong>Consortium eLearning Network Pvt. Ltd.</strong> and its various divisions and sister concern companies. Such content may include, without limitation:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Journals published under STM Journals and other affiliated divisions</li>
              <li>Conference proceedings organized by the Company or its affiliated entities</li>
              <li>Educational videos and digital learning resources</li>
              <li>Books, case studies, and other academic materials produced by the Company or its affiliated entities</li>
            </ul>
            <p className="mt-4">Access to certain proprietary content may be provided on a subscription or fee basis, as applicable under the Platform’s policies.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">2. Open Access Content</h2>
            </div>
            <p>The Platform may include content sourced from publicly available open-access repositories and other lawful sources, including:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>DOAJ (Directory of Open Access Journals)</li>
              <li>PubMed Central</li>
              <li>arXiv and similar repositories</li>
            </ul>
            <p className="mt-4">Where applicable, such content is used in accordance with the relevant license terms, permissions, and usage conditions. In some cases, the Platform may rely on publicly available materials without formal agreements with every source or rights holder, and users should understand that availability on the Platform does not imply ownership or exclusive rights by the Platform.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Info className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">3. Licensing Compliance</h2>
            </div>
            <ul className="list-disc pl-6 space-y-2">
              <li>We are in the process of reviewing and confirming the applicable licenses for all third-party content included on the Platform.</li>
              <li>Where required, appropriate attribution will be provided in accordance with the relevant license terms.</li>
              <li>Content with non-commercial restrictions (such as CC-BY-NC) will not be used in paid services unless expressly permitted by the applicable license or rights holder.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0" id="no-ownership">4. No Ownership Claim</h2>
            </div>
            <p>The Platform does not claim ownership of any third-party content made available through or referenced on the Platform. All such content remains the intellectual property of its respective authors, publishers, licensors, or rights holders, and is used only in accordance with applicable licenses, permissions, or legal exceptions. Any rights not expressly granted to the Platform are reserved by the original rights holders.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">5. Purpose of Platform</h2>
            </div>
            <p>The Platform provides a comprehensive set of academic access and discovery services designed to help users find, organize, and engage with scholarly content more efficiently:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Aggregation:</strong> Content from multiple verified sources into a single, unified platform.</li>
              <li><strong>Indexing:</strong> Journals, articles, books, case studies, videos, and other academic resources for easier retrieval.</li>
              <li><strong>Discovery Tools:</strong> Advanced search, subject categorization, filters, and recommendation features.</li>
              <li><strong>Integrated Access:</strong> Bringing together proprietary and legally sourced open-access content in one place.</li>
            </ul>
            <p className="mt-4">Subscription fees apply to platform services, not to individual third-party content. Consortium eLearning Network Pvt. Ltd., along with its various divisions and sister concern companies, provides the platform services, and not the individual third-party content.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Mail className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">6. Copyright & Takedown</h2>
            </div>
            <p>If you are a copyright holder and believe that any content available on the Platform infringes your intellectual property rights, please contact us at <strong>info@celnet.in</strong> with the following details:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Your full name and organization name</li>
              <li>Proof of ownership or authorization to act on behalf of the copyright holder</li>
              <li>A clear description of the content you believe is infringing</li>
              <li>The exact URL or location of the content on the Platform</li>
              <li>A statement explaining why you believe the content should be removed</li>
            </ul>
            <p className="mt-4">Once we receive a valid request, we will review it promptly and take appropriate action in accordance with applicable copyright laws and our internal takedown procedures.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
