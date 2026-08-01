import type {
  BeadGrid,
  CanvasSize,
  ProcessingSettings,
  RectSelection,
  SerializedProjectFile,
  SourceImage,
  ViewTransform,
  PaletteColor,
  PaletteId,
} from "../../shared/types/project";
import { EMPTY_CELL } from "../../shared/types/project";
import {
  getPalette,
  getPaletteIds,
  findPaletteIndexById,
  normalizeEnabledPaletteIds,
  normalizePaletteId,
} from "../palette/palette";
import {
  getGridCoordinateMargin,
  getGridCoordinateMarkers,
} from "./gridCoordinates";

const MAX_SAMPLE_BITMAP_SIDE = 8192;
const MAX_SAMPLE_BITMAP_PIXELS = 32 * 1024 * 1024;
const MIN_VISIBLE_ALPHA = 128;
const NEAR_DUPLICATE_DELTA_E = 1;
const EXPORT_MARGIN = 24;
const EXPORT_MIN_CELL_SIZE = 8;
const EXPORT_MAX_CELL_SIZE = 28;
const EXPORT_DRAW_SIZE = 2200;
const EXPORT_MIN_INFO_WIDTH = 960;
const EXPORT_HEADER_HEIGHT = 132;
const EXPORT_FOOTER_MIN_HEIGHT = 176;
const EXPORT_PIXEL_RATIO = 2;
const MAX_EXPORT_BITMAP_SIDE = 16384;
const EXPORT_LEGEND_ITEM_HEIGHT = 44;
const COLOR_DISTANCE_EPSILON = 1e-9;
const TRIMMABLE_BACKGROUND_COLOR_IDS = new Set(["W01", "W02", "W03", "S01", "H1", "H2"]);

type LabColor = {
  lightness: number;
  greenRed: number;
  blueYellow: number;
};

type OklabColor = {
  lightness: number;
  greenRed: number;
  blueYellow: number;
};

type PaletteCluster = {
  representativeIndex: number;
  count: number;
  members: number[];
};

export async function generateBeadGrid(options: {
  canvas: CanvasSize;
  sourceImage: SourceImage;
  imageTransform: ViewTransform;
  enabledPaletteIds: string[];
  maxColorCount: number | null;
  paletteId: PaletteId;
}) {
  const palette = getPalette(options.paletteId);
  const image = await loadImage(options.sourceImage.src);
  const sampleSurface = renderSourceToSampleSurface({
    canvas: options.canvas,
    image,
    imageTransform: options.imageTransform,
  });

  const enabledPaletteIndices = normalizeEnabledPaletteIds(options.enabledPaletteIds, options.paletteId)
    .map((colorId) => findPaletteIndexById(colorId, options.paletteId))
    .filter((index): index is number => index >= 0);

  if (enabledPaletteIndices.length === 0) {
    throw new Error("至少需要启用一种拼豆颜色才能生成图纸。");
  }

  const sampledGrid = sampleGridFromImageData({
    canvas: options.canvas,
    imageData: sampleSurface.imageData,
  });
  const beadGrid = quantizeNearest(sampledGrid, enabledPaletteIndices, palette);
  const normalizedBeadGrid = mergeNearDuplicatePaletteColors(
    beadGrid,
    enabledPaletteIndices,
    palette,
  );

  return limitBeadGridColors(normalizedBeadGrid, options.maxColorCount, palette);
}

export async function generatePreviewBeadGrid(options: {
  canvas: CanvasSize;
  sourceImage: SourceImage;
  imageTransform: ViewTransform;
  enabledPaletteIds: string[];
  maxColorCount: number | null;
  paletteId: PaletteId;
}) {
  return generateBeadGrid({
    ...options,
  });
}

export function buildColorStats(beadGrid: BeadGrid | null, palette: PaletteColor[]) {
  if (!beadGrid) {
    return [];
  }

  const counts = new Map<number, number>();
  let coloredCount = 0;

  for (const colorIndex of beadGrid.cells) {
    if (colorIndex === EMPTY_CELL) {
      continue;
    }

    counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + 1);
    coloredCount += 1;
  }

  if (coloredCount === 0) {
    return [];
  }

  return Array.from(counts.entries())
    .map(([colorIndex, count]) => {
      const color = palette[colorIndex] ?? palette[0];

      return {
        colorIndex,
        color,
        count,
        ratio: count / coloredCount,
      };
    })
    .sort((left, right) => right.count - left.count);
}

export function limitBeadGridColors(
  beadGrid: BeadGrid,
  maxColorCount: number | null,
  palette: PaletteColor[],
): BeadGrid {
  const usageCounts = new Map<number, number>();

  for (const colorIndex of beadGrid.cells) {
    if (colorIndex === EMPTY_CELL || !palette[colorIndex]) {
      continue;
    }

    usageCounts.set(colorIndex, (usageCounts.get(colorIndex) ?? 0) + 1);
  }

  if (
    maxColorCount === null ||
    usageCounts.size <= Math.max(1, Math.round(maxColorCount))
  ) {
    return {
      ...beadGrid,
      cells: new Uint16Array(beadGrid.cells),
    };
  }

  const reduction = reducePaletteColorsBySimilarity(
    usageCounts,
    Math.max(1, Math.round(maxColorCount)),
    palette,
  );
  const cells = new Uint16Array(beadGrid.cells.length);

  for (let index = 0; index < beadGrid.cells.length; index += 1) {
    const colorIndex = beadGrid.cells[index];
    if (colorIndex === EMPTY_CELL || !palette[colorIndex]) {
      cells[index] = colorIndex;
      continue;
    }

    cells[index] = reduction.representativeByIndex.get(colorIndex) ?? colorIndex;
  }

  return {
    ...beadGrid,
    cells,
  };
}

export function exportColorListText(options: {
  name: string;
  canvas: CanvasSize;
  stats: Array<{
    colorIndex: number;
    color: PaletteColor;
    count: number;
    ratio: number;
  }>;
}) {
  const lines = [
    `项目：${options.name}`,
    `画布：${options.canvas.width} x ${options.canvas.height}`,
    "",
    "颜色清单",
  ];

  if (options.stats.length === 0) {
    lines.push("暂无颜色数据");
    return lines.join("\n");
  }

  for (const item of options.stats) {
    lines.push(
      `${item.color.id}\t${item.color.name}\t${item.color.hex}\t${item.count}\t${(
        item.ratio * 100
      ).toFixed(1)}%`,
    );
  }

  return lines.join("\n");
}

