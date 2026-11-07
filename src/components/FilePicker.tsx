import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CornerLeftUp, File as FileIcon, Folder, HardDrive, Home, Image as ImageIcon, X } from 'lucide-react';
import type { FsEntry, FsListing, FsRoots } from '../lib/types';
import { useShuriken } from '../lib/store';

interface Props {
  onClose: () => void;
  /** Resolve + register the picked paths; return false to keep the picker open (nothing pinned). */
  onPick: (paths: string[]) => Promise<boolean>;
}

function formatSize(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i;

function EntryIcon({ e }: { e: FsEntry }) {
  if (e.isDir) return <Folder className="h-4 w-4 shrink-0 text-amber-200/70" strokeWidth={1.5} />;
  if (IMG_EXT.test(e.name)) return <ImageIcon className="h-4 w-4 shrink-0 text-sky-200/60" strokeWidth={1.5} />;
  return <FileIcon className="h-4 w-4 shrink-0 text-white/45" strokeWidth={1.5} />;
}

/** Browse the companion's filesystem and pick files / folders to pin into a deck. */
export default function FilePicker({ onClose, onPick }: Props) {
  const { client } = useShuriken();
  const [roots, setRoots] = useState<FsRoots | null>(null);
  const [listing, setListing] = useState<FsListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FsEntry[]>([]);
  const [pathInput, setPathInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useCallback(
    async (dir: string) => {
      setLoading(true);
      setError('');
      try {
        const r = await client.fsList(dir);
        setListing(r);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await client.fsRoots();
        setRoots(r);
        const start = r.quick[0]?.path || r.drives[0]?.path;
        if (start) await navigate(start);
        else { setLoading(false); setError('No drives found'); }
      } catch (e) {
        setLoading(false);
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const crumbs = useMemo(() => {
    if (!listing) return [];
    const sep = listing.dir.includes('\\') ? '\\' : '/';
    const parts = listing.dir.split(/[\\/]+/).filter(Boolean);
    return parts.map((p, i) => {
      const isDrive = i === 0 && p.endsWith(':');
      return { name: p, path: isDrive ? p + sep : parts.slice(0, i + 1).join(sep) };
    });
  }, [listing]);

  const isSelected = (p: string) => selected.some((s) => s.path === p);
  const toggle = (e: FsEntry) =>
    setSelected((cur) => (cur.some((s) => s.path === e.path) ? cur.filter((s) => s.path !== e.path) : [...cur, e]));

  const pastePath = pathInput.trim();
  const count = selected.length + (pastePath ? 1 : 0);

  const submit = async () => {
    if (!count || submitting) return;
    setSubmitting(true);
    const paths = [...selected.map((s) => s.path), ...(pastePath ? [pastePath] : [])];
    const ok = await onPick(paths);
    setSubmitting(false);
    if (ok) onClose();
    else inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onPointerDown={onClose}>
      <motion.div
        className="nx-glass flex h-[min(600px,88vh)] w-[min(780px,94vw)] flex-col overflow-hidden rounded-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h3 className="text-sm font-light uppercase tracking-[0.2em] text-white/80">Pin files or folders</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* breadcrumb */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-5 pb-2.5">
          <button
            type="button"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && navigate(listing.parent)}
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-25"
            title="Parent folder"
          >
            <CornerLeftUp className="h-4 w-4" />
          </button>
          <div className="nx-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap text-[12px]">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex shrink-0 items-center">
                {i > 0 && <span className="px-0.5 text-white/25">›</span>}
                <button
                  type="button"
                  onClick={() => navigate(c.path)}
                  className={`rounded px-1.5 py-0.5 transition hover:bg-white/10 ${i === crumbs.length - 1 ? 'text-white' : 'text-white/50'}`}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* quick links + drives */}
          <div className="nx-scroll w-40 shrink-0 overflow-y-auto border-r border-white/[0.07] p-2">
            {roots?.quick.map((q) => (
              <button
                key={q.path}
                type="button"
                onClick={() => navigate(q.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition ${listing?.dir === q.path ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/85'}`}
              >
                <Home className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.5} />
                <span className="truncate">{q.name}</span>
              </button>
            ))}
            {roots && roots.quick.length > 0 && <div className="mx-2 my-2 h-px bg-white/[0.07]" />}
            {roots?.drives.map((d) => (
              <button
                key={d.path}
                type="button"
                onClick={() => navigate(d.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition ${listing?.dir === d.path ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/85'}`}
                title={d.path}
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.5} />
                <span className="truncate">{d.label || d.path}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-white/30">{d.path.slice(0, 2)}</span>
              </button>
            ))}
          </div>

          {/* entries */}
          <div className="nx-scroll min-w-0 flex-1 overflow-y-auto p-2">
            {loading && <div className="py-10 text-center text-[12.5px] text-white/40">Loading…</div>}
            {!loading && error && <div className="py-10 text-center text-[12.5px] text-red-300/70">{error}</div>}
            {!loading && !error && listing && !listing.entries.length && (
              <div className="py-10 text-center text-[12.5px] text-white/35">This folder is empty.</div>
            )}
            {!loading && !error && listing?.entries.map((e) => {
              const sel = isSelected(e.path);
              return (
                <div
                  key={e.path}
                  onClick={() => (e.isDir ? navigate(e.path) : toggle(e))}
                  onDoubleClick={() => e.isDir && navigate(e.path)}
                  className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${sel ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'}`}
                >
                  <EntryIcon e={e} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{e.name}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-white/30">{formatSize(e.size)}</span>
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); toggle(e); }}
                    title={sel ? 'Unselect' : 'Select'}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${sel ? 'border-white bg-white text-black' : 'border-white/25 text-transparent hover:border-white/60'}`}
                  >
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t border-white/[0.07] px-5 py-3.5">
          <input
            ref={inputRef}
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="…or paste a full path (file or folder)"
            spellCheck={false}
            className="nx-input min-w-0 flex-1 font-mono text-[12px]"
          />
          <button type="button" className="nx-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary" disabled={!count || submitting} onClick={submit}>
            {submitting ? 'Pinning…' : `Pin ${count || ''} ${count === 1 ? 'item' : 'items'}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
