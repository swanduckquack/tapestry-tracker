import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const CONFIG_STORAGE_KEY = 'tapestry_supabase_config';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient | null = null;

  readonly isConfigured = signal(false);

  constructor() {
    const saved = this.loadConfig();
    if (saved.url && saved.anonKey) {
      this.initClient(saved.url, saved.anonKey);
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  loadConfig(): SupabaseConfig {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
        if (parsed.url && parsed.anonKey) {
          return { url: parsed.url, anonKey: parsed.anonKey };
        }
      }
    } catch {
      // Ignore malformed localStorage
    }
    return {
      url: environment.supabaseUrl,
      anonKey: environment.supabaseAnonKey,
    };
  }

  configure(url: string, anonKey: string): void {
    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
    if (cleanUrl && cleanKey) {
      this.initClient(cleanUrl, cleanKey);
    } else {
      this.client = null;
      this.isConfigured.set(false);
    }
  }

  private initClient(url: string, anonKey: string): void {
    this.client = createClient(url, anonKey);
    this.isConfigured.set(true);
  }
}
