import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Laptop } from "lucide-react";

export function InteractiveStudents() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // 1 = main student, 2 = friend 1, 3 = friend 2
  const [students, setStudents] = useState([
    { id: 1, phase: 'hidden', targetX: -80, color: '#3b82f6', isStanding: false },
    { id: 2, phase: 'hidden', targetX: 0, color: '#10b981', isStanding: false },
    { id: 3, phase: 'hidden', targetX: 80, color: '#8b5cf6', isStanding: false },
  ]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    // Sequence
    const timers = [
      setTimeout(() => setStudents(s => s.map(st => st.id === 1 ? { ...st, phase: 'walking' } : st)), 500),
      setTimeout(() => setStudents(s => s.map(st => st.id === 1 ? { ...st, phase: 'sitting' } : st)), 2500),
      
      setTimeout(() => setStudents(s => s.map(st => st.id === 2 ? { ...st, phase: 'walking' } : st)), 3000),
      setTimeout(() => setStudents(s => s.map(st => st.id === 2 ? { ...st, phase: 'sitting' } : st)), 5000),
      
      setTimeout(() => setStudents(s => s.map(st => st.id === 3 ? { ...st, phase: 'walking' } : st)), 4000),
      setTimeout(() => setStudents(s => s.map(st => st.id === 3 ? { ...st, phase: 'sitting' } : st)), 6000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleClick = (id: number) => {
    setStudents(s => s.map(st => {
      if (st.id === id && st.phase === 'sitting') {
        return { ...st, isStanding: true };
      }
      return st;
    }));

    // Sit back down after 3 seconds
    setTimeout(() => {
      setStudents(s => s.map(st => st.id === id ? { ...st, isStanding: false } : st));
    }, 3000);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[400px] bg-slate-900 rounded-2xl overflow-hidden border border-white/10"
    >
      {/* Background Room Details */}
      <div className="absolute bottom-0 w-full h-[150px] bg-slate-800 border-t border-slate-700" />
      <div className="absolute top-10 left-10 w-20 h-24 bg-slate-800 rounded-md border border-slate-700 opacity-50" />
      <div className="absolute top-16 left-36 w-16 h-20 bg-slate-800 rounded-md border border-slate-700 opacity-50" />
      
      {/* Table */}
      <div className="absolute bottom-[60px] left-1/2 -translate-x-1/2 w-[350px] h-[15px] bg-slate-700 rounded-md z-10 border-b-4 border-slate-900">
        <div className="absolute top-[15px] left-10 w-4 h-[60px] bg-slate-800" />
        <div className="absolute top-[15px] right-10 w-4 h-[60px] bg-slate-800" />
      </div>

      {/* Students */}
      {students.map((student) => {
        if (student.phase === 'hidden') return null;

        // Calculate look angle
        // Student position is approx at center (0,0) offset by targetX, and slightly below center.
        const stX = student.targetX; 
        const stY = 50; 
        const angle = Math.atan2(mousePos.y - stY, mousePos.x - stX) * (180 / Math.PI);
        const eyeX = Math.cos(angle * Math.PI / 180) * 4;
        const eyeY = Math.sin(angle * Math.PI / 180) * 4;

        const isSitting = student.phase === 'sitting' && !student.isStanding;
        const isWalking = student.phase === 'walking';
        const isStanding = student.isStanding;

        return (
          <motion.div
            key={student.id}
            className="absolute bottom-[75px] left-1/2 z-20 cursor-pointer"
            initial={{ x: 300, y: 0 }}
            animate={{ 
              x: isWalking ? student.targetX : student.targetX,
              y: isSitting ? 20 : (isStanding ? -20 : 0)
            }}
            transition={{ duration: isWalking ? 2 : 0.5, ease: "easeInOut" }}
            onClick={() => handleClick(student.id)}
          >
            <div className="relative w-12 flex flex-col items-center">
              
              {/* Thought Bubble */}
              <AnimatePresence>
                {isStanding && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute -top-16 -right-24 bg-white text-slate-900 text-[10px] font-bold p-2 rounded-lg shadow-xl w-[100px] text-center"
                  >
                    Don't disturb! I am reading now.
                    <div className="absolute -bottom-1 left-4 w-2 h-2 bg-white rotate-45" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Head */}
              <motion.div 
                className="w-8 h-8 rounded-full border-2 border-slate-900 shadow-md relative z-30"
                style={{ backgroundColor: student.color }}
                animate={{ y: isWalking ? [0, -5, 0] : 0 }}
                transition={{ repeat: isWalking ? Infinity : 0, duration: 0.3 }}
              >
                {/* Eyes that track mouse */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
                  <div className="w-2 h-2 bg-white rounded-full relative overflow-hidden">
                    <motion.div className="w-1 h-1 bg-slate-900 rounded-full absolute top-1/2 left-1/2" animate={{ x: eyeX - 0.5, y: eyeY - 0.5 }} transition={{ type: 'spring', stiffness: 300 }} />
                  </div>
                  <div className="w-2 h-2 bg-white rounded-full relative overflow-hidden">
                    <motion.div className="w-1 h-1 bg-slate-900 rounded-full absolute top-1/2 left-1/2" animate={{ x: eyeX - 0.5, y: eyeY - 0.5 }} transition={{ type: 'spring', stiffness: 300 }} />
                  </div>
                </div>
              </motion.div>

              {/* Body */}
              <motion.div 
                className="w-10 h-12 bg-slate-600 rounded-t-xl border-2 border-slate-900 relative z-20"
                style={{ backgroundColor: student.color }}
                animate={{ 
                  height: isSitting ? 20 : 40,
                  y: isWalking ? [0, -2, 0] : 0 
                }}
                transition={{ repeat: isWalking ? Infinity : 0, duration: 0.3 }}
              />

              {/* Legs */}
              {!isSitting && (
                <div className="flex gap-2 absolute -bottom-8">
                  <motion.div 
                    className="w-3 h-8 bg-slate-700 rounded-b-md border-2 border-slate-900"
                    animate={{ y: isWalking ? [0, -5, 0] : 0 }}
                    transition={{ repeat: isWalking ? Infinity : 0, duration: 0.4 }}
                  />
                  <motion.div 
                    className="w-3 h-8 bg-slate-700 rounded-b-md border-2 border-slate-900"
                    animate={{ y: isWalking ? [-5, 0, -5] : 0 }}
                    transition={{ repeat: isWalking ? Infinity : 0, duration: 0.4 }}
                  />
                </div>
              )}

              {/* Laptop (only visible when sitting) */}
              <AnimatePresence>
                {isSitting && (
                  <motion.div 
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="absolute -bottom-4 z-40 text-slate-300 drop-shadow-lg"
                  >
                    <Laptop size={28} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-2 bg-blue-400/50 blur-[2px] animate-pulse" />
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        );
      })}

    </div>
  );
}
