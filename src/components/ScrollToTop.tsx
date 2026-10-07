import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
      return () => cancelAnimationFrame(frame);
    }
    // Reset scroll to top on route change
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth", // Optional: Adds smooth scrolling
    });
  }, [pathname, hash]);

  return null;
}
