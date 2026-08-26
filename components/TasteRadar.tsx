"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AXES,
  AXIS_COUNT,
  axisLabelPoint,
  axisSpokeEnd,
  labelValue,
  neutralVector,
  polygonPoints,
  radarPoint,
  ringPoints,
} from "../lib/radarGeometry";
import { isValidVector } from "../lib/matchActivities";

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
 * ⚠️ Math.round appears nowhere here either. The one rounding in the radar is
 * radarGeometry's labelValue, used for the number printed beside an axis. The
 * shape itself is always drawn from the raw, unrounded vector — the same
 * vector that ranks the user's activities. See CLAUDE.md on the no-rounding
 * rule.
 */

/** How long a morph takes. Long enough to read as a change, short enough to
 *  finish before an unhurried user clicks the next answer. */
const MORPH_MS = 600;

/** How long each hero shape holds before the next one. */
const DEMO_INTERVAL_MS = 2600;

/**
 * The hero's example shapes. Hand-written, deliberately distinct: four people
 * whose polygons could not be mistaken for one another, so the morph reads as
 * "this measures something about you" rather than as decoration.
 *
 * These are illustrative, NOT scored data — nothing ranks against them and no
 * user ever receives one. They do follow the 7-axis rubric's shape so the demo
 * does not teach a meaning the real chart contradicts. Axis order is the fixed
 * project-wide one: [Social, Energy, Creative, Analytical, Outdoors, Novelty,
 * Stimulation].
 */
const DEMO_SHAPES: { label: string; vector: number[] }[] = [
  { label: "The Meticulous Creator", vector: [2, 2, 9, 4, 2, 6, 3] },
  { label: "The Strategic Architect", vector: [3, 1, 3, 10, 1, 4, 5] },
  { label: "The Open-Air Explorer", vector: [4, 7, 2, 2, 10, 5, 4] },
  { label: "The Thrill Seeker", vector: [7, 8, 2, 3, 6, 7, 10] },
];

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
  /** Overrides the per-mode default width/height in pixels. */
  size?: number;
  className?: string;
}

/** Per-mode presentation. Data never varies by mode; only these do. */
const PRESENTATION: Record<RadarMode, { size: number; labels: boolean; strokeWidth: number }> = {
  demo: { size: 280, labels: true, strokeWidth: 2 },
  building: { size: 132, labels: false, strokeWidth: 1.5 },
  final: { size: 260, labels: true, strokeWidth: 2 },
};

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

export default function TasteRadar({ mode, vector, size, className }: TasteRadarProps) {
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
  const width = size ?? presentation.size;

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

  // Labels need room outside the outer ring; without them the chart can fill
  // its box. axisLabelPoint's own offset is 16, so 34 leaves space for text.
  const padding = presentation.labels ? 34 : 6;
  const center = width / 2;
  const radius = center - padding;

  const points = polygonPoints(shape, radius, center);

  return (
    <div className={className}>
      <svg
        width={width}
        height={width}
        viewBox={`0 0 ${width} ${width}`}
        role="img"
        aria-label={
          mode === "demo"
            ? `Example taste profile: ${DEMO_SHAPES[demoIndex].label}`
            : isGhost
              ? "Your taste profile, not yet measured"
              : `Your taste profile across ${AXIS_COUNT} axes: ` +
                AXES.map((axis, i) => `${axis} ${labelValue(shape[i])}`).join(", ")
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

        {mode === "final" &&
          shape.map((value, index) => {
            const point = radarPoint(value, index, radius, center);
            return (
              <circle key={AXES[index]} cx={point.x} cy={point.y} r={3} fill="#4f46e5" />
            );
          })}

        {presentation.labels &&
          AXES.map((axis, index) => {
            const point = axisLabelPoint(index, radius, center);
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
                fontSize={10}
                fontWeight={600}
                fill="#64748b"
              >
                {axis}
                {mode === "final" && !isGhost && (
                  <tspan fill="#4f46e5"> {labelValue(shape[index])}</tspan>
                )}
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
