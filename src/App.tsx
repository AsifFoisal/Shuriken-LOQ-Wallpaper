import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings2, WifiOff } from 'lucide-react';
import { ShurikenProvider, useShuriken } from './lib/store';
import { useReveal } from './hooks/useReveal';
import Logo from './components/Logo';
import Reveal from './components/Reveal';
import ContextMenu, { type MenuState } from './components/ContextMenu';
import { IconDialog, RenameDialog } from './components/Dialogs';
import Settings from './components/Settings';
import type { AppEntry, SegmentIndex } from './lib/types';

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return vp;
}

function matchShortcut(e: KeyboardEvent, combo: string) {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  return (
    e.ctrlKey === parts.includes('ctrl') &&
    e.altKey === parts.includes('alt') &&
    e.shiftKey === parts.includes('shift') &&
    e.metaKey === parts.includes('meta') &&
    e.key.toLowerCase() === key
  );
}

function Wallpaper() {
  const { config, backend, toasts, deckApps, accent } = useShuriken();
  const ap = config.appearance;
  const { w, h } = useViewport();
  const reveal = useReveal(ap.hoverIntent, ap.closeDelay);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<AppEntry | null>(null);
  const [iconing, setIconing] = useState<AppEntry | null>(null);
  const [settings, setSettings] = useState<{ open: boolean; seg?: SegmentIndex }>({ open: false });
  const [chrome, setChrome] = useState(false);
  const chromeT = useRef<number | undefined>(undefined);

  const logoPx = Math.round((Math.min(w, h) * ap.logoSize) / 100);
  const cx = w / 2 + (ap.offsetX / 100) * w;
  const cy = h / 2 + (ap.offsetY / 100) * h;

  const overlayOpen = !!menu || !!renaming || !!iconing || settings.open;
  useEffect(() => reveal.setLocked(overlayOpen), [overlayOpen, reveal.setLocked]);

  // Discreet chrome (gear + status) appears on mouse movement
  const poke = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeT.current);
    chromeT.current = window.setTimeout(() => setChrome(false), 2600);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, config.shortcut)) {
        e.preventDefault();
        setSettings((s) => ({ open: !s.open }));
        return;
      }
      if (e.key === 'Escape') {
        if (menu) setMenu(null);
        else if (renaming || iconing) {
          setRenaming(null);
          setIconing(null);
        } else if (settings.open) setSettings({ open: false });
        else reveal.close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config.shortcut, menu, renaming, iconing, settings.open, reveal.close]);

  const activeDeck = reveal.active !== null ? config.decks[reveal.active] : null;
  const activeCount = reveal.active !== null ? deckApps(reveal.active).length : 0;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-black"
      onPointerMove={poke}
      onClick={() => reveal.close()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* soft ambient light behind the active segment */}
      <div
        className="pointer-events-none absolute rounded-full transition-opacity duration-700"
        style={{
          left: cx - logoPx,
          top: cy - logoPx,
          width: logoPx * 2,
          height: logoPx * 2,
          opacity: reveal.active !== null ? 1 : 0,
          background: 'radial-gradient(circle, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 35%, transparent 65%)',
        }}
      />

      {/* Logo */}
      <div className="absolute" style={{ left: cx - logoPx / 2, top: cy - logoPx / 2, width: logoPx, height: logoPx }}>
        <Logo
          size={logoPx}
          strokeWidth={ap.strokeWidth}
          hitPadding={ap.hoverPadding}
          active={reveal.active}
          hovered={reveal.hovered}
          glow={ap.glow}
          breathing={ap.breathing}
          speed={ap.animationSpeed}
          accent={accent}
          onEnter={reveal.enterSegment}
          onLeave={reveal.leaveSegment}
          onSegmentClick={reveal.clickSegment}
          onSegmentContext={(i, e) => {
            e.preventDefault();
            e.stopPropagation();
            setSettings({ open: true, seg: i });
          }}
        />
      </div>

      {/* Deck name inside the hollow center (only while revealed) */}
      <AnimatePresence mode="wait">
        {activeDeck && (
          <motion.div
            key={reveal.active}
            className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
            style={{ left: cx, top: cy, width: logoPx * 0.42, x: '-50%', y: '-50%' }}
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.18 } }}
            transition={{ duration: 0.35 / ap.animationSpeed }}
          >
            <span className="font-light uppercase text-white/85" style={{ fontSize: Math.max(10, logoPx * 0.028), letterSpacing: '0.38em', paddingLeft: '0.38em' }}>
              {activeDeck.name}
            </span>
            <span className="mt-2 text-white/35" style={{ fontSize: Math.max(9, logoPx * 0.018), letterSpacing: '0.25em' }}>
              {activeCount ? `${String(activeCount).padStart(2, '0')} APPS` : 'EMPTY · RIGHT-CLICK SEGMENT'}
              {reveal.pinned ? ' · PINNED' : ''}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <Reveal
        active={reveal.active}
        cx={cx}
        cy={cy}
        logoPx={logoPx}
        vw={w}
        vh={h}
        appearance={ap}
        onEnterGroup={reveal.enterGroup}
        onLeaveGroup={reveal.leaveGroup}
        onLaunched={reveal.close}
        onContext={(app, segment, x, y) => setMenu({ app, segment, x, y })}
      />

      {/* Discreet chrome */}
      <div
        className={`absolute bottom-5 right-5 flex items-center gap-3 transition-opacity duration-500 ${chrome || settings.open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {backend === 'offline' && (
          <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.2em] text-red-300/70" title="Companion service unreachable: launching disabled">
            <WifiOff className="h-3.5 w-3.5" /> Offline
          </span>
        )}
        <button
          type="button"
          onClick={() => setSettings({ open: true })}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:rotate-45 hover:border-white/50 hover:text-white"
          aria-label="Open settings"
          title={`Settings (${config.shortcut})`}
        >
          <Settings2 className="h-4 w-4" strokeWidth={1.4} />
        </button>
      </div>

      {/* Permanent but tiny offline indicator */}
      {backend === 'offline' && !chrome && <span className="pointer-events-none absolute bottom-6 right-6 h-1.5 w-1.5 rounded-full bg-red-400/50" />}

      {/* Toasts */}
      <div className="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              className={`nx-glass max-w-[70vw] truncate rounded-full px-4 py-1.5 text-[12px] tracking-wide ${
                t.tone === 'error' ? 'text-red-200' : t.tone === 'warn' ? 'text-amber-100' : t.tone === 'success' ? 'text-white' : 'text-white/80'
              }`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <AnimatePresence>
          {settings.open && (
            <Settings
              key="settings"
              initialSegment={settings.seg}
              onClose={() => setSettings({ open: false })}
              onRename={setRenaming}
              onChangeIcon={setIconing}
            />
          )}
        </AnimatePresence>
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} onRename={setRenaming} onChangeIcon={setIconing} />}
        {renaming && <RenameDialog app={renaming} onClose={() => setRenaming(null)} />}
        {iconing && <IconDialog app={iconing} onClose={() => setIconing(null)} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ShurikenProvider>
      <Wallpaper />
    </ShurikenProvider>
  );
}
