import { Injectable } from '@angular/core';
import {
  StitchColor,
  StitchDirection,
  StitchSection,
  TapestryProject,
} from '../models/tapestry.model';

@Injectable({ providedIn: 'root' })
export class SectionEngineService {
  /** Resolves a color index through any `mergedIntoId` chain to its effective color index. */
  resolveEffectiveColorIndex(colors: StitchColor[], colorIndex: number): number {
    const color = colors[colorIndex];
    if (!color?.mergedIntoId) {
      return colorIndex;
    }

    const visited = new Set<string>([color.id]);
    let current: StitchColor | undefined = color;
    while (current?.mergedIntoId) {
      if (visited.has(current.mergedIntoId)) {
        break;
      }
      visited.add(current.mergedIntoId);
      const nextIdx = colors.findIndex((c) => c.id === current!.mergedIntoId);
      if (nextIdx === -1) {
        break;
      }
      current = colors[nextIdx];
      if (!current.mergedIntoId) {
        return nextIdx;
      }
    }

    const finalIdx = colors.findIndex((c) => c.id === current?.id);
    return finalIdx === -1 ? colorIndex : finalIdx;
  }

  /** Converts a linear stitch index (0 .. width*height-1) to visual (row, col) & direction metadata. */
  linearToCell(
    linearIndex: number,
    width: number,
    height: number,
    direction: StitchDirection,
  ): { row: number; col: number; rowDirection: 'rtl' | 'ltr'; sideLabel: 'RS' | 'WS' } {
    const stitchRowIndex = Math.floor(linearIndex / width);
    const colInRow = linearIndex % width;

    const isBottomUp = direction.startsWith('bottom-up');
    const isSerpentine = direction.endsWith('serpentine');
    const row = isBottomUp ? height - 1 - stitchRowIndex : stitchRowIndex;

    let rowDirection: 'rtl' | 'ltr' = 'ltr';
    let sideLabel: 'RS' | 'WS' = 'RS';

    if (isSerpentine) {
      const isEvenRow = stitchRowIndex % 2 === 0;
      if (isBottomUp) {
        // Standard crochet tapestry: bottom-up RS starts right-to-left, WS turns left-to-right
        rowDirection = isEvenRow ? 'rtl' : 'ltr';
        sideLabel = isEvenRow ? 'RS' : 'WS';
      } else {
        rowDirection = isEvenRow ? 'ltr' : 'rtl';
        sideLabel = isEvenRow ? 'RS' : 'WS';
      }
    }

    const col = rowDirection === 'rtl' ? width - 1 - colInRow : colInRow;
    return { row, col, rowDirection, sideLabel };
  }

  /** Converts a visual (row, col) back to its linear index in the project's stitching order. */
  cellToLinear(
    row: number,
    col: number,
    width: number,
    height: number,
    direction: StitchDirection,
  ): number {
    const isBottomUp = direction.startsWith('bottom-up');
    const isSerpentine = direction.endsWith('serpentine');
    const stitchRowIndex = isBottomUp ? height - 1 - row : row;

    let rowDirection: 'rtl' | 'ltr' = 'ltr';
    if (isSerpentine) {
      const isEvenRow = stitchRowIndex % 2 === 0;
      rowDirection = isBottomUp ? (isEvenRow ? 'rtl' : 'ltr') : isEvenRow ? 'ltr' : 'rtl';
    }

    const colInRow = rowDirection === 'rtl' ? width - 1 - col : col;
    return stitchRowIndex * width + colInRow;
  }

  /** Computes the next `limit` StitchSections starting from `project.completedCount`. */
  getUpcomingSections(project: TapestryProject, limit?: number): StitchSection[] {
    const total = project.width * project.height;
    const maxSections = limit ?? Math.max(1, project.queueLength || 5);
    const maxChunk = project.maxChunkStitches > 0 ? project.maxChunkStitches : Infinity;

    const sections: StitchSection[] = [];
    let cursor = Math.max(0, Math.min(project.completedCount, total));

    while (cursor < total && sections.length < maxSections) {
      const firstCell = this.linearToCell(cursor, project.width, project.height, project.direction);
      const rawColorIdx = project.grid[firstCell.row * project.width + firstCell.col] ?? 0;
      const effectiveColorIdx = this.resolveEffectiveColorIndex(project.colors, rawColorIdx);
      const color = project.colors[effectiveColorIdx] ?? project.colors[0];

      const cells: Array<{ row: number; col: number }> = [{ row: firstCell.row, col: firstCell.col }];
      let endCursor = cursor + 1;

      while (endCursor < total && cells.length < maxChunk) {
        const nextCell = this.linearToCell(
          endCursor,
          project.width,
          project.height,
          project.direction,
        );
        // Never cross a row boundary inside a single section
        if (nextCell.row !== firstCell.row) {
          break;
        }
        const nextRawIdx = project.grid[nextCell.row * project.width + nextCell.col] ?? 0;
        const nextEffectiveIdx = this.resolveEffectiveColorIndex(project.colors, nextRawIdx);
        if (nextEffectiveIdx !== effectiveColorIdx) {
          break;
        }
        cells.push({ row: nextCell.row, col: nextCell.col });
        endCursor++;
      }

      const lastCell = cells[cells.length - 1];
      const isBottomUp = project.direction.startsWith('bottom-up');
      sections.push({
        startIndex: cursor,
        endIndex: endCursor,
        row: firstCell.row,
        displayRow: isBottomUp ? project.height - firstCell.row : firstCell.row + 1,
        startCol: firstCell.col + 1,
        endCol: lastCell.col + 1,
        rowDirection: firstCell.rowDirection,
        sideLabel: firstCell.sideLabel,
        colorId: color?.id ?? String(effectiveColorIdx),
        colorIndex: effectiveColorIdx,
        count: cells.length,
        cells,
      });

      cursor = endCursor;
    }

    return sections;
  }

