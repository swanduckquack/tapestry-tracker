import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { StitchSection, TapestryProject } from '../../models/tapestry.model';
import { SectionEngineService } from '../../services/section-engine.service';

@Component({
  selector: 'app-tapestry-canvas',
  standalone: true,
  template: `
    <div class="canvas-shell">
      <div class="canvas-toolbar">
        <div class="toolbar-group">
          <button type="button" class="tool-btn" (click)="zoomBy(1.25)" title="Zoom in">+</button>
          <button type="button" class="tool-btn" (click)="zoomBy(0.8)" title="Zoom out">−</button>
          <button type="button" class="tool-btn" (click)="fitToView()" title="Fit whole tapestry">
            Fit
          </button>
          <button
            type="button"
            class="tool-btn"
            (click)="centerOnActive()"
            [disabled]="sections().length === 0"
            title="Center on current section"
          >
            Locate
          </button>
        </div>

        <label class="follow-toggle">
          <input
            type="checkbox"
            [checked]="autoFollow()"
            (change)="autoFollow.set($any($event.target).checked)"
          />
          <span>Auto-follow</span>
        </label>
      </div>

      <div
        #viewport
        class="canvas-viewport"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
        (wheel)="onWheel($event)"
      >
        <canvas #canvas></canvas>
      </div>

      @if (inspectedCell(); as cell) {
        <div class="inspect-pill">
          <div class="inspect-info">
            <span class="swatch" [style.background]="cell.hex"></span>
            <div>
              <strong>Row {{ cell.row + 1 }}, Col {{ cell.col + 1 }}</strong>
              <span class="muted"> • {{ cell.colorName }} ({{ cell.symbol }})</span>
            </div>
          </div>
          <div class="inspect-actions">
            <button type="button" class="jump-btn" (click)="jumpToInspected(cell.linearIndex)">
              Mark prior complete &amp; jump here
            </button>
            <button type="button" class="close-btn" (click)="inspectedCell.set(null)">✕</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .canvas-shell {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 360px;
      background: #0f172a;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid #1e293b;
    }

    .canvas-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      background: #111c33;
      border-bottom: 1px solid #1e293b;
      z-index: 2;
    }

    .toolbar-group {
      display: flex;
      gap: 6px;
    }

    .tool-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }

    .tool-btn:hover:not(:disabled) {
      background: #334155;
    }

    .tool-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .follow-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #cbd5e1;
      font-size: 0.85rem;
      cursor: pointer;
      user-select: none;
    }

    .canvas-viewport {
      flex: 1;
      position: relative;
      overflow: hidden;
      touch-action: none;
      cursor: grab;
    }

    .canvas-viewport:active {
      cursor: grabbing;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .inspect-pill {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid #38bdf8;
      border-radius: 12px;
      padding: 10px 14px;
      color: #f8fafc;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
      max-width: calc(100% - 24px);
      z-index: 5;
    }

    .inspect-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
    }

    .swatch {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      flex-shrink: 0;
    }

    .muted {
      color: #94a3b8;
    }

    .inspect-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .jump-btn {
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }

    .jump-btn:hover {
      background: #0369a1;
    }

    .close-btn {
      background: transparent;
      color: #94a3b8;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      padding: 4px 6px;
    }
  `,
})
export class TapestryCanvasComponent implements AfterViewInit, OnDestroy {
  private readonly engine = inject(SectionEngineService);

  readonly project = input.required<TapestryProject>();
  readonly sections = input<StitchSection[]>([]);
  readonly jumpRequested = output<number>();

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly autoFollow = signal(true);
  readonly inspectedCell = signal<{
    row: number;
    col: number;
    hex: string;
    colorName: string;
    symbol: string;
    linearIndex: number;
  } | null>(null);

  private scale = 12;
  private offsetX = 24;
  private offsetY = 24;
  private isDragging = false;
  private dragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private lastProjectId: string | null = null;
  private lastCompletedCount = -1;

  private readonly activeCellSet = computed(() => {
    const set = new Set<number>();
    const active = this.sections()[0];
    if (!active) return set;
    const width = this.project().width;
    for (const c of active.cells) {
      set.add(c.row * width + c.col);
    }
    return set;
  });

  private readonly upcomingCellSet = computed(() => {
    const set = new Set<number>();
    const list = this.sections();
    const width = this.project().width;
    for (let i = 1; i < list.length; i++) {
      for (const c of list[i].cells) {
        set.add(c.row * width + c.col);
      }
    }
    return set;
  });

