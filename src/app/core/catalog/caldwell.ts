// Joins the Caldwell catalogue to the NGC and IC objects, so Caldwell numbers show and
// can be searched. The list is in assets/data/caldwell.json, written for this app. It is
// kept out of openngc.json, which must hold only OpenNGC's data.

import type { Target } from './targets';

/** The contents of caldwell.json. */
export interface CaldwellData {
  /** Each Caldwell number, such as "C20", and the NGC or IC objects it stands for. */
  objects: Record<string, string[]>;
  /** Caldwell objects with no NGC or IC number, as complete targets. */
  extraTargets: Target[];
}

/** NGC and IC designations among a target's names. */
const NGC_OR_IC = /\b(?:NGC|IC) \d+[A-Z]?\b/g;

/**
 * Adds each object's Caldwell number to its other names. Objects that aren't in the
 * Caldwell catalogue come back unchanged, as the same objects.
 */
export function joinCaldwell(targets: readonly Target[], data: CaldwellData): Target[] {
  // Looks up a Caldwell number by NGC or IC designation: "NGC 7000" gives "C20".
  const byDesignation = new Map<string, string>();
  for (const [caldwell, objects] of Object.entries(data.objects)) {
    for (const designation of objects) byDesignation.set(designation, caldwell);
  }

  return targets.map((target) => {
    // OpenNGC files a few objects under another number, so check the other names too.
    const names = `${target.id} ${target.aliases ?? ''}`.match(NGC_OR_IC) ?? [];
    const caldwell = names.map((name) => byDesignation.get(name)).find(Boolean);
    return caldwell ? { ...target, aliases: `${caldwell} ${target.aliases ?? ''}`.trim() } : target;
  });
}
