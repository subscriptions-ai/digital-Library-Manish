import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Scale, Info, Mail } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export const LegalDisclaimer: React.FC = () => {
  return (
    <div className="bg-ground">
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Legal Disclaimer</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">Last Updated: April 27, 2026</p>
        </div>
      </section>

      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Info size={20} aria-hidden="true" className="shrink-0 text-accent" />
              Nature of Content
            </h2>
            <p>The Platform provides access to academic material sourced from open-access repositories and from publishers who have agreed to be listed. Rights in that material belong to its authors, publishers and other rights holders.</p>
            <p>What <strong>{COMPANY_DETAILS.legalName}</strong> owns is the Platform itself — the software, the interface, the indexing and the tools built around the material. It does not own the material.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Scale size={20} aria-hidden="true" className="shrink-0 text-accent" />
              No Guarantees
            </h2>
            <p>While reasonable efforts are made to ensure that third-party content is used in accordance with applicable licenses and permissions, the Platform does not guarantee the completeness, accuracy, legality, or continued availability of such third-party content at all times.</p>
            <p>All third-party materials remain the intellectual property of their respective authors, publishers, or rights holders. The inclusion of any such content on the Platform does not imply ownership, endorsement, or exclusive rights by the Platform.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Info size={20} aria-hidden="true" className="shrink-0 text-accent" />
              Service Model
            </h2>
            <p>The Platform operates as a value-added academic discovery and access service. What the Platform provides is aggregation, indexing, search, curation, and access tools — not a sale of third-party content.</p>
            <p>Users are responsible for ensuring that their use of any content complies with applicable copyright laws, license terms, and other legal requirements.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <ShieldAlert size={20} aria-hidden="true" className="shrink-0 text-accent" />
              Third-Party Links & Safety
            </h2>
            <p>The Company does not control or endorse third-party websites and shall not be held responsible for any anti-national, pornographic, religiously sensitive, defamatory, unlawful, or otherwise inappropriate content that may appear on such third-party websites or external links.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Mail size={20} aria-hidden="true" className="shrink-0 text-accent" />
              Rights Holders & Takedowns
            </h2>
            <p>If you are a rights holder and believe that any content available on the Platform infringes your rights, please use our <Link to="/content-removal" className="font-semibold">content removal form</Link> or write to <strong>{COMPANY_DETAILS.email}</strong>. Every request receives a reference number and is reviewed within 7 days, in accordance with applicable laws.</p>
          </section>

          <section className="space-y-4 border-t border-rule pt-8">
            <h2 className="mt-0">Limitation of Liability</h2>
            <p>The Platform shall not be held liable for any damages arising from the use of, reliance on, or access to third-party content, including but not limited to inaccuracies, omissions, or copyright issues.</p>
          </section>
        </article>
      </div>
    </div>
  );
};
