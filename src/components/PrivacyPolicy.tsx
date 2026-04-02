import React from "react";
import { COMPANY_DETAILS } from "../config";
import { Shield, Lock, Eye, FileText } from "lucide-react";

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-slate-400">Last Updated: April 2, 2026</p>
        </div>

        <div className="p-8 prose prose-slate max-w-none">
          <p className="text-lg text-slate-600 leading-relaxed mb-8">
            At <strong>{COMPANY_DETAILS.name}</strong>, we value your privacy and are committed to protecting your personal data. This Privacy Policy outlines how we collect, use, and safeguard your information when you use our platform, <strong>Journals Library</strong>.
          </p>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Eye className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">1. Data Collection</h2>
            </div>
            <p>We collect information that you provide directly to us when you register for an account, subscribe to our services, or communicate with us. This includes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Identifiers:</strong> Name, email address, phone number, and mailing address.</li>
              <li><strong>Account Credentials:</strong> Usernames and passwords.</li>
              <li><strong>Payment Information:</strong> Transaction details and billing information (processed securely via our payment partners).</li>
              <li><strong>Usage Data:</strong> Information about how you interact with our digital library, including search queries and accessed content.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">2. How We Use Your Data</h2>
            </div>
            <p>Your data is used to provide and improve our services, including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Managing your subscriptions and providing access to academic content.</li>
              <li>Processing payments and sending invoices.</li>
              <li>Communicating updates, newsletters, and promotional offers (with your consent).</li>
              <li>Analyzing platform usage to enhance user experience and content relevance.</li>
              <li>Complying with legal obligations and preventing fraudulent activities.</li>
            </ul>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Shield className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">3. Cookies & Tracking</h2>
            </div>
            <p>We use cookies and similar tracking technologies to track activity on our platform and hold certain information. Cookies help us remember your preferences and provide a personalized experience. You can instruct your browser to refuse all cookies, but some parts of our platform may not function correctly.</p>
          </section>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Lock className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold m-0">4. Third-Party Services</h2>
            </div>
            <p>We may employ third-party companies and individuals to facilitate our service, provide the service on our behalf, or assist us in analyzing how our service is used. These third parties have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.</p>
            <p className="mt-2">Key partners include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Payment Gateways:</strong> For secure transaction processing.</li>
              <li><strong>Analytics Providers:</strong> For understanding platform performance.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">5. Data Security</h2>
            <p>The security of your data is important to us. We implement reasonable security practices and procedures as per the <strong>Information Technology Act, 2000</strong> and its rules. However, remember that no method of transmission over the Internet or method of electronic storage is 100% secure.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">6. Your Rights</h2>
            <p>Under Indian law, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access and review the personal data we hold about you.</li>
              <li>Request correction of inaccurate or incomplete data.</li>
              <li>Request deletion of your data (subject to legal and contractual obligations).</li>
              <li>Withdraw consent for data processing at any time.</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">7. Children's Privacy</h2>
            <p>Our services are not intended for use by children under the age of 13. We do not knowingly collect personally identifiable information from children. If you are a parent or guardian and you are aware that your child has provided us with personal data, please contact us.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">8. Legal Compliance</h2>
            <p>This Privacy Policy is governed by and construed in accordance with the laws of India, including the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011.</p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-slate-900 mb-4">9. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact our Grievance Officer at:</p>
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
