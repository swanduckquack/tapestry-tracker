import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { StitchColor, StitchDirection, TapestryProject } from '../models/tapestry.model';
import { SectionEngineService } from './section-engine.service';
import { SupabaseService } from './supabase.service';

const LOCAL_PROJECTS_KEY = 'tapestry_projects_v1';
const ACTIVE_PROJECT_KEY = 'tapestry_active_project_id';
const CM_PER_STITCH_KEY = 'tapestry_cm_per_stitch';

interface StoredProjectDto {
  id: string;
  name: string;
  width: number;
  height: number;
  colors: StitchColor[];
  gridRle: number[];
  completedCount: number;
  direction: StitchDirection;
  maxChunkStitches: number;
  queueLength: number;
  updatedAt: string;
}

interface SupabaseRow {
  id: string;
  name: string;
  width: number;
  height: number;
  colors: StitchColor[];
  grid_rle: number[];
  completed_count: number;
  direction: StitchDirection;
  max_chunk_stitches: number;
  queue_length: number;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectStoreService {
  private readonly engine = inject(SectionEngineService);
  private readonly supabase = inject(SupabaseService);

  readonly projects = signal<TapestryProject[]>([]);
  readonly activeProjectId = signal<string | null>(null);
  readonly undoStack = signal<number[]>([]);
  readonly syncStatus = signal<'local' | 'syncing' | 'synced' | 'error'>('local');
  readonly cmPerStitch = signal<number>(this.loadCmPerStitch());
  readonly rowCompletedEvent = signal<{
    completedRow: number;
    nextRow: number | null;
    nextDir: 'rtl' | 'ltr' | null;
    seq: number;
  } | null>(null);
  private rowEventSeq = 0;

  readonly activeProject = computed(() => {
    const id = this.activeProjectId();
    return this.projects().find((p) => p.id === id) ?? null;
  });

  readonly upcomingSections = computed(() => {
    const project = this.activeProject();
    if (!project) return [];
    return this.engine.getUpcomingSections(project);
  });

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;

  constructor() {
    this.loadFromLocal();

    effect(() => {
      if (this.supabase.isConfigured()) {
        this.loadFromSupabase();
        this.subscribeRealtime();
      } else {
        this.unsubscribeRealtime();
        this.syncStatus.set('local');
      }
    });
  }

  addProject(project: TapestryProject): void {
    this.projects.update((list) => [project, ...list]);
    this.activeProjectId.set(project.id);
    this.undoStack.set([]);
    this.persistAll(project);
  }

  selectProject(id: string): void {
    this.activeProjectId.set(id);
    this.undoStack.set([]);
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  }

  deleteProject(id: string): void {
    this.projects.update((list) => list.filter((p) => p.id !== id));
    if (this.activeProjectId() === id) {
      const next = this.projects()[0]?.id ?? null;
      this.activeProjectId.set(next);
    }
    this.saveToLocal();

    const client = this.supabase.getClient();
    if (client && this.supabase.isConfigured()) {
      client.from('tapestry_projects').delete().eq('id', id).then();
    }
  }

  completeCurrentSection(): void {
    const project = this.activeProject();
    const sections = this.upcomingSections();
    if (!project || sections.length === 0) return;

    const current = sections[0];
    const prevCount = project.completedCount;
    this.undoStack.update((stack) => [...stack.slice(-49), prevCount]);
    this.patchActiveProject({ completedCount: current.endIndex });
    this.checkRowCompletion(project, prevCount, current.endIndex);
  }

  advanceStitches(count: number): void {
    const project = this.activeProject();
    const sections = this.upcomingSections();
    if (!project || sections.length === 0 || count <= 0) return;

    const current = sections[0];
    const prevCount = project.completedCount;
    const target = Math.min(current.endIndex, prevCount + count);
    if (target === prevCount) return;

    this.undoStack.update((stack) => [...stack.slice(-49), prevCount]);
    this.patchActiveProject({ completedCount: target });
    this.checkRowCompletion(project, prevCount, target);
  }

  private checkRowCompletion(project: TapestryProject, prevCount: number, newCount: number): void {
    const prevRowIdx = Math.floor(prevCount / project.width);
    const nextRowIdx = Math.floor(newCount / project.width);
    if (nextRowIdx <= prevRowIdx) return;

    const total = project.width * project.height;
    const completedRow = prevRowIdx + 1;
    let nextRow: number | null = null;
    let nextDir: 'rtl' | 'ltr' | null = null;

    if (newCount < total) {
      const nextCell = this.engine.linearToCell(
        newCount,
        project.width,
        project.height,
        project.direction,
      );
      nextRow = nextRowIdx + 1;
      nextDir = nextCell.rowDirection;
    }

    this.rowCompletedEvent.set({
      completedRow,
      nextRow,
      nextDir,
      seq: ++this.rowEventSeq,
    });

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([18, 36, 24]);
    }
  }