export function exportProjectJson(options: {
  beadGrid: BeadGrid | null;
  canvas: CanvasSize;
  currentSelection: RectSelection | null;
  name: string;
  processing: ProcessingSettings;
  sourceImage: SourceImage | null;
  imageTransform: ViewTransform;
  stageViewport: ViewTransform;
  enabledPaletteIds: string[];
  activeTool: "paint" | "erase" | "picker" | "pan" | "fill" | "select";
  activeColorId: string;
  showGrid: boolean;
  paletteId: PaletteId;
}) {
  const payload: SerializedProjectFile = {
    version: 2,
    savedAt: new Date().toISOString(),
    project: {
      name: options.name,
      canvas: options.canvas,
      sourceImage: options.sourceImage,
      beadGrid: options.beadGrid
        ? {
            width: options.beadGrid.width,
            height: options.beadGrid.height,
            cells: Array.from(options.beadGrid.cells),
          }
        : null,
      currentSelection: options.currentSelection,
      imageTransform: options.imageTransform,
      stageViewport: options.stageViewport,
      processing: options.processing,
      paletteId: options.paletteId,
      enabledPaletteIds: normalizeEnabledPaletteIds(options.enabledPaletteIds, options.paletteId),
      activeTool: options.activeTool,
      activeColorId: options.activeColorId,
      showGrid: options.showGrid,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function parseProjectJson(raw: string): SerializedProjectFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("工程文件不是有效的 JSON。");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("工程文件结构无效。");
  }

  const projectFile = parsed as {
    version?: number;
    project?: Partial<SerializedProjectFile["project"]>;
    savedAt?: string;
  };

  if ((projectFile.version !== 1 && projectFile.version !== 2) || !projectFile.project) {
    throw new Error("暂不支持该工程文件版本。");
  }

  const paletteId: PaletteId = projectFile.version === 1
    ? "generic-49"
    : normalizePaletteId(projectFile.project.paletteId);
  const enabledPaletteIds = normalizeEnabledPaletteIds(projectFile.project.enabledPaletteIds, paletteId);

  return {
    ...projectFile,
    version: 2,
    project: {
      ...projectFile.project,
      paletteId,
      enabledPaletteIds,
      activeColorId:
        enabledPaletteIds.includes(projectFile.project.activeColorId ?? "")
          ? projectFile.project.activeColorId ?? getPaletteIds(paletteId)[0]
          : enabledPaletteIds[0],
      processing: normalizeProcessingSettings(projectFile.project.processing),
    },
  } as SerializedProjectFile;
}

export function normalizeProcessingSettings(
  processing?: Partial<ProcessingSettings> | null,
  paletteSize = 221,
): ProcessingSettings {
  const maxColorCount = processing?.maxColorCount;

  if (maxColorCount === null || maxColorCount === undefined) {
    return { maxColorCount: null };
  }

  if (!Number.isFinite(maxColorCount)) {
    return { maxColorCount: null };
  }

  return {
    maxColorCount: Math.min(
      paletteSize,
      Math.max(1, Math.round(maxColorCount)),
    ),
  };
}

export function exportStagePng(beadGrid: BeadGrid | null, palette: PaletteColor[]) {
  if (!beadGrid) {
    throw new Error("当前没有可导出的图纸画布。");
  }

  const canvas = renderPatternChart(beadGrid, palette);
  return canvas.toDataURL("image/png");
}

export function exportFormalPatternPng(options: {
  beadGrid: BeadGrid | null;
  name: string;
  palette: PaletteColor[];
}) {
  if (!options.beadGrid) {
    throw new Error("当前没有可导出的图纸画布。");
  }

  const canvas = renderFormalPatternChart(options.beadGrid, options.name, options.palette);
  return canvas.toDataURL("image/png");
}

export function exportFinishedPng(beadGrid: BeadGrid | null, palette: PaletteColor[]) {
  if (!beadGrid) {
    throw new Error("当前没有可导出的成品图。");
  }

  const scale = beadGrid.width <= 80 && beadGrid.height <= 80 ? 32 : 20;
  const canvas = document.createElement("canvas");
  canvas.width = beadGrid.width * scale;
  canvas.height = beadGrid.height * scale;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法初始化成品导出画布。");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < beadGrid.height; y += 1) {
    for (let x = 0; x < beadGrid.width; x += 1) {
      const colorIndex = beadGrid.cells[y * beadGrid.width + x];

      if (colorIndex === EMPTY_CELL) {
        continue;
      }

      const color = palette[colorIndex] ?? palette[0];
      drawFinishedBead(context, x * scale, y * scale, scale, color.hex);
    }
  }

  return canvas.toDataURL("image/png");
}

export function trimBeadGrid(beadGrid: BeadGrid | null, palette: PaletteColor[]) {
  if (!beadGrid) {
    return null;
  }

  const ignoredCells = buildTrimmableBackgroundMask(beadGrid, palette);
  let minX = beadGrid.width;
  let minY = beadGrid.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < beadGrid.height; y += 1) {
    for (let x = 0; x < beadGrid.width; x += 1) {
      const index = y * beadGrid.width + x;
      if (ignoredCells?.[index]) {
        continue;
      }

      const colorIndex = beadGrid.cells[index];
      if (colorIndex === EMPTY_CELL) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const nextWidth = maxX - minX + 1;
  const nextHeight = maxY - minY + 1;
  const cells = new Uint16Array(nextWidth * nextHeight);
  cells.fill(EMPTY_CELL);

  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      cells[y * nextWidth + x] =
        beadGrid.cells[(minY + y) * beadGrid.width + (minX + x)];
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    cells,
  };
}

