import React, { useState, useEffect } from "react";
import { ShieldCheck, Zap, BarChart3, Users, Globe, Check, ArrowRight, BookOpen, MapPin, Phone, Building2, User, Mail, Briefcase, PlayCircle, Clock, CheckCircle2, GraduationCap, Library, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { motion } from "motion/react";
import { EmailVerificationInput } from "./EmailVerificationInput";

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
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [success, setSuccess] = useState(false);
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

  const [isOTPModalOpen, setIsOTPModalOpen] = useState(false);

  const proceedWithSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSuccess(true);
        toast.success("Demo Request Received! Our team will contact you shortly.");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isEmailVerified) {
      toast.error("Please verify your email address first");
      return;
    }

    if (!formData.fullName || !formData.institutionName || !formData.pincode || !formData.department) {
      toast.error("Please fill in all required fields");
      return;
    }

    await proceedWithSubmit();
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-lg border border-slate-100">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted!</h2>
          <p className="text-slate-600 mb-6">Thank you for your interest. Our team will review your request and contact you within 24-48 hours.</p>
          <Link to="/" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Absolute Hero Background (100vh) */}
      <div className="absolute top-0 left-0 w-full h-[100vh] bg-[#0F172A] overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 lg:pt-32 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 items-start">
          
          {/* Left Column: Info */}
          <div className="lg:col-span-5 flex flex-col">
            
            {/* Hero Text */}
            <div className="text-left mb-24 lg:mb-32">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center rounded-full bg-blue-900/40 px-4 py-1.5 text-xs font-bold tracking-widest text-blue-400 mb-8 border border-blue-800/50"
              >
                DIGITAL ACADEMIC ACCESS
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
              >
                Request Trial Access
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 text-lg text-slate-300 leading-relaxed max-w-xl"
              >
                Experience the full power of STM Digital Library. We provide trial/demo access for students, researchers, corporate organizations, and academic institutions to explore our vast knowledge ecosystem.
              </motion.p>
            </div>

            {/* Why Explore Section (Flows naturally below hero text) */}
            <div className="space-y-12">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-6">Why Explore Our Platform?</h2>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Eligible users can explore peer-reviewed journals, e-books, and research materials to understand how our digital library can support their academic growth and research goals.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-blue-600 tracking-wider uppercase mb-6">Who Can Request Access?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card 1 */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-start text-left">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600 mb-4">
                      <GraduationCap size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-3">Students & Scholars</h4>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> ACADEMIC LEARNING</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> RESEARCH SUPPORT</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> PROJECT WORK</li>
                    </ul>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-start text-left">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 mb-4">
                      <Library size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-3">Colleges & Universities</h4>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> DEPARTMENT-LEVEL ACADEMIC ACCESS</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> FACULTY & STUDENT USAGE</li>
                    </ul>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-start text-left">
                    <div className="p-3 bg-orange-50 rounded-xl text-orange-600 mb-4">
                      <Briefcase size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-3">Corporate Organizations</h4>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> PROFESSIONAL LEARNING</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> INDUSTRY KNOWLEDGE RESOURCES</li>
                    </ul>
                  </div>

                  {/* Card 4 */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-start text-left">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 mb-4">
                      <Search size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-3">Research Institutions</h4>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> RESEARCH JOURNALS</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> SCIENTIFIC PUBLICATIONS</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"><Check size={12} className="text-blue-500" /> TECHNICAL RESOURCES</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="mt-1 text-blue-600"><Zap size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">Instant Setup</h4>
                    <p className="text-slate-500 text-sm">Quick activation for individuals and institutions.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1 text-emerald-600"><BarChart3 size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">Full Repository</h4>
                    <p className="text-slate-500 text-sm">Unrestricted access to selected departments.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1 text-orange-600"><Users size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">Unlimited Support</h4>
                    <p className="text-slate-500 text-sm">Onboarding and technical guidance included.</p>
                  </div>
                </div>
              </div>

              {/* Verification Policy Box */}
              <div className="bg-[#0F172A] rounded-3xl p-8 text-white relative overflow-hidden">
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                  <Globe size={160} className="translate-x-1/4 translate-y-1/4" />
                </div>
                <h4 className="text-xl font-bold mb-3 relative z-10">Verification Policy</h4>
                <p className="text-slate-300 text-sm leading-relaxed mb-6 relative z-10">
                  All requests are reviewed within 24-48 business hours. Please ensure your contact details are accurate to avoid delays.
                </p>
                <div className="flex flex-wrap gap-4 relative z-10">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                    <ShieldCheck size={16} /> VERIFIED ACCESS
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <ShieldCheck size={16} /> DATA SECURED
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Form */}
            <div className="lg:col-span-7">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 relative overflow-hidden p-8 md:p-12 z-20"
              >
                <div className="absolute right-6 top-8 opacity-[0.03] pointer-events-none">
                  <BookOpen size={120} />
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Trial Access Request Form</h3>
                  <p className="text-slate-500 mb-8">Power your academic growth with STM Digital Library.</p>
                  
                  {/* User Type Selection tabs - matching existing form logic but styled lighter */}
                  <div className="mb-8 space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">I am requesting as a: *</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                      {[
                        { id: 'Institution', label: 'Institution', icon: <Building2 size={14} /> },
                        { id: 'Student', label: 'Student', icon: <User size={14} /> },
                        { id: 'Corporate', label: 'Corporate', icon: <Briefcase size={14} /> }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, requestType: tab.id }))}
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-1 rounded-lg text-xs font-bold transition-all ${
                            formData.requestType === tab.id 
                              ? 'bg-white text-blue-600 shadow-sm border border-slate-200' 
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
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
                        <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100 md:col-span-2">
                          <EmailVerificationInput
                            label={formData.requestType === 'Student' ? 'Student / Personal Email *' : formData.requestType === 'Corporate' ? 'Work Email *' : 'Email Address *'}
                            value={formData.institutionalEmail}
                            onChange={(email) => setFormData({...formData, institutionalEmail: email})}
                            onVerified={setIsEmailVerified}
                          />
                        </div>
                      </div>
                      
                      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity duration-300 ${isEmailVerified ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Name *</label>
                          <div className="relative group">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                            <input 
                              type="text" 
                              required={isEmailVerified}
                              disabled={!isEmailVerified}
                              value={formData.fullName}
                              onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                              className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400" 
                              placeholder={formData.requestType === 'Institution' ? "Dr. John Doe" : "Your Name"}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {formData.requestType === 'Student' ? 'Degree / Subject *' : 'Designation *'}
                          </label>
                          <div className="relative group">
                            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                            <input 
                              type="text" 
                              required={isEmailVerified}
                              disabled={!isEmailVerified}
                              value={formData.designation}
                              onChange={(e) => setFormData({...formData, designation: e.target.value})}
                              className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400" 
                              placeholder="Position or Role"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mobile / WhatsApp *</label>
                          <div className="relative group">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                            <input 
                              type="tel" 
                              required={isEmailVerified}
                              disabled={!isEmailVerified}
                              value={formData.whatsappNumber}
                              onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
                              className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400" 
                              placeholder="+91 00000 00000"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Institution Details */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Institution / Organization / Individual Name *
                        </label>
                        <div className="relative group">
                          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                          <input 
                            type="text" 
                            required={isEmailVerified}
                            disabled={!isEmailVerified}
                            value={formData.institutionName}
                            onChange={(e) => setFormData({...formData, institutionName: e.target.value})}
                            className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400" 
                            placeholder="Name of your University / College / Organization / Self"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Primary Department *
                      </label>
                      <select 
                        required={isEmailVerified}
                        disabled={!isEmailVerified}
                        value={formData.department}
                        onChange={(e) => setFormData({...formData, department: e.target.value})}
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none"
                      >
                        <option value="" disabled>Select Department</option>
                        {departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>

                    {/* Address Section */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pincode *</label>
                          <div className="relative group">
                            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                            <input 
                              type="text" 
                              required={isEmailVerified}
                              disabled={!isEmailVerified}
                              maxLength={6}
                              value={formData.pincode}
                              onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                              className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400" 
                              placeholder="6 Digit PIN"
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
                            placeholder=""
                            className="w-full rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 text-sm text-slate-500 outline-none cursor-not-allowed" 
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Full Address *</label>
                        <textarea
                          value={formData.fullAddress}
                          required={isEmailVerified}
                          disabled={!isEmailVerified}
                          onChange={(e) => setFormData({...formData, fullAddress: e.target.value})}
                          rows={3}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400 resize-none"
                          placeholder="Street address, building, etc."
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={loading || !isEmailVerified}
                      className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Processing...
                        </>
                      ) : (
                        <>
                          GET TRIAL ACCESS <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      {/* Bottom Cards Section */}
      <section className="pb-24 pt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link to="/contact" className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col items-center text-center hover:shadow-md transition-shadow">
              <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 mb-6">
                <Users size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Contact Sales Team</h3>
              <p className="text-slate-600 mb-6">Have specific institutional requirements? Talk to our consultants.</p>
              <span className="text-blue-600 font-bold text-sm tracking-wider flex items-center gap-2 mt-auto uppercase">
                CONNECT NOW <ArrowRight size={16} />
              </span>
            </Link>
            
            <Link to="/subscriptions" className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col items-center text-center hover:shadow-md transition-shadow">
              <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600 mb-6">
                <BarChart3 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">View Subscription Plans</h3>
              <p className="text-slate-600 mb-6">Explore premium plans for individuals and institutions.</p>
              <span className="text-emerald-600 font-bold text-sm tracking-wider flex items-center gap-2 mt-auto uppercase">
                VIEW PLANS <ArrowRight size={16} />
              </span>
            </Link>

            <Link to="/digital-library" className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col items-center text-center hover:shadow-md transition-shadow">
              <div className="p-4 bg-orange-50 rounded-2xl text-orange-600 mb-6">
                <Search size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Explore Departments</h3>
              <p className="text-slate-600 mb-6">Browse our extensive collection by academic department.</p>
              <span className="text-orange-600 font-bold text-sm tracking-wider flex items-center gap-2 mt-auto uppercase">
                DISCOVER <ArrowRight size={16} />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
