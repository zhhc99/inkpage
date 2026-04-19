import {
  COLORS,
  CONFIG,
  THEME_PRESETS,
  getThemeBase,
  getThemeSpecialInk,
  isDarkTheme,
  isSpecialInkColor,
  normalizeSpecialInkForTheme,
  resolveTheme,
  t,
  tf,
  type ThemeBaseName,
  type ThemeName,
} from '../config';
import { dom, runtime, state } from '../state';
import { saveEditorState, saveProject, loadProject, exportPNG } from '../engine/storage';
import { createGridPattern, scheduleRender } from '../engine/render';
import { showToast } from './toast';

let closeMoreMenuHook = (): void => {};
let lastPopupAnchor: HTMLElement | null = null;

type ToggleSettingDef = {
  key: 'lineCap';
  label: string;
  fmt: (v: 'round' | 'pointed') => string;
  toggle: true;
};

type RangeSettingDef = {
  key: 'size' | 'smoothness' | 'pressureSensitivity';
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
};

type SettingDef = ToggleSettingDef | RangeSettingDef;

const SETTINGS_DEFS: Array<{ title: string; params: SettingDef[] }> = [
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
const POPUP_MARGIN = 12;

export function setCloseMoreMenuHook(fn: () => void): void {
  closeMoreMenuHook = fn;
}

function syncExpanded(el: HTMLElement, expanded: boolean): void {
  el.setAttribute('aria-expanded', String(expanded));
}

function rememberPopupAnchor(anchor: HTMLElement): void {
  lastPopupAnchor = anchor;
}

function restorePopupFocus(restoreFocus: boolean): void {
  const anchor = lastPopupAnchor;
  lastPopupAnchor = null;
  if (restoreFocus) anchor?.focus();
}

function focusPopup(el: HTMLElement): void {
  requestAnimationFrame(() => {
    const target = el.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)');
    target?.focus();
  });
}

function getThemeName(theme: ThemeName = state.theme): string {
  return t(`theme.${getThemeBase(theme)}`);
}

function getThemeModeLabel(theme: ThemeName = state.theme): string {
  return isDarkTheme(theme) ? t('theme.group.dark') : t('theme.group.light');
}

function syncColorDot(): void {
  dom.colorDot.style.background = state.color;
}

export function refreshThemeInkUI(): void {
  syncColorDot();
  buildColorPicker();
}

function applyThemeToInk(theme: ThemeName): void {
  const nextSpecial = getThemeSpecialInk(theme);
  state.color = normalizeSpecialInkForTheme(state.color, theme);
  if (runtime.currentStroke && isSpecialInkColor(runtime.currentStroke.color)) runtime.currentStroke.color = nextSpecial;
  for (const stroke of runtime.strokes) {
    if (isSpecialInkColor(stroke.color)) stroke.color = nextSpecial;
  }
  runtime.committedDirty = true;
}

export function initTheme(): void {
  state.color = normalizeSpecialInkForTheme(state.color, state.theme);
  document.documentElement.dataset.theme = state.theme;
}

export function setTheme(theme: ThemeName, silent = false): void {
  if (state.theme === theme && !silent) return;
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  applyThemeToInk(theme);
  saveEditorState();
  createGridPattern();
  refreshThemeInkUI();
  if (state.settingsOpen) syncThemeControls();
  scheduleRender();
  if (!silent) showToast(tf('toast.theme', { name: `${getThemeName(theme)} · ${getThemeModeLabel(theme)}` }));
}

