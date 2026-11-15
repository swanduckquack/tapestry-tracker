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
            <h2>Supabase Sync &amp; Account</h2>
            <p class="subtitle">
              Sync your tapestries &amp; stitch progress across devices, or continue locally.
            </p>
          </div>
          <button type="button" class="close-x" (click)="closed.emit()">✕</button>
        </div>

        <div class="modal-body">
          @if (supabase.user(); as user) {
            <div class="signed-in-box">
              <div>
                <div class="status-label">Signed in as</div>
                <div class="user-email">{{ user.email }}</div>
              </div>
              <button type="button" class="secondary-btn" (click)="supabase.signOut()">
                Sign Out
              </button>
            </div>
          } @else {
            <!-- Supabase Project Config -->
            <details [open]="!supabase.isConfigured()" class="config-details">
              <summary>
                Supabase Project Settings
                <span class="badge">{{ supabase.isConfigured() ? 'Configured' : 'Not set' }}</span>
              </summary>
              <div class="config-form">
                <label>
                  <span>Supabase URL</span>
                  <input
                    type="url"
                    class="text-input"
                    [(ngModel)]="supabaseUrl"
                    placeholder="https://xxxxx.supabase.co"
                  />
                </label>
                <label>
                  <span>Anon Public Key</span>
                  <input
                    type="password"
                    class="text-input"
                    [(ngModel)]="supabaseAnonKey"
                    placeholder="eyJhbGciOi..."
                  />
                </label>
                <button type="button" class="secondary-btn" (click)="saveConfig()">
                  Save Connection
                </button>
              </div>
            </details>

            @if (supabase.isConfigured()) {
              <div class="auth-form">
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    class="text-input"
                    [(ngModel)]="email"
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    class="text-input"
                    [(ngModel)]="password"
                    placeholder="••••••••"
                  />
                </label>

                @if (supabase.authError(); as err) {
                  <div class="error-box">{{ err }}</div>
                }
                @if (infoMsg()) {
                  <div class="info-box">{{ infoMsg() }}</div>
                }

                <div class="auth-actions">
                  <button
                    type="button"
                    class="primary-btn"
                    [disabled]="loading()"
                    (click)="onSignIn()"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    class="secondary-btn"
                    [disabled]="loading()"
                    (click)="onSignUp()"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            }
          }

          <button type="button" class="local-btn" (click)="closed.emit()">
            Continue Locally (Saved in Browser)
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 50;
    }

    .modal-card {
      background: #111c33;
      border: 1px solid #334155;
      border-radius: 16px;
      width: 100%;
      max-width: 460px;
      color: #f8fafc;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 20px;
      border-bottom: 1px solid #1e293b;
    }

    h2 {
      margin: 0;
      font-size: 1.15rem;
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 0.84rem;
      color: #94a3b8;
    }

    .close-x {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.2rem;
      cursor: pointer;
    }

    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .config-details {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 10px 14px;
    }

    summary {
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .badge {
      background: #1e293b;
      color: #94a3b8;
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .config-form,
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
      color: #cbd5e1;
    }

    .text-input {
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.88rem;
    }

    .auth-actions {
      display: flex;
      gap: 10px;
      margin-top: 4px;
    }

    .primary-btn {
      flex: 1;
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
    }

    .secondary-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .local-btn {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .local-btn:hover {
      color: #e2e8f0;
      border-color: #334155;
    }

    .signed-in-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f172a;
      border: 1px solid #10b981;
      border-radius: 12px;
      padding: 12px 14px;
    }

    .status-label {
      font-size: 0.75rem;
      color: #34d399;
    }

    .user-email {
      font-weight: 700;
      font-size: 0.92rem;
    }

    .error-box {
      background: rgba(239, 68, 68, 0.14);
      border: 1px solid #ef4444;
      color: #fca5a5;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
    }

    .info-box {
      background: rgba(16, 185, 129, 0.14);
      border: 1px solid #10b981;
      color: #6ee7b7;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
    }
  `,
})
export class AuthSyncModalComponent {
  readonly supabase = inject(SupabaseService);
  readonly closed = output<void>();

  supabaseUrl = this.supabase.loadConfig().url;
  supabaseAnonKey = this.supabase.loadConfig().anonKey;
  email = '';
  password = '';

  readonly loading = signal(false);
  readonly infoMsg = signal<string | null>(null);

  saveConfig(): void {
    this.supabase.configure(this.supabaseUrl, this.supabaseAnonKey);
  }

  async onSignIn(): Promise<void> {
    this.loading.set(true);
    this.infoMsg.set(null);
    const ok = await this.supabase.signIn(this.email, this.password);
    this.loading.set(false);
    if (ok) {
      this.closed.emit();
    }
  }

  async onSignUp(): Promise<void> {
    this.loading.set(true);
    this.infoMsg.set(null);
    const ok = await this.supabase.signUp(this.email, this.password);
    this.loading.set(false);
    if (ok) {
      this.infoMsg.set('Account created! Check your email if confirmation is enabled.');
    }
  }
}
