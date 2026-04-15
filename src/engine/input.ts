import { CONFIG, PEN_POINT_MERGE_DISTANCE, SELECT_HIT_RADIUS, t, tf } from '../config';
import { dom, runtime, state, type Stroke } from '../state';
import {
  clearSelection,
  createMoveSelection,
  eraserHitsStroke,
  findStrokeAt,
  finishBoxSelection,
  finishMovingSelection,
  getQueryStrokes,
  getSelectedStrokes,
  refreshStrokeInIndex,
  removeStrokeFromIndex,
  setSelectedStroke,
  setSelectedStrokeIds,
  syncStrokeOrder,
  translateStrokeFromPoints,
} from '../model/selection';
import { getPublicConfig, prepareStroke } from '../model/stroke';
import { recordHistory, redo, undo } from './history';
import {
  appendCommittedStroke,
  applyZoom,
  getActiveTool,
  scheduleRender,
  screenToDoc,
  showZoomLockBlockedToast,
  showZoomIndicator,
  syncCanvasCursor,
} from './render';
import { scheduleAutoSave } from './storage';
import { closeAllPopups, toggleColorPicker, toggleTuning } from '../ui/popups';
import { showToast } from '../ui/toast';
import { setTool, togglePressureMode, toggleTouchDraw } from '../ui/toolbar';

function cancelStroke(): void {
  if (runtime.movingSelection) {
    finishMovingSelection(true);
    scheduleRender();
    return;
  }
  if (runtime.boxSelection) {
    finishBoxSelection(true);
    scheduleRender();
    return;
  }
  runtime.currentStroke = null;
  state.drawing = false;
  scheduleRender();
}

function commitStroke(stroke: Stroke): void {
  stroke.complete = true;
  prepareStroke(stroke);
  runtime.strokes.push(stroke);
  stroke.order = runtime.strokes.length - 1;
  refreshStrokeInIndex(stroke);
  runtime.currentStroke = null;
  state.drawing = false;
  if (!appendCommittedStroke(stroke)) runtime.committedDirty = true;
  recordHistory({ type: 'add', stroke, index: runtime.strokes.length - 1 });
  scheduleAutoSave();
  scheduleRender();
}

function releaseActivePointer(): void {
  if (runtime.activePointerId !== null) {
    try {
      dom.canvas.releasePointerCapture(runtime.activePointerId);
    } catch {}
    runtime.activePointerId = null;
  }
  if (runtime.isPanning) {
    runtime.isPanning = false;
    dom.canvas.classList.remove('cursor-panning');
  }
  if (state.drawing) cancelStroke();
  runtime.eraserPoints = [];
  runtime.pendingErasure.clear();
  runtime.gestureTool = null;
  syncCanvasCursor();
}

function getDocPos(clientX: number, clientY: number): { x: number; y: number } {
  const rect = dom.canvas.getBoundingClientRect();
  return screenToDoc(clientX - rect.left, clientY - rect.top);
}

function isTemporaryEraserTrigger(e: PointerEvent): boolean {
  return (e.pointerType === 'mouse' || e.pointerType === 'pen') && e.button === 2;
}

function getEffectivePressure(e: PointerEvent): number | null {
  if (state.pressureMode === 'native') {
    if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
    return 0.8;
  }
  return null;
}

