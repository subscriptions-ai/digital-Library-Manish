import React, { useState, useEffect } from "react";
import { ShieldCheck, Zap, BarChart3, Users, Globe, Check, ArrowRight, BookOpen, MapPin, Phone, Building2, User, Mail, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const departments = [
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

export function InstitutionalAccess() {
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
    department: ""
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
    
    // Basic validation
    if (!formData.fullName || !formData.institutionalEmail || !formData.institutionName || !formData.pincode || !formData.department) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.institutionalEmail)) {
      toast.error("Please enter a valid institutional email");
      return;
    }

    setLoading(true);
    try {
      // 1. Save to Firestore
      await addDoc(collection(db, "trial_requests"), {
        ...formData,
        status: "Pending",
        createdAt: serverTimestamp()
      });

      // 2. Send Emails via Backend API
      const response = await fetch("/api/institutional-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success("Your Institutional Trial Request has been received!");
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
          department: ""
        });
      } else {
        throw new Error("Failed to send emails");
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
      {/* Hero */}
      <section className="bg-blue-600 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Empower Your Entire Institution</h1>
              <p className="mt-8 text-xl text-blue-100 leading-relaxed">
                Provide seamless, unlimited access to STM Digital Library for your students, faculty, and researchers. Trusted by 1,200+ universities worldwide.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <a href="#trial-form" className="rounded-full bg-white px-8 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all">
                  Request a Free Trial
                </a>
                <button className="rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-sm">
                  Download Brochure
                </button>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative rounded-3xl bg-white/10 p-8 backdrop-blur-xl border border-white/20">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                      <Users className="text-white" size={24} />
                    </div>
                    <div>
                      <div className="text-sm font-bold">University of Oxford</div>
                      <div className="text-xs text-blue-200">Active Institutional Partner</div>
                    </div>
                  </div>
                  <div className="h-4 w-full rounded bg-white/10" />
                  <div className="h-4 w-3/4 rounded bg-white/10" />
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <div className="text-2xl font-bold">12k+</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Monthly Downloads</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                      <div className="text-2xl font-bold">850</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-60">Active Researchers</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Institutional Benefits</h2>
            <p className="mt-4 text-slate-600">Everything you need to manage research access at scale.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "IP-Based Authentication", desc: "No individual logins required. Seamless access for anyone on your campus network." },
              { icon: Globe, title: "Remote Access", desc: "Enable access for students and faculty working from home via proxy or Shibboleth." },
              { icon: BarChart3, title: "Usage Statistics", desc: "COUNTER-compliant reports to help you understand resource utilization." },
              { icon: ShieldCheck, title: "Librarian Dashboard", desc: "Centralized control panel to manage subscriptions and view analytics." },
              { icon: Users, title: "Unlimited Users", desc: "No caps on the number of simultaneous users from your institution." },
              { icon: BookOpen, title: "Archival Rights", desc: "Permanent access to content published during your subscription period." }
            ].map((feature, i) => (
              <div key={i} className="rounded-2xl bg-white p-8 border border-slate-200 shadow-sm">
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                  <feature.icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{feature.title}</h3>
                <p className="mt-4 text-slate-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-24" id="trial-form">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">How to Get Started?</h2>
              <p className="mt-6 text-lg text-slate-600">
                Setting up institutional access is a simple 3-step process. Our team will guide you every step of the way.
              </p>
              <div className="mt-10 space-y-8">
                {[
                  { step: "01", title: "Request a Quote", desc: "Tell us about your institution size and required domains." },
                  { step: "02", title: "Setup IP Ranges", desc: "Provide your campus IP ranges for seamless authentication." },
                  { step: "03", title: "Go Live", desc: "Your entire campus gets instant access to the digital library." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="text-4xl font-bold text-blue-100">{item.step}</div>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900 p-8 md:p-12 text-white shadow-2xl">
              <h3 className="text-2xl font-bold mb-2">Request Institutional Trial</h3>
              <p className="text-slate-400 text-sm mb-8">Fill in the details below to request a trial for your institution.</p>
              
              <form className="space-y-8" onSubmit={handleSubmit}>
                {/* Personal Details */}
                <div className="space-y-4">
                  <h4 className="text-blue-400 text-xs font-bold uppercase tracking-widest border-b border-white/10 pb-2">Personal Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name *</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="text" 
                          required
                          value={formData.fullName}
                          onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                          className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                          placeholder="Dr. John Doe"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Institutional Email *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="email" 
                          required
                          value={formData.institutionalEmail}
                          onChange={(e) => setFormData({...formData, institutionalEmail: e.target.value})}
                          className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                          placeholder="john.doe@university.edu"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Designation</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="text" 
                          value={formData.designation}
                          onChange={(e) => setFormData({...formData, designation: e.target.value})}
                          className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                          placeholder="Librarian / Professor"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">WhatsApp Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="tel" 
                          value={formData.whatsappNumber}
                          onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})}
                          className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                          placeholder="+91 98765 43210"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Institution Details */}
                <div className="space-y-4">
                  <h4 className="text-blue-400 text-xs font-bold uppercase tracking-widest border-b border-white/10 pb-2">Institution Details</h4>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Institution Name *</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input 
                        type="text" 
                        required
                        value={formData.institutionName}
                        onChange={(e) => setFormData({...formData, institutionName: e.target.value})}
                        className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                        placeholder="Indian Institute of Technology, Delhi"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="space-y-4">
                  <h4 className="text-blue-400 text-xs font-bold uppercase tracking-widest border-b border-white/10 pb-2">Address</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Pincode *</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="text" 
                          required
                          maxLength={6}
                          value={formData.pincode}
                          onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                          className="w-full rounded-lg bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all" 
                          placeholder="110001"
                        />
                        {pincodeLoading && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">City</label>
                      <input 
                        type="text" 
                        readOnly
                        value={formData.city}
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">State</label>
                      <input 
                        type="text" 
                        readOnly
                        value={formData.state}
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Country</label>
                      <input 
                        type="text" 
                        readOnly
                        value={formData.country}
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none opacity-60 cursor-not-allowed" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Full Address</label>
                    <textarea 
                      rows={2}
                      value={formData.fullAddress}
                      onChange={(e) => setFormData({...formData, fullAddress: e.target.value})}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all resize-none" 
                      placeholder="Street, Landmark, Area"
                    />
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-4">
                  <h4 className="text-blue-400 text-xs font-bold uppercase tracking-widest border-b border-white/10 pb-2">Department</h4>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Academic Department *</label>
                    <select 
                      required
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all appearance-none"
                    >
                      <option value="" disabled className="bg-slate-900">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept} className="bg-slate-900">{dept}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 transition-all mt-4 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Submit Trial Request <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
