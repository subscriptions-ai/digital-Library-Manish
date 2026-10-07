import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * The light/dark switch, one component for every place that has one.
 *
 * The label says what pressing it DOES ("Switch to light mode"), the icon shows
 * the mode you would go to, and the tooltip repeats the label so a mouse user
 * gets the same words a screen reader does. It is a real button, so Tab, Enter
 * and Space all work, and the global focus ring applies.
 */
export function ThemeToggle({ className = 'btn btn-ghost btn-icon btn-sm', size = 16 }: { className?: string; size?: number }) {
  const { dark, toggleDark } = useTheme();
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" onClick={toggleDark} title={label} aria-label={label} className={className}>
      {dark ? <Sun size={size} aria-hidden="true" /> : <Moon size={size} aria-hidden="true" />}
    </button>
  );
}
