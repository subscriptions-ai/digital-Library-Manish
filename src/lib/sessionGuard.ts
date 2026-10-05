/**
 * Any request answered "401 SESSION_EXPIRED_OR_REVOKED" means this browser's
 * session has been ended — by signing out elsewhere, by an admin, or by its
 * expiry. Nearly every screen calls fetch itself, so the one place that sees
 * all of them is fetch.
 */
export function installSessionGuard() {
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    if (response.status === 401) {
      try {
        const body = await response.clone().json();
        if (body?.code === 'SESSION_EXPIRED_OR_REVOKED') {
          try { localStorage.removeItem('token'); sessionStorage.setItem('sessionEnded', '1'); } catch { /* storage blocked */ }
          if (window.location.pathname !== '/login') window.location.assign('/login');
        }
      } catch { /* not JSON — not ours */ }
    }
    return response;
  };
}
