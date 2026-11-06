/** Logo accent colors per power mode, mirroring the LOQ power-button LED. */
export interface Accent {
  stroke: string;
  glow: string;
}

const ACCENTS: Record<string, Accent> = {
  balance: { stroke: '#ffffff', glow: 'rgba(255,255,255,.45)' },
  performance: { stroke: '#ff3b3b', glow: 'rgba(255,59,59,.5)' },
  quiet: { stroke: '#3d7dff', glow: 'rgba(61,125,255,.5)' },
  custom: { stroke: '#b48cff', glow: 'rgba(180,140,255,.45)' },
};

export function accentFor(mode: string | null | undefined): Accent {
  return (mode && ACCENTS[mode]) || ACCENTS.balance;
}
