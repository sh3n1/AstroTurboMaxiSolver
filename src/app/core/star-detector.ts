// Finds stars in an image, with no Angular dependency.
//
// A city sky is bright and uneven, so the steps are: estimate the sky's brightness
// across the frame, subtract it, measure the noise that remains, and keep groups of
// pixels that stand well above that noise.
//
// Real frames also hold things that stand above the noise but are not stars. The lens
// darkens the corners, the sky glow is brighter in the middle, and some phones leave a
// darker band along one side. The sky estimate can't follow such sharp changes exactly,
// so they leave long smears and broad faint patches. Stars are small, round and peaked,
// so groups that are long and thin, or broad and flat, are left out. So are the lines of
// a roof, a terrace beam or a building's edge against the sky. Bright lights, such as lit
// windows, are too large for stars, and the glare around them is left out too. These
// checks only look at shape, so they work the same under any sky, from a city to a dark site.

export interface DetectedStar {
  x: number;
  y: number;
  /** Total brightness above the sky. */
  flux: number;
  /** How far the star stands above the noise. */
  snr: number;
  pixels: number;
  /** The brightest pixel above the sky right around it, in grey levels. */
  peak: number;
  /** The spread of its light around its centre, in pixels (the RMS radius per axis). */
  width: number;
}

export interface DetectionResult {
  stars: DetectedStar[];
  /** Median sky brightness, on the image's 0 to 255 scale. */
  background: number;
  /** Typical noise left after removing the sky. */
  noise: number;
}

const BLOCK_SIZE = 32; // Sky brightness and noise are estimated in blocks this many pixels wide
const THRESHOLD_SIGMA = 4; // Against the local noise, so faint stars in the darker corners count too
const MIN_STAR_PIXELS = 2; // A single bright pixel is a hot pixel, not a star
/**
 * Anything larger is a light, a lit part of a building, the Moon or a bright planet.
 * Stars through a phone's main camera cover a few dozen pixels at most, even bright ones.
 */
const MAX_STAR_PIXELS = 150;
const MAX_STARS = 200;
/**
 * Lit windows, gaps between leaves and the lights of a street come in tight clusters,
 * while stars bright enough to cover this many pixels are scattered across the sky. A
 * spot this large with this many others within this distance is part of such a cluster.
 */
const CLUSTER_SPOT_PIXELS = 30;
const CLUSTER_NEIGHBOURS = 3;
const CLUSTER_RADIUS_PX = 50;
const MIN_NOISE = 0.25; // Video processing can flatten noise to nothing, so keep a floor

/**
 * How much longer than wide a group may be. Stars are round, or a little stretched if the
 * phone moved slightly. Smears along a dark edge are many times longer than wide.
 */
const MAX_ELONGATION = 3;
/**
 * A bright light, such as a lit window or a streetlight, has a glare around it that can
 * break into small spots. Spots this close to a light's edge, in pixels, or within half
 * the light's own size if that is larger, are left out.
 */
const GLARE_MARGIN_PX = 15;
/**
 * Only compact, bright things are lights. A light is at most this many pixels across,
 * which keeps the glow over a city, or a lit building's edge, from being taken for one
 * and masking the whole sky.
 */
const MAX_LIGHT_SIZE_PX = 200;
/** A light's brightest pixel stands at least this many times the threshold above the sky. */
const LIGHT_MIN_PEAK = 10;
/**
 * The camera's image has whole grey levels, so in a dark frame a patch just one level
 * brighter than the sky around it can pass the noise threshold, though it is only
 * rounding. Faint stars are that dim too, but small, so only patches this large must
 * stand at least this many levels above the sky around them.
 */
const ROUNDING_PATCH_PIXELS = 10;
const MIN_PATCH_PEAK_LEVELS = 1.5;
/**
 * The camera's image has whole grey levels, so a speck one level above the sky is
 * rounding, not light. Every star must stand at least this many levels above the sky
 * right around it. Measured on city frames, this drops about two thirds of false
 * detections and keeps four in five real stars.
 */
const MIN_PEAK_LEVELS = 2;
/**
 * The lens blurs every star in a frame to about the same size, whatever its brightness.
 * A small light or a sharp edge is smaller than that, and a lit window or sign is larger.
 * A detection's size, measured independently of its brightness, must be within this
 * range of the frame's typical star size. Measured on city frames, real stars fall
 * within 0.72 to 1.34 times the typical size nine times in ten.
 */
