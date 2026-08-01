export type GridCoordinateMarker = {
  index: number;
  label: number;
};

const COORDINATE_INTERVALS = [1, 2, 5, 10, 15, 20, 25, 50, 100];
const MIN_COORDINATE_CELL_SIZE = 2.5;
const MIN_LABEL_SPACING = 28;

export function getGridCoordinateMarkers(
  size: number,
  visibleCellSize: number,
  start = 1,
  minimumInterval = 1,
): GridCoordinateMarker[] {
  if (visibleCellSize < MIN_COORDINATE_CELL_SIZE) {
    return [];
  }

  const normalizedSize = Math.max(1, Math.round(size));
  const lastLabel = start + normalizedSize - 1;
  const digitCount = Math.max(String(start).length, String(lastLabel).length);
  const requiredInterval = Math.max(MIN_LABEL_SPACING, digitCount * 7 + 6) / visibleCellSize;
  const fittedInterval =
    COORDINATE_INTERVALS.find((interval) => interval >= requiredInterval) ??
    COORDINATE_INTERVALS[COORDINATE_INTERVALS.length - 1];
  const interval = Math.max(1, Math.round(minimumInterval), fittedInterval);
  const markers: GridCoordinateMarker[] = [];

  for (let index = 0; index < normalizedSize; index += 1) {
    const label = start + index;
    if (index === 0 || label % interval === 0) {
      markers.push({ index, label });
    }
  }

  const lastIndex = normalizedSize - 1;
  if (markers[markers.length - 1]?.index !== lastIndex) {
    const previous = markers[markers.length - 1];
    if (previous && previous.index !== 0 && lastIndex - previous.index < interval) {
      markers.pop();
    }
    markers.push({ index: lastIndex, label: lastLabel });
  }

  return markers;
}

export function getGridCoordinateMargin(size: number, start = 1) {
  const normalizedSize = Math.max(1, Math.round(size));
  const lastLabel = start + normalizedSize - 1;
  const digitCount = Math.max(String(start).length, String(lastLabel).length);
  return Math.max(22, digitCount * 7 + 8);
}
