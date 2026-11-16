import type { SpriteData } from '../types.js';

const zoomCaches = new Map<number | string, WeakMap<SpriteData, HTMLCanvasElement>>();

// ── Outline sprite generation ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>();

/** Generate a 1px white outline SpriteData (2px larger in each dimension) */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite);
  if (cached) return cached;

  const rows = sprite.length;
  const cols = sprite[0].length;
  // Expanded grid: +2 in each dimension for 1px border
  const outline: string[][] = [];
  for (let r = 0; r < rows + 2; r++) {
    outline.push(new Array<string>(cols + 2).fill(''));
  }

  // For each opaque pixel, mark its 4 cardinal neighbors as white
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] === '') continue;
      const er = r + 1;
      const ec = c + 1;
      if (outline[er - 1][ec] === '') outline[er - 1][ec] = '#FFFFFF';
      if (outline[er + 1][ec] === '') outline[er + 1][ec] = '#FFFFFF';
      if (outline[er][ec - 1] === '') outline[er][ec - 1] = '#FFFFFF';
      if (outline[er][ec + 1] === '') outline[er][ec + 1] = '#FFFFFF';
    }
  }

  // Clear pixels that overlap with original opaque pixels
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] !== '') {
        outline[r + 1][c + 1] = '';
      }
    }
  }

  outlineCache.set(sprite, outline);
  return outline;
}

/**
 * `sprite` rasterised at `zoom` device pixels per sprite pixel. A fractional
 * zoom rounds each sprite pixel's edges to whole device pixels (some pixels
 * come out one wider), so nothing is anti-aliased and the sprite stays crisp.
 * `origin` (sprite pixels) is how far up-left of the art it lines up with the
 * sprite is drawn, e.g. 1 for a character's outline: edges are rounded in the
 * art's frame so they meet its own, and the caller draws the sprite at the
 * art's position + Math.round(-origin * zoom).
 */
export function getCachedSprite(sprite: SpriteData, zoom: number, origin = 0): HTMLCanvasElement {
  const key = origin === 0 ? zoom : `${zoom}@${origin}`;
  let cache = zoomCaches.get(key);
  if (!cache) {
    cache = new WeakMap();
    zoomCaches.set(key, cache);
  }

  const cached = cache.get(sprite);
  if (cached) return cached;

  const rows = sprite.length;
  const cols = sprite[0].length;
  const start = Math.round(-origin * zoom);
  /** Device-pixel edge before sprite pixel `i` (exactly i * zoom when zoom is whole). */
  const edge = (i: number) => Math.round((i - origin) * zoom) - start;
  const canvas = document.createElement('canvas');
  canvas.width = edge(cols);
  canvas.height = edge(rows);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c];
      if (color === '') continue;
      ctx.fillStyle = color;
      ctx.fillRect(edge(c), edge(r), edge(c + 1) - edge(c), edge(r + 1) - edge(r));
    }
  }

  cache.set(sprite, canvas);
  return canvas;
}