export function positionPopup(el: HTMLElement, anchor: HTMLElement, pw?: number, ph?: number): void {
  const rect = el.getBoundingClientRect();
  const width = pw || el.offsetWidth || rect.width || 220;
  const height = ph || el.offsetHeight || rect.height || 220;
  const anchorRect = anchor.getBoundingClientRect();
  let left: number;
  let top: number;
  if (matchMedia('(orientation:landscape)').matches) {
    left = anchorRect.right + 12;
    top = anchorRect.top;
    if (left + width > innerWidth - POPUP_MARGIN) left = anchorRect.left - width - 12;
  } else {
    left = anchorRect.left;
    top = anchorRect.bottom + 12;
    if (top + height > innerHeight - POPUP_MARGIN) top = anchorRect.top - height - 12;
  }
  el.style.left = `${Math.max(POPUP_MARGIN, Math.min(left, innerWidth - width - POPUP_MARGIN))}px`;
  el.style.top = `${Math.max(POPUP_MARGIN, Math.min(top, innerHeight - height - POPUP_MARGIN))}px`;
}

export function positionPopupAfterLayout(el: HTMLElement, anchor: HTMLElement, pw?: number, ph?: number): void {
  requestAnimationFrame(() => positionPopup(el, anchor, pw, ph));
}

export function buildColorPicker(): void {
  dom.colorPicker.innerHTML = '';
  for (let i = 0; i < COLORS.length; i++) {
    const color = i === 0 ? getThemeSpecialInk(state.theme) : COLORS[i];
    const swatch = document.createElement('button');
    swatch.className = `color-swatch${(i === 0 ? isSpecialInkColor(state.color) : color === state.color) ? ' selected' : ''}`;
    swatch.style.background = color;
    swatch.dataset.rawColor = color;
    swatch.type = 'button';
    swatch.title = color;
    swatch.setAttribute('aria-label', color);
    swatch.addEventListener('click', () => setColor(color));
    if (i === 0) swatch.innerHTML = '<span class="swatch-star material-symbols-rounded">auto_awesome</span>';
    dom.colorPicker.appendChild(swatch);
  }
  const row = document.createElement('div');
  row.className = 'color-custom-row';
  const input = document.createElement('input');
  input.type = 'color';
  input.id = 'custom-color-input';
  input.value = state.color;
  input.setAttribute('aria-label', t('color.custom'));
  input.addEventListener('input', event => setColor((event.target as HTMLInputElement).value));
  const label = document.createElement('label');
  label.textContent = t('color.custom');
  row.append(input, label);
  dom.colorPicker.appendChild(row);
}

export function closeColorPicker(restoreFocus = true): void {
  if (!state.pickerOpen) return;
  state.pickerOpen = false;
  dom.colorPickerOverlay.classList.remove('show');
  dom.colorPicker.classList.remove('show');
  syncExpanded(dom.colorBtn, false);
  restorePopupFocus(restoreFocus);
}

export function openColorPicker(): void {
  closeSettings(false);
  closeMoreMenuHook();
  rememberPopupAnchor(dom.colorBtn);
  state.pickerOpen = true;
  dom.colorPickerOverlay.classList.add('show');
  dom.colorPicker.classList.add('show');
  syncExpanded(dom.colorBtn, true);
  positionPopupAfterLayout(dom.colorPicker, dom.colorBtn, 200, 180);
  focusPopup(dom.colorPicker);
}

export function toggleColorPicker(): void {
  if (state.pickerOpen) closeColorPicker();
  else openColorPicker();
}

export function setColor(color: string): void {
  state.color = color;
  saveEditorState();
  syncColorDot();
  dom.colorPicker.querySelectorAll('.color-swatch').forEach(node => {
    const el = node as HTMLButtonElement;
    const rawColor = el.dataset.rawColor || '';
    el.classList.toggle('selected', isSpecialInkColor(color) ? isSpecialInkColor(rawColor) : rawColor === color);
  });
  const input = document.getElementById('custom-color-input') as HTMLInputElement | null;
  if (input) input.value = color;
}

function appendSectionTitle(parent: HTMLElement, title: string): void {
  const heading = document.createElement('div');
  heading.className = 'settings-section-title';
  heading.textContent = title;
  parent.appendChild(heading);
}

