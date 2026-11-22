import { describe, expect, it } from 'vitest';

import type { Target } from '../catalog/targets';
import type { ListView } from '../lists/lists.service';
import type { ListedTarget } from '../lists/target-lists';

import { PUCK_LIST_TARGETS_MAX, listTargetsMessage, listsMessage, puckLists } from './puck-lists';

const target = (id: string, name: string, extra: Partial<ListedTarget> = {}): ListedTarget =>
  ({ id, name, kind: 'Galaxy', raDeg: 0, decDeg: 0, mag: 5, ...extra }) as Target as ListedTarget;

const list = (id: string, targets: ListedTarget[] = []): ListView => ({ id, name: id, kind: 'fixed', targets });

describe('puck lists', () => {
  it('offers the collections, then the user lists, then Messier and Caldwell', () => {
    const fixed = ['messier', 'hubble-may', 'caldwell', 'reticle', 'now'].map((id) => list(id));
    const user = [{ ...list('saved'), kind: 'uncategorized' as const }];
    expect(puckLists(fixed, user).map((l) => l.id)).toEqual(['now', 'reticle', 'saved', 'messier', 'caldwell']);
  });

  it('counts only the targets above the horizon, each once', () => {
    const m31 = target('M31', 'Andromeda Galaxy');
    const message = listsMessage([list('now', [m31, m31, target('M83', '')])], (t) => t.id === 'M31');
    expect(message).toEqual({ t: 'lists', lists: [{ id: 'now', name: 'now', count: 1 }] });
  });

  it('names each target, with its designation under it where that is not the name', () => {
    const rows = listTargetsMessage(
      list('messier', [
        target('NGC 224', 'Andromeda Galaxy', { listedAs: 'M31' }),
        target('NGC 7000', ''),
        target('Saturn', 'planet', { body: 'Saturn', kind: 'Planet' }),
      ]),
      () => true,
    ).targets;
    expect(rows).toEqual([
      { id: 'NGC 224', name: 'Andromeda Galaxy', sub: 'M31' },
      { id: 'NGC 7000', name: 'NGC 7000', sub: '' },
      { id: 'Saturn', name: 'Saturn', sub: '' },
    ]);
  });

  it('sends at most PUCK_LIST_TARGETS_MAX targets, and says how many more are up', () => {
    const many = Array.from({ length: PUCK_LIST_TARGETS_MAX + 5 }, (_, i) => target(`T${i}`, `T${i}`));
    const message = listTargetsMessage(list('saved', many), () => true);
    expect(message.targets.length).toBe(PUCK_LIST_TARGETS_MAX);
    expect(message.more).toBe(5);
    expect(JSON.stringify(message).length).toBeLessThan(8192);
  });
});
