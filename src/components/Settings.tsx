import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import {
  ArrowDown, ArrowUp, Download, FolderPlus, GripVertical, Image as ImageIcon, Keyboard, LayoutGrid, Library, Palette,
  Pencil, PinOff, Plus, RefreshCw, RotateCcw, Save, Search, Server, Star, Trash2, Upload, X,
} from 'lucide-react';
import type { AppEntry, ShurikenConfig, SegmentIndex } from '../lib/types';
import { useShuriken } from '../lib/store';
import { SEGMENT_LABELS } from '../lib/geometry';
import Logo from './Logo';
import AppIcon from './AppIcon';
import FilePicker from './FilePicker';
import { Row, Section, Segmented, Slider, Toggle } from './ui';

type Tab = 'decks' | 'library' | 'appearance' | 'general';

interface Props {
  onClose: () => void;
  onRename: (a: AppEntry) => void;
  onChangeIcon: (a: AppEntry) => void;
  initialSegment?: SegmentIndex;
}

export default function Settings({ onClose, onRename, onChangeIcon, initialSegment = 0 }: Props) {
  const [tab, setTab] = useState<Tab>('decks');
  const [seg, setSeg] = useState<SegmentIndex>(initialSegment);
  // which target the file picker pins into: a segment index, or the library (pin only)
  const [picker, setPicker] = useState<SegmentIndex | 'library' | null>(null);
  const { config, resolvePins, addToDeck, toast } = useShuriken();

  const handlePick = async (paths: string[]): Promise<boolean> => {
    const target = picker;
    const entries = await resolvePins(paths);
    if (!entries.length) return false;
    if (target !== 'library') {
      entries.forEach((e) => addToDeck(target as SegmentIndex, e.id));
      toast(`Pinned ${entries.length} item${entries.length > 1 ? 's' : ''} to ${config.decks[target as SegmentIndex].name}`, 'success');
    } else {
      toast(`Pinned ${entries.length} item${entries.length > 1 ? 's' : ''} — assign them from the Library`, 'success');
    }
    return true;
  };

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'decks', label: 'Decks', icon: LayoutGrid },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'general', label: 'General', icon: Server },
  ];
  return (
    <motion.div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <motion.div
        className="nx-glass flex h-[min(760px,92vh)] w-[min(1080px,96vw)] overflow-hidden rounded-2xl"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <nav className="flex w-52 shrink-0 flex-col border-r border-white/[0.07] p-4">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <Logo size={22} strokeWidth={1.2} hitPadding={0} active={null} hovered={null} glow={false} breathing={false} speed={1} interactive={false} />
            <span className="text-[13px] font-light tracking-[0.35em] text-white">SHURIKEN</span>
          </div>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'}`}
            >
              <t.icon className="h-4 w-4" strokeWidth={1.5} /> {t.label}
            </button>
          ))}
          <div className="mt-auto px-2 text-[10.5px] leading-relaxed text-white/30">The wallpaper is the interface. The logo is the launcher.</div>
        </nav>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close settings">
            <X className="h-4 w-4" />
          </button>
          <div className="nx-scroll flex-1 overflow-y-auto p-7">
            {tab === 'decks' && <DecksTab seg={seg} setSeg={setSeg} onRename={onRename} onChangeIcon={onChangeIcon} onPinFiles={() => setPicker(seg)} />}
            {tab === 'library' && <LibraryTab onRename={onRename} onChangeIcon={onChangeIcon} onPinFiles={() => setPicker('library')} />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'general' && <GeneralTab />}
          </div>
        </div>
      </motion.div>
      {picker !== null && <FilePicker onClose={() => setPicker(null)} onPick={handlePick} />}
    </motion.div>
  );
}

/* ================================================================== Decks */

