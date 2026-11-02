const palette = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-orange-500",
  "bg-indigo-500",
];

/** Guests and people without a membership */
export const noTypeColor = "bg-muted-foreground/30";

function hash(value: string) {
  let result = 0;
  for (const char of value) result = (Math.imul(result, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return result;
}

/**
 * Gives each membership type a colour seeded by its ID, so it stays the same across loads and meetings.
 * Collisions move to the next free colour, in ID order so the result doesn't depend on load order.
 */
export function membershipTypeColors(typeIds: string[]) {
  const colors = new Map<string, string>();
  const taken = new Set<number>();
  for (const id of typeIds.toSorted((a, b) => a.localeCompare(b))) {
    let slot = hash(id) % palette.length;
    for (let tries = 0; taken.has(slot) && tries < palette.length; tries++) slot = (slot + 1) % palette.length;
    taken.add(slot);
    colors.set(id, palette[slot] ?? noTypeColor);
  }
  return colors;
}
