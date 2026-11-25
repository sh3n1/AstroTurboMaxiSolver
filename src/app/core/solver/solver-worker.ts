// The plate solver's Web Worker (solver.worker.ts), from the page's side: started on first
// use with the star catalogue, and each request matched to its answer. Split out of
// live-solver.service.ts, which decides when to solve; this only carries the work.

import type { SolveInputs } from './solve-report';
import type { SolveRequest, SolveResponse } from './solver-messages';

export class SolverWorker {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, (response: SolveResponse) => void>();

  /**
   * Solves one picture. Its pixels move to the worker rather than being copied, which is
   * much faster, so the array can't be used afterwards: copy it first to keep it.
   */
  async solve(pixels: Float32Array, inputs: SolveInputs): Promise<SolveResponse> {
    const worker = await this.start();
    const id = ++this.requestId;
    const request: SolveRequest = { type: 'solve', id, pixels, ...inputs };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      worker.postMessage(request, [pixels.buffer]);
    });
  }

  /** The worker, started the first time with the star catalogue it matches against. */
  private start(): Promise<Worker> {
    if (!this.worker) {
      const worker = new Worker(new URL('./solver.worker', import.meta.url), { type: 'module' });
      worker.addEventListener('message', ({ data }: MessageEvent<SolveResponse>) => {
        this.pending.get(data.id)?.(data);
        this.pending.delete(data.id);
      });
      this.worker = worker;
      this.ready = fetch('assets/data/stars.json')
        .then((response) => response.json())
        .then((starRows: number[][]) => worker.postMessage({ type: 'init', starRows } satisfies SolveRequest));
    }
    const worker = this.worker;
    return this.ready!.then(() => worker);
  }
}
