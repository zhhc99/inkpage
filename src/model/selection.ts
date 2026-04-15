import { INDEX_CELL_SIZE } from '../config';
import { runtime, state, type BoxSelection, type MovingSelection, type PointTuple, type Stroke } from '../state';
import { ptSegDistSq } from '../utils/geometry';
import { prepareStroke, computeBBox, clonePoints, getStrokeSize } from './stroke';

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function getQueryStrokes(minX: number, minY: number, maxX: number, maxY: number): Stroke[] {
  const ids = queryStrokeIds(minX, minY, maxX, maxY);
  if (!ids.size) return [];
  const hits: Stroke[] = [];
  for (const id of ids) {
    const stroke = runtime.strokeMap.get(id);
    if (stroke) hits.push(stroke);
  }
  hits.sort((a, b) => (b.order || 0) - (a.order || 0));
  return hits;
}

export function getSelectedStrokes(): Stroke[] {
  const list: Stroke[] = [];
  for (const stroke of runtime.strokes) {
    if (runtime.selectedStrokeIds.has(stroke.id)) list.push(stroke);
  }
  return list;
}

export function getCellKey(ix: number, iy: number): string {
  return `${ix}:${iy}`;
}

export function getBBoxCellKeys(bbox: NonNullable<Stroke['bbox']>): string[] {
  const keys: string[] = [];
  const ix0 = Math.floor(bbox.minX / INDEX_CELL_SIZE);
  const iy0 = Math.floor(bbox.minY / INDEX_CELL_SIZE);
  const ix1 = Math.floor(bbox.maxX / INDEX_CELL_SIZE);
  const iy1 = Math.floor(bbox.maxY / INDEX_CELL_SIZE);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) keys.push(getCellKey(ix, iy));
  }
  return keys;
}

export function addStrokeToIndex(stroke: Stroke): void {
  if (!stroke.bbox) return;
  runtime.strokeMap.set(stroke.id, stroke);
  stroke.indexKeys = getBBoxCellKeys(stroke.bbox);
  for (const key of stroke.indexKeys) {
    let bucket = runtime.strokeIndex.get(key);
    if (!bucket) {
      bucket = new Set<number>();
      runtime.strokeIndex.set(key, bucket);
    }
    bucket.add(stroke.id);
  }
}

export function removeStrokeFromIndex(stroke: Stroke): void {
  if (stroke.indexKeys) {
    for (const key of stroke.indexKeys) {
      const bucket = runtime.strokeIndex.get(key);
      if (!bucket) continue;
      bucket.delete(stroke.id);
      if (!bucket.size) runtime.strokeIndex.delete(key);
    }
  }
  runtime.strokeMap.delete(stroke.id);
  stroke.indexKeys = null;
}

export function refreshStrokeInIndex(stroke: Stroke): void {
  removeStrokeFromIndex(stroke);
  addStrokeToIndex(stroke);
}

export function syncStrokeOrder(): void {
  for (let i = 0; i < runtime.strokes.length; i++) runtime.strokes[i].order = i;
}

export function rebuildStrokeIndex(): void {
  syncStrokeOrder();
  runtime.strokeMap = new Map();
  runtime.strokeIndex = new Map();
  for (const stroke of runtime.strokes) addStrokeToIndex(stroke);
}

export function queryStrokeIds(minX: number, minY: number, maxX: number, maxY: number): Set<number> {
  const ids = new Set<number>();
  const ix0 = Math.floor(minX / INDEX_CELL_SIZE);
  const iy0 = Math.floor(minY / INDEX_CELL_SIZE);
  const ix1 = Math.floor(maxX / INDEX_CELL_SIZE);
  const iy1 = Math.floor(maxY / INDEX_CELL_SIZE);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const bucket = runtime.strokeIndex.get(getCellKey(ix, iy));
      if (!bucket) continue;
      for (const id of bucket) ids.add(id);
    }
  }
  return ids;
}

export function eraserHitsStroke(ex: number, ey: number, er: number, stroke: Stroke): boolean {
  if (!stroke.bbox) return false;
  const size = getStrokeSize(stroke.config);
  const margin = er + size / 2 + 2;
  if (
    ex - margin > stroke.bbox.maxX ||
    ex + margin < stroke.bbox.minX ||
    ey - margin > stroke.bbox.maxY ||
    ey + margin < stroke.bbox.minY
  ) {
    return false;
  }
  const inkR = size / 2 + 1;
  const hitDistSq = (er + inkR) * (er + inkR);
  for (let i = 0; i < stroke.points.length; i++) {
    const point = stroke.points[i];
    if (i === 0 || stroke.points.length === 1) {
      const dx = ex - point[0];
      const dy = ey - point[1];
      if (dx * dx + dy * dy < hitDistSq) return true;
    } else {
      const prev = stroke.points[i - 1];
      if (ptSegDistSq(ex, ey, prev[0], prev[1], point[0], point[1]) < hitDistSq) return true;
    }
  }
  return false;
}

export function findStrokeAt(x: number, y: number, radius: number): Stroke | null {
  for (const stroke of getQueryStrokes(x - radius, y - radius, x + radius, y + radius)) {
    if (eraserHitsStroke(x, y, radius, stroke)) return stroke;
  }
  return null;
}

