import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "react-hot-toast";
import { motion } from "motion/react";
import {
  ShieldCheck, FileWarning, Clock, CheckCircle2, Send, Mail, ChevronRight,
} from "lucide-react";
import { COMPANY_DETAILS } from "../config";

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

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm outline-none " +
  "focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all";

const labelClass = "block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2";

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
      toast.error(err.message || "Could not submit. Please email us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    const due = new Date(receipt.dueAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
    return (
      <div className="min-h-screen bg-slate-50 py-24">
        <Helmet><title>Request Received | STM Digital Library</title></Helmet>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8"
        >
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">Request received</h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Your request has been logged. Please quote this reference in any further
              correspondence.
            </p>
            <div className="my-8 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Reference</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-slate-900">
                {receipt.reference}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              We will review this and respond by <strong className="text-slate-900">{due}</strong>.
              A confirmation has been emailed to you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/"
                className="rounded-full bg-slate-900 px-7 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800"
              >
                Back to Home
              </Link>
              <Link
                to="/content-sources"
                className="rounded-full border border-slate-200 bg-white px-7 py-3 text-sm font-bold text-slate-700 transition-all hover:border-slate-300"
              >
                Read our content policy
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Content Removal Request | STM Digital Library</title>
        <meta
          name="description"
          content="Rights holders, publishers and authors can request removal, restriction or correction of content listed on STM Digital Library."
        />
      </Helmet>

      {/* Hero */}
      <section className="border-b border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <nav className="mb-6 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Link to="/" className="hover:text-slate-700">Home</Link>
            <ChevronRight size={12} />
            <span className="text-slate-700">Content Removal</span>
          </nav>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-blue-700">
            <ShieldCheck size={13} />
            Rights Holder Notice
          </div>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Request removal of content
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
            We index openly available academic material. If you hold rights in something listed
            here and want it removed, restricted or corrected, use this form. It reaches the team
            directly and creates a tracked reference — you will not be routed through general
            support.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Clock, title: "Reviewed within 7 days", desc: "Every request gets a reference and a dated response commitment." },
              { icon: FileWarning, title: "No account needed", desc: "You do not have to be a user of the platform to file a request." },
              { icon: ShieldCheck, title: "Logged and auditable", desc: "We record when a notice arrives and what action followed." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <Icon size={18} className="text-blue-600" />
                <h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-8">

            {/* 1 — Requester */}
            <fieldset className="rounded-3xl border border-slate-200 bg-white p-8">
              <legend className="px-2 text-xs font-bold uppercase tracking-widest text-blue-600">
                About you
              </legend>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="requesterName">Full name *</label>
                  <input id="requesterName" required value={form.requesterName}
                         onChange={set("requesterName")} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="requesterEmail">Email *</label>
                  <input id="requesterEmail" type="email" required value={form.requesterEmail}
                         onChange={set("requesterEmail")} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="organization">Organisation</label>
                  <input id="organization" value={form.organization}
                         onChange={set("organization")} className={inputClass}
                         placeholder="Publisher, university or society" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="requesterPhone">Phone</label>
                  <input id="requesterPhone" value={form.requesterPhone}
                         onChange={set("requesterPhone")} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="capacity">You are acting as *</label>
                  <select id="capacity" value={form.capacity} onChange={set("capacity")}
                          className={inputClass}>
                    {CAPACITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {form.capacity === "Other" && (
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="capacityOther">Please describe *</label>
                    <input id="capacityOther" required value={form.capacityOther}
                           onChange={set("capacityOther")} className={inputClass} />
                  </div>
                )}
              </div>
            </fieldset>

            {/* 2 — The content */}
            <fieldset className="rounded-3xl border border-slate-200 bg-white p-8">
              <legend className="px-2 text-xs font-bold uppercase tracking-widest text-blue-600">
                The content
              </legend>
              <div className="mt-4 flex flex-col gap-5">
                <div>
                  <label className={labelClass} htmlFor="contentUrl">
                    Page address on this site *
                  </label>
                  <input id="contentUrl" required value={form.contentUrl}
                         onChange={set("contentUrl")} className={inputClass}
                         placeholder="https://journalslibrary.com/preview/..." />
                  <p className="mt-2 text-xs text-slate-500">
                    Copy the address from your browser's address bar. One request per item —
                    if several items are affected, list the rest under additional information.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="contentTitle">Title of the work</label>
                    <input id="contentTitle" value={form.contentTitle}
                           onChange={set("contentTitle")} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="identifier">DOI, ISSN or ISBN</label>
                    <input id="identifier" value={form.identifier}
                           onChange={set("identifier")} className={inputClass}
                           placeholder="10.1000/xyz123" />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* 3 — The claim */}
            <fieldset className="rounded-3xl border border-slate-200 bg-white p-8">
              <legend className="px-2 text-xs font-bold uppercase tracking-widest text-blue-600">
                Your claim
              </legend>
              <div className="mt-4 flex flex-col gap-6">
                <div>
                  <label className={labelClass} htmlFor="ownershipBasis">
                    What rights do you hold, and how? *
                  </label>
                  <textarea id="ownershipBasis" required rows={4} value={form.ownershipBasis}
                            onChange={set("ownershipBasis")} className={inputClass}
                            placeholder="For example: we are the publisher of this journal and hold exclusive distribution rights under an agreement with the author." />
                </div>

                <div>
                  <span className={labelClass}>What would you like us to do? *</span>
                  <div className="flex flex-col gap-3">
                    {ACTIONS.map(a => (
                      <label
                        key={a.value}
                        className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-all ${
                          form.requestedAction === a.value
                            ? "border-blue-500 bg-blue-50/60 ring-4 ring-blue-500/5"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio" name="requestedAction" value={a.value}
                          checked={form.requestedAction === a.value}
                          onChange={set("requestedAction")}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                        />
                        <span>
                          <span className="block text-sm font-bold text-slate-900">{a.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{a.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.requestedAction === "Other" && (
                  <div>
                    <label className={labelClass} htmlFor="requestedActionOther">
                      Tell us what you need *
                    </label>
                    <input id="requestedActionOther" required value={form.requestedActionOther}
                           onChange={set("requestedActionOther")} className={inputClass} />
                  </div>
                )}

                <div>
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
            <fieldset className="rounded-3xl border border-slate-200 bg-white p-8">
              <legend className="px-2 text-xs font-bold uppercase tracking-widest text-blue-600">
                Declarations
              </legend>
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-slate-600">
                  <input type="checkbox" checked={goodFaith}
                         onChange={e => setGoodFaith(e.target.checked)}
                         className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                  <span>
                    I believe in good faith that the use of the material described above is not
                    authorised by the rights holder, its agent, or the law.
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-slate-600">
                  <input type="checkbox" checked={accuracy}
                         onChange={e => setAccuracy(e.target.checked)}
                         className="mt-1 h-4 w-4 shrink-0 accent-blue-600" />
                  <span>
                    The information in this request is accurate, and I am the rights holder or am
                    authorised to act on their behalf.
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-slate-500">
                Prefer email? Write to{" "}
                <a href={`mailto:${COMPANY_DETAILS.email}`} className="font-bold text-blue-600 hover:underline">
                  {COMPANY_DETAILS.email}
                </a>{" "}
                with the same details.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="flex shrink-0 items-center gap-2 rounded-full bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={16} />
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>

          <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <Mail size={18} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-xs leading-relaxed text-slate-500">
                Submitting this form does not by itself constitute an admission of liability, nor
                does it waive any right of either party. Our approach to sourcing and licensing is
                set out in{" "}
                <Link to="/content-sources" className="font-bold text-blue-600 hover:underline">
                  Content Sources
                </Link>{" "}
                and{" "}
                <Link to="/legal-disclaimer" className="font-bold text-blue-600 hover:underline">
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
