import type { ElementRef } from '@angular/core';
import { Component, effect, input, viewChild } from '@angular/core';
import qrcode from 'qrcode-generator';

/** Pixels per QR module on the canvas, before the browser scales it to fit. */
const CELL_PX = 6;
/** The blank border QR readers need around the code, in modules. */
const QUIET_ZONE = 4;

/**
 * Shows text as a QR code, black on white, for another phone's camera to read. It uses
 * qrcode-generator (MIT, Kazuhiko Arase). "QR Code" is a trademark of DENSO WAVE.
 */
@Component({
  selector: 'app-qr-code',
  template: `<canvas #canvas role="img" [attr.aria-label]="label()" [attr.data-code]="text()"></canvas>`,
  styles: `
    :host {
      display: block;
    }
    canvas {
      display: block;
      width: min(100%, 360px);
      margin: 0 auto;
      background: #fff;
      border-radius: 8px;
      /* Each module stays a crisp square however the code is scaled. */
      image-rendering: pixelated;
    }
  `,
})
export class QrCodeComponent {
  readonly text = input.required<string>();
  /** What a screen reader says instead of the code. */
  readonly label = input('QR code');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      const canvas = this.canvas().nativeElement;
      // Type 0 picks the smallest size that fits. Low error correction keeps it small,
      // which suits a code read off a clean screen.
      const code = qrcode(0, 'L');
      code.addData(this.text());
      code.make();
      const size = (code.getModuleCount() + QUIET_ZONE * 2) * CELL_PX;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.translate(QUIET_ZONE * CELL_PX, QUIET_ZONE * CELL_PX);
      code.renderTo2dContext(ctx, CELL_PX);
      ctx.restore();
    });
  }
}
