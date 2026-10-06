import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, PieChart, ShieldCheck, Database, Layers, ArrowRight, Zap, CheckCircle2, Cloud, Clock, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui';

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
    <div className="min-h-screen bg-surface">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-navy py-12 sm:py-16 lg:py-24">
        <div className="container-public relative flex flex-col items-center gap-12 lg:flex-row">
          <div className="lg:w-1/2">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]"
            >
              <Building2 size={14} aria-hidden="true" className="text-amber" /> Empower Your Institution
            </motion.p>
            
            <motion.h1 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="on-dark mt-4 mb-6 text-5xl font-bold leading-tight"
            >
              The Next-Generation <span className="text-amber">Digital Library</span> For Colleges and Universities
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="on-dark-2 mb-8 max-w-2xl text-base leading-relaxed sm:text-lg"
            >
              Transform how your students and faculty access academic knowledge. Provide world-class resources with powerful management and analytics tools.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.15 }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <Button variant="highlight" size="lg" onClick={() => navigate('/signup')}>
                Create a Free Account <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </motion.div>
          </div>

          <div className="relative mb-6 w-full lg:mb-0 lg:w-1/2">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="relative overflow-hidden rounded-2xl border border-white/10"
            >
              <img 
                src="https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&q=80" 
                alt="University Library" 
                className="h-auto w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </motion.div>
            
            {/* Floating Elements — kept inside the column so a phone never scrolls sideways. */}
            <div className="absolute -bottom-6 left-4 z-20 flex items-center gap-3 rounded-xl border border-rule bg-surface p-3 shadow-[var(--shadow-pop)] sm:gap-4 sm:p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                <Users size={22} />
              </div>
              <div>
                <div className="text-sm font-medium text-muted">Platform Management</div>
                <div className="text-lg font-bold text-ink">Centralized</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Features Grid */}
      <section className="border-t border-rule bg-ground py-16 sm:py-24">
        <div className="container-public">
          <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
            <h2 className="mb-4 text-3xl font-bold text-ink md:text-4xl">Everything an Institution Needs</h2>
            <p className="text-base text-ink-2 sm:text-lg">We provide a comprehensive ecosystem designed specifically for librarians, administrators, and educators.</p>
          </div>
          
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                className="card card-pad card-interactive"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3 className="mb-3 text-xl font-bold text-ink">{feature.title}</h3>
                <p className="leading-relaxed text-ink-2">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats/Highlight Section */}
      <section className="bg-navy py-16 sm:py-24">
        <div className="container-public flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          <div className="lg:w-1/2">
            <h2 className="on-dark mb-6 text-3xl font-bold leading-tight md:text-4xl">Empower your campus with unlimited learning</h2>
            <p className="on-dark-2 mb-8 text-base leading-relaxed sm:text-lg">
              We partner with top global publishers to bring high-impact research to your institution's fingertips. Enhance academic performance and research output exponentially.
            </p>
            <ul className="space-y-4">
              {[
                'Unlimited simultaneous user access',
                'IP-based authentication available',
                'MARC records provided',
                '24/7 dedicated technical support'
              ].map((item, i) => (
                <li key={i} className="on-dark flex items-center gap-3 font-medium">
                  <CheckCircle2 className="shrink-0 text-amber" size={20} aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid w-full grid-cols-2 gap-4 sm:gap-6 lg:w-1/2">
            {[
              { label: 'Secure Access', icon: <ShieldCheck className="mx-auto mb-3 text-amber" size={32} aria-hidden="true" /> },
              { label: 'Cloud Infrastructure', icon: <Cloud className="mx-auto mb-3 text-amber" size={32} aria-hidden="true" /> },
              { label: '24/7 Availability', icon: <Clock className="mx-auto mb-3 text-amber" size={32} aria-hidden="true" /> },
              { label: 'Multi-device Support', icon: <Smartphone className="mx-auto mb-3 text-amber" size={32} aria-hidden="true" /> }
            ].map((stat, i) => (
              <div key={i} className="on-dark-fill on-dark-edge rounded-xl border p-5 text-center sm:p-8">
                {stat.icon}
                <div className="on-dark-2 text-base font-medium sm:text-lg">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
