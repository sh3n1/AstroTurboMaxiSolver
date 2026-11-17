/**
 * How a row of Settings looks, shared by the page and each of its sections, since Angular
 * keeps a component's styles to itself.
 */
export const SETTINGS_ROW_STYLES = `
  /* Section titles: small, bold and spaced, so the sections are easy to tell apart. */
  ion-list {
    margin-bottom: 4px;
  }
  /* Icons lead each row, in the app's light blue. */
  ion-item > ion-icon[slot='start'] {
    color: var(--ion-color-primary);
    margin-inline-end: 16px;
  }
  /* Labels and hints wrap instead of being cut off, at the readable text sizes. */
  ion-toggle::part(label),
  ion-select::part(label) {
    white-space: normal;
    overflow: visible;
  }
  ion-toggle::part(supporting-text) {
    color: var(--af-muted);
    font-size: calc(14px * var(--af-scale, 1));
    line-height: 1.35;
  }
  ion-label p {
    color: var(--af-muted);
  }
  .good {
    color: var(--ion-color-success);
  }
  .warn {
    color: var(--ion-color-warning);
  }
  /* Green has little red in it, so at night it would turn dark red. Full-strength there. */
  :host-context(html.night) .good {
    color: var(--af-text);
  }
`;

/** A section of Settings in its own component: a block, so it stays whole in a column when the page has two. */
export const SETTINGS_SECTION_STYLES = `
  :host {
    display: block;
  }
  ${SETTINGS_ROW_STYLES}
`;
