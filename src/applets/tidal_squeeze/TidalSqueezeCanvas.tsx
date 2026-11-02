import { useEffect, useRef, useState } from "react";
import { setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { useCanvasBackingStore } from "../../ui/stage/hooks";
import {
  StageDivider,
  StageHero,
  StageIconButton,
  StagePills,
  StageReadout,
  StageSection,
  StageSegmented,
  StageToggle
} from "../../ui/stage/StageControls";
import { angleAt, bulgeAt, bulgeSwing, distanceAt, EARTH_HEAT_FLOW, heatAt, heatFlow, MOONS, relax } from "./model";
import { CLOSE_H, CLOSE_W, E_DRAWN, renderClose, renderSystem, VIEW_H, VIEW_W } from "./render";
import "./tidalSqueeze.css";

type Props = {
  host?: AppletHostAdapter;
};

const TIP = {
  play: "Run or pause the orbits.",
  reset: "Back to the start, resonance on.",
  moon: "Io, kept oval by Europa and Ganymede; or Enceladus, kept oval by Dione.",
  resonance: "On: the outer moon takes exactly two of the inner moon's orbits to go round once, so it always tugs at the same point and keeps the orbit oval. Off: its tugs land all over the place and cancel out, and tides round the orbit off.",
  hero: "Heat made by flexing, in watts. It grows with the square of the orbit's oval-ness.",
  flow: "The same heat spread over the whole surface, per square metre, next to Earth's internal heat flow.",
  e: "How oval the orbit is: 0 is a circle. These are real values; the drawing stretches them.",
  swing: "How much the tidal bulge grows and shrinks each orbit, as a share of its average size.",
  partner: "Which moon keeps the orbit oval, and how."
} as const;

/** Seconds of animation per orbit of the inner moon. */
const ORBIT_SECONDS = 3.5;
/** Animated time (s) for the orbit to round off, or to be pumped back up: far faster than in reality. */
const RELAX_SECONDS = 6;
/** Without the resonance, the outer moon's period is no longer a whole multiple of the inner one's. */
const OFF_RATIO = 2.37;
const HISTORY = 240;

function fmtWatts(w: number): string {
  if (w <= 0) return "none";
  const p = Math.floor(Math.log10(w));
  const sup = String(p).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]);
  return `${(w / 10 ** p).toFixed(1)} × 10${sup} W`;
}

