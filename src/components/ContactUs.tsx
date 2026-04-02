import { Mail, Phone, MapPin, Send, MessageSquare, Globe } from "lucide-react";
import { COMPANY_DETAILS } from "../config";

export function ContactUs() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Contact Us</h1>
            <p className="mt-6 text-lg text-slate-600">
              Have questions about our journals, subscriptions, or institutional access? Our team is here to help you.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="space-y-8">
              <div className="rounded-3xl bg-slate-900 p-8 text-white">
                <h3 className="text-xl font-bold mb-8">Get in Touch</h3>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Mail size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Us</div>
                      <div className="mt-1 text-sm font-medium">{COMPANY_DETAILS.email}</div>
                      <div className="text-xs text-slate-500 mt-1">Response within 24 hours</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Phone size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Call Us</div>
                      <div className="mt-1 text-sm font-medium">{COMPANY_DETAILS.tel[0]} / {COMPANY_DETAILS.tel[1]}</div>
                      <div className="text-xs text-slate-500 mt-1">Mon-Fri, 9am - 6pm IST</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <MapPin size={20} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visit Us</div>
                      <div className="mt-1 text-sm font-medium">{COMPANY_DETAILS.address}</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 md:p-12">
                <h2 className="text-2xl font-bold text-slate-900 mb-8">Send us a Message</h2>
                <form className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Full Name</label>
                      <input 
                        type="text" 
                        placeholder="John Doe"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Email Address</label>
                      <input 
                        type="email" 
                        placeholder="john@example.com"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Organization / University</label>
                      <input 
                        type="text" 
                        placeholder="Harvard University"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Subject</label>
                      <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all">
                        <option>General Inquiry</option>
                        <option>Subscription Support</option>
                        <option>Institutional Access</option>
                        <option>Author Submission</option>
                        <option>Technical Issue</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Message</label>
                    <textarea 
                      rows={6}
                      placeholder="How can we help you?"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                    />
                  </div>
                  <button className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">
                    Send Message <Send size={16} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
