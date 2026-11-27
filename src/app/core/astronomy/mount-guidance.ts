// Which way to move the telescope to reach a target, the way an alt-az mount moves: turn in
// azimuth and tilt in altitude. A plain function, shared by the phone's guidance and the puck's.
//
// The shortest path across the sky can lead over the zenith: from low in the east to low in
// the west it goes straight up. A mount can't follow that; it turns round in azimuth instead.
// So the guidance aims along the two axes, as the target bar's words already do.

import type { Horizontal } from './astronomy';
import { azimuthChangeDeg, normalizeDeg } from './astronomy';

const RAD = Math.PI / 180;

/**
 * Which way to move along the mount's axes from `pointing` to `target`, in the view's own
 * axes before any roll or mirror: degrees clockwise from up (higher), 90 being to the right
 * (azimuth growing, as `viewBasis` has it).
 *
 * The azimuth turn is scaled by the cosine of the current altitude, which is how far it
 * moves the view across the sky. So close to the target the arrow points straight at it,
 * as the map shows it, and only far away does it follow the axes instead.
 */
export function mountBearingDeg(pointing: Horizontal, target: Horizontal): number {
  const across = azimuthChangeDeg(pointing.azDeg, target.azDeg) * Math.cos(pointing.altDeg * RAD);
  const up = target.altDeg - pointing.altDeg;
  return normalizeDeg(Math.atan2(across, up) / RAD);
}
