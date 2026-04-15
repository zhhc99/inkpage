import { HISTORY_LIMIT, t } from '../config';
import { dom, runtime, state, type HistoryEntry, type Stroke } from '../state';
import { rebuildStrokeIndex } from '../model/selection';
import { clonePoints, prepareStroke } from '../model/stroke';
import { scheduleAutoSave } from './storage';
import { scheduleRender } from './render';

export function updateHistoryButtons(): void {
  dom.undoBtn.disabled = runtime.undoStack.length === 0;
  dom.redoBtn.disabled = runtime.redoStack.length === 0;
}

export function clearHistory(): void {
  runtime.undoStack = [];
  runtime.redoStack = [];
  updateHistoryButtons();
}

export function recordHistory(entry: HistoryEntry): void {
  runtime.undoStack.push(entry);
  if (runtime.undoStack.length > HISTORY_LIMIT) runtime.undoStack.shift();
  runtime.redoStack = [];
  updateHistoryButtons();
}

export function insertStrokeAt(index: number, stroke: Stroke): void {
  const at = Math.max(0, Math.min(index, runtime.strokes.length));
  runtime.strokes.splice(at, 0, stroke);
}

export function applyHistoryEntry(entry: HistoryEntry | undefined, reverse: boolean): void {
  if (!entry) return;
  if (entry.type === 'add') {
    if (reverse) {
      runtime.strokes = runtime.strokes.filter(stroke => stroke.id !== entry.stroke.id);
    } else if (!runtime.strokes.some(stroke => stroke.id === entry.stroke.id)) {
      insertStrokeAt(entry.index, entry.stroke);
    }
  } else if (entry.type === 'erase') {
    if (reverse) {
      const items = entry.items.slice().sort((a, b) => a.index - b.index);
      for (const item of items) {
        if (!runtime.strokes.some(stroke => stroke.id === item.stroke.id)) insertStrokeAt(item.index, item.stroke);
      }
    } else {
      const ids = new Set(entry.items.map(item => item.stroke.id));
      runtime.strokes = runtime.strokes.filter(stroke => !ids.has(stroke.id));
    }
  } else {
    for (const item of entry.items) {
      item.stroke.points = clonePoints(reverse ? item.fromPoints : item.toPoints);
      prepareStroke(item.stroke);
    }
  }

  runtime.currentStroke = null;
  state.drawing = false;
  runtime.eraserPoints = [];
  runtime.pendingErasure.clear();
  runtime.movingSelection = null;
  runtime.movingStrokeIds = null;
  runtime.boxSelection = null;
  rebuildStrokeIndex();
  runtime.selectedStrokeIds = new Set([...runtime.selectedStrokeIds].filter(id => runtime.strokeMap.has(id)));
  runtime.committedDirty = true;
  runtime.hasDrawn = runtime.strokes.length > 0;
  dom.hint.classList.toggle('hidden', runtime.hasDrawn);
  scheduleAutoSave();
  scheduleRender();
}

export function undo(): void {
  if (!runtime.undoStack.length) return;
  const entry = runtime.undoStack.pop()!;
  runtime.redoStack.push(entry);
  applyHistoryEntry(entry, true);
  updateHistoryButtons();
}

export function redo(): void {
  if (!runtime.redoStack.length) return;
  const entry = runtime.redoStack.pop()!;
  runtime.undoStack.push(entry);
  applyHistoryEntry(entry, false);
  updateHistoryButtons();
}
