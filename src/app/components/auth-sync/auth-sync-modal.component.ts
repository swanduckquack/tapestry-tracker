import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-auth-sync-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h2>Supabase Sync</h2>
            <p class="subtitle">
              Connect your personal Supabase project to sync tapestries &amp; progress across
              devices.
            </p>
          </div>
          <button type="button" class="close-x" (click)="closed.emit()" aria-label="Close">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <label>
            <span>Supabase Project URL</span>
            <input
              type="url"
              class="text-input"
              [(ngModel)]="supabaseUrl"
              placeholder="https://xxxxx.supabase.co"
            />
          </label>

          <label>
            <span>Publishable Key</span>
            <input
              type="password"
              class="text-input"
              [(ngModel)]="supabaseAnonKey"
              placeholder="sb_publishable_..."
            />
          </label>

          @if (savedMsg()) {
            <div class="info-box">{{ savedMsg() }}</div>
          }

          <div class="actions">
            <button type="button" class="primary-btn" (click)="saveConfig()">
              Save &amp; Connect
            </button>
            @if (supabase.isConfigured()) {
              <button type="button" class="secondary-btn" (click)="disconnect()">
                Use Local Only
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 50;
    }

    .modal-card {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 12px;
      width: 100%;
      max-width: 440px;
      color: #f4f4f5;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 20px;
      border-bottom: 1px solid #27272a;
    }

    h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .subtitle {
      margin: 3px 0 0;
      font-size: 0.82rem;
      color: #a1a1aa;
    }

    .close-x {
      background: transparent;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      padding: 4px;
    }

    .icon {
      width: 16px;
      height: 16px;
      display: block;
    }

    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
      color: #a1a1aa;
    }

    .text-input {
      background: #0d0d0f;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 7px;
      padding: 8px 10px;
      font-size: 0.85rem;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .primary-btn {
      flex: 1;
      background: #f4f4f5;
      color: #09090b;
      border: none;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }

    .secondary-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }

    .info-box {
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid #166534;
      color: #86efac;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.8rem;
    }
  `,
})
export class AuthSyncModalComponent {
  readonly supabase = inject(SupabaseService);
  readonly closed = output<void>();

  supabaseUrl = this.supabase.loadConfig().url;
  supabaseAnonKey = this.supabase.loadConfig().anonKey;
  readonly savedMsg = signal<string | null>(null);

  saveConfig(): void {
    this.supabase.configure(this.supabaseUrl, this.supabaseAnonKey);
    this.savedMsg.set('Connected. Your projects will sync automatically.');
  }

  disconnect(): void {
    this.supabaseUrl = '';
    this.supabaseAnonKey = '';
    this.supabase.configure('', '');
    this.savedMsg.set('Switched to local-only mode.');
  }
}
