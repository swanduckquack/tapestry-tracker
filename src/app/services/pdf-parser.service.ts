import { Injectable } from '@angular/core';
import { PdfParseProgress, StitchColor, TapestryProject } from '../models/tapestry.model';

interface AxisTick {
  value: number;
  x: number;
  y: number;
}

interface TextPoint {
  str: string;
  x: number;
  y: number;
}

@Injectable({ providedIn: 'root' })
export class PdfParserService {
  /** Parses a Pixel Stitch PDF into a unified TapestryProject using exact text & legend extraction. */
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

    const legendBySymbol = new Map<string, { r: number; g: number; b: number; stitches: number }>();
    const cellSymbols = new Map<string, string>();
    let maxRow = 0;
    let maxCol = 0;
    let parsedGridPages = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        stage: 'parsing',
        currentPage: pageNum,
        totalPages,
        message: `Parsing page ${pageNum} of ${totalPages}...`,
      });

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const rawItems: TextPoint[] = textContent.items
        .filter((item): item is typeof item & { str: string; transform: number[] } =>
          'str' in item && 'transform' in item && item.str.trim().length > 0,
        )
        .map((item) => {
          const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          return { str: item.str.trim(), x: vx, y: vy };
        });

      if (rawItems.length === 0) continue;

      // Check if this is a Legend page (contains "(R,G,B)" color tuples)
      if (this.tryParseLegendPage(rawItems, legendBySymbol)) {
        continue;
      }

      // Otherwise try to parse as a Grid page
      const gridMeta = this.detectGridAxes(rawItems);
      if (!gridMeta) {
        continue;
      }

      parsedGridPages++;
      const { minCol, minRow, colStep, rowStep, topAxisY, leftAxisX } = gridMeta;

      const gridItems = rawItems.filter(
        (it) => it.y > topAxisY + 2 && it.x > leftAxisX + 4 && !/^\d+$/.test(it.str),
      );
      if (gridItems.length === 0) continue;

      const originX = Math.min(...gridItems.map((it) => it.x));
      const originY = Math.min(...gridItems.map((it) => it.y));

      for (const item of gridItems) {
        const r = minRow + Math.round((item.y - originY) / rowStep);
        const startC = minCol + Math.round((item.x - originX) / colStep);
        const tokens = item.str.split(/\s+/);

        for (let k = 0; k < tokens.length; k++) {
          const sym = tokens[k];
          const c = startC + k;
          if (r >= 0 && c >= 0) {
            cellSymbols.set(`${r}:${c}`, sym);
            if (r + 1 > maxRow) maxRow = r + 1;
            if (c + 1 > maxCol) maxCol = c + 1;
          }
        }
      }
    }

    if (parsedGridPages === 0 || cellSymbols.size === 0) {
      throw new Error(
        'Could not detect a Pixel Stitch grid in this PDF. Make sure it has row/column axis numbers (e.g. 0, 10, 20...).',
      );
    }

    onProgress?.({
      stage: 'finalizing',
      currentPage: totalPages,
      totalPages,
      message: `Building ${maxCol} × ${maxRow} tapestry...`,
    });

    // Build palette from legend (or fallback to distinct symbols)
    const { colors, symbolToIndex } = this.buildPalette(legendBySymbol, cellSymbols);
    const grid = new Array<number>(maxCol * maxRow).fill(0);

    for (const [key, sym] of cellSymbols.entries()) {
      const [rStr, cStr] = key.split(':');
      const r = Number(rStr);
      const c = Number(cStr);
      const idx = symbolToIndex.get(sym) ?? 0;
      grid[r * maxCol + c] = idx;
    }

    const cleanName =
      file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'My Tapestry';

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

  private tryParseLegendPage(
    items: TextPoint[],
    legendBySymbol: Map<string, { r: number; g: number; b: number; stitches: number }>,
  ): boolean {
    let found = false;
    for (const it of items) {
      const m = it.str.match(/^\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/);
      if (!m) continue;

      const symItem = items.find(
        (s) => s !== it && Math.abs(s.y - it.y) < 3 && s.x < it.x && s.str.length === 1,
      );
      if (!symItem) continue;

      const stitchItem = items.find(
        (s) => s !== it && Math.abs(s.y - it.y) < 3 && s.x > it.x && /^\d+$/.test(s.str),
      );

      legendBySymbol.set(symItem.str, {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        stitches: stitchItem ? Number(stitchItem.str) : 0,
      });
      found = true;
    }
    return found;
  }

  private detectGridAxes(items: TextPoint[]): {
    minCol: number;
    minRow: number;
    colStep: number;
    rowStep: number;
    topAxisY: number;
    leftAxisX: number;
  } | null {
    const numericTicks: AxisTick[] = items
      .filter((it) => /^\d{1,4}$/.test(it.str))
      .map((it) => ({ value: Number(it.str), x: it.x, y: it.y }));

    if (numericTicks.length < 4) return null;

    // Top axis ticks share the minimum Y (within 2pt)
    const minTickY = Math.min(...numericTicks.map((t) => t.y));
    const topTicks = numericTicks
      .filter((t) => Math.abs(t.y - minTickY) <= 2)
      .sort((a, b) => a.x - b.x);

    // Left axis ticks are below the top axis and share the leftmost X region (within 8pt)
    const belowTop = numericTicks.filter((t) => t.y > minTickY + 2);
    if (belowTop.length < 2) return null;
    const minTickX = Math.min(...belowTop.map((t) => t.x));
    const leftTicks = belowTop
      .filter((t) => Math.abs(t.x - minTickX) <= 8)
      .sort((a, b) => a.y - b.y);

    if (topTicks.length < 2 || leftTicks.length < 2) return null;
    if (!this.isIncreasingSequence(topTicks) || !this.isIncreasingSequence(leftTicks)) return null;

    const minCol = topTicks[0].value;
    const minRow = leftTicks[0].value;
    const colSpan = topTicks[topTicks.length - 1].value - minCol;
    const rowSpan = leftTicks[leftTicks.length - 1].value - minRow;
    if (colSpan <= 0 || rowSpan <= 0) return null;

    const colStep = (topTicks[topTicks.length - 1].x - topTicks[0].x) / colSpan;
    const rowStep = (leftTicks[leftTicks.length - 1].y - leftTicks[0].y) / rowSpan;
    if (colStep < 3 || rowStep < 3) return null;

    return {
      minCol,
      minRow,
      colStep,
      rowStep,
      topAxisY: minTickY,
      leftAxisX: minTickX,
    };
  }

  private isIncreasingSequence(ticks: AxisTick[]): boolean {
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].value <= ticks[i - 1].value) return false;
    }
    return true;
  }

  private buildPalette(
    legendBySymbol: Map<string, { r: number; g: number; b: number; stitches: number }>,
    cellSymbols: Map<string, string>,
  ): { colors: StitchColor[]; symbolToIndex: Map<string, number> } {
    const colors: StitchColor[] = [];
    const symbolToIndex = new Map<string, number>();
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    const addEntry = (rawSymbol: string, hex: string) => {
      const idx = colors.length;
      const isPua = rawSymbol.charCodeAt(0) >= 0xe000 && rawSymbol.charCodeAt(0) <= 0xf8ff;
      const displaySym = isPua ? labels[idx % labels.length] : rawSymbol;
      symbolToIndex.set(rawSymbol, idx);
      colors.push({
        id: `color-${idx}`,
        symbol: displaySym,
        hex,
        name: `Color ${displaySym} (${hex})`,
      });
    };

    for (const [sym, info] of legendBySymbol.entries()) {
      addEntry(sym, this.rgbToHex(info.r, info.g, info.b));
    }

    // Add any symbols encountered in the grid that weren't in the legend
    for (const sym of cellSymbols.values()) {
      if (!symbolToIndex.has(sym)) {
        addEntry(sym, '#a1a1aa');
      }
    }

    return { colors, symbolToIndex };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
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
        if (r >= 26) {
          grid[idx] = r % 2 === 0 || c % 4 === 0 ? 2 : 0;
          continue;
        }
        if (r >= 2 && r <= 14 && c >= 32 && c <= 45) {
          grid[idx] = (r + c) % 5 === 0 ? 0 : 3;
          continue;
        }
        const dx = Math.abs(c - 18);
        const dy = Math.abs(r - 13);
        if (dx + dy <= 10) {
          if (dx + dy === 10) {
            grid[idx] = 4;
          } else if (dx <= 3 && dy <= 3) {
            grid[idx] = 2;
          } else {
            grid[idx] = 1;
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
