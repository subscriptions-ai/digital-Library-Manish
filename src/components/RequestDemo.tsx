import React, { useState, useEffect } from "react";
import { ShieldCheck, Zap, BarChart3, Users, Globe, Check, ArrowRight, BookOpen, MapPin, Phone, Building2, User, Mail, Briefcase, PlayCircle, Clock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { motion } from "motion/react";

import { DOMAINS } from "../constants";

const departments = DOMAINS.map(domain => domain.name);

export function RequestDemo() {
  const [formData, setFormData] = useState({
    fullName: "",
    institutionalEmail: "",
    institutionName: "",
    designation: "",
    whatsappNumber: "",
    pincode: "",
    city: "",
    state: "",
    country: "",
    fullAddress: "",
    department: "",
    requestType: "Institution"
  });

  const [loading, setLoading] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);

  // Pincode auto-fetch logic
  useEffect(() => {
    const fetchPincodeDetails = async () => {
      if (formData.pincode.length === 6) {
        setPincodeLoading(true);
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${formData.pincode}`);
          const data = await response.json();
          
          if (data[0].Status === "Success") {
            const details = data[0].PostOffice[0];
            setFormData(prev => ({
              ...prev,
              city: details.District,
              state: details.State,
              country: "India"
            }));
            toast.success("Location details auto-filled!");
          } else {
            toast.error("Invalid Pincode");
          }
        } catch (error) {
          console.error("Pincode fetch error:", error);
        } finally {
          setPincodeLoading(false);
        }
      }
    };

    fetchPincodeDetails();
  }, [formData.pincode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.institutionalEmail || !formData.institutionName || !formData.pincode || !formData.department) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success("Demo Request Received! Our team will contact you shortly.");
        setFormData({
          fullName: "",
          institutionalEmail: "",
          institutionName: "",
          designation: "",
          whatsappNumber: "",
          pincode: "",
          city: "",
          state: "",
          country: "",
          fullAddress: "",
          department: "",
          requestType: "Institution"
        });
      } else {
        throw new Error("Failed to submit request");
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 py-24 text-white lg:py-32">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600 blur-[120px]"></div>
          <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-indigo-600 blur-[120px]"></div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5 text-sm font-bold text-blue-400 ring-1 ring-blue-500/20 mb-8"
            >
              <PlayCircle size={16} />
              Book a Personalized Demo
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl font-extrabold tracking-tight sm:text-6xl"
            >
              Experience the Future of <span className="text-blue-500">Research</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 text-xl text-slate-400 leading-relaxed"
            >
              Get a guided walkthrough of the STM Digital Library. Discover how our platform can transform research and learning at your institution.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
            
            {/* Left Column: Info */}
            <div className="space-y-12">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-6">How Our Demo Works?</h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                  We don't just show you features; we show you value. Our demo is tailored to your institution's specific research domains and library requirements.
                </p>
              </div>

              <div className="space-y-8">
                {[
                  {
                    step: "01",
                    title: "Initial Consultation",
                    desc: "A brief call to understand your institution's size, departments, and specific resource needs.",
                    icon: <Users className="text-blue-600" size={24} />
                  },
                  {
                    step: "02",
                    title: "Platform Walkthrough",
                    desc: "A live guided tour of our search capabilities, librarian dashboard, and administrative controls.",
                    icon: <PlayCircle className="text-emerald-600" size={24} />
                  },
                  {
                    step: "03",
                    title: "Trial Access Setup",
                    desc: "Based on the demo, we set up full trial access for your institution to test in real-world scenarios.",
                    icon: <Clock className="text-amber-600" size={24} />
                  }
                ].map((item, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-6 items-start p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="text-4xl font-black text-slate-100 shrink-0 leading-none">{item.step}</div>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {item.icon}
                        <h4 className="font-bold text-slate-900 text-lg">{item.title}</h4>
                      </div>
                      <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="p-8 rounded-3xl bg-blue-600 text-white shadow-xl shadow-blue-500/20">
                <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <CheckCircle2 size={24} />
                  What you'll learn in the demo:
                </h4>
                <ul className="space-y-3">
                  {[
                    "How to use AI-powered search for faster discovery",
                    "Managing institutional IP ranges and remote access",
                    "Generating COUNTER-compliant usage reports",
                    "Customizing the platform branding for your library",
                    "Seamless integration with existing library systems"
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 text-blue-100 text-sm">
                      <Check size={16} className="mt-1 shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right Column: Form */}
            <div id="demo-form" className="lg:sticky lg:top-24">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                className="rounded-[2.5rem] bg-slate-900 p-8 md:p-12 text-white shadow-2xl border border-white/5 relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/10 blur-[80px]"></div>
                
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold mb-2">Request Personalized Demo</h3>
                  <p className="text-slate-400 text-sm mb-6">Fill in the details below and our team will get back to you within 24 hours.</p>
                  
                  {/* User Type Selection tabs */}
                  <div className="mb-8 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">I am requesting as a: *</label>
                    <div className="grid grid-cols-3 gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                      {[
                        { id: 'Institution', label: 'Institution', icon: <Building2 size={14} /> },
                        { id: 'Student', label: 'Student', icon: <User size={14} /> },
                        { id: 'Corporate', label: 'Corporate', icon: <Briefcase size={14} /> }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, requestType: tab.id }))}
                          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-bold transition-all ${
                            formData.requestType === tab.id 
                              ? 'bg-blue-600 text-white shadow-md' 
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    {/* Personal Details */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                          <div className="relative group">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                              type="text" 
                              required
                              value={formData.fullName}
                              onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                              placeholder={formData.requestType === 'Institution' ? "Dr. John Doe" : "John Doe"}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {formData.requestType === 'Student' ? 'Student / Personal Email *' : formData.requestType === 'Corporate' ? 'Work Email *' : 'Institutional Email *'}
                          </label>
                          <div className="relative group">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                              type="email" 
                              required
                              value={formData.institutionalEmail}
                              onChange={(e) => setFormData({...formData, institutionalEmail: e.target.value})}
                              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                              placeholder={formData.requestType === 'Student' ? "student@university.edu" : formData.requestType === 'Corporate' ? "manager@company.com" : "john.doe@university.edu"}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {formData.requestType === 'Student' ? 'Degree / Subject' : 'Designation'}
                          </label>
                          <div className="relative group">
                            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                              type="text" 
                              value={formData.designation}
                              onChange={(e) => setFormData({...formData, designation: e.target.value})}
                              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                              placeholder={formData.requestType === 'Student' ? "B.Tech CSE / Research Scholar" : formData.requestType === 'Corporate' ? "R&D Head / Tech Lead" : "Librarian / Professor"}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">WhatsApp Number</label>
                          <div className="relative group">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                              type="tel" 
                              value={formData.whatsappNumber}
                              onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
                              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                              placeholder="+91 98765 43210"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Institution Details */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {formData.requestType === 'Student' ? 'University / College Name *' : formData.requestType === 'Corporate' ? 'Company / Corporate Name *' : 'Institution Name *'}
                        </label>
                        <div className="relative group">
                          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                          <input 
                            type="text" 
                            required
                            value={formData.institutionName}
                            onChange={(e) => setFormData({...formData, institutionName: e.target.value})}
                            className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                            placeholder={formData.requestType === 'Student' ? "Delhi Technological University" : formData.requestType === 'Corporate' ? "Celnet Systems Ltd" : "Indian Institute of Technology, Delhi"}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Address Section */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pincode *</label>
                          <div className="relative group">
                            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                            <input 
                              type="text" 
                              required
                              maxLength={6}
                              value={formData.pincode}
                              onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                              className="w-full rounded-xl bg-white/5 border border-white/10 pl-11 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all placeholder:text-slate-600" 
                              placeholder="110001"
                            />
                            {pincodeLoading && (
                              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">City</label>
                          <input 
                            type="text" 
                            readOnly
                            value={formData.city}
                            placeholder="Auto-filled"
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none opacity-40 cursor-not-allowed placeholder:text-slate-600" 
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">State</label>
                          <input 
                            type="text" 
                            readOnly
                            value={formData.state}
                            placeholder="Auto-filled"
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none opacity-40 cursor-not-allowed placeholder:text-slate-600" 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Country</label>
                          <input 
                            type="text" 
                            readOnly
                            value={formData.country}
                            placeholder="Auto-filled"
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none opacity-40 cursor-not-allowed placeholder:text-slate-600" 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {formData.requestType === 'Student' ? 'Field of Interest / Study *' : formData.requestType === 'Corporate' ? 'Tech Domain / Division *' : 'Academic Department *'}
                      </label>
                      <select 
                        required
                        value={formData.department}
                        onChange={(e) => setFormData({...formData, department: e.target.value})}
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all appearance-none text-slate-300"
                      >
                        <option value="" disabled className="bg-slate-900">Select Department</option>
                        {departments.map(dept => (
                          <option key={dept} value={dept} className="bg-slate-900">{dept}</option>
                        ))}
                      </select>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Confirm Demo Session <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
