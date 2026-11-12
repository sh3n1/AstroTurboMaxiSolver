import { EYEPIECE_VIEW_SCALE, viewLayout } from './view-layout';

describe('viewLayout', () => {
  it('centres the sky map with the phone upright, its field spanning the width', () => {
    expect(viewLayout(400, 800, false)).toEqual({ centreX: 200, centreY: 400, spanPx: 400 });
  });

  it('puts the eyepiece circle above its panel with the phone upright', () => {
    const layout = viewLayout(400, 800, true);
    expect(layout.centreX).toBe(200);
    expect(layout.centreY).toBeLessThan(400);
    expect(layout.spanPx).toBe(400);
  });

  it('centres the map between the tab rail and the buttons with the phone on its side', () => {
    // A rail and a notch take 190 px at the left, the buttons 60 px at the right.
    const layout = viewLayout(950, 440, false, { left: 190, right: 890 });
    expect(layout).toEqual({ centreX: 540, centreY: 220, spanPx: 950 });
  });

  it('fits the eyepiece circle between its panel and the buttons with the phone on its side', () => {
    const clear = { left: 560, right: 890 };
    const { centreX, centreY, spanPx } = viewLayout(950, 440, true, clear);
    const radius = spanPx / EYEPIECE_VIEW_SCALE / 2;
    // The whole circle is on screen, with neither the panel nor the buttons over it.
    expect(centreX - radius).toBeGreaterThanOrEqual(clear.left);
    expect(centreX + radius).toBeLessThanOrEqual(clear.right);
    expect(centreY - radius).toBeGreaterThanOrEqual(0);
    expect(centreY + radius).toBeLessThanOrEqual(440);
  });

  it('lets the height limit the circle when there is width to spare', () => {
    const { spanPx } = viewLayout(1400, 400, true, { left: 400, right: 1300 });
    expect(spanPx / EYEPIECE_VIEW_SCALE).toBeLessThanOrEqual(400);
    expect(spanPx / EYEPIECE_VIEW_SCALE).toBeGreaterThan(300);
  });

  it('keeps the circle a usable size when little room is left', () => {
    const { spanPx } = viewLayout(500, 360, true, { left: 400, right: 440 });
    expect(spanPx / EYEPIECE_VIEW_SCALE / 2).toBeGreaterThanOrEqual(60);
  });
});
