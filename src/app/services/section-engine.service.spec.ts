import { SectionEngineService } from './section-engine.service';
import { TapestryProject } from '../models/tapestry.model';

describe('SectionEngineService', () => {
  let service: SectionEngineService;

  const sampleProject = (overrides: Partial<TapestryProject> = {}): TapestryProject => ({
    id: 'test-1',
    name: 'Test',
    width: 4,
    height: 3,
    colors: [
      { id: 'c0', symbol: 'N', hex: '#111111', name: 'Black' },
      { id: 'c1', symbol: 'H', hex: '#ffffff', name: 'White' },
      { id: 'c2', symbol: 'O', hex: '#ff0000', name: 'Red' },
    ],
    // 3 rows x 4 cols:
    // row 0 (top):    0, 0, 1, 1
    // row 1 (middle): 1, 2, 2, 2
    // row 2 (bottom): 0, 0, 0, 1
    grid: [
      0, 0, 1, 1,
      1, 2, 2, 2,
      0, 0, 0, 1,
    ],
    completedCount: 0,
    direction: 'bottom-up-serpentine',
    maxChunkStitches: 0,
    queueLength: 10,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    service = new SectionEngineService();
  });

  it('reads bottom-up serpentine right-to-left on row 0 (bottom) and left-to-right on row 1', () => {
    const project = sampleProject();
    const sections = service.getUpcomingSections(project, 10);

    // Bottom row (row 2, displayRow 3) worked RTL: col 3 is c1(1), then cols 2,1,0 are c0(3)
    expect(sections[0].displayRow).toBe(3);
    expect(sections[0].rowDirection).toBe('rtl');
    expect(sections[0].sideLabel).toBe('RS');
    expect(sections[0].colorId).toBe('c1');
    expect(sections[0].count).toBe(1);

    expect(sections[1].displayRow).toBe(3);
    expect(sections[1].colorId).toBe('c0');
    expect(sections[1].count).toBe(3);

    // Middle row (row 1, displayRow 2) worked LTR: col 0 is c1(1), cols 1,2,3 are c2(3)
    expect(sections[2].displayRow).toBe(2);
    expect(sections[2].rowDirection).toBe('ltr');
    expect(sections[2].sideLabel).toBe('WS');
    expect(sections[2].colorId).toBe('c1');
    expect(sections[2].count).toBe(1);

    expect(sections[3].displayRow).toBe(2);
    expect(sections[3].colorId).toBe('c2');
    expect(sections[3].count).toBe(3);
  });

  it('splits long color runs when maxChunkStitches is set', () => {
    const project = sampleProject({ maxChunkStitches: 2, completedCount: 1 });
    const sections = service.getUpcomingSections(project, 5);

    // Remaining on bottom row: 3 x c0 -> split into 2 and 1
    expect(sections[0].colorId).toBe('c0');
    expect(sections[0].count).toBe(2);
    expect(sections[1].colorId).toBe('c0');
    expect(sections[1].count).toBe(1);
  });

  it('respects merged colors when grouping sections', () => {
    const project = sampleProject({
      colors: [
        { id: 'c0', symbol: 'N', hex: '#111111', name: 'Black' },
        { id: 'c1', symbol: 'H', hex: '#ffffff', name: 'White', mergedIntoId: 'c0' },
        { id: 'c2', symbol: 'O', hex: '#ff0000', name: 'Red' },
      ],
    });
    const sections = service.getUpcomingSections(project, 5);

    // Bottom row is [0, 0, 0, 1], with c1 merged into c0 -> all 4 stitches merge into 1 section
    expect(sections[0].colorId).toBe('c0');
    expect(sections[0].count).toBe(4);
  });

  it('round-trips cellToLinear and linearToCell', () => {
    const dir = 'bottom-up-serpentine';
    for (let i = 0; i < 12; i++) {
      const cell = service.linearToCell(i, 4, 3, dir);
      const back = service.cellToLinear(cell.row, cell.col, 4, 3, dir);
      expect(back).toBe(i);
    }
  });

  it('round-trips RLE encoding and decoding', () => {
    const grid = [0, 0, 0, 1, 2, 2, 0, 1, 1, 1, 1, 2];
    const rle = service.encodeGridRle(grid);
    const decoded = service.decodeGridRle(rle, grid.length);
    expect(decoded).toEqual(grid);
  });
});
