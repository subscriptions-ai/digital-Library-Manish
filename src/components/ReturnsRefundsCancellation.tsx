import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  RefreshCcw,
  ShieldCheck,
  CreditCard,
  Building2,
  User,
  AlertCircle,
  Clock,
  Mail,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { COMPANY_DETAILS } from "../config";

/**
 * Returns, Refunds & Cancellation Policy Page
 *
 * Outlines subscription refund eligibility, institutional and solo purchase terms,
 * duplicate transaction resolutions, and cancellation request procedures for STM Digital Library.
 *
 * NOTE: Specific commercial terms (such as partial pro-rata refunds and cooling-off intervals)
 * require definitive business policy confirmation.
 * TODO: REFUND_POLICY_BUSINESS_APPROVAL
 */
export const ReturnsRefundsCancellation: React.FC = () => {
  return (
    <div className="bg-ground">
      <Helmet>
        <title>Returns, Refunds &amp; Cancellation Policy — STM Digital Library</title>
        <meta
          name="description"
          content="Subscription cancellation, refund eligibility, and payment dispute policy for STM Digital Library institutional and individual learner accounts."
        />
      </Helmet>

      {/* Hero Header */}
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">
            Returns, Refunds &amp; Cancellation Policy
          </h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base">
            STM Digital Library · Operated by {COMPANY_DETAILS.operatorDisplayName}
          </p>
          <p className="on-dark-2 mx-auto mt-1 text-xs">Last Updated: October 8, 2026</p>
        </div>
      </section>

      {/* Main Content */}
      <div className="container-public py-12 sm:py-16">
        <article className="prose-page mx-auto [&>section:first-child>h2]:mt-0 space-y-8">
          {/* 1. Introduction & Digital Nature of Services */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-accent" />
              1. Overview &amp; Digital Service Nature
            </h2>
            <p className="text-ink-2 leading-relaxed">
              This Policy outlines the terms governing cancellations, refunds, and payment adjustments for digital subscriptions,
              institutional access packages, and individual memberships provided on <strong>{COMPANY_DETAILS.name}</strong> (&ldquo;the Platform&rdquo;),
              operated by <strong>{COMPANY_DETAILS.legalName}</strong> (&ldquo;the Company&rdquo;).
            </p>
            <p className="text-ink-2 leading-relaxed">
              Because the Platform delivers digital scholarly literature, indexing, and online research database access immediately
              upon provisioning, our cancellation and refund parameters differ from tangible physical goods. Please review these provisions
              carefully prior to completing your subscription order or executing a purchase agreement.
            </p>
          </section>

          {/* 2. Subscription Types & Activation */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Building2 size={20} aria-hidden="true" className="shrink-0 text-accent" />
              2. Subscription Categories &amp; Activation
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
              <div className="rounded-xl border border-rule bg-surface p-4">
                <div className="flex items-center gap-2 font-semibold text-ink mb-2">
                  <Building2 size={18} className="text-accent" />
                  Institutional Subscriptions
                </div>
                <p className="text-sm text-ink-2 leading-relaxed">
                  Provisioned via formal quotations, purchase orders, institutional licensing agreements, or bank transfers.
                  Access is typically configured campus-wide via IP authentication or librarian-managed student credentials for a 12-month term.
                </p>
              </div>

              <div className="rounded-xl border border-rule bg-surface p-4">
                <div className="flex items-center gap-2 font-semibold text-ink mb-2">
                  <User size={18} className="text-accent" />
                  Solo Learner &amp; Individual Access
                </div>
                <p className="text-sm text-ink-2 leading-relaxed">
                  Self-service digital subscriptions procured online (via Razorpay or authorized payment gateway) for selected
                  academic domains or comprehensive library access. Activation occurs automatically upon verified payment confirmation.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted">
              <strong>Activation Date:</strong> The effective activation date is the date on which digital access credentials, institutional IP ranges,
              or individual subscriber permissions are enabled in our database.
            </p>
          </section>

          {/* 3. Cancellation Policy */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <RefreshCcw size={20} aria-hidden="true" className="shrink-0 text-accent" />
              3. Cancellation Requests
            </h2>
            <p className="text-ink-2 leading-relaxed">
              Subscribers may request subscription cancellation subject to the following criteria:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-ink-2">
              <li>
                <strong>Individual Solo Subscriptions:</strong> You may cancel future automatic renewals at any time through your account dashboard or by writing to our support team. Upon cancellation, your existing access remains valid until the expiration of your prepaid annual billing period, after which it will not renew.
              </li>
              <li>
                <strong>Institutional Subscriptions:</strong> Cancellation of institutional contracts is governed strictly by the terms stipulated in the executed Service Level Agreement (SLA) or formal institutional procurement agreement signed between the institution and <strong>{COMPANY_DETAILS.legalName}</strong>.
              </li>
              <li>
                <strong>Pre-Activation Cancellation:</strong> If an order is cancelled in writing before digital access or institutional credentialing has been provisioned, the order may be eligible for cancellation and reversal subject to administrative processing fees.
              </li>
            </ul>
          </section>

          {/* 4. Refund Eligibility & Non-Refundable Cases */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <ShieldCheck size={20} aria-hidden="true" className="shrink-0 text-accent" />
              4. Refund Eligibility &amp; Non-Refundable Cases
            </h2>
            <div className="rounded-xl border border-rule bg-surface p-5 space-y-3">
              <h3 className="font-semibold text-ink flex items-center gap-2">
                <CheckCircle2 size={18} className="text-success" />
                Eligible Refund Situations
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-ink-2">
                <li><strong>Duplicate Transaction:</strong> Accidental double charge or multiple debits for the identical order or subscription term.</li>
                <li><strong>Billing Errors:</strong> Discrepancies between the authorized quotation amount and the actual charged figure.</li>
                <li><strong>Prolonged System Unavailability:</strong> Verified technical failure preventing platform access for an extended period, where resolution cannot be provided by our technical team within a reasonable timeframe.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-rule bg-surface p-5 space-y-3">
              <h3 className="font-semibold text-ink flex items-center gap-2">
                <AlertCircle size={18} className="text-caution" />
                Non-Refundable Circumstances
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-ink-2">
                <li>Change of mind after digital access credentials have been issued and active reading or downloading has occurred.</li>
                <li>Institutional budget reallocations or internal curriculum revisions taking place mid-way through an active subscription term.</li>
                <li>Accounts suspended or terminated due to violation of platform terms (such as abusive automated scraping, unauthorized credential sharing, or intellectual property infringement).</li>
                <li>Partial unused periods of an active annual plan, unless explicitly provided for in a customized institutional agreement.</li>
              </ul>
            </div>
          </section>

          {/* 5. Duplicate, Erroneous & Failed Transactions */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <CreditCard size={20} aria-hidden="true" className="shrink-0 text-accent" />
              5. Duplicate, Erroneous &amp; Failed Transactions
            </h2>
            <p className="text-ink-2 leading-relaxed">
              If your bank account or credit card has been debited but your account does not reflect an active subscription due to a payment gateway
              timeout or communication failure:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-ink-2">
              <li>Payment gateways automatically reconcile failed transactions and reverse debits within <strong>3 to 5 business days</strong>.</li>
              <li>In the event of an unintended duplicate payment, please email us at <strong>{COMPANY_DETAILS.email}</strong> with your payment receipts or transaction IDs. Upon verification, the duplicate charge will be refunded promptly.</li>
            </ul>
          </section>

          {/* 6. Refund Processing Timeline */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Clock size={20} aria-hidden="true" className="shrink-0 text-accent" />
              6. Refund Processing &amp; Payout Timelines
            </h2>
            <p className="text-ink-2 leading-relaxed">
              Once an eligible refund request is approved in writing by our accounts department:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-ink-2">
              <li>Refunds are initiated within <strong>5 to 7 business days</strong> of approval.</li>
              <li>Refunded amounts are credited directly to the <strong>original payment method</strong> (e.g. source credit card, debit card, UPI handle, or net-banking account) in accordance with bank and RBI processing schedules.</li>
              <li>For institutional NEFT/RTGS payments, refunds are remitted to the verified institutional bank account after receipt of an official institutional confirmation letter.</li>
            </ul>
          </section>

          {/* 7. Business Approval Notice (Internal Tag) */}
          <section className="space-y-3 rounded-xl border border-rule-2 bg-surface-2 p-4 text-xs text-muted">
            <p className="font-semibold text-ink">Administrative &amp; Policy Notice</p>
            <p>
              Custom institutional agreements, consortia purchase concessions, and tailored trial programs supersede default website clauses
              where explicitly documented in written contracts executed by <strong>{COMPANY_DETAILS.legalName}</strong>.
            </p>
            <p className="text-faint">
              {/* TODO: REFUND_POLICY_BUSINESS_APPROVAL — commercial cooling-off window and pro-rata tier adjustments are subject to ongoing business committee confirmation. */}
              Reference policy version 1.0 (Digital Library Subscriptions).
            </p>
          </section>

          {/* 8. Contact & Claims Submission */}
          <section className="space-y-4 border-t border-rule pt-8">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
              <Mail size={20} aria-hidden="true" className="shrink-0 text-accent" />
              7. How to Submit a Refund or Cancellation Request
            </h2>
            <p className="text-ink-2 leading-relaxed">
              To request a refund, dispute a transaction, or enquire regarding subscription cancellation, please submit your request to our accounts team:
            </p>
            <div className="rounded-xl border border-rule bg-surface p-5 text-sm text-ink-2 space-y-1">
              <p className="font-semibold text-ink">{COMPANY_DETAILS.legalName}</p>
              <p className="text-muted">{COMPANY_DETAILS.salesOfficeLabel}: {COMPANY_DETAILS.address}</p>
              <p className="text-muted">Telephone: {COMPANY_DETAILS.tel.join(" / ")}</p>
              <p className="text-muted">Email: <a href={`mailto:${COMPANY_DETAILS.email}`} className="text-accent underline">{COMPANY_DETAILS.email}</a></p>
              <p className="text-muted pt-2 text-xs">
                Please include: Subscriber Name, Account Email, Order/Invoice Number, Transaction Date, and Reason for Request.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 pt-4 text-sm">
              <Link to="/terms-and-conditions" className="text-accent hover:underline">Terms &amp; Conditions →</Link>
              <Link to="/privacy-policy" className="text-accent hover:underline">Privacy Policy →</Link>
              <Link to="/legal-disclaimer" className="text-accent hover:underline">Legal Disclaimer →</Link>
              <Link to="/contact" className="text-accent hover:underline">Contact Support →</Link>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};

export default ReturnsRefundsCancellation;
