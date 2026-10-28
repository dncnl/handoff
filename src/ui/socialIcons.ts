import { siGithub } from 'simple-icons';

// Monochrome contact marks; all inherit currentColor so they follow the theme.
// Simple Icons no longer carries LinkedIn, so that mark and the envelope are drawn here.
const svg = (inner: string) =>
  `<svg class="social-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;

const ICONS: Record<string, string> = {
  email: svg(
    '<path d="M3.5 5.5h17v13h-17z M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  ),
  github: svg(`<path fill="currentColor" d="${siGithub.path}"/>`),
  linkedin: svg(
    '<path fill="currentColor" fill-rule="evenodd" d="M4.5 2h15A2.5 2.5 0 0 1 22 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19.5v-15A2.5 2.5 0 0 1 4.5 2z M7.1 5.3a1.65 1.65 0 1 0 0 3.3 1.65 1.65 0 0 0 0-3.3z M5.7 9.8h2.8V18H5.7z M10.2 9.8h2.7v1.2c.45-.8 1.45-1.4 2.75-1.4 2.4 0 3 1.55 3 3.6V18h-2.8v-4.2c0-1.05-.25-1.9-1.25-1.9s-1.6.75-1.6 1.9V18h-2.8z"/>',
  ),
};

/** Icon for a contact link by its label (Email, GitHub, LinkedIn), or '' if there is none. */
export function socialIcon(label: string): string {
  return ICONS[label.toLowerCase()] ?? '';
}
