import { Component, inject, output, signal } from '@angular/core';
import { PdfParseProgress, TapestryProject } from '../../models/tapestry.model';
import { PdfParserService } from '../../services/pdf-parser.service';

@Component({
  selector: 'app-import-modal',
  standalone: true,
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h2>Import Pixel Stitch PDF</h2>
            <p class="subtitle">
              Extracts the grid, stitch colors, and symbols directly in your browser.
            </p>
          </div>
          <button type="button" class="close-x" (click)="closed.emit()" aria-label="Close">
            <svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          @if (progress(); as prog) {
            <div class="progress-box">
              <div class="progress-msg">{{ prog.message }}</div>
              @if (prog.totalPages > 0) {
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    [style.width.%]="(prog.currentPage / prog.totalPages) * 100"
                  ></div>
                </div>
                <div class="progress-sub">
                  Page {{ prog.currentPage }} of {{ prog.totalPages }}
                </div>
              }
            </div>
          } @else {
            <label
              class="dropzone"
              [class.dragging]="isDragging()"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragging.set(false)"
              (drop)="onDrop($event)"
            >
              <input type="file" accept="application/pdf,.pdf" hidden (change)="onFileSelected($event)" />
              <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" />
              </svg>
              <div class="drop-title">Drop your Pixel Stitch PDF here</div>
              <div class="drop-sub">or click to browse from your device</div>
            </label>
          }

          @if (errorMsg()) {
            <div class="error-box">{{ errorMsg() }}</div>
          }

          <div class="divider"><span>or</span></div>

          <button
            type="button"
            class="sample-btn"
            [disabled]="!!progress()"
            (click)="loadSample()"
          >
            Load Sample Tapestry (48 × 36)
          </button>
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
      max-width: 480px;
      color: #f4f4f5;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
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

    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .dropzone {
      border: 1.5px dashed #3f3f46;
      border-radius: 10px;
      padding: 28px 20px;
      text-align: center;
      cursor: pointer;
      background: #18181b;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .dropzone:hover,
    .dropzone.dragging {
      border-color: #f4f4f5;
      background: #27272a;
    }

    .drop-icon {
      width: 28px;
      height: 28px;
      color: #a1a1aa;
      margin-bottom: 8px;
    }

    .drop-title {
      font-weight: 600;
      font-size: 0.92rem;
    }

    .drop-sub {
      font-size: 0.8rem;
      color: #a1a1aa;
      margin-top: 3px;
    }

    .progress-box {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
    }

    .progress-msg {
      font-weight: 500;
      font-size: 0.88rem;
      margin-bottom: 10px;
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
      transition: width 0.15s ease;
    }

    .progress-sub {
      margin-top: 8px;
      font-size: 0.78rem;
      color: #a1a1aa;
    }

    .error-box {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 0.82rem;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #71717a;
      font-size: 0.78rem;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #27272a;
    }

    .sample-btn {
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }

    .sample-btn:hover:not(:disabled) {
      background: #27272a;
    }
  `,
})
export class ImportModalComponent {
  private readonly parser = inject(PdfParserService);

  readonly closed = output<void>();
  readonly imported = output<TapestryProject>();

  readonly isDragging = signal(false);
  readonly progress = signal<PdfParseProgress | null>(null);
  readonly errorMsg = signal<string | null>(null);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.processFile(file);
  }

  loadSample(): void {
    this.imported.emit(this.parser.createSampleProject());
    this.closed.emit();
  }

  private async processFile(file: File): Promise<void> {
    this.errorMsg.set(null);
    try {
      const project = await this.parser.parsePixelStitchPdf(file, (prog) => {
        this.progress.set(prog);
      });
      this.progress.set(null);
      this.imported.emit(project);
      this.closed.emit();
    } catch (err) {
      this.progress.set(null);
      this.errorMsg.set(err instanceof Error ? err.message : 'Failed to parse PDF.');
    }
  }
}
