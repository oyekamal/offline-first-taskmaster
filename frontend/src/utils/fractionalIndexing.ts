/**
 * Fractional Indexing Utilities
 * For drag-and-drop reordering without database updates for unchanged items
 */

/**
 * Generate a position between two numbers
 */
export function generatePositionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) {
    return 1;
  }
  if (before === null) {
    return after! / 2;
  }
  if (after === null) {
    return before + 1;
  }
  return (before + after) / 2;
}

/**
 * Reorder items array with new positions
 */
export function reorderWithPositions<T extends { id: string; position: number }>(
  items: T[],
  fromIndex: number,
  toIndex: number
): { item: T; newPosition: number } | null {
  if (fromIndex === toIndex) return null;

  const item = items[fromIndex];
  const newItems = [...items];
  newItems.splice(fromIndex, 1);
  newItems.splice(toIndex, 0, item);

  const beforeItem = toIndex > 0 ? newItems[toIndex - 1] : null;
  const afterItem = toIndex < newItems.length - 1 ? newItems[toIndex + 1] : null;

  const newPosition = generatePositionBetween(
    beforeItem?.position || null,
    afterItem?.position || null
  );

  return { item, newPosition };
}
