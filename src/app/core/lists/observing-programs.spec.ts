import { describe, expect, it } from 'vitest';

import { programFor } from './observing-programs';
import { CATALOGUE_GROUPS, FIXED_LISTS } from './target-lists';

describe('programFor', () => {
  it('finds the programme of a list', () => {
    expect(programFor('urban')?.by).toBe('Astronomical League');
    expect(programFor('herschel400')?.certificate).toBe(true);
  });

  it('gives each season or month of a split catalogue its catalogue programme', () => {
    expect(programFor('rasc-winter')?.id).toBe('rasc');
    expect(programFor('gems-summer')?.id).toBe('gems');
    for (const month of ['january', 'february', 'march', 'april', 'may', 'june']) {
      expect(programFor(`hubble-${month}`)?.id, month).toBe('hubble');
    }
    for (const month of ['july', 'august', 'september', 'october', 'november', 'december']) {
      expect(programFor(`hubble-${month}`)?.id, month).toBe('hubble');
    }
  });

  it('has none for the app collections and plain catalogues', () => {
    for (const id of ['now', 'reticle', 'messier', 'caldwell', 'some-user-list-uuid']) {
      expect(programFor(id), id).toBeNull();
    }
  });

  it('covers every programme list the app has, with a secure link', () => {
    const programmes = FIXED_LISTS.filter((list) => !['collections'].includes(list.section)).filter(
      (list) => !['messier', 'caldwell'].includes(list.id),
    );
    for (const list of programmes) {
      const program = programFor(list.id);
      expect(program, list.id).not.toBeNull();
      expect(program!.url, list.id).toMatch(/^https:\/\//);
    }
    for (const group of CATALOGUE_GROUPS) expect(programFor(group.id), group.id).not.toBeNull();
  });
});
