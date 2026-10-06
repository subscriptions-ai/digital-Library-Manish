import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "react-hot-toast";
import { motion } from "motion/react";
import {
  ShieldCheck, FileWarning, Clock, CheckCircle2, Send, Mail, ChevronRight,
} from "lucide-react";
import { COMPANY_DETAILS } from "../config";
import { Button, buttonClass, friendlyError } from "./ui";

const CAPACITIES = [
  { value: "RightsHolder",   label: "I am the rights holder" },
  { value: "AuthorisedAgent", label: "I am authorised to act for the rights holder" },
  { value: "Author",         label: "I am the author of this work" },
  { value: "Other",          label: "Other" },
];

const ACTIONS = [
  {
    value: "RemoveEntirely",
    label: "Remove the listing entirely",
    hint: "The record and any linked file are taken down.",
  },
  {
    value: "RemoveFileKeepMetadata",
    label: "Remove the file, keep citation metadata",
    hint: "The full text stops being reachable; title, authors and DOI remain for discovery.",
  },
  {
    value: "AddAttribution",
    label: "Correct or add attribution",
    hint: "The work stays, with the credit or licence notice you specify.",
  },
  { value: "Other", label: "Something else", hint: "Tell us what you need below." },
];

const inputClass = "input";

const labelClass = "field-label";

const fieldsetClass = "card card-pad";
const legendClass = "px-2 text-xs font-bold uppercase tracking-wider text-accent";

const EMPTY = {
  requesterName: "", requesterEmail: "", requesterPhone: "", organization: "",
  capacity: "RightsHolder", capacityOther: "",
  contentUrl: "", contentTitle: "", identifier: "",
  ownershipBasis: "", requestedAction: "RemoveEntirely", requestedActionOther: "",
  additionalInfo: "",
};

