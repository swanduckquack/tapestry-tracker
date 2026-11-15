import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StitchDirection, StitchSection, TapestryProject } from '../../models/tapestry.model';
import { SectionEngineService } from '../../services/section-engine.service';

@Component({
  selector: 'app-section-queue',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="queue-panel">
      <!-- Overall Progress -->
      <div class="progress-card">
        <div class="progress-header">
          <div>
            <span class="progress-pct">{{ progressPercent() }}%</span>
            <span class="progress-counts">
              {{ project().completedCount.toLocaleString() }} / {{ totalStitches().toLocaleString() }}
              stitches
            </span>
          </div>
          @if (sections()[0]; as active) {
            <span class="row-pill">
              Row {{ active.displayRow }} • {{ active.sideLabel }}
              {{ active.rowDirection === 'rtl' ? '←' : '→' }}
            </span>
          }
        </div>
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="progressPercent()"></div>
        </div>
      </div>

      <!-- Active Section -->
      @if (sections()[0]; as active) {
        @let color = getColor(active.colorIndex);
        <div class="active-card">
          <div class="active-top">
            <span class="badge-now">STITCH NOW</span>
            <span class="dir-tag">
              Row {{ active.displayRow }} • Cols {{ active.startCol }}
              {{ active.rowDirection === 'rtl' ? '→' : '→' }} {{ active.endCol }} ({{
                active.rowDirection === 'rtl' ? 'R to L' : 'L to R'
              }})
            </span>
          </div>

          <div class="active-main">
            <div
              class="big-swatch"
              [style.background]="color.hex"
              [style.color]="isLightHex(color.hex) ? '#0f172a' : '#ffffff'"
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

          <div class="active-actions">
            <button
              type="button"
              class="complete-btn"
              (click)="completeClicked.emit()"
            >
              ✓ Mark Completed <kbd>Space</kbd>
            </button>
            <button
              type="button"
              class="undo-btn"
              [disabled]="!canUndo()"
              (click)="undoClicked.emit()"
              title="Undo last completion (Z)"
            >
              ↩ Undo <kbd>Z</kbd>
            </button>
          </div>
        </div>
      } @else {
        <div class="done-card">
          <div class="done-emoji">🎉</div>
          <h3>Tapestry Complete!</h3>
          <p>All {{ totalStitches().toLocaleString() }} stitches have been marked off.</p>
          @if (canUndo()) {
            <button type="button" class="undo-btn" (click)="undoClicked.emit()">
              ↩ Undo Last
            </button>
          }
        </div>
      }

      <!-- Up Next List -->
      @if (sections().length > 1) {
        <div class="up-next-section">
          <div class="section-heading">Up Next</div>
          <div class="up-next-list">
            @for (sec of sections().slice(1); track sec.startIndex) {
              @let c = getColor(sec.colorIndex);
              <div class="next-item">
                <div
                  class="mini-swatch"
                  [style.background]="c.hex"
                  [style.color]="isLightHex(c.hex) ? '#0f172a' : '#ffffff'"
                >
                  {{ c.symbol }}
                </div>
                <div class="next-info">
                  <div class="next-primary">
                    <strong>{{ sec.count }} ×</strong> {{ c.name }}
                  </div>
                  <div class="next-meta">
                    Row {{ sec.displayRow }} ({{ sec.sideLabel }}
                    {{ sec.rowDirection === 'rtl' ? '←' : '→' }}) • Cols {{ sec.startCol }}–{{
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
      <div class="controls-card">
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
                {{ preset === 0 ? 'Full Run' : preset }}
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
      </div>
    </div>
  `,
  styles: `
    .queue-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
      height: 100%;
      overflow-y: auto;
    }

    .progress-card,
    .controls-card {
      background: #111c33;
      border: 1px solid #1e293b;
      border-radius: 14px;
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
      font-size: 1.15rem;
      font-weight: 700;
      color: #38bdf8;
      margin-right: 8px;
    }

    .progress-counts {
      font-size: 0.85rem;
      color: #94a3b8;
    }

    .row-pill {
      background: #1e293b;
      color: #e2e8f0;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
    }

    .progress-track {
      height: 8px;
      background: #0f172a;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0284c7, #38bdf8);
      transition: width 0.2s ease;
    }

    .active-card {
      background: linear-gradient(180deg, #16233d 0%, #111c33 100%);
      border: 2px solid #38bdf8;
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 10px 30px rgba(2, 132, 199, 0.18);
    }

    .active-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 6px;
    }

    .badge-now {
      background: #0284c7;
      color: #fff;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 3px 8px;
      border-radius: 6px;
    }

    .dir-tag {
      font-size: 0.82rem;
      color: #cbd5e1;
      font-weight: 500;
    }

    .active-main {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .big-swatch {
      width: 68px;
      height: 68px;
      border-radius: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-size: 1.7rem;
      font-weight: 800;
      flex-shrink: 0;
    }

    .stitch-count {
      font-size: 2rem;
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.1;
    }

    .stitch-count span {
      font-size: 1.05rem;
      font-weight: 600;
      color: #94a3b8;
    }

    .color-name {
      font-size: 1rem;
      font-weight: 600;
      color: #e2e8f0;
      margin-top: 4px;
    }

    .active-actions {
      display: flex;
      gap: 10px;
    }

    .complete-btn {
      flex: 1;
      background: #10b981;
      color: #052e16;
      border: none;
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 1.02rem;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: transform 0.08s ease, background 0.15s ease;
    }

    .complete-btn:hover {
      background: #34d399;
    }

    .complete-btn:active {
      transform: scale(0.98);
    }

    .undo-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .undo-btn:hover:not(:disabled) {
      background: #334155;
    }

    .undo-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    kbd {
      background: rgba(0, 0, 0, 0.22);
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 0.72rem;
      font-family: ui-monospace, monospace;
    }

    .done-card {
      background: #111c33;
      border: 2px solid #10b981;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      color: #f8fafc;
    }

    .done-emoji {
      font-size: 2.2rem;
      margin-bottom: 8px;
    }

    .up-next-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-heading {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      padding-left: 2px;
    }

    .up-next-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .next-item {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #111c33;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 10px 12px;
    }

    .mini-swatch {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      flex-shrink: 0;
    }

    .next-primary {
      font-size: 0.95rem;
      color: #f1f5f9;
    }

    .next-meta {
      font-size: 0.78rem;
      color: #94a3b8;
      margin-top: 2px;
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
      font-size: 0.83rem;
      color: #cbd5e1;
    }

    .chip-group,
    .jump-row-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .chip {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }

    .chip.active {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .num-input,
    .select-input {
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 0.8rem;
    }

    .num-input {
      width: 60px;
    }

    .num-input.wide {
      width: 82px;
    }

    @media (max-width: 768px) {
      kbd {
        display: none;
      }
    }
  `,
})
export class SectionQueueComponent {
  private readonly engine = inject(SectionEngineService);

  readonly project = input.required<TapestryProject>();
  readonly sections = input<StitchSection[]>([]);
  readonly canUndo = input(false);

  readonly completeClicked = output<void>();
  readonly undoClicked = output<void>();
  readonly jumpToCountClicked = output<number>();
  readonly settingsChanged = output<{
    direction?: StitchDirection;
    maxChunkStitches?: number;
    queueLength?: number;
  }>();

  readonly jumpRowInput = signal<number | null>(null);

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
        hex: '#64748b',
        name: 'Unknown',
      }
    );
  }

  jumpToRow(): void {
    const rowNum = this.jumpRowInput();
    const proj = this.project();
    if (!rowNum || rowNum < 1 || rowNum > proj.height) return;

    const visualRow = rowNum - 1;
    const isBottomUp = proj.direction.startsWith('bottom-up');
    const stitchRowIndex = isBottomUp ? proj.height - 1 - visualRow : visualRow;
    const targetCount = stitchRowIndex * proj.width;
    this.jumpToCountClicked.emit(targetCount);
  }

  isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }
}
