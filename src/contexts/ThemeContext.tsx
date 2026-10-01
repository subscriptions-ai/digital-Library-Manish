import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  dark: boolean;
  setDark: React.Dispatch<React.SetStateAction<boolean>>;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('lms-dark');
      if (stored !== null) {
        return stored === '1';
      }
      return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('lms-dark', dark ? '1' : '0');
    } catch {
      // ignore
    }
  }, [dark]);

  const toggleDark = () => setDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ dark, setDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return {
      dark: isDark,
      setDark: () => {},
      toggleDark: () => {
        if (typeof document !== 'undefined') {
          const next = !document.documentElement.classList.contains('dark');
          document.documentElement.classList.toggle('dark', next);
          try {
            localStorage.setItem('lms-dark', next ? '1' : '0');
          } catch {}
        }
      }
    };
  }
  return context;
}