function buildTrimmableBackgroundMask(beadGrid: BeadGrid, palette: PaletteColor[]) {
  const candidateColorIndex = findConnectedBorderBackgroundColor(beadGrid, palette);
  if (candidateColorIndex === null) {
    return null;
  }

  const mask = new Uint8Array(beadGrid.width * beadGrid.height);
  const queue: number[] = [];

  function enqueue(index: number) {
    if (mask[index] || beadGrid.cells[index] !== candidateColorIndex) {
      return;
    }
    mask[index] = 1;
    queue.push(index);
  }

  for (let x = 0; x < beadGrid.width; x += 1) {
    enqueue(x);
    enqueue((beadGrid.height - 1) * beadGrid.width + x);
  }

  for (let y = 1; y < beadGrid.height - 1; y += 1) {
    enqueue(y * beadGrid.width);
    enqueue(y * beadGrid.width + (beadGrid.width - 1));
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % beadGrid.width;
    const y = Math.floor(index / beadGrid.width);

    if (x > 0) {
      enqueue(index - 1);
    }
    if (x + 1 < beadGrid.width) {
      enqueue(index + 1);
    }
    if (y > 0) {
      enqueue(index - beadGrid.width);
    }
    if (y + 1 < beadGrid.height) {
      enqueue(index + beadGrid.width);
    }
  }

  for (let index = 0; index < beadGrid.cells.length; index += 1) {
    if (!mask[index] && beadGrid.cells[index] !== EMPTY_CELL) {
      return mask;
    }
  }

  return null;
}

function findConnectedBorderBackgroundColor(beadGrid: BeadGrid, palette: PaletteColor[]) {
  const borderCounts = new Map<number, number>();
  let occupiedBorderCount = 0;

  function countIndex(index: number) {
    const colorIndex = beadGrid.cells[index];
    if (colorIndex === EMPTY_CELL) {
      return;
    }
    occupiedBorderCount += 1;
    borderCounts.set(colorIndex, (borderCounts.get(colorIndex) ?? 0) + 1);
  }

  for (let x = 0; x < beadGrid.width; x += 1) {
    countIndex(x);
    if (beadGrid.height > 1) {
      countIndex((beadGrid.height - 1) * beadGrid.width + x);
    }
  }

  for (let y = 1; y < beadGrid.height - 1; y += 1) {
    countIndex(y * beadGrid.width);
    if (beadGrid.width > 1) {
      countIndex(y * beadGrid.width + (beadGrid.width - 1));
    }
  }

  if (occupiedBorderCount === 0) {
    return null;
  }

  let winner: number | null = null;
  let winnerCount = 0;
  for (const [colorIndex, count] of borderCounts.entries()) {
    if (count > winnerCount) {
      winner = colorIndex;
      winnerCount = count;
    }
  }

  if (winner === null) {
    return null;
  }

  const winnerColor = palette[winner];
  if (!winnerColor || !TRIMMABLE_BACKGROUND_COLOR_IDS.has(winnerColor.id)) {
    return null;
  }

  return winnerCount / occupiedBorderCount >= 0.55 ? winner : null;
}

