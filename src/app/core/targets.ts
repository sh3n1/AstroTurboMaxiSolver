// A short target list for the UI preview. Stage 9 of todo.md replaces it with
// full catalogues. Positions are approximate J2000 values.

export type TargetKind = 'Galaxy' | 'Nebula' | 'Open cluster' | 'Globular cluster' | 'Star';

export interface Target {
  id: string;
  name: string;
  kind: TargetKind;
  raDeg: number;
  decDeg: number;
  mag: number;
}

export const TARGETS: readonly Target[] = [
  { id: 'M31', name: 'Andromeda Galaxy', kind: 'Galaxy', raDeg: 10.68, decDeg: 41.27, mag: 3.4 },
  { id: 'M33', name: 'Triangulum Galaxy', kind: 'Galaxy', raDeg: 23.46, decDeg: 30.66, mag: 5.7 },
  { id: 'M51', name: 'Whirlpool Galaxy', kind: 'Galaxy', raDeg: 202.47, decDeg: 47.2, mag: 8.4 },
  { id: 'M81', name: "Bode's Galaxy", kind: 'Galaxy', raDeg: 148.89, decDeg: 69.07, mag: 6.9 },
  { id: 'M101', name: 'Pinwheel Galaxy', kind: 'Galaxy', raDeg: 210.8, decDeg: 54.35, mag: 7.9 },
  { id: 'M8', name: 'Lagoon Nebula', kind: 'Nebula', raDeg: 270.92, decDeg: -24.38, mag: 6 },
  { id: 'M17', name: 'Omega Nebula', kind: 'Nebula', raDeg: 275.2, decDeg: -16.18, mag: 6 },
  { id: 'M27', name: 'Dumbbell Nebula', kind: 'Nebula', raDeg: 299.9, decDeg: 22.72, mag: 7.4 },
  { id: 'M42', name: 'Orion Nebula', kind: 'Nebula', raDeg: 83.82, decDeg: -5.39, mag: 4 },
  { id: 'M57', name: 'Ring Nebula', kind: 'Nebula', raDeg: 283.4, decDeg: 33.03, mag: 8.8 },
  { id: 'M44', name: 'Beehive Cluster', kind: 'Open cluster', raDeg: 130.1, decDeg: 19.67, mag: 3.7 },
  { id: 'M45', name: 'Pleiades', kind: 'Open cluster', raDeg: 56.75, decDeg: 24.12, mag: 1.6 },
  { id: 'M13', name: 'Hercules Cluster', kind: 'Globular cluster', raDeg: 250.42, decDeg: 36.46, mag: 5.8 },
  { id: 'M15', name: 'Pegasus Cluster', kind: 'Globular cluster', raDeg: 322.49, decDeg: 12.17, mag: 6.2 },
  { id: 'M22', name: 'Sagittarius Cluster', kind: 'Globular cluster', raDeg: 279.1, decDeg: -23.9, mag: 5.1 },
  { id: 'M92', name: 'Hercules Cluster II', kind: 'Globular cluster', raDeg: 259.28, decDeg: 43.14, mag: 6.4 },
  { id: 'Sirius', name: 'Alpha Canis Majoris', kind: 'Star', raDeg: 101.29, decDeg: -16.72, mag: -1.46 },
  { id: 'Arcturus', name: 'Alpha Boötis', kind: 'Star', raDeg: 213.92, decDeg: 19.18, mag: -0.05 },
  { id: 'Vega', name: 'Alpha Lyrae', kind: 'Star', raDeg: 279.23, decDeg: 38.78, mag: 0.03 },
  { id: 'Capella', name: 'Alpha Aurigae', kind: 'Star', raDeg: 79.17, decDeg: 45.99, mag: 0.08 },
  { id: 'Rigel', name: 'Beta Orionis', kind: 'Star', raDeg: 78.63, decDeg: -8.2, mag: 0.13 },
  { id: 'Betelgeuse', name: 'Alpha Orionis', kind: 'Star', raDeg: 88.79, decDeg: 7.41, mag: 0.5 },
  { id: 'Altair', name: 'Alpha Aquilae', kind: 'Star', raDeg: 297.7, decDeg: 8.87, mag: 0.76 },
  { id: 'Aldebaran', name: 'Alpha Tauri', kind: 'Star', raDeg: 68.98, decDeg: 16.51, mag: 0.85 },
  { id: 'Deneb', name: 'Alpha Cygni', kind: 'Star', raDeg: 310.36, decDeg: 45.28, mag: 1.25 },
  { id: 'Polaris', name: 'Alpha Ursae Minoris', kind: 'Star', raDeg: 37.95, decDeg: 89.26, mag: 1.98 },
];
