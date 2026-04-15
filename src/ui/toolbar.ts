import { t } from '../config';
import { dom, runtime, state } from '../state';
import { clearSelection } from '../model/selection';
import { clearHistory, redo, undo, updateHistoryButtons } from '../engine/history';
import { scheduleRender, resetView, syncCanvasCursor } from '../engine/render';
import { cancelAutoSave, saveEditorState, scheduleAutoSave } from '../engine/storage';
import { showToast } from './toast';
import {
  closeColorPicker,
  closeSettings,
  positionPopup,
  setCloseMoreMenuHook,
  toggleColorPicker,
  toggleSettings,
} from './popups';
import { setToolbarHidden } from '../utils/dom';

const OVERFLOW_PRIORITY = [dom.resetBtn, dom.redoBtn, dom.undoBtn, dom.fullscreenBtn, dom.zoomLockBtn, dom.pressureBtn, dom.touchBtn];

const OVERFLOW_ITEMS = [
  { button: dom.touchBtn, icon: 'touch_app', label: 'tool.touch', action: toggleTouchDraw, isActive: () => state.touchDraw },
  { button: dom.pressureBtn, icon: 'gesture', label: 'tool.pressure', action: togglePressureMode, isActive: () => state.pressureMode === 'simulated' },
  { button: dom.zoomLockBtn, icon: 'center_focus_strong', label: 'tool.zoomLock', action: toggleZoomLock, isActive: () => state.zoomLocked },
  { button: dom.fullscreenBtn, icon: 'fullscreen', label: 'tool.fullscreen', action: toggleFullscreen, isActive: () => !!document.fullscreenElement, isAvailable: isFullscreenSupported },
  { button: dom.undoBtn, icon: 'undo', label: 'tool.undo', action: undo, isDisabled: () => runtime.undoStack.length === 0 },
  { button: dom.redoBtn, icon: 'redo', label: 'tool.redo', action: redo, isDisabled: () => runtime.redoStack.length === 0 },
  { button: dom.resetBtn, icon: 'note_add', label: 'tool.reset', action: resetCanvas },
];

function setPressedState(btn: HTMLButtonElement, active: boolean): void {
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', String(active));
}

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
  const group2Visible = !dom.touchBtn.classList.contains('toolbar-hidden') || !dom.pressureBtn.classList.contains('toolbar-hidden') || !dom.zoomLockBtn.classList.contains('toolbar-hidden') || !dom.fullscreenBtn.classList.contains('toolbar-hidden');
  const group3Visible = !dom.undoBtn.classList.contains('toolbar-hidden') || !dom.redoBtn.classList.contains('toolbar-hidden') || !dom.resetBtn.classList.contains('toolbar-hidden');
  const moreVisible = !dom.moreBtn.classList.contains('toolbar-hidden');
  const settingsVisible = !dom.settingsBtn.classList.contains('toolbar-hidden');
  setToolbarHidden(dom.dividerA, false);
  setToolbarHidden(dom.dividerB, !(group2Visible || group3Visible || settingsVisible || moreVisible));
  setToolbarHidden(dom.dividerC, !(group2Visible && (group3Visible || settingsVisible || moreVisible)));
  setToolbarHidden(dom.dividerD, !(settingsVisible && (group3Visible || moreVisible)));
}

export function buildMoreMenu(): number {
  dom.moreMenu.innerHTML = '';
  let count = 0;
  for (const item of OVERFLOW_ITEMS) {
    if (item.isAvailable && !item.isAvailable()) continue;
    if (!item.button.classList.contains('toolbar-hidden')) continue;
    const btn = document.createElement('button');
    btn.className = 'file-menu-item';
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
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
  if (!isFullscreenSupported()) setToolbarHidden(dom.fullscreenBtn, true);
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
  dom.moreBtn.setAttribute('aria-expanded', 'false');
}

export function openMoreMenu(): void {
  closeColorPicker();
  closeSettings();
  updateToolbarOverflow();
  state.moreOpen = true;
  dom.moreOverlay.classList.add('show');
  dom.moreMenu.classList.add('show');
  dom.moreBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => positionPopup(dom.moreMenu, dom.moreBtn));
}

export function toggleMoreMenu(): void {
  if (state.moreOpen) closeMoreMenu();
  else openMoreMenu();
}

export function setTool(tool: 'ink' | 'eraser' | 'select'): void {
  if (state.tool !== tool && tool !== 'select') clearSelection();
  state.tool = tool;
  setPressedState(dom.inkBtn, tool === 'ink');
  setPressedState(dom.eraserBtn, tool === 'eraser');
  setPressedState(dom.selectBtn, tool === 'select');
  syncTouchDrawHint();
  if (state.moreOpen) buildMoreMenu();
  scheduleRender();
  syncCanvasCursor();
}

