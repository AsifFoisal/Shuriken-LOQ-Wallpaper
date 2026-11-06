import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackendClient } from './api';
import { DEMO_APPS, defaultConfig, seedDecks, DEFAULT_APPEARANCE } from './defaults';
import { accentFor, type Accent } from './thermal';
import type { AppEntry, Appearance, AppOverride, BackendState, Deck, ShurikenConfig, SegmentIndex } from './types';

const LS_KEY = 'shuriken.config.v1';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

interface Store {
  config: ShurikenConfig;
  apps: AppEntry[];
  appsById: Map<string, AppEntry>;
  backend: BackendState;
  backendInfo: { version?: string; lastScan?: string | null; appCount?: number };
  thermal: { supported: boolean; mode: string | null };
  accent: Accent;
  scanning: boolean;
  toasts: Toast[];
  client: BackendClient;
  toast: (text: string, tone?: Toast['tone']) => void;
  update: (fn: (c: ShurikenConfig) => ShurikenConfig) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  setDeck: (i: SegmentIndex, patch: Partial<Deck>) => void;
  addToDeck: (i: SegmentIndex, id: string) => void;
  removeFromDeck: (i: SegmentIndex, id: string) => void;
  moveToDeck: (from: SegmentIndex, to: SegmentIndex, id: string) => void;
  moveInDeck: (i: SegmentIndex, id: string, dir: -1 | 1) => void;
  setOverride: (id: string, patch: AppOverride) => void;
  toggleFavorite: (id: string) => void;
  displayName: (app: AppEntry) => string;
  deckApps: (i: SegmentIndex) => AppEntry[];
  launch: (app: AppEntry) => Promise<boolean>;
  reveal: (app: AppEntry) => Promise<void>;
  scan: (forceIcons?: boolean) => Promise<void>;
  checkBackend: () => Promise<boolean>;
  saveNow: () => Promise<void>;
  resetLayout: () => void;
  resetAll: () => void;
  importConfig: (c: ShurikenConfig) => void;
}

const Ctx = createContext<Store | null>(null);

function loadLocal(): ShurikenConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return defaultConfig();
}

function normalize(c: Partial<ShurikenConfig>): ShurikenConfig {
  const d = defaultConfig();
  const decks = (Array.isArray(c.decks) && c.decks.length === 3 ? c.decks : d.decks).map((dk, i) => ({
    name: typeof dk?.name === 'string' ? dk.name : d.decks[i].name,
    appIds: Array.isArray(dk?.appIds) ? dk.appIds.filter((x) => typeof x === 'string') : d.decks[i].appIds,
    maxApps: Number(dk?.maxApps) || 12,
  })) as ShurikenConfig['decks'];
  return {
    ...d,
    ...c,
    version: 1,
    decks,
    overrides: c.overrides && typeof c.overrides === 'object' ? c.overrides : {},
    favorites: Array.isArray(c.favorites) ? c.favorites : [],
    appearance: { ...DEFAULT_APPEARANCE, ...(c.appearance || {}) },
  };
}

