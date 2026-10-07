import React, { useState, useRef, useEffect } from "react";
import { Mail, Phone, MapPin, Send, MessageSquare, Globe, CheckCircle2, AlertCircle, X, ChevronDown, Search, Check } from "lucide-react";
import { COMPANY_DETAILS } from "../config";
import { toast } from "react-hot-toast";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "react-router-dom";
import { Button } from "./ui";

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", 
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", 
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", 
  "Ladakh", "Lakshadweep", "Puducherry"
];

import { DOMAINS } from "../constants";

const DEPARTMENTS = DOMAINS.map(d => d.name);

function MultiSelect({ 
  options, 
  selected, 
  onChange, 
  placeholder = "Select Department(s)",
  id,
  labelledBy,
}: { 
  options: string[], 
  selected: string[], 
  onChange: (val: string) => void,
  placeholder?: string,
  id?: string,
  labelledBy?: string,
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
        id={id}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelledBy}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(!isOpen); }
          if (e.key === "Escape") setIsOpen(false);
        }}
        className={cn(
          "flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 text-sm transition-colors duration-150",
          isOpen ? "border-accent shadow-[var(--focus-ring)]" : "border-rule-2 hover:border-muted"
        )}
      >
        {selected.length === 0 ? (
          <span className="text-faint">{placeholder}</span>
        ) : (
          selected.map(item => (
            <span 
              key={item} 
              className="inline-flex items-center gap-1 rounded-md bg-accent-soft py-1 pl-2 pr-1 text-xs font-semibold text-accent"
            >
              {item}
              <button 
                type="button"
                aria-label={`Remove ${item}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(item);
                }}
                className="rounded p-0.5 hover:bg-surface"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))
        )}
        <ChevronDown 
          size={18} 
          aria-hidden="true"
          className={cn("ml-auto shrink-0 text-muted transition-transform duration-200", isOpen && "rotate-180")} 
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-rule bg-surface shadow-[var(--shadow-pop)]"
          >
            <div className="border-b border-rule bg-surface-2 p-3">
              <div className="relative">
                <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input 
                  autoFocus
                  type="text"
                  aria-label="Search departments"
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
                  className="input h-9 pl-9"
                />
              </div>
            </div>
            <div role="listbox" aria-multiselectable="true" aria-labelledby={labelledBy} className="max-h-64 overflow-y-auto p-2">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">No departments found</div>
              ) : (
                filteredOptions.map(dept => (
                  <div 
                    key={dept}
                    role="option"
                    tabIndex={0}
                    aria-selected={selected.includes(dept)}
                    onClick={() => onChange(dept)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(dept); }
                      if (e.key === "Escape") setIsOpen(false);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                      selected.includes(dept) 
                        ? "bg-accent-soft font-medium text-accent" 
                        : "text-ink-2 hover:bg-surface-2"
                    )}
                  >
                    <span>{dept}</span>
                    {selected.includes(dept) && <Check size={16} aria-hidden="true" className="shrink-0 text-accent" />}
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
  // A page that sends someone here can bring the words and the details with it.
  const prefill = (useLocation().state as any)?.prefill || {};
  const [formData, setFormData] = useState({
    fullName: prefill.fullName || "",
    email: prefill.email || "",
    mobile: "",
    whatsapp: "",
    sameAsMobile: false,
    designation: "",
    departments: [] as string[],
    state: "",
    organization: prefill.organization || "",
    message: prefill.message || ""
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
      <div className="flex min-h-screen items-center justify-center bg-ground p-4">
        <div className="card w-full max-w-md p-6 text-center sm:p-8">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success" aria-hidden="true">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-ink">Thank You!</h2>
          <p className="mb-8 leading-relaxed text-ink-2">
            Your inquiry has been submitted successfully. We have sent a confirmation email to <strong className="break-all">{formData.email}</strong>. Our team will get back to you shortly.
          </p>
          <Button variant="brand" size="lg" block onClick={() => setIsSuccess(false)}>
            Back to Contact
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      {/* Header */}
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <h1 className="on-dark text-3xl font-bold leading-tight sm:text-4xl">Get in Touch</h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            Have questions about our journals or institutional access? Our dedicated team is here to provide you with the support you need.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container-public">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
            {/* Contact Info */}
            <div className="space-y-6">
              <div className="rounded-xl bg-navy p-6 sm:p-8">
                <h2 className="on-dark mb-8 text-xl font-bold">Contact Information</h2>
                <div className="space-y-8">
                  <div className="flex items-start gap-4">
                    <div className="on-dark-fill on-dark-edge flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border" aria-hidden="true">
                      <Mail size={20} className="text-amber" />
                    </div>
                    <div className="min-w-0">
                      <div className="on-dark-3 mb-1 text-xs font-semibold uppercase tracking-wider">General Support</div>
                      <a href={`mailto:${COMPANY_DETAILS.email}`} className="on-dark break-all text-base font-medium hover:underline">{COMPANY_DETAILS.email}</a>
                      <p className="on-dark-2 mt-2 text-sm">For institutional / subscription enquiries and privacy / data protection requests, use this same official email and include the topic in your subject line.</p>
                      <div className="on-dark-3 mt-1 text-sm">Response within 24 hours</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="on-dark-fill on-dark-edge flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border" aria-hidden="true">
                      <Phone size={20} className="text-amber" />
                    </div>
                    <div className="min-w-0">
                      <div className="on-dark-3 mb-1 text-xs font-semibold uppercase tracking-wider">Call Us</div>
                      <a href={`tel:${COMPANY_DETAILS.tel[0].replace(/[^\d+]/g, "")}`} className="on-dark text-base font-medium hover:underline">{COMPANY_DETAILS.tel[0]}</a>
                      <div className="on-dark-3 mt-1 text-sm">Mon-Fri, 9am - 6pm IST</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="on-dark-fill on-dark-edge flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border" aria-hidden="true">
                      <MapPin size={20} className="text-amber" />
                    </div>
                    <div className="min-w-0">
                      <div className="on-dark-3 mb-1 text-xs font-semibold uppercase tracking-wider">Sales / Marketing Office</div>
                      <div className="on-dark-2 text-sm leading-relaxed">{COMPANY_DETAILS.address}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-rule bg-accent-soft p-6">
                <h3 className="mb-2 font-bold text-ink">Institutional Support</h3>
                <p className="text-sm leading-relaxed text-ink-2">
                  Looking for campus-wide library access? Mention your institution name and department and our team will get back to you.
                </p>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <div className="card p-5 sm:p-8">
                <h2 className="mb-2 text-2xl font-bold text-ink">Send us a Message</h2>
                <p className="mb-8 text-muted">Fill out the form below and we'll get back to you as soon as possible.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Fields */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="field">
                      <label htmlFor="contact-fullName" className="field-label">Full Name <span className="req" aria-hidden="true">*</span></label>
                      <input 
                        id="contact-fullName"
                        required
                        type="text" 
                        name="fullName"
                        autoComplete="name"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="e.g. Dr. Rajesh Kumar"
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="contact-email" className="field-label">Email Address <span className="req" aria-hidden="true">*</span></label>
                      <input 
                        id="contact-email"
                        required
                        type="email" 
                        name="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="rajesh@university.edu"
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Mobile & WhatsApp */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="field">
                      <label htmlFor="contact-mobile" className="field-label">Mobile Number <span className="req" aria-hidden="true">*</span></label>
                      <input 
                        id="contact-mobile"
                        required
                        type="tel" 
                        name="mobile"
                        autoComplete="tel"
                        value={formData.mobile}
                        onChange={handleInputChange}
                        placeholder="+91 98765 43210"
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="contact-whatsapp" className="field-label">WhatsApp Number</label>
                        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
                          <input 
                            type="checkbox" 
                            checked={formData.sameAsMobile}
                            onChange={handleCheckboxChange}
                            className="h-4 w-4 accent-accent"
                          />
                          Same as mobile
                        </label>
                      </div>
                      <input 
                        id="contact-whatsapp"
                        type="tel" 
                        name="whatsapp"
                        value={formData.whatsapp}
                        onChange={handleInputChange}
                        disabled={formData.sameAsMobile}
                        placeholder="+91 98765 43210"
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Designation & Organization */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="field">
                      <label htmlFor="contact-designation" className="field-label">Designation</label>
                      <input 
                        id="contact-designation"
                        type="text" 
                        name="designation"
                        value={formData.designation}
                        onChange={handleInputChange}
                        placeholder="e.g. Head Librarian"
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="contact-organization" className="field-label">Organization / Institution <span className="req" aria-hidden="true">*</span></label>
                      <input 
                        id="contact-organization"
                        required
                        type="text" 
                        name="organization"
                        autoComplete="organization"
                        value={formData.organization}
                        onChange={handleInputChange}
                        placeholder="e.g. IIT Delhi"
                        className="input"
                      />
                    </div>
                  </div>

                  {/* State & Departments */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="field">
                      <label htmlFor="contact-state" className="field-label">State <span className="req" aria-hidden="true">*</span></label>
                      <select 
                        id="contact-state"
                        required
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="input"
                      >
                        <option value="">Select State</option>
                        {INDIA_STATES.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span id="contact-departments-label" className="field-label">Department Selection <span className="req" aria-hidden="true">*</span></span>
                      <MultiSelect 
                        id="contact-departments"
                        labelledBy="contact-departments-label"
                        options={DEPARTMENTS}
                        selected={formData.departments}
                        onChange={handleDeptToggle}
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div className="field">
                    <label htmlFor="contact-message" className="field-label">Message / Query <span className="req" aria-hidden="true">*</span></label>
                    <textarea 
                      id="contact-message"
                      required
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows={5}
                      placeholder="Please describe your requirement or query in detail..."
                      className="input"
                    />
                  </div>

                  <Button type="submit" variant="brand" size="lg" loading={isSubmitting} className="w-full md:w-auto">
                    {isSubmitting ? "Sending..." : "Send Message"} 
                    {!isSubmitting && <Send size={18} aria-hidden="true" />}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