function appendProjectSection(parent: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'settings-sheet-section';
  appendSectionTitle(section, t('tool.project'));
  const items = [
    { icon: 'folder_open', label: t('file.load'), action: loadProject },
    { icon: 'save', label: t('file.save'), action: saveProject },
    { icon: 'image', label: t('file.export'), action: exportPNG, disabled: runtime.strokes.length === 0 },
  ];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'file-menu-item';
    btn.type = 'button';
    btn.disabled = !!item.disabled;
    btn.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span>${item.label}`;
    btn.addEventListener('click', () => {
      void item.action();
      closeSettings();
    });
    section.appendChild(btn);
  }
  parent.appendChild(section);
}

const THEME_FAMILIES = THEME_PRESETS.filter(preset => !preset.dark) as Array<{ id: ThemeBaseName; swatch: string }>;

function appendThemeModeToggle(parent: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'theme-mode-wrap';
  const label = document.createElement('div');
  label.className = 'settings-subsection-title';
  label.textContent = t('theme.mode');
  const list = document.createElement('div');
  list.className = 'theme-mode-toggle';
  for (const mode of [
    { key: 'light', dark: false, icon: 'light_mode', label: t('theme.group.light') },
    { key: 'dark', dark: true, icon: 'dark_mode', label: t('theme.group.dark') },
  ]) {
    const btn = document.createElement('button');
    btn.className = `theme-mode-btn${mode.dark === isDarkTheme(state.theme) ? ' active' : ''}`;
    btn.type = 'button';
    btn.dataset.themeMode = mode.key;
    btn.setAttribute('aria-pressed', String(mode.dark === isDarkTheme(state.theme)));
    btn.innerHTML = `<span class="material-symbols-rounded">${mode.icon}</span>${mode.label}`;
    btn.addEventListener('click', () => setTheme(resolveTheme(getThemeBase(state.theme), mode.dark)));
    list.appendChild(btn);
  }
  wrap.append(label, list);
  parent.appendChild(wrap);
}

function appendThemeSection(parent: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'settings-sheet-section';
  appendSectionTitle(section, t('tool.theme'));
  const list = document.createElement('div');
  list.className = 'settings-theme-list';
  for (const preset of THEME_FAMILIES) {
    const btn = document.createElement('button');
    btn.className = `file-menu-item theme-item${preset.id === getThemeBase(state.theme) ? ' active' : ''}`;
    btn.type = 'button';
    btn.dataset.themeFamily = preset.id;
    btn.setAttribute('aria-pressed', String(preset.id === getThemeBase(state.theme)));
    btn.innerHTML = `<span class="theme-swatch" style="background:${preset.swatch}"></span>${getThemeName(preset.id)}`;
    btn.addEventListener('click', () => setTheme(resolveTheme(preset.id, isDarkTheme(state.theme))));
    list.appendChild(btn);
  }
  section.appendChild(list);
  appendThemeModeToggle(section);
  parent.appendChild(section);
}

function syncThemeControls(): void {
  const activeFamily = getThemeBase(state.theme);
  const dark = isDarkTheme(state.theme);
  dom.settingsPanel.querySelectorAll<HTMLButtonElement>('.theme-item').forEach(button => {
    const active = button.dataset.themeFamily === activeFamily;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom.settingsPanel.querySelectorAll<HTMLButtonElement>('.theme-mode-btn').forEach(button => {
    const active = button.dataset.themeMode === (dark ? 'dark' : 'light');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function appendTuningSection(parent: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'settings-sheet-section';
  appendSectionTitle(section, t('tool.tuning'));
  for (const groupDef of SETTINGS_DEFS) {
    const group = document.createElement('div');
    group.className = 'settings-group';
    const title = document.createElement('div');
    title.className = 'settings-subsection-title';
    title.textContent = groupDef.title;
    group.appendChild(title);
    for (const param of groupDef.params) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const label = document.createElement('label');
      label.textContent = param.label;
      const head = document.createElement('div');
      head.className = 'settings-row-head';
      head.appendChild(label);
      row.appendChild(head);
      if ('toggle' in param) {
        const control = document.createElement('div');
        control.className = 'segmented-control';
        control.setAttribute('role', 'group');
        control.setAttribute('aria-label', param.label);
        for (const option of [
          { value: 'round' as const, icon: 'lens' },
          { value: 'pointed' as const, icon: 'change_history' },
        ]) {
          const button = document.createElement('button');
          button.className = `segmented-btn${CONFIG.lineCap === option.value ? ' active' : ''}`;
          button.type = 'button';
          button.dataset.value = option.value;
          button.setAttribute('aria-pressed', String(CONFIG.lineCap === option.value));
          button.innerHTML = `<span class="material-symbols-rounded">${option.icon}</span>${param.fmt(option.value)}`;
          button.addEventListener('click', () => {
            if (CONFIG.lineCap === option.value) return;
            CONFIG.lineCap = option.value;
            control.querySelectorAll<HTMLButtonElement>('.segmented-btn').forEach(node => {
              const active = node.dataset.value === option.value;
              node.classList.toggle('active', active);
              node.setAttribute('aria-pressed', String(active));
            });
            saveEditorState();
          });
          control.appendChild(button);
        }
        const body = document.createElement('div');
        body.className = 'settings-row-body';
        body.appendChild(control);
        row.appendChild(body);
      } else {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(param.min);
        input.max = String(param.max);
        input.step = String(param.step);
        input.value = String(CONFIG[param.key]);
        input.setAttribute('aria-label', param.label);
        const value = document.createElement('span');
        value.className = 'val';
        value.textContent = param.fmt(CONFIG[param.key]);
        head.appendChild(value);
        input.addEventListener('input', () => {
          CONFIG[param.key] = parseFloat(input.value);
          value.textContent = param.fmt(CONFIG[param.key]);
          saveEditorState();
        });
        const body = document.createElement('div');
        body.className = 'settings-row-body';
        body.appendChild(input);
        row.appendChild(body);
      }
      group.appendChild(row);
    }
    section.appendChild(group);
  }
  parent.appendChild(section);
}

export function buildSettingsPanel(): void {
  const previousBody = dom.settingsPanel.querySelector<HTMLElement>('.settings-sheet-body');
  const previousScrollTop = previousBody?.scrollTop ?? 0;
  dom.settingsPanel.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'settings-sheet-header';
  const title = document.createElement('div');
  title.className = 'settings-sheet-title';
  title.textContent = t('settings');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tool-btn settings-close-btn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t('close'));
  closeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
  closeBtn.addEventListener('click', () => closeSettings());
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'settings-sheet-body';
  appendProjectSection(body);
  appendThemeSection(body);
  appendTuningSection(body);

  dom.settingsPanel.append(header, body);
  body.scrollTop = previousScrollTop;
}

export function closeSettings(restoreFocus = true): void {
  if (!state.settingsOpen) return;
  state.settingsOpen = false;
  dom.settingsOverlay.classList.remove('show');
  dom.settingsPanel.classList.remove('show');
  syncExpanded(dom.settingsBtn, false);
  restorePopupFocus(restoreFocus);
}

export function openSettings(): void {
  closeColorPicker(false);
  closeMoreMenuHook();
  buildSettingsPanel();
  rememberPopupAnchor(dom.settingsBtn);
  state.settingsOpen = true;
  dom.settingsOverlay.classList.add('show');
  dom.settingsPanel.classList.add('show');
  syncExpanded(dom.settingsBtn, true);
  focusPopup(dom.settingsPanel);
}

export function toggleSettings(): void {
  if (state.settingsOpen) closeSettings();
  else openSettings();
}

export function closeAllPopups(restoreFocus = true): void {
  closeColorPicker(restoreFocus);
  closeSettings(restoreFocus);
  closeMoreMenuHook();
}

export function bindPopupOverlays(): void {
  dom.colorPickerOverlay.addEventListener('click', () => closeColorPicker());
  dom.settingsOverlay.addEventListener('click', () => closeSettings());
}
