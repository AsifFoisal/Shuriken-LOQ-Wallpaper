import type { ReactNode } from 'react';

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] text-white/85">{label}</div>
        {hint && <div className="text-[11px] text-white/40">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" className="nx-range w-40" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-14 text-right font-mono text-[11px] text-white/55">{format ? format(value) : value}</span>
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 rounded-full border transition-colors ${value ? 'border-white/70 bg-white/80' : 'border-white/20 bg-white/5'}`}
    >
      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${value ? 'left-[18px] bg-black' : 'left-0.5 bg-white/60'}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-white/10 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-[12px] transition ${value === o.value ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h4 className="mb-1 text-[10.5px] uppercase tracking-[0.22em] text-white/35">{title}</h4>
      <div className="divide-y divide-white/[0.06]">{children}</div>
    </section>
  );
}
