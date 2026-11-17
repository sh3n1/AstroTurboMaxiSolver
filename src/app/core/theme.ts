/**
 * The theme's colours that code draws with: the sky map, the time ruler and the charts are
 * canvases, which can't use CSS variables without asking the browser for each one. They are
 * the same colours as the variables in src/theme/variables.scss, named beside each, and
 * an end-to-end test in e2e/app.spec.ts fails if one is changed without the other.
 */
export const THEME = {
  /** --af-sky: the sky map's background. */
  sky: '#05070f',
  /** --af-ink: dark text and outlines on a bright fill, and the darkest night on the charts. */
  ink: '#0a0e1a',
  /** --af-text */
  text: '#e8ebf5',
  /** --af-muted */
  muted: '#a8b0c6',
  /** --af-guidance: the chevrons and guide line towards the target. */
  guidance: '#a9cbff',
  /** --af-accent: the app's light blue. */
  primary: '#8fb7ff',
  /** --af-good: green, for on target and the horizon's compass points. */
  success: '#6fcf9f',
  /** --af-bad: red, for the reticle. */
  danger: '#e5484d',
};

/** The CSS variable each of the colours above repeats. */
export const THEME_VARIABLES: Record<keyof typeof THEME, string> = {
  sky: '--af-sky',
  ink: '--af-ink',
  text: '--af-text',
  muted: '--af-muted',
  guidance: '--af-guidance',
  primary: '--af-accent',
  success: '--af-good',
  danger: '--af-bad',
};
