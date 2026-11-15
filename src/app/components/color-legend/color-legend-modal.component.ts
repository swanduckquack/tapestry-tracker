import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TapestryProject } from '../../models/tapestry.model';
import { SectionEngineService } from '../../services/section-engine.service';

@Component({
  selector: 'app-color-legend-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h2>Yarn Color Legend ({{ project().colors.length }})</h2>
            <p class="subtitle">Rename extracted colors to your yarn names or merge similar shades.</p>
          </div>
          <button type="button" class="close-x" (click)="closed.emit()" aria-label="Close">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="legend-list">
          @for (color of project().colors; track color.id) {
            <div class="legend-row" [class.merged]="!!color.mergedIntoId">
              <div
                class="swatch"
                [style.background]="color.hex"
                [style.color]="isLightHex(color.hex) ? '#18181b' : '#ffffff'"
              >
                {{ color.symbol }}
              </div>

              <div class="legend-fields">
                <input
                  type="text"
                  class="name-input"
                  [ngModel]="color.name"
                  (ngModelChange)="colorRenamed.emit({ colorId: color.id, name: $event })"
                  placeholder="Yarn name..."
                />
                <span class="stitch-meta">
                  {{ (colorCounts().get(color.id) ?? 0).toLocaleString() }} stitches · {{ color.hex }}
                </span>
              </div>

              <div class="merge-col">
                <label class="merge-label">Merge into</label>
                <select
                  class="merge-select"
                  [ngModel]="color.mergedIntoId ?? ''"
                  (ngModelChange)="
                    colorMerged.emit({ sourceId: color.id, targetId: $event || undefined })
                  "
                >
                  <option value="">None (keep separate)</option>
                  @for (target of project().colors; track target.id) {
                    @if (target.id !== color.id && !target.mergedIntoId) {
                      <option [value]="target.id">
                        {{ target.symbol }} — {{ target.name }}
                      </option>
                    }
                  }
                </select>
              </div>
            </div>
          }
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
      max-width: 660px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      color: #f4f4f5;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
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

    .legend-list {
      padding: 14px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 12px;
      flex-wrap: wrap;
    }

    .legend-row.merged {
      opacity: 0.55;
    }

    .swatch {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      flex-shrink: 0;
    }

    .legend-fields {
      flex: 1;
      min-width: 160px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .name-input,
    .merge-select {
      background: #0d0d0f;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 0.82rem;
    }

    .stitch-meta {
      font-size: 0.74rem;
      color: #a1a1aa;
    }

    .merge-col {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .merge-label {
      font-size: 0.68rem;
      color: #a1a1aa;
      text-transform: uppercase;
    }
  `,
})
export class ColorLegendModalComponent {
  private readonly engine = inject(SectionEngineService);

  readonly project = input.required<TapestryProject>();
  readonly closed = output<void>();
  readonly colorRenamed = output<{ colorId: string; name: string }>();
  readonly colorMerged = output<{ sourceId: string; targetId?: string }>();

  readonly colorCounts = computed(() => this.engine.getColorCounts(this.project()));

  isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }
}
