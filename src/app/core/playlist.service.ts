import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Playlist } from './playlist';
import { makePlaylist, parsePlaylist, stepIndex } from './playlist';

/**
 * Where the playlist is kept. It is this phone's own state, like the selected target, so
 * it stays in localStorage and isn't synced: see docs/local-data.md.
 */
const PLAYLIST_KEY = 'astroturbomaxisolver.playlist';

/**
 * The list being observed through. Tapping a target in a list starts it, and the sky map's
 * buttons then step to the next or the previous target, as in a music playlist. Where it
 * is in the list follows the selected target, so choosing one on the map from outside the
 * list just pauses it, and choosing one in it again carries on from there.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly state = inject(AppState);

  readonly playlist = signal<Playlist | null>(load());

  /** The selected target's place in the playlist, or -1 if it isn't in it. */
  readonly index = computed(() => {
    const id = this.state.selectedTargetId();
    return id ? (this.playlist()?.ids.indexOf(id) ?? -1) : -1;
  });

  /** Whether the selected target is in the playlist, so the map shows its buttons. */
  readonly playing = computed(() => this.index() >= 0);

  /** Where the next and previous targets are, or null where there is none that is up. */
  readonly nextIndex = computed(() => this.step(1));
  readonly previousIndex = computed(() => this.step(-1));

  constructor() {
    effect(() => {
      const playlist = this.playlist();
      try {
        if (playlist) localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
        else localStorage.removeItem(PLAYLIST_KEY);
      } catch {
        // Storage may be blocked: the playlist then lasts until the page closes.
      }
    });
  }

  /** Starts observing through a list, from one of its targets, which becomes the selected one. */
  play(name: string, ids: readonly string[], startId: string, from: string): void {
    this.playlist.set(makePlaylist(name, ids, from));
    this.state.selectedTargetId.set(startId);
  }

  next(): void {
    this.go(this.nextIndex());
  }

  previous(): void {
    this.go(this.previousIndex());
  }

  stop(): void {
    this.playlist.set(null);
  }

  private go(index: number | null): void {
    const id = index === null ? undefined : this.playlist()?.ids[index];
    if (id) this.state.selectedTargetId.set(id);
  }

  /**
   * The next target one way that is above the horizon. Heights follow the minute clock,
   * so the buttons aren't worked out again on every frame of the map.
   */
  private step(direction: 1 | -1): number | null {
    const playlist = this.playlist();
    if (!playlist || !this.playing()) return null;
    const time = this.state.now();
    const byId = new Map(this.state.targets().map((target) => [target.id, target]));
    const isUp = (id: string): boolean => {
      const target = byId.get(id);
      return !!target && this.state.positionAt(target, time).altDeg > 0;
    };
    return stepIndex(playlist.ids, this.index(), direction, isUp);
  }
}

function load(): Playlist | null {
  try {
    return parsePlaylist(localStorage.getItem(PLAYLIST_KEY));
  } catch {
    return null;
  }
}
