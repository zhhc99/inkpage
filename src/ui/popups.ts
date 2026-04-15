import { COLORS, CONFIG, t } from '../config';
import { dom, runtime, state } from '../state';
import { saveProject, loadProject, exportPNG, scheduleAutoSave } from '../engine/storage';
import { toggleTouchDraw, togglePressureMode, toggleZoomLock, resetCanvas } from './toolbar';

let closeMoreMenuHook = (): void => {};

export function setCloseMoreMenuHook(fn: () => void): void {
  closeMoreMenuHook = fn;
}

export function positionPopup(el: HTMLElement, anchor: HTMLElement, pw?: number, ph?: number): void {
  const rect = el.getBoundingClientRect();
  const width = pw || rect.width || el.offsetWidth || 220;
  const height = ph || rect.height || el.offsetHeight || 220;
  const anchorRect = anchor.getBoundingClientRect();
  let left: number;
  let top: number;
  if (matchMedia('(orientation:landscape)').matches) {
    left = anchorRect.right + 12;
    top = anchorRect.top;
    if (left + width > innerWidth - 8) left = anchorRect.left - width - 12;
  } else {
    left = anchorRect.left;
    top = anchorRect.bottom + 12;
    if (top + height > innerHeight - 8) top = anchorRect.top - height - 12;
  }
  el.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(top, innerHeight - height - 8))}px`;
}

export function positionPopupAfterLayout(el: HTMLElement, anchor: HTMLElement, pw?: number, ph?: number): void {
  requestAnimationFrame(() => positionPopup(el, anchor, pw, ph));
}

export function getPopupAnchor(btn: HTMLElement): HTMLElement {
  return btn.classList.contains('toolbar-hidden') ? dom.moreBtn : btn;
}

export function buildColorPicker(): void {
  dom.colorPicker.innerHTML = '';
  for (const color of COLORS) {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch${color === state.color ? ' selected' : ''}`;
    swatch.style.background = color;
    swatch.addEventListener('click', () => setColor(color));
    dom.colorPicker.appendChild(swatch);
  }
  const row = document.createElement('div');
  row.className = 'color-custom-row';
  const input = document.createElement('input');
  input.type = 'color';
  input.id = 'custom-color-input';
  input.value = state.color;
  input.addEventListener('input', event => setColor((event.target as HTMLInputElement).value));
  const label = document.createElement('label');
  label.textContent = t('color.custom');
  row.append(input, label);
  dom.colorPicker.appendChild(row);
}

export function closeColorPicker(): void {
  state.pickerOpen = false;
  dom.colorPickerOverlay.classList.remove('show');
  dom.colorPicker.classList.remove('show');
}

export function openColorPicker(): void {
  closeTuning();
  closeProjectMenu();
  closeMoreMenuHook();
  state.pickerOpen = true;
  dom.colorPickerOverlay.classList.add('show');
  dom.colorPicker.classList.add('show');
  positionPopupAfterLayout(dom.colorPicker, dom.colorBtn, 200, 180);
}

export function toggleColorPicker(): void {
  if (state.pickerOpen) closeColorPicker();
  else openColorPicker();
}

export function setColor(color: string): void {
  state.color = color;
  dom.colorDot.style.background = color;
  dom.colorPicker.querySelectorAll('.color-swatch').forEach(node => {
    const el = node as HTMLElement;
    el.classList.toggle('selected', el.style.background === color || rgbToHex(el.style.background) === color.toUpperCase());
  });
  const input = document.getElementById('custom-color-input') as HTMLInputElement | null;
  if (input) input.value = color;
}