export function bindInput(): void {
  dom.canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.zoomLocked) {
      showZoomLockBlockedToast();
      return;
    }
    const rect = dom.canvas.getBoundingClientRect();
    applyZoom(state.zoom * (e.deltaY > 0 ? 0.92 : 1.09), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  dom.canvas.addEventListener('pointerdown', e => {
    if (state.pickerOpen || state.tuningOpen || state.projectOpen) {
      closeAllPopups();
      return;
    }
    if (runtime.activePointerId !== null) return;
    runtime.gestureTool = null;
    const activeTool = isTemporaryEraserTrigger(e) ? 'eraser' : state.tool;

    if (e.button === 1 || runtime.spaceHeld) {
      runtime.isPanning = true;
      runtime.panStartX = e.clientX;
      runtime.panStartY = e.clientY;
      runtime.panStartPanX = state.panX;
      runtime.panStartPanY = state.panY;
      syncCanvasCursor();
      dom.canvas.setPointerCapture(e.pointerId);
      runtime.activePointerId = e.pointerId;
      e.preventDefault();
      return;
    }
    if (e.button !== 0 && !isTemporaryEraserTrigger(e)) return;
    if (e.pointerType === 'touch' && !state.touchDraw && activeTool !== 'select') {
      runtime.isPanning = true;
      runtime.panStartX = e.clientX;
      runtime.panStartY = e.clientY;
      runtime.panStartPanX = state.panX;
      runtime.panStartPanY = state.panY;
      dom.canvas.setPointerCapture(e.pointerId);
      runtime.activePointerId = e.pointerId;
      e.preventDefault();
      return;
    }

    runtime.activePointerId = e.pointerId;
    dom.canvas.setPointerCapture(e.pointerId);
    const pos = getDocPos(e.clientX, e.clientY);

    if (activeTool === 'eraser' && state.tool !== 'eraser') {
      runtime.gestureTool = 'eraser';
      syncCanvasCursor();
    }

    if (activeTool === 'eraser') {
      state.drawing = true;
      runtime.eraserPoints = [{ x: pos.x, y: pos.y }];
      runtime.pendingErasure.clear();
      const er = CONFIG.eraserSize / 2;
      for (const stroke of getQueryStrokes(pos.x - er, pos.y - er, pos.x + er, pos.y + er)) {
        if (eraserHitsStroke(pos.x, pos.y, er, stroke)) runtime.pendingErasure.add(stroke.id);
      }
      scheduleRender();
    } else if (activeTool === 'select') {
      const hit = findStrokeAt(pos.x, pos.y, SELECT_HIT_RADIUS / state.zoom);
      runtime.boxSelection = null;
      if (hit) {
        const targets = runtime.selectedStrokeIds.has(hit.id) ? getSelectedStrokes() : [hit];
        if (!runtime.selectedStrokeIds.has(hit.id)) setSelectedStroke(hit);
        runtime.movingSelection = createMoveSelection(targets, pos.x, pos.y);
        runtime.movingStrokeIds = null;
        state.drawing = true;
      } else {
        runtime.movingSelection = null;
        runtime.movingStrokeIds = null;
        const previousIds = [...runtime.selectedStrokeIds];
        setSelectedStrokeIds([]);
        runtime.boxSelection = {
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
          moved: false,
          previousIds,
        };
        state.drawing = true;
      }
      scheduleRender();
    } else {
      runtime.currentStroke = {
        id: runtime.nextStrokeId++,
        tool: 'ink',
        color: state.color,
        pressureMode: state.pressureMode,
        isPen: e.pointerType === 'pen',
        config: getPublicConfig(),
        points: [[pos.x, pos.y, getEffectivePressure(e)]],
        bbox: null,
        cachedPath: null,
        cachedPointRadius: 0,
        cacheReady: false,
      };
      state.drawing = true;
      if (!runtime.hasDrawn) {
        runtime.hasDrawn = true;
        dom.hint.classList.add('hidden');
      }
      scheduleRender();
    }
    if (isTemporaryEraserTrigger(e)) e.preventDefault();
  });

  dom.canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== runtime.activePointerId) return;
    if (runtime.isPanning) {
      state.panX = runtime.panStartPanX + (e.clientX - runtime.panStartX);
      state.panY = runtime.panStartPanY + (e.clientY - runtime.panStartY);
      runtime.committedDirty = true;
      scheduleRender();
      return;
    }
    if (!state.drawing) return;
    const events = e.getCoalescedEvents && e.getCoalescedEvents().length > 0 ? e.getCoalescedEvents() : [e];

    if (getActiveTool() === 'eraser') {
      const lastEv = events[events.length - 1];
      const pos = getDocPos(lastEv.clientX, lastEv.clientY);
      runtime.eraserPoints.push({ x: pos.x, y: pos.y });
      const er = CONFIG.eraserSize / 2;
      for (const stroke of getQueryStrokes(pos.x - er, pos.y - er, pos.x + er, pos.y + er)) {
        if (!runtime.pendingErasure.has(stroke.id) && eraserHitsStroke(pos.x, pos.y, er, stroke)) {
          runtime.pendingErasure.add(stroke.id);
        }
      }
      scheduleRender();
    } else if (runtime.movingSelection) {
      const lastEv = events[events.length - 1];
      const pos = getDocPos(lastEv.clientX, lastEv.clientY);
      const dx = pos.x - runtime.movingSelection.startX;
      const dy = pos.y - runtime.movingSelection.startY;
      const items = runtime.movingSelection.items
        .map(item => ({ stroke: runtime.strokeMap.get(item.strokeId), origin: item.origin }))
        .filter((item): item is { stroke: Stroke; origin: any } => !!item.stroke);
      if (!items.length) {
        clearSelection();
        state.drawing = false;
        scheduleRender();
        return;
      }
      if (!runtime.movingSelection.moved && (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)) {
        runtime.movingSelection.moved = true;
        runtime.movingStrokeIds = new Set(items.map(item => item.stroke.id));
        runtime.committedDirty = true;
      }
      if (runtime.movingSelection.moved) {
        for (const item of items) translateStrokeFromPoints(item.stroke, item.origin, dx, dy);
        scheduleRender();
      }
    } else if (runtime.boxSelection) {
      const lastEv = events[events.length - 1];
      const pos = getDocPos(lastEv.clientX, lastEv.clientY);
      runtime.boxSelection.currentX = pos.x;
      runtime.boxSelection.currentY = pos.y;
      if (!runtime.boxSelection.moved) {
        const dx = pos.x - runtime.boxSelection.startX;
        const dy = pos.y - runtime.boxSelection.startY;
        runtime.boxSelection.moved = Math.abs(dx) > 4 / state.zoom || Math.abs(dy) > 4 / state.zoom;
      }
      if (runtime.boxSelection.moved) scheduleRender();
    } else if (runtime.currentStroke) {
      for (const ce of events) {
        const pos = getDocPos(ce.clientX, ce.clientY);
        const pressure = getEffectivePressure(ce);
        if (runtime.currentStroke.points.length > 0 && ce.pointerType === 'pen') {
          const last = runtime.currentStroke.points[runtime.currentStroke.points.length - 1];
          const dx = pos.x - last[0];
          const dy = pos.y - last[1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < PEN_POINT_MERGE_DISTANCE / state.zoom) {
            runtime.currentStroke.points[runtime.currentStroke.points.length - 1] = [pos.x, pos.y, pressure];
            scheduleRender();
            continue;
          }
        }
        runtime.currentStroke.points.push([pos.x, pos.y, pressure]);
      }
      scheduleRender();
    }
  });

  dom.canvas.addEventListener('pointerup', e => {
    if (e.pointerId !== runtime.activePointerId) return;
    if (runtime.isPanning) {
      runtime.isPanning = false;
      dom.canvas.classList.remove('cursor-panning');
    }
    if (state.drawing) {
      if (getActiveTool() === 'eraser') {
        if (runtime.pendingErasure.size > 0) {
          const removeSet = new Set(runtime.pendingErasure);
          const removedItems: Array<{ stroke: Stroke; index: number }> = [];
          const nextStrokes: Stroke[] = [];
          for (let i = 0; i < runtime.strokes.length; i++) {
            const stroke = runtime.strokes[i];
            if (removeSet.has(stroke.id)) removedItems.push({ stroke, index: i });
            else nextStrokes.push(stroke);
          }
          runtime.strokes = nextStrokes;
          syncStrokeOrder();
          for (const item of removedItems) removeStrokeFromIndex(item.stroke);
          runtime.selectedStrokeIds = new Set([...runtime.selectedStrokeIds].filter(id => runtime.strokeMap.has(id)));
          runtime.committedDirty = true;
          scheduleRender();
          scheduleAutoSave();
          recordHistory({ type: 'erase', items: removedItems });
          showToast(tf('toast.erased', { n: removeSet.size }));
        }
        state.drawing = false;
        runtime.eraserPoints = [];
        runtime.pendingErasure.clear();
      } else if (runtime.movingSelection) {
        const move = runtime.movingSelection;
        const finished = finishMovingSelection(false);
        if (finished) {
          recordHistory({
            type: 'move',
            items: move.items
              .map(item => ({ stroke: runtime.strokeMap.get(item.strokeId), fromPoints: item.origin }))
              .filter((item): item is { stroke: Stroke; fromPoints: any } => !!item.stroke)
              .map(item => ({
                stroke: item.stroke,
                fromPoints: item.fromPoints,
                toPoints: item.stroke.points.map(point => [point[0], point[1], point[2]] as [number, number, number | null]),
              })),
          });
          scheduleAutoSave();
          scheduleRender();
        } else {
          scheduleRender();
        }
      } else if (runtime.boxSelection) {
        finishBoxSelection(false);
        scheduleRender();
      } else if (runtime.currentStroke) {
        commitStroke(runtime.currentStroke);
      }
    }
    runtime.activePointerId = null;
    runtime.gestureTool = null;
    syncCanvasCursor();
  });

  dom.canvas.addEventListener('pointercancel', e => {
    if (e.pointerId !== runtime.activePointerId) return;
    if (runtime.isPanning) {
      runtime.isPanning = false;
      dom.canvas.classList.remove('cursor-panning');
    }
    cancelStroke();
    runtime.eraserPoints = [];
    runtime.pendingErasure.clear();
    runtime.activePointerId = null;
    runtime.gestureTool = null;
    syncCanvasCursor();
  });

  dom.canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      releaseActivePointer();
      runtime.pinching = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      runtime.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      runtime.lastPinchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
    closeAllPopups();
  }, { passive: false });

  dom.canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2 && runtime.pinching) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (runtime.lastPinchDist > 0 && !state.zoomLocked) {
        const rect = dom.canvas.getBoundingClientRect();
        const sx = cx - rect.left;
        const sy = cy - rect.top;
        const wx = (sx - state.panX) / state.zoom;
        const wy = (sy - state.panY) / state.zoom;
        const nz = Math.max(CONFIG.minZoom, Math.min(state.zoom * (dist / runtime.lastPinchDist), CONFIG.maxZoom));
        state.panX = sx - wx * nz;
        state.panY = sy - wy * nz;
        state.zoom = nz;
        runtime.committedDirty = true;
        showZoomIndicator();
      } else if (runtime.lastPinchDist > 0 && Math.abs(dist - runtime.lastPinchDist) > 2) {
        showZoomLockBlockedToast();
      }
      state.panX += cx - runtime.lastPinchCenter.x;
      state.panY += cy - runtime.lastPinchCenter.y;
      runtime.lastPinchCenter = { x: cx, y: cy };
      runtime.lastPinchDist = dist;
      scheduleRender();
    }
  }, { passive: false });

  dom.canvas.addEventListener('touchend', e => {
    if (e.touches.length < 2) {
      runtime.pinching = false;
      runtime.lastPinchDist = 0;
    }
  });
  dom.canvas.addEventListener('touchcancel', () => {
    runtime.pinching = false;
    runtime.lastPinchDist = 0;
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      runtime.spaceHeld = true;
      if (!state.drawing) dom.canvas.classList.add('cursor-pan');
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyY') {
      e.preventDefault();
      redo();
    }
    if (e.code === 'KeyP' || e.code === 'KeyB') setTool('ink');
    if (e.code === 'KeyV') setTool('select');
    if (e.code === 'KeyE') setTool('eraser');
    if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) toggleColorPicker();
    if (e.code === 'KeyT') toggleTouchDraw();
    if (e.code === 'KeyG') togglePressureMode();
    if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) toggleTuning();
    if (e.code === 'Escape') closeAllPopups();
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      runtime.spaceHeld = false;
      dom.canvas.classList.remove('cursor-pan');
    }
  });

  dom.canvas.addEventListener('contextmenu', e => e.preventDefault());
}
