import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingSolveReport, SolveReport } from './solve-report';
import { reportBody, sendSolveReport, toBase64 } from './solve-report';

/** A report's fields, as far as these tests need them. */
const report = { kind: 'live-solve', message: 'No match in "14" stars' } as unknown as Omit<SolveReport, 'raw'>;

/** Reads a Blob as text, which every test environment can. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('solve reports', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns the frame's bytes into base64, as the receiver reads them", async () => {
    const pixels = new Float32Array([0, 1.5, 255]);
    const bytes = new Uint8Array(pixels.buffer);
    const expected = btoa(String.fromCharCode(...bytes));
    expect(await toBase64(pixels)).toBe(expected);
  });

  it('builds the same JSON as before, with the frame as its "raw" field', async () => {
    const body = JSON.parse(await blobText(reportBody(report, 'AAAA')));
    expect(body).toEqual({ ...report, raw: 'AAAA' });
  });

  it('sends one report at a time, and keeps only the newest waiting', async () => {
    const sent: string[] = [];
    let release: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(await blobText(init.body as Blob)).message);
        // The first send waits until released, as on a slow network.
        if (sent.length === 1) await new Promise<void>((resolve) => (release = resolve));
        return new Response('{}');
      }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = (message: string): PendingSolveReport => ({
      report: { ...report, message },
      pixels: new Float32Array(4),
    });

    const first = sendSolveReport(pending('first'));
    await vi.waitFor(() => expect(sent).toEqual(['first']));
    void sendSolveReport(pending('second'));
    void sendSolveReport(pending('third'));
    release();
    await first;
    expect(sent).toEqual(['first', 'third']);
  });
});
