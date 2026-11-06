import type { AppEntry, Appearance, ShurikenConfig } from './types';

export const DEFAULT_BACKEND = 'http://127.0.0.1:47811';

export const DEFAULT_APPEARANCE: Appearance = {
  logoSize: 52,
  offsetX: 0,
  offsetY: 0,
  strokeWidth: 1.6,
  revealStyle: 'arc',
  animationSpeed: 1,
  hoverPadding: 10,
  hoverIntent: 90,
  closeDelay: 420,
  iconSize: 64,
  labels: 'hover',
  glow: true,
  breathing: true,
  monochrome: false,
  favoritesFirst: true,
  connectors: true,
  thermalSync: true,
  fill: 'off',
  colorBalance: '',
  colorPerformance: '',
  colorQuiet: '',
};

const demo = (id: string, name: string, source = 'demo'): AppEntry => ({ id: `demo-${id}`, name, source, demo: true });

/** Demonstration apps, shown until the companion service gives us the real installed list. */
export const DEMO_APPS: AppEntry[] = [
  demo('vscode', 'Visual Studio Code'),
  demo('webstorm', 'WebStorm'),
  demo('docker', 'Docker Desktop'),
  demo('postman', 'Postman'),
  demo('github', 'GitHub Desktop'),
  demo('terminal', 'Windows Terminal'),
  demo('steam', 'Steam'),
  demo('epic', 'Epic Games Launcher'),
  demo('riot', 'Riot Client'),
  demo('minecraft', 'Minecraft Launcher'),
  demo('discord', 'Discord'),
  demo('obs', 'OBS Studio'),
  demo('photoshop', 'Adobe Photoshop'),
  demo('figma', 'Figma'),
  demo('premiere', 'Adobe Premiere Pro'),
  demo('blender', 'Blender'),
  demo('notion', 'Notion'),
  demo('chrome', 'Google Chrome'),
];

export function defaultConfig(): ShurikenConfig {
  return {
    version: 1,
    decks: [
      { name: 'Development', maxApps: 12, appIds: ['vscode', 'webstorm', 'docker', 'postman', 'github', 'terminal'].map((x) => `demo-${x}`) },
      { name: 'Gaming', maxApps: 12, appIds: ['steam', 'epic', 'riot', 'minecraft', 'discord', 'obs'].map((x) => `demo-${x}`) },
      { name: 'Creative', maxApps: 12, appIds: ['photoshop', 'figma', 'premiere', 'blender', 'notion', 'chrome'].map((x) => `demo-${x}`) },
    ],
    overrides: {},
    favorites: [],
    appearance: { ...DEFAULT_APPEARANCE },
    shortcut: 'Ctrl+Alt+N',
    backendUrl: DEFAULT_BACKEND,
    autoSeeded: false,
    updatedAt: 0,
  };
}

const RULES: RegExp[] = [
  /(visual studio|vs ?code|\bcode\b|cursor|webstorm|intellij|pycharm|rider|clion|goland|phpstorm|datagrip|jetbrains|docker|postman|insomnia|github|gitkraken|git bash|sourcetree|terminal|powershell|wsl|ubuntu|node\.js|python|android studio|sublime|notepad\+\+|dbeaver|putty|winscp|filezilla|heidisql|mongodb|redis|unity hub|unreal|godot)/i,
  /(steam|epic games|riot|valorant|league of legends|minecraft|discord|battle\.net|ubisoft|ea app|\bea\b|origin|gog galaxy|xbox|geforce|nvidia app|afterburner|playnite|rockstar|overwolf|medal|curseforge|prism launcher|game)/i,
  /(photoshop|illustrator|premiere|after effects|lightroom|indesign|figma|blender|notion|obsidian|chrome|firefox|edge|brave|opera|vivaldi|arc|spotify|davinci|resolve|gimp|krita|inkscape|affinity|canva|audacity|ableton|fl studio|obs studio|word|excel|powerpoint|onenote|outlook|slack|zoom|teams|vlc|paint)/i,
];

/** Builds initial deck assignments from the real installed application list. */
export function seedDecks(apps: AppEntry[], max = 12): [string[], string[], string[]] {
  const out: [string[], string[], string[]] = [[], [], []];
  for (const a of apps) {
    for (let i = 0; i < 3; i++) {
      if (RULES[i].test(a.name)) {
        if (out[i].length < max) out[i].push(a.id);
        break;
      }
    }
  }
  return out;
}
