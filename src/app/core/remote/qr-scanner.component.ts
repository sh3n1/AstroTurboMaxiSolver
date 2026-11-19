import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Component, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import jsQR from 'jsqr';

import { t } from '../i18n/t';

/** How often a frame is checked for a code. Often enough to feel instant, light on the battery. */
const SCAN_INTERVAL_MS = 200;
/** Frames are shrunk to this width before reading, which is plenty for a code filling the view. */
const SCAN_WIDTH_PX = 640;

/** The browser's own QR reader, where there is one: Chrome on Android has it, Safari doesn't. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorClass = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Reads a QR code with the rear camera. It uses the browser's reader where there is one,
 * and jsQR (Apache-2.0) elsewhere, such as on iPhones.
 */
@Component({
  selector: 'app-qr-scanner',
  imports: [TranslatePipe],
  template: `
    <video #video playsinline muted [attr.aria-label]="'remote.cameraView' | translate"></video>
    @if (problem()) {
      <p class="problem" data-testid="scanner-problem">{{ problem() }}</p>
    }
  `,
  styles: `
    video {
      display: block;
      width: min(100%, 360px);
      aspect-ratio: 1;
      object-fit: cover;
      margin: 0 auto;
      border-radius: 8px;
      background: #000;
    }
    .problem {
      text-align: center;
      font-size: calc(15px * var(--af-scale, 1));
    }
  `,
})
export class QrScannerComponent implements OnInit, OnDestroy {
  /** The text of the first code read. Scanning stops then. */
  readonly scanned = output<string>();

  protected readonly problem = signal('');
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private detector: BarcodeDetectorLike | null = null;
  private readonly canvas = document.createElement('canvas');
  private busy = false;

  async ngOnInit(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      this.problem.set(t('remote.cameraUnavailable'));
      return;
    }
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
    try {
      this.detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
    } catch {
      this.detector = null; // Present but without QR support: jsQR reads instead.
    }
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
  }

  private async scan(): Promise<void> {
    const video = this.video().nativeElement;
    if (this.busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;
    this.busy = true;
    try {
      const text = await this.read(video);
      if (text) {
        this.ngOnDestroy();
        this.scanned.emit(text);
      }
    } finally {
      this.busy = false;
    }
  }

  private async read(video: HTMLVideoElement): Promise<string | null> {
    if (this.detector) {
      const codes = await this.detector.detect(video).catch(() => []);
      return codes[0]?.rawValue ?? null;
    }
    const scale = Math.min(1, SCAN_WIDTH_PX / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return jsQR(ctx.getImageData(0, 0, width, height).data, width, height)?.data ?? null;
  }
}
