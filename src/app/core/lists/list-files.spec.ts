import { describe, expect, it } from 'vitest';

import type { Target } from '../catalog/targets';

import {
  designationKey,
  isSkylist,
  listNameFromFile,
  matchRows,
  parseDelimited,
  parseSkylist,
  readListFile,
  skySafariName,
  targetFinder,
} from './list-files';

const target = (id: string, name: string, aliases?: string): Target => ({
  id,
  name,
  aliases,
  kind: 'Galaxy',
  raDeg: 0,
  decDeg: 0,
  mag: 5,
});

const TARGETS: Target[] = [
  target('M31', 'Andromeda Galaxy', 'NGC 224'),
  target('NGC 7023', 'Iris Nebula', 'C4'),
  target('Albireo', 'Albireo', 'Beta Cygni'),
];

const SKYLIST = `SkySafariObservingListVersion=3.0
SortedBy=Default Order
SkyObject=BeginObject
	ObjectID=4,0,224
	CommonName=Andromeda Galaxy
	CatalogNumber=M 31
	CatalogNumber=NGC 224
EndObject=SkyObject
SkyObject=BeginObject
	ObjectID=4,-1,-1
	CatalogNumber=LBN 487
	CatalogNumber=NGC 7023
EndObject=SkyObject
SkyObject=BeginObject
	CommonName=Unknown Thing
	CatalogNumber=PGC 99999999
EndObject=SkyObject
`;

describe('designationKey', () => {
  it('makes the ways other apps write a name comparable', () => {
    for (const text of ['M31', 'M 31', 'm 031', 'Messier 31', 'MESSIER31'])
      expect(designationKey(text), text).toBe('m31');
    expect(designationKey('NGC0224')).toBe(designationKey('NGC 224'));
    expect(designationKey('Caldwell 4')).toBe(designationKey('C4'));
  });
});

describe('parseSkylist', () => {
  it('reads each object as its catalogue numbers, then its common name', () => {
    expect(isSkylist(SKYLIST)).toBe(true);
    expect(parseSkylist(SKYLIST)).toEqual([
      ['M 31', 'NGC 224', 'Andromeda Galaxy'],
      ['LBN 487', 'NGC 7023'],
      ['PGC 99999999', 'Unknown Thing'],
    ]);
  });
});

describe('parseDelimited', () => {
  it('splits CSV, semicolon and tab files, with quoted cells', () => {
    expect(parseDelimited('Name,RA\n"M 31, Andromeda",0.7\n')).toEqual([
      ['Name', 'RA'],
      ['M 31, Andromeda', '0.7'],
    ]);
    expect(parseDelimited('Object;Mag\nM31;3,4')).toEqual([
      ['Object', 'Mag'],
      ['M31', '3,4'],
    ]);
    expect(parseDelimited('M31\tAndromeda\r\nNGC 7023\tIris')).toEqual([
      ['M31', 'Andromeda'],
      ['NGC 7023', 'Iris'],
    ]);
  });

  it('reads plain text, one object per line', () => {
    expect(parseDelimited('M31\n\nAlbireo\n')).toEqual([['M31'], ['Albireo']]);
  });
});

describe('matchRows', () => {
  const find = targetFinder(TARGETS);

  it('matches by the first name the app knows, each target once, in order', () => {
    const result = matchRows([['LBN 487', 'NGC 7023'], ['Beta Cygni'], ['NGC 224'], ['M31']], find);
    expect(result).toEqual({ targetIds: ['NGC 7023', 'Albireo', 'M31'], missing: [] });
  });

  it('reports what it cannot match, but not a header row', () => {
    expect(matchRows([['Name', 'RA', 'Dec'], ['M31'], ['PGC 1']], find)).toEqual({
      targetIds: ['M31'],
      missing: ['PGC 1'],
    });
  });
});

describe('readListFile', () => {
  it('reads a .skylist file, named after the file', () => {
    expect(readListFile(SKYLIST, 'Autumn_favourites.skylist', TARGETS)).toEqual({
      name: 'Autumn favourites',
      targetIds: ['M31', 'NGC 7023'],
      missing: ['PGC 99999999'],
    });
  });

  it('refuses a file with nothing it knows', () => {
    expect(() => readListFile('Hello\nWorld', 'notes.txt', TARGETS)).toThrow('No objects in this file were recognised');
  });

  it('names a list from its file', () => {
    expect(listNameFromFile('My list.csv')).toBe('My list');
    expect(listNameFromFile('.csv')).toBe('Imported list');
  });
});

describe('SkySafari names', () => {
  it("writes out SkySafari's Greek letters", () => {
    expect(skySafariName('$h Cas')).toBe('η Cas');
    expect(skySafariName('$y1 Psc')).toBe('ψ1 Psc');
    expect(skySafariName('$z2 Cnc')).toBe('ζ2 Cnc');
    expect(skySafariName('M 31')).toBe('M 31');
  });

  it('finds stars by their Greek letters, and by catalogue numbers among their other names', () => {
    const find = targetFinder([
      target('Achird', 'η Cas', 'STF 60 Σ 60 WDS 00491+5749 HIP 3821'),
      target('STF 61', 'Double star', 'STF 61 Σ 61 WDS 00499+2743'),
    ]);
    expect(find(skySafariName('$h Cas'))?.id).toBe('Achird');
    expect(find('STF 60')?.id).toBe('Achird');
    expect(find('HIP 3821')?.id).toBe('Achird');
    expect(find('WDS 00499+2743')?.id).toBe('STF 61');
  });
});