function rgbToHex(rgb: string): string {
  const parts = rgb.match(/\d+/g);
  if (!parts || parts.length < 3) return '';
  return `#${parts.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

const SETTINGS_DEFS = [
  {
    title: t('set.stroke'),
    params: [
      { key: 'size', label: t('set.size'), min: 1, max: 20, step: 1, fmt: (v: number) => String(v) },
      { key: 'smoothness', label: t('set.smoothness'), min: 0, max: 1, step: 0.1, fmt: (v: number) => v.toFixed(1) },
      {
        key: 'lineCap',
        label: t('set.lineCap'),
        fmt: (v: string) => (v === 'round' ? t('cap.round') : t('cap.pointed')),
        toggle: true,
      },
    ],
  },
  {
    title: t('set.simPressure'),
    params: [{ key: 'pressureSensitivity', label: t('set.sensitivity'), min: 0.1, max: 4, step: 0.1, fmt: (v: number) => v.toFixed(1) }],
  },
];

export function buildTuning(): void {
  dom.tuningPanel.innerHTML = '';
  for (const section of SETTINGS_DEFS) {
    const sec = document.createElement('div');
    sec.className = 'settings-section';
    const title = document.createElement('div');
    title.className = 'settings-section-title';
    title.textContent = section.title;
    sec.appendChild(title);
    for (const param of section.params) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const label = document.createElement('label');
      label.textContent = param.label;
      row.appendChild(label);
      if ((param as any).toggle) {
        const button = document.createElement('button');
        button.className = 'cap-toggle-btn';
        button.textContent = (param as any).fmt(CONFIG.lineCap);
        button.addEventListener('click', () => {
          CONFIG.lineCap = CONFIG.lineCap === 'round' ? 'pointed' : 'round';
          button.textContent = (param as any).fmt(CONFIG.lineCap);
          if (runtime.strokes.length) scheduleAutoSave();
        });
        row.appendChild(button);
      } else {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String((param as any).min);
        input.max = String((param as any).max);
        input.step = String((param as any).step);
        input.value = String((CONFIG as any)[param.key]);
        const value = document.createElement('span');
        value.className = 'val';
        value.textContent = (param as any).fmt((CONFIG as any)[param.key]);
        input.addEventListener('input', () => {
          (CONFIG as any)[param.key] = parseFloat(input.value);
          value.textContent = (param as any).fmt((CONFIG as any)[param.key]);
          if (runtime.strokes.length) scheduleAutoSave();
        });
        row.append(input, value);
      }
      sec.appendChild(row);
    }
    dom.tuningPanel.appendChild(sec);
  }
}

export function closeTuning(): void {
  state.tuningOpen = false;
  dom.tuningOverlay.classList.remove('show');
  dom.tuningPanel.classList.remove('show');
}

export function openTuning(): void {
  closeColorPicker();
  closeProjectMenu();
  closeMoreMenuHook();
  state.tuningOpen = true;
  dom.tuningOverlay.classList.add('show');
  dom.tuningPanel.classList.add('show');
  positionPopupAfterLayout(dom.tuningPanel, getPopupAnchor(dom.tuningBtn), 280, 300);
}

export function toggleTuning(): void {
  if (state.tuningOpen) closeTuning();
  else openTuning();
}

export function buildProjectMenu(): void {
  dom.projectMenu.innerHTML = '';
  const items = [
    { icon: 'folder_open', label: t('file.load'), action: loadProject },
    { icon: 'save', label: t('file.save'), action: saveProject },
    { icon: 'image', label: t('file.export'), action: exportPNG },
  ];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'file-menu-item';
    btn.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span>${item.label}`;
    btn.addEventListener('click', () => {
      closeProjectMenu();
      void item.action();
    });
    dom.projectMenu.appendChild(btn);
  }
}

export function closeProjectMenu(): void {
  state.projectOpen = false;
  dom.projectOverlay.classList.remove('show');
  dom.projectMenu.classList.remove('show');
}

export function openProjectMenu(): void {
  closeColorPicker();
  closeTuning();
  closeMoreMenuHook();
  state.projectOpen = true;
  dom.projectOverlay.classList.add('show');
  dom.projectMenu.classList.add('show');
  positionPopupAfterLayout(dom.projectMenu, getPopupAnchor(dom.projectBtn), 200, 180);
}

export function toggleProjectMenu(): void {
  if (state.projectOpen) closeProjectMenu();
  else openProjectMenu();
}

export function closeAllPopups(): void {
  closeColorPicker();
  closeTuning();
  closeProjectMenu();
  closeMoreMenuHook();
}

export function bindPopupOverlays(): void {
  dom.colorPickerOverlay.addEventListener('click', closeColorPicker);
  dom.tuningOverlay.addEventListener('click', closeTuning);
  dom.projectOverlay.addEventListener('click', closeProjectMenu);
}
