import React from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, BookOpen, Clock, Heart, Search, Smartphone, ArrowRight, Video, FileText, Check, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { isIndividualAccount } from '../constants';
import { formatRupees } from '../lib/institutionPricing';
import { SOLO_RATE_STANDARD, SOLO_RATE_BULK, SOLO_BULK_THRESHOLD } from '../lib/soloPricing';
import { getDashboardRoute } from '../lib/dashboardRoute';

const features = [
  {
    icon: <Search size={24} />,
    title: 'Smart AI Search',
    description: 'Find exactly what you need with our AI-powered semantic search that understands context, not just keywords.'
  },
  {
    icon: <BookOpen size={24} />,
    title: 'Personalized Library',
    description: 'Save your favorite articles, journals, and videos in your personal Wish List for quick access anytime.'
  },
  {
    icon: <Clock size={24} />,
    title: 'Continue Reading',
    description: 'Never lose your place. Our system automatically remembers the exact page or timestamp where you left off.'
  },
  {
    icon: <FileText size={24} />,
    title: 'Citation & Notes',
    description: 'Export citations in multiple formats (APA, MLA, Chicago) and keep digital notes attached directly to the content.'
  },
  {
    icon: <Smartphone size={24} />,
    title: 'Read Anywhere',
    description: 'Fully responsive mobile-friendly reader. Access your course materials seamlessly from your laptop, tablet, or phone.'
  },
  {
    icon: <Video size={24} />,
    title: 'Interactive Multimedia',
    description: 'Go beyond text with our integrated video library featuring expert lectures and complex visual demonstrations.'
  }
];

export function ForStudents() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const solo = isIndividualAccount(profile as any);

  return (
    <div className="min-h-screen bg-ground">
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
              <GraduationCap size={14} aria-hidden="true" className="text-amber" /> For Students & Researchers
            </motion.p>
            
            <motion.h1 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="on-dark mt-4 mb-6 text-5xl font-bold leading-tight"
            >
              Your Personal <br />
              <span className="text-amber">Research Assistant</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="on-dark-2 mb-8 text-base leading-relaxed sm:text-lg"
            >
              Access a universe of knowledge curated just for you. From your first semester to your final thesis, we provide the tools you need to excel.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.15 }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <Button variant="highlight" size="lg" onClick={() => navigate('/digital-library')}>
                Explore Library <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </motion.div>
          </div>

          {/* Abstract decorative elements representing study/research */}
          <div className="relative mx-auto aspect-square w-full max-w-md lg:w-1/2" aria-hidden="true">
            <div className="relative h-full w-full">
              <div className="absolute left-[8%] top-[8%] z-20 flex h-3/4 w-3/4 flex-col gap-4 rounded-2xl border border-rule bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6">
                <div className="h-4 w-1/3 rounded-full bg-accent-soft" />
                <div className="h-24 w-full rounded-xl bg-surface-2 sm:h-32" />
                <div className="h-3 w-full rounded-full bg-surface-2" />
                <div className="h-3 w-5/6 rounded-full bg-surface-2" />
                <div className="h-3 w-4/6 rounded-full bg-surface-2" />
              </div>

              <div className="absolute bottom-[5%] right-[5%] z-30 flex h-1/2 w-1/2 flex-col items-center justify-center gap-3 rounded-2xl border border-rule bg-surface p-4 text-center shadow-[var(--shadow-pop)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Heart size={22} fill="currentColor" />
                </div>
                <div>
                  <div className="text-sm font-bold text-ink">Saved to Wish List</div>
                  <div className="mt-1 text-xs text-muted">Research Materials</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container-public py-16 sm:py-24">
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <h2 className="mb-4 text-3xl font-bold text-ink md:text-4xl">Built for Modern Learners</h2>
          <p className="text-base text-ink-2 sm:text-lg">We've designed every feature around how students actually study, read, and research today.</p>
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
              <h3 className="mb-2 text-lg font-bold text-ink">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-ink-2">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>
      
      {/* Subscription — Solo Learner pricing. Institutions have their own, on their own pages. */}
      <section className="bg-surface-2 py-16 sm:py-20" aria-labelledby="solo-subscription">
        <div className="container-public">
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <h2 id="solo-subscription" className="mb-3 text-3xl font-bold text-ink md:text-4xl">Subscription</h2>
            <p className="text-base text-ink-2 sm:text-lg">Start free. Subscribe to the departments you read most when you want to read without a clock.</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-rule bg-surface p-6">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-muted" aria-hidden="true" />
                <h3 className="text-lg font-bold text-ink">Free Subscription</h3>
              </div>
              <p className="mt-3 text-[28px] font-bold leading-none text-ink">Free</p>
              <p className="mt-1 text-sm text-muted">No card, no request forms</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> The whole library, every department</li>
                <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> Half an hour at a time</li>
              </ul>
              <Button variant="outline" size="lg" className="mt-6 w-full" onClick={() => navigate(profile ? getDashboardRoute(profile) : '/signup')}>
                {profile ? 'Go to Dashboard' : 'Register Free'}
              </Button>
            </div>
            <div className="flex flex-col rounded-xl border border-accent bg-accent-soft p-6">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-accent" aria-hidden="true" />
                <h3 className="text-lg font-bold text-ink">Premium Subscription</h3>
              </div>
              <p className="tnum mt-3 text-[28px] font-bold leading-none text-ink">{formatRupees(SOLO_RATE_STANDARD)}</p>
              <p className="mt-1 text-sm text-muted">per department / year</p>
              <div className="mt-4 rounded-lg border border-accent/30 bg-surface px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{SOLO_BULK_THRESHOLD}+ Departments</p>
                <p className="tnum text-sm font-semibold text-ink">{formatRupees(SOLO_RATE_BULK)} per department / year</p>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> Read your departments without the clock</li>
                <li className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> Twelve months from the day you subscribe</li>
              </ul>
              <Button variant="highlight" size="lg" className="mt-6 w-full" onClick={() => navigate(solo ? '/dashboard/subscribe' : profile ? getDashboardRoute(profile) : '/signup')}>
                Choose Departments
              </Button>
              <p className="mt-3 text-xs text-muted">Plus GST. For individual learners; colleges and companies subscribe from their own dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy py-16 text-center sm:py-20">
        <div className="container-public">
          <h2 className="on-dark mb-4 text-3xl font-bold">Ready to accelerate your research?</h2>
          <p className="on-dark-2 mx-auto mb-8 max-w-2xl">Join students and researchers who are using our platform to discover and manage academic content.</p>
          <Button variant="highlight" size="lg" onClick={() => navigate('/login')}>
            Start Your Journey
          </Button>
        </div>
      </section>
    </div>
  );
}
