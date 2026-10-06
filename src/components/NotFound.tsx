import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { BookOpen, Home, Library } from "lucide-react";
import { buttonClass } from "./ui";

export function NotFound() {
  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-navy px-4 py-16 sm:py-20">
      <div className="relative z-10 w-full max-w-2xl text-center">
        <motion.div 
          className="relative mb-8 inline-flex items-center justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Two books either side of the number, only where there is room for them. */}
          <BookOpen size={48} aria-hidden="true" className="on-dark-3 absolute -left-16 -top-4 hidden sm:block" />
          <BookOpen size={40} aria-hidden="true" className="on-dark-3 absolute -right-16 top-10 hidden sm:block" />

          <h1 className="text-[6rem] font-bold leading-none text-amber sm:text-[8rem]">
            404
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="space-y-5"
        >
          <h2 className="on-dark text-3xl font-bold tracking-tight sm:text-4xl">
            Page Doesn't Exist
          </h2>
          
          <p className="on-dark-2 mx-auto max-w-md text-base leading-relaxed sm:text-lg">
            The page you are looking for might have been removed, renamed, or is temporarily unavailable in our archives.
          </p>

          <div className="flex flex-col items-stretch justify-center gap-3 pt-6 sm:flex-row sm:items-center">
            <Link to="/" className={buttonClass("highlight", "lg")}>
              <Home size={18} aria-hidden="true" />
              Go to Home
            </Link>
            
            <Link to="/digital-library" className="btn btn-lg on-dark on-dark-fill on-dark-edge">
              <Library size={18} aria-hidden="true" />
              Browse Library
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
