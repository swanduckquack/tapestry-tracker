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
      <!-- Progress + Interactive Remaining-Row Yarn Strip -->
      <div class="card progress-card">
        <div class="progress-header">
          <div class="progress-text">
            <span class="progress-pct">{{ progressPercent() }}%</span>
            <span class="progress-counts">
              {{ project().completedCount.toLocaleString() }}/{{ totalStitches().toLocaleString() }}
            </span>
          </div>
          @if (sections()[0]; as active) {
            <span class="row-pill" [title]="'Row ' + active.displayRow + ' (' + active.sideLabel + ')'">
              R{{ active.displayRow }}
              <svg class="dir-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7">
                @if (active.rowDirection === 'rtl') {
                  <path d="M11 7H3M6 4L3 7l3 3" stroke-linecap="round" stroke-linejoin="round" />
                } @else {
                  <path d="M3 7h8M8 4l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
                }
              </svg>
            </span>
          }
        </div>
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="progressPercent()"></div>
        </div>

        @if (upcomingStrip().totalStitches > 0) {
          <div class="strip-wrap">
            <div class="strip-header">
              <div class="strip-totals">
                @for (t of upcomingStrip().totals; track t.color.id) {
                  <span class="strip-total-pill" [title]="t.color.name + ': ' + t.count + ' left in row'">
                    <span
                      class="yarn-dot"
                      [style.background]="t.color.hex"
                      [style.color]="isLightHex(t.color.hex) ? '#18181b' : '#ffffff'"
                    >
                      {{ t.color.symbol }}
                    </span>
                    {{ t.count }}@if (cmPerStitch() > 0) {<span class="len-hint">·{{ formatYarnLen(t.count) }}</span>}
                  </span>
                }
              </div>
              <span class="rem-count" title="Remaining stitches in row">{{ upcomingStrip().totalStitches }}</span>
            </div>
            <div class="yarn-strip" role="img" aria-label="Remaining stitches color strip">
              @for (run of upcomingStrip().runs; track $index) {
                <button
                  type="button"
                  class="strip-seg"
                  [style.flex-grow]="run.count"
                  [style.background]="run.color.hex"
                  [title]="run.count + ' × ' + run.color.name + (run.offsetFromNow > 0 ? ' (+' + run.offsetFromNow + ' st)' : ' (now)')"
                  (click)="onStripClick(run)"
                ></button>
              }
            </div>
            @if (selectedStripInfo(); as info) {
              <div class="strip-readout">{{ info }}</div>
            }
          </div>
        }
      </div>

      <!-- Minimal 3-Part Current Section Card -->
      @if (sections()[0]; as active) {
        @let color = getColor(active.colorIndex);
        <div class="active-card">
          <div class="active-top">
            <span class="coords">
              R{{ active.displayRow }} · {{ active.startCol }}–{{ active.endCol }}
              <svg class="dir-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
                @if (active.rowDirection === 'rtl') {
                  <path d="M11 7H3M6 4L3 7l3 3" stroke-linecap="round" stroke-linejoin="round" />
                } @else {
                  <path d="M3 7h8M8 4l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
                }
              </svg>
            </span>

            @if (nextAppearance(); as next) {
              <span class="carry-badge" [title]="'Returns in ' + next.gapStitches + ' stitches in this row'">
                <svg class="mini-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2.5 9.5a4.5 4.5 0 0 1 8.5-2" stroke-linecap="round" />
                  <path d="M9.5 5.5l1.8 2-2.3.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ next.gapStitches }}
              </span>
            } @else {
              <span class="carry-badge drop" title="Last of this color in this row — safe to cut/drop">
                <svg class="mini-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="4" cy="4.2" r="1.5" />
                  <circle cx="4" cy="9.8" r="1.5" />
                  <path d="M5.2 5.2L11.5 10M5.2 8.8L11.5 4" stroke-linecap="round" />
                </svg>
              </span>
            }
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
                @if (cmPerStitch() > 0) {
                  <span class="len-badge">~{{ formatYarnLen(active.count) }}</span>
                }
              </div>
              <div class="color-name">{{ color.name }}</div>
            </div>

            @if (active.count > 1) {
              <div class="step-buttons">
                @for (step of [1, 5, 10]; track step) {
                  @if (step < active.count) {
                    <button
                      type="button"
                      class="step-btn"
                      [title]="'Advance ' + step + ' stitches'"
                      (click)="advanceStitchesClicked.emit(step)"
                    >
                      +{{ step }}
                    </button>
                  }
                }
              </div>
            }
          </div>

          <div class="active-actions">
            <button
              type="button"
              class="complete-btn"
              (click)="completeClicked.emit()"
              title="Complete section (Space)"
              aria-label="Complete section"
            >
              <!-- Stylized completed crochet stitch / check icon -->
              <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M5 13l4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="undo-btn"
              [disabled]="!canUndo()"
              (click)="undoClicked.emit()"
              title="Undo (Z)"
              aria-label="Undo"
            >
              <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                <path d="M7 9h7.5a4.5 4.5 0 1 1 0 9H10" stroke-linecap="round" />
                <path d="M10 6L6.5 9 10 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      } @else {
        <div class="card done-card">
          <svg class="done-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <h3>Complete</h3>
          @if (canUndo()) {
            <button type="button" class="undo-btn" (click)="undoClicked.emit()" title="Undo" aria-label="Undo">
              <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                <path d="M7 9h7.5a4.5 4.5 0 1 1 0 9H10" stroke-linecap="round" />
                <path d="M10 6L6.5 9 10 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          }
        </div>
      }

      <!-- Unified 2-Icon Tab Switcher (Desktop & Mobile) -->
      <div class="panel-tabs">
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'queue'"
          (click)="activeTab.set('queue')"
          title="Upcoming sections"
          aria-label="Upcoming sections"
        >
          <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 4.5h10M3 8h10M3 11.5h6.5" stroke-linecap="round" />
          </svg>
          <span class="tab-count">{{ Math.max(0, sections().length - 1) }}</span>
        </button>
        <button
          type="button"
          class="tab-btn"
          [class.active]="activeTab() === 'settings'"
          (click)="activeTab.set('settings')"
          title="Settings & Jump to row"
          aria-label="Settings"
        >
          <svg class="tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke-linecap="round" />
            <circle cx="5.5" cy="4.5" r="1.4" fill="#141416" />
            <circle cx="10.5" cy="8" r="1.4" fill="#141416" />
            <circle cx="6.5" cy="11.5" r="1.4" fill="#141416" />
          </svg>
        </button>
      </div>

      <!-- Queue Tab -->
      @if (activeTab() === 'queue') {
        <div class="tab-body">
          @if (sections().length > 1) {
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
                      <strong>{{ sec.count }}</strong>
                      <span class="next-color">{{ c.name }}</span>
                    </div>
                    <div class="next-meta">
                      R{{ sec.displayRow }} · {{ sec.startCol }}–{{ sec.endCol }}
                      {{ sec.rowDirection === 'rtl' ? '←' : '→' }}
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Settings Tab -->
      @if (activeTab() === 'settings') {
        <div class="card tab-body controls-card">
          <div class="control-row">
            <label for="jumpRow" class="ctrl-label">
              <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 4.5l4.5 3.5L3 11.5V4.5ZM8.5 4.5L13 8l-4.5 3.5V4.5Z" stroke-linejoin="round" />
              </svg>
              Row (1–{{ project().height }})
            </label>
            <div class="jump-row-group">
              <input
                id="jumpRow"
                type="number"
                min="1"
                [max]="project().height"
                class="num-input wide"
                placeholder="#"
                [ngModel]="jumpRowInput()"
                (ngModelChange)="jumpRowInput.set($event)"
                (keydown.enter)="jumpToRow()"
              />
              <button type="button" class="chip" (click)="jumpToRow()" title="Jump to row" aria-label="Jump">
                <svg class="mini-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div class="control-row">
            <label for="maxChunk" class="ctrl-label">
              <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2.5" y="4" width="4.5" height="8" rx="1" />
                <rect x="9" y="4" width="4.5" height="8" rx="1" />
              </svg>
              Chunk
            </label>
            <div class="chip-group">
              @for (preset of [0, 10, 15, 20]; track preset) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="project().maxChunkStitches === preset"
                  (click)="settingsChanged.emit({ maxChunkStitches: preset })"
                >
                  {{ preset === 0 ? '∞' : preset }}
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
                title="Custom max stitches per card (0 = full run)"
              />
            </div>
          </div>

          <div class="control-row">
            <span class="ctrl-label">
              <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 4.5h10M3 8h10M3 11.5h6" stroke-linecap="round" />
              </svg>
              Queue
            </span>
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
            <label for="dirSelect" class="ctrl-label">
              <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 12V4m0 0L2 6m2-2l2 2M12 4v8m0 0l-2-2m2 2l2-2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Order
            </label>
            <select
              id="dirSelect"
              class="select-input"
              [ngModel]="project().direction"
              (ngModelChange)="settingsChanged.emit({ direction: $event })"
            >
              <option value="bottom-up-serpentine">Bottom-Up · Alternating</option>
              <option value="bottom-up-ltr">Bottom-Up · L → R</option>
              <option value="top-down-serpentine">Top-Down · Alternating</option>
              <option value="top-down-ltr">Top-Down · L → R</option>
            </select>
          </div>

          <div class="control-row">
            <label for="cmStitch" class="ctrl-label">
              <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2.5 10.5L10.5 2.5l3 3-8 8-3-3Z" stroke-linejoin="round" />
                <path d="M6.5 6.5l1.5 1.5M9 4l1.5 1.5" stroke-linecap="round" />
              </svg>
              cm / st
            </label>
            <input
              id="cmStitch"
              type="number"
              min="0"
              max="50"
              step="0.5"
              class="num-input wide"
              placeholder="0"
              [ngModel]="cmPerStitch()"
              (ngModelChange)="cmPerStitchChanged.emit(+$event || 0)"
            />
          </div>

          @if (wakeLock.isSupported) {
            <div class="control-row">
              <label for="wakeLockToggle" class="ctrl-label">
                <svg class="ctrl-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1" stroke-linecap="round" />
                </svg>
                Screen awake
              </label>
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
      }
    </div>
  `,
  styles: `
    .queue-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      overflow: hidden;
    }

    .card {
      background: #141416;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 10px 12px;
    }

    .progress-card {
      flex-shrink: 0;
    }

    .progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .progress-pct {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f4f4f5;
      margin-right: 6px;
    }

    .progress-counts {
      font-size: 0.76rem;
      color: #71717a;
      font-family: ui-monospace, monospace;
    }

    .row-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 600;
      font-family: ui-monospace, monospace;
    }

    .dir-icon,
    .mini-icon {
      width: 12px;
      height: 12px;
      display: block;
    }

    .progress-track {
      height: 5px;
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
      gap: 5px;
      margin-top: 8px;
    }

    .strip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
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
      gap: 3px;
      font-size: 0.72rem;
      font-weight: 600;
      color: #e4e4e7;
    }

    .rem-count {
      font-size: 0.7rem;
      font-family: ui-monospace, monospace;
      color: #71717a;
      flex-shrink: 0;
    }

    .yarn-dot {
      width: 15px;
      height: 15px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-size: 0.6rem;
      font-weight: 700;
    }

    .yarn-strip {
      display: flex;
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #27272a;
      background: #0d0d0f;
    }

    .strip-seg {
      flex-basis: 0;
      min-width: 4px;
      height: 100%;
      border: none;
      padding: 0;
      cursor: pointer;
    }

    .strip-seg:hover {
      filter: brightness(1.2);
    }

    .strip-readout {
      font-size: 0.7rem;
      color: #a1a1aa;
    }

    .len-hint {
      font-weight: 400;
      color: #71717a;
      font-size: 0.66rem;
    }

    .active-card {
      background: #141416;
      border: 1.5px solid #e4e4e7;
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
    }

    .active-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .coords {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.76rem;
      font-family: ui-monospace, monospace;
      color: #a1a1aa;
    }

    .carry-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.72rem;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      padding: 2px 7px;
      border-radius: 5px;
      background: #27272a;
      color: #d4d4d8;
    }

    .carry-badge.drop {
      background: rgba(250, 204, 21, 0.14);
      color: #fde047;
    }

    .active-main {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .big-swatch {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-size: 1.35rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .active-details {
      flex: 1;
      min-width: 0;
    }

    .stitch-count {
      font-size: 1.65rem;
      font-weight: 700;
      color: #f4f4f5;
      line-height: 1.05;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .len-badge {
      font-size: 0.8rem;
      font-weight: 500;
      color: #a1a1aa;
    }

    .color-name {
      font-size: 0.82rem;
      color: #a1a1aa;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .step-buttons {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .step-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 0.74rem;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
    }

    .step-btn:hover {
      background: #27272a;
    }

    .active-actions {
      display: flex;
      gap: 8px;
    }

    .action-icon {
      width: 20px;
      height: 20px;
      display: block;
    }

    .complete-btn {
      flex: 1;
      background: #f4f4f5;
      color: #09090b;
      border: none;
      border-radius: 8px;
      height: 42px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
    }

    .complete-btn:hover {
      background: #e4e4e7;
    }

    .undo-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 8px;
      width: 52px;
      height: 42px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
    }

    .undo-btn:hover:not(:disabled) {
      background: #27272a;
    }

    .undo-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .done-card {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px;
    }

    .done-icon {
      width: 26px;
      height: 26px;
      color: #22c55e;
    }

    .done-card h3 {
      margin: 0;
      font-size: 0.95rem;
    }

    .panel-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      flex-shrink: 0;
    }

    .tab-btn {
      background: #141416;
      color: #71717a;
      border: 1px solid #27272a;
      border-radius: 7px;
      height: 34px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .tab-btn.active {
      background: #27272a;
      color: #f4f4f5;
      border-color: #3f3f46;
    }

    .tab-icon {
      width: 15px;
      height: 15px;
      display: block;
    }

    .tab-count {
      font-size: 0.72rem;
      font-family: ui-monospace, monospace;
      font-weight: 600;
    }

    .tab-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
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
      padding: 7px 10px;
    }

    .mini-swatch {
      width: 30px;
      height: 30px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.82rem;
      flex-shrink: 0;
    }

    .next-primary {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 0.86rem;
      color: #f4f4f5;
    }

    .next-color {
      font-size: 0.8rem;
      color: #a1a1aa;
    }

    .next-meta {
      font-size: 0.72rem;
      font-family: ui-monospace, monospace;
      color: #71717a;
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
      gap: 8px;
      font-size: 0.78rem;
      color: #a1a1aa;
    }

    .ctrl-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .ctrl-icon {
      width: 14px;
      height: 14px;
      color: #71717a;
      flex-shrink: 0;
    }

    .chip-group,
    .jump-row-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .chip {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 0.74rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
      padding: 4px 7px;
      font-size: 0.76rem;
    }

    .num-input {
      width: 48px;
    }

    .num-input.wide {
      width: 68px;
    }

    @media (max-width: 960px) {
      .progress-card {
        order: 1;
        padding: 8px 10px;
      }

      .panel-tabs {
        order: 2;
      }

      .tab-body {
        order: 3;
      }

      .active-card,
      .done-card {
        order: 4;
        padding: 10px 12px;
        gap: 8px;
        margin-bottom: env(safe-area-inset-bottom, 0px);
      }

      .big-swatch {
        width: 42px;
        height: 42px;
        font-size: 1.15rem;
      }

      .stitch-count {
        font-size: 1.4rem;
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
  readonly cmPerStitch = input(0);

  readonly completeClicked = output<void>();
  readonly advanceStitchesClicked = output<number>();
  readonly undoClicked = output<void>();
  readonly jumpToCountClicked = output<number>();
  readonly cmPerStitchChanged = output<number>();
  readonly stripSegmentClicked = output<{ row: number; col: number }>();
  readonly settingsChanged = output<{
    direction?: StitchDirection;
    maxChunkStitches?: number;
    queueLength?: number;
  }>();

  readonly jumpRowInput = signal<number | null>(null);
  readonly activeTab = signal<'queue' | 'settings'>('queue');
  readonly selectedStripInfo = signal<string | null>(null);
  protected readonly Math = Math;

  readonly upcomingStrip = computed(() =>
    this.engine.getUpcomingRowStrip(this.project()),
  );

  readonly nextAppearance = computed(() => {
    const active = this.sections()[0];
    if (!active) return null;
    return this.engine.getNextAppearanceInRow(this.project(), active);
  });

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

  onStripClick(run: {
    color: { name: string };
    count: number;
    startRow: number;
    startCol: number;
    endCol: number;
    offsetFromNow: number;
  }): void {
    const when = run.offsetFromNow === 0 ? 'now' : `+${run.offsetFromNow} st`;
    this.selectedStripInfo.set(`${run.count} × ${run.color.name} · ${when}`);
    const midCol = Math.round((run.startCol + run.endCol) / 2);
    this.stripSegmentClicked.emit({ row: run.startRow, col: midCol });
  }

  formatYarnLen(stitches: number): string {
    const cm = Math.round(stitches * this.cmPerStitch());
    return cm >= 100 ? `${(cm / 100).toFixed(1)}m` : `${cm}cm`;
  }

  jumpToRow(): void {
    const rowNum = this.jumpRowInput();
    const proj = this.project();
    if (!rowNum || rowNum < 1 || rowNum > proj.height) return;

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
