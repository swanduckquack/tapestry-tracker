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
              Parses your multi-page Pixel Stitch PDF right in the browser — no upload needed.
            </p>
          </div>
          <button type="button" class="close-x" (click)="closed.emit()">✕</button>
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
              <div class="drop-icon">📄</div>
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
      max-width: 520px;
      color: #f8fafc;
      overflow: hidden;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
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

    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .dropzone {
      border: 2px dashed #334155;
      border-radius: 14px;
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      background: #0f172a;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .dropzone:hover,
    .dropzone.dragging {
      border-color: #38bdf8;
      background: #13223f;
    }

    .drop-icon {
      font-size: 2.2rem;
      margin-bottom: 8px;
    }

    .drop-title {
      font-weight: 700;
      font-size: 1rem;
    }

    .drop-sub {
      font-size: 0.84rem;
      color: #94a3b8;
      margin-top: 4px;
    }

    .progress-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 18px;
      text-align: center;
    }

    .progress-msg {
      font-weight: 600;
      margin-bottom: 10px;
    }

    .progress-track {
      height: 8px;
      background: #1e293b;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #38bdf8;
      transition: width 0.15s ease;
    }

    .progress-sub {
      margin-top: 8px;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .error-box {
      background: rgba(239, 68, 68, 0.14);
      border: 1px solid #ef4444;
      color: #fca5a5;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.85rem;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      font-size: 0.8rem;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #1e293b;
    }

    .sample-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 11px 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .sample-btn:hover:not(:disabled) {
      background: #334155;
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
