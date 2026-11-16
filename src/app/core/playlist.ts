// The list being observed through, like a music playlist: the sky map steps to the next
// or the previous target in it. Plain functions, so they can be tested without the app.

/** A list being observed through, as it was ordered and filtered when it was started. */
export interface Playlist {
  /** The list's name, as the sky map shows it, such as "Messier". */
  name: string;
  /** The targets' ids, in order, each once. */
  ids: string[];
  /** The address of the list's page, to go back to it. */
  from: string;
}

/**
 * Makes a playlist from a list's rows as shown. A catalogue can list one target under two
 * numbers, but stepping through it should visit each target only once.
 */
export function makePlaylist(name: string, ids: readonly string[], from: string): Playlist {
  return { name, ids: [...new Set(ids)], from };
}

/**
 * The position of the next target to observe, one step forward (1) or back (-1) from
 * `current`, skipping any that `isUp` says are below the horizon. Null at either end, or
 * when every target that way is below the horizon. From outside the list (current -1),
 * forward starts at the first target and back at the last.
 */
export function stepIndex(
  ids: readonly string[],
  current: number,
  direction: 1 | -1,
  isUp: (id: string) => boolean,
): number | null {
  const start = current < 0 ? (direction === 1 ? 0 : ids.length - 1) : current + direction;
  for (let i = start; i >= 0 && i < ids.length; i += direction) {
    if (isUp(ids[i])) return i;
  }
  return null;
}

/** Reads a saved playlist, or null if there is none or it isn't one. */
export function parsePlaylist(text: string | null): Playlist | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<Playlist>;
    const valid =
      typeof value.name === 'string' &&
      typeof value.from === 'string' &&
      Array.isArray(value.ids) &&
      value.ids.length > 0 &&
      value.ids.every((id) => typeof id === 'string');
    return valid ? makePlaylist(value.name!, value.ids!, value.from!) : null;
  } catch {
    return null;
  }
}
