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
          <button type="button" class="close-x" (click)="closed.emit()">✕</button>
        </div>

        <div class="legend-list">
          @for (color of project().colors; track color.id) {
            <div class="legend-row" [class.merged]="!!color.mergedIntoId">
              <div
                class="swatch"
                [style.background]="color.hex"
                [style.color]="isLightHex(color.hex) ? '#0f172a' : '#ffffff'"
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
                  {{ (colorCounts().get(color.id) ?? 0).toLocaleString() }} stitches • {{ color.hex }}
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
      max-width: 680px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      color: #f8fafc;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
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

    .legend-list {
      padding: 14px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 10px 12px;
      flex-wrap: wrap;
    }

    .legend-row.merged {
      opacity: 0.6;
    }

    .swatch {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 800;
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
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 0.85rem;
    }

    .stitch-meta {
      font-size: 0.76rem;
      color: #94a3b8;
    }

    .merge-col {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .merge-label {
      font-size: 0.7rem;
      color: #94a3b8;
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
