export type StitchDirection =
  | 'bottom-up-serpentine'
  | 'bottom-up-ltr'
  | 'top-down-serpentine'
  | 'top-down-ltr';

export interface StitchColor {
  id: string;
  symbol: string;
  hex: string;
  name: string;
  dmcCode?: string;
  mergedIntoId?: string;
}

export interface TapestryProject {
  id: string;
  name: string;
  width: number;
  height: number;
  colors: StitchColor[];
  /**
   * Flat row-major array of color indices (length = width * height),
   * where index = row * width + col (row 0 is top of image).
   */
  grid: number[];
  /** Number of stitches completed along the project's stitching order (0 .. width * height). */
  completedCount: number;
  direction: StitchDirection;
  /** Maximum stitches per section card; 0 means full contiguous color run. */
  maxChunkStitches: number;
  /** Number of upcoming sections to display in the queue. */
  queueLength: number;
  updatedAt: string;
}

export interface StitchSection {
  startIndex: number;
  endIndex: number;
  row: number;
  displayRow: number;
  startCol: number;
  endCol: number;
  rowDirection: 'rtl' | 'ltr';
  sideLabel: 'RS' | 'WS';
  colorId: string;
  colorIndex: number;
  count: number;
  cells: Array<{ row: number; col: number }>;
}

export interface PdfParseProgress {
  stage: 'loading' | 'scanning' | 'parsing' | 'finalizing';
  currentPage: number;
  totalPages: number;
  message: string;
}
