import { t } from '../config';
import { dom, runtime, state } from '../state';
import { clearSelection } from '../model/selection';
import { clearHistory, redo, undo, updateHistoryButtons } from '../engine/history';
import { scheduleRender, resetView, syncCanvasCursor } from '../engine/render';
import { cancelAutoSave } from '../engine/storage';
import { showToast } from './toast';
import {
  closeColorPicker,
  closeProjectMenu,
  closeTuning,
  getPopupAnchor,
  openProjectMenu,
  positionPopup,
  setCloseMoreMenuHook,
  toggleColorPicker,
  toggleProjectMenu,
  toggleTuning,
} from './popups';
import { setToolbarHidden } from '../utils/dom';

const OVERFLOW_PRIORITY = [dom.tuningBtn, dom.projectBtn, dom.resetBtn, dom.redoBtn, dom.undoBtn, dom.zoomLockBtn, dom.pressureBtn, dom.touchBtn];

const OVERFLOW_ITEMS = [
  { button: dom.touchBtn, icon: 'touch_app', label: 'tool.touch', action: toggleTouchDraw, isActive: () => state.touchDraw },
  { button: dom.pressureBtn, icon: 'gesture', label: 'tool.pressure', action: togglePressureMode, isActive: () => state.pressureMode === 'simulated' },
  { button: dom.zoomLockBtn, icon: 'center_focus_strong', label: 'tool.zoomLock', action: toggleZoomLock, isActive: () => state.zoomLocked },
  { button: dom.undoBtn, icon: 'undo', label: 'tool.undo', action: undo, isDisabled: () => runtime.undoStack.length === 0 },
  { button: dom.redoBtn, icon: 'redo', label: 'tool.redo', action: redo, isDisabled: () => runtime.redoStack.length === 0 },
  { button: dom.resetBtn, icon: 'delete_sweep', label: 'tool.reset', action: resetCanvas },
  { button: dom.projectBtn, icon: 'folder', label: 'tool.project', action: toggleProjectMenu },
  { button: dom.tuningBtn, icon: 'tune', label: 'tool.tuning', action: toggleTuning },
];

export function syncTouchDrawHint(): void {
  dom.touchBtn.classList.toggle('touch-ignored', state.tool === 'select');
}

function isToolbarLandscape(): boolean {
  return matchMedia('(orientation:landscape)').matches;
}

function isToolbarOverflowing(): boolean {
  const toolbar = document.getElementById('toolbar')!;
  return isToolbarLandscape() ? toolbar.scrollHeight > toolbar.clientHeight : toolbar.scrollWidth > toolbar.clientWidth;
}

function refreshToolbarDividers(): void {
  const group2Visible = !dom.touchBtn.classList.contains('toolbar-hidden') || !dom.pressureBtn.classList.contains('toolbar-hidden') || !dom.zoomLockBtn.classList.contains('toolbar-hidden');
  const group3Visible = !dom.undoBtn.classList.contains('toolbar-hidden') || !dom.redoBtn.classList.contains('toolbar-hidden') || !dom.resetBtn.classList.contains('toolbar-hidden') || !dom.projectBtn.classList.contains('toolbar-hidden');
  const moreVisible = !dom.moreBtn.classList.contains('toolbar-hidden');
  setToolbarHidden(dom.dividerA, false);
  setToolbarHidden(dom.dividerB, !(group2Visible || group3Visible || moreVisible));
  setToolbarHidden(dom.dividerC, !(group2Visible && (group3Visible || moreVisible)));
}

