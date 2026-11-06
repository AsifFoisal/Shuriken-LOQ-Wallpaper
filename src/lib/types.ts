export type SegmentIndex = 0 | 1 | 2;

export interface AppEntry {
  id: string;
  name: string;
  source: string;
  kind?: string;
  target?: string;
  shortcut?: string;
  args?: string;
  workingDir?: string;
  location?: string;
  iconUrl?: string | null;
  demo?: boolean;
}

export interface Deck {
  name: string;
  appIds: string[];
  maxApps: number;
}

export interface AppOverride {
  name?: string;
  /** data: URL or "glyph:<Name>" */
  icon?: string;
}

export type RevealStyle = 'arc' | 'fan' | 'spiral';

export type FillMode = 'off' | 'hover' | 'all';

export interface Appearance {
  logoSize: number; // % of min(viewport)
  offsetX: number; // % of viewport width
  offsetY: number; // % of viewport height
  strokeWidth: number;
  revealStyle: RevealStyle;
  animationSpeed: number; // multiplier
  hoverPadding: number; // px around segment hit area
  hoverIntent: number; // ms before reveal
  closeDelay: number; // ms
  iconSize: number; // px
  labels: 'hover' | 'always';
  glow: boolean;
  breathing: boolean;
  monochrome: boolean;
  favoritesFirst: boolean;
  connectors: boolean;
  thermalSync: boolean;
  fill: FillMode;
  colorBalance: string;
  colorPerformance: string;
  colorQuiet: string;
}

export interface ShurikenConfig {
  version: 1;
  decks: [Deck, Deck, Deck];
  overrides: Record<string, AppOverride>;
  favorites: string[];
  appearance: Appearance;
  shortcut: string;
  backendUrl: string;
  autoSeeded: boolean;
  updatedAt: number;
}

export type BackendState = 'connecting' | 'online' | 'offline';
