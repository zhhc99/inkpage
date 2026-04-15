import { clamp } from './utils/geometry';

export const LANG = /^zh/i.test(navigator.language) ? 'zh' : 'en';

export type ThemeBaseName = 'iris' | 'sage' | 'lake' | 'porcelain';
export type ThemeName = ThemeBaseName | 'iris-dark' | 'sage-dark' | 'lake-dark' | 'porcelain-dark';

export const STRINGS = {
  zh: {
    'tool.ink': '墨迹 (P)',
    'tool.select': '选择 (V)',
    'tool.eraser': '橡皮 (E)',
    'tool.color': '颜色 (C)',
    'tool.touch': '触摸墨迹 (T)',
    'tool.pressure': '模拟压感 (G)',
    'tool.zoomLock': '统一缩放',
    'tool.fullscreen': '全屏幕',
    'tool.reset': '新建画布',
    'tool.settings': '设置 (S)',
    'tool.undo': '撤销 (Ctrl+Z)',
    'tool.redo': '重做 (Ctrl+Shift+Z)',
    'tool.more': '更多操作',
    'tool.project': '项目',
    'tool.tuning': '墨迹微调',
    'tool.theme': '界面主题',
    'theme.group.light': '浅色',
    'theme.group.dark': '深色',
    'theme.mode': '外观',
    'toolbar.label': '工具栏',
    hint: '在此处书写或涂画',
    'touch.on': '触摸墨迹已开启',
    'touch.off': '触摸墨迹已关闭',
    'pressure.on': '模拟压感已开启',
    'pressure.off': '模拟压感已关闭',
    'toast.erased': '已擦除 {n} 条笔画',
    'toast.saved': '项目已保存',
    'toast.loaded': '项目已加载 ({n} 条笔画)',
    'toast.load.error': '读取失败: 文件格式错误',
    'toast.exported': '图片已导出',
    'toast.cleared': '画布已清空',
    'toast.zoomLock.on': '统一缩放已开启',
    'toast.zoomLock.off': '统一缩放已关闭',
    'toast.zoomLock.blocked': '当前为统一缩放',
    'toast.fullscreen.on': '已进入全屏幕',
    'toast.fullscreen.off': '已退出全屏幕',
    'toast.theme': '界面主题已切换为 {name}',
    'confirm.reset': '新建画布后, 未保存内容将丢失. 确定吗?',
    'file.save': '保存项目',
    'file.load': '读取项目',
    'file.export': '导出图片',
    'color.custom': '自定义颜色',
    'set.stroke': '笔触',
    'set.simPressure': '模拟压感',
    'set.size': '宽度',
    'set.lineCap': '笔锋形状',
    'set.smoothness': '平滑程度',
    'set.sensitivity': '敏感度',
    'cap.round': '圆润',
    'cap.pointed': '尖锐',
    'theme.iris': '鸢尾',
    'theme.sage': '鼠尾草',
    'theme.lake': '湖蓝',
    'theme.porcelain': '瓷白',
    settings: '设置',
    close: '关闭',
  },
  en: {
    'tool.ink': 'Ink (P)',
    'tool.select': 'Select (V)',
    'tool.eraser': 'Eraser (E)',
    'tool.color': 'Color (C)',
    'tool.touch': 'Touch Ink (T)',
    'tool.pressure': 'Simulated Pressure (G)',
    'tool.zoomLock': 'Unified Zoom',
    'tool.fullscreen': 'Fullscreen',
    'tool.reset': 'New Canvas',
    'tool.settings': 'Settings (S)',
    'tool.undo': 'Undo (Ctrl+Z)',
    'tool.redo': 'Redo (Ctrl+Shift+Z)',
    'tool.more': 'More Actions',
    'tool.project': 'Project',
    'tool.tuning': 'Stroke Tuning',
    'tool.theme': 'Theme',
    'theme.group.light': 'Light',
    'theme.group.dark': 'Dark',
    'theme.mode': 'Appearance',
    'toolbar.label': 'Toolbar',
    hint: 'Write or draw here',
    'touch.on': 'Touch ink enabled',
    'touch.off': 'Touch ink disabled',
    'pressure.on': 'Simulated pressure enabled',
    'pressure.off': 'Simulated pressure disabled',
    'toast.erased': 'Erased {n} stroke(s)',
    'toast.saved': 'Project saved',
    'toast.loaded': 'Project loaded ({n} stroke(s))',
    'toast.load.error': 'Load failed: invalid file format',
    'toast.exported': 'Image exported',
    'toast.cleared': 'Canvas cleared',
    'toast.zoomLock.on': 'Unified zoom enabled',
    'toast.zoomLock.off': 'Unified zoom disabled',
    'toast.zoomLock.blocked': 'Unified zoom is active',
    'toast.fullscreen.on': 'Entered fullscreen',
    'toast.fullscreen.off': 'Exited fullscreen',
    'toast.theme': 'Theme changed to {name}',
    'confirm.reset': 'Creating a new canvas will discard unsaved content. Continue?',
    'file.save': 'Save Project',
    'file.load': 'Load Project',
    'file.export': 'Export Image',
    'color.custom': 'Custom Color',
    'set.stroke': 'Stroke',
    'set.simPressure': 'Simulated Pressure',
    'set.size': 'Width',
    'set.lineCap': 'Tip Shape',
    'set.smoothness': 'Smoothness',
    'set.sensitivity': 'Sensitivity',
    'cap.round': 'Round',
    'cap.pointed': 'Pointed',
    'theme.iris': 'Iris',
    'theme.sage': 'Sage',
    'theme.lake': 'Lake',
    'theme.porcelain': 'Porcelain',
    settings: 'Settings',
    close: 'Close',
  },
} as const;

