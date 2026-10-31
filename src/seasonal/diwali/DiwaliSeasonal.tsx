import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { diwaliLevel, isQuietPath } from './isDiwaliActive';
import { DiwaliAnnouncementBand } from './AnnouncementBand';
import './diwali.css';

/**
 * The one thing the public layout mounts.
 *
 * It decides whether the dressing applies to the page being shown, puts
 * data-seasonal="diwali" and data-seasonal-level on the document while it
 * does, and renders the greeting band. Every rule in diwali.css hangs off those
 * attributes, so the stylesheet is inert until this component says otherwise,
 * and the header's gold rule needs no change in the header's own file.
 *
 * The attribute is set in a layout effect rather than an ordinary one so it
 * lands before the browser paints: set after the paint, the active tab's rule
 * would be teal for one frame and then gold. It is removed when the component
 * unmounts and whenever the route is one a reader is reading, so a record page,
 * the viewer and the sign-in forms are never dressed, and no signed-in screen
 * can inherit it — this only ever mounts inside the public layout.
 */
export function DiwaliSeasonal() {
  const { pathname } = useLocation();
  const level = isQuietPath(pathname) ? null : diwaliLevel();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.removeAttribute('data-seasonal');
      root.removeAttribute('data-seasonal-level');
    };
    if (!level) {
      clear();
      return;
    }
    root.setAttribute('data-seasonal', 'diwali');
    root.setAttribute('data-seasonal-level', level);
    return clear;
  }, [level]);

  if (!level) return null;
  return <DiwaliAnnouncementBand />;
}
