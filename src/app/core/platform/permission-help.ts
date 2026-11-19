// What the app says about the three permissions it asks for: why it needs each, said once
// just before the browser asks, and how to allow one again after it was blocked. Plain
// functions, with no Angular, so they can be tested. They give the keys of the texts in
// src/assets/i18n, which permissions.service.ts translates when it shows them.

import { i18n } from '../i18n/t';

/** What AppState.locateWithGps says when the user or the browser refused the location. */
export const LOCATION_BLOCKED = i18n('location.off');

/** What AppState.locateWithGps says when it worked. */
export const LOCATION_UPDATED = i18n('location.updated');

/** The permissions the app asks for, each when it is first needed. */
export type PermissionKind = 'camera' | 'location' | 'motion';

/** Where the app runs, since each keeps its permissions in a different place. */
export type DeviceKind = 'apple' | 'android' | 'desktop';

/** iPhones and iPads, Android phones, or a computer, from what the browser says it is. */
export function deviceKind(userAgent: string, platform: string, touchPoints: number): DeviceKind {
  // iPads ask for the desktop site, so they say they are Macs, with touch.
  if (/iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1)) return 'apple';
  return /Android/.test(userAgent) ? 'android' : 'desktop';
}

/** Why each permission is needed, in a line, shown before the browser asks: text keys. */
export const PERMISSION_REASONS: Record<PermissionKind, { header: string; message: string }> = {
  camera: { header: i18n('permissions.names.camera'), message: i18n('permissions.reasons.camera') },
  location: { header: i18n('permissions.names.location'), message: i18n('permissions.reasons.location') },
  motion: { header: i18n('permissions.names.motion'), message: i18n('permissions.reasons.motion') },
};

/** A text's key, with the values it fills in, such as the permission's name. */
export interface Text {
  key: string;
  params?: Record<string, string>;
}

/**
 * How to turn a refused permission on. Once refused, the browser doesn't ask any more: only
 * its settings can change it. iPhones keep the setting in the phone's Settings app. Said
 * calmly: nothing is wrong, the app just can't use it until it is turned on.
 */
export function blockedHelp(kind: PermissionKind, device: DeviceKind): { header: Text; steps: Text[] } {
  // The permission's name inside a browser's settings, filled into the texts below.
  const name = { name: PERMISSION_REASONS[kind].header };
  const header = { key: i18n('permissions.blocked.header'), params: name };
  const step = (key: string, params?: Record<string, string>): Text => ({ key, params });
  if (device === 'apple') {
    const steps: Record<PermissionKind, Text[]> = {
      camera: [step(i18n('permissions.steps.appleCamera')), step(i18n('permissions.steps.openAgain'))],
      location: [
        step(i18n('permissions.steps.appleLocation')),
        step(i18n('permissions.steps.appleSafariLocation')),
        step(i18n('permissions.steps.openAgain')),
      ],
      motion: [step(i18n('permissions.steps.appleCloseSafari')), step(i18n('permissions.steps.appleAllowMotion'))],
    };
    return { header, steps: steps[kind] };
  }
  if (device === 'android') {
    // Chrome's site settings, which the installed app shares with the browser.
    const steps = [step(i18n('permissions.steps.chromeSettings'), name), step(i18n('permissions.steps.chromeAllow'))];
    // The phone's own location switch can be off too, for every app.
    if (kind === 'location') steps.push(step(i18n('permissions.steps.androidLocation')));
    return { header, steps: [...steps, step(i18n('permissions.steps.openAgain'))] };
  }
  return {
    header,
    steps: [step(i18n('permissions.steps.desktopAllow'), name), step(i18n('permissions.steps.reload'))],
  };
}

/**
 * Whether a failure means the user, or the browser for them, refused the permission, as
 * opposed to a phone with no camera, no GPS signal, or a camera another app is using.
 */
export function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  // getUserMedia's refusal, and a GeolocationPositionError's PERMISSION_DENIED, which is 1.
  return name === 'NotAllowedError' || name === 'SecurityError' || (name === undefined && code === 1);
}
