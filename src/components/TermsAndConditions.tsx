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
          <p className="text-lg text-slate-600 leading-relaxed mb-8">
            Welcome to <strong>Journals Library</strong>, a subscription-based academic digital library operated by <strong>{COMPANY_DETAILS.name}</strong>. By accessing or using our platform, you agree to comply with and be bound by the following Terms and Conditions.
          </p>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">1. Platform Nature & User Obligations</h2>
            </div>
            <p>Our platform provides access to academic journals, research papers, and digital content. As a user, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information during registration.</li>
              <li>Maintain the confidentiality of your account credentials.</li>
              <li>Use the platform only for lawful, academic, and research purposes.</li>
              <li><strong>Prohibited Content:</strong> You must not upload, share, or transmit any content that is illegal, offensive, anti-national, defamatory, or harmful to others.</li>
              <li><strong>No Misuse:</strong> You shall not attempt to gain unauthorized access to our systems, scrape data, or interfere with the platform's functionality.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">2. Content Rights & Licensing</h2>
            </div>
            <p>By submitting or publishing content on our platform, you grant <strong>{COMPANY_DETAILS.name}</strong> a non-exclusive, worldwide, royalty-free, and sub-licensable license to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Publish, reproduce, and distribute the content across our digital network.</li>
              <li>Monetize the content through subscriptions, open access fees, or other commercial models.</li>
              <li>Modify the format of the content for technical optimization and accessibility.</li>
              <li><strong>Commercial Control:</strong> The platform retains full control over the commercial rights and distribution strategies of the content hosted on its servers.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">3. Payment & Subscription</h2>
            </div>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Subscription Validity:</strong> Access to premium content is granted based on the selected subscription plan and validity period.</li>
              <li><strong>Pricing:</strong> All prices are subject to change at the sole discretion of the platform. Applicable GST (currently 18%) will be added to all transactions.</li>
              <li><strong>Refund Policy:</strong> All subscription payments are final. <strong>No refunds</strong> will be provided once access has been granted, except in cases of technical failure on our end that prevents access for an extended period (subject to verification).</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Scale className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">4. Limitation of Liability</h2>
            </div>
            <p><strong>Journals Library</strong> acts as an intermediary platform for academic content. We are not responsible for the accuracy, reliability, or legality of third-party content hosted on our site. Our liability is limited to the maximum extent permitted by law, and we shall not be liable for any indirect, incidental, or consequential damages.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">5. Termination</h2>
            <p>We reserve the right to suspend or terminate your account and remove any content at any time, without prior notice, if we believe you have violated these terms or engaged in activities harmful to the platform or other users.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">6. Jurisdiction</h2>
            </div>
            <p>These Terms and Conditions are governed by the laws of India. Any disputes arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the courts in <strong>Noida, Uttar Pradesh, India</strong>.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">7. Contact Information</h2>
            <p>For any legal inquiries or clarifications regarding these terms, please reach out to us at:</p>
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-bold">{COMPANY_DETAILS.name}</p>
              <p>{COMPANY_DETAILS.address}</p>
              <p>Email: {COMPANY_DETAILS.email}</p>
              <p>Tel: {COMPANY_DETAILS.tel.join(" / ")}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
