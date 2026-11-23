// The lists the puck's menu offers, and a list's targets (docs/puck.md, "Lists"). Plain
// functions, so they can be tested without a link.

import type { Horizontal } from '../astronomy/astronomy';
import { compassShort } from '../astronomy/astronomy';
import { designations } from '../catalog/designations';
import type { ListView } from '../lists/lists.service';
import { GOOD_ALTITUDE_DEG } from '../lists/lists.service';
import type { ListedTarget } from '../lists/target-lists';

import { listIconName } from './puck-icons';

/**
 * The app's own lists the puck offers, besides the user's: tonight's collections first,
 * then the two best-known catalogues after the user's lists. The other catalogues hold
 * hundreds of targets each, too many to scroll through on a round screen.
 */
const COLLECTIONS = ['now', 'reticle'];
const CATALOGUES = ['messier', 'caldwell'];

/** The most targets of one list sent at once: about 7 KB, within the puck's 16 KB. */
export const PUCK_LIST_TARGETS_MAX = 60;

/**
 * `{ t: 'lists' }`: the lists to choose from, each with how many targets it has, as the
 * phone's Lists page counts them (Messier 110), though the puck's list then offers only
 * those that are up.
 */
export interface PuckListsMessage {
  t: 'lists';
  lists: { id: string; name: string; count: number }[];
}

/**
 * A target as the puck's chip shows it, as a row of the phone's lists: its icon's name
 * (puck-icons.ts), its name, the line under it, and how high it is and which way to face
 * ("42° SE"), green from GOOD_ALTITUDE_DEG up and amber below, as the phone's badge.
 */
export interface PuckTargetRow {
  id: string;
  name: string;
  sub: string;
  icon: string;
  alt: number;
  dir: string;
  good: boolean;
}

/**
 * `{ t: 'listTargets' }`: one list's targets above the horizon, in the list's order, up to
 * PUCK_LIST_TARGETS_MAX; `more` says how many more are up.
 */
export interface PuckListTargetsMessage {
  t: 'listTargets';
  id: string;
  name: string;
  targets: PuckTargetRow[];
  more: number;
}

/** Where a target is now, in the sky. */
export type PositionOf = (target: ListedTarget) => Horizontal;

/** A target's row for the puck, with the line under its name. */
export function targetRow(target: ListedTarget, position: Horizontal, sub: string): PuckTargetRow {
  return {
    id: target.id,
    name: rowName(target),
    sub,
    icon: listIconName(target),
    alt: Math.round(position.altDeg),
    dir: compassShort(position.azDeg),
    good: position.altDeg >= GOOD_ALTITUDE_DEG,
  };
}

/** The lists the puck offers, in the order its menu shows them. */
export function puckLists(fixed: readonly ListView[], user: readonly ListView[]): ListView[] {
  const pick = (ids: readonly string[]): ListView[] => ids.flatMap((id) => fixed.filter((list) => list.id === id));
  return [...pick(COLLECTIONS), ...user, ...pick(CATALOGUES)];
}

/** A list's targets above the horizon, each once, in the list's order, with where they are. */
function upTargets(list: ListView, positionOf: PositionOf): { target: ListedTarget; position: Horizontal }[] {
  const seen = new Set<string>();
  return list.targets.flatMap((target) => {
    if (seen.has(target.id)) return [];
    const position = positionOf(target);
    if (position.altDeg <= 0) return [];
    seen.add(target.id);
    return [{ target, position }];
  });
}

export function listsMessage(lists: readonly ListView[]): PuckListsMessage {
  return {
    t: 'lists',
    lists: lists.map((list) => ({ id: list.id, name: list.name, count: list.targets.length })),
  };
}

/** A target's name on the puck's chip: a planet by its label, as in targetInfo. */
function rowName(target: ListedTarget): string {
  return target.body ? designations(target)[0] : target.name || (target.listedAs ?? designations(target)[0]);
}

/**
 * Under a list's target, its designation where that isn't its name already: "Andromeda
 * Galaxy", "M31". The designation is the one the list knows it by, such as M31 in Messier.
 */
function designationUnder(target: ListedTarget): string {
  const designation = target.listedAs ?? designations(target)[0];
  return designation === rowName(target) ? '' : designation;
}

export function listTargetsMessage(list: ListView, positionOf: PositionOf): PuckListTargetsMessage {
  const up = upTargets(list, positionOf);
  return {
    t: 'listTargets',
    id: list.id,
    name: list.name,
    targets: up
      .slice(0, PUCK_LIST_TARGETS_MAX)
      .map(({ target, position }) => targetRow(target, position, designationUnder(target))),
    more: Math.max(0, up.length - PUCK_LIST_TARGETS_MAX),
  };
}
