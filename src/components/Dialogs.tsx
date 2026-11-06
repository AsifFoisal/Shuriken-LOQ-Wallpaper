import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Upload, RotateCcw, X } from 'lucide-react';
import type { AppEntry } from '../lib/types';
import { useShuriken } from '../lib/store';
import AppIcon, { GLYPHS } from './AppIcon';

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onPointerDown={onClose}>
      <motion.div
        className="nx-glass w-[380px] max-w-[92vw] rounded-2xl p-5"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-light uppercase tracking-[0.2em] text-white/80">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function RenameDialog({ app, onClose }: { app: AppEntry; onClose: () => void }) {
  const { setOverride, displayName } = useShuriken();
  const [v, setV] = useState(displayName(app));
  const save = () => {
    const t = v.trim();
    setOverride(app.id, { name: t && t !== app.name ? t : undefined });
    onClose();
  };
  return (
    <Shell title="Display name" onClose={onClose}>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="nx-input w-full"
      />
      <p className="mt-2 text-[11px] text-white/40">Original: {app.name}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="nx-btn" onClick={() => { setOverride(app.id, { name: undefined }); onClose(); }}>Reset</button>
        <button type="button" className="nx-btn nx-btn-primary" onClick={save}>Save</button>
      </div>
    </Shell>
  );
}

/** Downscale an uploaded image to a 96px PNG data URL so config stays small. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      const S = 96;
      c.width = c.height = S;
      const ctx = c.getContext('2d')!;
      const r = Math.min(S / img.width, S / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function IconDialog({ app, onClose }: { app: AppEntry; onClose: () => void }) {
  const { setOverride, config } = useShuriken();
  const fileRef = useRef<HTMLInputElement>(null);
  const current = config.overrides[app.id]?.icon;
  return (
    <Shell title="Change icon" onClose={onClose}>
      <div className="mb-4 flex items-center gap-4">
        <div className="nx-app-face relative flex h-16 w-16 items-center justify-center rounded-full text-white">
          <AppIcon app={app} size={64} />
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" className="nx-btn" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload image
          </button>
          <button type="button" className="nx-btn" onClick={() => setOverride(app.id, { icon: undefined })} disabled={!current}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore original
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setOverride(app.id, { icon: await toDataUrl(f) });
          }}
        />
      </div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/40">Line glyphs</p>
      <div className="grid grid-cols-8 gap-1.5">
        {Object.entries(GLYPHS).map(([k, G]) => (
          <button
            key={k}
            type="button"
            title={k}
            onClick={() => setOverride(app.id, { icon: `glyph:${k}` })}
            className={`flex aspect-square items-center justify-center rounded-lg border text-white/80 transition hover:bg-white/10 ${current === `glyph:${k}` ? 'border-white/70' : 'border-white/10'}`}
          >
            <G className="h-4 w-4" strokeWidth={1.4} />
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className="nx-btn nx-btn-primary" onClick={onClose}>Done</button>
      </div>
    </Shell>
  );
}
