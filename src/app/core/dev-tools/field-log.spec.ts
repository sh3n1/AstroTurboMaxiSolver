import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FieldSolve } from './field-log';
import {
  MAX_WAITING,
  fieldEvent,
  fieldSolveDone,
  fieldSolveStarted,
  fieldSolveTags,
  onFieldSolveDone,
  setFieldActive,
  setFieldStep,
  takeFieldEvents,
} from './field-log';

describe('field log', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    setFieldActive(false);
    setFieldStep(null);
    vi.unstubAllGlobals();
  });

  it('notes nothing while no field test is on', () => {
    fieldEvent('target', { id: 'M31' });
    fieldSolveStarted('auto');
    expect(takeFieldEvents()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fieldSolveTags()).toEqual({ fieldStep: null, fieldSolve: null });
  });

  it('keeps events, each with its time, until they are taken', () => {
    setFieldActive(true);
    fieldEvent('target', { id: 'M31' });
    const [event] = takeFieldEvents();
    expect(event).toMatchObject({ kind: 'target', id: 'M31' });
    expect(typeof event.at).toBe('number');
    expect(takeFieldEvents()).toEqual([]);
  });

  it('drops the oldest events when the collector stops taking them', () => {
    setFieldActive(true);
    for (let i = 0; i < MAX_WAITING + 3; i++) fieldEvent('pose', { i });
    const events = takeFieldEvents();
    expect(events).toHaveLength(MAX_WAITING);
    expect(events[0]['i']).toBe(3);
  });

  it('forgets what was waiting when the field test ends', () => {
    setFieldActive(true);
    fieldEvent('pose');
    setFieldActive(false);
    setFieldActive(true);
    expect(takeFieldEvents()).toEqual([]);
  });

  it('tells the collector at once when a solve starts, with its step', () => {
    setFieldActive(true);
    setFieldStep(4);
    fieldSolveStarted('tap');
    expect(fetchMock).toHaveBeenCalledWith('/field/solve-start', expect.objectContaining({ method: 'POST' }));
    const tags = fieldSolveTags();
    expect(tags.fieldStep).toBe(4);
    expect(tags.fieldSolve).not.toBeNull();
  });

  it('says when the solve under way ends, once', () => {
    setFieldActive(true);
    const done: FieldSolve[] = [];
    onFieldSolveDone((solve) => done.push(solve));
    fieldSolveStarted('auto');
    const { fieldSolve } = fieldSolveTags();
    fieldSolveDone();
    fieldSolveDone();
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ id: fieldSolve, trigger: 'auto' });
    // Between solves, a report carries only the step.
    expect(fieldSolveTags().fieldSolve).toBeNull();
  });
});
