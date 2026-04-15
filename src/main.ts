import { dom } from './state';
import { createGridPattern, resetView, resizeCanvas, scheduleRender } from './engine/render';
import { autoLoad, ensureFileInput, restoreEditorState } from './engine/storage';
import { bindInput } from './engine/input';
import { bindPopupOverlays, buildSettingsPanel, initTheme, positionPopup, refreshThemeInkUI } from './ui/popups';
import { initToolbar, setTool, syncToolbarState, updateToolbarOverflow } from './ui/toolbar';
import { runtime, state } from './state';

function bindResize(): void {
  window.addEventListener('resize', () => {
    updateToolbarOverflow();
    if (state.pickerOpen) positionPopup(dom.colorPicker, dom.colorBtn, 200, 180);
    if (state.moreOpen) positionPopup(dom.moreMenu, dom.moreBtn);
    resizeCanvas();
  });
}

function init(): void {
  restoreEditorState();
  initTheme();
  createGridPattern();
  refreshThemeInkUI();
  buildSettingsPanel();
  bindPopupOverlays();
  initToolbar();
  bindInput();
  bindResize();
  ensureFileInput();
  const restored = autoLoad();
  syncToolbarState();
  refreshThemeInkUI();
  resizeCanvas();
  updateToolbarOverflow();
  if (!restored) {
    resetView();
  } else {
    buildSettingsPanel();
    runtime.hasDrawn = true;
    dom.hint.classList.add('hidden');
    runtime.committedDirty = true;
    scheduleRender();
  }
  setTool('ink');
}

init();
