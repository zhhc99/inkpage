import { dom } from './state';
import { createGridPattern, resetView, resizeCanvas, scheduleRender } from './engine/render';
import { autoLoad, ensureFileInput } from './engine/storage';
import { bindInput } from './engine/input';
import { buildColorPicker, bindPopupOverlays, buildProjectMenu, buildTuning, getPopupAnchor, positionPopup } from './ui/popups';
import { initToolbar, setTool, updateToolbarOverflow } from './ui/toolbar';
import { runtime, state } from './state';

function bindResize(): void {
  window.addEventListener('resize', () => {
    updateToolbarOverflow();
    if (state.pickerOpen) positionPopup(dom.colorPicker, dom.colorBtn, 200, 180);
    if (state.tuningOpen) positionPopup(dom.tuningPanel, getPopupAnchor(dom.tuningBtn), 280, 300);
    if (state.projectOpen) positionPopup(dom.projectMenu, getPopupAnchor(dom.projectBtn), 200, 180);
    if (state.moreOpen) positionPopup(dom.moreMenu, dom.moreBtn);
    resizeCanvas();
  });
}

function init(): void {
  createGridPattern();
  buildColorPicker();
  buildTuning();
  buildProjectMenu();
  bindPopupOverlays();
  initToolbar();
  bindInput();
  bindResize();
  ensureFileInput();
  const restored = autoLoad();
  resizeCanvas();
  updateToolbarOverflow();
  if (state.pressureMode === 'simulated') dom.pressureBtn.classList.add('active');
  if (!restored) {
    resetView();
  } else {
    if (state.zoomLocked) dom.zoomLockBtn.classList.add('active');
    if (state.touchDraw) dom.touchBtn.classList.add('active');
    buildTuning();
    runtime.hasDrawn = true;
    dom.hint.classList.add('hidden');
    runtime.committedDirty = true;
    scheduleRender();
  }
  setTool('ink');
  dom.colorDot.style.background = state.color;
}

init();
