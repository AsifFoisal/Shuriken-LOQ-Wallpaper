import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { bridgePath, computeLayout, SEGMENT_CENTERS, SEGMENT_HALF_SPAN, R_OUT, VB } from '../lib/geometry';
import type { AppEntry, Appearance, SegmentIndex } from '../lib/types';
import { useShuriken } from '../lib/store';
import AppIcon from './AppIcon';

interface Props {
  active: SegmentIndex | null;
  cx: number;
  cy: number;
  logoPx: number;
  vw: number;
  vh: number;
  appearance: Appearance;
  onEnterGroup: () => void;
  onLeaveGroup: () => void;
  onLaunched: () => void;
  onContext: (app: AppEntry, seg: SegmentIndex, x: number, y: number) => void;
}

function Reveal(props: Props) {
  return (
    <AnimatePresence>
      {props.active !== null && <Deck key={props.active} {...props} segment={props.active} />}
    </AnimatePresence>
  );
}

function Deck({ segment, cx, cy, logoPx, vw, vh, appearance: ap, onEnterGroup, onLeaveGroup, onLaunched, onContext }: Props & { segment: SegmentIndex }) {
  const { deckApps, displayName, launch, config } = useShuriken();
  const apps = deckApps(segment);
  const [launching, setLaunching] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const s = ap.iconSize;
  const speed = ap.animationSpeed;
  const labelsAlways = ap.labels === 'always';

  const slots = useMemo(
    () => computeLayout({ style: ap.revealStyle, segment, count: apps.length, cx, cy, logoPx, iconSize: s, labels: labelsAlways, vw, vh }),
    [ap.revealStyle, segment, apps.length, cx, cy, logoPx, s, labelsAlways, vw, vh],
  );

  const bridge = useMemo(() => {
    const rOut = (R_OUT * logoPx) / VB;
    const c = SEGMENT_CENTERS[segment];
    let maxR = rOut + s;
    let minA = c - SEGMENT_HALF_SPAN + 8;
    let maxA = c + SEGMENT_HALF_SPAN - 8;
    for (const p of slots) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      maxR = Math.max(maxR, d + s * 0.75 + (labelsAlways ? 20 : 0));
      const pad = ((s * 0.75) / Math.max(d, 1)) * (180 / Math.PI);
      let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
      while (a - c > 180) a -= 360;
      while (a - c < -180) a += 360;
      minA = Math.min(minA, a - pad);
      maxA = Math.max(maxA, a + pad);
    }
    return bridgePath(cx, cy, rOut + 2, maxR, minA, maxA);
  }, [slots, cx, cy, logoPx, s, segment, labelsAlways]);

  const fav = new Set(config.favorites);

  const handleLaunch = async (a: AppEntry) => {
    setLaunching(a.id);
    const ok = await launch(a);
    setTimeout(() => {
      setLaunching(null);
      if (ok) onLaunched();
    }, ok ? 520 : 300);
  };

  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        {/* invisible hover bridge — prevents flicker while travelling from segment to icons */}
        <path
          d={bridge}
          fill="transparent"
          style={{ pointerEvents: 'all' }}
          onPointerEnter={onEnterGroup}
          onPointerLeave={onLeaveGroup}
          onClick={(e) => e.stopPropagation()}
        />
        {ap.connectors &&
          slots.map((p, i) => {
            const dx = p.x - p.anchorX;
            const dy = p.y - p.anchorY;
            const len = Math.hypot(dx, dy) || 1;
            const ex = p.x - (dx / len) * (s / 2 + 4);
            const ey = p.y - (dy / len) * (s / 2 + 4);
            const hot = hoverId === apps[i]?.id;
            return (
              <motion.line
                key={i}
                x1={p.anchorX}
                y1={p.anchorY}
                x2={ex}
                y2={ey}
                stroke="#fff"
                strokeWidth={1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: hot ? 0.55 : 0.14 }}
                exit={{ pathLength: 0, opacity: 0, transition: { duration: 0.18 / speed } }}
                transition={{ duration: 0.45 / speed, delay: (i * 0.03) / speed }}
              />
            );
          })}
      </svg>

      {apps.map((a, i) => {
        const p = slots[i];
        if (!p) return null;
        const name = displayName(a);
        const showLabel = labelsAlways || hoverId === a.id;
        const isLaunching = launching === a.id;
        return (
          <motion.button
            key={a.id}
            type="button"
            className="nx-app group pointer-events-auto absolute flex items-center justify-center rounded-full"
            style={{ left: p.x, top: p.y, width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2 }}
            initial={{ x: p.startX - p.x, y: p.startY - p.y, scale: 0.15, opacity: 0 }}
            animate={{ x: 0, y: 0, scale: isLaunching ? 1.18 : 1, opacity: 1 }}
            exit={{
              x: p.startX - p.x,
              y: p.startY - p.y,
              scale: 0.15,
              opacity: 0,
              transition: { duration: 0.24 / speed, delay: ((apps.length - i) * 0.012) / speed, ease: [0.4, 0, 1, 1] },
            }}
            whileHover={{ scale: 1.13 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320 * speed, damping: 24, mass: 0.7, delay: (i * 0.035) / speed }}
            onPointerEnter={() => {
              onEnterGroup();
              setHoverId(a.id);
            }}
            onPointerLeave={() => {
              setHoverId((h) => (h === a.id ? null : h));
              onLeaveGroup();
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleLaunch(a);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContext(a, segment, e.clientX, e.clientY);
            }}
            title={name}
          >
            <span className={`nx-icon relative flex items-center justify-center text-white ${ap.monochrome ? 'nx-mono-icon' : ''}`}>
              <AppIcon app={a} size={s} />
            </span>
            {fav.has(a.id) && (
              <Star className="absolute -right-0.5 -top-0.5 fill-white text-white" style={{ width: s * 0.22, height: s * 0.22 }} />
            )}
            {isLaunching && (
              <motion.span
                className="absolute inset-0 rounded-full border border-white"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )}
            <AnimatePresence>
              {showLabel && (
                <motion.span
                  className="pointer-events-none absolute left-1/2 whitespace-nowrap text-[11px] font-light tracking-[0.12em] text-white/85"
                  style={{ top: s + 6, x: '-50%' }}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, delay: labelsAlways ? (i * 0.035) / speed + 0.15 : 0 }}
                >
                  {name}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

export default memo(Reveal);
