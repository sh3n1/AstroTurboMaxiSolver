// What the app says about the three permissions it asks for: why it needs each, said once
// just before the browser asks, and how to allow one again after it was blocked. Plain
// functions and words, with no Angular, so they can be tested.

/** What AppState.locateWithGps says when the user or the browser refused the location. */
export const LOCATION_BLOCKED = 'Location off';

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

/** Why each permission is needed, in a line, shown before the browser asks. */
export const PERMISSION_REASONS: Record<PermissionKind, { header: string; message: string }> = {
  camera: {
    header: 'Camera',
    message: 'The camera finds stars to see where the telescope points. Pictures stay on this phone.',
  },
  location: {
    header: 'Location',
    message: 'Your location sets the sky shown. Only the nearest kilometre is kept.',
  },
  motion: {
    header: 'Motion sensors',
    message: 'The motion sensors move the map as you move the telescope.',
  },
};

/** The permission's name inside a browser's settings. */
const SETTING_NAMES: Record<PermissionKind, string> = {
  camera: 'Camera',
  location: 'Location',
  motion: 'Motion sensors',
};

/**
 * How to turn a refused permission on. Once refused, the browser doesn't ask any more: only
 * its settings can change it. iPhones keep the setting in the phone's Settings app. Said
 * calmly: nothing is wrong, the app just can't use it until it is turned on.
 */
export function blockedHelp(kind: PermissionKind, device: DeviceKind): { header: string; steps: string[] } {
  const header = `${SETTING_NAMES[kind]} is off`;
  if (device === 'apple') {
    const steps: Record<PermissionKind, string[]> = {
      camera: ['iPhone Settings › Apps › Safari › Camera › Allow', 'Then open the app again'],
      location: [
        'iPhone Settings › Privacy & Security › Location Services',
        'Safari Websites › While Using the App',
        'Then open the app again',
      ],
      motion: ['Close Safari fully', 'Open the app again, and allow motion when asked'],
    };
    return { header, steps: steps[kind] };
  }
  if (device === 'android') {
    // Chrome's site settings, which the installed app shares with the browser.
    const steps = [`In Chrome: ⋮ › Settings › Site settings › ${SETTING_NAMES[kind]}`, 'Tap this site › Allow'];
    // The phone's own location switch can be off too, for every app.
    if (kind === 'location') steps.push('Check Location is on in Android Settings');
    return { header, steps: [...steps, 'Then open the app again'] };
  }
  return {
    header,
    steps: [`Click the icon left of the address › ${SETTING_NAMES[kind]} › Allow`, 'Then reload the page'],
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
