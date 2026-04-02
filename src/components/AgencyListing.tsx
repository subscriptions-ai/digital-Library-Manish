import { motion } from "motion/react";
import { IndianRupee, RefreshCw, Library, Headphones, Activity, Handshake, Check, Send } from "lucide-react";
import { AGENCY_BENEFITS } from "../constants";
import React, { useState } from "react";
import { cn } from "../lib/utils";

const iconMap: Record<string, any> = {
  IndianRupee,
  RefreshCw,
  Library,
  Headphones,
  Activity,
  Handshake,
};

export function AgencyListing() {
  const [formData, setFormData] = useState({
    agencyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    region: "",
    experience: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Agency Inquiry:", formData);
    alert("Thank you for your interest! Our partnership team will contact you shortly.");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-24 text-white">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-blue-500 blur-[120px]" />
          <div className="absolute -right-1/4 -bottom-1/4 h-1/2 w-1/2 rounded-full bg-indigo-500 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Become a <span className="text-blue-400">Strategic Partner</span>
          </motion.h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Join India's fastest-growing academic digital library network. Empower institutions with world-class research content while building a sustainable, high-growth agency business.
          </p>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Why Partner With Us?</h2>
            <p className="mt-4 text-slate-600">We provide the tools, content, and support you need to succeed.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {AGENCY_BENEFITS.map((benefit, i) => {
              const Icon = iconMap[benefit.icon];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl bg-white p-8 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{benefit.title}</h3>
                  <p className="mt-3 text-slate-600 leading-relaxed">{benefit.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Partnership Process */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Our Partnership Process</h2>
              <p className="mt-4 text-slate-600">Simple, transparent, and designed for long-term success.</p>
              
              <div className="mt-12 space-y-8">
                {[
                  { step: "01", title: "Inquiry & Review", desc: "Submit your agency details. Our team reviews your profile and market reach." },
                  { step: "02", title: "Onboarding", desc: "Sign the partnership agreement and get access to your partner dashboard." },
                  { step: "03", title: "Training", desc: "Receive comprehensive product training and marketing collateral." },
                  { step: "04", title: "Launch", desc: "Start referring institutions and earn commissions on every successful subscription." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{item.title}</h4>
                      <p className="mt-1 text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="rounded-3xl bg-slate-50 p-8 md:p-12 border border-slate-200">
              <h3 className="text-2xl font-bold text-slate-900 mb-8 text-center">Agency Inquiry Form</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Agency Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                      value={formData.agencyName}
                      onChange={(e) => setFormData({...formData, agencyName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Contact Person</label>
                    <input 
                      type="text" 
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Email Address</label>
                    <input 
                      type="email" 
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Phone Number</label>
                    <input 
                      type="tel" 
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Operating Region(s) in India</label>
                  <input 
                    type="text" 
                    placeholder="e.g. North India, Maharashtra, Pan-India"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    value={formData.region}
                    onChange={(e) => setFormData({...formData, region: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Experience in Academic Sales</label>
                  <select 
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    value={formData.experience}
                    onChange={(e) => setFormData({...formData, experience: e.target.value})}
                  >
                    <option value="">Select Experience</option>
                    <option value="0-2">0-2 Years</option>
                    <option value="3-5">3-5 Years</option>
                    <option value="5-10">5-10 Years</option>
                    <option value="10+">10+ Years</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Additional Information</label>
                  <textarea 
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  Submit Partnership Inquiry
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-24 bg-slate-900 text-white">
        <div className="mx-auto max-max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold">Who Are We Looking For?</h2>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Subscription Agents", desc: "Established agents with a portfolio of academic journals and library services." },
              { title: "Education Consultants", desc: "Consultants helping institutions upgrade their digital infrastructure." },
              { title: "IT Resellers", desc: "Companies providing software and digital solutions to schools and colleges." }
            ].map((item, i) => (
              <div key={i} className="rounded-2xl bg-slate-800 p-8 border border-slate-700">
                <h4 className="text-xl font-bold text-blue-400">{item.title}</h4>
                <p className="mt-4 text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