export function buildMoreMenu(): number {
  dom.moreMenu.innerHTML = '';
  let count = 0;
  for (const item of OVERFLOW_ITEMS) {
    if (!item.button.classList.contains('toolbar-hidden')) continue;
    const btn = document.createElement('button');
    btn.className = 'file-menu-item';
    if (item.isActive?.()) btn.classList.add('active');
    if (item.button === dom.touchBtn && state.tool === 'select') btn.classList.add('subtle');
    btn.disabled = !!item.isDisabled?.();
    btn.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span>${t(item.label)}`;
    btn.addEventListener('click', () => {
      closeMoreMenu();
      item.action();
    });
    dom.moreMenu.appendChild(btn);
    count++;
  }
  return count;
}

export function updateToolbarOverflow(): void {
  for (const btn of OVERFLOW_PRIORITY) setToolbarHidden(btn, false);
  setToolbarHidden(dom.moreBtn, true);
  refreshToolbarDividers();
  if (isToolbarOverflowing()) {
    setToolbarHidden(dom.moreBtn, false);
    for (const btn of OVERFLOW_PRIORITY) {
      if (!isToolbarOverflowing()) break;
      setToolbarHidden(btn, true);
      refreshToolbarDividers();
    }
  }
  const hasOverflow = buildMoreMenu() > 0;
  setToolbarHidden(dom.moreBtn, !hasOverflow);
  if (!hasOverflow && state.moreOpen) closeMoreMenu();
  refreshToolbarDividers();
}

export function closeMoreMenu(): void {
  state.moreOpen = false;
  dom.moreOverlay.classList.remove('show');
  dom.moreMenu.classList.remove('show');
}

export function openMoreMenu(): void {
  closeColorPicker();
  closeTuning();
  closeProjectMenu();
  updateToolbarOverflow();
  state.moreOpen = true;
  dom.moreOverlay.classList.add('show');
  dom.moreMenu.classList.add('show');
  requestAnimationFrame(() => positionPopup(dom.moreMenu, dom.moreBtn));
}

export function toggleMoreMenu(): void {
  if (state.moreOpen) closeMoreMenu();
  else openMoreMenu();
}

export function setTool(tool: 'ink' | 'eraser' | 'select'): void {
  if (state.tool !== tool && tool !== 'select') clearSelection();
  state.tool = tool;
  dom.inkBtn.classList.toggle('active', tool === 'ink');
  dom.eraserBtn.classList.toggle('active', tool === 'eraser');
  dom.selectBtn.classList.toggle('active', tool === 'select');
  syncTouchDrawHint();
  if (state.moreOpen) buildMoreMenu();
  scheduleRender();
  syncCanvasCursor();
}

export function toggleTouchDraw(): void {
  state.touchDraw = !state.touchDraw;
  dom.touchBtn.classList.toggle('active', state.touchDraw);
  if (state.moreOpen) buildMoreMenu();
  showToast(state.touchDraw ? t('touch.on') : t('touch.off'));
}

export function togglePressureMode(): void {
  state.pressureMode = state.pressureMode === 'simulated' ? 'native' : 'simulated';
  dom.pressureBtn.classList.toggle('active', state.pressureMode === 'simulated');
  if (state.moreOpen) buildMoreMenu();
  showToast(state.pressureMode === 'simulated' ? t('pressure.on') : t('pressure.off'));
}

export function toggleZoomLock(): void {
  state.zoomLocked = !state.zoomLocked;
  dom.zoomLockBtn.classList.toggle('active', state.zoomLocked);
  if (state.zoomLocked) {
    const fx = dom.container.clientWidth / 2;
    const fy = dom.container.clientHeight / 2;
    const wx = (fx - state.panX) / state.zoom;
    const wy = (fy - state.panY) / state.zoom;
    state.zoom = 1;
    state.panX = fx - wx;
    state.panY = fy - wy;
    runtime.committedDirty = true;
    scheduleRender();
    dom.zoomInd.textContent = '100%';
    dom.zoomInd.classList.add('show');
    if (runtime.zoomFadeTimer !== null) clearTimeout(runtime.zoomFadeTimer);
    runtime.zoomFadeTimer = window.setTimeout(() => dom.zoomInd.classList.remove('show'), 1200);
  }
  if (state.moreOpen) buildMoreMenu();
  showToast(state.zoomLocked ? t('toast.zoomLock.on') : t('toast.zoomLock.off'));
}

export function resetCanvas(): void {
  if (runtime.strokes.length > 0 && !confirm(t('confirm.reset'))) return;
  runtime.strokes = [];
  runtime.nextStrokeId = 1;
  runtime.currentStroke = null;
  state.drawing = false;
  clearSelection();
  runtime.strokeMap = new Map();
  runtime.strokeIndex = new Map();
  runtime.hasDrawn = false;
  dom.hint.classList.remove('hidden');
  clearHistory();
  cancelAutoSave();
  try {
    localStorage.removeItem('inkpage_autosave');
  } catch {}
  resetView();
  showToast(t('toast.cleared'));
}

function createRipple(btn: HTMLButtonElement): void {
  btn.classList.remove('ripple-active', 'ripple-fade');
  void btn.offsetWidth;
  btn.classList.add('ripple-active');
  window.setTimeout(() => {
    btn.classList.remove('ripple-active');
    btn.classList.add('ripple-fade');
  }, 80);
  window.setTimeout(() => btn.classList.remove('ripple-fade'), 450);
}

export function initToolbar(): void {
  setCloseMoreMenuHook(closeMoreMenu);
  dom.inkBtn.addEventListener('click', () => {
    createRipple(dom.inkBtn);
    setTool('ink');
  });
  dom.eraserBtn.addEventListener('click', () => {
    createRipple(dom.eraserBtn);
    setTool('eraser');
  });
  dom.selectBtn.addEventListener('click', () => {
    createRipple(dom.selectBtn);
    setTool('select');
  });
  dom.colorBtn.addEventListener('click', () => {
    createRipple(dom.colorBtn);
    toggleColorPicker();
  });
  dom.touchBtn.addEventListener('click', () => {
    createRipple(dom.touchBtn);
    toggleTouchDraw();
  });
  dom.pressureBtn.addEventListener('click', () => {
    createRipple(dom.pressureBtn);
    togglePressureMode();
  });
  dom.zoomLockBtn.addEventListener('click', () => {
    createRipple(dom.zoomLockBtn);
    toggleZoomLock();
  });
  dom.undoBtn.addEventListener('click', () => {
    createRipple(dom.undoBtn);
    undo();
  });
  dom.redoBtn.addEventListener('click', () => {
    createRipple(dom.redoBtn);
    redo();
  });
  dom.resetBtn.addEventListener('click', () => {
    createRipple(dom.resetBtn);
    resetCanvas();
  });
  dom.projectBtn.addEventListener('click', () => {
    createRipple(dom.projectBtn);
    toggleProjectMenu();
  });
  dom.tuningBtn.addEventListener('click', () => {
    createRipple(dom.tuningBtn);
    toggleTuning();
  });
  dom.moreBtn.addEventListener('click', () => {
    createRipple(dom.moreBtn);
    toggleMoreMenu();
  });
  dom.moreOverlay.addEventListener('click', closeMoreMenu);
  dom.inkBtn.title = t('tool.ink');
  dom.eraserBtn.title = t('tool.eraser');
  dom.selectBtn.title = t('tool.select');
  dom.colorBtn.title = t('tool.color');
  dom.touchBtn.title = t('tool.touch');
  dom.pressureBtn.title = t('tool.pressure');
  dom.undoBtn.title = t('tool.undo');
  dom.redoBtn.title = t('tool.redo');
  dom.moreBtn.title = t('tool.more');
  dom.zoomLockBtn.title = t('tool.zoomLock');
  dom.resetBtn.title = t('tool.reset');
  dom.projectBtn.title = t('tool.project');
  dom.tuningBtn.title = t('tool.tuning');
  dom.hint.textContent = t('hint');
  syncTouchDrawHint();
  updateHistoryButtons();
}
