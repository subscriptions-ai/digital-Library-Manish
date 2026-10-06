import React from "react";
import { COMPANY_DETAILS } from "../config";
import { Shield, Lock, Eye, FileText } from "lucide-react";

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="bg-ground">
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Privacy Policy</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">Last Updated: April 2, 2026</p>
        </div>
      </section>

      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0">
          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Eye size={20} aria-hidden="true" className="shrink-0 text-accent" />
              1. Data We Collect
            </h2>
            <p>We may collect:</p>
            <ul>
              <li>Full name, email address, mobile number, and institution/organization details</li>
              <li>Usage data (IP address, device, browser)</li>
              <li>Account and access records</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              2. Legal Basis for Processing
            </h2>
            <p>We process data based on:</p>
            <ul>
              <li><strong>User consent</strong>, obtained through clear affirmative action when users create an account, register for our services, or voluntarily provide information, and which may be withdrawn at any time where applicable</li>
              <li><strong>Contractual necessity</strong>, where processing is required to create and manage user accounts, administer access rights, provide access to services and content, and fulfil our obligations under the applicable service agreement</li>
              <li><strong>Legitimate interests</strong>, where we process limited personal data to improve the performance, security, usability, and reliability of the Platform; analyze usage patterns and service trends; detect, prevent, and investigate fraud, abuse, or unauthorized activity; troubleshoot technical issues; and develop or refine our features and services, provided that such processing does not override your rights, interests, or freedoms</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              3. How We Use Data
            </h2>
            <ul>
              <li><strong>Creating, verifying, and managing user accounts:</strong> including user registration, login authentication, profile updates, password recovery, account preferences, and other account-related communications</li>
              <li><strong>Providing access to content:</strong> including enabling users to search, browse, view, download, and interact with the academic materials, resources, and services available on the Platform in accordance with their access permissions and applicable licensing terms</li>
              <li><strong>Improving the overall platform experience:</strong> by analyzing user behavior, monitoring system performance, identifying technical issues, optimizing navigation and search functionality, enhancing usability, personalizing content recommendations where applicable, and developing new features or improvements that make the Platform more efficient, reliable, and user-friendly</li>
              <li><strong>Communication and support:</strong> including responding to user inquiries, providing assistance with account access, access issues, technical problems, content-related questions, service notifications, feedback handling, and other customer support communications through email or other available support channels</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Lock size={20} aria-hidden="true" className="shrink-0 text-accent" />
              4. Data Sharing
            </h2>
            <p>We may share data with:</p>
            <ul>
              <li><strong>Hosting providers</strong>, cloud infrastructure vendors, and secure data storage partners that help us operate, maintain, and secure the Platform</li>
              <li><strong>Analytics services</strong> that help us understand how users interact with the Platform, measure performance, identify technical issues, improve functionality, and enhance the overall user experience, subject to applicable privacy laws and user consent where required</li>
              <li><strong>Legal authorities</strong>, regulatory bodies, courts, or law enforcement agencies, where disclosure is necessary to comply with applicable laws, regulations, legal processes, or lawful requests; to enforce our Terms and Conditions; to protect the rights, property, or safety of the Platform, our users, or others; or to investigate and prevent fraud, security incidents, abuse, or other unlawful activity</li>
            </ul>
            <p>We do not sell personal data to third parties for monetary consideration or any other commercial benefit. Any personal information collected through the Platform is used only for legitimate operational purposes, such as account management, service delivery, communication, analytics, security, and compliance with applicable legal obligations. We may share limited information with trusted service providers only to the extent necessary to operate and improve the Platform, and such sharing is always subject to confidentiality and data protection safeguards.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Shield size={20} aria-hidden="true" className="shrink-0 text-accent" />
              5. User Rights (GDPR Compliance)
            </h2>
            <p>Users have the right to:</p>
            <ul>
              <li>Access a copy of their personal data and the information we hold about them</li>
              <li>Request correction or update of any inaccurate, incomplete, or outdated personal data we hold about them</li>
              <li>Request deletion of their personal data, subject to applicable legal, regulatory, contractual, or legitimate business retention obligations, and ask us to erase, anonymize, or otherwise remove such data from our systems where deletion is permitted</li>
              <li>Withdraw consent at any time for any processing activities that rely on consent, with the understanding that such withdrawal will not affect the lawfulness of processing carried out before the withdrawal was received, and may limit our ability to continue providing certain services or features that depend on that consent</li>
            </ul>
            <p>For any questions regarding content licensing, copyright concerns, takedown requests, or general support related to the Platform, please contact us at {COMPANY_DETAILS.email}. We encourage copyright holders, authors, publishers, and users to share complete details of the issue, including the content title, URL, ownership claim, and any supporting documentation, so that we can review the matter carefully and respond in a timely and appropriate manner.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Lock size={20} aria-hidden="true" className="shrink-0 text-accent" />
              6. Data Retention
            </h2>
            <p>Data is retained for:</p>
            <ul>
              <li><strong>Active accounts:</strong> for the entire duration of the account's access period and for a reasonable period thereafter, as necessary to manage account administration, customer support, legal compliance, and service continuity.</li>
              <li><strong>Inactive accounts:</strong> up to 5 years after the account becomes inactive, is closed, or has had no meaningful user activity, unless a longer retention period is required by applicable law, regulatory obligations, dispute resolution, fraud prevention, or other legitimate business purposes. After this period, the data will be securely deleted or anonymized, wherever feasible.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Shield size={20} aria-hidden="true" className="shrink-0 text-accent" />
              7. Data Security
            </h2>
            <p>We implement:</p>
            <ul>
              <li><strong>Encryption of data</strong> both in transit and at rest using industry-standard security protocols to help protect sensitive information from unauthorized access, interception, or misuse.</li>
              <li><strong>Secure servers</strong> hosted in protected environments with regular monitoring, updates, and maintenance to reduce the risk of breaches, downtime, or data loss.</li>
              <li><strong>Access control mechanisms</strong> that restrict system and data access only to authorized personnel through role-based permissions, authentication checks, and audit trails.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <Eye size={20} aria-hidden="true" className="shrink-0 text-accent" />
              8. Cookies
            </h2>
            <p>We use cookies and similar tracking technologies to improve the functionality, performance, and overall user experience of our Platform. Cookies are small text files stored on your device when you visit our website.</p>
            <p>We use cookies for the following purposes:</p>
            <ul>
              <li><strong>Session management:</strong> to keep you logged in, maintain your session, and ensure smooth navigation across different pages of the Platform.</li>
              <li><strong>Analytics:</strong> to understand how users interact with our website, measure traffic, analyze usage patterns, and improve our services, content, and platform performance.</li>
              <li><strong>Preferences:</strong> to remember your settings and preferences so that your experience is more personalized and convenient.</li>
              <li><strong>Security:</strong> to help detect suspicious activity, prevent fraud, and protect user accounts and platform integrity.</li>
            </ul>
            <p>Some cookies may be essential for the proper functioning of the website, while others may be used for performance and analytics purposes. You may choose to disable cookies through your browser settings; however, doing so may affect certain features or the overall functionality of the Platform.</p>
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              9. Policy Updates
            </h2>
            <p>We may update this policy from time to time to reflect changes in our services, legal requirements, operational practices, or security standards. Any revisions will become effective once they are posted on this page, unless a different effective date is stated.</p>
            <p>We encourage users to review this policy periodically to stay informed about how we collect, use, and protect personal data. If we make any material changes that significantly affect your rights or the way we process your information, we may provide additional notice through the Platform, email, or other appropriate communication channels.</p>
            <p>Your continued use of the Platform after any updates are posted will constitute your acknowledgment of the revised policy and your agreement to be bound by it. If you do not agree with any updated terms, you should discontinue use of the Platform and contact us if you wish to exercise your data rights.</p>
          </section>
        </article>
      </div>
    </div>
  );
};
