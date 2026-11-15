import { Injectable } from '@angular/core';
import { PdfParseProgress, StitchColor, TapestryProject } from '../models/tapestry.model';

interface AxisTick {
  value: number;
  x: number;
  y: number;
}

interface CellSample {
  row: number;
  col: number;
  r: number;
  g: number;
  b: number;
  symbol: string;
}

@Injectable({ providedIn: 'root' })
export class PdfParserService {
  /** Parses a Pixel Stitch PDF into a unified TapestryProject. */
  async parsePixelStitchPdf(
    file: File,
    onProgress?: (progress: PdfParseProgress) => void,
  ): Promise<TapestryProject> {
    onProgress?.({
      stage: 'loading',
      currentPage: 0,
      totalPages: 0,
      message: `Loading ${file.name}...`,
    });

    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;

    const allSamples: CellSample[] = [];
    let maxRow = 0;
    let maxCol = 0;
    let parsedGridPages = 0;

    const scale = 1.5;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not create 2D canvas context for PDF parsing.');
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        stage: 'parsing',
        currentPage: pageNum,
        totalPages,
        message: `Parsing page ${pageNum} of ${totalPages}...`,
      });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();

      const items = textContent.items
        .filter((item): item is typeof item & { str: string; transform: number[] } =>
          'str' in item && 'transform' in item && item.str.trim().length > 0,
        )
        .map((item) => {
          const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          return {
            str: item.str.trim(),
            x: vx,
            y: vy,
          };
        });

      const gridMeta = this.detectGridAxes(items);
      if (!gridMeta) {
        // Likely a cover, title, or legend page — skip grid extraction
        continue;
      }

      parsedGridPages++;

      // Render page to canvas to sample exact cell background colors
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const { minCol, maxColPage, minRow, maxRowPage, originX, originY, colStep, rowStep } =
        gridMeta;

      // Index symbol text items by approximate (row, col)
      const symbolMap = new Map<string, string>();
      for (const item of items) {
        if (/^\d+$/.test(item.str) && Number(item.str) % 10 === 0) {
          continue;
        }
        if (item.str.length <= 2) {
          const col = Math.floor((item.x - originX) / colStep) + minCol;
          const row = Math.floor((item.y - originY) / rowStep) + minRow;
          if (col >= minCol && col <= maxColPage && row >= minRow && row <= maxRowPage) {
            symbolMap.set(`${row}:${col}`, item.str[0]);
          }
        }
      }

      for (let r = minRow; r <= maxRowPage; r++) {
        for (let c = minCol; c <= maxColPage; c++) {
          const cellX = originX + (c - minCol) * colStep;
          const cellY = originY + (r - minRow) * rowStep;

          const rgb = this.sampleCellColor(imageData, cellX, cellY, colStep, rowStep);
          const symbol = symbolMap.get(`${r}:${c}`) ?? '';

          // Skip pure white/empty margin cells if they have no symbol and are outside labeled bounds
          allSamples.push({
            row: r,
            col: c,
            r: rgb.r,
            g: rgb.g,
            b: rgb.b,
            symbol,
          });

          if (r + 1 > maxRow) maxRow = r + 1;
          if (c + 1 > maxCol) maxCol = c + 1;
        }
      }
    }

    if (parsedGridPages === 0 || allSamples.length === 0) {
      throw new Error(
        'Could not detect a Pixel Stitch grid in this PDF. Make sure it has row/column axis numbers (e.g. 0, 10, 20...).',
      );
    }

    onProgress?.({
      stage: 'finalizing',
      currentPage: totalPages,
      totalPages,
      message: `Building ${maxCol} × ${maxRow} tapestry & color palette...`,
    });

    const { colors, grid } = this.buildPaletteAndGrid(allSamples, maxCol, maxRow);
    const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'My Tapestry';

    return {
      id: crypto.randomUUID(),
      name: cleanName,
      width: maxCol,
      height: maxRow,
      colors,
      grid,
      completedCount: 0,
      direction: 'bottom-up-serpentine',
      maxChunkStitches: 0,
      queueLength: 5,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Detects horizontal & vertical axis tick numbers on a Pixel Stitch grid page. */
  private detectGridAxes(items: Array<{ str: string; x: number; y: number }>): {
    minCol: number;
    maxColPage: number;
    minRow: number;
    maxRowPage: number;
    originX: number;
    originY: number;
    colStep: number;
    rowStep: number;
  } | null {
    const numericTicks: AxisTick[] = items
      .filter((it) => /^\d{1,4}$/.test(it.str))
      .map((it) => ({ value: Number(it.str), x: it.x, y: it.y }));

    if (numericTicks.length < 4) return null;

    // Group by similar Y to find the horizontal top axis
    const yBuckets = new Map<number, AxisTick[]>();
    for (const tick of numericTicks) {
      const bucketKey = Math.round(tick.y / 6) * 6;
      const list = yBuckets.get(bucketKey) ?? [];
      list.push(tick);
      yBuckets.set(bucketKey, list);
    }

    let hTicks: AxisTick[] = [];
    for (const list of yBuckets.values()) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      if (sorted.length >= 2 && this.isIncreasingSequence(sorted)) {
        if (sorted.length > hTicks.length) {
          hTicks = sorted;
        }
      }
    }

    // Group by similar X to find the vertical left axis
    const xBuckets = new Map<number, AxisTick[]>();
    for (const tick of numericTicks) {
      const bucketKey = Math.round(tick.x / 6) * 6;
      const list = xBuckets.get(bucketKey) ?? [];
      list.push(tick);
      xBuckets.set(bucketKey, list);
    }

    let vTicks: AxisTick[] = [];
    for (const list of xBuckets.values()) {
      const sorted = [...list].sort((a, b) => a.y - b.y);
      if (sorted.length >= 2 && this.isIncreasingSequence(sorted)) {
        if (sorted.length > vTicks.length) {
          vTicks = sorted;
        }
      }
    }

    if (hTicks.length < 2 || vTicks.length < 2) {
      return null;
    }

    const firstH = hTicks[0];
    const lastH = hTicks[hTicks.length - 1];
    const colSpan = lastH.value - firstH.value;
    if (colSpan <= 0) return null;
    const colStep = (lastH.x - firstH.x) / colSpan;

    const firstV = vTicks[0];
    const lastV = vTicks[vTicks.length - 1];
    const rowSpan = lastV.value - firstV.value;
    if (rowSpan <= 0) return null;
    const rowStep = (lastV.y - firstV.y) / rowSpan;

    if (colStep < 3 || rowStep < 3) return null;

    return {
      minCol: firstH.value,
      maxColPage: lastH.value - 1,
      minRow: firstV.value,
      maxRowPage: lastV.value - 1,
      originX: firstH.x,
      originY: firstV.y,
      colStep,
      rowStep,
    };
  }

  private isIncreasingSequence(ticks: AxisTick[]): boolean {
    let strictlyIncreasing = true;
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].value <= ticks[i - 1].value) {
        strictlyIncreasing = false;
        break;
      }
    }
    return strictlyIncreasing;
  }

  /** Samples 4 corner-interior points of a grid cell to avoid the center symbol & border lines. */
  private sampleCellColor(
    imageData: ImageData,
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
  ): { r: number; g: number; b: number } {
    const offsets = [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ];
    const samples: Array<{ r: number; g: number; b: number }> = [];
    const { width, height, data } = imageData;

    for (const [ox, oy] of offsets) {
      const px = Math.max(0, Math.min(width - 1, Math.round(cellX + cellW * ox)));
      const py = Math.max(0, Math.min(height - 1, Math.round(cellY + cellH * oy)));
      const idx = (py * width + px) * 4;
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }

    // Median per channel reduces noise from anti-aliased symbols or grid lines
    const rs = samples.map((s) => s.r).sort((a, b) => a - b);
    const gs = samples.map((s) => s.g).sort((a, b) => a - b);
    const bs = samples.map((s) => s.b).sort((a, b) => a - b);

    return {
      r: rs[1],
      g: gs[1],
      b: bs[1],
    };
  }

  private buildPaletteAndGrid(
    samples: CellSample[],
    width: number,
    height: number,
  ): { colors: StitchColor[]; grid: number[] } {
    const colors: StitchColor[] = [];
    const grid = new Array<number>(width * height).fill(0);

    const findOrAddColor = (r: number, g: number, b: number, symbol: string): number => {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const cr = parseInt(c.hex.slice(1, 3), 16);
        const cg = parseInt(c.hex.slice(3, 5), 16);
        const cb = parseInt(c.hex.slice(5, 7), 16);
        const dist = Math.hypot(r - cr, g - cg, b - cb);

        // Prefer matching both symbol and color if symbol is present
        if (symbol && c.symbol === symbol && dist < 35 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        } else if (!symbol && dist < 20 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        } else if (dist < 14 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        if (!colors[bestIdx].symbol && symbol) {
          colors[bestIdx].symbol = symbol;
        }
        return bestIdx;
      }

      const hex = this.rgbToHex(r, g, b);
      const fallbackSymbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=<>?';
      const assignedSymbol = symbol || fallbackSymbols[colors.length % fallbackSymbols.length];
      const newIdx = colors.length;
      colors.push({
        id: `color-${newIdx}`,
        symbol: assignedSymbol,
        hex,
        name: `Color ${assignedSymbol} (${hex})`,
      });
      return newIdx;
    };

    for (const sample of samples) {
      if (sample.row >= 0 && sample.row < height && sample.col >= 0 && sample.col < width) {
        const colorIdx = findOrAddColor(sample.r, sample.g, sample.b, sample.symbol);
        grid[sample.row * width + sample.col] = colorIdx;
      }
    }

    return { colors, grid };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /** Creates a built-in sample tapestry so users can try the tracker immediately. */
  createSampleProject(): TapestryProject {
    const width = 48;
    const height = 36;
    const colors: StitchColor[] = [
      { id: 'c0', symbol: 'H', hex: '#F3EFE0', name: 'Cream Yarn' },
      { id: 'c1', symbol: 'N', hex: '#284B3C', name: 'Forest Green' },
      { id: 'c2', symbol: 'O', hex: '#E0A800', name: 'Mustard Gold' },
      { id: 'c3', symbol: '<', hex: '#9E3333', name: 'Crimson Red' },
      { id: 'c4', symbol: 'P', hex: '#1B2420', name: 'Charcoal Outline' },
    ];

    const grid = new Array<number>(width * height).fill(0);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const idx = r * width + c;
        // Gold base band at bottom
        if (r >= 26) {
          grid[idx] = r % 2 === 0 || c % 4 === 0 ? 2 : 0;
          continue;
        }
        // Crimson corner block top-right
        if (r >= 2 && r <= 14 && c >= 32 && c <= 45) {
          grid[idx] = (r + c) % 5 === 0 ? 0 : 3;
          continue;
        }
        // Forest green geometric crown / diamond motif
        const dx = Math.abs(c - 18);
        const dy = Math.abs(r - 13);
        if (dx + dy <= 10) {
          if (dx + dy === 10) {
            grid[idx] = 4; // Charcoal outline
          } else if (dx <= 3 && dy <= 3) {
            grid[idx] = 2; // Gold center
          } else {
            grid[idx] = 1; // Forest green
          }
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      name: 'Tri-Crown Sample Tapestry',
      width,
      height,
      colors,
      grid,
      completedCount: 180,
      direction: 'bottom-up-serpentine',
      maxChunkStitches: 0,
      queueLength: 5,
      updatedAt: new Date().toISOString(),
    };
  }
}
