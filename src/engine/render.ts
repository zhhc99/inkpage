import { CONFIG, PI, SELECT_HIT_RADIUS, t } from '../config';
import { dom, ctx, runtime, state, type Stroke } from '../state';
import { drawSelectionBox, drawSelectionOutline, getSelectedStrokes } from '../model/selection';
import { getStrokeSize, renderStroke } from '../model/stroke';
import { showToast } from '../ui/toast';

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function getContentBounds(): NonNullable<Stroke['bbox']> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of runtime.strokes) {
    if (!stroke.bbox) continue;
    if (stroke.bbox.minX < minX) minX = stroke.bbox.minX;
    if (stroke.bbox.minY < minY) minY = stroke.bbox.minY;
    if (stroke.bbox.maxX > maxX) maxX = stroke.bbox.maxX;
    if (stroke.bbox.maxY > maxY) maxY = stroke.bbox.maxY;
  }
  return { minX, minY, maxX, maxY };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function screenToDoc(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
}

export function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  dom.canvas.width = dom.container.clientWidth * dpr;
  dom.canvas.height = dom.container.clientHeight * dpr;
  runtime.committedDirty = true;
  scheduleRender();
}

export function resetView(): void {
  state.zoom = 1;
  if (runtime.strokes.length > 0) {
    const bounds = getContentBounds();
    const cw = dom.container.clientWidth;
    const ch = dom.container.clientHeight;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    state.panX = (cw - contentW) / 2 - bounds.minX;
    state.panY = (ch - contentH) / 2 - bounds.minY;
  } else {
    state.panX = dom.container.clientWidth / 2;
    state.panY = dom.container.clientHeight / 2;
  }
  runtime.committedDirty = true;
  scheduleRender();
}

export function getActiveTool(): string {
  return runtime.gestureTool || state.tool;
}

export function syncCanvasCursor(): void {
  if (runtime.isPanning) {
    dom.canvas.className = 'cursor-panning';
    return;
  }
  if (runtime.movingSelection) {
    dom.canvas.className = 'cursor-moving';
    return;
  }
  const tool = getActiveTool();
  if (tool === 'eraser') dom.canvas.className = 'cursor-eraser';
  else if (tool === 'select') dom.canvas.className = 'cursor-select';
  else dom.canvas.className = 'cursor-ink';
}

export function createGridPattern(): void {
  const pc = document.createElement('canvas');
  pc.width = 24;
  pc.height = 24;
  const pctx = pc.getContext('2d');
  if (!pctx) return;
  pctx.fillStyle = cssVar('--grid-dot', 'rgba(0,0,0,.06)');
  pctx.beginPath();
  pctx.arc(12, 12, 0.9, 0, PI * 2);
  pctx.fill();
  runtime.gridPattern = ctx.createPattern(pc, 'repeat');
}

export function drawGrid(targetCtx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!runtime.gridPattern || state.zoom < 0.25) return;
  const gs = 24 * state.zoom;
  if (gs < 5) return;
  const offX = ((state.panX % gs) + gs) % gs;
  const offY = ((state.panY % gs) + gs) % gs;
  const matrix = new DOMMatrix();
  matrix.translateSelf(offX, offY);
  matrix.scaleSelf(state.zoom, state.zoom);
  try {
    runtime.gridPattern.setTransform(matrix);
  } catch {
    return;
  }
  targetCtx.fillStyle = runtime.gridPattern;
  targetCtx.fillRect(0, 0, w, h);
}

export function showZoomIndicator(): void {
  dom.zoomInd.textContent = `${Math.round(state.zoom * 100)}%`;
  dom.zoomInd.classList.add('show');
  if (runtime.zoomFadeTimer !== null) clearTimeout(runtime.zoomFadeTimer);
  runtime.zoomFadeTimer = window.setTimeout(() => dom.zoomInd.classList.remove('show'), 1200);
}

export function showZoomLockBlockedToast(): void {
  const now = Date.now();
  if (now - runtime.zoomLockToastAt < 700) return;
  runtime.zoomLockToastAt = now;
  showToast(t('toast.zoomLock.blocked'));
}

export function applyZoom(nz: number, fx: number, fy: number): void {
  const wx = (fx - state.panX) / state.zoom;
  const wy = (fy - state.panY) / state.zoom;
  state.zoom = clamp(nz, CONFIG.minZoom, CONFIG.maxZoom);
  state.panX = fx - wx * state.zoom;
  state.panY = fy - wy * state.zoom;
  runtime.committedDirty = true;
  showZoomIndicator();
  scheduleRender();
}

function ensureCommittedCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const cw = dom.container.clientWidth * dpr;
  const ch = dom.container.clientHeight * dpr;
  if (!runtime.committedCanvas || runtime.committedCanvas.width !== cw || runtime.committedCanvas.height !== ch) {
    runtime.committedCanvas = document.createElement('canvas');
    runtime.committedCanvas.width = cw;
    runtime.committedCanvas.height = ch;
    runtime.committedDirty = true;
  }
}

