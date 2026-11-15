import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthSyncModalComponent } from './components/auth-sync/auth-sync-modal.component';
import { ColorLegendModalComponent } from './components/color-legend/color-legend-modal.component';
import { ImportModalComponent } from './components/import-modal/import-modal.component';
import { SectionQueueComponent } from './components/section-queue/section-queue.component';
import { TapestryCanvasComponent } from './components/tapestry-canvas/tapestry-canvas.component';
import { PdfParserService } from './services/pdf-parser.service';
import { ProjectStoreService } from './services/project-store.service';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    TapestryCanvasComponent,
    SectionQueueComponent,
    ColorLegendModalComponent,
    ImportModalComponent,
    AuthSyncModalComponent,
  ],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-icon">🧶</span>
          <span class="brand-name">Tapestry Tracker</span>
        </div>

        <div class="topbar-actions">
          @if (store.projects().length > 0) {
            <select
              class="project-select"
              [ngModel]="store.activeProjectId()"
              (ngModelChange)="store.selectProject($event)"
              aria-label="Select tapestry project"
            >
              @for (p of store.projects(); track p.id) {
                <option [value]="p.id">{{ p.name }} ({{ p.width }}×{{ p.height }})</option>
              }
            </select>
          }

          <button type="button" class="nav-btn primary" (click)="showImport.set(true)">
            + Import PDF
          </button>

          @if (store.activeProject()) {
            <button type="button" class="nav-btn" (click)="showLegend.set(true)">
              🎨 Colors ({{ store.activeProject()!.colors.length }})
            </button>
          }

          <button type="button" class="nav-btn sync-btn" (click)="showAuth.set(true)">
            <span
              class="sync-dot"
              [class.synced]="store.syncStatus() === 'synced'"
              [class.syncing]="store.syncStatus() === 'syncing'"
              [class.error]="store.syncStatus() === 'error'"
            ></span>
            {{ supabase.user() ? 'Synced' : 'Sync / Sign In' }}
          </button>
        </div>
      </header>

      <main class="workspace">
        @if (store.activeProject(); as project) {
          <div class="split-layout">
            <section class="canvas-pane">
              <app-tapestry-canvas
                [project]="project"
                [sections]="store.upcomingSections()"
                (jumpRequested)="store.jumpToCount($event)"
              />
            </section>

            <aside class="queue-pane">
              <app-section-queue
                [project]="project"
                [sections]="store.upcomingSections()"
                [canUndo]="store.undoStack().length > 0"
                (completeClicked)="store.completeCurrentSection()"
                (undoClicked)="store.undo()"
                (jumpToCountClicked)="store.jumpToCount($event)"
                (settingsChanged)="store.updateProjectSettings($event)"
              />
            </aside>
          </div>
        } @else {
          <div class="empty-state">
            <div class="empty-card">
              <div class="empty-icon">🧶</div>
              <h1>Track your crochet tapestry without losing your place</h1>
              <p>
                Import your Pixel Stitch PDF to automatically extract the stitch grid, colors, and
                symbols. Work section by section while watching your progress fill in on the full
                tapestry.
              </p>
              <div class="empty-actions">
                <button type="button" class="hero-btn primary" (click)="showImport.set(true)">
                  Import Pixel Stitch PDF
                </button>
                <button type="button" class="hero-btn" (click)="loadSample()">
                  Try Sample Tapestry
                </button>
              </div>
            </div>
          </div>
        }
      </main>
    </div>

    @if (showImport()) {
      <app-import-modal
        (closed)="showImport.set(false)"
        (imported)="store.addProject($event)"
      />
    }

    @if (showLegend() && store.activeProject()) {
      <app-color-legend-modal
        [project]="store.activeProject()!"
        (closed)="showLegend.set(false)"
        (colorRenamed)="store.renameColor($event.colorId, $event.name)"
        (colorMerged)="store.mergeColors($event.sourceId, $event.targetId)"
      />
    }

    @if (showAuth()) {
      <app-auth-sync-modal (closed)="showAuth.set(false)" />
    }
  `,
  styles: `
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: -0.01em;
    }

    .brand-icon {
      font-size: 1.25rem;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .project-select {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 9px;
      padding: 7px 10px;
      font-size: 0.85rem;
      max-width: 220px;
    }

    .nav-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 9px;
      padding: 7px 12px;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .nav-btn:hover {
      background: #334155;
    }

    .nav-btn.primary {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .nav-btn.primary:hover {
      background: #0369a1;
    }

    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }

    .sync-dot.synced {
      background: #10b981;
    }

    .sync-dot.syncing {
      background: #f59e0b;
    }

    .sync-dot.error {
      background: #ef4444;
    }

    .workspace {
      flex: 1;
      min-height: 0;
      padding: 12px;
    }

    .split-layout {
      display: grid;
      grid-template-columns: 1fr 410px;
      gap: 12px;
      height: 100%;
    }

    .canvas-pane,
    .queue-pane {
      min-height: 0;
      height: 100%;
    }

    .empty-state {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .empty-card {
      max-width: 520px;
      background: #111c33;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 32px;
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }

    .empty-card h1 {
      margin: 0 0 10px;
      font-size: 1.45rem;
      line-height: 1.25;
    }

    .empty-card p {
      margin: 0 0 22px;
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .empty-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .hero-btn {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 12px 18px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
    }

    .hero-btn.primary {
      background: #0284c7;
      border-color: #38bdf8;
    }

    @media (max-width: 960px) {
      .app-shell {
        height: auto;
        min-height: 100dvh;
        overflow: auto;
      }

      .split-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 46vh auto;
        height: auto;
      }

      .queue-pane {
        height: auto;
      }
    }
  `,
})
export class App {
  readonly store = inject(ProjectStoreService);
  readonly supabase = inject(SupabaseService);
  private readonly parser = inject(PdfParserService);

  readonly showImport = signal(false);
  readonly showLegend = signal(false);
  readonly showAuth = signal(false);

  loadSample(): void {
    this.store.addProject(this.parser.createSampleProject());
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.showImport() || this.showLegend() || this.showAuth()) return;
    if (!this.store.activeProject()) return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      this.store.completeCurrentSection();
    } else if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      this.store.undo();
    }
  }
}