const MIN_RELATIVE_SIZE = 0.6;
const MAX_RELATIVE_SIZE = 1.6;
/** The typical size comes from detections at least this many times their threshold, which measure their size well. */
const SIZE_SAMPLE_MIN_PEAK = 1.25;
/** With fewer such detections the typical size isn't known, and the size check is skipped. */
const MIN_SIZE_SAMPLE = 10;
/**
 * Stars are handed to the solver spread over the frame: the frame is cut into this many
 * cells along its short and long sides, and each round takes the brightest remaining
 * detection from every cell. Lit buildings, trees or glow in one part of the frame can
 * then only fill their share of the list, wherever they are, and the stars elsewhere
 * still reach the solver.
 */
const SPREAD_CELLS_SHORT_SIDE = 3;
const SPREAD_CELLS_LONG_SIDE = 5;
/** Groups this small are too few pixels to judge their shape reliably. */
const MIN_PIXELS_FOR_SHAPE = 6;
/**
 * A group this large must have a clear peak, at least this many times the detection
 * threshold, to count as a star. Broad patches of sky glow are large but flat.
 */
const BROAD_PIXELS = 20;
const BROAD_MIN_PEAK = 2;
/**
 * A star is brightest in the middle and fades out, so only a small share of its pixels
 * are near its peak, even for a bright star whose middle is clipped. A lit window, a
 * screen or a sign is evenly lit with hard edges, so nearly all of its pixels are. Groups
 * with more than this share of pixels above half their peak are left out, with their glare.
 */
const MAX_FLAT_SHARE = 0.7;
/**
 * Groups this large are judged this way. A faint star is only a level or two bright, so
 * its few pixels can look flat too.
 */
const MIN_PIXELS_FOR_FLATNESS = 30;
/**
 * Smaller groups are judged too if they stand at least this many grey levels above the
 * sky around them. A star that bright always fades out around its middle, even with the
 * middle clipped, so a small, bright and flat spot is a distant lit window.
 */
const MIN_PIXELS_FOR_BRIGHT_FLATNESS = 6;
const BRIGHT_FLAT_LEVELS = 10;

/**
 * The sky right around each group is measured in a ring this many pixels out from it,
 * this many pixels wide. Near a sharp change in the sky, such as a band's edge or a
 * beam's silhouette, the block estimate is off. A star still stands out from the ring
 * around it, but a step in the sky does not.
 */
const RING_GAP_PX = 3;
const RING_WIDTH_PX = 3;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

/** The blocks the frame is divided into, and which block a pixel falls in. */
interface Blocks {
  cols: number;
  rows: number;
}

function blockOf(x: number, y: number, { cols, rows }: Blocks): number {
  return Math.min(rows - 1, Math.floor(y / BLOCK_SIZE)) * cols + Math.min(cols - 1, Math.floor(x / BLOCK_SIZE));
}

/**
 * Applies a measure to a sample of each block's pixels, every other pixel each way,
 * which is accurate enough and much faster.
 */
function perBlock(
  values: Float32Array,
  width: number,
  height: number,
  blocks: Blocks,
  measure: (sample: number[]) => number,
): Float32Array {
  const grid = new Float32Array(blocks.cols * blocks.rows);
  for (let row = 0; row < blocks.rows; row++) {
    for (let col = 0; col < blocks.cols; col++) {
      const sample: number[] = [];
      for (let y = row * BLOCK_SIZE; y < (row + 1) * BLOCK_SIZE && y < height; y += 2) {
        for (let x = col * BLOCK_SIZE; x < (col + 1) * BLOCK_SIZE && x < width; x += 2) {
          sample.push(values[y * width + x]);
        }
      }
      grid[row * blocks.cols + col] = measure(sample);
    }
  }
  return grid;
}

/** Subtracts the sky, blending between blocks so their edges don't look like stars. */
function subtractSky(
  pixels: Float32Array,
  width: number,
  height: number,
  sky: Float32Array,
  { cols, rows }: Blocks,
): Float32Array {
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
      const top = sky[row * cols + col] * (1 - blendX) + sky[row * cols + nextCol] * blendX;
      const bottom = sky[nextRow * cols + col] * (1 - blendX) + sky[nextRow * cols + nextCol] * blendX;
      residual[y * width + x] = pixels[y * width + x] - (top * (1 - blendY) + bottom * blendY);
    }
  }
  return residual;
}

/** The median of the residual in a square ring around a box, which is the sky right there. */
function ringSky(residual: Float32Array, width: number, height: number, box: [number, number, number, number]): number {
  const [left, top, right, bottom] = box;
  const sample: number[] = [];
  const [inner, outer] = [RING_GAP_PX, RING_GAP_PX + RING_WIDTH_PX];
  for (let y = Math.max(0, top - outer); y <= Math.min(height - 1, bottom + outer); y++) {
    for (let x = Math.max(0, left - outer); x <= Math.min(width - 1, right + outer); x++) {
      // Only pixels at least the gap away from the box on some side, so the star itself is left out.
      const away = Math.max(left - x, x - right, top - y, y - bottom);
      if (away >= inner) sample.push(residual[y * width + x]);
    }
  }
  return median(sample);
}

