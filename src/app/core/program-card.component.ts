import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown, chevronUp, openOutline, ribbonOutline } from 'ionicons/icons';

import type { ObservingProgram } from './observing-programs';

/** Where the programmes whose cards were read are remembered. This phone only: a view choice. */
const READ_KEY = 'astroturbomaxisolver.programsRead';

function loadRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Shared by every card, so a programme read on one of its seasons counts for the others. */
const read = signal(loadRead());

/**
 * The observing programme a list comes from, at the top of the list: who runs it, what it
 * is for, and a link to its own page, which explains its purpose and rules. It shows open
 * until the user reads it, by opening the link or folding the card, and then as one line.
 */
@Component({
  selector: 'app-program-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  styles: `
    :host {
      display: block;
      margin: 12px 16px 4px;
      border: 1px solid #232a3d;
      border-radius: 12px;
      background: #0d1220;
      color: var(--af-text);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 48px;
      padding: 6px 12px;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
    }
    .head > ion-icon {
      flex: none;
      font-size: 22px;
      color: var(--ion-color-primary);
    }
    .names {
      flex: 1;
      min-width: 0;
    }
    .name {
      display: block;
      font-size: calc(16px * var(--af-scale, 1));
      font-weight: 700;
    }
    .by {
      display: block;
      font-size: calc(14px * var(--af-scale, 1));
      color: var(--af-muted);
    }
    .body {
      padding: 0 12px 12px 44px;
      font-size: calc(15px * var(--af-scale, 1));
    }
    .body p {
      margin: 0 0 8px;
    }
    .certificate {
      color: var(--ion-color-success);
    }
    /* A real link, opening the programme's page in a new tab. */
    .about {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid var(--ion-color-primary);
      border-radius: 22px;
      color: var(--ion-color-primary);
      font-size: calc(15px * var(--af-scale, 1));
      font-weight: 600;
      text-decoration: none;
    }
  `,
  template: `
    @let current = program();
    <button
      type="button"
      class="head"
      data-testid="program-card-toggle"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <ion-icon name="ribbon-outline" aria-hidden="true"></ion-icon>
      <span class="names">
        <span class="name" data-testid="program-name">{{ current.name }}</span>
        <span class="by">{{ current.by }}</span>
      </span>
      <ion-icon [name]="open() ? 'chevron-up' : 'chevron-down'" aria-hidden="true"></ion-icon>
    </button>
    @if (open()) {
      <div class="body" data-testid="program-card">
        <p>{{ current.summary }}</p>
        @if (current.certificate) {
          <p class="certificate">Certificate on completion</p>
        }
        <a
          class="about"
          data-testid="program-link"
          target="_blank"
          rel="noopener noreferrer"
          [href]="current.url"
          (click)="markRead()"
        >
          About the program
          <ion-icon name="open-outline" aria-hidden="true"></ion-icon>
        </a>
      </div>
    }
  `,
})
export class ProgramCardComponent {
  readonly program = input.required<ObservingProgram>();

  /** Open until read, or when the user opens it again. */
  private readonly opened = signal<boolean | null>(null);
  protected readonly open = computed(() => this.opened() ?? !read().has(this.program().id));

  constructor() {
    addIcons({ chevronDown, chevronUp, openOutline, ribbonOutline });
  }

  protected toggle(): void {
    const open = !this.open();
    this.opened.set(open);
    if (!open) this.markRead();
  }

  /** The programme's page was opened, or its card folded: it shows folded from now on. */
  protected markRead(): void {
    const id = this.program().id;
    if (read().has(id)) return;
    read.update((ids) => new Set([...ids, id]));
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...read()]));
    } catch {
      // Storage may be blocked: the card then opens again next time the app starts.
    }
  }
}
