import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * The theme.
 *
 * The rule, in order: a choice the person made and we saved; otherwise whatever
 * their system prefers; otherwise light. index.html applies the same rule before
 * the first paint, so this provider only has to agree with it, not decide.
 *
 * One thing it deliberately does NOT do is save on mount. Writing the resolved
 * value at start-up turned "my system is dark" into "I chose dark" the first time
 * anyone visited, after which the system could never be followed again. A value is
 * saved only when somebody presses the switch.
 */

const KEY = 'lms-dark';

interface ThemeContextType {
  dark: boolean;
  setDark: React.Dispatch<React.SetStateAction<boolean>>;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function savedChoice(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch { return null; }
}

function systemPrefersDark(): boolean {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  catch { return false; }
}

/** Put the theme on the page: the class Tailwind keys on, a data attribute for CSS, the UA's own controls, and the browser chrome colour. */
function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1020' : '#ffffff');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => savedChoice() ?? systemPrefersDark());

  useEffect(() => { applyTheme(dark); }, [dark]);

  // Until somebody chooses, follow the system as it changes; once they have, leave it alone.
  useEffect(() => {
    let mq: MediaQueryList | undefined;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
    const onChange = (e: MediaQueryListEvent) => { if (savedChoice() === null) setDark(e.matches); };
    mq.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  // A choice made in another tab applies here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue !== null) setDark(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleDark = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage blocked: the choice lasts for this visit */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ dark, setDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    // Rendered outside the provider (an isolated route or a test): act on the document directly.
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return {
      dark: isDark,
      setDark: () => {},
      toggleDark: () => {
        if (typeof document === 'undefined') return;
        const next = !document.documentElement.classList.contains('dark');
        applyTheme(next);
        try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
      },
    };
  }
  return context;
}
