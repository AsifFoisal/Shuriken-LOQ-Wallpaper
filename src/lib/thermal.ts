/** Logo accent colors per power mode, mirroring the LOQ power-button LED. */
export interface Accent {
  stroke: string;
  glow: string;
}

const ACCENTS: Record<string, Accent> = {
  balance: { stroke: '#F5F5F5', glow: 'rgba(245,245,245,.5)' },
  performance: { stroke: '#FF0000', glow: 'rgba(255,0,0,.55)' },
  quiet: { stroke: '#3A86FF', glow: 'rgba(58,134,255,.55)' },
  custom: { stroke: '#b48cff', glow: 'rgba(180,140,255,.45)' },
};

export interface ThermalColorOverrides {
  balance?: string;
  performance?: string;
  quiet?: string;
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(hex: string | undefined): string | undefined {
  if (!hex || !HEX_RE.test(hex)) return undefined;
  return hex.startsWith('#') ? hex : '#' + hex;
}

function hexGlow(hex: string, alpha: number): string {
  const h = normalizeHex(hex) || '#ffffff';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function accentFor(mode: string | null | undefined, custom?: ThermalColorOverrides): Accent {
  const key = mode && ACCENTS[mode] ? mode : 'balance';
  if (custom && (key === 'balance' || key === 'performance' || key === 'quiet')) {
    const hex = normalizeHex(custom[key]);
    if (hex) return { stroke: hex, glow: hexGlow(hex, key === 'balance' ? 0.5 : 0.55) };
  }
  return ACCENTS[key] || ACCENTS.balance;
}
