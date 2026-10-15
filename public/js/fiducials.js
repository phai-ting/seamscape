// Calibration markers: an ArUco-style dictionary and where markers sit on a
// screen. Pure functions only (no DOM), shared by the desktop pattern and the
// phone detector so both sides agree on every id and corner.
//
// A marker is a 6 x 6 grid of cells: a black border ring around 4 x 4 data
// bits (1 = black). Corners are listed clockwise from the marker's top-left,
// in screen pixels (y down).

export const MAX_MONITORS = 8;
export const MARKERS_PER_SCREEN = 8;
export const GRID = 6;

// 64 codes, 16 bits each (bit r*4+c is inner cell r, c). Chosen so every pair
// differs in at least 4 bits under any rotation, and no code is within 4 bits
// of its own rotations, so a marker can never be read at the wrong turn.
// QR finder patterns (a rotationally symmetric ring) can never match.
export const CODES = [
  0x03d6, 0x5583, 0xe84a, 0x3571, 0xf56e, 0x262d, 0x0d41, 0x6d1b,
  0x8c75, 0x56b6, 0x8c0b, 0x55de, 0xc88e, 0x0163, 0x4c11, 0xf653,
  0xc90d, 0x95e3, 0x6a2c, 0x9316, 0xa3f8, 0x2d83, 0x3d96, 0x51e9,
  0xed51, 0x0591, 0x38d1, 0x0afd, 0xb159, 0x08b1, 0x4566, 0x4a55,
  0xb707, 0x38f6, 0x4c7b, 0xccf2, 0x00d9, 0x9127, 0x598c, 0x1f76,
  0xad8d, 0x63b6, 0x2905, 0xefe2, 0x45cd, 0xfa05, 0x146e, 0x4229,
  0x2d77, 0xa8be, 0x9755, 0x5ae6, 0x89c3, 0xa881, 0xebec, 0x570d,
  0x279b, 0x7a79, 0xfb96, 0x348d, 0x07eb, 0xeca3, 0x1186, 0x04d4,
];

const BY_CODE = new Map(CODES.map((c, id) => [c, id]));

// Marker positions on a screen: four corners, then the middle of each edge.
export const POSITIONS = ['top-left', 'top-right', 'bottom-right', 'bottom-left', 'top', 'right', 'bottom', 'left'];

export function markerId(n, pos) {
  return (n - 1) * MARKERS_PER_SCREEN + pos;
}

export function markerOwner(id) {
  return { n: Math.floor(id / MARKERS_PER_SCREEN) + 1, pos: id % MARKERS_PER_SCREEN };
}

// 6 x 6 cells, row-major, 1 = black.
export function markerGrid(id) {
  const code = CODES[id];
  const g = [];
  for (let r = 0; r < GRID; r++) {
    const row = [];
    for (let c = 0; c < GRID; c++) {
      const border = r === 0 || c === 0 || r === GRID - 1 || c === GRID - 1;
      row.push(border ? 1 : (code >> ((r - 1) * 4 + (c - 1))) & 1);
    }
    g.push(row);
  }
  return g;
}

// The grid as sampled from the next corner clockwise: T[r][c] = G[c][5 - r].
function turn(g) {
  return g.map((row, r) => row.map((_, c) => g[c][GRID - 1 - r]));
}

// Read a sampled 6 x 6 grid. Returns { id, start } where start is the index of
// the sampled corner that is the marker's real top-left, or null.
export function decodeGrid(grid) {
  for (let i = 0; i < GRID; i++) {
    if (!grid[0][i] || !grid[GRID - 1][i] || !grid[i][0] || !grid[i][GRID - 1]) return null;
  }
  let g = grid;
  for (let start = 0; start < 4; start++) {
    let code = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (g[r + 1][c + 1]) code |= 1 << (r * 4 + c);
    const id = BY_CODE.get(code);
    if (id !== undefined) return { id, start };
    g = turn(g);
  }
  return null;
}

// Where the markers go on a w x h screen, in that screen's native pixels.
// Cells scale with the shorter side, so markers are about the same physical
// size on every monitor. inset is the white margin between the lit edge and
// each marker; content is the free middle area for the number and QR code.
export function markerLayout(w, h) {
  const cell = Math.max(6, Math.round(Math.min(w, h) / 40));
  const size = GRID * cell;
  const inset = 2 * cell;
  const xs = [inset, Math.round((w - size) / 2), w - inset - size];
  const ys = [inset, Math.round((h - size) / 2), h - inset - size];
  // [column, row] into xs/ys for each position in POSITIONS.
  const at = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 0], [2, 1], [1, 2], [0, 1]];
  const markers = at.map(([cx, cy], pos) => {
    const x = xs[cx], y = ys[cy];
    return { pos, x, y, corners: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]] };
  });
  const pad = inset + size + 2 * cell;
  return { cell, size, inset, markers, content: { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad } };
}
