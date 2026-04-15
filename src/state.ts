import { mustGetById } from './utils/dom';

import type { ThemeName } from './config';

export type Tool = 'ink' | 'eraser' | 'select';
export type PressureMode = 'native' | 'simulated';
export type LineCap = 'round' | 'pointed';
export type PointTuple = [number, number, number | null];

export interface StrokeConfig {
  size: number;
  smoothness: number;
  pressureSensitivity: number;
  lineCap: LineCap;
}

export interface Stroke {
  id: number;
  tool: 'ink';
  color: string;
  pressureMode: PressureMode;
  isPen: boolean;
  config: StrokeConfig;
  points: PointTuple[];
  complete?: boolean;
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  cachedPath: Path2D | null;
  cachedPointRadius: number;
  cacheReady: boolean;
  order?: number;
  indexKeys?: string[] | null;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  distance: number;
  length: number;
  radius?: number;
  vectorX?: number;
  vectorY?: number;
  perpX?: number;
  perpY?: number;
}

export interface FreehandOptions {
  size: number;
  thinning: number;
  streamline: number;
  pressureSensitivity: number;
  simulatePressure: boolean;
  easing: (t: number) => number;
}

export interface AddHistoryEntry {
  type: 'add';
  stroke: Stroke;
  index: number;
}

export interface EraseHistoryEntry {
  type: 'erase';
  items: Array<{ stroke: Stroke; index: number }>;
}

export interface MoveHistoryEntry {
  type: 'move';
  items: Array<{ stroke: Stroke; fromPoints: PointTuple[]; toPoints: PointTuple[] }>;
}

export type HistoryEntry = AddHistoryEntry | EraseHistoryEntry | MoveHistoryEntry;

export interface MovingSelection {
  startX: number;
  startY: number;
  moved: boolean;
  items: Array<{ strokeId: number; origin: PointTuple[] }>;
}

export interface BoxSelection {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
  previousIds: number[];
}

export const state = {
  tool: 'ink' as Tool,
  color: '#1D1B20',
  zoom: 1,
  panX: 0,
  panY: 0,
  touchDraw: false,
  pressureMode: 'native' as PressureMode,
  zoomLocked: false,
  drawing: false,
  pickerOpen: false,
  moreOpen: false,
  settingsOpen: false,
  theme: 'iris' as ThemeName,
};

export const runtime = {
  strokes: [] as Stroke[],
  currentStroke: null as Stroke | null,
  eraserPoints: [] as Array<{ x: number; y: number }>,
  pendingErasure: new Set<number>(),
  selectedStrokeIds: new Set<number>(),
  movingSelection: null as MovingSelection | null,
  movingStrokeIds: null as Set<number> | null,
  boxSelection: null as BoxSelection | null,
  nextStrokeId: 1,
  gestureTool: null as Tool | null,
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  strokeMap: new Map<number, Stroke>(),
  strokeIndex: new Map<string, Set<number>>(),
  pinching: false,
  lastPinchDist: 0,
  lastPinchCenter: { x: 0, y: 0 },
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartPanX: 0,
  panStartPanY: 0,
  spaceHeld: false,
  renderRequested: false,
  hasDrawn: false,
  activePointerId: null as number | null,
  gridPattern: null as CanvasPattern | null,
  committedCanvas: null as HTMLCanvasElement | null,
  committedDirty: true,
  lastRenderZoom: 0,
  lastRenderPanX: 0,
  lastRenderPanY: 0,
  autoSaveTimer: null as number | null,
  autoSaveIdleId: null as number | null,
  toastTimer: null as number | null,
  zoomFadeTimer: null as number | null,
  zoomLockToastAt: 0,
};

export const dom = {
  canvas: mustGetById<HTMLCanvasElement>('canvas'),
  container: mustGetById<HTMLDivElement>('canvas-container'),
  hint: mustGetById<HTMLDivElement>('hint'),
  zoomInd: mustGetById<HTMLDivElement>('zoom-indicator'),
  toastEl: mustGetById<HTMLDivElement>('toast'),
  inkBtn: mustGetById<HTMLButtonElement>('ink-btn'),
  eraserBtn: mustGetById<HTMLButtonElement>('eraser-btn'),
  selectBtn: mustGetById<HTMLButtonElement>('select-btn'),
  colorBtn: mustGetById<HTMLButtonElement>('color-btn'),
  touchBtn: mustGetById<HTMLButtonElement>('touch-btn'),
  pressureBtn: mustGetById<HTMLButtonElement>('pressure-btn'),
  zoomLockBtn: mustGetById<HTMLButtonElement>('zoom-lock-btn'),
  fullscreenBtn: mustGetById<HTMLButtonElement>('fullscreen-btn'),
  resetBtn: mustGetById<HTMLButtonElement>('reset-btn'),
  undoBtn: mustGetById<HTMLButtonElement>('undo-btn'),
  redoBtn: mustGetById<HTMLButtonElement>('redo-btn'),
  settingsBtn: mustGetById<HTMLButtonElement>('settings-btn'),
  moreBtn: mustGetById<HTMLButtonElement>('more-btn'),
  dividerA: mustGetById<HTMLDivElement>('divider-a'),
  dividerB: mustGetById<HTMLDivElement>('divider-b'),
  dividerC: mustGetById<HTMLDivElement>('divider-c'),
  dividerD: mustGetById<HTMLDivElement>('divider-d'),
  colorDot: mustGetById<HTMLDivElement>('color-dot'),
  colorPickerOverlay: mustGetById<HTMLDivElement>('color-picker-overlay'),
  colorPicker: mustGetById<HTMLDivElement>('color-picker'),
  settingsOverlay: mustGetById<HTMLDivElement>('settings-overlay'),
  settingsPanel: mustGetById<HTMLDivElement>('settings-panel'),
  moreOverlay: mustGetById<HTMLDivElement>('more-overlay'),
  moreMenu: mustGetById<HTMLDivElement>('more-menu'),
};

export const ctx = dom.canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');
