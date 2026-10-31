import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { diwaliLevel, isLiteDevice, isQuietPath } from './isDiwaliActive';
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
 *
 * Two more attributes ride along. data-seasonal-lite marks a device that is
 * spared the decoration that is only movement (see isLiteDevice).
 * data-seasonal-hidden is on while the tab is in the background, and the
 * stylesheet pauses every seasonal animation under it: a festival nobody is
 * looking at should not be drawing frames, and the lights pick up where they
 * left off when the reader comes back rather than jumping.
 */
export function DiwaliSeasonal() {
  const { pathname } = useLocation();
  const level = isQuietPath(pathname) ? null : diwaliLevel();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const syncHidden = () => root.toggleAttribute('data-seasonal-hidden', document.hidden);
    const clear = () => {
      document.removeEventListener('visibilitychange', syncHidden);
      root.removeAttribute('data-seasonal');
      root.removeAttribute('data-seasonal-level');
      root.removeAttribute('data-seasonal-lite');
      root.removeAttribute('data-seasonal-hidden');
    };
    if (!level) {
      clear();
      return;
    }
    root.setAttribute('data-seasonal', 'diwali');
    root.setAttribute('data-seasonal-level', level);
    root.toggleAttribute('data-seasonal-lite', isLiteDevice());
    syncHidden();
    document.addEventListener('visibilitychange', syncHidden);
    return clear;
  }, [level]);

  if (!level) return null;
  return <DiwaliAnnouncementBand />;
}
