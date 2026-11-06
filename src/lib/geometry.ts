import type { RevealStyle, SegmentIndex } from './types';

/**
 * Logo geometry (viewBox 0 0 1000 1000).
 * Three equal annular segments separated by parallel-sided gaps around a hollow center.
 * Tweak these constants to match the reference artwork exactly.
 */
export const VB = 1000;
export const C = 500;
export const R_OUT = 400;
export const R_IN = 258;
export const GAP = 36;

/** Center angle of each segment (degrees, SVG coords: 0 = right, 90 = down). */
export const SEGMENT_CENTERS: Record<SegmentIndex, number> = { 0: -90, 1: 30, 2: 150 };
export const SEGMENT_HALF_SPAN = 60;
export const SEGMENT_LABELS = ['Upper segment', 'Lower-right segment', 'Lower-left segment'];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function polar(angleDeg: number, r: number, cx = C, cy = C) {
  return { x: cx + r * Math.cos(rad(angleDeg)), y: cy + r * Math.sin(rad(angleDeg)) };
}

/** Angle at radius r of the edge line offset by GAP/2 from the gap ray. */
const edgeOffset = (r: number) => deg(Math.asin(GAP / 2 / r));

export function segmentAngles(i: SegmentIndex) {
  const c = SEGMENT_CENTERS[i];
  const g1 = c - SEGMENT_HALF_SPAN;
  const g2 = c + SEGMENT_HALF_SPAN;
  return {
    outerStart: g1 + edgeOffset(R_OUT),
    outerEnd: g2 - edgeOffset(R_OUT),
    innerStart: g1 + edgeOffset(R_IN),
    innerEnd: g2 - edgeOffset(R_IN),
  };
}

export function segmentPath(i: SegmentIndex, rOut = R_OUT, rIn = R_IN) {
  const a = segmentAngles(i);
  const p1 = polar(a.outerStart, rOut);
  const p2 = polar(a.outerEnd, rOut);
  const p3 = polar(a.innerEnd, rIn);
  const p4 = polar(a.innerStart, rIn);
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(p1.x)} ${f(p1.y)}`,
    `A ${rOut} ${rOut} 0 0 1 ${f(p2.x)} ${f(p2.y)}`,
    `L ${f(p3.x)} ${f(p3.y)}`,
    `A ${rIn} ${rIn} 0 0 0 ${f(p4.x)} ${f(p4.y)}`,
    'Z',
  ].join(' ');
}

/* ------------------------------------------------------------------ reveal layout (screen px) */

export interface IconSlot {
  x: number;
  y: number;
  angle: number;
  startX: number;
  startY: number;
  anchorX: number;
  anchorY: number;
}

interface LayoutInput {
  style: RevealStyle;
  segment: SegmentIndex;
  count: number;
  cx: number;
  cy: number;
  logoPx: number;
  iconSize: number;
  labels: boolean;
  vw: number;
  vh: number;
}

export function computeLayout(o: LayoutInput): IconSlot[] {
  const k = o.logoPx / VB;
  const rOut = R_OUT * k;
  const rMid = ((R_OUT + R_IN) / 2) * k;
  const center = SEGMENT_CENTERS[o.segment];
  const half = SEGMENT_HALF_SPAN - 6;
  const s = o.iconSize;
  const spacing = s * (o.labels ? 1.75 : 1.5);
  const ringGap = s * 1.35 + (o.labels ? 18 : 0);
  const r0 = rOut + s * 0.85 + 22;
  const polarAngles: { a: number; r: number }[] = [];

  if (o.style === 'arc') {
    let placed = 0;
    let ring = 0;
    while (placed < o.count) {
      const r = r0 + ring * ringGap;
      const step = deg(spacing / r);
      const cap = Math.max(1, Math.floor((half * 2) / step) + 1);
      const m = Math.min(cap, o.count - placed);
      const total = (m - 1) * step;
      for (let j = 0; j < m; j++) polarAngles.push({ a: center - total / 2 + j * step, r });
      placed += m;
      ring++;
    }
  } else if (o.style === 'fan') {
    const n = o.count;
    const span = Math.min(half * 2 + 20, deg((spacing * 0.62 * Math.max(n - 1, 0)) / r0) || 0);
    const step = n > 1 ? span / (n - 1) : 0;
    for (let j = 0; j < n; j++) {
      const r = r0 + (j % 2) * s * 1.05 + Math.floor(j / 12) * ringGap * 1.4;
      polarAngles.push({ a: center - span / 2 + j * step, r });
    }
  } else {
    // spiral: radius grows with each item, angles evenly spaced by arc length
    let a = 0;
    for (let j = 0; j < o.count; j++) {
      const r = r0 + j * s * 0.32;
      polarAngles.push({ a, r });
      a += deg(spacing / r);
    }
    const mid = polarAngles.length ? (polarAngles[0].a + polarAngles[polarAngles.length - 1].a) / 2 : 0;
    polarAngles.forEach((p) => (p.a = p.a - mid + center));
  }

  const margin = s / 2 + 10;
  const bottomMargin = margin + (o.labels ? 20 : 0);
  return polarAngles.map(({ a, r }) => {
    const p = polar(a, r, o.cx, o.cy);
    const x = Math.min(o.vw - margin, Math.max(margin, p.x));
    const y = Math.min(o.vh - bottomMargin, Math.max(margin, p.y));
    const clampedA = Math.max(center - half, Math.min(center + half, a));
    const start = polar(clampedA, rMid, o.cx, o.cy);
    const anchor = polar(clampedA, rOut + 4, o.cx, o.cy);
    return { x, y, angle: a, startX: start.x, startY: start.y, anchorX: anchor.x, anchorY: anchor.y };
  });
}

/** Annular sector path (screen px) used as a hover "bridge" between a segment and its icons. */
export function bridgePath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const p1 = polar(a1, r1, cx, cy);
  const p2 = polar(a1, r2, cx, cy);
  const p3 = polar(a2, r2, cx, cy);
  const p4 = polar(a2, r1, cx, cy);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r2} ${r2} 0 ${large} 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${r1} ${r1} 0 ${large} 0 ${p1.x} ${p1.y} Z`;
}
