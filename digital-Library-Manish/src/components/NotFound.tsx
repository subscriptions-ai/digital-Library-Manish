import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { BookOpen, Search, Home, Library } from "lucide-react";

export function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-slate-950 py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Advanced Animated Background Gradients focusing on Digital Library brand */}
      <motion.div 
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-purple-600/20 blur-[100px] rounded-full pointer-events-none" 
      />

      <div className="max-w-2xl w-full text-center relative z-10 glass-card bg-slate-900/50 backdrop-blur-2xl p-8 sm:p-16 rounded-[3rem] border border-white/5 shadow-2xl">
        
        {/* Floating Animation Container */}
        <motion.div 
          className="relative inline-flex items-center justify-center mb-10"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
        >
          {/* Floating Books Elements */}
          <motion.div
            animate={{ 
              y: [-15, 15, -15],
              rotate: [-5, 5, -5]
            }}
            transition={{ 
              duration: 5, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute -left-20 -top-8 text-blue-400 hidden sm:block"
          >
            <BookOpen size={56} className="opacity-80 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]" />
          </motion.div>
          
          <motion.div
            animate={{ 
              y: [15, -15, 15],
              rotate: [5, -5, 5]
            }}
            transition={{ 
              duration: 6, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute -right-20 top-12 text-purple-400 hidden sm:block"
          >
            <BookOpen size={48} className="opacity-70 drop-shadow-[0_0_20px_rgba(168,85,247,0.6)]" />
          </motion.div>

          {/* Central Holographic Sub-layer */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute -z-10"
          >
            <Search size={140} className="text-white/5 scale-150" />
          </motion.div>
          
          <h1 className="text-[8rem] sm:text-[10rem] font-black leading-none bg-clip-text text-transparent bg-gradient-to-br from-blue-300 via-blue-500 to-purple-500 relative" style={{ filter: 'drop-shadow(0 0 40px rgba(59,130,246,0.5))' }}>
            404
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="space-y-6"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Page Doesn't Exist
          </h2>
          
          <p className="text-base sm:text-lg text-slate-300 max-w-md mx-auto leading-relaxed">
            The page you are looking for might have been removed, renamed, or is temporarily unavailable in our archives.
          </p>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/" 
              className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-500 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all duration-300 relative group overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 w-full translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <Home size={18} className="relative z-10" />
              <span className="relative z-10">Go to Home</span>
            </Link>
            
            <Link 
              to="/digital-library" 
              className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 rounded-full bg-slate-800/50 border border-slate-700 text-white font-bold hover:bg-slate-700 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-300 backdrop-blur-sm"
            >
              <Library size={18} />
              <span>Browse Library</span>
            </Link>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
