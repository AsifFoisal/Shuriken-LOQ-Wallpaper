import { memo } from 'react';
import { motion } from 'framer-motion';
import { C, GAP, R_IN, R_OUT, SEGMENT_CENTERS, polar, segmentPath, VB } from '../lib/geometry';
import type { SegmentIndex } from '../lib/types';

const PATHS = ([0, 1, 2] as SegmentIndex[]).map((i) => segmentPath(i));

interface Props {
  size: number;
  strokeWidth: number;
  hitPadding: number;
  active: SegmentIndex | null;
  hovered: SegmentIndex | null;
  glow: boolean;
  breathing: boolean;
  speed: number;
  interactive?: boolean;
  onEnter?: (i: SegmentIndex) => void;
  onLeave?: (i: SegmentIndex) => void;
  onSegmentClick?: (i: SegmentIndex) => void;
  onSegmentContext?: (i: SegmentIndex, e: React.MouseEvent) => void;
}

function Logo({
  size, strokeWidth, hitPadding, active, hovered, glow, breathing, speed, interactive = true,
  onEnter, onLeave, onSegmentClick, onSegmentContext,
}: Props) {
  const k = size / VB;
  // padding in viewBox units (stroke extends on both sides of the outline)
  // clamp so neighbouring hit areas never overlap across the gap
  const hitStroke = Math.max(0.01, Math.min((hitPadding * 2) / k, GAP - 6));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VB} ${VB}`}
      className="block overflow-visible"
      style={{ pointerEvents: 'none' }}
      aria-label="Shuriken launcher logo"
    >
      <defs>
        <radialGradient id="nx-fill" cx="50%" cy="50%" r="50%">
          <stop offset={`${(R_IN / R_OUT) * 100 * 0.8}%`} stopColor="#fff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.09" />
        </radialGradient>
      </defs>

      <g className={breathing && active === null ? 'nx-breathe' : undefined}>
        {PATHS.map((d, idx) => {
          const i = idx as SegmentIndex;
          const on = active === i;
          const hov = hovered === i && !on;
          const push = on ? 14 : hov ? 6 : 0;
          const off = polar(SEGMENT_CENTERS[i], push, 0, 0);
          return (
            <motion.g
              key={i}
              initial={false}
              animate={{ x: off.x, y: off.y }}
              transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.8 / speed }}
              style={{ filter: on && glow ? 'drop-shadow(0 0 10px rgba(255,255,255,.45))' : undefined }}
            >
              <motion.path
                d={d}
                initial={false}
                animate={{
                  fillOpacity: on ? 1 : hov ? 0.5 : 0,
                  strokeOpacity: on ? 1 : hov ? 1 : 0.92,
                }}
                transition={{ duration: 0.35 / speed }}
                fill="url(#nx-fill)"
                stroke="#fff"
                strokeWidth={strokeWidth}
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
              {on && (
                <motion.path
                  d={d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={strokeWidth * 0.6}
                  vectorEffect="non-scaling-stroke"
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: 1, opacity: 0 }}
                  transition={{ duration: 0.9 / speed, ease: 'easeOut' }}
                />
              )}
            </motion.g>
          );
        })}
      </g>

      {/* Hit areas — separated from visible paths, matching the exact segment geometry */}
      {interactive &&
        PATHS.map((d, idx) => {
          const i = idx as SegmentIndex;
          return (
            <path
              key={`hit-${i}`}
              d={d}
              fill="transparent"
              stroke="transparent"
              strokeWidth={hitStroke}
              strokeLinejoin="round"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              data-segment={i}
              onPointerEnter={() => onEnter?.(i)}
              onPointerLeave={() => onLeave?.(i)}
              onClick={(e) => {
                e.stopPropagation();
                onSegmentClick?.(i);
              }}
              onContextMenu={(e) => onSegmentContext?.(i, e)}
            />
          );
        })}
      <circle cx={C} cy={C} r={1} fill="none" />
    </svg>
  );
}

export default memo(Logo);