function DecksTab({ seg, setSeg, onRename, onChangeIcon, onPinFiles }: { seg: SegmentIndex; setSeg: (s: SegmentIndex) => void; onRename: (a: AppEntry) => void; onChangeIcon: (a: AppEntry) => void; onPinFiles: () => void }) {
  const { config, setDeck, appsById, removeFromDeck, moveToDeck, displayName, apps, addToDeck, backend } = useShuriken();
  const [hov, setHov] = useState<SegmentIndex | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const deck = config.decks[seg];
  const usingDemo = apps.every((a) => a.demo);

  const candidates = useMemo(() => {
    const s = q.toLowerCase();
    return apps.filter((a) => !deck.appIds.includes(a.id) && displayName(a).toLowerCase().includes(s)).slice(0, 80);
  }, [apps, deck.appIds, q, displayName]);

  return (
    <div className="flex gap-8">
      <div className="w-48 shrink-0">
        <h2 className="mb-1 text-lg font-light tracking-wide text-white">Decks</h2>
        <p className="mb-5 text-[12px] text-white/40">Click a segment to configure it.</p>
        <div className="flex justify-center">
          <Logo
            size={170}
            strokeWidth={1.3}
            hitPadding={2}
            active={seg}
            hovered={hov}
            glow
            breathing={false}
            speed={1.4}
            onEnter={setHov}
            onLeave={() => setHov(null)}
            onSegmentClick={setSeg}
          />
        </div>
        <div className="mt-5 space-y-1">
          {([0, 1, 2] as SegmentIndex[]).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSeg(i)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] transition ${seg === i ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5'}`}
            >
              <span className="truncate">{config.decks[i].name || `Segment ${i + 1}`}</span>
              <span className="font-mono text-[10px] text-white/35">{config.decks[i].appIds.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[10.5px] uppercase tracking-[0.22em] text-white/35">Segment {seg + 1} · {SEGMENT_LABELS[seg]}</div>
        <input
          value={deck.name}
          onChange={(e) => setDeck(seg, { name: e.target.value })}
          className="mb-4 w-full border-b border-white/10 bg-transparent pb-2 text-2xl font-light tracking-wide text-white outline-none focus:border-white/40"
          placeholder="Deck name"
        />
        <Row label="Maximum displayed applications" hint="Extra apps stay assigned but are hidden from the reveal">
          <Slider value={deck.maxApps} min={1} max={30} onChange={(v) => setDeck(seg, { maxApps: v })} />
        </Row>
        {usingDemo && (
          <div className="my-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[12px] text-amber-100/70">
            {backend === 'online' ? 'No applications scanned yet. Run a scan from General.' : 'Showing demo apps. Start the companion service to load your real Windows apps.'}
          </div>
        )}

        <div className="mb-2 mt-4 flex items-center justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.22em] text-white/35">Items · drag to reorder</span>
          <div className="flex items-center gap-2">
            <button type="button" className="nx-btn" onClick={onPinFiles} disabled={backend !== 'online'} title="Pin a file or folder from disk to this deck">
              <FolderPlus className="h-3.5 w-3.5" /> Pin file or folder
            </button>
            <button type="button" className="nx-btn" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-3.5 w-3.5" /> {adding ? 'Done' : 'Add applications'}
            </button>
          </div>
        </div>

        {adding && (
          <div className="mb-4 rounded-xl border border-white/10 p-3">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 px-2.5">
              <Search className="h-3.5 w-3.5 text-white/40" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search detected applications…" className="w-full bg-transparent py-2 text-[13px] text-white outline-none" />
            </div>
            <div className="nx-scroll grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
              {candidates.map((a) => (
                <button key={a.id} type="button" onClick={() => addToDeck(seg, a.id)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-white/75 hover:bg-white/10">
                  <span className="nx-app-face relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full"><AppIcon app={a} size={28} /></span>
                  <span className="truncate">{displayName(a)}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 shrink-0 opacity-40" />
                </button>
              ))}
              {!candidates.length && <div className="col-span-2 py-4 text-center text-[12px] text-white/35">No matching applications</div>}
            </div>
          </div>
        )}

        <Reorder.Group axis="y" values={deck.appIds} onReorder={(ids) => setDeck(seg, { appIds: ids })} className="space-y-1">
          {deck.appIds.map((id, idx) => (
            <DeckRow
              key={id}
              id={id}
              idx={idx}
              total={deck.appIds.length}
              hidden={idx >= deck.maxApps}
              app={appsById.get(id)}
              seg={seg}
              decks={config.decks}
              onRemove={() => removeFromDeck(seg, id)}
              onMove={(to) => moveToDeck(seg, to, id)}
              onRename={onRename}
              onChangeIcon={onChangeIcon}
            />
          ))}
        </Reorder.Group>
        {!deck.appIds.length && <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-[12.5px] text-white/35">This deck is empty. Add applications or pin files and folders to bring the segment to life.</div>}
      </div>
    </div>
  );
}

function DeckRow({ id, idx, total, hidden, app, seg, decks, onRemove, onMove, onRename, onChangeIcon }: {
  id: string; idx: number; total: number; hidden: boolean; app?: AppEntry; seg: SegmentIndex; decks: ShurikenConfig['decks'];
  onRemove: () => void; onMove: (to: SegmentIndex) => void; onRename: (a: AppEntry) => void; onChangeIcon: (a: AppEntry) => void;
}) {
  const { moveInDeck, displayName, config, toggleFavorite } = useShuriken();
  const controls = useDragControls();
  const fav = config.favorites.includes(id);
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} className={`group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 ${hidden ? 'opacity-45' : ''}`}>
      <button type="button" onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none p-1 text-white/30 hover:text-white/70 active:cursor-grabbing" aria-label="Drag">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-center font-mono text-[10px] text-white/30">{idx + 1}</span>
      {app ? (
        <span className="nx-app-face relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"><AppIcon app={app} size={32} /></span>
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-white/20" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white/85">{app ? displayName(app) : 'Missing application'}</div>
        <div className="truncate text-[10.5px] text-white/35">{app ? app.location || app.source : `Not found in last scan (${id})`}{hidden ? ' · hidden by max limit' : ''}</div>
      </div>
      <div className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
        <IconBtn title="Favorite" onClick={() => toggleFavorite(id)}><Star className={`h-3.5 w-3.5 ${fav ? 'fill-white' : ''}`} /></IconBtn>
        {app && <IconBtn title="Rename" onClick={() => onRename(app)}><Pencil className="h-3.5 w-3.5" /></IconBtn>}
        {app && <IconBtn title="Change icon" onClick={() => onChangeIcon(app)}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>}
        <IconBtn title="Move up" disabled={idx === 0} onClick={() => moveInDeck(seg, id, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Move down" disabled={idx === total - 1} onClick={() => moveInDeck(seg, id, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
        <select
          value=""
          onChange={(e) => e.target.value !== '' && onMove(Number(e.target.value) as SegmentIndex)}
          className="nx-select mx-1 w-24 text-[11px]"
          title="Assign to another segment"
        >
          <option value="">Move to…</option>
          {([0, 1, 2] as SegmentIndex[]).filter((i) => i !== seg).map((i) => <option key={i} value={i}>{decks[i].name}</option>)}
        </select>
        <IconBtn title="Remove from deck" onClick={onRemove}><Trash2 className="h-3.5 w-3.5 text-red-300/80" /></IconBtn>
      </div>
    </Reorder.Item>
  );
}

function IconBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25">
      {children}
    </button>
  );
}

/* ================================================================== Library */

function LibraryTab({ onRename, onChangeIcon, onPinFiles }: { onRename: (a: AppEntry) => void; onChangeIcon: (a: AppEntry) => void; onPinFiles: () => void }) {
  const { apps, config, addToDeck, removeFromDeck, displayName, toggleFavorite, backend, scan, scanning, unpin } = useShuriken();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'favorites'>('all');
  const [limit, setLimit] = useState(150);
  const assigned = useMemo(() => new Set(config.decks.flatMap((d) => d.appIds)), [config.decks]);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return apps.filter((a) => {
      if (filter === 'unassigned' && assigned.has(a.id)) return false;
      if (filter === 'favorites' && !config.favorites.includes(a.id)) return false;
      return displayName(a).toLowerCase().includes(s) || (a.location || '').toLowerCase().includes(s);
    });
  }, [apps, q, filter, assigned, config.favorites, displayName]);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4 pr-10">
        <div>
          <h2 className="text-lg font-light tracking-wide text-white">Library</h2>
          <p className="text-[12px] text-white/40">{apps.length} items{apps.every((a) => a.demo) ? ' (demo)' : ' detected'}. Assign them to any segment.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="nx-btn" disabled={backend !== 'online'} onClick={onPinFiles} title="Pin a file or folder from disk">
            <FolderPlus className="h-3.5 w-3.5" /> Pin file or folder
          </button>
          <button type="button" className="nx-btn" disabled={backend !== 'online' || scanning} onClick={() => scan()}>
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 px-3">
          <Search className="h-3.5 w-3.5 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or path…" className="w-full bg-transparent py-2 text-[13px] text-white outline-none" />
        </div>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'favorites', label: 'Favorites' }]} />
      </div>
      <div className="space-y-1">
        {list.slice(0, limit).map((a) => (
          <div key={a.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
            <span className="nx-app-face relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"><AppIcon app={a} size={32} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-white/85">{displayName(a)}</div>
              <div className="truncate text-[10.5px] text-white/35"><span className="mr-2 uppercase tracking-wider text-white/45">{a.source}</span>{a.location}</div>
            </div>
            <IconBtn title="Favorite" onClick={() => toggleFavorite(a.id)}><Star className={`h-3.5 w-3.5 ${config.favorites.includes(a.id) ? 'fill-white' : ''}`} /></IconBtn>
            <IconBtn title="Rename" onClick={() => onRename(a)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn title="Change icon" onClick={() => onChangeIcon(a)}><ImageIcon className="h-3.5 w-3.5" /></IconBtn>
            {a.source === 'pinned' && (
              <IconBtn title="Unpin (removes it from all decks)" onClick={() => unpin(a.id)}>
                <PinOff className="h-3.5 w-3.5 text-red-300/80" />
              </IconBtn>
            )}
            <div className="ml-2 flex gap-1">
              {([0, 1, 2] as SegmentIndex[]).map((i) => {
                const on = config.decks[i].appIds.includes(a.id);
                return (
                  <button
                    key={i}
                    type="button"
                    title={on ? `Remove from ${config.decks[i].name}` : `Add to ${config.decks[i].name}`}
                    onClick={() => (on ? removeFromDeck(i, a.id) : addToDeck(i, a.id))}
                    className={`h-7 min-w-[74px] truncate rounded-md border px-2 text-[11px] transition ${on ? 'border-white/70 bg-white text-black' : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white'}`}
                  >
                    {config.decks[i].name || i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {list.length > limit && (
          <button type="button" className="nx-btn mx-auto mt-3" onClick={() => setLimit((l) => l + 150)}>Show more ({list.length - limit})</button>
        )}
        {!list.length && <div className="py-12 text-center text-[12.5px] text-white/35">No applications match.</div>}
      </div>
    </div>
  );
}

/* ================================================================== Appearance */

function ColorField({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  const valid = /^#?[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={valid ? (value.startsWith('#') ? value : '#' + value) : fallback}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent p-0.5"
        title="Pick a color"
      />
      <input
        type="text"
        value={value}
        placeholder="auto"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className={`nx-input w-20 py-1 font-mono text-[11px] ${value && !valid ? 'border-red-400/60' : ''}`}
      />
      <button type="button" onClick={() => onChange('')} className="nx-btn px-2 py-1" title="Reset to default color">
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  );
}

function AppearanceTab() {
  const { config, setAppearance, update, thermal } = useShuriken();
  const a = config.appearance;
  const maxAll = Math.round(config.decks.reduce((s, d) => s + d.maxApps, 0) / 3);
  return (
    <div className="max-w-2xl">
      <h2 className="mb-5 text-lg font-light tracking-wide text-white">Appearance & Interaction</h2>
      <Section title="Logo">
        <Row label="Logo size" hint="Relative to the shorter screen edge"><Slider value={a.logoSize} min={20} max={90} onChange={(v) => setAppearance({ logoSize: v })} format={(v) => `${v}%`} /></Row>
        <Row label="Horizontal position"><Slider value={a.offsetX} min={-40} max={40} onChange={(v) => setAppearance({ offsetX: v })} format={(v) => `${v > 0 ? '+' : ''}${v}%`} /></Row>
        <Row label="Vertical position"><Slider value={a.offsetY} min={-40} max={40} onChange={(v) => setAppearance({ offsetY: v })} format={(v) => `${v > 0 ? '+' : ''}${v}%`} /></Row>
        <Row label="Outline weight"><Slider value={a.strokeWidth} min={0.6} max={4} step={0.1} onChange={(v) => setAppearance({ strokeWidth: v })} format={(v) => `${v.toFixed(1)}px`} /></Row>
        <Row label="Idle breathing" hint="Very slow luminance pulse while idle"><Toggle value={a.breathing} onChange={(v) => setAppearance({ breathing: v })} /></Row>
        <Row label="Active glow"><Toggle value={a.glow} onChange={(v) => setAppearance({ glow: v })} /></Row>
        <Row label="Panel fill" hint="Fill the blades with the thermal accent color"><Segmented value={a.fill} onChange={(v) => setAppearance({ fill: v })} options={[{ value: 'off', label: 'Off' }, { value: 'hover', label: 'Hover' }, { value: 'all', label: 'All' }]} /></Row>
        <Row label="Balance color" hint={`Idle logo (default ${'#F5F5F5'})`}><ColorField value={a.colorBalance} fallback="#F5F5F5" onChange={(v) => setAppearance({ colorBalance: v })} /></Row>
        <Row label="Performance color" hint={`Fn+Q performance (default ${'#FF0000'})`}><ColorField value={a.colorPerformance} fallback="#FF0000" onChange={(v) => setAppearance({ colorPerformance: v })} /></Row>
        <Row label="Quiet color" hint={`Fn+Q quiet (default ${'#3A86FF'})`}><ColorField value={a.colorQuiet} fallback="#3A86FF" onChange={(v) => setAppearance({ colorQuiet: v })} /></Row>
        <Row
          label="Thermal mode sync"
          hint={thermal.supported
            ? `Logo follows Fn+Q power mode — current: ${thermal.mode} (white · balance, red · performance, blue · quiet)`
            : 'Thermal watcher not detected — run "npm run install-thermal" in the companion folder'}
        >
          <Toggle value={a.thermalSync} onChange={(v) => setAppearance({ thermalSync: v })} />
        </Row>
      </Section>
      <Section title="Application reveal">
        <Row label="Reveal arrangement" hint="How icons emerge from the segment">
          <Segmented value={a.revealStyle} onChange={(v) => setAppearance({ revealStyle: v })} options={[{ value: 'arc', label: 'Arc' }, { value: 'fan', label: 'Fan' }, { value: 'spiral', label: 'Spiral' }]} />
        </Row>
        <Row label="Animation speed"><Slider value={a.animationSpeed} min={0.4} max={2.5} step={0.1} onChange={(v) => setAppearance({ animationSpeed: v })} format={(v) => `${v.toFixed(1)}×`} /></Row>
        <Row label="Icon size"><Slider value={a.iconSize} min={34} max={120} onChange={(v) => setAppearance({ iconSize: v })} format={(v) => `${v}px`} /></Row>
        <Row label="Application names"><Segmented value={a.labels} onChange={(v) => setAppearance({ labels: v })} options={[{ value: 'hover', label: 'On hover' }, { value: 'always', label: 'Always' }]} /></Row>
        <Row label="Connector filaments" hint="Thin lines linking icons to the segment"><Toggle value={a.connectors} onChange={(v) => setAppearance({ connectors: v })} /></Row>
        <Row label="Monochrome icons" hint="Icons get their color back on hover"><Toggle value={a.monochrome} onChange={(v) => setAppearance({ monochrome: v })} /></Row>
        <Row label="Favorites first"><Toggle value={a.favoritesFirst} onChange={(v) => setAppearance({ favoritesFirst: v })} /></Row>
        <Row label="Maximum applications per deck" hint="Applies to all three decks">
          <Slider value={maxAll} min={1} max={30} onChange={(v) => update((c) => ({ ...c, decks: c.decks.map((d) => ({ ...d, maxApps: v })) as ShurikenConfig['decks'] }))} />
        </Row>
      </Section>
      <Section title="Hover sensitivity">
        <Row label="Hit area padding" hint="Extra px around each segment outline"><Slider value={a.hoverPadding} min={0} max={24} onChange={(v) => setAppearance({ hoverPadding: v })} format={(v) => `${v}px`} /></Row>
        <Row label="Hover intent delay" hint="Wait before revealing (prevents accidental opens)"><Slider value={a.hoverIntent} min={0} max={600} step={10} onChange={(v) => setAppearance({ hoverIntent: v })} format={(v) => `${v}ms`} /></Row>
        <Row label="Close delay" hint="Grace period after leaving the deck"><Slider value={a.closeDelay} min={100} max={1500} step={20} onChange={(v) => setAppearance({ closeDelay: v })} format={(v) => `${v}ms`} /></Row>
      </Section>
    </div>
  );
}

/* ================================================================== General */

/** Registers the batch script the hold-to-power action runs (server-side path). */
function PowerScriptRow() {
  const { client, toast, backend } = useShuriken();
  const [script, setScript] = useState('');
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (backend !== 'online') return;
    client.powerInfo().then((r) => {
      setScript(r.script || '');
      setV(r.script || '');
    }).catch(() => { /* offline */ });
  }, [backend, client]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await client.setPowerScript(v.trim());
      setScript(r.script || '');
      setV(r.script || '');
      toast(r.script ? 'Power-off script registered' : 'Power-off script cleared', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-2.5">
      <div className="mb-1.5 text-[13px] text-white/85">Power-off script</div>
      <div className="flex items-center gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="C:\path\to\script.bat"
          spellCheck={false}
          className="nx-input min-w-0 flex-1 font-mono text-[11.5px]"
        />
        <button type="button" className="nx-btn" disabled={backend !== 'online' || busy} onClick={save}>Save</button>
      </div>
      <div className="mt-1 text-[11px] text-white/40">
        {script ? `Registered: ${script}` : 'No script registered — the power action is inert'}
      </div>
    </div>
  );
}

function GeneralTab() {
  const { config, update, backend, backendInfo, scan, scanning, checkBackend, saveNow, resetLayout, resetAll, importConfig, toast } = useShuriken();
  const [url, setUrl] = useState(config.backendUrl);
  const [capturing, setCapturing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportCfg = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shuriken-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const dot = backend === 'online' ? 'bg-emerald-400' : backend === 'connecting' ? 'bg-amber-300 animate-pulse' : 'bg-red-400';

  return (
    <div className="max-w-2xl">
      <h2 className="mb-5 text-lg font-light tracking-wide text-white">General</h2>
      <Section title="Companion service">
        <div className="flex items-center gap-3 py-3">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <div className="flex-1 text-[13px] text-white/85">
            {backend === 'online' ? `Connected · v${backendInfo.version}` : backend === 'connecting' ? 'Connecting…' : 'Disconnected: launching and app detection are unavailable'}
            {backend === 'online' && <div className="text-[11px] text-white/40">{backendInfo.appCount ?? 0} apps · last scan {backendInfo.lastScan ? new Date(backendInfo.lastScan).toLocaleString() : 'never'}</div>}
          </div>
          <button type="button" className="nx-btn" onClick={() => checkBackend().then((ok) => toast(ok ? 'Companion online' : 'Companion unreachable', ok ? 'success' : 'error'))}>Test</button>
        </div>
        <Row label="Service address">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== config.backendUrl && update((c) => ({ ...c, backendUrl: url.trim() }))} className="nx-input w-60 font-mono text-[12px]" />
        </Row>
        <Row label="Application scanning" hint="Start Menu, desktops, registry and Store apps. Your deck assignments are kept.">
          <button type="button" className="nx-btn" disabled={backend !== 'online' || scanning} onClick={() => scan()}>
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'Scanning…' : 'Scan now'}
          </button>
          <button type="button" className="nx-btn" disabled={backend !== 'online' || scanning} onClick={() => scan(true)} title="Re-extract all icons">Refresh icons</button>
        </Row>
        {backend !== 'online' && (
          <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/60">{`cd companion
npm install
npm start                    # run once
npm run install-autostart    # start with Windows`}</pre>
        )}
      </Section>

      <Section title="Controls">
        <Row label="Settings shortcut" hint="You can also use the gear button that appears when you move the mouse">
          <button
            type="button"
            className={`nx-btn font-mono ${capturing ? 'border-white/60' : ''}`}
            onClick={() => setCapturing(true)}
            onKeyDown={(e) => {
              if (!capturing) return;
              e.preventDefault();
              if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
              const parts = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean);
              update((c) => ({ ...c, shortcut: parts.join('+') }));
              setCapturing(false);
            }}
            onBlur={() => setCapturing(false)}
          >
            <Keyboard className="h-3.5 w-3.5" /> {capturing ? 'Press keys…' : config.shortcut}
          </button>
        </Row>
      </Section>

      <Section title="Power button">
        <Row label="Logo center action" hint="Hold the middle of the logo 1.5s — a ring fills, releasing early cancels">
          <Segmented
            value={config.centerAction}
            onChange={(v) => update((c) => ({ ...c, centerAction: v }))}
            options={[
              { value: 'none', label: 'None' },
              { value: 'power', label: 'Power off' },
            ]}
          />
        </Row>
        <PowerScriptRow />
      </Section>

      <Section title="Configuration">
        <Row label="Save configuration" hint="Saved automatically to this wallpaper and the companion service">
          <button type="button" className="nx-btn" onClick={saveNow}><Save className="h-3.5 w-3.5" /> Save now</button>
        </Row>
        <Row label="Backup">
          <button type="button" className="nx-btn" onClick={exportCfg}><Download className="h-3.5 w-3.5" /> Export</button>
          <button type="button" className="nx-btn" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Import</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importConfig(JSON.parse(await f.text()));
                toast('Configuration imported', 'success');
              } catch {
                toast('Invalid configuration file', 'error');
              }
            }}
          />
        </Row>
        <Row label="Reset layout" hint="Restore appearance & interaction defaults">
          <button type="button" className="nx-btn" onClick={resetLayout}><RotateCcw className="h-3.5 w-3.5" /> Reset layout</button>
        </Row>
        <Row label="Reset everything" hint="Decks, names, icons and favorites">
          <button type="button" className="nx-btn text-red-300" onClick={() => confirm('Reset all Shuriken settings?') && resetAll()}><Trash2 className="h-3.5 w-3.5" /> Reset all</button>
        </Row>
      </Section>

      <Section title="Lively Wallpaper">
        <ul className="list-disc space-y-1.5 py-3 pl-5 text-[12px] leading-relaxed text-white/55">
          <li>Set <b className="text-white/80">Settings → Wallpaper → Wallpaper Input</b> to <b className="text-white/80">Mouse</b> (or Keyboard + Mouse for the shortcut).</li>
          <li>Hover a segment to reveal its deck. Click a segment to pin it open. Esc or a click on empty space closes it.</li>
          <li>Right-click an app for more options: favorites, rename, icon, move, remove, location.</li>
          <li>The companion service listens on 127.0.0.1 only and launches registered apps only.</li>
        </ul>
      </Section>
    </div>
  );
}
