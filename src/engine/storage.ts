import { AUTOSAVE_KEY, SAVE_VERSION, t, tf } from '../config';
import { dom, runtime, state } from '../state';
import { rebuildStrokeIndex, clearSelection } from '../model/selection';
import { applyPublicConfig, getPublicConfig, hydrateStroke, renderStroke, serializeProjectData as serializeProjectBase } from '../model/stroke';
import { clearHistory } from './history';
import { getContentBounds, resetView, scheduleRender } from './render';
import { showToast } from '../ui/toast';
import { buildTuning } from '../ui/popups';

let fileInput: HTMLInputElement | null = null;

export function serializeProjectData(includeView: boolean): Record<string, unknown> {
  return serializeProjectBase(
    runtime.strokes,
    {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      zoomLocked: state.zoomLocked,
      pressureMode: state.pressureMode,
      touchDraw: state.touchDraw,
    },
    state.color,
    includeView,
  );
}

export function cancelAutoSave(): void {
  if (runtime.autoSaveTimer !== null) {
    clearTimeout(runtime.autoSaveTimer);
    runtime.autoSaveTimer = null;
  }
  const win = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (runtime.autoSaveIdleId !== null && typeof win.cancelIdleCallback === 'function') {
    win.cancelIdleCallback(runtime.autoSaveIdleId);
    runtime.autoSaveIdleId = null;
  }
}

export function autoSave(): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeProjectData(true)));
  } catch {}
}

export function scheduleAutoSave(): void {
  cancelAutoSave();
  const win = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  const run = () => {
    runtime.autoSaveTimer = null;
    runtime.autoSaveIdleId = null;
    autoSave();
  };
  if (typeof win.requestIdleCallback === 'function') {
    runtime.autoSaveIdleId = win.requestIdleCallback(run, { timeout: 240 });
  } else {
    runtime.autoSaveTimer = window.setTimeout(run, 120);
  }
}

export function autoLoad(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.strokes?.length) return false;
    if (data.config) applyPublicConfig(data.config);
    if (data.view) {
      state.zoom = Number.isFinite(data.view.zoom) ? data.view.zoom : 1;
      state.panX = Number.isFinite(data.view.panX) ? data.view.panX : 0;
      state.panY = Number.isFinite(data.view.panY) ? data.view.panY : 0;
      state.zoomLocked = !!data.view.zoomLocked;
      state.pressureMode = data.view.pressureMode === 'simulated' ? 'simulated' : 'native';
      state.touchDraw = !!data.view.touchDraw;
    }
    if (data.color) state.color = data.color;
    runtime.strokes = data.strokes.map(hydrateStroke);
    runtime.nextStrokeId = runtime.strokes.reduce((max: number, stroke: any) => Math.max(max, stroke.id), 0) + 1;
    rebuildStrokeIndex();
    return true;
  } catch {
    return false;
  }
}

export async function saveProject(): Promise<void> {
  const json = JSON.stringify(serializeProjectData(false));
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: 'inkpage-project.inkpage',
        types: [{ description: 'inkpage Project', accept: { 'application/json': ['.inkpage', '.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      showToast(t('toast.saved'));
    } catch (error: any) {
      if (error?.name !== 'AbortError') showToast(t('toast.saved'));
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'inkpage-project.inkpage';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showToast(t('toast.saved'));
}

function handleFileLoaded(text: string): void {
  try {
    const data = JSON.parse(text);
    runtime.currentStroke = null;
    state.drawing = false;
    runtime.eraserPoints = [];
    runtime.pendingErasure.clear();
    if (data.config) applyPublicConfig(data.config);
    runtime.strokes = (data.strokes || []).map(hydrateStroke);
    clearSelection();
    rebuildStrokeIndex();
    runtime.nextStrokeId = runtime.strokes.reduce((max: number, stroke: any) => Math.max(max, stroke.id), 0) + 1;
    runtime.hasDrawn = runtime.strokes.length > 0;
    dom.hint.classList.toggle('hidden', runtime.hasDrawn);
    clearHistory();
    buildTuning();
    runtime.committedDirty = true;
    scheduleRender();
    scheduleAutoSave();
    showToast(tf('toast.loaded', { n: runtime.strokes.length }));
  } catch (error) {
    showToast(t('toast.load.error'));
    console.error(error);
  }
}

export function ensureFileInput(): void {
  if (fileInput) return;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.inkpage,.json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      handleFileLoaded(String(ev.target?.result || ''));
    };
    reader.readAsText(file);
    fileInput!.value = '';
  });
}

export function loadProject(): void {
  ensureFileInput();
  fileInput!.click();
}

export function exportPNG(): void {
  if (!runtime.strokes.length) return;
  const bounds = getContentBounds();
  const pad = 40;
  const ox = bounds.minX - pad;
  const oy = bounds.minY - pad;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const tc = tmp.getContext('2d')!;
  tc.fillStyle = '#FFF';
  tc.fillRect(0, 0, width, height);
  tc.save();
  tc.translate(-ox, -oy);
  for (const stroke of runtime.strokes) {
    renderStroke(tc, stroke, bounds.minX - pad, bounds.minY - pad, bounds.maxX + pad, bounds.maxY + pad);
  }
  tc.restore();
  tmp.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'inkpage-export.png';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast(t('toast.exported'));
  }, 'image/png');
}
