import React from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, BookOpen, Clock, Heart, Search, Smartphone, ArrowRight, Video, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-sm mb-6 border border-indigo-100"
            >
              <GraduationCap size={16} /> For Students & Researchers
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-tight mb-6 tracking-tight"
            >
              Your Personal <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">Research Assistant</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed"
            >
              Access a universe of knowledge curated just for you. From your first semester to your final thesis, we provide the tools you need to excel.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button onClick={() => navigate('/digital-library')} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5">
                Explore Library <ArrowRight size={20} />
              </button>
            </motion.div>
          </div>

          <div className="lg:w-1/2 relative w-full aspect-square max-w-lg mx-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-gradient-to-tr from-indigo-100 to-blue-50 rounded-full blur-3xl opacity-50"
            />
            {/* Abstract decorative elements representing study/research */}
            <div className="relative h-full w-full">
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-[10%] left-[10%] w-3/4 h-3/4 bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-4 z-20"
              >
                <div className="w-1/3 h-4 bg-indigo-100 rounded-full" />
                <div className="w-full h-32 bg-slate-50 rounded-xl" />
                <div className="w-full h-3 bg-slate-100 rounded-full" />
                <div className="w-5/6 h-3 bg-slate-100 rounded-full" />
                <div className="w-4/6 h-3 bg-slate-100 rounded-full" />
              </motion.div>

              <motion.div 
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute bottom-[5%] right-[5%] w-1/2 h-1/2 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-30 flex flex-col items-center justify-center gap-3 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Heart size={24} fill="currentColor" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">Saved to Wish List</div>
                  <div className="text-xs text-slate-500 mt-1">Quantum Physics Vol 3</div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Built for Modern Learners</h2>
          <p className="text-slate-600 text-lg">We've designed every feature around how students actually study, read, and research today.</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors group"
            >
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* CTA */}
      <div className="py-20 bg-white border-t border-slate-100 text-center px-6">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Ready to accelerate your research?</h2>
        <p className="text-slate-600 mb-8 max-w-2xl mx-auto">Join thousands of students and researchers who are already using our platform to discover and manage academic content.</p>
        <button onClick={() => navigate('/login')} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors">
          Start Your Journey
        </button>
      </div>
    </div>
  );
}