export const t = (key: string): string => STRINGS[LANG][key as keyof (typeof STRINGS)['zh']] || STRINGS.en[key as keyof (typeof STRINGS)['en']] || key;
export const tf = (key: string, values: Record<string, string | number>): string =>
  t(key).replace(/\{(\w+)\}/g, (_, p: string) => String(values[p]));

export const DEFAULT_SIZE = 3;
export const DEFAULT_SMOOTHNESS = 0.5;
export const DEFAULT_PRESSURE_SENSITIVITY = 1;
export const PEN_POINT_MERGE_DISTANCE = 0.2;
export const HISTORY_LIMIT = 500;
export const INDEX_CELL_SIZE = 256;
export const SELECT_HIT_RADIUS = 10;
export const SAVE_VERSION = 4;
export const AUTOSAVE_KEY = 'inkpage_autosave';
export const THEME_KEY = 'inkpage_theme';
export const EDITOR_STATE_KEY = 'inkpage_editor_state';
export const COLORS = ['#1D1B20', '#4A6B7C', '#955050', '#B07848', '#4E7A5C', '#6E5B7D'];
export const SPECIAL_INK_LIGHT = COLORS[0];
export const SPECIAL_INK_DARK = '#E9E1D6';
export const PI = Math.PI;
export const FIXED_THINNING = 0.5;
export const RATE_OF_PRESSURE_CHANGE = 0.275;

export const THEME_PRESETS: Array<{ id: ThemeName; swatch: string; dark?: boolean }> = [
  { id: 'iris', swatch: '#6750A4' },
  { id: 'sage', swatch: '#5F6E52' },
  { id: 'lake', swatch: '#2F628B' },
  { id: 'porcelain', swatch: '#7A6758' },
  { id: 'iris-dark', swatch: '#4D3E77', dark: true },
  { id: 'sage-dark', swatch: '#445137', dark: true },
  { id: 'lake-dark', swatch: '#1E4A6C', dark: true },
  { id: 'porcelain-dark', swatch: '#5B4233', dark: true },
];

export function isDarkTheme(theme: ThemeName): boolean {
  return !!THEME_PRESETS.find(preset => preset.id === theme)?.dark;
}

export function getThemeBase(theme: ThemeName): ThemeBaseName {
  return theme.replace('-dark', '') as ThemeBaseName;
}

export function resolveTheme(base: ThemeBaseName, dark: boolean): ThemeName {
  return (dark ? `${base}-dark` : base) as ThemeName;
}

export function isSpecialInkColor(color: string): boolean {
  const upper = color.toUpperCase();
  return upper === SPECIAL_INK_LIGHT || upper === SPECIAL_INK_DARK;
}

export function getThemeSpecialInk(theme: ThemeName): string {
  return isDarkTheme(theme) ? SPECIAL_INK_DARK : SPECIAL_INK_LIGHT;
}

export function normalizeSpecialInkForTheme(color: string, theme: ThemeName): string {
  return isSpecialInkColor(color) ? getThemeSpecialInk(theme) : color;
}

export const CONFIG = {
  size: DEFAULT_SIZE,
  smoothness: DEFAULT_SMOOTHNESS,
  pressureSensitivity: DEFAULT_PRESSURE_SENSITIVITY,
  lineCap: 'round' as 'round' | 'pointed',
  eraserSize: 22,
  minZoom: 0.15,
  maxZoom: 6,
};

export function getBoundedSize(value: unknown): number {
  const raw = Number(value);
  return clamp(Number.isFinite(raw) ? raw : DEFAULT_SIZE, 1, 20);
}
