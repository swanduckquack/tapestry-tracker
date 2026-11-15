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
          <svg class="brand-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
            <path d="M7.5 2.5v15M12.5 2.5v15M2.5 7.5h15M2.5 12.5h15" />
          </svg>
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
                <option [value]="p.id">{{ p.name }} ({{ p.width }} × {{ p.height }})</option>
              }
            </select>
          }

          <button type="button" class="nav-btn primary" (click)="showImport.set(true)">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M8 3v10M3 8h10" stroke-linecap="round" />
            </svg>
            Import PDF
          </button>

          @if (store.activeProject()) {
            <button type="button" class="nav-btn" (click)="showLegend.set(true)">
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="5.5" cy="6" r="1.5" />
                <circle cx="10.5" cy="6" r="1.5" />
                <circle cx="8" cy="10.5" r="1.5" />
                <rect x="2" y="2" width="12" height="12" rx="2.5" />
              </svg>
              Colors ({{ store.activeProject()!.colors.length }})
            </button>
          }

          <button type="button" class="nav-btn" (click)="showAuth.set(true)">
            <span
              class="sync-dot"
              [class.synced]="store.syncStatus() === 'synced'"
              [class.syncing]="store.syncStatus() === 'syncing'"
              [class.error]="store.syncStatus() === 'error'"
            ></span>
            {{ supabase.isConfigured() ? 'Supabase Sync' : 'Local Only' }}
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
              <svg class="empty-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="4" y="4" width="24" height="24" rx="3" />
                <path d="M12 4v24M20 4v24M4 12h24M4 20h24" />
              </svg>
              <h1>Import a Pixel Stitch pattern</h1>
              <p>
                Upload your Pixel Stitch PDF to extract the grid, colors, and symbols. Track your
                next stitch sections while watching progress on the full tapestry.
              </p>
              <div class="empty-actions">
                <button type="button" class="hero-btn primary" (click)="showImport.set(true)">
                  Import Pixel Stitch PDF
                </button>
                <button type="button" class="hero-btn" (click)="loadSample()">
                  Load Sample Pattern
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
      background: #0d0d0f;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 18px;
      background: #141416;
      border-bottom: 1px solid #27272a;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.95rem;
      letter-spacing: -0.01em;
      color: #f4f4f5;
    }

    .brand-icon {
      width: 18px;
      height: 18px;
      color: #f4f4f5;
    }

    .icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .project-select {
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 7px;
      padding: 6px 10px;
      font-size: 0.82rem;
      max-width: 240px;
    }

    .nav-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 7px;
      padding: 6px 11px;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .nav-btn:hover {
      background: #27272a;
    }

    .nav-btn.primary {
      background: #f4f4f5;
      border-color: #f4f4f5;
      color: #09090b;
    }

    .nav-btn.primary:hover {
      background: #e4e4e7;
    }

    .sync-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #a1a1aa;
    }

    .sync-dot.synced {
      background: #16a34a;
    }

    .sync-dot.syncing {
      background: #d97706;
    }

    .sync-dot.error {
      background: #dc2626;
    }

    .workspace {
      flex: 1;
      min-height: 0;
      padding: 12px;
    }

    .split-layout {
      display: grid;
      grid-template-columns: 1fr 390px;
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
      max-width: 460px;
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 32px;
      text-align: center;
    }

    .empty-icon {
      width: 34px;
      height: 34px;
      color: #a1a1aa;
      margin-bottom: 12px;
    }

    .empty-card h1 {
      margin: 0 0 8px;
      font-size: 1.2rem;
      font-weight: 600;
      color: #f4f4f5;
    }

    .empty-card p {
      margin: 0 0 20px;
      color: #a1a1aa;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .empty-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .hero-btn {
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 9px 16px;
      font-size: 0.88rem;
      font-weight: 500;
      cursor: pointer;
    }

    .hero-btn:hover {
      background: #27272a;
    }

    .hero-btn.primary {
      background: #f4f4f5;
      border-color: #f4f4f5;
      color: #09090b;
    }

    .hero-btn.primary:hover {
      background: #e4e4e7;
    }

    @media (max-width: 960px) {
      .app-shell {
        height: auto;
        min-height: 100dvh;
        overflow: auto;
      }

      .split-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 48vh auto;
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