  constructor() {
    effect(() => {
      const proj = this.project();
      const secs = this.sections();
      const follow = this.autoFollow();

      if (proj.id !== this.lastProjectId) {
        this.lastProjectId = proj.id;
        this.lastCompletedCount = proj.completedCount;
        this.inspectedCell.set(null);
        queueMicrotask(() => this.fitToView());
        return;
      }

      if (proj.completedCount !== this.lastCompletedCount) {
        this.lastCompletedCount = proj.completedCount;
        if (follow && secs.length > 0) {
          queueMicrotask(() => this.centerOnActive());
          return;
        }
      }

      queueMicrotask(() => this.draw());
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      this.draw();
    });
    this.resizeObserver.observe(this.viewportRef.nativeElement);
    this.syncCanvasSize();
    this.fitToView();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  fitToView(): void {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const proj = this.project();
    const pad = 28;
    const scaleX = (rect.width - pad * 2) / proj.width;
    const scaleY = (rect.height - pad * 2) / proj.height;
    this.scale = Math.max(2, Math.min(36, Math.min(scaleX, scaleY)));
    this.offsetX = (rect.width - proj.width * this.scale) / 2;
    this.offsetY = (rect.height - proj.height * this.scale) / 2;
    this.draw();
  }

  centerOnActive(): void {
    const vp = this.viewportRef?.nativeElement;
    const active = this.sections()[0];
    if (!vp || !active || active.cells.length === 0) {
      this.draw();
      return;
    }

    const rect = vp.getBoundingClientRect();
    const midCell = active.cells[Math.floor(active.cells.length / 2)];
    if (this.scale < 10) {
      this.scale = 14;
    }
    this.offsetX = rect.width / 2 - (midCell.col + 0.5) * this.scale;
    this.offsetY = rect.height / 2 - (midCell.row + 0.5) * this.scale;
    this.draw();
  }

  zoomBy(factor: number): void {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    this.zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
  }

  private zoomAt(cx: number, cy: number, factor: number): void {
    const nextScale = Math.max(1.5, Math.min(48, this.scale * factor));
    const ratio = nextScale / this.scale;
    this.offsetX = cx - (cx - this.offsetX) * ratio;
    this.offsetY = cy - (cy - this.offsetY) * ratio;
    this.scale = nextScale;
    this.draw();
  }

  onPointerDown(event: PointerEvent): void {
    this.isDragging = true;
    this.dragMoved = false;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.viewportRef.nativeElement.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      this.dragMoved = true;
    }
    this.offsetX += dx;
    this.offsetY += dy;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.draw();
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.viewportRef.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if not captured
    }

    if (!this.dragMoved) {
      this.handleCellClick(event);
    }
  }

  jumpToInspected(linearIndex: number): void {
    this.jumpRequested.emit(linearIndex);
    this.inspectedCell.set(null);
  }

  private handleCellClick(event: PointerEvent): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor((x - this.offsetX) / this.scale);
    const row = Math.floor((y - this.offsetY) / this.scale);

    const proj = this.project();
    if (col < 0 || col >= proj.width || row < 0 || row >= proj.height) {
      this.inspectedCell.set(null);
      return;
    }

    const rawIdx = proj.grid[row * proj.width + col] ?? 0;
    const effIdx = this.engine.resolveEffectiveColorIndex(proj.colors, rawIdx);
    const color = proj.colors[effIdx] ?? proj.colors[0];
    const linearIndex = this.engine.cellToLinear(row, col, proj.width, proj.height, proj.direction);

    this.inspectedCell.set({
      row,
      col,
      hex: color?.hex ?? '#cccccc',
      colorName: color?.name ?? 'Unknown',
      symbol: color?.symbol ?? '?',
      linearIndex,
    });
  }

  private syncCanvasSize(): void {
    const vp = this.viewportRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;
    if (!vp || !canvas) return;
    const rect = vp.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    const vp = this.viewportRef?.nativeElement;
    if (!canvas || !vp) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.width / dpr;
    const heightCss = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, widthCss, heightCss);

    const proj = this.project();
    const activeSet = this.activeCellSet();
    const upcomingSet = this.upcomingCellSet();

    // Compute visible cell bounds for fast rendering even on 120k+ stitch tapestries
    const startCol = Math.max(0, Math.floor(-this.offsetX / this.scale));
    const endCol = Math.min(proj.width - 1, Math.ceil((widthCss - this.offsetX) / this.scale));
    const startRow = Math.max(0, Math.floor(-this.offsetY / this.scale));
    const endRow = Math.min(proj.height - 1, Math.ceil((heightCss - this.offsetY) / this.scale));

    const showGrid = this.scale >= 7;
    const showSymbols = this.scale >= 15;
    if (showSymbols) {
      ctx.font = `600 ${Math.floor(this.scale * 0.55)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    for (let r = startRow; r <= endRow; r++) {
      const y = this.offsetY + r * this.scale;
      for (let c = startCol; c <= endCol; c++) {
        const x = this.offsetX + c * this.scale;
        const cellIdx = r * proj.width + c;
        const rawColorIdx = proj.grid[cellIdx] ?? 0;
        const effColorIdx = this.engine.resolveEffectiveColorIndex(proj.colors, rawColorIdx);
        const color = proj.colors[effColorIdx];
        const hex = color?.hex ?? '#475569';

        const linearIdx = this.engine.cellToLinear(
          r,
          c,
          proj.width,
          proj.height,
          proj.direction,
        );
        const isCompleted = linearIdx < proj.completedCount;
        const isActive = activeSet.has(cellIdx);
        const isUpcoming = upcomingSet.has(cellIdx);

        ctx.globalAlpha = isCompleted ? 0.25 : 1;
        ctx.fillStyle = hex;
        ctx.fillRect(x, y, this.scale + 0.35, this.scale + 0.35);

        if (isCompleted) {
          // Subtle diagonal check mark tint on completed stitches
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, this.scale, this.scale);
        }

        if (showSymbols && !isCompleted && color?.symbol) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = this.isLightHex(hex) ? '#0f172a' : '#f8fafc';
          ctx.fillText(color.symbol, x + this.scale / 2, y + this.scale / 2 + 0.5);
        }

        if (showGrid) {
          ctx.globalAlpha = 0.22;
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, this.scale, this.scale);
        }

        if (isUpcoming) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = Math.max(1.5, this.scale * 0.12);
          ctx.strokeRect(x + 0.5, y + 0.5, this.scale - 1, this.scale - 1);
        }

        if (isActive) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(2, this.scale * 0.2);
          ctx.strokeRect(x + 0.5, y + 0.5, this.scale - 1, this.scale - 1);
        }
      }
    }

    // Draw outer tapestry border
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      this.offsetX,
      this.offsetY,
      proj.width * this.scale,
      proj.height * this.scale,
    );

    ctx.restore();
  }

  private isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }
}
