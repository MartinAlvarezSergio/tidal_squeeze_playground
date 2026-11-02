import { useEffect, useRef, useState } from "react";
import { setLogicalTransform } from "../../core/canvasScale";
import { AppletHostAdapter } from "../../core/host";
import { AppletStage } from "../../ui/stage/AppletStage";
import { useCanvasBackingStore } from "../../ui/stage/hooks";
import {
  StageDivider,
  StageHero,
  StageIconButton,
  StagePillButton,
  StagePills,
  StageReadout,
  StageSection,
  StageSegmented,
  StageSlider
} from "../../ui/stage/StageControls";
import {
  angleAt,
  bulgeAt,
  bulgeSwing,
  distanceAt,
  EARTH_HEAT_FLOW,
  heatAt,
  heatFlow,
  insideAt,
  IO_DISTANCE_KM,
  MOONS,
  relax,
  resonanceName,
  tugDrift,
  tugsLineUp,
  TUGS_REMEMBERED,
  yourMoonFlow,
  yourMoonHeat,
  type Inside,
  type Moon
} from "./model";
import { CLOSE_H, CLOSE_W, E_DRAWN, glowFor, ORBIT_PX, renderClose, renderSystem, VIEW_H, VIEW_W } from "./render";
import "./tidalSqueeze.css";

type Props = {
  host?: AppletHostAdapter;
};

const TIP = {
  play: "Run or pause the orbits.",
  reset: "Back to the start: the real rhythm, or your moon's starting orbit.",
  moon: "A real moon (Io, Europa or Enceladus), or one you design yourself.",
  rhythm: "How many of the inner moon's orbits the outer moon takes to go round once. Really, it is exactly 2: a 2:1 resonance.",
  distance: "How far your moon is from Jupiter, in units of Io's distance. Europa is at 1.6, Ganymede at 2.5.",
  yourE: "How oval your moon's orbit is: 0 is a circle. A resonance with another moon would keep it this oval.",
  hero: "Heat made by flexing, in watts. It grows with the square of the orbit's oval-ness.",
  flow: "The same heat spread over the whole surface, per square metre, next to Earth's internal heat flow.",
  inside: "Roughly what that much heat does to the moon's insides.",
  e: "How oval the orbit is: 0 is a circle. These are real values; the drawing stretches them.",
  swing: "How much the tidal bulge grows and shrinks each orbit, as a share of its average size.",
  partner: "Which moon keeps the orbit oval, and how."
} as const;

/** Seconds of animation per orbit of the inner moon. */
const ORBIT_SECONDS = 3.5;
/** Animated time (s) for the orbit to round off, or to be pumped back up: far faster than in reality. */
const RELAX_SECONDS = 6;
const HISTORY = 240;
const REAL_RATIO = 2;
const YOURS = "yours";
const START_DISTANCE = 1.6;
const START_E = 0.004;

const INSIDE: Record<Inside, { label: string; colour: string }> = {
  volcanoes: { label: "Volcanoes", colour: "#ff8a5c" },
  ocean: { label: "Hidden ocean", colour: "#6fb3ff" },
  frozen: { label: "Frozen through", colour: "#cfd8ff" }
};

type Goal = { id: string; label: string; met: (distance: number, e: number, inside: Inside) => boolean };

const GOALS: Goal[] = [
  { id: "volcanoes", label: "Make volcanoes, like Io", met: (_d, _e, inside) => inside === "volcanoes" },
  { id: "far-ocean", label: "Hide an ocean beyond Ganymede (2.5 × Io's distance)", met: (d, _e, inside) => d >= 2.5 && inside === "ocean" },
  { id: "round-volcanoes", label: "Volcanoes on an almost round orbit (e under 0.002)", met: (_d, e, inside) => e < 0.002 && inside === "volcanoes" },
  { id: "close-frozen", label: "Freeze a moon as close as Io", met: (d, _e, inside) => d <= 1 && inside === "frozen" }
];

function yourMoon(e: number): Moon {
  const io = MOONS[0];
  return { ...io, id: YOURS, name: "Your moon", partner: "", third: undefined, inner: undefined, forcedE: e };
}

