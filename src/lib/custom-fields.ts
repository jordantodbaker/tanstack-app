import { CUSTOM_FIELD_SLOT_COUNT } from "./fef-helpers";

/**
 * Slot allocation for user-defined take-off columns.
 *
 * A definition owns one of `FefRow`'s fixed `customN` columns. The slot IS the
 * storage, so allocation has to be deliberate: hand out a slot that another
 * definition already holds and two columns silently share values.
 */

/** Max length of a column header before it stops fitting a grid cell. */
export const CUSTOM_FIELD_LABEL_MAX = 40;

/**
 * The lowest slot not already taken, or `undefined` when the discipline is
 * full.
 *
 * Lowest-free rather than next-highest so removing a column and adding another
 * reuses the gap instead of exhausting the range — with only ten slots, a
 * monotonic counter would run out after ten lifetime columns rather than ten
 * concurrent ones.
 */
export function nextFreeSlot(
  usedSlots: readonly number[],
  slotCount: number = CUSTOM_FIELD_SLOT_COUNT,
): number | undefined {
  const used = new Set(usedSlots);
  for (let slot = 1; slot <= slotCount; slot++) {
    if (!used.has(slot)) return slot;
  }
  return undefined;
}

/** Position for a newly added column — after everything already there. */
export function nextPosition(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

/**
 * A column label as it will be stored: trimmed, internal runs of whitespace
 * collapsed (a header is one line), and capped.
 *
 * Returns `null` when nothing survives — the caller rejects rather than
 * storing a blank header.
 */
export function normalizeLabel(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned === "") return null;
  return cleaned.slice(0, CUSTOM_FIELD_LABEL_MAX);
}

/**
 * Reorder `ids` into contiguous positions, ignoring anything not actually in
 * the discipline's definition set.
 *
 * Defensive on purpose: the ordered list comes from a drag in the client, and a
 * definition removed in another tab between the drag and the drop would
 * otherwise be resurrected with a position.
 */
export function assignPositions(
  orderedIds: readonly number[],
  knownIds: readonly number[],
): { id: number; position: number }[] {
  const known = new Set(knownIds);
  return orderedIds
    .filter((id) => known.has(id))
    .map((id, position) => ({ id, position }));
}

/**
 * Move one id one step through an order, clamped at the ends.
 *
 * Returns the array unchanged when the move would fall off either end or the id
 * isn't in the list, so a caller can compare by reference to decide whether a
 * write is needed at all.
 */
export function moveInOrder(
  ids: readonly number[],
  id: number,
  delta: -1 | 1,
): number[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const to = from + delta;
  if (to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}
