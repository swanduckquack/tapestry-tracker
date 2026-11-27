import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StitchDirection, StitchSection, TapestryProject } from '../../models/tapestry.model';
import { SectionEngineService } from '../../services/section-engine.service';
import { WakeLockService } from '../../services/wake-lock.service';

@Component({
  selector: 'app-section-queue',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="queue-panel">
      <!-- Overall Progress -->
      <div class="card">
        <div class="progress-header">
          <div class="progress-text">
            <span class="progress-pct">{{ progressPercent() }}%</span>
            <span class="progress-counts">
              {{ project().completedCount.toLocaleString() }} / {{ totalStitches().toLocaleString() }}
              stitches
            </span>
          </div>
          @if (sections()[0]; as active) {
            <span class="row-pill">
              Row {{ active.displayRow }} · {{ active.sideLabel }}
              {{ active.rowDirection === 'rtl' ? '←' : '→' }}
            </span>
          }
        </div>
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="progressPercent()"></div>
        </div>
        @if (upcomingStrip().totalStitches > 0) {
          <div class="strip-wrap">
            <div class="strip-header">
              <span>Remaining in row ({{ upcomingStrip().totalStitches }})</span>
              <div class="strip-totals">
                @for (t of upcomingStrip().totals; track t.color.id) {
                  <span class="strip-total-pill" [title]="t.color.name">
                    <span
                      class="yarn-dot"
                      [style.background]="t.color.hex"
                      [style.color]="isLightHex(t.color.hex) ? '#18181b' : '#ffffff'"
                    >
                      {{ t.color.symbol }}
                    </span>
                    {{ t.count }}
                  </span>
                }
              </div>
            </div>
            <div class="yarn-strip" role="img" aria-label="Upcoming stitches color strip">
              @for (run of upcomingStrip().runs; track $index) {
                <div
                  class="strip-seg"
                  [style.flex-grow]="run.count"
                  [style.background]="run.color.hex"
                  [title]="run.count + ' × ' + run.color.name"
                ></div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Active Section -->
      @if (sections()[0]; as active) {
        @let color = getColor(active.colorIndex);
        <div class="active-card">
          <div class="active-top">
            <span class="badge-now">Current Section</span>
            <span class="dir-tag">
              Row {{ active.displayRow }} · Cols {{ active.startCol }}–{{ active.endCol }} ({{
                active.rowDirection === 'rtl' ? 'R to L' : 'L to R'
              }})
            </span>
          </div>

          <div class="active-main">
            <div
              class="big-swatch"
              [style.background]="color.hex"
              [style.color]="isLightHex(color.hex) ? '#18181b' : '#ffffff'"
            >
              {{ color.symbol }}
            </div>

            <div class="active-details">
              <div class="stitch-count">
                {{ active.count }}
                <span>{{ active.count === 1 ? 'stitch' : 'stitches' }}</span>
              </div>
              <div class="color-name">{{ color.name }}</div>
            </div>
          </div>

          @if (active.count > 1) {
            <div class="step-row">
              <span class="step-label">Count as you go</span>
              <div class="step-buttons">
                @for (step of [1, 5, 10]; track step) {
                  @if (step < active.count) {
                    <button
                      type="button"
                      class="step-btn"
                      (click)="advanceStitchesClicked.emit(step)"
                    >
                      +{{ step }}
                    </button>
                  }
                }
              </div>
            </div>
          }

          <div class="active-actions">
            <button type="button" class="complete-btn" (click)="completeClicked.emit()">
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3.5 8.5l3 3 6-6.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Mark Completed
              <kbd>Space</kbd>
            </button>
            <button
              type="button"
              class="undo-btn"
              [disabled]="!canUndo()"
              (click)="undoClicked.emit()"
              title="Undo last completion (Z)"
            >
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M4.5 6.5H10a3.5 3.5 0 1 1 0 7H7" stroke-linecap="round" />
                <path d="M6.5 4L4 6.5 6.5 9" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Undo
              <kbd>Z</kbd>
            </button>
          </div>
        </div>
      } @else {
        <div class="card done-card">
          <svg class="done-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <h3>Tapestry Complete</h3>
          <p>All {{ totalStitches().toLocaleString() }} stitches have been marked off.</p>
          @if (canUndo()) {
            <button type="button" class="undo-btn" (click)="undoClicked.emit()">Undo Last</button>
          }
        </div>
      }

      <!-- Mobile Tab Switcher (hidden on desktop) -->
      <div class="mobile-tabs">
        <button
          type="button"
          class="tab-btn"
          [class.active]="mobileTab() === 'queue'"
          (click)="mobileTab.set('queue')"
        >
          Up Next ({{ Math.max(0, sections().length - 1) }})
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.active]="mobileTab() === 'settings'"
          (click)="mobileTab.set('settings')"
        >
          Settings &amp; Jump
        </button>
      </div>

      <!-- Up Next List -->
      @if (sections().length > 1) {
        <div class="up-next-section" [class.mobile-hidden]="mobileTab() !== 'queue'">
          <div class="section-heading">Up Next</div>
          <div class="up-next-list">
            @for (sec of sections().slice(1); track sec.startIndex) {
              @let c = getColor(sec.colorIndex);
              <div class="next-item">
                <div
                  class="mini-swatch"
                  [style.background]="c.hex"
                  [style.color]="isLightHex(c.hex) ? '#18181b' : '#ffffff'"
                >
                  {{ c.symbol }}
                </div>
                <div class="next-info">
                  <div class="next-primary">
                    <strong>{{ sec.count }} ×</strong> {{ c.name }}
                  </div>
                  <div class="next-meta">
                    Row {{ sec.displayRow }} ({{ sec.sideLabel }}
                    {{ sec.rowDirection === 'rtl' ? '←' : '→' }}) · Cols {{ sec.startCol }}–{{
                      sec.endCol
                    }}
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Quick Settings & Jump to Row -->
      <div class="card controls-card" [class.mobile-hidden]="mobileTab() !== 'settings'">
        <div class="control-row">
          <label for="maxChunk">Max stitches / card</label>
          <div class="chip-group">
            @for (preset of [0, 10, 15, 20]; track preset) {
              <button
                type="button"
                class="chip"
                [class.active]="project().maxChunkStitches === preset"
                (click)="settingsChanged.emit({ maxChunkStitches: preset })"
              >
                {{ preset === 0 ? 'All' : preset }}
              </button>
            }
            <input
              id="maxChunk"
              type="number"
              min="0"
              max="500"
              class="num-input"
              [ngModel]="project().maxChunkStitches"
              (ngModelChange)="settingsChanged.emit({ maxChunkStitches: +$event || 0 })"
              title="Custom max stitches per card (0 = full color run)"
            />
          </div>
        </div>

        <div class="control-row">
          <label for="queueLen">Sections shown</label>
          <div class="chip-group">
            @for (q of [3, 5, 8, 12]; track q) {
              <button
                type="button"
                class="chip"
                [class.active]="project().queueLength === q"
                (click)="settingsChanged.emit({ queueLength: q })"
              >
                {{ q }}
              </button>
            }
          </div>
        </div>

        <div class="control-row">
          <label for="dirSelect">Stitching order</label>
          <select
            id="dirSelect"
            class="select-input"
            [ngModel]="project().direction"
            (ngModelChange)="settingsChanged.emit({ direction: $event })"
          >
            <option value="bottom-up-serpentine">Bottom-Up, Alternating (RS/WS)</option>
            <option value="bottom-up-ltr">Bottom-Up, Always Left → Right</option>
            <option value="top-down-serpentine">Top-Down, Alternating (RS/WS)</option>
            <option value="top-down-ltr">Top-Down, Always Left → Right</option>
          </select>
        </div>

        <div class="control-row">
          <label for="jumpRow">Jump to row (1–{{ project().height }})</label>
          <div class="jump-row-group">
            <input
              id="jumpRow"
              type="number"
              min="1"
              [max]="project().height"
              class="num-input wide"
              placeholder="Row #"
              [ngModel]="jumpRowInput()"
              (ngModelChange)="jumpRowInput.set($event)"
            />
            <button type="button" class="chip" (click)="jumpToRow()">Jump</button>
          </div>
        </div>

        @if (wakeLock.isSupported) {
          <div class="control-row">
            <label for="wakeLockToggle">Keep screen awake</label>
            <button
              id="wakeLockToggle"
              type="button"
              class="chip"
              [class.active]="wakeLock.enabled()"
              (click)="wakeLock.toggle()"
            >
              {{ wakeLock.enabled() ? 'On' : 'Off' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .queue-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      overflow-y: auto;
    }

    .card {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 12px 14px;
    }

    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .progress-pct {
      font-size: 1rem;
      font-weight: 700;
      color: #f4f4f5;
      margin-right: 8px;
    }

    .progress-counts {
      font-size: 0.8rem;
      color: #a1a1aa;
    }

    .row-pill {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .progress-track {
      height: 6px;
      background: #27272a;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #f4f4f5;
      transition: width 0.2s ease;
    }

    .strip-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }

    .strip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.72rem;
      color: #a1a1aa;
    }

    .strip-totals {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .strip-total-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      color: #e4e4e7;
    }

    .yarn-dot {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-size: 0.62rem;
      font-weight: 700;
    }

    .yarn-strip {
      display: flex;
      height: 11px;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #27272a;
      background: #0d0d0f;
    }

    .strip-seg {
      min-width: 2px;
      height: 100%;
    }

    .step-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .step-label {
      font-size: 0.74rem;
      color: #71717a;
    }

    .step-buttons {
      display: flex;
      gap: 6px;
    }

    .step-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
    }

    .step-btn:hover {
      background: #27272a;
    }

    .active-card {
      background: #141416;
      border: 1.5px solid #e4e4e7;
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .active-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
    }

    .badge-now {
      background: #27272a;
      color: #f4f4f5;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 5px;
    }

    .dir-tag {
      font-size: 0.78rem;
      color: #a1a1aa;
      font-weight: 500;
    }

    .active-main {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .big-swatch {
      width: 58px;
      height: 58px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-size: 1.45rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .stitch-count {
      font-size: 1.75rem;
      font-weight: 700;
      color: #f4f4f5;
      line-height: 1.1;
    }

    .stitch-count span {
      font-size: 0.95rem;
      font-weight: 500;
      color: #a1a1aa;
    }

    .color-name {
      font-size: 0.9rem;
      font-weight: 500;
      color: #d4d4d8;
      margin-top: 3px;
    }

    .active-actions {
      display: flex;
      gap: 8px;
    }

    .icon {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
    }

    .complete-btn {
      flex: 1;
      background: #f4f4f5;
      color: #09090b;
      border: none;
      border-radius: 8px;
      padding: 11px 14px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
    }

    .complete-btn:hover {
      background: #e4e4e7;
    }

    .undo-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 11px 12px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .undo-btn:hover:not(:disabled) {
      background: #27272a;
    }

    .undo-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    kbd {
      background: rgba(128, 128, 128, 0.22);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.68rem;
      font-family: ui-monospace, monospace;
    }

    .done-card {
      text-align: center;
      padding: 24px;
    }

    .done-icon {
      width: 28px;
      height: 28px;
      color: #22c55e;
      margin-bottom: 6px;
    }

    .done-card h3 {
      margin: 0 0 4px;
      font-size: 1rem;
      color: #f4f4f5;
    }

    .done-card p {
      margin: 0 0 14px;
      font-size: 0.85rem;
      color: #a1a1aa;
    }

    .up-next-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .section-heading {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      padding-left: 2px;
    }

    .up-next-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .next-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 8px 10px;
    }

    .mini-swatch {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .next-primary {
      font-size: 0.86rem;
      color: #f4f4f5;
    }

    .next-meta {
      font-size: 0.75rem;
      color: #a1a1aa;
      margin-top: 1px;
    }

    .controls-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .control-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: #a1a1aa;
    }

    .chip-group,
    .jump-row-group {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .chip {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 9px;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
    }

    .chip.active {
      background: #f4f4f5;
      border-color: #f4f4f5;
      color: #09090b;
    }

    .num-input,
    .select-input {
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 0.78rem;
    }

    .num-input {
      width: 54px;
    }

    .num-input.wide {
      width: 78px;
    }

    .mobile-tabs {
      display: none;
    }

    @media (max-width: 960px) {
      .queue-panel {
        overflow: hidden;
        gap: 8px;
      }

      .card {
        padding: 9px 12px;
      }

      .mobile-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        order: 2;
        flex-shrink: 0;
      }

      .tab-btn {
        background: #141416;
        color: #a1a1aa;
        border: 1px solid #27272a;
        border-radius: 7px;
        padding: 7px 10px;
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
      }

      .tab-btn.active {
        background: #27272a;
        color: #f4f4f5;
        border-color: #3f3f46;
      }

      .progress-header {
        margin-bottom: 5px;
      }

      .strip-wrap {
        margin-top: 7px;
        gap: 4px;
      }

      .strip-header {
        font-size: 0.7rem;
        gap: 4px 8px;
      }

      .yarn-strip {
        height: 9px;
      }

      .step-btn,
      .complete-btn,
      .undo-btn {
        touch-action: manipulation;
      }

      .up-next-section,
      .controls-card {
        order: 3;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      .mobile-hidden {
        display: none !important;
      }

      .active-card,
      .done-card {
        order: 4;
        flex-shrink: 0;
        padding: 10px 12px;
        gap: 8px;
        margin-bottom: env(safe-area-inset-bottom, 0px);
      }

      .big-swatch {
        width: 44px;
        height: 44px;
        font-size: 1.15rem;
      }

      .stitch-count {
        font-size: 1.35rem;
      }

      .complete-btn,
      .undo-btn {
        padding: 12px 14px;
      }

      kbd {
        display: none;
      }
    }
  `,
})
export class SectionQueueComponent {
  private readonly engine = inject(SectionEngineService);
  readonly wakeLock = inject(WakeLockService);

  readonly project = input.required<TapestryProject>();
  readonly sections = input<StitchSection[]>([]);
  readonly canUndo = input(false);

  readonly completeClicked = output<void>();
  readonly advanceStitchesClicked = output<number>();
  readonly undoClicked = output<void>();
  readonly jumpToCountClicked = output<number>();
  readonly settingsChanged = output<{
    direction?: StitchDirection;
    maxChunkStitches?: number;
    queueLength?: number;
  }>();

  readonly jumpRowInput = signal<number | null>(null);
  readonly mobileTab = signal<'queue' | 'settings'>('queue');
  protected readonly Math = Math;

  readonly upcomingStrip = computed(() =>
    this.engine.getUpcomingRowStrip(this.project()),
  );

  readonly totalStitches = computed(() => this.project().width * this.project().height);
  readonly progressPercent = computed(() => {
    const total = this.totalStitches();
    if (total === 0) return '0.0';
    return ((this.project().completedCount / total) * 100).toFixed(1);
  });

  getColor(index: number) {
    return (
      this.project().colors[index] ?? {
        id: 'unknown',
        symbol: '?',
        hex: '#a1a1aa',
        name: 'Unknown',
      }
    );
  }

  jumpToRow(): void {
    const rowNum = this.jumpRowInput();
    const proj = this.project();
    if (!rowNum || rowNum < 1 || rowNum > proj.height) return;

    // Row 1 is always the first row in the active stitching order (bottom for bottom-up, top for top-down)
    const targetCount = (rowNum - 1) * proj.width;
    this.jumpToCountClicked.emit(targetCount);
  }

  isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }
}