function fmtWatts(w: number): string {
  if (w <= 0) return "none";
  const p = Math.floor(Math.log10(w));
  const sup = String(p).replace("-", "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]);
  return `${(w / 10 ** p).toFixed(1)} × 10${sup} W`;
}

function freshState(e: number) {
  // The first tug is placed at the closest point so the trail of tug marks shows from the start.
  return { p: 0, e, partner: 0, third: 0, inner: 0, tug: { angle: 0, age: 99 } as { angle: number; age: number }, history: [] as number[] };
}

export function TidalSqueezeCanvas({ host }: Props): JSX.Element {
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const closeRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = host?.readReducedMotion?.() ?? false;

  const [moonId, setMoonId] = useState(MOONS[0].id);
  const [ratio, setRatio] = useState(REAL_RATIO);
  const [distance, setDistance] = useState(START_DISTANCE);
  const [yourE, setYourE] = useState(START_E);
  const [goalsMet, setGoalsMet] = useState<string[]>([]);
  const [running, setRunning] = useState(true);
  const [e, setE] = useState(MOONS[0].forcedE);
  const [orbits, setOrbits] = useState(0);

  useCanvasBackingStore([closeRef]);

  const isYours = moonId === YOURS;
  const moon = isYours ? yourMoon(yourE) : MOONS.find((m) => m.id === moonId) ?? MOONS[0];
  const live = useRef({ moon, isYours, ratio, distance, yourE, running });
  live.current = { moon, isYours, ratio, distance, yourE, running };
  const state = useRef(freshState(MOONS[0].forcedE));

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
        const before = 2 * Math.PI * st.p - st.partner;
        st.p += dp;
        if (s.isYours) {
          st.e = s.yourE;
        } else {
          // The tugs keep the orbit oval only as far as they keep landing on the same spot.
          st.e = relax(st.e, s.moon.forcedE * tugsLineUp(s.ratio) ** 2, dt, RELAX_SECONDS);
          st.partner += (2 * Math.PI * dp) / s.ratio;
          st.third += (2 * Math.PI * dp) / (2 * s.ratio);
          st.inner += (2 * Math.PI * dp) / (s.moon.inner?.ratio ?? 0.5);
          // A tug each time the moon catches up with its partner and they line up.
          const after = 2 * Math.PI * st.p - st.partner;
          if (Math.floor(after / (2 * Math.PI)) !== Math.floor(before / (2 * Math.PI))) {
            st.tug = { angle: st.partner, age: 0 };
          }
        }
        st.tug.age += dt;
        st.history.push(bulgeAt(distanceAt(st.e, st.p)));
        if (st.history.length > HISTORY) {
          st.history.shift();
        }
      }
      const eDrawn = Math.min(0.32, st.e * E_DRAWN);
      const flow = s.isYours ? yourMoonFlow(s.distance, st.e) : heatFlow(s.moon, st.e);
      const glow = glowFor(flow);
      setLogicalTransform(ctx, VIEW_W);
      renderSystem(ctx, {
        moon: s.moon,
        eDrawn,
        stretch: st.e > 0 ? eDrawn / st.e : 1,
        orbitPx: s.isYours ? ORBIT_PX * Math.sqrt(s.distance) : ORBIT_PX,
        partnerPx: s.isYours ? null : ORBIT_PX * s.ratio ** (2 / 3),
        r: distanceAt(eDrawn, st.p),
        angle: angleAt(eDrawn, st.p),
        partnerAngle: st.partner,
        thirdAngle: st.third,
        innerAngle: st.inner,
        heat: glow,
        tug: s.isYours ? null : st.tug,
        drift: tugDrift(s.ratio),
        lineUp: tugsLineUp(s.ratio),
        clock
      });
      const cctx = closeRef.current?.getContext("2d");
      if (cctx) {
        setLogicalTransform(cctx, CLOSE_W);
        renderClose(cctx, {
          moon: s.moon,
          rDrawn: distanceAt(eDrawn, st.p),
          heat: glow,
          history: st.history,
          span: bulgeSwing(st.e) > 0.028 ? 0.07 : 0.03
        });
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

  const flow = isYours ? yourMoonFlow(distance, e) : heatFlow(moon, e);
  const inside = insideAt(flow);

  // Tick off goals as your moon meets them.
  useEffect(() => {
    if (!isYours) {
      return;
    }
    const now = insideAt(yourMoonFlow(distance, yourE));
    const fresh = GOALS.filter((g) => !goalsMet.includes(g.id) && g.met(distance, yourE, now));
    if (fresh.length > 0) {
      setGoalsMet((done) => [...done, ...fresh.map((g) => g.id)]);
      fresh.forEach((g) => host?.onResult?.({ event: "goal", goal: g.id }));
    }
  }, [isYours, distance, yourE, goalsMet, host]);

  function restart(id = moonId): void {
    const startE = id === YOURS ? START_E : (MOONS.find((q) => q.id === id) ?? MOONS[0]).forcedE;
    state.current = freshState(startE);
    setE(startE);
  }

  const toolbar = (
    <>
      <StageIconButton icon={running ? "pause" : "play"} label={running ? "Pause" : "Run"} tip={TIP.play} onClick={() => setRunning((r) => !r)} />
      <StageIconButton
        icon="reset"
        label="Reset"
        tip={TIP.reset}
        onClick={() => {
          setRatio(REAL_RATIO);
          setDistance(START_DISTANCE);
          setYourE(START_E);
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

  const resonance = resonanceName(ratio);

  const controls = (
    <>
      <StageSection title="Moon">
        <StageSegmented
          ariaLabel="Moon"
          value={moonId}
          options={[...MOONS.map((m) => ({ value: m.id, label: m.name })), { value: YOURS, label: "Yours" }]}
          tip={TIP.moon}
          onChange={(id) => {
            setMoonId(id);
            setRatio(REAL_RATIO);
            restart(id);
            host?.onResult?.({ event: "moon", moon: id });
          }}
        />
      </StageSection>
      {isYours ? (
        <>
          <StageSection title="Your moon">
            <StageSlider label="Distance from Jupiter" display={`${distance.toFixed(2)} × Io's`} value={distance} min={0.5} max={3} step={0.01} tip={TIP.distance} onChange={setDistance} />
            <StageSlider label="How oval (e)" display={yourE.toFixed(4)} value={yourE} min={0} max={0.02} step={0.0005} tip={TIP.yourE} onChange={setYourE} />
          </StageSection>
          <StageSection title="Goals">
            <ul className="ts-goals">
              {GOALS.map((g) => (
                <li key={g.id} className={goalsMet.includes(g.id) ? "is-met" : undefined}>
                  <span aria-hidden="true">{goalsMet.includes(g.id) ? "✓" : "○"}</span>
                  {g.label}
                </li>
              ))}
            </ul>
          </StageSection>
        </>
      ) : (
        <StageSection title="The rhythm">
          <StageSlider
            label={`${moon.partner} goes round once every`}
            display={`${ratio.toFixed(2)} of ${moon.name}'s orbits`}
            value={ratio}
            min={1.3}
            max={2.6}
            step={0.01}
            tip={TIP.rhythm}
            onChange={setRatio}
          />
          <p className="ts-hint">
            Really it is exactly 2. Slide it off 2 and watch where the tugs land, the oval and the heat. Can you find another rhythm that works?
          </p>
          {ratio !== REAL_RATIO && (
            <StagePills>
              <StagePillButton label="Back to the real 2" onClick={() => setRatio(REAL_RATIO)} />
            </StagePills>
          )}
        </StageSection>
      )}
    </>
  );

  const heatWatts = isYours ? yourMoonHeat(distance, e) : heatAt(moon, e);
  const readouts = (
    <>
      <StageHero label="Heat" value={fmtWatts(heatWatts)} tip={TIP.hero} />
      <StageReadout label="Per m²" value={`${flow < 0.01 ? flow.toExponential(0) : flow.toFixed(2)} W (Earth ${EARTH_HEAT_FLOW})`} tip={TIP.flow} />
      <StageReadout label="Inside" value={INSIDE[inside].label} valueColor={INSIDE[inside].colour} tip={TIP.inside} />
      <StageReadout label="Orbit's oval (e)" value={e.toFixed(4)} tip={TIP.e} />
      <StageReadout label="Bulge swings by" value={`±${(100 * bulgeSwing(e)).toFixed(1)}%`} tip={TIP.swing} />
      {isYours ? (
        <StageReadout label="Distance" value={`${Math.round((distance * IO_DISTANCE_KM) / 1000).toLocaleString("en-US")},000 km`} tip={TIP.distance} />
      ) : (
        <StageReadout
          label="Kept oval by"
          value={resonance ? `${moon.partner}, ${resonance}` : "nothing"}
          valueColor={resonance ? "#6fe39a" : "#ff8a5c"}
          tip={TIP.partner}
        />
      )}
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
        {isYours ? (
          <li>Your own moon, the size of Io, going round Jupiter. You choose how far out it is and how oval its orbit; some other moon is assumed to keep it that oval.</li>
        ) : (
          <li>{moon.name} going round {moon.planet}, with {moon.partner}{moon.third ? ` and ${moon.third.name}` : ""} farther out{moon.inner ? `, and ${moon.inner.name} closer in` : ""}. Its orbit is very slightly oval; the drawing stretches the oval so you can see it.</li>
        )}
        <li>{moon.planet}'s gravity pulls harder on the moon's near side than its far side, stretching it into a slight rugby-ball shape: the tidal bulge.</li>
        <li>Bottom right: the moon close up, and the size of its bulge over time.</li>
      </ul>
      <h4>Tides, then resonance, then heat</h4>
      <ul>
        <li>Close to the planet the stretch is strongest; far away, weakest. On an oval orbit the bulge grows and shrinks every orbit, flexing the moon's insides like a squeezed stress ball. Friction turns that flexing into heat.</li>
        <li>Left alone, the flexing would round the orbit off, and the heating would stop.</li>
        <li>A resonance stops that. The yellow marks show where the outer moon's last few tugs landed. When it goes round exactly once for every two orbits (2:1), every tug lands on the same spot and keeps pushing the orbit back into an oval, like pushing a swing at the same moment each time. With any other rhythm the tugs land all round the orbit and cancel out.</li>
        <li>Heat falls off very fast with distance: twice as far from the planet, about 180 times less heat for the same oval.</li>
        <li>Io's surface rises and falls by about 100 metres every 42 hours. Its heat drives the most volcanic world in the Solar System.</li>
        <li>Europa gets far less heat than Io, but enough, with the warmth of its rocky core, to keep a salty ocean liquid under its ice. Ganymede and Io keep its orbit oval together: Io goes round four times for every two orbits of Europa and one of Ganymede.</li>
        <li>Enceladus's heat keeps an ocean liquid under its ice and feeds the geysers at its south pole.</li>
      </ul>
      <h4>Try</h4>
      <ul>
        <li>Slide the rhythm off 2. How far off can you go before the heat fades? Is there another rhythm where the tugs pile up again?</li>
        <li>Compare the three moons. Which gives out the most heat in all? Europa's orbit is the most oval, so why does it get less heat than Io?</li>
        <li>Design your own moon and tick off the goals.</li>
        <li>Why could a moon far from the Sun's habitable zone still have liquid water?</li>
      </ul>
      <h4>Simplified on purpose</h4>
      <ul>
        <li>Heat today is taken from measurements (Io about 10¹⁴ W; Enceladus about 16 GW, from Cassini) and scaled with the square of the eccentricity, as tidal heating theory gives. Europa's has never been measured: its 10¹² W is a typical model estimate, and some models give ten times less.</li>
        <li>How well the tugs keep the orbit oval is judged from where the last {TUGS_REMEMBERED} landed. Real resonances work over a narrow range of rhythms like this, but through subtler orbital physics.</li>
        <li>Your moon is Io-sized and its heat scales from Io's, as the square of the eccentricity and the distance to the power −7.5. The lines between volcanoes, a hidden ocean and frozen through are rough: they depend on what the moon is made of.</li>
        <li>Rounding off the orbit, or pumping it back up, takes a few seconds here. In reality it would take a very long time.</li>
        <li>Orbits are drawn round and not to scale. The bulge is shown pointing straight at the planet; in reality it also rocks a little from side to side.</li>
      </ul>
    </>
  );

  return (
    <AppletStage
      logicalWidth={VIEW_W}
      logicalHeight={VIEW_H}
      canvasRef={sceneRef}
      canvasLabel={isYours ? "Your moon orbiting Jupiter" : `${moon.name} orbiting ${moon.planet} on a slightly oval orbit, tugged by ${moon.partner}`}
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
