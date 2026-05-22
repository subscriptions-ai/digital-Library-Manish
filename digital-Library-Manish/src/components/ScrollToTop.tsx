import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset scroll to top on route change
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth", // Optional: Adds smooth scrolling
    });
  }, [pathname]);

  return null;
}
