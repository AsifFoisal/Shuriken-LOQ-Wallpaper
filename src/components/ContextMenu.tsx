import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, ChevronRight, FolderOpen, Image as ImageIcon, Pencil, Play, Star, Trash2 } from 'lucide-react';
import type { AppEntry, SegmentIndex } from '../lib/types';
import { useShuriken } from '../lib/store';

export interface MenuState {
  app: AppEntry;
  segment: SegmentIndex;
  x: number;
  y: number;
}

interface Props {
  menu: MenuState;
  onClose: () => void;
  onRename: (a: AppEntry) => void;
  onChangeIcon: (a: AppEntry) => void;
}

export default function ContextMenu({ menu, onClose, onRename, onChangeIcon }: Props) {
  const { config, launch, toggleFavorite, removeFromDeck, moveToDeck, reveal, displayName } = useShuriken();
  const [assignOpen, setAssignOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const isFav = config.favorites.includes(menu.app.id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
  }, [menu.x, menu.y, assignOpen]);

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const Item = ({ icon: I, label, onClick, danger, trailing }: { icon: typeof Play; label: string; onClick: () => void; danger?: boolean; trailing?: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10 ${danger ? 'text-red-300' : 'text-white/85'}`}
    >
      <I className="h-4 w-4 opacity-70" strokeWidth={1.5} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );

  return (
    <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <motion.div
        ref={ref}
        className="nx-glass absolute w-60 rounded-xl p-1.5"
        style={{ left: pos.x, top: pos.y }}
        initial={{ opacity: 0, scale: 0.94, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="truncate px-3 pb-1.5 pt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">{displayName(menu.app)}</div>
        <Item icon={Play} label="Launch" onClick={act(() => launch(menu.app))} />
        <Item icon={Star} label={isFav ? 'Remove from Favorites' : 'Add to Favorites'} onClick={act(() => toggleFavorite(menu.app.id))} />
        <Item icon={Pencil} label="Change display name" onClick={act(() => onRename(menu.app))} />
        <Item icon={ImageIcon} label="Change icon" onClick={act(() => onChangeIcon(menu.app))} />
        <Item
          icon={ArrowRightLeft}
          label="Assign to another segment"
          onClick={() => setAssignOpen((v) => !v)}
          trailing={<ChevronRight className={`h-4 w-4 opacity-50 transition-transform ${assignOpen ? 'rotate-90' : ''}`} />}
        />
        {assignOpen && (
          <div className="mb-1 ml-6 border-l border-white/10 pl-2">
            {([0, 1, 2] as SegmentIndex[])
              .filter((i) => i !== menu.segment)
              .map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={act(() => moveToDeck(menu.segment, i, menu.app.id))}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[12.5px] text-white/75 hover:bg-white/10"
                >
                  <span className="text-white/35">{i + 1}</span> {config.decks[i].name}
                </button>
              ))}
          </div>
        )}
        <Item icon={FolderOpen} label="View application location" onClick={act(() => reveal(menu.app))} />
        <div className="my-1 h-px bg-white/10" />
        <Item icon={Trash2} label="Remove from this category" danger onClick={act(() => removeFromDeck(menu.segment, menu.app.id))} />
      </motion.div>
    </div>
  );
}
