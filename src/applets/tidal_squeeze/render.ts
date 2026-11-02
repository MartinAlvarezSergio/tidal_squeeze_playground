import { bulgeAt, type Moon } from "./model";

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const CLOSE_W = 300;
export const CLOSE_H = 200;

const CX = 645;
const CY = 385;
const ORBIT_PX = 125;
const PARTNER_PX = 195;
const THIRD_PX = 262;
/** Real eccentricities are tiny; the drawing stretches them this much so the oval shows. */
export const E_DRAWN = 60;

const INK = "rgba(235, 232, 226, 0.92)";
const MUTED = "rgba(235, 232, 226, 0.6)";
const TUG = "#ffd36b";

const FIELD = Array.from({ length: 150 }, (_, i) => {
  const h = (n: number): number => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: h(1) * VIEW_W, y: h(2) * VIEW_H, r: 0.4 + 1.1 * h(3) ** 3, phase: 6.28 * h(4) };
});

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, colour = INK, size = 13, align: CanvasTextAlign = "center", weight = 600): void {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(5, 7, 13, 0.85)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(s, x, y);
}

/** Cool rock to glowing orange as the heating rises (0–1). */
function heatColour(h: number): string {
  const t = Math.max(0, Math.min(1, h));
  const r = Math.round(200 + 55 * t);
  const g = Math.round(190 - 60 * t);
  const b = Math.round(150 - 110 * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export type SystemView = {
  moon: Moon;
  /** Drawn eccentricity. */
  eDrawn: number;
  /** Moon's position: distance (units of its average) and angle (radians from the closest point). */
  r: number;
  angle: number;
  partnerAngle: number;
  thirdAngle: number;
  /** Heating relative to today's, 0–1. */
  heat: number;
  /** Where and how recently the partner last tugged: angle (radians) and seconds ago. */
  tug: { angle: number; age: number } | null;
  resonance: boolean;
  clock: number;
};

export function renderSystem(ctx: CanvasRenderingContext2D, v: SystemView): void {
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (const s of FIELD) {
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(v.clock * 0.8 + s.phase);
    ctx.fillStyle = "#cfd8ff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Orbits: the moon's oval (exaggerated), its partners' circles.
  const e = v.eDrawn;
  const a = ORBIT_PX;
  const b = a * Math.sqrt(1 - e * e);
  ctx.strokeStyle = "rgba(255, 200, 150, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(CX - a * e, CY, a, b, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const r of [PARTNER_PX, ...(v.moon.third ? [THIRD_PX] : [])]) {
    ctx.strokeStyle = "rgba(200, 215, 255, 0.22)";
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e > 0.01) {
    const near = { x: CX + a * (1 - e), y: CY };
    text(ctx, "closest: biggest stretch", near.x + 10, near.y + 16, MUTED, 11, "left", 500);
    text(ctx, "farthest: least", CX - a * (1 + e) - 10, CY + 16, MUTED, 11, "right", 500);
  }

  // The planet.
  const planetGrad = ctx.createRadialGradient(CX - 10, CY - 10, 4, CX, CY, 36);
  planetGrad.addColorStop(0, v.moon.planet === "Jupiter" ? "#f3d9b0" : "#f0e2b8");
  planetGrad.addColorStop(1, v.moon.planet === "Jupiter" ? "#b4835a" : "#b9a06e");
  ctx.fillStyle = planetGrad;
  ctx.beginPath();
  ctx.arc(CX, CY, 34, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, v.moon.planet, CX, CY + 50, MUTED, 13);

  const pos = (r: number, ang: number): { x: number; y: number } => ({ x: CX + r * Math.cos(ang), y: CY - r * Math.sin(ang) });

  // The partner's tug: a flash along the line between them, fading.
  if (v.tug && v.tug.age < 0.9) {
    const alpha = 1 - v.tug.age / 0.9;
    const from = pos(PARTNER_PX, v.tug.angle);
    const to = pos(ORBIT_PX, v.tug.angle);
    ctx.strokeStyle = `rgba(255, 211, 107, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    text(ctx, v.resonance ? `${v.moon.partner}'s tug: same spot every time` : `${v.moon.partner}'s tug: somewhere new each time`, from.x + 12, from.y - 16, TUG, 12, "left");
  }

  const partner = pos(PARTNER_PX, v.partnerAngle);
  ctx.fillStyle = "#cfd8ff";
  ctx.beginPath();
  ctx.arc(partner.x, partner.y, 8, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, v.moon.partner, partner.x, partner.y + 18, MUTED, 12);
  if (v.moon.third) {
    const third = pos(THIRD_PX, v.thirdAngle);
    ctx.fillStyle = "#b8c4dc";
    ctx.beginPath();
    ctx.arc(third.x, third.y, 8, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, v.moon.third.name, third.x, third.y + 18, MUTED, 12);
  }

  // The moon itself, measured from the orbit's focus: the planet.
  const m = pos(v.r * a, v.angle);
  const glow = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 30);
  glow.addColorStop(0, `rgba(255, 140, 60, ${0.6 * v.heat})`);
  glow.addColorStop(1, "rgba(255, 140, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = heatColour(v.heat);
  ctx.beginPath();
  ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, v.moon.name, m.x, m.y - 20, INK, 14);

  text(ctx, `Orbits drawn round; ${v.moon.name}'s oval stretched ${E_DRAWN}× so you can see it.`, 362, VIEW_H - 28, MUTED, 12, "left", 500);
}

export type CloseView = {
  moon: Moon;
  /** Drawn distance, for the exaggerated stretch. */
  rDrawn: number;
  heat: number;
  /** Bulge size relative to average over recent time, oldest first (real values). */
  history: number[];
};

export function renderClose(ctx: CanvasRenderingContext2D, v: CloseView): void {
  ctx.clearRect(0, 0, CLOSE_W, CLOSE_H);
  text(ctx, `${v.moon.name} close up`, 6, 12, INK, 12, "left");
  text(ctx, "stretch exaggerated", 6, 27, MUTED, 10, "left", 500);

  // The moon, stretched towards the planet (to the left) by its tidal bulge.
  const cx = 78;
  const cy = 112;
  const R = 46;
  const stretch = 0.07 * bulgeAt(v.rDrawn);
  const glow = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.6);
  glow.addColorStop(0, `rgba(255, 140, 60, ${0.55 * v.heat})`);
  glow.addColorStop(1, "rgba(255, 140, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2);
  ctx.fill();
  // The unstretched outline goes underneath, so it only shows where the moon is squashed.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = heatColour(v.heat);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * (1 + stretch), R * (1 - stretch / 2), 0, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, `← to ${v.moon.planet}`, cx, cy + R + 24, MUTED, 10, "center", 500);

  // Bulge size over the last few orbits.
  const left = 168;
  const right = CLOSE_W - 8;
  const top = 50;
  const bottom = 170;
  const span = 0.02;
  text(ctx, "Bulge size", left, 42 - 4, INK, 11, "left");
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, (top + bottom) / 2);
  ctx.lineTo(right, (top + bottom) / 2);
  ctx.stroke();
  text(ctx, "+2%", left - 2, top, MUTED, 9, "right", 500);
  text(ctx, "−2%", left - 2, bottom, MUTED, 9, "right", 500);
  ctx.strokeStyle = "#ffb36b";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  v.history.forEach((h, i) => {
    const x = left + (i / Math.max(1, v.history.length - 1)) * (right - left);
    const y = (top + bottom) / 2 - ((h - 1) / span) * ((bottom - top) / 2);
    const yc = Math.max(top, Math.min(bottom, y));
    if (i === 0) ctx.moveTo(x, yc);
    else ctx.lineTo(x, yc);
  });
  ctx.stroke();
  text(ctx, "time →", right, bottom + 12, MUTED, 9, "right", 500);
}
