import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StitchColor, TapestryProject } from '../../models/tapestry.model';
import { SectionEngineService } from '../../services/section-engine.service';

interface YarnPreset {
  name: string;
  hex: string;
}

const YARN_PRESETS: YarnPreset[] = [
  { name: 'Cream', hex: '#f3efe0' },
  { name: 'White', hex: '#fafafa' },
  { name: 'Oatmeal', hex: '#d8ceb8' },
  { name: 'Mustard', hex: '#d4a017' },
  { name: 'Terracotta', hex: '#b85435' },
  { name: 'Crimson', hex: '#9e2a2b' },
  { name: 'Burgundy', hex: '#5e1922' },
  { name: 'Blush', hex: '#dba6a6' },
  { name: 'Sage', hex: '#8fa889' },
  { name: 'Forest', hex: '#284b3c' },
  { name: 'Olive', hex: '#5c6638' },
  { name: 'Navy', hex: '#1d2d44' },
  { name: 'Denim', hex: '#4a6b8c' },
  { name: 'Espresso', hex: '#3d281e' },
  { name: 'Charcoal', hex: '#2b2d30' },
  { name: 'Black', hex: '#111214' },
];

@Component({
  selector: 'app-color-legend-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h2>Yarn Colors ({{ project().colors.length }})</h2>
            <p class="subtitle">
              Tap any color swatch to match your yarn, rename it, or merge similar shades.
            </p>
          </div>
          <div class="header-actions">
            @if (hasCustomColors()) {
              <button type="button" class="reset-all-btn" (click)="allColorsReset.emit()">
                Reset all
              </button>
            }
            <button type="button" class="close-x" (click)="closed.emit()" aria-label="Close">
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Live Tapestry Preview -->
        <div class="preview-strip">
          <canvas #previewCanvas class="preview-canvas"></canvas>
          <div class="preview-caption">
            <span class="preview-title">Live Preview</span>
            <span class="preview-sub">Updates as you swap yarn colors</span>
          </div>
        </div>

        <div class="legend-list">
          @for (color of project().colors; track color.id) {
            @let isExpanded = activePickerId() === color.id;
            @let isModified = !!color.originalHex && color.hex.toLowerCase() !== color.originalHex.toLowerCase();
            <div class="legend-item" [class.merged]="!!color.mergedIntoId">
              <div class="legend-row">
                <!-- Native color picker wrapped over the swatch -->
                <label
                  class="swatch-picker"
                  [style.background]="color.hex"
                  [style.color]="isLightHex(color.hex) ? '#18181b' : '#ffffff'"
                  title="Pick yarn color"
                >
                  <input
                    type="color"
                    class="native-color-input"
                    [value]="color.hex"
                    (input)="onColorInput(color.id, $any($event.target).value)"
                  />
                  <span>{{ color.symbol }}</span>
                </label>

                <div class="legend-fields">
                  <input
                    type="text"
                    class="name-input"
                    [ngModel]="color.name"
                    (ngModelChange)="colorRenamed.emit({ colorId: color.id, name: $event })"
                    placeholder="Yarn name..."
                  />
                  <div class="meta-row">
                    <span class="stitch-meta">
                      {{ (colorCounts().get(color.id) ?? 0).toLocaleString() }} stitches ·
                      {{ color.hex }}
                    </span>
                    <button
                      type="button"
                      class="inline-btn"
                      (click)="togglePresets(color.id)"
                    >
                      {{ isExpanded ? 'Hide presets' : 'Presets' }}
                    </button>
                    @if (isModified) {
                      <button
                        type="button"
                        class="inline-btn"
                        (click)="colorReset.emit(color.id)"
                      >
                        Reset
                      </button>
                    }
                  </div>
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
                    <option value="">None</option>
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

              @if (isExpanded) {
                <div class="preset-drawer">
                  <div class="preset-grid">
                    @for (preset of presets; track preset.hex) {
                      <button
                        type="button"
                        class="preset-chip"
                        [class.selected]="color.hex.toLowerCase() === preset.hex"
                        (click)="applyPreset(color, preset)"
                        [title]="preset.name + ' (' + preset.hex + ')'"
                      >
                        <span class="preset-dot" [style.background]="preset.hex"></span>
                        <span>{{ preset.name }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
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
      max-height: 88vh;
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
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid #27272a;
    }

    h2 {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 600;
    }

    .subtitle {
      margin: 3px 0 0;
      font-size: 0.8rem;
      color: #a1a1aa;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .reset-all-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 0.76rem;
      font-weight: 500;
      cursor: pointer;
    }

    .reset-all-btn:hover {
      background: #27272a;
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

    .preview-strip {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 18px;
      background: #0d0d0f;
      border-bottom: 1px solid #27272a;
    }

    .preview-canvas {
      height: 74px;
      width: auto;
      max-width: 110px;
      border-radius: 5px;
      border: 1px solid #27272a;
      image-rendering: pixelated;
      flex-shrink: 0;
    }

    .preview-caption {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .preview-title {
      font-size: 0.84rem;
      font-weight: 600;
      color: #f4f4f5;
    }

    .preview-sub {
      font-size: 0.76rem;
      color: #71717a;
    }

    .legend-list {
      padding: 12px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .legend-item {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .legend-item.merged {
      opacity: 0.55;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .swatch-picker {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 7px;
      border: 1.5px solid rgba(255, 255, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
      overflow: hidden;
    }

    .swatch-picker:hover {
      border-color: #ffffff;
    }

    .native-color-input {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
      border: none;
      padding: 0;
    }

    .legend-fields {
      flex: 1;
      min-width: 170px;
      display: flex;
      flex-direction: column;
      gap: 5px;
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

    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .stitch-meta {
      font-size: 0.74rem;
      color: #a1a1aa;
    }

    .inline-btn {
      background: #27272a;
      color: #e4e4e7;
      border: none;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 0.72rem;
      font-weight: 500;
      cursor: pointer;
    }

    .inline-btn:hover {
      background: #3f3f46;
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

    .preset-drawer {
      padding-top: 8px;
      border-top: 1px solid #27272a;
    }

    .preset-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #0d0d0f;
      color: #d4d4d8;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 0.74rem;
      cursor: pointer;
    }

    .preset-chip:hover {
      border-color: #52525b;
    }

    .preset-chip.selected {
      border-color: #f4f4f5;
      color: #ffffff;
    }

    .preset-dot {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      flex-shrink: 0;
    }
  `,
})
export class ColorLegendModalComponent implements AfterViewInit {
  private readonly engine = inject(SectionEngineService);

  readonly project = input.required<TapestryProject>();
  readonly closed = output<void>();
  readonly colorRenamed = output<{ colorId: string; name: string }>();
  readonly colorHexChanged = output<{ colorId: string; hex: string }>();
  readonly colorReset = output<string>();
  readonly allColorsReset = output<void>();
  readonly colorMerged = output<{ sourceId: string; targetId?: string }>();

  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  readonly activePickerId = signal<string | null>(null);
  readonly presets = YARN_PRESETS;

  readonly colorCounts = computed(() => this.engine.getColorCounts(this.project()));
  readonly hasCustomColors = computed(() =>
    this.project()
      .colors.some((c) => !!c.originalHex && c.hex.toLowerCase() !== c.originalHex.toLowerCase()),
  );

  constructor() {
    effect(() => {
      const proj = this.project();
      queueMicrotask(() => this.drawPreview(proj));
    });
  }

  ngAfterViewInit(): void {
    this.drawPreview(this.project());
  }

  onColorInput(colorId: string, hex: string): void {
    this.colorHexChanged.emit({ colorId, hex });
  }

  togglePresets(colorId: string): void {
    this.activePickerId.update((curr) => (curr === colorId ? null : colorId));
  }

  applyPreset(color: StitchColor, preset: YarnPreset): void {
    this.colorHexChanged.emit({ colorId: color.id, hex: preset.hex });
    if (color.name.startsWith('Color ')) {
      this.colorRenamed.emit({ colorId: color.id, name: `${preset.name} Yarn` });
    }
  }

  isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }

  private drawPreview(proj: TapestryProject): void {
    const canvas = this.previewCanvasRef?.nativeElement;
    if (!canvas) return;
    if (canvas.width !== proj.width || canvas.height !== proj.height) {
      canvas.width = proj.width;
      canvas.height = proj.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(proj.width, proj.height);
    const data = imgData.data;

    const rgbPalette = proj.colors.map((_, i) => {
      const effIdx = this.engine.resolveEffectiveColorIndex(proj.colors, i);
      const hex = proj.colors[effIdx]?.hex ?? '#71717a';
      return [
        parseInt(hex.slice(1, 3), 16) || 0,
        parseInt(hex.slice(3, 5), 16) || 0,
        parseInt(hex.slice(5, 7), 16) || 0,
      ];
    });

    for (let i = 0; i < proj.grid.length; i++) {
      const rgb = rgbPalette[proj.grid[i]] ?? [120, 120, 120];
      const p = i * 4;
      data[p] = rgb[0];
      data[p + 1] = rgb[1];
      data[p + 2] = rgb[2];
      data[p + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
  }
}
