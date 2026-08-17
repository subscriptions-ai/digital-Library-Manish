import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, PieChart, ShieldCheck, Database, Layers, ArrowRight, Zap, CheckCircle2, Cloud, Clock, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const features = [
  {
    icon: <PieChart size={24} />,
    title: 'Advanced Analytics Dashboard',
    description: 'Get deep insights into reading habits, content utilization, and student engagement through comprehensive visual reports.'
  },
  {
    icon: <Users size={24} />,
    title: 'Seamless User Management',
    description: 'Easily onboard students, researchers, and faculty. Organize them into departments and manage access permissions effortlessly.'
  },
  {
    icon: <Database size={24} />,
    title: 'Vast Content Repository',
    description: 'Access curated academic content including journals, books, and theses specifically tailored to your institution\'s domains.'
  },
  {
    icon: <ShieldCheck size={24} />,
    title: 'Secure & Compliant Access',
    description: 'Ensure institutional data privacy with robust role-based access control (RBAC), IP-restricted login, and SSO integrations.'
  },
  {
    icon: <Layers size={24} />,
    title: 'Custom Curated Libraries',
    description: 'Create and assign customized reading lists or curriculum-aligned libraries to specific departments and classes.'
  },
  {
    icon: <Zap size={24} />,
    title: 'Lightning Fast Deployment',
    description: 'Get your digital library up and running within 24 hours. No complex IT infrastructure or maintenance required on your end.'
  }
];

export function ForInstitutions() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-white to-white" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 font-semibold text-sm mb-6 border border-blue-100"
            >
              <Building2 size={16} /> Empower Your Institution
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-tight mb-6 tracking-tight"
            >
              The Next-Generation <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Digital Library</span> For Colleges and Universities
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl"
            >
              Transform how your students and faculty access academic knowledge. Provide world-class resources with powerful management and analytics tools.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button onClick={() => navigate('/request-demo')} className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                Request a Demo <ArrowRight size={20} />
              </button>
              <button onClick={() => navigate('/contact')} className="px-8 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2">
                Request Institutional Access
              </button>
            </motion.div>
          </div>

          <div className="lg:w-1/2 relative">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
            >
              <img 
                src="https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&q=80" 
                alt="University Library" 
                className="w-full h-auto object-cover rounded-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </motion.div>
            
            {/* Floating Elements */}
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-xl border border-slate-100 flex items-center gap-4 z-20"
            >
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                <Users size={24} />
              </div>
              <div>
                <div className="text-sm text-slate-500 font-medium">Platform Management</div>
                <div className="text-xl font-bold text-slate-900">Centralized</div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Main Features Grid */}
      <div className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything an Institution Needs</h2>
            <p className="text-slate-600 text-lg">We provide a comprehensive ecosystem designed specifically for librarians, administrators, and educators.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group"
              >
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats/Highlight Section */}
      <div className="py-24 bg-blue-600 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">Empower your campus with unlimited learning</h2>
            <p className="text-blue-100 text-lg mb-8 leading-relaxed">
              We partner with top global publishers to bring high-impact research to your institution's fingertips. Enhance academic performance and research output exponentially.
            </p>
            <ul className="space-y-4">
              {[
                'Unlimited simultaneous user access',
                'IP-based authentication available',
                'MARC records provided',
                '24/7 dedicated technical support'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 font-medium text-blue-50">
                  <CheckCircle2 className="text-blue-300" size={20} /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:w-1/2 grid grid-cols-2 gap-6 w-full">
            {[
              { label: 'Secure Access', icon: <ShieldCheck className="mx-auto mb-4 text-blue-200" size={40} /> },
              { label: 'Cloud Infrastructure', icon: <Cloud className="mx-auto mb-4 text-blue-200" size={40} /> },
              { label: '24/7 Availability', icon: <Clock className="mx-auto mb-4 text-blue-200" size={40} /> },
              { label: 'Multi-device Support', icon: <Smartphone className="mx-auto mb-4 text-blue-200" size={40} /> }
            ].map((stat, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 text-center">
                {stat.icon}
                <div className="text-blue-100 font-medium text-lg">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
