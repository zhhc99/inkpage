import {
  CONFIG,
  DEFAULT_PRESSURE_SENSITIVITY,
  DEFAULT_SMOOTHNESS,
  FIXED_THINNING,
  PI,
  RATE_OF_PRESSURE_CHANGE,
  SAVE_VERSION,
  getBoundedSize,
} from '../config';
import type { FreehandOptions, PointTuple, PressureMode, Stroke, StrokeConfig, StrokePoint } from '../state';
import { clamp, dist, lerp } from '../utils/geometry';

export function getStrokeSize(cfg: Partial<StrokeConfig> | null | undefined): number {
  return getBoundedSize(cfg?.size);
}

export function normalizeStrokeConfig(cfg: Partial<StrokeConfig> | null | undefined): StrokeConfig {
  const size = getStrokeSize(cfg);
  const rawSmoothness = Number(cfg?.smoothness);
  const rawSensitivity = Number(cfg?.pressureSensitivity);
  const smoothness = clamp(Number.isFinite(rawSmoothness) ? rawSmoothness : DEFAULT_SMOOTHNESS, 0, 1);
  return {
    size,
    smoothness,
    pressureSensitivity: clamp(
      Number.isFinite(rawSensitivity) ? rawSensitivity : DEFAULT_PRESSURE_SENSITIVITY,
      0.1,
      4,
    ),
    lineCap: cfg?.lineCap === 'pointed' ? 'pointed' : 'round',
  };
}

export function getPublicConfig(): StrokeConfig {
  return {
    size: CONFIG.size,
    smoothness: CONFIG.smoothness,
    pressureSensitivity: CONFIG.pressureSensitivity,
    lineCap: CONFIG.lineCap,
  };
}

export function applyPublicConfig(cfg: Partial<StrokeConfig> | null | undefined): void {
  const next = normalizeStrokeConfig(cfg);
  CONFIG.size = next.size;
  CONFIG.smoothness = next.smoothness;
  CONFIG.pressureSensitivity = next.pressureSensitivity;
  CONFIG.lineCap = next.lineCap;
}

export function getFreehandOptions(cfg: Partial<StrokeConfig> | null | undefined, pressureMode: PressureMode): FreehandOptions {
  const normalized = normalizeStrokeConfig(cfg);
  return {
    size: normalized.size,
    thinning: FIXED_THINNING,
    streamline: normalized.smoothness,
    pressureSensitivity: normalized.pressureSensitivity,
    simulatePressure: pressureMode === 'simulated',
    easing: (t) => Math.sin((t * PI) / 2),
  };
}

export function clonePoints(points: PointTuple[]): PointTuple[] {
  const copy = new Array<PointTuple>(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    copy[i] = [point[0], point[1], point[2]];
  }
  return copy;
}

export function getStrokePoints(input: PointTuple[], options: FreehandOptions, last: boolean): StrokePoint[] {
  if (!input.length) return [];
  const t = 0.15 + (1 - options.streamline) * 0.85;
  const pts: StrokePoint[] = [];

  for (let i = 0; i < input.length; i++) {
    const point = input[i];
    if (i === 0) {
      pts.push({
        x: point[0],
        y: point[1],
        pressure: point[2] != null ? point[2] : 0.5,
        distance: 0,
        length: 0,
      });
      continue;
    }

    const prev = pts[i - 1];
    if (last && i === input.length - 1) {
      const d = dist(prev.x, prev.y, point[0], point[1]);
      pts.push({
        x: point[0],
        y: point[1],
        pressure: point[2] != null ? point[2] : 0.5,
        distance: d,
        length: prev.length + d,
      });
      continue;
    }

    const sx = lerp(point[0], prev.x, 1 - t);
    const sy = lerp(point[1], prev.y, 1 - t);
    const d = dist(prev.x, prev.y, sx, sy);
    pts.push({
      x: sx,
      y: sy,
      pressure: point[2] != null ? point[2] : 0.5,
      distance: d,
      length: prev.length + d,
    });
  }

  for (let i = 0; i < pts.length; i++) {
    const prev = i > 0 ? pts[i - 1] : pts[i];
    const curr = pts[i];
    const next = i < pts.length - 1 ? pts[i + 1] : pts[i];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;
    curr.vectorX = dx;
    curr.vectorY = dy;
    curr.perpX = -dy;
    curr.perpY = dx;
  }

  return pts;
}

