import { dom } from './state';
import { createGridPattern, resetView, resizeCanvas } from './engine/render';
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
  bindPopupOverlays();
  initToolbar();
  bindInput();
  bindResize();
  ensureFileInput();
  autoLoad();
  buildSettingsPanel();
  syncToolbarState();
  refreshThemeInkUI();
  resizeCanvas();
  updateToolbarOverflow();
  if (!runtime.hasDrawn) resetView();
  document.body.classList.remove('app-loading');
  setTool('ink');
}

init();