export function toggleTouchDraw(): void {
  state.touchDraw = !state.touchDraw;
  setPressedState(dom.touchBtn, state.touchDraw);
  if (state.moreOpen) buildMoreMenu();
  saveEditorState();
  scheduleAutoSave();
  showToast(state.touchDraw ? t('touch.on') : t('touch.off'));
}

export function togglePressureMode(): void {
  state.pressureMode = state.pressureMode === 'simulated' ? 'native' : 'simulated';
  setPressedState(dom.pressureBtn, state.pressureMode === 'simulated');
  if (state.moreOpen) buildMoreMenu();
  saveEditorState();
  scheduleAutoSave();
  showToast(state.pressureMode === 'simulated' ? t('pressure.on') : t('pressure.off'));
}

export function toggleZoomLock(): void {
  state.zoomLocked = !state.zoomLocked;
  setPressedState(dom.zoomLockBtn, state.zoomLocked);
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
  saveEditorState();
  scheduleAutoSave();
  showToast(state.zoomLocked ? t('toast.zoomLock.on') : t('toast.zoomLock.off'));
}

function isFullscreenSupported(): boolean {
  return typeof document.fullscreenEnabled === 'boolean' ? document.fullscreenEnabled : 'requestFullscreen' in document.documentElement;
}

function syncFullscreenButton(): void {
  const active = !!document.fullscreenElement;
  setPressedState(dom.fullscreenBtn, active);
  const icon = dom.fullscreenBtn.querySelector('.material-symbols-rounded');
  if (icon) icon.textContent = active ? 'fullscreen_exit' : 'fullscreen';
}

export async function toggleFullscreen(): Promise<void> {
  if (!isFullscreenSupported()) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {}
}

export function syncToolbarState(): void {
  setPressedState(dom.touchBtn, state.touchDraw);
  setPressedState(dom.pressureBtn, state.pressureMode === 'simulated');
  setPressedState(dom.zoomLockBtn, state.zoomLocked);
  syncFullscreenButton();
  syncTouchDrawHint();
  updateHistoryButtons();
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
  dom.fullscreenBtn.addEventListener('click', () => {
    createRipple(dom.fullscreenBtn);
    void toggleFullscreen();
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
  dom.settingsBtn.addEventListener('click', () => {
    createRipple(dom.settingsBtn);
    toggleSettings();
  });
  dom.moreBtn.addEventListener('click', () => {
    createRipple(dom.moreBtn);
    toggleMoreMenu();
  });
  dom.moreOverlay.addEventListener('click', closeMoreMenu);
  document.addEventListener('fullscreenchange', () => {
    syncFullscreenButton();
    if (state.moreOpen) buildMoreMenu();
    showToast(document.fullscreenElement ? t('toast.fullscreen.on') : t('toast.fullscreen.off'));
  });
  dom.inkBtn.title = t('tool.ink');
  dom.eraserBtn.title = t('tool.eraser');
  dom.selectBtn.title = t('tool.select');
  dom.colorBtn.title = t('tool.color');
  dom.touchBtn.title = t('tool.touch');
  dom.pressureBtn.title = t('tool.pressure');
  dom.fullscreenBtn.title = t('tool.fullscreen');
  dom.undoBtn.title = t('tool.undo');
  dom.redoBtn.title = t('tool.redo');
  dom.moreBtn.title = t('tool.more');
  dom.zoomLockBtn.title = t('tool.zoomLock');
  dom.resetBtn.title = t('tool.reset');
  dom.settingsBtn.title = t('tool.settings');
  dom.inkBtn.setAttribute('aria-label', t('tool.ink'));
  dom.eraserBtn.setAttribute('aria-label', t('tool.eraser'));
  dom.selectBtn.setAttribute('aria-label', t('tool.select'));
  dom.colorBtn.setAttribute('aria-label', t('tool.color'));
  dom.touchBtn.setAttribute('aria-label', t('tool.touch'));
  dom.pressureBtn.setAttribute('aria-label', t('tool.pressure'));
  dom.fullscreenBtn.setAttribute('aria-label', t('tool.fullscreen'));
  dom.undoBtn.setAttribute('aria-label', t('tool.undo'));
  dom.redoBtn.setAttribute('aria-label', t('tool.redo'));
  dom.moreBtn.setAttribute('aria-label', t('tool.more'));
  dom.zoomLockBtn.setAttribute('aria-label', t('tool.zoomLock'));
  dom.resetBtn.setAttribute('aria-label', t('tool.reset'));
  dom.settingsBtn.setAttribute('aria-label', t('tool.settings'));
  document.getElementById('toolbar')?.setAttribute('aria-label', t('toolbar.label'));
  dom.hint.textContent = t('hint');
  if (!isFullscreenSupported()) setToolbarHidden(dom.fullscreenBtn, true);
  syncToolbarState();
}
