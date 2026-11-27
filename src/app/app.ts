import { Component, effect, HostListener, inject, signal } from '@angular/core';
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
          <svg class="brand-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-label="Tapestry Tracker">
            <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
            <path d="M7.5 2.5v15M12.5 2.5v15M2.5 7.5h15M2.5 12.5h15" />
          </svg>
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
          } @else {
            <span class="brand-name">Tapestry Tracker</span>
          }
        </div>

        <div class="topbar-actions">
          <button type="button" class="icon-btn primary" (click)="showImport.set(true)" title="Import Pixel Stitch PDF" aria-label="Import PDF">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7">
              <path d="M8 3v10M3 8h10" stroke-linecap="round" />
            </svg>
          </button>

          @if (store.activeProject()) {
            <button type="button" class="icon-btn" (click)="showLegend.set(true)" title="Yarn Colors" aria-label="Yarn Colors">
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="5.5" cy="6" r="1.4" />
                <circle cx="10.5" cy="6" r="1.4" />
                <circle cx="8" cy="10.5" r="1.4" />
                <rect x="2" y="2" width="12" height="12" rx="2.5" />
              </svg>
              <span class="count-badge">{{ store.activeProject()!.colors.length }}</span>
            </button>
          }

          <button type="button" class="icon-btn" (click)="showAuth.set(true)" [title]="supabase.isConfigured() ? 'Supabase Sync' : 'Local Only (Configure Sync)'" aria-label="Sync Settings">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4.5 11.5h7.2a2.3 2.3 0 0 0 .3-4.58A3.5 3.5 0 0 0 5.3 5.7 2.8 2.8 0 0 0 4.5 11.5Z" stroke-linejoin="round" />
            </svg>
            <span
              class="sync-dot"
              [class.synced]="store.syncStatus() === 'synced'"
              [class.syncing]="store.syncStatus() === 'syncing'"
              [class.error]="store.syncStatus() === 'error'"
            ></span>
          </button>
        </div>
      </header>

      <main class="workspace">
        @if (store.activeProject(); as project) {
          <div class="split-layout">
            <section class="canvas-pane">
              <app-tapestry-canvas
                #canvasComp
                [project]="project"
                [sections]="store.upcomingSections()"
                [rowGlowEvent]="rowGlowEvent()"
                (jumpRequested)="store.jumpToCount($event)"
              />
            </section>

            <aside class="queue-pane">
              <app-section-queue
                [project]="project"
                [sections]="store.upcomingSections()"
                [canUndo]="store.undoStack().length > 0"
                [cmPerStitch]="store.cmPerStitch()"
                [rowCelebration]="store.rowCelebrationEnabled()"
                (completeClicked)="store.completeCurrentSection()"
                (advanceStitchesClicked)="store.advanceStitches($event)"
                (undoClicked)="store.undo()"
                (jumpToCountClicked)="store.jumpToCount($event)"
                (cmPerStitchChanged)="store.setCmPerStitch($event)"
                (rowCelebrationChanged)="store.setRowCelebrationEnabled($event)"
                (stripSegmentClicked)="canvasComp.focusOnCell($event.row, $event.col)"
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

    @if (rowToast(); as toast) {
      <div class="row-toast" role="status" aria-live="polite">
        <svg class="toast-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="10" cy="10" r="8" class="toast-ring" />
          <path d="M6.5 10.3l2.3 2.3 4.7-5" stroke-linecap="round" stroke-linejoin="round" class="toast-tick" />
        </svg>
        <span class="toast-row">R{{ toast.completedRow }}</span>
        @if (toast.nextRow && toast.nextDir) {
          <span class="toast-sep">·</span>
          <span class="toast-next">
            R{{ toast.nextRow }}
            <svg class="toast-dir" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8">
              @if (toast.nextDir === 'rtl') {
                <path d="M11 7H3M6 4L3 7l3 3" stroke-linecap="round" stroke-linejoin="round" />
              } @else {
                <path d="M3 7h8M8 4l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
              }
            </svg>
          </span>
        }
      </div>
    }

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
        (colorHexChanged)="store.updateColorHex($event.colorId, $event.hex)"
        (colorReset)="store.resetColorHex($event)"
        (allColorsReset)="store.resetAllColors()"
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
      gap: 10px;
      padding: 6px 12px;
      height: 46px;
      background: #141416;
      border-bottom: 1px solid #27272a;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
      font-weight: 600;
      font-size: 0.92rem;
      letter-spacing: -0.01em;
      color: #f4f4f5;
    }

    .brand-icon {
      width: 18px;
      height: 18px;
      color: #f4f4f5;
      flex-shrink: 0;
    }

    .icon {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
      display: block;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .project-select {
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 7px;
      padding: 5px 9px;
      font-size: 0.8rem;
      max-width: 240px;
      min-width: 0;
    }

    .icon-btn {
      position: relative;
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 7px;
      height: 32px;
      min-width: 32px;
      padding: 0 8px;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }

    .icon-btn:hover {
      background: #27272a;
    }

    .icon-btn.primary {
      background: #f4f4f5;
      border-color: #f4f4f5;
      color: #09090b;
    }

    .icon-btn.primary:hover {
      background: #e4e4e7;
    }

    .count-badge {
      font-size: 0.72rem;
      color: #a1a1aa;
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

    .row-toast {
      position: fixed;
      top: 56px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: rgba(20, 20, 22, 0.94);
      backdrop-filter: blur(10px);
      border: 1px solid #3f3f46;
      border-radius: 999px;
      color: #f4f4f5;
      font-size: 0.84rem;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      pointer-events: none;
      z-index: 60;
      animation: toastPop 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .toast-check {
      width: 18px;
      height: 18px;
      color: #4ade80;
      flex-shrink: 0;
    }

    .toast-sep {
      color: #52525b;
    }

    .toast-next {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #a1a1aa;
    }

    .toast-dir {
      width: 13px;
      height: 13px;
      display: block;
    }

    @keyframes toastPop {
      0% {
        opacity: 0;
        transform: translate(-50%, -8px) scale(0.94);
      }
      100% {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
    }

    @media (max-width: 960px) and (orientation: portrait), (max-width: 600px) {
      .project-select {
        flex: 1;
        max-width: none;
      }

      .workspace {
        padding: 8px;
      }

      .split-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 36dvh 1fr;
        gap: 8px;
        height: 100%;
      }
    }

    @media (max-height: 520px) and (orientation: landscape) {
      .topbar {
        height: 38px;
        padding: 4px 10px;
      }

      .icon-btn {
        height: 28px;
        min-width: 28px;
      }

      .workspace {
        padding: 6px;
      }

      .split-layout {
        grid-template-columns: 1fr 310px;
        grid-template-rows: 1fr;
        gap: 8px;
        height: 100%;
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
  readonly rowGlowEvent = signal<{ visualRow: number; seq: number } | null>(null);
  readonly rowToast = signal<{
    completedRow: number;
    nextRow: number | null;
    nextDir: 'rtl' | 'ltr' | null;
  } | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const ev = this.store.rowCompletedEvent();
      if (!ev) return;
      this.rowGlowEvent.set({ visualRow: ev.completedVisualRow, seq: ev.seq });
      this.rowToast.set({
        completedRow: ev.completedRow,
        nextRow: ev.nextRow,
        nextDir: ev.nextDir,
      });
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.rowToast.set(null), 2600);
    });
  }

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