export function ShurikenProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ShurikenConfig>(loadLocal);
  const [realApps, setRealApps] = useState<AppEntry[]>([]);
  const [backend, setBackend] = useState<BackendState>('connecting');
  const [backendInfo, setBackendInfo] = useState<Store['backendInfo']>({});
  const [scanning, setScanning] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const client = useMemo(() => new BackendClient(config.backendUrl), [config.backendUrl]);
  const configRef = useRef(config);
  configRef.current = config;
  const remoteSynced = useRef(false);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const update = useCallback((fn: (c: ShurikenConfig) => ShurikenConfig) => {
    setConfig((c) => ({ ...fn(c), updatedAt: Date.now() }));
  }, []);

  // ---------------------------------------------------------------- persistence
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(config));
      } catch {
        /* quota */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [config]);

  useEffect(() => {
    if (backend !== 'online' || !remoteSynced.current || config.updatedAt === 0) return;
    const t = setTimeout(() => client.saveConfig(config).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [config, backend, client]);

  // ---------------------------------------------------------------- apps
  const applyApps = useCallback(
    (list: AppEntry[]) => {
      setRealApps(list);
      const c = configRef.current;
      if (list.length && !c.autoSeeded) {
        const seeded = seedDecks(list);
        update((cur) => ({
          ...cur,
          autoSeeded: true,
          decks: cur.decks.map((d, i) => ({
            ...d,
            // keep any non-demo ids the user already added, replace demo placeholders
            appIds: [...d.appIds.filter((x) => !x.startsWith('demo-')), ...seeded[i]].filter((x, j, arr) => arr.indexOf(x) === j),
          })) as ShurikenConfig['decks'],
        }));
      }
    },
    [update],
  );

  const checkBackend = useCallback(async () => {
    try {
      const s = await client.status();
      setBackendInfo({ version: s.version, lastScan: s.lastScan, appCount: s.appCount });
      setScanning(s.scanning);
      if (backend !== 'online') {
        setBackend('online');
        if (!remoteSynced.current) {
          const remote = await client.getConfig().catch(() => null);
          if (remote && Array.isArray(remote.decks) && (remote.updatedAt || 0) > configRef.current.updatedAt) {
            setConfig(normalize(remote));
          }
          remoteSynced.current = true;
        }
        const r = await client.apps();
        applyApps(r.apps);
      }
      return true;
    } catch {
      setBackend('offline');
      return false;
    }
  }, [client, backend, applyApps]);

  useEffect(() => {
    remoteSynced.current = false;
    setBackend('connecting');
  }, [client]);

  useEffect(() => {
    checkBackend();
    const t = setInterval(checkBackend, backend === 'online' ? 20000 : 6000);
    return () => clearInterval(t);
  }, [checkBackend, backend]);

  // Thermal mode (Fn+Q power mode) — live SSE push, slow poll only as a fallback
  const [thermal, setThermal] = useState<{ supported: boolean; mode: string | null }>({ supported: false, mode: null });
  useEffect(() => {
    if (backend !== 'online') return;
    let alive = true;
    const apply = (t: { supported?: boolean; mode?: string | null }) => {
      if (alive) setThermal({ supported: !!t.supported, mode: t.mode ?? null });
    };
    let es: EventSource | null = null;
    try {
      es = new EventSource(client.base + '/api/thermal/stream');
      es.onmessage = (e) => { try { apply(JSON.parse(e.data)); } catch { /* partial frame */ } };
    } catch { /* EventSource unavailable — polling covers it */ }
    const tick = async () => {
      const t = await client.thermal().catch(() => null);
      if (t) apply(t);
    };
    tick();
    const iv = window.setInterval(tick, 4000);
    return () => { alive = false; es?.close(); clearInterval(iv); };
  }, [backend, client]);

  const usingDemo = realApps.length === 0;
  const apps = useMemo(() => (usingDemo ? DEMO_APPS : realApps), [usingDemo, realApps]);
  const appsById = useMemo(() => {
    const m = new Map<string, AppEntry>();
    // demo apps remain resolvable so default decks render before the backend connects
    DEMO_APPS.forEach((a) => m.set(a.id, a));
    realApps.forEach((a) => m.set(a.id, a));
    return m;
  }, [realApps]);

  const displayName = useCallback((a: AppEntry) => config.overrides[a.id]?.name || a.name, [config.overrides]);

  const deckApps = useCallback(
    (i: SegmentIndex) => {
      const d = config.decks[i];
      let list = d.appIds.map((id) => appsById.get(id)).filter((a): a is AppEntry => !!a);
      if (!usingDemo) list = list.filter((a) => !a.demo);
      if (config.appearance.favoritesFirst) {
        const fav = new Set(config.favorites);
        list = [...list.filter((a) => fav.has(a.id)), ...list.filter((a) => !fav.has(a.id))];
      }
      return list.slice(0, d.maxApps);
    },
    [config, appsById, usingDemo],
  );

  // ---------------------------------------------------------------- actions
  const setAppearance = useCallback((p: Partial<Appearance>) => update((c) => ({ ...c, appearance: { ...c.appearance, ...p } })), [update]);
  const setDeck = useCallback(
    (i: SegmentIndex, p: Partial<Deck>) =>
      update((c) => ({ ...c, decks: c.decks.map((d, j) => (j === i ? { ...d, ...p } : d)) as ShurikenConfig['decks'] })),
    [update],
  );
  const addToDeck = useCallback(
    (i: SegmentIndex, id: string) =>
      update((c) => ({
        ...c,
        decks: c.decks.map((d, j) => (j === i && !d.appIds.includes(id) ? { ...d, appIds: [...d.appIds, id] } : d)) as ShurikenConfig['decks'],
      })),
    [update],
  );
  const removeFromDeck = useCallback(
    (i: SegmentIndex, id: string) =>
      update((c) => ({ ...c, decks: c.decks.map((d, j) => (j === i ? { ...d, appIds: d.appIds.filter((x) => x !== id) } : d)) as ShurikenConfig['decks'] })),
    [update],
  );
  const moveToDeck = useCallback(
    (from: SegmentIndex, to: SegmentIndex, id: string) =>
      update((c) => ({
        ...c,
        decks: c.decks.map((d, j) => {
          if (j === from) return { ...d, appIds: d.appIds.filter((x) => x !== id) };
          if (j === to && !d.appIds.includes(id)) return { ...d, appIds: [...d.appIds, id] };
          return d;
        }) as ShurikenConfig['decks'],
      })),
    [update],
  );
  const moveInDeck = useCallback(
    (i: SegmentIndex, id: string, dir: -1 | 1) =>
      update((c) => ({
        ...c,
        decks: c.decks.map((d, j) => {
          if (j !== i) return d;
          const ids = [...d.appIds];
          const k = ids.indexOf(id);
          const n = k + dir;
          if (k < 0 || n < 0 || n >= ids.length) return d;
          [ids[k], ids[n]] = [ids[n], ids[k]];
          return { ...d, appIds: ids };
        }) as ShurikenConfig['decks'],
      })),
    [update],
  );
  const setOverride = useCallback(
    (id: string, p: AppOverride) =>
      update((c) => {
        const next = { ...(c.overrides[id] || {}), ...p };
        (Object.keys(next) as (keyof AppOverride)[]).forEach((k) => next[k] === undefined && delete next[k]);
        return { ...c, overrides: { ...c.overrides, [id]: next } };
      }),
    [update],
  );
  const toggleFavorite = useCallback(
    (id: string) =>
      update((c) => ({ ...c, favorites: c.favorites.includes(id) ? c.favorites.filter((x) => x !== id) : [...c.favorites, id] })),
    [update],
  );

  const launch = useCallback(
    async (a: AppEntry) => {
      const name = displayName(a);
      if (a.demo || backend !== 'online') {
        toast(backend !== 'online' ? `Companion offline: can't launch ${name}` : `${name} is a demo entry. Scan to load your real apps.`, 'warn');
        return false;
      }
      try {
        await client.launch(a.id);
        toast(`Launching ${name}`, 'success');
        return true;
      } catch (e) {
        toast(`Couldn't launch ${name}: ${(e as Error).message}`, 'error');
        return false;
      }
    },
    [backend, client, displayName, toast],
  );

  const reveal = useCallback(
    async (a: AppEntry) => {
      if (backend !== 'online' || a.demo) {
        toast(a.location ? a.location : 'Location is available only when the companion service is online', 'warn');
        return;
      }
      try {
        const r = await client.reveal(a.id);
        toast(r.location || 'Opened in Explorer', 'info');
      } catch (e) {
        toast((e as Error).message + (a.location ? ` (${a.location})` : ''), 'error');
      }
    },
    [backend, client, toast],
  );

  const scan = useCallback(
    async (forceIcons = false) => {
      if (backend !== 'online') {
        toast('Companion service is offline', 'warn');
        return;
      }
      setScanning(true);
      try {
        const r = await client.scan(forceIcons);
        applyApps(r.apps);
        setBackendInfo((b) => ({ ...b, lastScan: r.lastScan, appCount: r.apps.length }));
        toast(`Scan complete: ${r.apps.length} applications`, 'success');
      } catch (e) {
        toast(`Scan failed: ${(e as Error).message}`, 'error');
      } finally {
        setScanning(false);
      }
    },
    [backend, client, applyApps, toast],
  );

  const saveNow = useCallback(async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(configRef.current));
    if (backend === 'online') {
      try {
        await client.saveConfig(configRef.current);
        toast('Configuration saved', 'success');
      } catch {
        toast('Saved locally (backend save failed)', 'warn');
      }
    } else toast('Saved locally', 'success');
  }, [backend, client, toast]);

  const resetLayout = useCallback(() => update((c) => ({ ...c, appearance: { ...DEFAULT_APPEARANCE } })), [update]);
  const resetAll = useCallback(() => {
    const d = defaultConfig();
    if (realApps.length) {
      const seeded = seedDecks(realApps);
      d.decks = d.decks.map((dk, i) => ({ ...dk, appIds: seeded[i] })) as ShurikenConfig['decks'];
      d.autoSeeded = true;
    }
    update(() => ({ ...d, backendUrl: configRef.current.backendUrl }));
  }, [update, realApps]);
  const importConfig = useCallback((c: ShurikenConfig) => update(() => normalize(c)), [update]);

  const accent = useMemo(
    () => accentFor(config.appearance.thermalSync ? thermal.mode : null),
    [config.appearance.thermalSync, thermal.mode],
  );

  const value: Store = {
    config, apps, appsById, backend, backendInfo, thermal, accent, scanning, toasts, client,
    toast, update, setAppearance, setDeck, addToDeck, removeFromDeck, moveToDeck, moveInDeck,
    setOverride, toggleFavorite, displayName, deckApps, launch, reveal, scan, checkBackend,
    saveNow, resetLayout, resetAll, importConfig,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShuriken() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useShuriken outside provider');
  return c;
}
