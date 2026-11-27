import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WakeLockService {
  readonly isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  readonly enabled = signal(false);
  readonly isActive = signal(false);

  private sentinel: WakeLockSentinel | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.enabled() && !this.sentinel) {
          this.acquire();
        }
      });
    }
  }

  async toggle(nextState?: boolean): Promise<void> {
    const target = nextState ?? !this.enabled();
    this.enabled.set(target);
    if (target) {
      await this.acquire();
    } else {
      await this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (!this.isSupported) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.isActive.set(true);
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
        this.isActive.set(false);
      });
    } catch {
      this.isActive.set(false);
    }
  }

  private async release(): Promise<void> {
    if (!this.sentinel) {
      this.isActive.set(false);
      return;
    }
    try {
      await this.sentinel.release();
    } catch {
      // Ignore release errors
    } finally {
      this.sentinel = null;
      this.isActive.set(false);
    }
  }
}