export function getViewportBounds(cw: number, ch: number): { vx0: number; vy0: number; vx1: number; vy1: number } {
  return {
    vx0: -state.panX / state.zoom,
    vy0: -state.panY / state.zoom,
    vx1: (cw - state.panX) / state.zoom,
    vy1: (ch - state.panY) / state.zoom,
  };
}

function rememberCommittedView(): void {
  runtime.lastRenderZoom = state.zoom;
  runtime.lastRenderPanX = state.panX;
  runtime.lastRenderPanY = state.panY;
}

export function appendCommittedStroke(stroke: Stroke): boolean {
  if (runtime.committedDirty || !runtime.committedCanvas) return false;
  if (
    runtime.lastRenderZoom !== state.zoom ||
    runtime.lastRenderPanX !== state.panX ||
    runtime.lastRenderPanY !== state.panY
  ) {
    return false;
  }
  ensureCommittedCanvas();
  const cctx = runtime.committedCanvas!.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const cw = runtime.committedCanvas!.width / dpr;
  const ch = runtime.committedCanvas!.height / dpr;
  const { vx0, vy0, vx1, vy1 } = getViewportBounds(cw, ch);
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.save();
  cctx.translate(state.panX, state.panY);
  cctx.scale(state.zoom, state.zoom);
  renderStroke(cctx, stroke, vx0, vy0, vx1, vy1);
  cctx.restore();
  rememberCommittedView();
  return true;
}

export function rebuildCommitted(): void {
  ensureCommittedCanvas();
  const cctx = runtime.committedCanvas!.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const cw = runtime.committedCanvas!.width / dpr;
  const ch = runtime.committedCanvas!.height / dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, cw, ch);
  const { vx0, vy0, vx1, vy1 } = getViewportBounds(cw, ch);
  cctx.save();
  cctx.translate(state.panX, state.panY);
  cctx.scale(state.zoom, state.zoom);
  for (const stroke of runtime.strokes) {
    if (runtime.movingStrokeIds && runtime.movingStrokeIds.has(stroke.id)) continue;
    renderStroke(cctx, stroke, vx0, vy0, vx1, vy1);
  }
  cctx.restore();
  runtime.committedDirty = false;
  rememberCommittedView();
}

export function render(): void {
  const dpr = window.devicePixelRatio || 1;
  const cw = dom.canvas.width / dpr;
  const ch = dom.canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = cssVar('--canvas-bg', '#FFF');
  ctx.fillRect(0, 0, cw, ch);
  drawGrid(ctx, cw, ch);

  if (
    runtime.committedDirty ||
    runtime.lastRenderZoom !== state.zoom ||
    runtime.lastRenderPanX !== state.panX ||
    runtime.lastRenderPanY !== state.panY
  ) {
    rebuildCommitted();
  }

  if (runtime.committedCanvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(runtime.committedCanvas, 0, 0);
    ctx.restore();
  }

  if (state.drawing && runtime.currentStroke) {
    const { vx0, vy0, vx1, vy1 } = getViewportBounds(cw, ch);
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    renderStroke(ctx, runtime.currentStroke, vx0, vy0, vx1, vy1);
    ctx.restore();
  }

  if (runtime.movingStrokeIds?.size) {
    const { vx0, vy0, vx1, vy1 } = getViewportBounds(cw, ch);
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    for (const id of runtime.movingStrokeIds) {
      const stroke = runtime.strokeMap.get(id);
      if (stroke) renderStroke(ctx, stroke, vx0, vy0, vx1, vy1, true);
    }
    ctx.restore();
  }

  if (getActiveTool() === 'eraser' && state.drawing && runtime.pendingErasure.size > 0) {
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.strokeStyle = cssVar('--canvas-overlay-strong', 'rgba(255,255,255,.55)');
    ctx.fillStyle = cssVar('--canvas-overlay-strong', 'rgba(255,255,255,.55)');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const id of runtime.pendingErasure) {
      const stroke = runtime.strokeMap.get(id);
      if (!stroke?.points.length) continue;
      const width = getStrokeSize(stroke.config);
      ctx.lineWidth = width;
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0][0], stroke.points[0][1], width / 2, 0, PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
        for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (getActiveTool() === 'eraser' && state.drawing && runtime.eraserPoints.length > 0) {
    const point = runtime.eraserPoints[runtime.eraserPoints.length - 1];
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.strokeStyle = cssVar('--canvas-overlay-muted', 'rgba(0,0,0,.25)');
    ctx.lineWidth = 1.5 / state.zoom;
    ctx.beginPath();
    ctx.arc(point.x, point.y, CONFIG.eraserSize / 2, 0, PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const selectedStrokes = getSelectedStrokes();
  if (selectedStrokes.length || runtime.boxSelection) {
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    for (const stroke of selectedStrokes) drawSelectionOutline(ctx, stroke);
    if (runtime.boxSelection) drawSelectionBox(ctx, runtime.boxSelection);
    ctx.restore();
  }

  runtime.renderRequested = false;
}

export function scheduleRender(): void {
  if (!runtime.renderRequested) {
    runtime.renderRequested = true;
    requestAnimationFrame(render);
  }
}
