import {
  siClaude,
  siCplusplus,
  siDart,
  siExpress,
  siFigma,
  siFlutter,
  siGit,
  siGithub,
  siJavascript,
  siNodedotjs,
  siNumpy,
  siOpenjdk,
  siPandas,
  siPostgresql,
  siPython,
  siScikitlearn,
  siSupabase,
  type SimpleIcon,
} from 'simple-icons';

// Same Simple Icons slugs and version as the Portfolio's TechIcon, bundled
// instead of fetched so the chips need no network.
const ICONS: Record<string, SimpleIcon> = Object.fromEntries(
  [
    siClaude,
    siCplusplus,
    siDart,
    siExpress,
    siFigma,
    siFlutter,
    siGit,
    siGithub,
    siJavascript,
    siNodedotjs,
    siNumpy,
    siOpenjdk,
    siPandas,
    siPostgresql,
    siPython,
    siScikitlearn,
    siSupabase,
  ].map((i) => [i.slug, i]),
);

/** Monochrome inline SVG that inherits currentColor, or '' when there's no glyph. */
export function techIcon(slug: string | undefined, size = 14): string {
  const icon = slug ? ICONS[slug] : undefined;
  if (!icon) return '';
  return `<svg class="tech-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${icon.path}"/></svg>`;
}