export function ContentRemoval() {
  const [form, setForm] = useState(EMPTY);
  const [goodFaith, setGoodFaith] = useState(false);
  const [accuracy, setAccuracy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ reference: string; dueAt: string } | null>(null);

  const set = (k: keyof typeof EMPTY) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodFaith || !accuracy) {
      toast.error("Please confirm both declarations before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/takedown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, goodFaithDeclared: goodFaith, accuracyDeclared: accuracy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setReceipt({ reference: data.reference, dueAt: data.dueAt });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast.error(friendlyError(err, "Could not submit. Please email us directly."));
    } finally {
      setSubmitting(false);
    }
  };


  if (receipt) {
    const due = new Date(receipt.dueAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    return (
      <div className="min-h-screen bg-ground py-16 sm:py-24">
        <Helmet><title>Request Received | STM Digital Library</title></Helmet>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="container-public max-w-2xl"
        >
          <div className="card p-6 text-center sm:p-10">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-success-soft text-success" aria-hidden="true">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">Request received</h1>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              Your request has been logged. Please quote this reference in any further
              correspondence.
            </p>
            <div className="my-8 rounded-xl border border-rule bg-surface-2 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Reference</p>
              <p className="mt-1 break-all font-mono text-2xl font-bold tracking-tight text-ink">
                {receipt.reference}
              </p>
            </div>
            <p className="text-sm text-ink-2">
              We will review this and respond by <strong className="text-ink">{due}</strong>.
              A confirmation has been emailed to you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/" className={buttonClass("brand")}>
                Back to Home
              </Link>
              <Link to="/content-sources" className={buttonClass("outline")}>
                Read our content policy
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      <Helmet>
        <title>Content Removal Request | STM Digital Library</title>
        <meta
          name="description"
          content="Rights holders, publishers and authors can request removal, restriction or correction of content listed on STM Digital Library."
        />
      </Helmet>

      {/* Hero */}
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <nav aria-label="Breadcrumb" className="on-dark-3 mb-6 flex items-center justify-center gap-1.5 text-xs font-medium">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span className="on-dark-2" aria-current="page">Content Removal</span>
          </nav>
          <p className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
            Rights Holder Notice
          </p>
          <h1 className="on-dark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            Request removal of content
          </h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            We index openly available academic material. If you hold rights in something listed
            here and want it removed, restricted or corrected, use this form. It reaches the team
            directly and creates a tracked reference — you will not be routed through general
            support.
          </p>
        </div>
      </section>

      <section className="container-public max-w-3xl pt-12 sm:pt-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Clock, title: "Reviewed within 7 days", desc: "Every request gets a reference and a dated response commitment." },
            { icon: FileWarning, title: "No account needed", desc: "You do not have to be a user of the platform to file a request." },
            { icon: ShieldCheck, title: "Logged and auditable", desc: "We record when a notice arrives and what action followed." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                <Icon size={18} />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="py-12 sm:py-16">
        <div className="container-public max-w-3xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* 1 — Requester */}
            <fieldset className={fieldsetClass}>
              <legend className={legendClass}>
                About you
              </legend>
              <div className="mt-2 grid gap-5 sm:grid-cols-2">
                <div className="field">
                  <label className={labelClass} htmlFor="requesterName">Full name <span className="req" aria-hidden="true">*</span></label>
                  <input id="requesterName" required value={form.requesterName}
                         onChange={set("requesterName")} className={inputClass} />
                </div>
                <div className="field">
                  <label className={labelClass} htmlFor="requesterEmail">Email <span className="req" aria-hidden="true">*</span></label>
                  <input id="requesterEmail" type="email" required value={form.requesterEmail}
                         onChange={set("requesterEmail")} className={inputClass} />
                </div>
                <div className="field">
                  <label className={labelClass} htmlFor="organization">Organisation</label>
                  <input id="organization" value={form.organization}
                         onChange={set("organization")} className={inputClass}
                         placeholder="Publisher, university or society" />
                </div>
                <div className="field">
                  <label className={labelClass} htmlFor="requesterPhone">Phone</label>
                  <input id="requesterPhone" value={form.requesterPhone}
                         onChange={set("requesterPhone")} className={inputClass} />
                </div>
                <div className="field sm:col-span-2">
                  <label className={labelClass} htmlFor="capacity">You are acting as <span className="req" aria-hidden="true">*</span></label>
                  <select id="capacity" value={form.capacity} onChange={set("capacity")}
                          className={inputClass}>
                    {CAPACITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {form.capacity === "Other" && (
                  <div className="field sm:col-span-2">
                    <label className={labelClass} htmlFor="capacityOther">Please describe <span className="req" aria-hidden="true">*</span></label>
                    <input id="capacityOther" required value={form.capacityOther}
                           onChange={set("capacityOther")} className={inputClass} />
                  </div>
                )}
              </div>
            </fieldset>

            {/* 2 — The content */}
            <fieldset className={fieldsetClass}>
              <legend className={legendClass}>
                The content
              </legend>
              <div className="mt-2 flex flex-col gap-5">
                <div className="field">
                  <label className={labelClass} htmlFor="contentUrl">
                    Page address on this site <span className="req" aria-hidden="true">*</span>
                  </label>
                  <input id="contentUrl" required value={form.contentUrl}
                         onChange={set("contentUrl")} className={inputClass}
                         aria-describedby="contentUrl-help"
                         placeholder="https://journalslibrary.com/preview/..." />
                  <p id="contentUrl-help" className="field-help">
                    Copy the address from your browser's address bar. One request per item —
                    if several items are affected, list the rest under additional information.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="field">
                    <label className={labelClass} htmlFor="contentTitle">Title of the work</label>
                    <input id="contentTitle" value={form.contentTitle}
                           onChange={set("contentTitle")} className={inputClass} />
                  </div>
                  <div className="field">
                    <label className={labelClass} htmlFor="identifier">DOI, ISSN or ISBN</label>
                    <input id="identifier" value={form.identifier}
                           onChange={set("identifier")} className={inputClass}
                           placeholder="10.1000/xyz123" />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* 3 — The claim */}
            <fieldset className={fieldsetClass}>
              <legend className={legendClass}>
                Your claim
              </legend>
              <div className="mt-2 flex flex-col gap-6">
                <div className="field">
                  <label className={labelClass} htmlFor="ownershipBasis">
                    What rights do you hold, and how? <span className="req" aria-hidden="true">*</span>
                  </label>
                  <textarea id="ownershipBasis" required rows={4} value={form.ownershipBasis}
                            onChange={set("ownershipBasis")} className={inputClass}
                            placeholder="For example: we are the publisher of this journal and hold exclusive distribution rights under an agreement with the author." />
                </div>

                <div role="radiogroup" aria-labelledby="requestedAction-label" className="field">
                  <span id="requestedAction-label" className={labelClass}>What would you like us to do? <span className="req" aria-hidden="true">*</span></span>
                  <div className="flex flex-col gap-3">
                    {ACTIONS.map(a => (
                      <label
                        key={a.value}
                        className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors duration-150 ${
                          form.requestedAction === a.value
                            ? "border-accent bg-accent-soft"
                            : "border-rule bg-surface hover:border-rule-2"
                        }`}
                      >
                        <input
                          type="radio" name="requestedAction" value={a.value}
                          checked={form.requestedAction === a.value}
                          onChange={set("requestedAction")}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-ink">{a.label}</span>
                          <span className="mt-0.5 block text-sm leading-relaxed text-muted">{a.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.requestedAction === "Other" && (
                  <div className="field">
                    <label className={labelClass} htmlFor="requestedActionOther">
                      Tell us what you need <span className="req" aria-hidden="true">*</span>
                    </label>
                    <input id="requestedActionOther" required value={form.requestedActionOther}
                           onChange={set("requestedActionOther")} className={inputClass} />
                  </div>
                )}

                <div className="field">
                  <label className={labelClass} htmlFor="additionalInfo">
                    Additional information
                  </label>
                  <textarea id="additionalInfo" rows={3} value={form.additionalInfo}
                            onChange={set("additionalInfo")} className={inputClass}
                            placeholder="Other affected URLs, licence details, or anything else that will help us review this quickly." />
                </div>
              </div>
            </fieldset>

            {/* 4 — Declarations */}
            <fieldset className={fieldsetClass}>
              <legend className={legendClass}>
                Declarations
              </legend>
              <div className="mt-2 flex flex-col gap-4">
                <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-ink-2">
                  <input type="checkbox" checked={goodFaith}
                         onChange={e => setGoodFaith(e.target.checked)}
                         className="mt-1 h-4 w-4 shrink-0 accent-accent" />
                  <span>
                    I believe in good faith that the use of the material described above is not
                    authorised by the rights holder, its agent, or the law.
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-ink-2">
                  <input type="checkbox" checked={accuracy}
                         onChange={e => setAccuracy(e.target.checked)}
                         className="mt-1 h-4 w-4 shrink-0 accent-accent" />
                  <span>
                    The information in this request is accurate, and I am the rights holder or am
                    authorised to act on their behalf.
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-muted">
                Prefer email? Write to{" "}
                <a href={`mailto:${COMPANY_DETAILS.email}`} className="break-all font-semibold text-accent hover:underline">
                  {COMPANY_DETAILS.email}
                </a>{" "}
                with the same details.
              </p>
              <Button type="submit" variant="brand" size="lg" loading={submitting} className="shrink-0">
                {!submitting && <Send size={16} aria-hidden="true" />}
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>

          <div className="mt-12 rounded-xl border border-rule bg-surface-2 p-5">
            <div className="flex items-start gap-3">
              <Mail size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-muted">
                Submitting this form does not by itself constitute an admission of liability, nor
                does it waive any right of either party. Our approach to sourcing and licensing is
                set out in{" "}
                <Link to="/content-sources" className="font-semibold text-accent hover:underline">
                  Content Sources
                </Link>{" "}
                and{" "}
                <Link to="/legal-disclaimer" className="font-semibold text-accent hover:underline">
                  Legal Disclaimer
                </Link>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