export function clearSelection(): void {
  runtime.selectedStrokeIds.clear();
  runtime.movingSelection = null;
  runtime.movingStrokeIds = null;
  runtime.boxSelection = null;
}

export function setSelectedStroke(stroke: Stroke | null): void {
  runtime.selectedStrokeIds = stroke ? new Set([stroke.id]) : new Set();
}

export function setSelectedStrokeIds(ids: number[]): void {
  runtime.selectedStrokeIds = new Set(ids);
}

export function getSelectionRect(x0: number, y0: number, x1: number, y1: number): NonNullable<Stroke['bbox']> {
  return { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) };
}

export function isBBoxInsideRect(bbox: Stroke['bbox'], rect: NonNullable<Stroke['bbox']>): boolean {
  return !!bbox && bbox.minX >= rect.minX && bbox.maxX <= rect.maxX && bbox.minY >= rect.minY && bbox.maxY <= rect.maxY;
}

export function translateStrokeFromPoints(stroke: Stroke, sourcePoints: PointTuple[], dx: number, dy: number): void {
  for (let i = 0; i < sourcePoints.length; i++) {
    const src = sourcePoints[i];
    const dst = stroke.points[i];
    dst[0] = src[0] + dx;
    dst[1] = src[1] + dy;
    dst[2] = src[2];
  }
  stroke.cacheReady = false;
  computeBBox(stroke);
}

export function createMoveSelection(targets: Stroke[], x: number, y: number): MovingSelection {
  return {
    startX: x,
    startY: y,
    moved: false,
    items: targets.map(stroke => ({ strokeId: stroke.id, origin: clonePoints(stroke.points) })),
  };
}

export function finishMovingSelection(cancelled: boolean): boolean {
  if (!runtime.movingSelection) return false;
  const move = runtime.movingSelection;
  runtime.movingSelection = null;
  state.drawing = false;
  const items = move.items
    .map(item => ({ stroke: runtime.strokeMap.get(item.strokeId), origin: item.origin }))
    .filter((item): item is { stroke: Stroke; origin: PointTuple[] } => !!item.stroke);

  if (!items.length) {
    runtime.movingStrokeIds = null;
    runtime.selectedStrokeIds.clear();
    runtime.committedDirty = true;
    return false;
  }

  if (cancelled) {
    for (const item of items) {
      item.stroke.points = clonePoints(item.origin);
      prepareStroke(item.stroke);
      refreshStrokeInIndex(item.stroke);
    }
    runtime.movingStrokeIds = null;
    runtime.committedDirty = true;
    return false;
  }

  if (!move.moved) {
    runtime.movingStrokeIds = null;
    return false;
  }

  for (const item of items) {
    prepareStroke(item.stroke);
    refreshStrokeInIndex(item.stroke);
  }
  runtime.movingStrokeIds = null;
  runtime.committedDirty = true;
  return true;
}

export function finishBoxSelection(cancelled: boolean): number[] | null {
  if (!runtime.boxSelection) return null;
  const box = runtime.boxSelection;
  runtime.boxSelection = null;
  state.drawing = false;
  if (cancelled) {
    setSelectedStrokeIds(box.previousIds);
    return null;
  }
  if (!box.moved) {
    clearSelection();
    return [];
  }
  const rect = getSelectionRect(box.startX, box.startY, box.currentX, box.currentY);
  const ids: number[] = [];
  for (const stroke of getQueryStrokes(rect.minX, rect.minY, rect.maxX, rect.maxY)) {
    if (isBBoxInsideRect(stroke.bbox, rect)) ids.push(stroke.id);
  }
  setSelectedStrokeIds(ids);
  return ids;
}

export function drawSelectionOutline(targetCtx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (!stroke.bbox) return;
  const pad = 6 / state.zoom;
  const width = stroke.bbox.maxX - stroke.bbox.minX + pad * 2;
  const height = stroke.bbox.maxY - stroke.bbox.minY + pad * 2;
  targetCtx.save();
  targetCtx.strokeStyle = cssVar('--selection-stroke', '#6750A4');
  targetCtx.lineWidth = 1.25 / state.zoom;
  targetCtx.setLineDash([7 / state.zoom, 5 / state.zoom]);
  targetCtx.strokeRect(stroke.bbox.minX - pad, stroke.bbox.minY - pad, width, height);
  targetCtx.restore();
}

export function drawSelectionBox(targetCtx: CanvasRenderingContext2D, box: BoxSelection): void {
  const rect = getSelectionRect(box.startX, box.startY, box.currentX, box.currentY);
  targetCtx.save();
  targetCtx.fillStyle = cssVar('--selection-fill', 'rgba(103,80,164,.10)');
  targetCtx.strokeStyle = cssVar('--selection-stroke', '#6750A4');
  targetCtx.lineWidth = 1.25 / state.zoom;
  targetCtx.setLineDash([6 / state.zoom, 4 / state.zoom]);
  targetCtx.fillRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
  targetCtx.strokeRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
  targetCtx.restore();
}