export function TidalSqueezeCanvas({ host }: Props): JSX.Element {
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = host?.readReducedMotion?.() ?? false;

  const [moonId, setMoonId] = useState(MOONS[0].id);
  const [resonance, setResonance] = useState(true);
  const [running, setRunning] = useState(true);
  const [e, setE] = useState(MOONS[0].forcedE);
  const [orbits, setOrbits] = useState(0);

  useCanvasBackingStore([closeRef]);

  const moon = MOONS.find((m) => m.id === moonId) ?? MOONS[0];
  const live = useRef({ moon, resonance, running });
  live.current = { moon, resonance, running };
  const state = useRef({ p: 0, e: MOONS[0].forcedE, partner: 0, third: 0, tug: null as { angle: number; age: number } | null, history: [] as number[] });

  useEffect(() => {
    const ctx = sceneRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let lastUi = 0;
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const s = live.current;
      const st = state.current;
      if (s.running) {
        const dp = (dt / ORBIT_SECONDS) * (reducedMotion ? 0.5 : 1);
        const before = st.p;
        st.p += dp;
        st.e = relax(st.e, s.resonance ? s.moon.forcedE : 0, dt, RELAX_SECONDS);
        const ratio = s.resonance ? s.moon.ratio : OFF_RATIO;
        const prevGap = Math.sin(angleAt(0, before) - st.partner);
        st.partner += (2 * Math.PI * dp) / ratio;
        st.third += (2 * Math.PI * dp) / (s.resonance ? s.moon.third?.ratio ?? 4 : 5.5);
        if (s.resonance) {
          // Conjunctions fall at the inner moon's closest point, every other orbit.
          if (Math.floor(st.p / 2) !== Math.floor(before / 2)) {
            st.partner = 2 * Math.PI * Math.round(st.partner / (2 * Math.PI));
            st.tug = { angle: 0, age: 0 };
          }
        } else {
          const gap = Math.sin(2 * Math.PI * st.p - st.partner);
          if (prevGap > 0 && gap <= 0 && Math.cos(2 * Math.PI * st.p - st.partner) > 0) {
            st.tug = { angle: st.partner, age: 0 };
          }
        }
        if (st.tug) {
          st.tug.age += dt;
        }
        st.history.push(bulgeAt(distanceAt(st.e, st.p)));
        if (st.history.length > HISTORY) {
          st.history.shift();
        }
      }
      const eDrawn = Math.min(0.32, st.e * E_DRAWN);
      const heat = heatAt(s.moon, st.e) / s.moon.heat;
      setLogicalTransform(ctx, VIEW_W);
      renderSystem(ctx, {
        moon: s.moon,
        eDrawn,
        r: distanceAt(eDrawn, st.p),
        angle: angleAt(eDrawn, st.p),
        partnerAngle: st.partner,
        thirdAngle: st.third,
        heat,
        tug: st.tug,
        resonance: s.resonance,
        clock
      });
      const cctx = closeRef.current?.getContext("2d");
      if (cctx) {
        setLogicalTransform(cctx, CLOSE_W);
        renderClose(cctx, { moon: s.moon, rDrawn: distanceAt(eDrawn, st.p), heat, history: st.history });
      }
      if (now - lastUi > 150) {
        lastUi = now;
        setE(st.e);
        setOrbits(Math.floor(st.p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  function restart(id = moonId): void {
    const m = MOONS.find((q) => q.id === id) ?? MOONS[0];
    state.current = { p: 0, e: m.forcedE, partner: 0, third: 0, tug: null, history: [] };
    setE(m.forcedE);
  }

  const toolbar = (
    <>
      <StageIconButton icon={running ? "pause" : "play"} label={running ? "Pause" : "Run"} tip={TIP.play} onClick={() => setRunning((r) => !r)} />
      <StageIconButton
        icon="reset"
        label="Reset"
        tip={TIP.reset}
        onClick={() => {
          setResonance(true);
          restart();
          setRunning(true);
        }}
      />
      <StageDivider />
      <span className="ts-toolbar-orbits">
        {moon.name}: orbit {orbits + 1}
      </span>
    </>
  );

  const controls = (
    <>
      <StageSection title="Moon">
        <StageSegmented
          ariaLabel="Moon"
          value={moonId}
          options={MOONS.map((m) => ({ value: m.id, label: m.name }))}
          tip={TIP.moon}
          onChange={(id) => {
            setMoonId(id);
            setResonance(true);
            restart(id);
            host?.onResult?.({ event: "moon", moon: id });
          }}
        />
      </StageSection>
      <StagePills>
        <StageToggle label={`Resonance with ${moon.partner}`} tip={TIP.resonance} on={resonance} onChange={setResonance} />
      </StagePills>
      <p className="ts-hint">Switch the resonance off and watch the orbit round out, the bulge stop pulsing, and the heat fade. Switch it back on.</p>
    </>
  );

  const flow = heatFlow(moon, e);
  const readouts = (
    <>
      <StageHero label="Heat" value={fmtWatts(heatAt(moon, e))} tip={TIP.hero} />
      <StageReadout label="Per m²" value={`${flow < 0.01 ? flow.toExponential(0) : flow.toFixed(2)} W (Earth ${EARTH_HEAT_FLOW})`} tip={TIP.flow} />
      <StageReadout label="Orbit's oval (e)" value={e.toFixed(4)} tip={TIP.e} />
      <StageReadout label="Bulge swings by" value={`±${(100 * bulgeSwing(e)).toFixed(1)}%`} tip={TIP.swing} />
      <StageReadout
        label="Kept oval by"
        value={resonance ? `${moon.partner}, 2:1` : "nothing"}
        valueColor={resonance ? "#6fe39a" : "#ff8a5c"}
        tip={TIP.partner}
      />
    </>
  );

  const inset = (
    <canvas
      ref={closeRef}
      style={{ width: CLOSE_W, height: CLOSE_H }}
      role="img"
      aria-label="The moon close up, stretched by its tidal bulge, and a chart of the bulge's size over time"
    />
  );

  const info = (
    <>
      <h4>What you are seeing</h4>
      <ul>
        <li>{moon.name} going round {moon.planet}, with {moon.partner}{moon.third ? ` and ${moon.third.name}` : ""} farther out. Its orbit is very slightly oval; the drawing stretches the oval {E_DRAWN} times so you can see it.</li>
        <li>{moon.planet}'s gravity pulls harder on {moon.name}'s near side than its far side, stretching it into a slight rugby-ball shape: the tidal bulge.</li>
        <li>Bottom right: {moon.name} close up, and the size of its bulge over time.</li>
      </ul>
      <h4>Tides, then resonance, then heat</h4>
      <ul>
        <li>Close to the planet the stretch is strongest; far away, weakest. On an oval orbit the bulge grows and shrinks every orbit, flexing the moon's insides like a squeezed stress ball. Friction turns that flexing into heat.</li>
        <li>Left alone, the flexing would round the orbit off, and the heating would stop.</li>
        <li>The resonance stops that: {moon.partner} goes round exactly once for every two orbits of {moon.name}, so its tug always lands at the same point and keeps pushing the orbit back into an oval.</li>
        <li>Io's surface rises and falls by about 100 metres every 42 hours. Its heat drives the most volcanic world in the Solar System; Enceladus's keeps an ocean liquid under its ice and feeds the geysers at its south pole.</li>
      </ul>
      <h4>Try</h4>
      <ul>
        <li>Switch the resonance off. What happens to the oval, the bulge and the heat?</li>
        <li>Compare Io and Enceladus. Which gives out more heat in all, and why might that be?</li>
        <li>Why could a moon far from the Sun's habitable zone still have liquid water?</li>
      </ul>
      <h4>Simplified on purpose</h4>
      <ul>
        <li>Heat today is taken from measurements (Io about 10¹⁴ W; Enceladus about 16 GW, from Cassini) and scaled with the square of the eccentricity, as tidal heating theory gives.</li>
        <li>Rounding off the orbit, or pumping it back up, takes a few seconds here. In reality it would take a very long time.</li>
        <li>Orbits of the outer moons are drawn as circles and not to scale. The bulge is shown pointing straight at the planet; in reality it also rocks a little from side to side.</li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={VIEW_W}
      logicalHeight={VIEW_H}
      canvasRef={sceneRef}
      canvasLabel={`${moon.name} orbiting ${moon.planet} on a slightly oval orbit, kept oval by ${moon.partner}`}
      toolbar={toolbar}
      controls={controls}
      controlsWidth={290}
      readouts={readouts}
      inset={inset}
      info={info}
      rootClassName="tidal-squeeze"
    />
  );
}