function drawFinishedBead(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
  hex: string,
) {
  const centerX = left + size / 2;
  const centerY = top + size / 2;
  const radius = size * 0.42;

  context.beginPath();
  context.fillStyle = hex;
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.fillStyle = "rgba(255, 255, 255, 0.18)";
  context.arc(centerX - size * 0.1, centerY - size * 0.1, radius * 0.42, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.fillStyle = "rgba(38, 34, 28, 0.08)";
  context.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
  context.fill();
}

function renderPatternChart(beadGrid: BeadGrid, palette: PaletteColor[]) {
  const maxSide = Math.max(beadGrid.width, beadGrid.height);
  const cellSize = clampNumber(
    Math.floor(EXPORT_DRAW_SIZE / Math.max(1, maxSide)),
    EXPORT_MIN_CELL_SIZE,
    EXPORT_MAX_CELL_SIZE,
  );
  const rulerSize = Math.max(
    getGridCoordinateMargin(beadGrid.width),
    getGridCoordinateMargin(beadGrid.height),
  );
  const paperWidth = beadGrid.width * cellSize;
  const paperHeight = beadGrid.height * cellSize;
  const logicalWidth = EXPORT_MARGIN * 2 + rulerSize * 2 + paperWidth;
  const logicalHeight = EXPORT_MARGIN * 2 + rulerSize * 2 + paperHeight;
  const { canvas, context } = createExportCanvas(logicalWidth, logicalHeight);
  if (!context) {
    throw new Error("无法初始化图纸导出画布。");
  }

  const paperLeft = EXPORT_MARGIN + rulerSize;
  const paperTop = EXPORT_MARGIN + rulerSize;
  const paperRight = paperLeft + paperWidth;
  const paperBottom = paperTop + paperHeight;

  context.fillStyle = "#f4efe6";
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  context.fillStyle = "#ffffff";
  context.fillRect(paperLeft, paperTop, paperWidth, paperHeight);

  drawPatternRulers(
    context,
    beadGrid.width,
    beadGrid.height,
    cellSize,
    rulerSize,
    paperLeft,
    paperTop,
    paperRight,
    paperBottom,
  );
  drawPatternCells(context, beadGrid, cellSize, paperLeft, paperTop, palette);
  drawPatternGrid(context, beadGrid.width, beadGrid.height, cellSize, paperLeft, paperTop);

  if (cellSize >= 12) {
    drawPatternCellLabels(context, beadGrid, cellSize, paperLeft, paperTop, palette);
  }

  context.strokeStyle = "#8d806f";
  context.lineWidth = 2;
  context.strokeRect(paperLeft, paperTop, paperWidth, paperHeight);

  return canvas;
}

function renderFormalPatternChart(beadGrid: BeadGrid, name: string, palette: PaletteColor[]) {
  const maxSide = Math.max(beadGrid.width, beadGrid.height);
  const cellSize = clampNumber(
    Math.floor(EXPORT_DRAW_SIZE / Math.max(1, maxSide)),
    EXPORT_MIN_CELL_SIZE,
    EXPORT_MAX_CELL_SIZE,
  );
  const rulerSize = Math.max(
    getGridCoordinateMargin(beadGrid.width),
    getGridCoordinateMargin(beadGrid.height),
  );
  const paperWidth = beadGrid.width * cellSize;
  const paperHeight = beadGrid.height * cellSize;
  const colorStats = buildColorStats(beadGrid, palette);
  const baseContentWidth = rulerSize * 2 + paperWidth;
  const infoWidth = Math.max(baseContentWidth, EXPORT_MIN_INFO_WIDTH);
  const legendColumns = getLegendColumnCount(infoWidth - 32, colorStats.length);
  const legendRows = Math.max(1, Math.ceil(Math.max(1, colorStats.length) / legendColumns));
  const footerHeight = Math.max(
    EXPORT_FOOTER_MIN_HEIGHT,
    80 + legendRows * EXPORT_LEGEND_ITEM_HEIGHT,
  );
  const logicalWidth = EXPORT_MARGIN * 2 + infoWidth;
  const logicalHeight =
    EXPORT_MARGIN * 2 + EXPORT_HEADER_HEIGHT + rulerSize * 2 + paperHeight + footerHeight;
  const { canvas, context } = createExportCanvas(logicalWidth, logicalHeight);
  if (!context) {
    throw new Error("无法初始化图纸导出画布。");
  }

  const contentLeft = EXPORT_MARGIN;
  const contentOffsetX = Math.max(0, Math.floor((infoWidth - baseContentWidth) / 2));
  const paperLeft = contentLeft + contentOffsetX + rulerSize;
  const paperTop = EXPORT_MARGIN + EXPORT_HEADER_HEIGHT + rulerSize;
  const paperRight = paperLeft + paperWidth;
  const paperBottom = paperTop + paperHeight;

  context.fillStyle = "#f4efe6";
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  drawFormalPatternHeader(context, {
    name,
    beadGrid,
    colorStats,
    left: contentLeft,
    top: EXPORT_MARGIN,
    width: infoWidth,
    height: EXPORT_HEADER_HEIGHT - 12,
  });

  context.fillStyle = "#ffffff";
  context.fillRect(paperLeft, paperTop, paperWidth, paperHeight);

  drawPatternRulers(
    context,
    beadGrid.width,
    beadGrid.height,
    cellSize,
    rulerSize,
    paperLeft,
    paperTop,
    paperRight,
    paperBottom,
  );
  drawPatternCells(context, beadGrid, cellSize, paperLeft, paperTop, palette);
  drawPatternGrid(context, beadGrid.width, beadGrid.height, cellSize, paperLeft, paperTop);

  if (cellSize >= 12) {
    drawPatternCellLabels(context, beadGrid, cellSize, paperLeft, paperTop, palette);
  }

  context.strokeStyle = "#8d806f";
  context.lineWidth = 2;
  context.strokeRect(paperLeft, paperTop, paperWidth, paperHeight);

  drawFormalPatternFooter(context, {
    beadGrid,
    colorStats,
    left: contentLeft,
    top: paperBottom + rulerSize + 12,
    width: infoWidth,
    height: footerHeight - 12,
    columns: legendColumns,
  });

  return canvas;
}

function createExportCanvas(logicalWidth: number, logicalHeight: number) {
  const canvas = document.createElement("canvas");
  const maxSide = Math.max(logicalWidth, logicalHeight);
  const safePixelRatio = clampNumber(
    Math.floor(Math.min(EXPORT_PIXEL_RATIO, MAX_EXPORT_BITMAP_SIDE / Math.max(1, maxSide)) * 100) / 100,
    1,
    EXPORT_PIXEL_RATIO,
  );

  canvas.width = Math.max(1, Math.round(logicalWidth * safePixelRatio));
  canvas.height = Math.max(1, Math.round(logicalHeight * safePixelRatio));

  const context = canvas.getContext("2d");
  if (context) {
    context.setTransform(safePixelRatio, 0, 0, safePixelRatio, 0, 0);
  }

  return {
    canvas,
    context,
  };
}

function drawPatternRulers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize: number,
  rulerSize: number,
  paperLeft: number,
  paperTop: number,
  paperRight: number,
  paperBottom: number,
) {
  const paperWidth = width * cellSize;
  const paperHeight = height * cellSize;

  context.fillStyle = "#f6f1e8";
  context.fillRect(paperLeft, paperTop - rulerSize, paperWidth, rulerSize);
  context.fillRect(paperLeft, paperBottom, paperWidth, rulerSize);
  context.fillRect(paperLeft - rulerSize, paperTop, rulerSize, paperHeight);
  context.fillRect(paperRight, paperTop, rulerSize, paperHeight);
  context.fillRect(paperLeft - rulerSize, paperTop - rulerSize, rulerSize, rulerSize);
  context.fillRect(paperRight, paperTop - rulerSize, rulerSize, rulerSize);
  context.fillRect(paperLeft - rulerSize, paperBottom, rulerSize, rulerSize);
  context.fillRect(paperRight, paperBottom, rulerSize, rulerSize);

  context.strokeStyle = "#d4c5b3";
  context.lineWidth = 1;
  context.strokeRect(paperLeft, paperTop - rulerSize, paperWidth, rulerSize);
  context.strokeRect(paperLeft, paperBottom, paperWidth, rulerSize);
  context.strokeRect(paperLeft - rulerSize, paperTop, rulerSize, paperHeight);
  context.strokeRect(paperRight, paperTop, rulerSize, paperHeight);

  context.fillStyle = "#5d5145";
  context.font = `${Math.max(10, Math.floor(cellSize * 0.5))}px "IBM Plex Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const columnMarkers = getGridCoordinateMarkers(width, cellSize);
  const rowMarkers = getGridCoordinateMarkers(height, cellSize);

  for (const marker of columnMarkers) {
    const centerX = paperLeft + marker.index * cellSize + cellSize / 2;
    const label = String(marker.label);
    context.fillText(label, centerX, paperTop - rulerSize / 2);
    context.fillText(label, centerX, paperBottom + rulerSize / 2);
  }

  for (const marker of rowMarkers) {
    const centerY = paperTop + marker.index * cellSize + cellSize / 2;
    const label = String(marker.label);
    context.fillText(label, paperLeft - rulerSize / 2, centerY);
    context.fillText(label, paperRight + rulerSize / 2, centerY);
  }
}

function drawPatternCells(
  context: CanvasRenderingContext2D,
  beadGrid: BeadGrid,
  cellSize: number,
  paperLeft: number,
  paperTop: number,
  palette: PaletteColor[],
) {
  for (let y = 0; y < beadGrid.height; y += 1) {
    for (let x = 0; x < beadGrid.width; x += 1) {
      const colorIndex = beadGrid.cells[y * beadGrid.width + x];
      if (colorIndex === EMPTY_CELL) {
        continue;
      }

      const color = palette[colorIndex] ?? palette[0];
      context.fillStyle = color.hex;
      context.fillRect(
        paperLeft + x * cellSize,
        paperTop + y * cellSize,
        cellSize,
        cellSize,
      );
    }
  }
}

function drawPatternGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize: number,
  paperLeft: number,
  paperTop: number,
) {
  const paperWidth = width * cellSize;
  const paperHeight = height * cellSize;

  context.save();
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += 1) {
    context.strokeStyle = x % 10 === 0 ? "#d89442" : "rgba(128, 117, 102, 0.38)";
    context.beginPath();
    context.moveTo(paperLeft + x * cellSize, paperTop);
    context.lineTo(paperLeft + x * cellSize, paperTop + paperHeight);
    context.stroke();
  }

  for (let y = 0; y <= height; y += 1) {
    context.strokeStyle = y % 10 === 0 ? "#d89442" : "rgba(128, 117, 102, 0.38)";
    context.beginPath();
    context.moveTo(paperLeft, paperTop + y * cellSize);
    context.lineTo(paperLeft + paperWidth, paperTop + y * cellSize);
    context.stroke();
  }

  context.restore();
}

function drawPatternCellLabels(
  context: CanvasRenderingContext2D,
  beadGrid: BeadGrid,
  cellSize: number,
  paperLeft: number,
  paperTop: number,
  palette: PaletteColor[],
) {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font =
    cellSize >= 24
      ? `${Math.floor(cellSize * 0.42)}px "IBM Plex Mono", monospace`
      : `${Math.max(8, Math.floor(cellSize * 0.48))}px "IBM Plex Mono", monospace`;

  for (let y = 0; y < beadGrid.height; y += 1) {
    for (let x = 0; x < beadGrid.width; x += 1) {
      const colorIndex = beadGrid.cells[y * beadGrid.width + x];
      if (colorIndex === EMPTY_CELL) {
        continue;
      }

      const color = palette[colorIndex] ?? palette[0];
      const label = color.id;

      context.fillStyle = getReadableTextColor(color.rgb);
      context.fillText(
        label,
        paperLeft + x * cellSize + cellSize / 2,
        paperTop + y * cellSize + cellSize / 2,
      );
    }
  }
}

function drawFormalPatternHeader(
  context: CanvasRenderingContext2D,
  options: {
    name: string;
    beadGrid: BeadGrid;
    colorStats: ReturnType<typeof buildColorStats>;
    left: number;
    top: number;
    width: number;
    height: number;
  },
) {
  const { name, beadGrid, colorStats, left, top, width, height } = options;
  const filledCount = colorStats.reduce((sum, item) => sum + item.count, 0);
  const generatedAt = new Date().toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  context.fillStyle = "rgba(255, 251, 246, 0.96)";
  context.fillRect(left, top, width, height);
  context.strokeStyle = "#d4c5b3";
  context.lineWidth = 1;
  context.strokeRect(left, top, width, height);

  context.fillStyle = "#3b342c";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = '700 24px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
  context.fillText(name, left + 18, top + 16);

  context.fillStyle = "#7a6c5b";
  context.font = '12px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
  context.fillText(
    `图纸 ${beadGrid.width} x ${beadGrid.height}  ·  用色 ${colorStats.length}  ·  实心 ${filledCount}  ·  导出 ${generatedAt}`,
    left + 18,
    top + 54,
  );

  context.strokeStyle = "rgba(141, 128, 111, 0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left + 18, top + 76);
  context.lineTo(left + width - 18, top + 76);
  context.stroke();

  const topColors = colorStats.slice(0, 3);
  if (topColors.length === 0) {
    return;
  }

  context.fillStyle = "#7a6c5b";
  context.font = '11px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
  context.fillText("主要颜色", left + 18, top + 90);

  topColors.forEach((item, index) => {
    const rowLeft = left + 88 + index * 164;
    const rowTop = top + 84;
    const swatchTop = rowTop + 5;
    const rowCenterY = rowTop + 13;
    context.fillStyle = item.color.hex;
    context.fillRect(rowLeft, swatchTop, 16, 16);
    context.strokeStyle = "rgba(38, 34, 28, 0.12)";
    context.strokeRect(rowLeft, swatchTop, 16, 16);
    context.fillStyle = "#3b342c";
    context.textBaseline = "middle";
    context.font = '600 11px "IBM Plex Mono", monospace';
    context.fillText(item.color.id, rowLeft + 24, rowCenterY);
    context.fillStyle = "#7a6c5b";
    context.font = '10px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
    context.fillText(`${item.color.name} · ${item.count}`, rowLeft + 58, rowCenterY);
    context.textBaseline = "top";
  });
}

function drawFormalPatternFooter(
  context: CanvasRenderingContext2D,
  options: {
    beadGrid: BeadGrid;
    colorStats: ReturnType<typeof buildColorStats>;
    left: number;
    top: number;
    width: number;
    height: number;
    columns: number;
  },
) {
  const { beadGrid, colorStats, left, top, width, height, columns } = options;
  const totalFilled = colorStats.reduce((sum, item) => sum + item.count, 0);
  const totalCells = beadGrid.width * beadGrid.height;

  context.fillStyle = "rgba(255, 251, 246, 0.96)";
  context.fillRect(left, top, width, height);
  context.strokeStyle = "#d4c5b3";
  context.lineWidth = 1;
  context.strokeRect(left, top, width, height);

  context.fillStyle = "#3b342c";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = '700 14px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
  context.fillText("颜色与统计", left + 16, top + 12);

  context.fillStyle = "#7a6c5b";
  context.font = '11px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
  context.fillText(
    `总格数 ${totalCells} / 实心格 ${totalFilled} / 空白格 ${totalCells - totalFilled}`,
    left + 16,
    top + 32,
  );

  context.strokeStyle = "rgba(141, 128, 111, 0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left + 16, top + 50);
  context.lineTo(left + width - 16, top + 50);
  context.stroke();

  const legendTop = top + 58;
  const legendWidth = width - 32;
  const columnGap = 12;
  const columnWidth = (legendWidth - columnGap * (columns - 1)) / columns;

  colorStats.forEach((item, index) => {
    const columnIndex = index % columns;
    const rowIndex = Math.floor(index / columns);
    const itemLeft = left + 16 + columnIndex * (columnWidth + columnGap);
    const itemTop = legendTop + rowIndex * EXPORT_LEGEND_ITEM_HEIGHT;
    const rowCenterY = itemTop + 17;

    if (rowIndex % 2 === 0) {
      context.fillStyle = "rgba(255, 253, 248, 0.72)";
      context.fillRect(itemLeft, itemTop, columnWidth, 34);
    }

    context.fillStyle = item.color.hex;
    context.fillRect(itemLeft + 10, itemTop + 10, 14, 14);
    context.strokeStyle = "rgba(38, 34, 28, 0.16)";
    context.strokeRect(itemLeft + 10, itemTop + 10, 14, 14);

    context.fillStyle = "#3b342c";
    context.textBaseline = "middle";
    context.font = '600 11px "IBM Plex Mono", monospace';
    context.fillText(item.color.id, itemLeft + 32, rowCenterY);

    context.fillStyle = "#7a6c5b";
    context.font = '10px "HarmonyOS Sans SC", "Noto Sans SC", sans-serif';
    context.fillText(item.color.name, itemLeft + 72, rowCenterY);
    context.textAlign = "right";
    context.fillText(
      `${item.count} / ${(item.ratio * 100).toFixed(1)}%`,
      itemLeft + columnWidth - 10,
      rowCenterY,
    );
    context.textAlign = "left";
    context.textBaseline = "top";

    context.strokeStyle = "rgba(212, 197, 179, 0.42)";
    context.beginPath();
    context.moveTo(itemLeft, itemTop + 34);
    context.lineTo(itemLeft + columnWidth, itemTop + 34);
    context.stroke();
  });
}

function getLegendColumnCount(legendWidth: number, colorCount: number) {
  if (colorCount <= 4) {
    return 1;
  }

  if (legendWidth >= 860 && colorCount > 10) {
    return 3;
  }

  if (legendWidth >= 560 && colorCount > 5) {
    return 2;
  }

  return 1;
}


function getReadableTextColor(rgb: [number, number, number]) {
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return luminance >= 160 ? "#42372f" : "#fffaf3";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = src;
  });
}

function renderSourceToSampleSurface(options: {
  canvas: CanvasSize;
  image: HTMLImageElement;
  imageTransform: ViewTransform;
}) {
  // Match the reference worker's native-image sampling density while retaining
  // this editor's canvas-aspect crop and positioning controls.
  const nativeScaleFactor = Math.max(
    options.image.width / options.canvas.width,
    options.image.height / options.canvas.height,
  );
  const safeScaleFactor = Math.min(
    nativeScaleFactor,
    MAX_SAMPLE_BITMAP_SIDE / options.canvas.width,
    MAX_SAMPLE_BITMAP_SIDE / options.canvas.height,
    Math.sqrt(
      MAX_SAMPLE_BITMAP_PIXELS / (options.canvas.width * options.canvas.height),
    ),
  );
  const scaleFactor = Math.max(Number.EPSILON, safeScaleFactor);
  const sampleWidth = Math.max(1, Math.round(options.canvas.width * scaleFactor));
  const sampleHeight = Math.max(1, Math.round(options.canvas.height * scaleFactor));
  const offscreen = document.createElement("canvas");
  offscreen.width = sampleWidth;
  offscreen.height = sampleHeight;
  const context = offscreen.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("无法初始化图像采样画布。");
  }

  context.clearRect(0, 0, offscreen.width, offscreen.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const baseScale = Math.min(
    offscreen.width / options.image.width,
    offscreen.height / options.image.height,
  );
  const drawWidth = options.image.width * baseScale * options.imageTransform.scale;
  const drawHeight = options.image.height * baseScale * options.imageTransform.scale;
  const drawX =
    (offscreen.width - drawWidth) / 2 + options.imageTransform.offsetX * scaleFactor;
  const drawY =
    (offscreen.height - drawHeight) / 2 + options.imageTransform.offsetY * scaleFactor;

  context.drawImage(options.image, drawX, drawY, drawWidth, drawHeight);

  return {
    scaleFactor,
    imageData: context.getImageData(0, 0, offscreen.width, offscreen.height),
  };
}

export function replaceEdgeColor(
  beadGrid: BeadGrid | null,
  fromColorIndex: number,
  toColorIndex: number,
  palette: PaletteColor[],
) {
  if (!beadGrid || fromColorIndex < 0 || toColorIndex < 0 || fromColorIndex === toColorIndex) {
    return beadGrid;
  }

  const nextCells = new Uint16Array(beadGrid.cells);
  let changed = false;
  const { width, height } = beadGrid;
  const exteriorMask = buildExteriorEmptyMask(beadGrid, palette);
  const edgeBandMask = buildEdgeBandMask(beadGrid, exteriorMask, 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (nextCells[index] !== fromColorIndex) {
        continue;
      }

      const neighborhood = collectNeighborColors(nextCells, width, height, x, y);
      const sameColorCount = neighborhood.filter((colorIndex) => colorIndex === fromColorIndex).length;
      const touchesExterior = touchesExteriorMask(width, height, x, y, exteriorMask);
      const insideEdgeBand = edgeBandMask[index] === 1;

      if ((touchesExterior || insideEdgeBand) && sameColorCount <= 4) {
        nextCells[index] = toColorIndex;
        changed = true;
      }
    }
  }

  if (!changed) {
    return beadGrid;
  }

  return {
    ...beadGrid,
    cells: nextCells,
  };
}

function buildExteriorEmptyMask(beadGrid: BeadGrid, palette: PaletteColor[]) {
  const { width, height, cells } = beadGrid;
  const mask = new Uint8Array(width * height);
  const queue: number[] = [];
  const borderBackgroundColorIndex = findConnectedBorderBackgroundColor(beadGrid, palette);

  function enqueue(index: number) {
    if (index < 0 || index >= cells.length || mask[index]) {
      return;
    }

    const colorIndex = cells[index];
    const isExterior =
      colorIndex === EMPTY_CELL ||
      (borderBackgroundColorIndex !== null && colorIndex === borderBackgroundColorIndex);

    if (!isExterior) {
      return;
    }

    mask[index] = 1;
    queue.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return mask;
}

function buildEdgeBandMask(
  beadGrid: BeadGrid,
  exteriorMask: Uint8Array,
  depth: number,
) {
  const { width, height, cells } = beadGrid;
  const mask = new Uint8Array(width * height);
  const distance = new Int16Array(width * height);
  distance.fill(-1);
  const queue: number[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index] === EMPTY_CELL) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);

    if (touchesExteriorMask(width, height, x, y, exteriorMask)) {
      mask[index] = 1;
      distance[index] = 0;
      queue.push(index);
    }
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    const currentDistance = distance[index];
    if (currentDistance >= depth - 1) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;

    for (const [nextX, nextY] of neighbors) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }

      const nextIndex = nextY * width + nextX;
      if (cells[nextIndex] === EMPTY_CELL || distance[nextIndex] !== -1) {
        continue;
      }

      distance[nextIndex] = currentDistance + 1;
      mask[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }

  return mask;
}

function touchesExteriorMask(
  width: number,
  height: number,
  x: number,
  y: number,
  exteriorMask: Uint8Array,
) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        return true;
      }

      if (exteriorMask[nextY * width + nextX]) {
        return true;
      }
    }
  }

  return false;
}

function collectNeighborColors(
  cells: Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const neighbors: number[] = [];
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
        neighbors.push(EMPTY_CELL);
        continue;
      }
      neighbors.push(cells[nextY * width + nextX]);
    }
  }
  return neighbors;
}

function sampleGridFromImageData(options: {
  canvas: CanvasSize;
  imageData: ImageData;
}) {
  const { canvas, imageData } = options;
  const samples = new Array<
    | {
        r: number;
        g: number;
        b: number;
        a: number;
      }
    | null
  >(canvas.width * canvas.height).fill(null);

  const cellWidth = imageData.width / canvas.width;
  const cellHeight = imageData.height / canvas.height;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const startX = Math.floor(x * cellWidth);
      const endX = Math.min(imageData.width, Math.ceil((x + 1) * cellWidth));
      const startY = Math.floor(y * cellHeight);
      const endY = Math.min(imageData.height, Math.ceil((y + 1) * cellHeight));

      let visiblePixelCount = 0;
      let dominantColor = 0;
      let dominantCount = 0;
      const histogram = new Map<number, number>();

      for (let sampleY = startY; sampleY < endY; sampleY += 1) {
        for (let sampleX = startX; sampleX < endX; sampleX += 1) {
          const offset = (sampleY * imageData.width + sampleX) * 4;
          const alpha = imageData.data[offset + 3];
          if (alpha < MIN_VISIBLE_ALPHA) {
            continue;
          }

          const r = imageData.data[offset];
          const g = imageData.data[offset + 1];
          const b = imageData.data[offset + 2];
          visiblePixelCount += 1;
          const packedColor = (r << 16) | (g << 8) | b;
          const count = (histogram.get(packedColor) ?? 0) + 1;
          histogram.set(packedColor, count);
          if (count > dominantCount) {
            dominantColor = packedColor;
            dominantCount = count;
          }
        }
      }

      const index = y * canvas.width + x;

      if (visiblePixelCount === 0) {
        samples[index] = null;
        continue;
      }

      samples[index] = {
        r: (dominantColor >> 16) & 255,
        g: (dominantColor >> 8) & 255,
        b: dominantColor & 255,
        a: 1,
      };
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
    samples,
  };
}

function quantizeNearest(
  sampledGrid: {
    width: number;
    height: number;
    samples: Array<{ r: number; g: number; b: number; a: number } | null>;
  },
  enabledPaletteIndices: number[],
  palette: PaletteColor[],
): BeadGrid {
  const cells = new Uint16Array(sampledGrid.width * sampledGrid.height);
  const paletteOklab = palette.map((color) => rgbToOklab(color.rgb));
  const nearestColorCache = new Map<number, number>();

  for (let index = 0; index < sampledGrid.samples.length; index += 1) {
    const sample = sampledGrid.samples[index];
    if (!sample) {
      cells[index] = EMPTY_CELL;
      continue;
    }

    const packedColor = (sample.r << 16) | (sample.g << 8) | sample.b;
    const cachedIndex = nearestColorCache.get(packedColor);
    if (cachedIndex !== undefined) {
      cells[index] = cachedIndex;
      continue;
    }

    const colorIndex = findNearestPaletteIndex(
      sample.r,
      sample.g,
      sample.b,
      enabledPaletteIndices,
      paletteOklab,
    );
    nearestColorCache.set(packedColor, colorIndex);
    cells[index] = colorIndex;
  }

  return {
    width: sampledGrid.width,
    height: sampledGrid.height,
    cells,
  };
}

function mergeNearDuplicatePaletteColors(
  beadGrid: BeadGrid,
  enabledPaletteIndices: number[],
  palette: PaletteColor[],
) {
  const usageCounts = new Map<number, number>();
  for (const colorIndex of beadGrid.cells) {
    if (colorIndex !== EMPTY_CELL) {
      usageCounts.set(colorIndex, (usageCounts.get(colorIndex) ?? 0) + 1);
    }
  }

  const usedIndices = Array.from(usageCounts.keys()).sort(
    (left, right) => (usageCounts.get(right) ?? 0) - (usageCounts.get(left) ?? 0),
  );
  const enabledSet = new Set(enabledPaletteIndices);
  const paletteOklab = palette.map((color) => rgbToOklab(color.rgb));
  const replacement = new Map<number, number>();
  const removed = new Set<number>();

  for (let leftPosition = 0; leftPosition < usedIndices.length; leftPosition += 1) {
    const targetIndex = usedIndices[leftPosition];
    if (removed.has(targetIndex) || !enabledSet.has(targetIndex)) {
      continue;
    }

    for (
      let rightPosition = leftPosition + 1;
      rightPosition < usedIndices.length;
      rightPosition += 1
    ) {
      const sourceIndex = usedIndices[rightPosition];
      if (removed.has(sourceIndex) || !enabledSet.has(sourceIndex)) {
        continue;
      }

      if (
        oklabDistance(paletteOklab[targetIndex], paletteOklab[sourceIndex]) <
        NEAR_DUPLICATE_DELTA_E
      ) {
        removed.add(sourceIndex);
        replacement.set(sourceIndex, targetIndex);
      }
    }
  }

  if (replacement.size === 0) {
    return beadGrid;
  }

  const cells = new Uint16Array(beadGrid.cells);
  for (let index = 0; index < cells.length; index += 1) {
    cells[index] = replacement.get(cells[index]) ?? cells[index];
  }

  return { ...beadGrid, cells };
}

function reducePaletteColorsBySimilarity(
  usageCounts: Map<number, number>,
  targetColorCount: number,
  palette: PaletteColor[],
) {
  const paletteLab = palette.map((color) => rgbToLab(color.rgb));
  const clusters: PaletteCluster[] = Array.from(usageCounts.entries())
    .map(([representativeIndex, count]) => ({
      representativeIndex,
      count,
      members: [representativeIndex],
    }))
    .sort((left, right) => left.representativeIndex - right.representativeIndex);

  while (clusters.length > targetColorCount) {
    let bestLeftPosition = 0;
    let bestRightPosition = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestCombinedCount = Number.POSITIVE_INFINITY;
    let bestPairOrder: [number, number] = [
      clusters[0].representativeIndex,
      clusters[1].representativeIndex,
    ];

    for (let leftPosition = 0; leftPosition < clusters.length - 1; leftPosition += 1) {
      for (let rightPosition = leftPosition + 1; rightPosition < clusters.length; rightPosition += 1) {
        const leftCluster = clusters[leftPosition];
        const rightCluster = clusters[rightPosition];
        const distance = labDistanceSquared(
          paletteLab[leftCluster.representativeIndex],
          paletteLab[rightCluster.representativeIndex],
        );
        const combinedCount = leftCluster.count + rightCluster.count;
        const pairOrder: [number, number] = [
          Math.min(leftCluster.representativeIndex, rightCluster.representativeIndex),
          Math.max(leftCluster.representativeIndex, rightCluster.representativeIndex),
        ];

        if (
          distance < bestDistance - COLOR_DISTANCE_EPSILON ||
          (Math.abs(distance - bestDistance) <= COLOR_DISTANCE_EPSILON &&
            (combinedCount < bestCombinedCount ||
              (combinedCount === bestCombinedCount &&
                comparePalettePairOrder(pairOrder, bestPairOrder) < 0)))
        ) {
          bestLeftPosition = leftPosition;
          bestRightPosition = rightPosition;
          bestDistance = distance;
          bestCombinedCount = combinedCount;
          bestPairOrder = pairOrder;
        }
      }
    }

    const leftCluster = clusters[bestLeftPosition];
    const rightCluster = clusters[bestRightPosition];
    const targetPosition =
      leftCluster.count > rightCluster.count ||
      (leftCluster.count === rightCluster.count &&
        leftCluster.representativeIndex < rightCluster.representativeIndex)
        ? bestLeftPosition
        : bestRightPosition;
    const sourcePosition = targetPosition === bestLeftPosition ? bestRightPosition : bestLeftPosition;
    const targetCluster = clusters[targetPosition];
    const sourceCluster = clusters[sourcePosition];

    targetCluster.count += sourceCluster.count;
    targetCluster.members.push(...sourceCluster.members);
    clusters.splice(sourcePosition, 1);
  }

  const representativeByIndex = new Map<number, number>();

  for (const cluster of clusters) {
    for (const memberIndex of cluster.members) {
      representativeByIndex.set(memberIndex, cluster.representativeIndex);
    }
  }

  return {
    representativeByIndex,
  };
}

function comparePalettePairOrder(left: [number, number], right: [number, number]) {
  return left[0] - right[0] || left[1] - right[1];
}

function labDistanceSquared(left: LabColor, right: LabColor) {
  const deltaLightness = left.lightness - right.lightness;
  const deltaGreenRed = left.greenRed - right.greenRed;
  const deltaBlueYellow = left.blueYellow - right.blueYellow;

  return (
    deltaLightness * deltaLightness +
    deltaGreenRed * deltaGreenRed +
    deltaBlueYellow * deltaBlueYellow
  );
}

function rgbToLab(rgb: [number, number, number]): LabColor {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
  const transform = (value: number) =>
    value > 0.008856451679035631
      ? Math.cbrt(value)
      : 7.787037037037037 * value + 16 / 116;
  const transformedX = transform(x);
  const transformedY = transform(y);
  const transformedZ = transform(z);

  return {
    lightness: 116 * transformedY - 16,
    greenRed: 500 * (transformedX - transformedY),
    blueYellow: 200 * (transformedY - transformedZ),
  };
}

function findNearestPaletteIndex(
  red: number,
  green: number,
  blue: number,
  enabledPaletteIndices: number[],
  paletteOklab: OklabColor[],
) {
  const sampleOklab = rgbToOklab([red, green, blue]);
  let bestIndex = enabledPaletteIndices[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const index of enabledPaletteIndices) {
    const distance = oklabDistanceSquared(sampleOklab, paletteOklab[index]);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function rgbToOklab(rgb: [number, number, number]): OklabColor {
  const [red, green, blue] = rgb.map(srgbChannelToLinear);
  const x = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const y = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const z = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const cubeRootX = Math.cbrt(x);
  const cubeRootY = Math.cbrt(y);
  const cubeRootZ = Math.cbrt(z);

  return {
    lightness:
      0.2104542553 * cubeRootX +
      0.793617785 * cubeRootY -
      0.0040720468 * cubeRootZ,
    greenRed:
      1.9779984951 * cubeRootX -
      2.428592205 * cubeRootY +
      0.4505937099 * cubeRootZ,
    blueYellow:
      0.0259040371 * cubeRootX +
      0.7827717662 * cubeRootY -
      0.808675766 * cubeRootZ,
  };
}

function srgbChannelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function oklabDistanceSquared(left: OklabColor, right: OklabColor) {
  const deltaLightness = left.lightness - right.lightness;
  const deltaGreenRed = left.greenRed - right.greenRed;
  const deltaBlueYellow = left.blueYellow - right.blueYellow;
  return (
    deltaLightness * deltaLightness +
    deltaGreenRed * deltaGreenRed +
    deltaBlueYellow * deltaBlueYellow
  );
}

function oklabDistance(left: OklabColor, right: OklabColor) {
  return Math.sqrt(oklabDistanceSquared(left, right)) * 100;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
