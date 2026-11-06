import type { AppEntry, ShurikenConfig } from './types';

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
  getConfig() {
    return this.req<ShurikenConfig | null>('/api/config');
  }
  saveConfig(cfg: ShurikenConfig) {
    return this.req<{ ok: boolean }>('/api/config', { method: 'PUT', body: JSON.stringify(cfg) });
  }
}