/**
 * How many times longer than wide a group of pixels is, from how its brightness spreads
 * around its centre. A round star gives 1.
 */
function elongation(sumXX: number, sumYY: number, sumXY: number, flux: number, cx: number, cy: number): number {
  const xx = sumXX / flux - cx * cx;
  const yy = sumYY / flux - cy * cy;
  const xy = sumXY / flux - cx * cy;
  // The spread along the group's longest and shortest directions.
  const mean = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  const longest = mean + spread;
  const shortest = Math.max(mean - spread, 1e-6);
  return Math.sqrt(Math.max(longest, 0) / shortest);
}

/**
 * A star's blur size, independent of how bright it is. For a blur of standard deviation
 * s, the pixels above a threshold T around a peak P cover an area of 2π·s²·ln(P / T), so
 * s follows from the pixel count. A bright star covers more pixels than a faint one, but
 * gives the same s.
 */
function blurSize(pixels: number, peak: number, threshold: number): number {
  return Math.sqrt(pixels / (2 * Math.PI * Math.log(Math.max(peak / threshold, 1.05))));
}

/**
 * Keeps the detections whose blur size is close to the frame's typical star size. `all`
 * and `measures` are every detection found and its size, in the same order, from which
 * the typical size is taken; `kept` are those still in play.
 */
function withTypicalSize(
  kept: DetectedStar[],
  all: DetectedStar[],
  measures: { size: number; measurable: boolean }[],
): DetectedStar[] {
  const sizeOf = new Map(all.map((star, i) => [star, measures[i].size]));
  const sample = measures.filter((measure) => measure.measurable).map((measure) => measure.size);
  if (sample.length < MIN_SIZE_SAMPLE) return kept;
  const typical = median(sample);
  return kept.filter((star) => {
    const relative = sizeOf.get(star)! / typical;
    return relative >= MIN_RELATIVE_SIZE && relative <= MAX_RELATIVE_SIZE;
  });
}

/**
 * Orders stars so they are spread over the frame: each round takes the brightest remaining
 * star from every cell of a grid, brightest of those first.
 */
function spreadOver(stars: DetectedStar[], width: number, height: number): DetectedStar[] {
  const [cols, rows] =
    width <= height
      ? [SPREAD_CELLS_SHORT_SIDE, SPREAD_CELLS_LONG_SIDE]
      : [SPREAD_CELLS_LONG_SIDE, SPREAD_CELLS_SHORT_SIDE];
  const cells = new Map<number, DetectedStar[]>();
  for (const star of [...stars].sort((a, b) => b.flux - a.flux)) {
    const row = Math.min(rows - 1, Math.floor((star.y / height) * rows));
    const col = Math.min(cols - 1, Math.floor((star.x / width) * cols));
    const list = cells.get(row * cols + col) ?? [];
    list.push(star);
    cells.set(row * cols + col, list);
  }
  const ordered: DetectedStar[] = [];
  for (let round = 0; ordered.length < stars.length; round++) {
    const picks = [...cells.values()].flatMap((list) => (list[round] ? [list[round]] : []));
    picks.sort((a, b) => b.flux - a.flux);
    ordered.push(...picks);
  }
  return ordered;
}

