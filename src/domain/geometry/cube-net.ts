export type Cell = readonly [number, number];
export const CUBE_NET_PATTERNS = {
  cross: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [0, 2]],
  zigzag: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, -1]],
  strip: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
  twin: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]
} as const satisfies Record<string, readonly Cell[]>;

type Vec = readonly [number, number, number];
interface Orientation { normal: Vec; right: Vec; down: Vec; }
const NEG = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
const SAME = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function neighbor(orientation: Orientation, dx: number, dy: number): Orientation {
  if (dx === 1) return { normal: orientation.right, right: NEG(orientation.normal), down: orientation.down };
  if (dx === -1) return { normal: NEG(orientation.right), right: orientation.normal, down: orientation.down };
  if (dy === 1) return { normal: orientation.down, right: orientation.right, down: NEG(orientation.normal) };
  return { normal: NEG(orientation.down), right: orientation.right, down: orientation.normal };
}

export function isValidCubeNetCells(cells: readonly Cell[]): boolean {
  if (cells.length !== 6) return false;
  const keys = new Set(cells.map(cell => cell.join(',')));
  if (keys.size !== 6) return false;
  const start = cells[0];
  const orientations = new Map<string, Orientation>([[start.join(','), { normal: [0, 0, 1], right: [1, 0, 0], down: [0, 1, 0] }]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cell = queue.shift()!;
    const orientation = orientations.get(cell.join(','))!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: Cell = [cell[0] + dx, cell[1] + dy];
      const key = next.join(',');
      if (!keys.has(key)) continue;
      const nextOrientation = neighbor(orientation, dx, dy);
      const previous = orientations.get(key);
      if (previous) {
        if (!SAME(previous.normal, nextOrientation.normal) || !SAME(previous.right, nextOrientation.right) || !SAME(previous.down, nextOrientation.down)) return false;
      } else {
        orientations.set(key, nextOrientation);
        queue.push(next);
      }
    }
  }
  return orientations.size === 6 && new Set([...orientations.values()].map(orientation => orientation.normal.join(','))).size === 6;
}

export function isValidCubeNetPattern(pattern: string | undefined): boolean {
  return pattern ? isValidCubeNetCells(CUBE_NET_PATTERNS[pattern as keyof typeof CUBE_NET_PATTERNS] ?? []) : false;
}
