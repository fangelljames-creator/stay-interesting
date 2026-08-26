"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AXES,
  axisLabelPoint,
  axisSpokeEnd,
  neutralVector,
  polygonPoints,
  radarVertices,
  ringPoints,
} from "../lib/radarGeometry";
import { isValidVector } from "../lib/matchActivities";
import { PERSONALITY_TYPES } from "../lib/personalityTypes";

/**
 * The taste radar — the product's visual motif.
 *
 * A 7-axis polygon drawn straight into SVG, no chart library. It appears four
 * times in the funnel and is the same component every time: morphing between
 * example shapes on the hero, reshaping under the user's hand while they
 * answer, large and labelled on the profile card, and shrunk to a badge on the
 * returning-visitor banner.
 *
 * ⚠️ ALL THE MATHS IS IN lib/radarGeometry.ts, on purpose. This file is
 * "use client", which means no dev script can import it; keeping the geometry
 * outside is what lets scripts/verify-taste-radar.mjs check the real functions
 * instead of a hand-copied mirror of them. Nothing in this file should compute
 * a coordinate.
 *
 * ⚠️ NO NUMBERS APPEAR ON THE CHART, in any mode. Axis names only: no values
 * beside the labels, no tooltips, nothing against the rings. A number on a
 * display-normalised chart would be a number that does not mean what it looks
 * like it means, and the raw magnitudes are not what this drawing carries
 * anyway — see normalizeForDisplay in lib/radarGeometry.ts. That also means
 * there is no rounding anywhere in the radar at all.
 *
 * ⚠️ SHAPE, NOT MAGNITUDE. Every polygon here is normalised before it is
 * plotted, in all three modes, so the hero and the quiz read on the same
 * terms. The raw vector still drives everything that is not drawing.
 */

/** How long a morph takes. Long enough to read as a change, short enough to
 *  finish before an unhurried user clicks the next answer. */
const MORPH_MS = 600;

/**
 * How long each hero shape holds before the next one.
 *
 * ⚠️ THE FULL CYCLE IS 30 SECONDS at 15 shapes, so a typical visitor sees four
 * or five of them rather than the whole taxonomy. That is arithmetic, not a
 * bug — the hero's job is to show that the chart measures something about you,
 * which one morph already does. Shortening this to fit all 15 into a glance
 * would make each shape too brief to read.
 */
const DEMO_INTERVAL_MS = 2000;

/**
 * The hero's shapes: ALL FIFTEEN personality types, each drawn as its own
 * archetype and captioned with its own name.
 *
 * ⚠️ THESE ARE MEASURED, NOT ILLUSTRATIVE, and that is the whole change. This
 * used to be four hand-written vectors captioned with four of the seven real
 * type names — shapes nobody could ever be given, standing in for a taxonomy
 * that was both larger than the demo implied and unrelated to it. Every vector
 * here is now archetypeTotals from lib/personalityTypes.ts: the single most
 * type-defining answer path the quiz can actually produce for that type. A
 * visitor watching the hero is watching real outputs of the thing they are
 * about to do.
 *
 * ⚠️ NOTHING HERE MAY BE HAND-TUNED. If two shapes read as near-twins on
 * screen, that is the taxonomy reporting a real resemblance — a pure type and a
 * hybrid containing it genuinely are neighbours — and the fix is a decision
 * about the taxonomy or the play order, never an edited vector. Editing one
 * puts a polygon on the landing page that the quiz behind it cannot produce.
 * scripts/analyze-quiz-balance.mjs section (g5) measures the resemblances.
 *
 * The raw sums are on a different scale from a user's 1-10 vector, and it does
 * not matter: every polygon is display-normalised before it is plotted, so the
 * chart draws ratios and never magnitudes. See normalizeForDisplay.
 */
const DEMO_SHAPES: { label: string; vector: number[] }[] = PERSONALITY_TYPES.map(
  (type) => ({ label: type.title, vector: type.archetypeTotals })
);

export type RadarMode = "demo" | "building" | "final";

interface TasteRadarProps {
  /**
   * How the chart is dressed, NOT where its data comes from. "building" is the
   * small quiet treatment and "final" the large labelled one; the returning
   * banner uses "building" on a settled vector because it wants the small
   * treatment, not because anything is still being built.
   */
  mode: RadarMode;
  /**
   * The 7-axis vector to draw, on the 1-10 scale. Ignored in "demo" mode.
   * Null or absent draws the neutral shape — see NEUTRAL_VALUE.
   */
  vector?: number[] | null;
  /**
   * Axis INDICES to pick out — the axes a hybrid profile is built from, so the
   * card and the chart agree about which two the copy is talking about.
   *
   * ⚠️ HONOURED IN "final" MODE ONLY, and deliberately quiet even there: a
   * heavier label in the accent colour and a slightly larger vertex dot. It
   * adds emphasis, never information — no number appears, no axis is redrawn,
   * and the polygon is exactly the polygon it would be without this. A viewer
   * who ignores it loses nothing.
   */
  highlightAxes?: number[];
  /** Overrides the per-mode default width/height in pixels. */
  size?: number;
  className?: string;
}