export function setStrokePointRadii(points: StrokePoint[], options: FreehandOptions): void {
  if (!points.length) return;
  const minRadius = options.size / 2;
  let prevPressure = points[0].pressure;
  for (const point of points) {
    let pressure = point.pressure;
    if (options.simulatePressure) {
      const speed = point.distance || 0;
      const sp = Math.min(1, (speed * options.pressureSensitivity) / options.size);
      pressure = 1 - sp;
    } else {
      pressure = Math.min(1, pressure * 1.05);
    }
    pressure = lerp(pressure, prevPressure, RATE_OF_PRESSURE_CHANGE);
    prevPressure = pressure;
    pressure = Math.max(0, Math.min(1, pressure));
    const radius = minRadius * options.easing(0.5 - options.thinning * (0.5 - pressure));
    point.radius = Math.max(0.5, radius);
  }
  if ((points[0].radius || 0) < 1) points[0].radius = 1;
  if ((points[points.length - 1].radius || 0) < 1) points[points.length - 1].radius = 1;
}

export function getStrokeOutlinePoints(strokePoints: StrokePoint[], lineCap: StrokeConfig['lineCap']): number[][] {
  if (!strokePoints.length) return [];
  const cap = lineCap || 'round';
  if (strokePoints.length === 1) {
    const point = strokePoints[0];
    const r = point.radius || 2;
    if (cap === 'pointed') {
      return [
        [point.x - r, point.y],
        [point.x, point.y - r],
        [point.x + r, point.y],
        [point.x, point.y + r],
      ];
    }
    const pts: number[][] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i * 2 * PI) / 12;
      pts.push([point.x + r * Math.cos(angle), point.y + r * Math.sin(angle)]);
    }
    return pts;
  }

  const left: number[][] = [];
  const right: number[][] = [];
  for (const point of strokePoints) {
    const r = point.radius || 2;
    const nx = point.perpX ?? 0;
    const ny = point.perpY ?? 1;
    left.push([point.x + nx * r, point.y + ny * r]);
    right.push([point.x - nx * r, point.y - ny * r]);
  }

  const first = strokePoints[0];
  const last = strokePoints[strokePoints.length - 1];
  if (cap === 'pointed') {
    if (first.vectorX != null) {
      const tipLen = first.radius || 2;
      left.unshift([first.x - first.vectorX * tipLen, first.y - first.vectorY * tipLen]);
      right.unshift([first.x - first.vectorX * tipLen, first.y - first.vectorY * tipLen]);
    }
    if (last.vectorX != null) {
      const tipLen = last.radius || 2;
      left.push([last.x + last.vectorX * tipLen, last.y + last.vectorY * tipLen]);
      right.push([last.x + last.vectorX * tipLen, last.y + last.vectorY * tipLen]);
    }
    return [...left, ...right.reverse()];
  }

  const startAngle = first.perpX != null ? Math.atan2(first.perpY!, first.perpX!) : -PI / 2;
  const endAngle = last.perpX != null ? Math.atan2(last.perpY!, last.perpX!) : -PI / 2;
  const startArc: number[][] = [];
  const endArc: number[][] = [];
  const r0 = first.radius || 2;
  const rN = last.radius || 2;
  for (let i = 1; i < 10; i++) {
    startArc.push([
      first.x + r0 * Math.cos(startAngle + PI - (i * PI) / 10),
      first.y + r0 * Math.sin(startAngle + PI - (i * PI) / 10),
    ]);
    endArc.push([
      last.x + rN * Math.cos(endAngle - (i * PI) / 10),
      last.y + rN * Math.sin(endAngle - (i * PI) / 10),
    ]);
  }
  return [...left, ...endArc, ...right.reverse(), ...startArc];
}

export function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return '';
  const len = points.length;
  if (len < 4) {
    const cx = (points[0][0] + points[len - 1][0]) / 2;
    const cy = (points[0][1] + points[len - 1][1]) / 2;
    const r = Math.max(1, Math.abs(points[0][0] - points[len - 1][0]) / 2);
    return `M${cx - r},${cy}a${r},${r},0,1,0,${r * 2},0a${r},${r},0,1,0,-${r * 2},0Z`;
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < len - 2; i++) {
    const xc = (points[i][0] + points[i + 1][0]) / 2;
    const yc = (points[i][1] + points[i + 1][1]) / 2;
    d += `Q${points[i][0]},${points[i][1]},${xc},${yc}`;
  }
  d += `Q${points[len - 2][0]},${points[len - 2][1]},${points[len - 1][0]},${points[len - 1][1]}`;
  return `${d}Z`;
}

