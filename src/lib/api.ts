import type { AppEntry, FsListing, FsRoots, PinResolveResult, PowerInfo, ShurikenConfig } from './types';

export interface StatusResponse {
  ok: boolean;
  version: string;
  platform: string;
  appCount: number;
  lastScan: string | null;
  scanning: boolean;
}

export class BackendClient {
  constructor(public base: string) {}

  private async req<T>(path: string, init: RequestInit = {}, timeout = 5000): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.base.replace(/\/$/, '') + path, {
        ...init,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'X-Shuriken-Client': 'shuriken-wallpaper', ...(init.headers || {}) },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      return body as T;
    } finally {
      clearTimeout(t);
    }
  }

  private absolutize(apps: AppEntry[]) {
    const b = this.base.replace(/\/$/, '');
    return apps.map((a) => ({ ...a, iconUrl: a.iconUrl ? b + a.iconUrl : null }));
  }

  status() {
    return this.req<StatusResponse>('/api/system/status', {}, 2500);
  }
  thermal() {
    return this.req<{ ok: boolean; supported: boolean; mode: string | null; raw: number | null }>('/api/thermal', {}, 2000);
  }
  async apps() {
    const r = await this.req<{ apps: AppEntry[]; lastScan: string | null }>('/api/apps');
    return { ...r, apps: this.absolutize(r.apps) };
  }
  async scan(forceIcons = false) {
    const r = await this.req<{ apps: AppEntry[]; lastScan: string | null }>(
      '/api/apps/scan',
      { method: 'POST', body: JSON.stringify({ forceIcons }) },
      180000,
    );
    return { ...r, apps: this.absolutize(r.apps) };
  }
  launch(id: string) {
    return this.req<{ ok: boolean }>('/api/apps/launch', { method: 'POST', body: JSON.stringify({ id }) });
  }
  reveal(id: string) {
    return this.req<{ ok: boolean; location?: string }>('/api/apps/reveal', { method: 'POST', body: JSON.stringify({ id }) });
  }
  // ---- pins (files & folders) + picker browsing
  async pinResolve(paths: string[]) {
    const r = await this.req<{ results: PinResolveResult[] }>(
      '/api/pins/resolve',
      { method: 'POST', body: JSON.stringify({ paths }) },
      120000, // each path spawns PowerShell for icon extraction
    );
    return {
      results: r.results.map((x) => (x.entry ? { ...x, entry: this.absolutize([x.entry])[0] } : x)),
    };
  }
  pinRemove(id: string) {
    return this.req<{ ok: boolean; removed: boolean }>('/api/pins/remove', { method: 'POST', body: JSON.stringify({ id }) });
  }
  fsRoots() {
    return this.req<FsRoots>('/api/fs/roots', {}, 10000);
  }
  fsList(dir: string) {
    return this.req<FsListing>(`/api/fs/list?dir=${encodeURIComponent(dir)}`, {}, 10000);
  }
  // ---- power button (hold-to-shutdown)
  powerInfo() {
    return this.req<PowerInfo>('/api/power');
  }
  setPowerScript(path: string) {
    return this.req<{ ok: boolean; script: string | null }>('/api/power/script', { method: 'POST', body: JSON.stringify({ path }) });
  }
  powerOff(dryRun = false) {
    return this.req<{ ok: boolean; wouldRun?: string }>('/api/power/off', { method: 'POST', body: JSON.stringify({ dryRun }) }, 10000);
  }
  getConfig() {
    return this.req<ShurikenConfig | null>('/api/config');
  }
  saveConfig(cfg: ShurikenConfig) {
    return this.req<{ ok: boolean }>('/api/config', { method: 'PUT', body: JSON.stringify(cfg) });
  }
}
