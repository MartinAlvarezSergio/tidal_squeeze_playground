/**
 * Tidal squeeze: a moon on a slightly oval orbit is stretched more when close to its planet and
 * less when far, so its tidal bulge grows and shrinks every orbit; that flexing heats it. A
 * resonance with an outer moon keeps the orbit oval. Without it, tides round the orbit out and
 * the heating stops.
 */

export type Moon = {
  id: string;
  name: string;
  planet: string;
  partner: string;
  /** The resonance: the partner's period over the moon's (2 for both cases here). */
  ratio: number;
  /** A third moon in the chain, if any, with its period ratio to the moon. */
  third?: { name: string; ratio: number };
  /** Eccentricity the resonance keeps up. */
  forcedE: number;
  /** Heat given out today (W), with the orbit at its forced eccentricity. */
  heat: number;
  radiusKm: number;
  periodDays: number;
};

export const MOONS: Moon[] = [
  {
    id: "io",
    name: "Io",
    planet: "Jupiter",
    partner: "Europa",
    ratio: 2,
    third: { name: "Ganymede", ratio: 4 },
    forcedE: 0.0041,
    // About 2.5 W per square metre over the whole surface.
    heat: 1e14,
    radiusKm: 1821.6,
    periodDays: 1.769
  },
  {
    id: "enceladus",
    name: "Enceladus",
    planet: "Saturn",
    partner: "Dione",
    ratio: 2,
    forcedE: 0.0047,
    // Cassini's measurement over the south polar region, about 16 GW (Howett et al. 2011).
    heat: 1.6e10,
    radiusKm: 252.1,
    periodDays: 1.37
  }
];

/** Earth's average heat flow from inside, for comparison (W per square metre). */
export const EARTH_HEAT_FLOW = 0.09;

/** Tidal heating grows with the square of the eccentricity: no oval, no flexing, no heat. */
export function heatAt(moon: Moon, e: number): number {
  return moon.heat * (e / moon.forcedE) ** 2;
}

export function heatFlow(moon: Moon, e: number): number {
  const r = moon.radiusKm * 1000;
  return heatAt(moon, e) / (4 * Math.PI * r * r);
}

/** The bulge's height goes as 1/r³, so over an orbit it swings by about ±3e of its average size. */
export function bulgeSwing(e: number): number {
  return ((1 - e) ** -3 - (1 + e) ** -3) / 2;
}

/** Bulge height relative to its average, at distance r (in units of the orbit's average distance). */
export function bulgeAt(r: number): number {
  return r ** -3;
}

/** Eccentricity relaxing towards `target` with time constant `tau` (any time unit). */
export function relax(e: number, target: number, dt: number, tau: number): number {
  return target + (e - target) * Math.exp(-dt / tau);
}

/** Distance from the planet (units of the average distance) at orbital phase `p` (turns, 0 = closest). */
export function distanceAt(e: number, p: number): number {
  const m = 2 * Math.PI * (p - Math.floor(p));
  let E = m;
  for (let k = 0; k < 20; k += 1) {
    E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  }
  return 1 - e * Math.cos(E);
}

/** Angle around the planet (radians) at orbital phase `p`, measured from the closest point. */
export function angleAt(e: number, p: number): number {
  const m = 2 * Math.PI * (p - Math.floor(p));
  let E = m;
  for (let k = 0; k < 20; k += 1) {
    E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  }
  const turns = Math.floor(p);
  return 2 * Math.PI * turns + 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}
