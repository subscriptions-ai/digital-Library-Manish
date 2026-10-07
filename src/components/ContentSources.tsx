import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileText, CheckCircle, Info, Mail, ShieldAlert } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export const ContentSources: React.FC = () => {
  return (
    <div className="bg-ground">
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Content Sources & Licensing</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">Last Updated: April 27, 2026</p>
        </div>
      </section>

      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              1. What the Platform Provides
            </h2>
            <p><strong>{COMPANY_DETAILS.legalName}</strong> operates the Platform. What it provides is the service — aggregation, indexing, search, curation, hosting of the interface, and the tools built around them. It does not claim ownership of the academic material made discoverable through it.</p>
            <p>The material listed here may include, without limitation:</p>
            <ul>
              <li>Journals and articles indexed from open-access sources</li>
              <li>Conference proceedings and case studies</li>
              <li>Academic books and reference titles</li>
              <li>Educational videos and digital learning resources</li>
            </ul>
            <p>Copyright in each item remains with its author, publisher or other rights holder. Where content is contributed by a publisher, it is listed under an agreement with them and remains theirs. Access to particular collections may be restricted under the Platform’s policies and the terms agreed with each institution.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <CheckCircle size={20} aria-hidden="true" className="shrink-0 text-accent" />
              2. Open Access Content
            </h2>
            <p>The Platform may include content sourced from publicly available open-access repositories, institutional archives and other lawful sources. Every such item is published under an open licence, and is carried here in accordance with that licence.</p>
            <p>Where applicable, such content is used in accordance with the relevant license terms, permissions, and usage conditions. In some cases, the Platform may rely on publicly available materials without formal agreements with every source or rights holder, and users should understand that availability on the Platform does not imply ownership or exclusive rights by the Platform.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Info size={20} aria-hidden="true" className="shrink-0 text-accent" />
              3. Licensing Compliance
            </h2>
            <ul>
              <li>We are in the process of reviewing and confirming the applicable licenses for all third-party content included on the Platform.</li>
              <li>Where required, appropriate attribution will be provided in accordance with the relevant license terms.</li>
              <li>Content with non-commercial restrictions (such as CC-BY-NC) is handled strictly in accordance with the applicable licence and the rights holder’s permission.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2" id="no-ownership">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              4. No Ownership Claim
            </h2>
            <p>The Platform does not claim ownership of any third-party content made available through or referenced on the Platform. All such content remains the intellectual property of its respective authors, publishers, licensors, or rights holders, and is used only in accordance with applicable licenses, permissions, or legal exceptions. Any rights not expressly granted to the Platform are reserved by the original rights holders.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <BookOpen size={20} aria-hidden="true" className="shrink-0 text-accent" />
              5. Purpose of Platform
            </h2>
            <p>The Platform provides a comprehensive set of academic access and discovery services designed to help users find, organize, and engage with scholarly content more efficiently:</p>
            <ul>
              <li><strong>Aggregation:</strong> Content from multiple verified sources into a single, unified platform.</li>
              <li><strong>Indexing:</strong> Journals, articles, books, case studies, videos, and other academic resources for easier retrieval.</li>
              <li><strong>Discovery Tools:</strong> Advanced search, subject categorization, filters, and recommendation features.</li>
              <li><strong>Integrated Access:</strong> Bringing together proprietary and legally sourced open-access content in one place.</li>
            </ul>
            <p>{COMPANY_DETAILS.legalName} provides the platform service. Rights in third-party content remain with the respective rights holders.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Mail size={20} aria-hidden="true" className="shrink-0 text-accent" />
              6. Copyright & Takedown
            </h2>
            <p>If you are a copyright holder and believe that any content available on the Platform infringes your intellectual property rights, please use our <Link to="/content-removal" className="font-semibold">content removal form</Link>, which creates a tracked reference and a dated response commitment. You may also write to <strong>{COMPANY_DETAILS.email}</strong>. In either case, please include:</p>
            <ul>
              <li>Your full name and organization name</li>
              <li>Proof of ownership or authorization to act on behalf of the copyright holder</li>
              <li>A clear description of the content you believe is infringing</li>
              <li>The exact URL or location of the content on the Platform</li>
              <li>A statement explaining why you believe the content should be removed</li>
            </ul>
            <p>Once we receive a valid request, we will acknowledge it, review it within <strong>7 days</strong>, and take appropriate action in accordance with applicable copyright laws and our internal takedown procedures.</p>
          </section>
        </article>
      </div>
    </div>
  );
};