  undo(): void {
    const project = this.activeProject();
    const stack = this.undoStack();
    if (!project || stack.length === 0) return;

    const previousCount = stack[stack.length - 1];
    this.undoStack.set(stack.slice(0, -1));
    this.patchActiveProject({ completedCount: previousCount });
  }

  jumpToCount(targetCount: number): void {
    const project = this.activeProject();
    if (!project) return;
    const clamped = Math.max(0, Math.min(targetCount, project.width * project.height));
    this.undoStack.update((stack) => [...stack.slice(-49), project.completedCount]);
    this.patchActiveProject({ completedCount: clamped });
  }

  updateProjectSettings(patch: {
    direction?: StitchDirection;
    maxChunkStitches?: number;
    queueLength?: number;
    name?: string;
  }): void {
    this.patchActiveProject(patch);
  }

  setCmPerStitch(cm: number): void {
    const clean = Math.max(0, Math.min(50, Number.isFinite(cm) ? cm : 0));
    this.cmPerStitch.set(clean);
    localStorage.setItem(CM_PER_STITCH_KEY, String(clean));
  }

  private loadCmPerStitch(): number {
    const raw = Number(localStorage.getItem(CM_PER_STITCH_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  renameColor(colorId: string, newName: string): void {
    const project = this.activeProject();
    if (!project) return;
    const colors = project.colors.map((c) => (c.id === colorId ? { ...c, name: newName } : c));
    this.patchActiveProject({ colors });
  }

  updateColorHex(colorId: string, hex: string): void {
    const project = this.activeProject();
    if (!project) return;
    const normalized = hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
    if (!/^#[0-9a-f]{6}$/.test(normalized)) return;
    const colors = project.colors.map((c) =>
      c.id === colorId
        ? { ...c, originalHex: c.originalHex ?? c.hex, hex: normalized }
        : c,
    );
    this.patchActiveProject({ colors });
  }

  resetColorHex(colorId: string): void {
    const project = this.activeProject();
    if (!project) return;
    const colors = project.colors.map((c) =>
      c.id === colorId && c.originalHex ? { ...c, hex: c.originalHex } : c,
    );
    this.patchActiveProject({ colors });
  }

  resetAllColors(): void {
    const project = this.activeProject();
    if (!project) return;
    const colors = project.colors.map((c) =>
      c.originalHex ? { ...c, hex: c.originalHex } : c,
    );
    this.patchActiveProject({ colors });
  }

  mergeColors(sourceColorId: string, targetColorId: string | undefined): void {
    const project = this.activeProject();
    if (!project || sourceColorId === targetColorId) return;
    const colors = project.colors.map((c) =>
      c.id === sourceColorId ? { ...c, mergedIntoId: targetColorId || undefined } : c,
    );
    this.patchActiveProject({ colors });
  }

  private patchActiveProject(patch: Partial<TapestryProject>): void {
    const current = this.activeProject();
    if (!current) return;

    const updated: TapestryProject = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.projects.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    this.persistAll(updated);
  }

  private persistAll(changedProject: TapestryProject): void {
    this.saveToLocal();

    const client = this.supabase.getClient();
    if (!client || !this.supabase.isConfigured()) return;

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.syncStatus.set('syncing');

    this.saveTimer = setTimeout(async () => {
      const row = this.toSupabaseRow(changedProject);
      const { error } = await client.from('tapestry_projects').upsert(row, { onConflict: 'id' });
      this.syncStatus.set(error ? 'error' : 'synced');
    }, 450);
  }

  private saveToLocal(): void {
    try {
      const dtos: StoredProjectDto[] = this.projects().map((p) => ({
        id: p.id,
        name: p.name,
        width: p.width,
        height: p.height,
        colors: p.colors,
        gridRle: this.engine.encodeGridRle(p.grid),
        completedCount: p.completedCount,
        direction: p.direction,
        maxChunkStitches: p.maxChunkStitches,
        queueLength: p.queueLength,
        updatedAt: p.updatedAt,
      }));
      localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(dtos));
      const activeId = this.activeProjectId();
      if (activeId) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, activeId);
      }
    } catch {
      // Storage quota exceeded — ignore gracefully
    }
  }

  private loadFromLocal(): void {
    try {
      const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (!raw) return;
      const dtos = JSON.parse(raw) as StoredProjectDto[];
      const loaded = dtos.map((d) => ({
        id: d.id,
        name: d.name,
        width: d.width,
        height: d.height,
        colors: d.colors,
        grid: this.engine.decodeGridRle(d.gridRle, d.width * d.height),
        completedCount: d.completedCount,
        direction: d.direction,
        maxChunkStitches: d.maxChunkStitches,
        queueLength: d.queueLength,
        updatedAt: d.updatedAt,
      }));
      this.projects.set(loaded);

      const savedActive = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (savedActive && loaded.some((p) => p.id === savedActive)) {
        this.activeProjectId.set(savedActive);
      } else if (loaded.length > 0) {
        this.activeProjectId.set(loaded[0].id);
      }
    } catch {
      // Ignore malformed local data
    }
  }

  private async loadFromSupabase(): Promise<void> {
    const client = this.supabase.getClient();
    if (!client || !this.supabase.isConfigured()) return;

    this.syncStatus.set('syncing');
    const { data, error } = await client
      .from('tapestry_projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      this.syncStatus.set('error');
      return;
    }

    if (data && data.length > 0) {
      const remoteProjects = (data as SupabaseRow[]).map((r) => this.fromSupabaseRow(r));
      this.projects.set(remoteProjects);
      if (!this.activeProjectId() || !remoteProjects.some((p) => p.id === this.activeProjectId())) {
        this.activeProjectId.set(remoteProjects[0].id);
      }
      this.saveToLocal();
    } else if (this.projects().length > 0) {
      // First-time sync: upload existing local projects to Supabase
      for (const localProj of this.projects()) {
        await client
          .from('tapestry_projects')
          .upsert(this.toSupabaseRow(localProj), { onConflict: 'id' });
      }
    }
    this.syncStatus.set('synced');
  }

  private subscribeRealtime(): void {
    const client = this.supabase.getClient();
    if (!client) return;
    this.unsubscribeRealtime();

    this.realtimeChannel = client
      .channel('tapestry_projects:all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tapestry_projects',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              this.projects.update((list) => list.filter((p) => p.id !== deletedId));
            }
          } else if (payload.new) {
            const incoming = this.fromSupabaseRow(payload.new as SupabaseRow);
            this.projects.update((list) => {
              const exists = list.some((p) => p.id === incoming.id);
              if (!exists) return [incoming, ...list];
              return list.map((p) =>
                p.id === incoming.id && incoming.updatedAt > p.updatedAt ? incoming : p,
              );
            });
          }
        },
      )
      .subscribe();
  }

  private unsubscribeRealtime(): void {
    const client = this.supabase.getClient();
    if (client && this.realtimeChannel) {
      client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private toSupabaseRow(project: TapestryProject): SupabaseRow {
    return {
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      colors: project.colors,
      grid_rle: this.engine.encodeGridRle(project.grid),
      completed_count: project.completedCount,
      direction: project.direction,
      max_chunk_stitches: project.maxChunkStitches,
      queue_length: project.queueLength,
      updated_at: project.updatedAt,
    };
  }

  private fromSupabaseRow(row: SupabaseRow): TapestryProject {
    return {
      id: row.id,
      name: row.name,
      width: row.width,
      height: row.height,
      colors: row.colors,
      grid: this.engine.decodeGridRle(row.grid_rle, row.width * row.height),
      completedCount: row.completed_count,
      direction: row.direction,
      maxChunkStitches: row.max_chunk_stitches,
      queueLength: row.queue_length,
      updatedAt: row.updated_at,
    };
  }
}
