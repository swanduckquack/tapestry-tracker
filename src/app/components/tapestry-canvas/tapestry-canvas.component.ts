import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
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
          <button type="button" class="tool-btn zoom-btn" (click)="zoomBy(1.35)" title="Zoom in">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M8 3.5v9M3.5 8h9" stroke-linecap="round" />
            </svg>
          </button>
          <button type="button" class="tool-btn zoom-btn" (click)="zoomBy(0.75)" title="Zoom out">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3.5 8h9" stroke-linecap="round" />
            </svg>
          </button>
          <button type="button" class="tool-btn" (click)="fitToView()" title="Fit whole tapestry">
            Fit
          </button>
          <button
            type="button"
            class="tool-btn"
            (click)="centerOnActive()"
            [disabled]="sections().length === 0"
            title="Zoom to current section"
          >
            Locate
          </button>
        </div>

        <div class="toolbar-right">
          <span class="hint-text">Drag to pan · Scroll to zoom · Click stitch to jump</span>
          <label class="follow-toggle">
            <input
              type="checkbox"
              [checked]="autoFollow()"
              (change)="autoFollow.set($any($event.target).checked)"
            />
            <span>Auto-follow</span>
          </label>
        </div>
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

        <!-- Minimap showing full tapestry & current viewport -->
        <div
          class="minimap-box"
          (pointerdown)="onMinimapPointerDown($event)"
          title="Click to jump camera"
        >
          <canvas #minimap></canvas>
        </div>
      </div>

      @if (inspectedCell(); as cell) {
        <div class="inspect-pill">
          <div class="inspect-info">
            <span class="swatch" [style.background]="cell.hex"></span>
            <div>
              <strong>Row {{ cell.displayRow }}, Col {{ cell.col + 1 }}</strong>
              <span class="muted"> · {{ cell.colorName }} ({{ cell.symbol }})</span>
            </div>
          </div>
          <div class="inspect-actions">
            <button type="button" class="jump-btn" (click)="jumpToInspected(cell.linearIndex)">
              Mark prior complete &amp; jump here
            </button>
            <button type="button" class="close-btn" (click)="clearSelection()" aria-label="Close">
              <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
              </svg>
            </button>
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
      background: #0a0a0c;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #27272a;
    }

    .canvas-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      background: #141416;
      border-bottom: 1px solid #27272a;
      z-index: 2;
      flex-wrap: wrap;
    }

    .toolbar-group,
    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hint-text {
      font-size: 0.74rem;
      color: #71717a;
    }

    .icon {
      width: 14px;
      height: 14px;
      display: block;
    }

    .tool-btn {
      background: #18181b;
      color: #e4e4e7;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .tool-btn:hover:not(:disabled) {
      background: #27272a;
    }

    .tool-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .follow-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #a1a1aa;
      font-size: 0.8rem;
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

    .minimap-box {
      position: absolute;
      bottom: 12px;
      left: 12px;
      border: 1px solid #3f3f46;
      border-radius: 6px;
      overflow: hidden;
      background: #09090b;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
      cursor: crosshair;
      z-index: 4;
    }

    .minimap-box canvas {
      display: block;
      width: auto;
      height: auto;
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
      background: #141416;
      border: 1px solid #3f3f46;
      border-radius: 10px;
      padding: 9px 12px;
      color: #f4f4f5;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
      max-width: calc(100% - 24px);
      z-index: 5;
    }

    .inspect-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.84rem;
    }

    .swatch {
      width: 20px;
      height: 20px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      flex-shrink: 0;
    }

    .muted {
      color: #a1a1aa;
    }

    .inspect-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .jump-btn {
      background: #f4f4f5;
      color: #09090b;
      border: none;
      border-radius: 6px;
      padding: 6px 11px;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
    }

    .jump-btn:hover {
      background: #e4e4e7;
    }

    .close-btn {
      background: transparent;
      color: #a1a1aa;
      border: none;
      cursor: pointer;
      padding: 4px;
      display: inline-flex;
      align-items: center;
    }

    @media (max-width: 960px) {
      .canvas-shell {
        min-height: 0;
      }

      .canvas-toolbar {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(20, 20, 22, 0.86);
        backdrop-filter: blur(6px);
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 4px 8px;
        gap: 8px;
      }

      .zoom-btn,
      .hint-text,
      .minimap-box {
        display: none;
      }

      .tool-btn {
        padding: 4px 8px;
        font-size: 0.74rem;
      }

      .follow-toggle {
        font-size: 0.74rem;
      }
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
  @ViewChild('minimap') minimapRef!: ElementRef<HTMLCanvasElement>;

  readonly autoFollow = signal(true);
  readonly inspectedCell = signal<{
    row: number;
    displayRow: number;
    col: number;
    hex: string;
    colorName: string;
    symbol: string;
    linearIndex: number;
  } | null>(null);

  /** Offscreen 1px-per-stitch cache for instant 60fps panning & zooming. */
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private cacheKey = '';

  private scale = 12;
  private offsetX = 24;
  private offsetY = 24;
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist: number | null = null;
  private dragMoved = false;
  private resizeObserver: ResizeObserver | null = null;
  private lastProjectId: string | null = null;
  private lastCompletedCount = -1;
  private rafPending = false;

  constructor() {
    effect(() => {
      const proj = this.project();
      const secs = this.sections();
      const follow = this.autoFollow();

      this.ensureOffscreenCache(proj);

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

      this.scheduleDraw();
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      this.scheduleDraw();
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
    const pad = 24;
    const scaleX = (rect.width - pad * 2) / proj.width;
    const scaleY = (rect.height - pad * 2) / proj.height;
    this.scale = Math.max(1, Math.min(36, Math.min(scaleX, scaleY)));
    this.offsetX = (rect.width - proj.width * this.scale) / 2;
    this.offsetY = (rect.height - proj.height * this.scale) / 2;
    this.scheduleDraw();
  }

  centerOnActive(): void {
    const vp = this.viewportRef?.nativeElement;
    const active = this.sections()[0];
    if (!vp || !active || active.cells.length === 0) {
      this.scheduleDraw();
      return;
    }

    const rect = vp.getBoundingClientRect();
    const midCell = active.cells[Math.floor(active.cells.length / 2)];
    if (this.scale < 10) {
      this.scale = 14;
    }
    this.offsetX = rect.width / 2 - (midCell.col + 0.5) * this.scale;
    this.offsetY = rect.height / 2 - (midCell.row + 0.5) * this.scale;
    this.scheduleDraw();
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
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;

    // Trackpad pinch-to-zoom sets ctrlKey = true; mouse wheel usually has deltaY >= 40 with deltaX === 0
    const isPinchZoom = event.ctrlKey || event.metaKey;
    const isMouseWheel = !isPinchZoom && event.deltaX === 0 && Math.abs(event.deltaY) >= 40;

    if (isPinchZoom || isMouseWheel) {
      const sensitivity = isPinchZoom ? 0.01 : 0.0025;
      const factor = Math.exp(-event.deltaY * sensitivity);
      this.zoomAt(cx, cy, factor);
    } else {
      // Two-finger trackpad scroll pans smoothly
      this.offsetX -= event.deltaX;
      this.offsetY -= event.deltaY;
      this.scheduleDraw();
    }
  }

  private zoomAt(cx: number, cy: number, factor: number): void {
    const nextScale = Math.max(0.8, Math.min(48, this.scale * factor));
    const ratio = nextScale / this.scale;
    this.offsetX = cx - (cx - this.offsetX) * ratio;
    this.offsetY = cy - (cy - this.offsetY) * ratio;
    this.scale = nextScale;
    this.scheduleDraw();
  }

  onPointerDown(event: PointerEvent): void {
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 1) {
      this.dragMoved = false;
      this.lastPinchDist = null;
    } else if (this.activePointers.size === 2) {
      this.dragMoved = true;
      this.lastPinchDist = this.getPinchDistance();
    }
    try {
      this.viewportRef.nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
  }

  onPointerMove(event: PointerEvent): void {
    const prev = this.activePointers.get(event.pointerId);
    if (!prev) return;

    const curr = { x: event.clientX, y: event.clientY };

    if (this.activePointers.size === 1) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.dragMoved = true;
      }
      this.offsetX += dx;
      this.offsetY += dy;
      this.activePointers.set(event.pointerId, curr);
      this.scheduleDraw();
    } else if (this.activePointers.size === 2) {
      const prevMid = this.getPinchMidpoint();
      this.activePointers.set(event.pointerId, curr);
      const nextMid = this.getPinchMidpoint();
      const nextDist = this.getPinchDistance();

      this.offsetX += nextMid.x - prevMid.x;
      this.offsetY += nextMid.y - prevMid.y;

      if (this.lastPinchDist && this.lastPinchDist > 0 && nextDist > 0) {
        const rect = this.viewportRef.nativeElement.getBoundingClientRect();
        this.zoomAt(nextMid.x - rect.left, nextMid.y - rect.top, nextDist / this.lastPinchDist);
      } else {
        this.scheduleDraw();
      }
      this.lastPinchDist = nextDist;
    }
  }

  onPointerUp(event: PointerEvent): void {
    const wasSingle = this.activePointers.size === 1 && this.activePointers.has(event.pointerId);
    this.activePointers.delete(event.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDist = null;
    }

    try {
      this.viewportRef.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if not captured
    }

    if (wasSingle && !this.dragMoved) {
      this.handleCellClick(event);
    }
  }

  private getPinchDistance(): number {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  private getPinchMidpoint(): { x: number; y: number } {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  onMinimapPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    const mm = this.minimapRef?.nativeElement;
    const vp = this.viewportRef?.nativeElement;
    if (!mm || !vp) return;

    const mmRect = mm.getBoundingClientRect();
    const vpRect = vp.getBoundingClientRect();
    const proj = this.project();

    const fracX = (event.clientX - mmRect.left) / mmRect.width;
    const fracY = (event.clientY - mmRect.top) / mmRect.height;

    const targetCol = Math.max(0, Math.min(proj.width, fracX * proj.width));
    const targetRow = Math.max(0, Math.min(proj.height, fracY * proj.height));

    this.offsetX = vpRect.width / 2 - targetCol * this.scale;
    this.offsetY = vpRect.height / 2 - targetRow * this.scale;
    this.scheduleDraw();
  }

  jumpToInspected(linearIndex: number): void {
    this.jumpRequested.emit(linearIndex);
    this.clearSelection();
  }

  clearSelection(): void {
    this.inspectedCell.set(null);
    this.scheduleDraw();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (event.key === 'Escape' && this.inspectedCell()) {
      event.preventDefault();
      this.clearSelection();
      return;
    }

    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    const proj = this.project();
    const current = this.inspectedCell();
    let nextRow: number;
    let nextCol: number;

    if (current) {
      nextRow = Math.max(0, Math.min(proj.height - 1, current.row + delta[0]));
      nextCol = Math.max(0, Math.min(proj.width - 1, current.col + delta[1]));
    } else {
      const activeCell = this.sections()[0]?.cells[0];
      nextRow = activeCell ? activeCell.row : proj.height - 1;
      nextCol = activeCell ? activeCell.col : proj.width - 1;
    }

    this.selectCell(nextRow, nextCol);
    this.ensureCellVisible(nextRow, nextCol);
  }

  private selectCell(row: number, col: number): void {
    const proj = this.project();
    this.selectCell(row, col);
  }

  private ensureCellVisible(row: number, col: number): void {
    const vp = this.viewportRef?.nativeElement;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = this.offsetX + (col + 0.5) * this.scale;
    const cy = this.offsetY + (row + 0.5) * this.scale;
    const pad = 40;

    if (cx < pad) this.offsetX += pad - cx;
    else if (cx > rect.width - pad) this.offsetX -= cx - (rect.width - pad);

    if (cy < pad) this.offsetY += pad - cy;
    else if (cy > rect.height - pad) this.offsetY -= cy - (rect.height - pad);

    this.scheduleDraw();
  }

  private handleCellClick(event: PointerEvent): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor((x - this.offsetX) / this.scale);
    const row = Math.floor((y - this.offsetY) / this.scale);

    const proj = this.project();
    if (col < 0 || col >= proj.width || row < 0 || row >= proj.height) {
      this.clearSelection();
      return;
    }

    const rawIdx = proj.grid[row * proj.width + col] ?? 0;
    const effIdx = this.engine.resolveEffectiveColorIndex(proj.colors, rawIdx);
    const color = proj.colors[effIdx] ?? proj.colors[0];
    const linearIndex = this.engine.cellToLinear(row, col, proj.width, proj.height, proj.direction);

    const isBottomUp = proj.direction.startsWith('bottom-up');
    const displayRow = isBottomUp ? proj.height - row : row + 1;

    this.inspectedCell.set({
      row,
      displayRow,
      col,
      hex: color?.hex ?? '#cccccc',
      colorName: color?.name ?? 'Unknown',
      symbol: color?.symbol ?? '?',
      linearIndex,
    });
    this.scheduleDraw();
  }

  private ensureOffscreenCache(proj: TapestryProject): void {
    const colorSig = proj.colors.map((c) => `${c.hex}:${c.mergedIntoId ?? ''}`).join('|');
    const key = `${proj.id}:${proj.width}x${proj.height}:${colorSig}`;
    if (this.offscreenCanvas && this.cacheKey === key) return;

    this.cacheKey = key;
    const off = document.createElement('canvas');
    off.width = proj.width;
    off.height = proj.height;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(proj.width, proj.height);
    const data = imgData.data;

    // Pre-parse effective RGBs
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
    this.offscreenCanvas = off;
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

  private scheduleDraw(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.draw();
      this.drawMinimap();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const widthCss = canvas.width / dpr;
    const heightCss = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, widthCss, heightCss);

    const proj = this.project();
    this.ensureOffscreenCache(proj);

    // 1. Blit entire tapestry in one GPU-accelerated call (crisp pixels, 60fps!)
    if (this.offscreenCanvas) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.offscreenCanvas,
        this.offsetX,
        this.offsetY,
        proj.width * this.scale,
        proj.height * this.scale,
      );
    }

    // 2. Dim completed stitches cleanly using just 1-2 rects
    if (proj.completedCount > 0) {
      ctx.fillStyle = 'rgba(10, 10, 12, 0.48)';
      const completedRows = Math.floor(proj.completedCount / proj.width);
      const rem = proj.completedCount % proj.width;
      const isBottomUp = proj.direction.startsWith('bottom-up');

      if (completedRows > 0) {
        const y = isBottomUp
          ? this.offsetY + (proj.height - completedRows) * this.scale
          : this.offsetY;
        ctx.fillRect(this.offsetX, y, proj.width * this.scale, completedRows * this.scale);
      }

      if (rem > 0 && completedRows < proj.height) {
        const partialCell = this.engine.linearToCell(
          proj.completedCount - 1,
          proj.width,
          proj.height,
          proj.direction,
        );
        const y = this.offsetY + partialCell.row * this.scale;
        const x =
          partialCell.rowDirection === 'rtl'
            ? this.offsetX + (proj.width - rem) * this.scale
            : this.offsetX;
        ctx.fillRect(x, y, rem * this.scale, this.scale);
      }
    }

    // 3. Draw gridlines & symbols only when zoomed in close (tiny visible window)
    if (this.scale >= 12) {
      const startCol = Math.max(0, Math.floor(-this.offsetX / this.scale));
      const endCol = Math.min(proj.width - 1, Math.ceil((widthCss - this.offsetX) / this.scale));
      const startRow = Math.max(0, Math.floor(-this.offsetY / this.scale));
      const endRow = Math.min(proj.height - 1, Math.ceil((heightCss - this.offsetY) / this.scale));

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = startCol; c <= endCol + 1; c++) {
        const gx = this.offsetX + c * this.scale;
        ctx.moveTo(gx, this.offsetY + startRow * this.scale);
        ctx.lineTo(gx, this.offsetY + (endRow + 1) * this.scale);
      }
      for (let r = startRow; r <= endRow + 1; r++) {
        const gy = this.offsetY + r * this.scale;
        ctx.moveTo(this.offsetX + startCol * this.scale, gy);
        ctx.lineTo(this.offsetX + (endCol + 1) * this.scale, gy);
      }
      ctx.stroke();

      if (this.scale >= 16) {
        ctx.font = `600 ${Math.floor(this.scale * 0.52)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            const rawIdx = proj.grid[r * proj.width + c] ?? 0;
            const effIdx = this.engine.resolveEffectiveColorIndex(proj.colors, rawIdx);
            const color = proj.colors[effIdx];
            if (!color?.symbol) continue;
            ctx.fillStyle = this.isLightHex(color.hex)
              ? 'rgba(15, 23, 42, 0.85)'
              : 'rgba(248, 250, 252, 0.85)';
            ctx.fillText(
              color.symbol,
              this.offsetX + (c + 0.5) * this.scale,
              this.offsetY + (r + 0.5) * this.scale,
            );
          }
        }
      }
    }

    // 4. Clean single bounding box around the active section
    const activeSec = this.sections()[0];
    if (activeSec) {
      const minCol = Math.min(activeSec.startCol, activeSec.endCol) - 1;
      const maxCol = Math.max(activeSec.startCol, activeSec.endCol) - 1;
      const bx = this.offsetX + minCol * this.scale;
      const by = this.offsetY + activeSec.row * this.scale;
      const bw = (maxCol - minCol + 1) * this.scale;
      const bh = this.scale;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    }

    // 5. Highlight the currently selected/inspected cell
    const selected = this.inspectedCell();
    if (selected) {
      const sx = this.offsetX + selected.col * this.scale;
      const sy = this.offsetY + selected.row * this.scale;
      const size = Math.max(4, this.scale);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sx - 1.5, sy - 1.5, size + 3, size + 3);
    }

    // Outer border
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.offsetX,
      this.offsetY,
      proj.width * this.scale,
      proj.height * this.scale,
    );

    ctx.restore();
  }

  private drawMinimap(): void {
    const mm = this.minimapRef?.nativeElement;
    const vp = this.viewportRef?.nativeElement;
    if (!mm || !vp || !this.offscreenCanvas) return;

    const proj = this.project();
    const maxDim = 130;
    const ratio = Math.min(maxDim / proj.width, maxDim / proj.height);
    const mw = Math.max(40, Math.round(proj.width * ratio));
    const mh = Math.max(40, Math.round(proj.height * ratio));

    if (mm.width !== mw || mm.height !== mh) {
      mm.width = mw;
      mm.height = mh;
    }

    const ctx = mm.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.offscreenCanvas, 0, 0, mw, mh);

    // Current row indicator line
    const activeSec = this.sections()[0];
    if (activeSec) {
      const rowY = (activeSec.row / proj.height) * mh;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowY);
      ctx.lineTo(mw, rowY);
      ctx.stroke();
    }

    // Viewport rectangle
    const vpRect = vp.getBoundingClientRect();
    const viewLeft = (-this.offsetX / this.scale / proj.width) * mw;
    const viewTop = (-this.offsetY / this.scale / proj.height) * mh;
    const viewW = (vpRect.width / this.scale / proj.width) * mw;
    const viewH = (vpRect.height / this.scale / proj.height) * mh;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      Math.max(0, viewLeft),
      Math.max(0, viewTop),
      Math.min(mw, viewW),
      Math.min(mh, viewH),
    );
  }

  private isLightHex(hex: string): boolean {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  }
}
