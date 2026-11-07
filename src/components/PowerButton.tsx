import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Power } from 'lucide-react';

const HOLD_MS = 1500;

interface Props {
  /** viewport center of the logo */
  cx: number;
  cy: number;
  /** hit-area diameter (the logo's hollow center) */
  diameter: number;
  /** hide the glyph while a deck is revealed — the deck label owns the center */
  veiled: boolean;
  onTrigger: () => void;
}

/**
 * Hold-to-confirm power button floating in the hollow middle of the logo.
 * Hovering lights a soft halo in the center; holding fills a red-hot ring
 * while shockwave pulses radiate out. Releasing early cancels everything,
 * so a stray click never triggers the registered power-off script.
 */
export default function PowerButton({ cx, cy, diameter, veiled, onTrigger }: Props) {
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const [fired, setFired] = useState(false);
  const raf = useRef(0);
  const holding = useRef(false);
  const startedAt = useRef(0);

  const cancel = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    cancelAnimationFrame(raf.current);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (!holding.current) return;
    const p = Math.min(1, (performance.now() - startedAt.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      holding.current = false;
      setProgress(0);
      setFired(true);
      window.setTimeout(() => setFired(false), 900);
      onTrigger();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [onTrigger]);

  // Escape / losing the window always aborts a pending hold
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    const onBlur = () => cancel();
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      cancelAnimationFrame(raf.current);
    };
  }, [cancel]);

  const active = progress > 0;
  const r = diameter / 2 - 3;
  const circ = 2 * Math.PI * r;
  const icon = Math.max(18, diameter * 0.14);

  return (
    <div
      className="absolute flex items-center justify-center rounded-full"
      style={{ left: cx - diameter / 2, top: cy - diameter / 2, width: diameter, height: diameter, cursor: 'pointer', touchAction: 'none' }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        cancel();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* capture is best-effort; release handlers still cancel */
        }
        holding.current = true;
        startedAt.current = performance.now();
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        cancel();
      }}
      onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      title="Hold to power off"
    >
      {/* idle hover halo */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: -diameter * 0.2,
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.025) 45%, transparent 70%)',
          opacity: hover && !active ? 1 : 0,
          transition: 'opacity .45s ease',
        }}
      />
      {/* charge halo — grows hot with progress */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: -diameter * 0.26,
          background: `radial-gradient(circle, rgba(255,96,96,${0.1 + 0.12 * progress}) 0%, rgba(255,60,60,${0.04 + 0.05 * progress}) 45%, transparent 70%)`,
          opacity: active ? 1 : 0,
          transform: `scale(${0.82 + 0.3 * progress})`,
          transition: holding.current ? 'opacity .2s' : 'opacity .45s ease, transform .45s ease',
        }}
      />
      {/* shockwave pulses while charging */}
      {active &&
        [0, 0.45].map((delay) => (
          <motion.span
            key={delay}
            className="pointer-events-none absolute inset-0 rounded-full border border-red-300/50"
            initial={{ scale: 0.72, opacity: 0.55 }}
            animate={{ scale: 1.22, opacity: 0 }}
            transition={{ duration: 0.9, repeat: Infinity, delay, ease: 'easeOut' }}
          />
        ))}
      {/* final flash when the hold completes */}
      {fired && (
        <motion.span
          className="pointer-events-none absolute inset-[-30%] rounded-full bg-red-400/25"
          initial={{ opacity: 1, scale: 0.85 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}

      <svg width={diameter} height={diameter} className="pointer-events-none absolute inset-0 -rotate-90">
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={2}
          style={{ opacity: hover || active ? 1 : 0, transition: 'opacity .3s' }}
        />
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={r}
          fill="none"
          stroke={active ? 'rgba(255,115,115,0.95)' : 'rgba(255,255,255,0.3)'}
          strokeWidth={active ? 2.5 : 2}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          style={{
            opacity: hover || active ? 1 : 0,
            filter: active ? `drop-shadow(0 0 ${3 + 5 * progress}px rgba(255,90,90,0.7))` : 'none',
            transition: holding.current ? 'opacity .3s' : 'stroke-dashoffset .25s ease, stroke .3s, opacity .3s',
          }}
        />
      </svg>

      <motion.div
        animate={{ scale: 1 + progress * 0.2 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        style={{
          filter: active
            ? `drop-shadow(0 0 ${(5 + 12 * progress).toFixed(1)}px rgba(255,90,90,${(0.45 + 0.4 * progress).toFixed(2)}))`
            : hover
              ? 'drop-shadow(0 0 9px rgba(255,255,255,0.35))'
              : 'none',
        }}
      >
        <Power
          className="transition-opacity duration-300"
          style={{
            width: icon,
            height: icon,
            strokeWidth: 1.5,
            opacity: veiled ? 0 : active ? 1 : hover ? 0.8 : 0,
            color: active ? 'rgb(255,140,140)' : '#fff',
          }}
        />
      </motion.div>
    </div>
  );
}