/** Finds stars in a greyscale image, stored row by row, spread over the frame (see spreadOver). */
export function detectStars(pixels: Float32Array, width: number, height: number): DetectionResult {
  const blocks: Blocks = {
    cols: Math.max(1, Math.floor(width / BLOCK_SIZE)),
    rows: Math.max(1, Math.floor(height / BLOCK_SIZE)),
  };

  // The sky's brightness in each block, from the median, which stars barely affect.
  const sky = perBlock(pixels, width, height, blocks, median);
  const residual = subtractSky(pixels, width, height, sky, blocks);

  // The noise in each block, from the median absolute deviation. The brighter middle of
  // the frame is noisier than the darker corners, so each part gets its own threshold.
  const noiseGrid = perBlock(residual, width, height, blocks, (sample) =>
    Math.max(median(sample.map(Math.abs)) * 1.4826, MIN_NOISE),
  );
  const thresholdAt = (x: number, y: number): number => THRESHOLD_SIGMA * noiseGrid[blockOf(x, y, blocks)];

  // Group touching pixels above the threshold, measuring each group's centre and shape.
  const visited = new Uint8Array(residual.length);
  const stack: number[] = [];
  const members: number[] = [];
  const stars: DetectedStar[] = [];
  // For each star, in the same order: its blur size, and whether it is bright enough to measure it well.
  const measures: { size: number; measurable: boolean }[] = [];
  // Areas around bright lights, as [left, top, right, bottom], whose spots are glare.
  const glare: [number, number, number, number][] = [];
  for (let start = 0; start < residual.length; start++) {
    // A quick check against the lowest possible threshold first, since most pixels are sky.
    if (visited[start] || residual[start] < THRESHOLD_SIGMA * MIN_NOISE) continue;
    const startX = start % width;
    const threshold = thresholdAt(startX, (start - startX) / width);
    if (residual[start] < threshold) continue;
    visited[start] = 1;
    stack.push(start);
    let [count, flux, peak, sumX, sumY, sumXX, sumYY, sumXY] = [0, 0, 0, 0, 0, 0, 0, 0];
    let [left, top, right, bottom] = [width, height, 0, 0];
    members.length = 0;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index - x) / width;
      const value = residual[index];
      members.push(index);
      count++;
      flux += value;
      peak = Math.max(peak, value);
      sumX += value * x;
      sumY += value * y;
      sumXX += value * x * x;
      sumYY += value * y * y;
      sumXY += value * x * y;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
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
    // A light's glare is masked once the light itself is left out.
    const maskGlare = (): void => {
      const margin = Math.max(GLARE_MARGIN_PX, (right - left) / 2, (bottom - top) / 2);
      glare.push([left - margin, top - margin, right + margin, bottom + margin]);
    };
    if (count > MAX_STAR_PIXELS) {
      // Too large for a star. If it is compact and bright, it is a light, such as a
      // streetlight. Anything else is sky glow or the edge of a building, with no glare.
      const isLight =
        right - left <= MAX_LIGHT_SIZE_PX && bottom - top <= MAX_LIGHT_SIZE_PX && peak >= LIGHT_MIN_PEAK * threshold;
      if (isLight) maskGlare();
      continue;
    }
    if (count < MIN_STAR_PIXELS) continue;
    // Only the part above the sky right around it counts. A step in the sky has none.
    const localSky = ringSky(residual, width, height, [left, top, right, bottom]);
    const rise = peak - localSky;
    if (rise < threshold || rise < MIN_PEAK_LEVELS) continue;
    // A patch one grey level above the sky: rounding, not a star.
    if (count >= ROUNDING_PATCH_PIXELS && rise < MIN_PATCH_PEAK_LEVELS) continue;

    // Evenly lit with hard edges: a lit window, a screen or a sign.
    const judgeFlatness =
      count >= MIN_PIXELS_FOR_FLATNESS || (count >= MIN_PIXELS_FOR_BRIGHT_FLATNESS && rise >= BRIGHT_FLAT_LEVELS);
    if (judgeFlatness) {
      const nearPeak = members.filter((index) => residual[index] - localSky >= rise / 2).length;
      if (nearPeak > MAX_FLAT_SHARE * count) {
        maskGlare();
        continue;
      }
    }

    const [cx, cy] = [sumX / flux, sumY / flux];
    // Long and thin: a smear along an edge, not a star.
    if (count >= MIN_PIXELS_FOR_SHAPE && elongation(sumXX, sumYY, sumXY, flux, cx, cy) > MAX_ELONGATION) continue;
    // Broad and flat: a patch of uneven sky, not a star.
    if (count >= BROAD_PIXELS && peak < BROAD_MIN_PEAK * threshold) continue;

    const noise = threshold / THRESHOLD_SIGMA;
    const spread = Math.sqrt(Math.max(0, (sumXX / flux - cx * cx + sumYY / flux - cy * cy) / 2));
    stars.push({
      x: cx,
      y: cy,
      flux,
      snr: flux / (noise * Math.sqrt(count)),
      pixels: count,
      peak: rise,
      width: spread,
    });
    measures.push({ size: blurSize(count, rise, threshold), measurable: rise >= SIZE_SAMPLE_MIN_PEAK * threshold });
  }

  // Lights are only known once found, so glare is removed at the end.
  const isGlare = ({ x, y }: DetectedStar): boolean =>
    glare.some(([l, t, r, b]) => x >= l && x <= r && y >= t && y <= b);
  const unglared = glare.length > 0 ? stars.filter((star) => !isGlare(star)) : stars;
  // Large spots crowded by others are lit buildings or trees, not stars.
  const isInCluster = (star: DetectedStar): boolean =>
    star.pixels >= CLUSTER_SPOT_PIXELS &&
    unglared.filter((other) => other !== star && Math.hypot(other.x - star.x, other.y - star.y) < CLUSTER_RADIUS_PX)
      .length >= CLUSTER_NEIGHBOURS;
  const unclustered = unglared.filter((star) => !isInCluster(star));
  const real = withTypicalSize(unclustered, stars, measures);

  return {
    stars: spreadOver(real, width, height).slice(0, MAX_STARS),
    background: median(Array.from(sky)),
    noise: median(Array.from(noiseGrid)),
  };
}