export function renderSvgPath(targetCtx: CanvasRenderingContext2D, path: Path2D | string): void {
  targetCtx.fill(path instanceof Path2D ? path : new Path2D(path));
}

export function buildStrokeDrawData(stroke: Stroke): { pointRadius: number; path: Path2D | null } | null {
  if (!stroke.points.length) return null;
  if (stroke.points.length === 1) {
    return {
      pointRadius: Math.max(0.5, getStrokeSize(stroke.config) / 2),
      path: null,
    };
  }
  const options = getFreehandOptions(stroke.config, stroke.pressureMode);
  const strokePoints = getStrokePoints(stroke.points, options, stroke.complete === true);
  setStrokePointRadii(strokePoints, options);
  const outline = getStrokeOutlinePoints(strokePoints, stroke.config.lineCap || 'round');
  if (outline.length < 3) return null;
  return { pointRadius: 0, path: new Path2D(getSvgPathFromStroke(outline)) };
}

export function computeBBox(stroke: Stroke): void {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  const r = getStrokeSize(stroke.config) / 2 + 2;
  for (const point of stroke.points) {
    if (point[0] < minX) minX = point[0] - r;
    if (point[1] < minY) minY = point[1] - r;
    if (point[0] > maxX) maxX = point[0] + r;
    if (point[1] > maxY) maxY = point[1] + r;
  }
  stroke.bbox = { minX, minY, maxX, maxY };
}

export function prepareStroke(stroke: Stroke): Stroke {
  stroke.config = normalizeStrokeConfig(stroke.config);
  computeBBox(stroke);
  const drawData = buildStrokeDrawData(stroke);
  stroke.cachedPath = drawData ? drawData.path : null;
  stroke.cachedPointRadius = drawData ? drawData.pointRadius : 0;
  stroke.cacheReady = true;
  return stroke;
}

export function renderStroke(
  targetCtx: CanvasRenderingContext2D,
  stroke: Stroke,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
  forceLive = false,
): void {
  if (!stroke.points.length) return;
  if (stroke.bbox) {
    const margin = getStrokeSize(stroke.config) + 2;
    if (
      stroke.bbox.maxX + margin < vx0 ||
      stroke.bbox.minX - margin > vx1 ||
      stroke.bbox.maxY + margin < vy0 ||
      stroke.bbox.minY - margin > vy1
    ) {
      return;
    }
  }

  if (!forceLive && stroke.complete === true) {
    if (!stroke.cacheReady) prepareStroke(stroke);
    if (stroke.points.length === 1) {
      const radius = stroke.cachedPointRadius || Math.max(0.5, getStrokeSize(stroke.config) / 2);
      targetCtx.fillStyle = stroke.color;
      targetCtx.beginPath();
      targetCtx.arc(stroke.points[0][0], stroke.points[0][1], radius, 0, PI * 2);
      targetCtx.fill();
      return;
    }
    if (stroke.cachedPath) {
      targetCtx.fillStyle = stroke.color;
      renderSvgPath(targetCtx, stroke.cachedPath);
      return;
    }
  }

  if (stroke.points.length === 1) {
    const radius = Math.max(0.5, getStrokeSize(stroke.config) / 2);
    targetCtx.fillStyle = stroke.color;
    targetCtx.beginPath();
    targetCtx.arc(stroke.points[0][0], stroke.points[0][1], radius, 0, PI * 2);
    targetCtx.fill();
    return;
  }

  const drawData = buildStrokeDrawData(stroke);
  if (!drawData?.path) return;
  targetCtx.fillStyle = stroke.color;
  renderSvgPath(targetCtx, drawData.path);
}

export function serializeStroke(stroke: Stroke): Record<string, unknown> {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    pressureMode: stroke.pressureMode,
    isPen: stroke.isPen,
    config: normalizeStrokeConfig(stroke.config),
    points: stroke.points,
    complete: true,
  };
}

export function serializeCanvasData(
  strokes: Stroke[],
  view: {
    zoom: number;
    panX: number;
    panY: number;
  },
): Record<string, unknown> {
  return {
    version: SAVE_VERSION,
    strokes: strokes.map(serializeStroke),
    view,
  };
}

export function hydrateStroke(raw: any): Stroke {
  const stroke: Stroke = {
    ...raw,
    config: normalizeStrokeConfig(raw.config),
    bbox: null,
    complete: true,
    cachedPath: null,
    cachedPointRadius: 0,
    cacheReady: false,
  };
  return prepareStroke(stroke);
}