  /** Run-length encodes a flat grid array into `[colorIndex, count, ...]` pairs for compact storage. */
  encodeGridRle(grid: number[]): number[] {
    if (grid.length === 0) return [];
    const rle: number[] = [];
    let current = grid[0];
    let count = 1;
    for (let i = 1; i < grid.length; i++) {
      if (grid[i] === current) {
        count++;
      } else {
        rle.push(current, count);
        current = grid[i];
        count = 1;
      }
    }
    rle.push(current, count);
    return rle;
  }

  /** Decodes `[colorIndex, count, ...]` pairs back into a flat grid array. */
  decodeGridRle(rle: number[], expectedLength: number): number[] {
    const grid = new Array<number>(expectedLength).fill(0);
    let offset = 0;
    for (let i = 0; i + 1 < rle.length && offset < expectedLength; i += 2) {
      const val = rle[i];
      const count = rle[i + 1];
      const end = Math.min(offset + count, expectedLength);
      for (let j = offset; j < end; j++) {
        grid[j] = val;
      }
      offset = end;
    }
    return grid;
  }

  /** Computes per-color total stitch counts for the legend. */
  getColorCounts(project: TapestryProject): Map<string, number> {
    const counts = new Map<string, number>();
    for (const c of project.colors) {
      counts.set(c.id, 0);
    }
    for (let i = 0; i < project.grid.length; i++) {
      const idx = this.resolveEffectiveColorIndex(project.colors, project.grid[i]);
      const color = project.colors[idx];
      if (color) {
        counts.set(color.id, (counts.get(color.id) ?? 0) + 1);
      }
    }
    return counts;
  }

  /** Finds how many stitches until the active section's color appears again in the same row, or null if it's the last in the row. */
  getNextAppearanceInRow(
    project: TapestryProject,
    section: StitchSection,
  ): { gapStitches: number } | null {
    const total = project.width * project.height;
    let cursor = section.endIndex;
    let gap = 0;

    while (cursor < total) {
      const cell = this.linearToCell(cursor, project.width, project.height, project.direction);
      if (cell.row !== section.row) break;

      const effIdx = this.resolveEffectiveColorIndex(
        project.colors,
        project.grid[cell.row * project.width + cell.col] ?? 0,
      );
      if (effIdx === section.colorIndex) {
        return { gapStitches: gap };
      }
      gap++;
      cursor++;
    }
    return null;
  }

  /** Returns a proportional visual strip and per-color stitch counts for the remaining stitches in the current row. */
  getUpcomingRowStrip(
    project: TapestryProject,
    windowSize = Infinity,
  ): {
    runs: Array<{
      color: StitchColor;
      count: number;
      startRow: number;
      startCol: number;
      endCol: number;
      offsetFromNow: number;
    }>;
    totals: Array<{ color: StitchColor; count: number }>;
    totalStitches: number;
  } {
    const total = project.width * project.height;
    const start = Math.max(0, Math.min(project.completedCount, total));
    if (start >= total) {
      return { runs: [], totals: [], totalStitches: 0 };
    }

    const firstCell = this.linearToCell(start, project.width, project.height, project.direction);
    const runs: Array<{
      color: StitchColor;
      count: number;
      startRow: number;
      startCol: number;
      endCol: number;
      offsetFromNow: number;
    }> = [];
    const countByColor = new Map<number, number>();
    let cursor = start;
    let taken = 0;

    while (cursor < total && taken < windowSize) {
      const cell = this.linearToCell(cursor, project.width, project.height, project.direction);
      if (cell.row !== firstCell.row) break;

      const effIdx = this.resolveEffectiveColorIndex(
        project.colors,
        project.grid[cell.row * project.width + cell.col] ?? 0,
      );
      const color = project.colors[effIdx] ?? project.colors[0];

      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.color.id === color.id) {
        lastRun.count++;
        lastRun.endCol = cell.col;
      } else {
        runs.push({
          color,
          count: 1,
          startRow: cell.row,
          startCol: cell.col,
          endCol: cell.col,
          offsetFromNow: taken,
        });
      }
      countByColor.set(effIdx, (countByColor.get(effIdx) ?? 0) + 1);
      cursor++;
      taken++;
    }

    const totals = [...countByColor.entries()]
      .map(([idx, count]) => ({ color: project.colors[idx] ?? project.colors[0], count }))
      .sort((a, b) => b.count - a.count);

    return { runs, totals, totalStitches: taken };
  }

  /**
   * Returns the contiguous color runs directly underneath `section` on the previous row,
   * ordered left-to-right visually (minCol -> maxCol) so they align 1:1 with the tapestry.
   */
  getUnderneathRuns(
    project: TapestryProject,
    section: StitchSection,
  ): Array<{ color: StitchColor; count: number }> {
    const isBottomUp = project.direction.startsWith('bottom-up');
    const prevRow = isBottomUp ? section.row + 1 : section.row - 1;
    if (prevRow < 0 || prevRow >= project.height) return [];

    const minCol = Math.min(section.startCol, section.endCol) - 1;
    const maxCol = Math.max(section.startCol, section.endCol) - 1;
    const runs: Array<{ color: StitchColor; count: number }> = [];

    for (let c = minCol; c <= maxCol; c++) {
      const effIdx = this.resolveEffectiveColorIndex(
        project.colors,
        project.grid[prevRow * project.width + c] ?? 0,
      );
      const color = project.colors[effIdx] ?? project.colors[0];
      const last = runs[runs.length - 1];
      if (last && last.color.id === color.id) {
        last.count++;
      } else {
        runs.push({ color, count: 1 });
      }
    }

    return runs;
  }
}
