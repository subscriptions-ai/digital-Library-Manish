import React, { useState, useRef, useEffect } from "react";
import { Mail, Phone, MapPin, Send, MessageSquare, Globe, CheckCircle2, AlertCircle, X, ChevronDown, Search, Check } from "lucide-react";
import { COMPANY_DETAILS } from "../config";
import { toast } from "react-hot-toast";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", 
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", 
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", 
  "Ladakh", "Lakshadweep", "Puducherry"
];

const DEPARTMENTS = [
  "Electrical Engineering",
  "Computer / IT",
  "Medical Sciences",
  "Management",
  "Chemistry",
  "Mechanical Engineering",
  "Pharmacy",
  "Civil / Construction Engineering",
  "Nano Technology",
  "Bio Technology",
  "Energy",
  "Life Sciences",
  "Law",
  "Agriculture",
  "Nursing",
  "Education and Social Sciences",
  "Applied Sciences",
  "Multidisciplinary"
];

function MultiSelect({ 
  options, 
  selected, 
  onChange, 
  placeholder = "Select Department(s)" 
}: { 
  options: string[], 
  selected: string[], 
  onChange: (val: string) => void,
  placeholder?: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full min-h-[54px] rounded-2xl border bg-slate-50 px-4 py-2 text-sm outline-none transition-all cursor-pointer flex flex-wrap gap-2 items-center",
          isOpen ? "border-blue-500 bg-white ring-4 ring-blue-500/5" : "border-slate-200"
        )}
      >
        {selected.length === 0 ? (
          <span className="text-slate-400 ml-1">{placeholder}</span>
        ) : (
          selected.map(item => (
            <span 
              key={item} 
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-blue-100 animate-in fade-in zoom-in duration-200"
            >
              {item}
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(item);
                }}
                className="hover:text-blue-900 p-0.5"
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
        <ChevronDown 
          size={18} 
          className={cn("ml-auto text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} 
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  autoFocus
                  type="text"
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">No departments found</div>
              ) : (
                filteredOptions.map(dept => (
                  <div 
                    key={dept}
                    onClick={() => onChange(dept)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm",
                      selected.includes(dept) 
                        ? "bg-blue-50 text-blue-700 font-medium" 
                        : "hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <span>{dept}</span>
                    {selected.includes(dept) && <Check size={16} className="text-blue-600" />}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ContactUs() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    mobile: "",
    whatsapp: "",
    sameAsMobile: false,
    designation: "",
    departments: [] as string[],
    state: "",
    organization: "",
    message: ""
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      sameAsMobile: checked,
      whatsapp: checked ? prev.mobile : prev.whatsapp
    }));
  };

  const handleDeptToggle = (dept: string) => {
    setFormData(prev => ({
      ...prev,
      departments: prev.departments.includes(dept)
        ? prev.departments.filter(d => d !== dept)
        : [...prev.departments, dept]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.departments.length === 0) {
      toast.error("Please select at least one department");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setIsSuccess(true);
        toast.success("Message sent successfully!");
        setFormData({
          fullName: "",
          email: "",
          mobile: "",
          whatsapp: "",
          sameAsMobile: false,
          designation: "",
          departments: [],
          state: "",
          organization: "",
          message: ""
        });
      } else {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Thank You!</h2>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Your inquiry has been submitted successfully. We have sent a confirmation email to <strong>{formData.email}</strong>. Our team will get back to you shortly.
          </p>
          <button 
            onClick={() => setIsSuccess(false)}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            Back to Contact
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Get in Touch</h1>
            <p className="mt-6 text-xl text-slate-600 leading-relaxed">
              Have questions about our journals, subscriptions, or institutional access? Our dedicated team is here to provide you with the support you need.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
            {/* Contact Info */}
            <div className="space-y-8">
              <div className="rounded-[2.5rem] bg-slate-900 p-10 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <h3 className="text-2xl font-bold mb-10 relative">Contact Information</h3>
                <div className="space-y-10 relative">
                  <div className="flex items-start gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                      <Mail size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Email Us</div>
                      <div className="text-lg font-medium">{COMPANY_DETAILS.email}</div>
                      <div className="text-sm text-slate-500 mt-1">Response within 24 hours</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                      <Phone size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Call Us</div>
                      <div className="text-lg font-medium">{COMPANY_DETAILS.tel[0]}</div>
                      <div className="text-sm text-slate-500 mt-1">Mon-Fri, 9am - 6pm IST</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-5">
                    <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                      <MapPin size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Visit Us</div>
                      <div className="text-base leading-relaxed text-slate-300">{COMPANY_DETAILS.address}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 rounded-[2rem] bg-blue-50 border border-blue-100">
                <h4 className="font-bold text-blue-900 mb-2">Institutional Support</h4>
                <p className="text-sm text-blue-700 leading-relaxed">
                  Looking for bulk subscriptions or library access? Mention your institution name and department for a tailored proposal.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 md:p-12 shadow-sm">
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Send us a Message</h2>
                <p className="text-slate-500 mb-10">Fill out the form below and we'll get back to you as soon as possible.</p>
                
                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Basic Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Full Name *</label>
                      <input 
                        required
                        type="text" 
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="e.g. Dr. Rajesh Kumar"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Email Address *</label>
                      <input 
                        required
                        type="email" 
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="rajesh@university.edu"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
                      />
                    </div>
                  </div>

                  {/* Mobile & WhatsApp */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Mobile Number *</label>
                      <input 
                        required
                        type="tel" 
                        name="mobile"
                        value={formData.mobile}
                        onChange={handleInputChange}
                        placeholder="+91 98765 43210"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-sm font-bold text-slate-700">WhatsApp Number</label>
                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={formData.sameAsMobile}
                            onChange={handleCheckboxChange}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Same as mobile
                        </label>
                      </div>
                      <input 
                        type="tel" 
                        name="whatsapp"
                        value={formData.whatsapp}
                        onChange={handleInputChange}
                        disabled={formData.sameAsMobile}
                        placeholder="+91 98765 43210"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Designation & Organization */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Designation</label>
                      <input 
                        type="text" 
                        name="designation"
                        value={formData.designation}
                        onChange={handleInputChange}
                        placeholder="e.g. Head Librarian"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Organization / Institution *</label>
                      <input 
                        required
                        type="text" 
                        name="organization"
                        value={formData.organization}
                        onChange={handleInputChange}
                        placeholder="e.g. IIT Delhi"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all"
                      />
                    </div>
                  </div>

                  {/* State & Departments */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">State *</label>
                      <select 
                        required
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all appearance-none"
                      >
                        <option value="">Select State</option>
                        {INDIA_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Department Selection *</label>
                      <MultiSelect 
                        options={DEPARTMENTS}
                        selected={formData.departments}
                        onChange={handleDeptToggle}
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Message / Query *</label>
                    <textarea 
                      required
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows={5}
                      placeholder="Please describe your requirement or query in detail..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"
                    />
                  </div>

                  <button 
                    disabled={isSubmitting}
                    className="w-full md:w-auto flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-10 py-5 text-base font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Sending..." : "Send Message"} 
                    {!isSubmitting && <Send size={20} />}
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
