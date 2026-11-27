// Measurements around a detection, shared by the replay spikes. Generic: they look only at
// the pixels around it, never at where in the frame or the sky it is.

/**
 * Mean size of the brightness steps between neighbouring pixels in a box around a point,
 * leaving out the star itself: how busy its surroundings are. Smooth sky gives about the
 * noise; windows, building edges and antennas give many times more.
 */
export function edgeDensity(
  pixels: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  half: number,
): number {
  let sum = 0;
  let count = 0;
  for (let py = Math.max(1, Math.round(y - half)); py < Math.min(height - 1, Math.round(y + half)); py++) {
    for (let px = Math.max(1, Math.round(x - half)); px < Math.min(width - 1, Math.round(x + half)); px++) {
      if (Math.hypot(px - x, py - y) < 6) continue;
      const i = py * width + px;
      sum += Math.abs(pixels[i + 1] - pixels[i - 1]) + Math.abs(pixels[i + width] - pixels[i - width]);
      count++;
    }
  }
  return count ? sum / count : 0;
}
