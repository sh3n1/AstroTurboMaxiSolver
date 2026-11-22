// The lists the puck's menu offers, and a list's targets (docs/puck.md, "Lists"). Plain
// functions, so they can be tested without a link.

import { designations } from '../catalog/designations';
import type { ListView } from '../lists/lists.service';
import type { ListedTarget } from '../lists/target-lists';

/**
 * The app's own lists the puck offers, besides the user's: tonight's collections first,
 * then the two best-known catalogues after the user's lists. The other catalogues hold
 * hundreds of targets each, too many to scroll through on a round screen.
 */
const COLLECTIONS = ['now', 'reticle'];
const CATALOGUES = ['messier', 'caldwell'];

/** The most targets of one list sent at once: about 4 KB, well within the puck's 8 KB. */
export const PUCK_LIST_TARGETS_MAX = 60;

/** `{ t: 'lists' }`: the lists to choose from, each with how many of its targets are up. */
export interface PuckListsMessage {
  t: 'lists';
  lists: { id: string; name: string; count: number }[];
}

/**
 * `{ t: 'listTargets' }`: one list's targets above the horizon, in the list's order, up to
 * PUCK_LIST_TARGETS_MAX; `more` says how many more are up.
 */
export interface PuckListTargetsMessage {
  t: 'listTargets';
  id: string;
  name: string;
  targets: { id: string; name: string; sub: string }[];
  more: number;
}

/** The lists the puck offers, in the order its menu shows them. */
export function puckLists(fixed: readonly ListView[], user: readonly ListView[]): ListView[] {
  const pick = (ids: readonly string[]): ListView[] => ids.flatMap((id) => fixed.filter((list) => list.id === id));
  return [...pick(COLLECTIONS), ...user, ...pick(CATALOGUES)];
}

/** A list's targets above the horizon, each once, in the list's order. */
function upTargets(list: ListView, isUp: (target: ListedTarget) => boolean): ListedTarget[] {
  const seen = new Set<string>();
  return list.targets.filter((target) => {
    if (seen.has(target.id) || !isUp(target)) return false;
    seen.add(target.id);
    return true;
  });
}

export function listsMessage(lists: readonly ListView[], isUp: (target: ListedTarget) => boolean): PuckListsMessage {
  return {
    t: 'lists',
    lists: lists.map((list) => ({ id: list.id, name: list.name, count: upTargets(list, isUp).length })),
  };
}

/**
 * A target's name as the puck's chip shows it, and under it, its designation where that
 * isn't the name already: "Andromeda Galaxy", "M31". A planet goes by its label, as in
 * targetInfo. The designation is the one the list knows it by, such as M31 in Messier.
 */
function targetRow(target: ListedTarget): { id: string; name: string; sub: string } {
  const designation = target.listedAs ?? designations(target)[0];
  const name = target.body ? designations(target)[0] : target.name || designation;
  return { id: target.id, name, sub: designation === name ? '' : designation };
}

export function listTargetsMessage(list: ListView, isUp: (target: ListedTarget) => boolean): PuckListTargetsMessage {
  const up = upTargets(list, isUp);
  return {
    t: 'listTargets',
    id: list.id,
    name: list.name,
    targets: up.slice(0, PUCK_LIST_TARGETS_MAX).map(targetRow),
    more: Math.max(0, up.length - PUCK_LIST_TARGETS_MAX),
  };
}
