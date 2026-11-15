import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
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
  readonly user = signal<User | null>(null);
  readonly authError = signal<string | null>(null);

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
      this.user.set(null);
    }
  }

  private initClient(url: string, anonKey: string): void {
    this.client = createClient(url, anonKey);
    this.isConfigured.set(true);

    this.client.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
    });
  }

  async signIn(email: string, password: string): Promise<boolean> {
    if (!this.client) return false;
    this.authError.set(null);
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      this.authError.set(error.message);
      return false;
    }
    return true;
  }

  async signUp(email: string, password: string): Promise<boolean> {
    if (!this.client) return false;
    this.authError.set(null);
    const { error } = await this.client.auth.signUp({ email, password });
    if (error) {
      this.authError.set(error.message);
      return false;
    }
    return true;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user.set(null);
  }
}