/**
 * The two axes a shape leads on, named. Used for the accessible description,
 * which says the same thing the picture does — which axes dominate — rather
 * than reading out numbers the sighted user never sees.
 */
function strongestAxes(vector: number[]): string[] {
  return AXES.map((axis, index) => ({ axis, value: vector[index] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((entry) => entry.axis);
}

/**
 * Per-mode presentation. Data never varies by mode; only these do.
 *
 * `maxWidth` is a CAP, not a fixed size — the chart is drawn in viewBox units
 * and scaled to its container, so it shrinks on a narrow screen instead of
 * overflowing. See the geometry constants below for why that matters.
 */
const PRESENTATION: Record<RadarMode, { maxWidth: number; labels: boolean; strokeWidth: number }> = {
  demo: { maxWidth: 320, labels: true, strokeWidth: 2 },
  building: { maxWidth: 132, labels: false, strokeWidth: 1.5 },
  final: { maxWidth: 300, labels: true, strokeWidth: 2 },
};

/**
 * The chart is drawn at a fixed size in viewBox units and scaled by CSS, so
 * every ratio below holds at every rendered width.
 *
 * ⚠️ LABEL_SPACE IS NOT DECORATION, IT IS THE REASON THE LABELS ARE READABLE.
 * An axis name is anchored just outside the ring and drawn OUTWARD from there,
 * so the box has to contain the ring plus the longest name. The widest axis
 * label is "Stimulation" at 11 characters, and the two most horizontal axes
 * sit at cos ~0.975 of the ring, so the box needs roughly
 * 0.975 * (RADIUS + LABEL_OFFSET) + text width - RADIUS of clearance. Getting
 * this wrong does not throw or warn: the text simply runs outside the viewBox
 * and is clipped mid-word. It read "imulation", "velty" and "Crea" before this
 * was measured in a browser.
 */
const RADIUS = 100;
const LABEL_OFFSET = 16;
const LABEL_FONT_SIZE = 11;
const LABEL_SPACE = 84;
/** No labels to clear, so just enough that the stroke is not cut off. */
const BARE_SPACE = 8;

/** The gridline rings, innermost first. */
const RINGS = [0.25, 0.5, 0.75, 1];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Cached so getSnapshot below is cheap on every render. */
let mediaQuery: MediaQueryList | null = null;
function reducedMotionQuery(): MediaQueryList {
  if (!mediaQuery) mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  return mediaQuery;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True when the viewer has asked for less motion.
 *
 * useSyncExternalStore rather than useState-in-useEffect. matchMedia is
 * exactly what that hook is for — an external source React does not own — and
 * it is also the only way to read one here without a lint error or a hydration
 * mismatch. This component renders inside a statically prerendered page where
 * `window` does not exist, so the third argument supplies the server's answer:
 * assume motion is fine, then correct on the client at hydration. Reading
 * matchMedia during render instead would mismatch, the same trap the funnel's
 * "loading" stage exists to avoid.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => reducedMotionQuery().matches,
    () => false
  );
}

/**
 * Eases the 7 values toward `target`, one animation frame at a time.
 *
 * WHY NOT A CSS TRANSITION. CSS cannot transition an SVG polygon's `points`
 * attribute at all, and transitioning a path's `d` only works in Chrome and
 * Firefox — Safari would hard-jump on every answer. Interpolating the numbers
 * ourselves works everywhere and costs about thirty lines.
 *
 * ⚠️ IT EASES FROM WHEREVER THE LAST MORPH REACHED, not from the last settled
 * shape. That is the point: someone clicking through the quiz faster than
 * 600ms retargets mid-flight and the polygon simply changes course. Restarting
 * from the previous target would snap backwards on every fast answer.
 *
 * The effect depends on the target SERIALISED, not on the array. `target` is a
 * fresh array on every render and this hook re-renders on every frame, so an
 * array dependency would restart the animation forever. Number-to-string in
 * JavaScript round-trips exactly, so nothing is lost rebuilding it.
 */
function useAnimatedVector(target: number[], duration = MORPH_MS): number[] {
  const [current, setCurrent] = useState<number[]>(target);
  const fromRef = useRef<number[]>(target);
  const targetKey = target.join(",");
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const to = targetKey.split(",").map(Number);

    if (reduced) {
      // No setState: the hook returns `target` straight through while reduced,
      // so there is no animated value to store. The ref is still kept current
      // so that turning reduced motion off mid-session eases from the shape
      // actually on screen rather than from a stale one.
      fromRef.current = to;
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // Cubic ease-out: quick to move, gentle to settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = to.map((value, i) => from[i] + (value - from[i]) * eased);

      // Recorded every frame so the NEXT target eases from here.
      fromRef.current = next;
      setCurrent(next);

      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetKey, duration, reduced]);

  // Under reduced motion the target IS the answer, with no frame in between.
  return reduced ? target : current;
}

export default function TasteRadar({
  mode,
  vector,
  highlightAxes,
  size,
  className,
}: TasteRadarProps) {
  const reduced = usePrefersReducedMotion();
  const [demoIndex, setDemoIndex] = useState(0);

  // The hero's autoplay. Fixed order, no randomness — Math.random() in a
  // component body trips react-hooks/purity, and a predictable cycle is
  // easier to describe in docs/manual-test.md anyway. Under reduced motion the
  // interval never starts and the first shape simply holds.
  useEffect(() => {
    if (mode !== "demo" || reduced) return;
    const id = setInterval(
      () => setDemoIndex((index) => (index + 1) % DEMO_SHAPES.length),
      DEMO_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, [mode, reduced]);

  const presentation = PRESENTATION[mode];
  const maxWidth = size ?? presentation.maxWidth;

  // No vector yet — the quiz has not been answered. The neutral shape is a
  // regular heptagon halfway out: visibly a shape, visibly not a result, so
  // the first answer is a reshape rather than a polygon appearing from
  // nothing. Drawn faded so it never reads as somebody's actual taste.
  const isGhost = mode !== "demo" && !isValidVector(vector);

  const target =
    mode === "demo"
      ? DEMO_SHAPES[demoIndex].vector
      : isValidVector(vector)
        ? vector
        : neutralVector();

  const shape = useAnimatedVector(target);

  const center = RADIUS + (presentation.labels ? LABEL_SPACE : BARE_SPACE);
  const box = center * 2;
  const radius = RADIUS;

  const points = polygonPoints(shape, radius, center);

  // Empty everywhere but the profile card, so the small quiet treatments and
  // the hero cannot pick up an emphasis they were never designed around.
  const highlighted = new Set(mode === "final" ? (highlightAxes ?? []) : []);

  return (
    <div className={className}>
      <svg
        // Scales to its container up to maxWidth, rather than being pinned to
        // a pixel size that a 375px screen cannot afford.
        width="100%"
        viewBox={`0 0 ${box} ${box}`}
        style={{ maxWidth, height: "auto" }}
        role="img"
        aria-label={
          mode === "demo"
            ? `Example taste profile: ${DEMO_SHAPES[demoIndex].label}`
            : isGhost
              ? "Your taste profile, not yet measured"
              : // Named, not numbered, for the same reason the labels are. The
                // chart says which axes lead; a screen reader should hear the
                // same thing rather than a list of figures nobody can see.
                `Your taste profile, strongest on ${strongestAxes(shape).join(" and ")}`
        }
      >
        {RINGS.map((fraction) => (
          <polygon
            key={fraction}
            points={ringPoints(fraction, radius, center)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

        {AXES.map((axis, index) => {
          const end = axisSpokeEnd(index, radius, center);
          return (
            <line
              key={axis}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={points}
          fill="#6366f1"
          fillOpacity={isGhost ? 0.08 : 0.2}
          stroke="#4f46e5"
          strokeOpacity={isGhost ? 0.3 : 1}
          strokeWidth={presentation.strokeWidth}
          strokeLinejoin="round"
        />

        {/* Vertex dots come from radarVertices, so they sit on the normalised
            polygon rather than floating off it at raw magnitudes. */}
        {mode === "final" &&
          radarVertices(shape, radius, center).map((point, index) => (
            <circle
              key={AXES[index]}
              cx={point.x}
              cy={point.y}
              r={highlighted.has(index) ? 5 : 3}
              fill="#4f46e5"
            />
          ))}

        {presentation.labels &&
          AXES.map((axis, index) => {
            const point = axisLabelPoint(index, radius, center, LABEL_OFFSET);
            // Anchor by which side of the chart the label sits on, so text
            // grows outward rather than back across the polygon.
            const anchor =
              Math.abs(point.x - center) < 1 ? "middle" : point.x > center ? "start" : "end";
            return (
              <text
                key={axis}
                x={point.x}
                y={point.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={LABEL_FONT_SIZE}
                fontWeight={highlighted.has(index) ? 800 : 600}
                fill={highlighted.has(index) ? "#4f46e5" : "#64748b"}
              >
                {axis}
              </text>
            );
          })}
      </svg>

      {mode === "demo" && (
        <p className="text-center text-xs font-bold uppercase tracking-wider text-indigo-500">
          {DEMO_SHAPES[demoIndex].label}
        </p>
      )}
    </div>
  );
}
