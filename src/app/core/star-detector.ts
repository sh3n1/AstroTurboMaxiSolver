// Finds stars in an image, with no Angular dependency.
//
// A city sky is bright and uneven, so the steps are: estimate the sky's brightness
// across the frame, subtract it, measure the noise that remains, and keep groups of
// pixels that stand well above that noise.

export interface DetectedStar {
  x: number;
  y: number;
  /** Total brightness above the sky. */
  flux: number;
  /** How far the star stands above the noise. */
  snr: number;
  pixels: number;
}

export interface DetectionResult {
  stars: DetectedStar[];
  /** Median sky brightness, on the image's 0 to 255 scale. */
  background: number;
  /** Noise left after removing the sky. */
  noise: number;
}

const BLOCK_SIZE = 32; // Sky brightness is estimated in blocks this many pixels wide
const THRESHOLD_SIGMA = 5;
const MIN_STAR_PIXELS = 2; // A single bright pixel is a hot pixel, not a star
const MAX_STAR_PIXELS = 900; // Anything larger is a light, the Moon or a building
const MAX_STARS = 200;
const MIN_NOISE = 0.25; // Video processing can flatten noise to nothing, so keep a floor

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/** Estimates sky brightness per block, using the median so stars don't affect it. */
function blockBackground(
  pixels: Float32Array,
  width: number,
  height: number,
): { grid: Float32Array; cols: number; rows: number } {
  const cols = Math.max(1, Math.floor(width / BLOCK_SIZE));
  const rows = Math.max(1, Math.floor(height / BLOCK_SIZE));
  const grid = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sample: number[] = [];
      // Sampling every other pixel is accurate enough, and much faster.
      for (let y = row * BLOCK_SIZE; y < (row + 1) * BLOCK_SIZE && y < height; y += 2) {
        for (let x = col * BLOCK_SIZE; x < (col + 1) * BLOCK_SIZE && x < width; x += 2) {
          sample.push(pixels[y * width + x]);
        }
      }
      grid[row * cols + col] = median(sample);
    }
  }
  return { grid, cols, rows };
}

/** Finds stars in a greyscale image, stored row by row. Brightest come first. */
export function detectStars(pixels: Float32Array, width: number, height: number): DetectionResult {
  const { grid, cols, rows } = blockBackground(pixels, width, height);

  // Subtract the sky, blending between blocks so their edges don't look like stars.
  const residual = new Float32Array(pixels.length);
  for (let y = 0; y < height; y++) {
    const gridY = Math.max(0, Math.min(rows - 1.001, y / BLOCK_SIZE - 0.5));
    const row = Math.floor(gridY);
    const blendY = gridY - row;
    const nextRow = Math.min(row + 1, rows - 1);
    for (let x = 0; x < width; x++) {
      const gridX = Math.max(0, Math.min(cols - 1.001, x / BLOCK_SIZE - 0.5));
      const col = Math.floor(gridX);
      const blendX = gridX - col;
      const nextCol = Math.min(col + 1, cols - 1);
      const top = grid[row * cols + col] * (1 - blendX) + grid[row * cols + nextCol] * blendX;
      const bottom = grid[nextRow * cols + col] * (1 - blendX) + grid[nextRow * cols + nextCol] * blendX;
      residual[y * width + x] = pixels[y * width + x] - (top * (1 - blendY) + bottom * blendY);
    }
  }

  // Noise from the median absolute deviation, which stars barely affect.
  const deviations: number[] = [];
  for (let i = 0; i < residual.length; i += 7) deviations.push(Math.abs(residual[i]));
  const noise = Math.max(median(deviations) * 1.4826, MIN_NOISE);
  const threshold = THRESHOLD_SIGMA * noise;

  // Group touching pixels above the threshold, measuring each group's centre.
  const visited = new Uint8Array(residual.length);
  const stack: number[] = [];
  const stars: DetectedStar[] = [];
  for (let start = 0; start < residual.length; start++) {
    if (visited[start] || residual[start] < threshold) continue;
    visited[start] = 1;
    stack.push(start);
    let [count, flux, sumX, sumY] = [0, 0, 0, 0];
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      const value = residual[index];
      count++;
      flux += value;
      sumX += value * x;
      sumY += value * y;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && !visited[next] && residual[next] >= threshold) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (count >= MIN_STAR_PIXELS && count <= MAX_STAR_PIXELS) {
      stars.push({ x: sumX / flux, y: sumY / flux, flux, snr: flux / (noise * Math.sqrt(count)), pixels: count });
    }
  }

  stars.sort((a, b) => b.flux - a.flux);
  return { stars: stars.slice(0, MAX_STARS), background: median(Array.from(grid)), noise };
}
