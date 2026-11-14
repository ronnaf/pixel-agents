import { getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import type { ApplianceSpot, PlacedFurniture } from '../types.js';
import { Direction } from '../types.js';

/** Categories whose on-state already means something else: a chair is sat in, and a
 *  workstation's screen lights for the agent working at its seat. */
const NOT_APPLIANCES = new Set(['chairs', 'electronics']);

/**
 * Where a character can stand to use each appliance in a layout. An appliance is any
 * furniture with an on-state that isn't a chair or electronics (a fridge, a printer, a
 * water cooler); it shows that state while it is in use. It is used from the walkable
 * tiles directly in front of it (the row below its footprint), facing it. A game (a
 * ping-pong table) is instead played from the tile beyond each end of its front row, the
 * players facing each other across it.
 */
export function findApplianceSpots(
  furniture: PlacedFurniture[],
  walkableTiles: Array<{ col: number; row: number }>,
): ApplianceSpot[] {
  const walkable = new Set(walkableTiles.map((tile) => `${tile.col},${tile.row}`));
  const spots: ApplianceSpot[] = [];
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || NOT_APPLIANCES.has(entry.category)) continue;
    if (getOnStateType(item.type) === item.type) continue;
    if (entry.category === 'games') {
      const row = item.row + entry.footprintH - 1;
      const ends = [
        { col: item.col - 1, facingDir: Direction.RIGHT },
        { col: item.col + entry.footprintW, facingDir: Direction.LEFT },
      ];
      // A game with one end blocked can't be played at all.
      if (ends.every((end) => walkable.has(`${end.col},${row}`))) {
        for (const end of ends) spots.push({ uid: item.uid, row, kind: 'game', ...end });
      }
      continue;
    }
    const row = item.row + entry.footprintH;
    const kind = entry.category === 'drinks' ? ('drink' as const) : undefined;
    for (let col = item.col; col < item.col + entry.footprintW; col++) {
      if (walkable.has(`${col},${row}`)) {
        spots.push({ uid: item.uid, col, row, facingDir: Direction.UP, ...(kind ? { kind } : {}) });
      }
    }
  }
  return spots;
}
