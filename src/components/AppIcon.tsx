import { useState } from 'react';
import {
  Code2, Terminal, Gamepad2, Palette, Music, Film, Globe, Camera, Brush, Box, Cpu, Database,
  MessageCircle, Mail, FileText, Folder, Headphones, Image, Layers, PenTool, Rocket, Settings2,
  Sparkles, Star, Swords, Trophy, Wrench, Zap, Monitor, Cloud, type LucideIcon,
} from 'lucide-react';
import type { AppEntry } from '../lib/types';
import { useShuriken } from '../lib/store';

export const GLYPHS: Record<string, LucideIcon> = {
  Code2, Terminal, Gamepad2, Palette, Music, Film, Globe, Camera, Brush, Box, Cpu, Database,
  MessageCircle, Mail, FileText, Folder, Headphones, Image, Layers, PenTool, Rocket, Settings2,
  Sparkles, Star, Swords, Trophy, Wrench, Zap, Monitor, Cloud,
};

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const skip = new Set(['adobe', 'microsoft', 'google', 'the']);
  const w = words.filter((x) => !skip.has(x.toLowerCase()));
  const use = w.length ? w : words;
  return ((use[0]?.[0] || '?') + (use[1]?.[0] || '')).toUpperCase();
}

interface Props {
  app: AppEntry;
  size: number;
  className?: string;
}

/** Renders override image / glyph, extracted Windows icon, or a monogram fallback. */
export default function AppIcon({ app, size, className = '' }: Props) {
  const { config, displayName } = useShuriken();
  const [failed, setFailed] = useState(false);
  const override = config.overrides[app.id]?.icon;
  const name = displayName(app);
  const inner = Math.round(size * 0.8);

  if (override?.startsWith('glyph:')) {
    const G = GLYPHS[override.slice(6)] || Sparkles;
    return <G className={className} style={{ width: inner, height: inner }} strokeWidth={1.4} />;
  }
  const src = override || (!failed ? app.iconUrl : null);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className={`object-contain ${className}`}
        style={{ width: inner, height: inner, imageRendering: 'auto' }}
      />
    );
  }
  const h = hue(app.name);
  return (
    <span
      className={`flex items-center justify-center font-light tracking-wider ${className}`}
      style={{
        width: inner,
        height: inner,
        fontSize: Math.max(10, size * 0.24),
        color: `hsl(${h} 80% 82%)`,
        textShadow: '0 0 12px hsl(' + h + ' 80% 70% / .35)',
      }}
    >
      {initials(name)}
    </span>
  );
}
