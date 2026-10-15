// Planar homographies. Pure functions only (no DOM).
// A homography is a flat array of 9 numbers, row-major, mapping [x, y] to
// [(h0 x + h1 y + h2) / w, (h3 x + h4 y + h5) / w] with w = h6 x + h7 y + h8.

export function applyH(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function multiplyH(A, B) {
  const C = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
    }
  }
  return C;
}

export function invertH(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Singular homography');
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  return normalise(inv.map((v) => v / det));
}

function normalise(H) {
  const s = H[8] !== 0 ? H[8] : 1;
  return H.map((v) => v / s);
}

// Similarity that moves points to their centroid and scales them to an
// average distance of sqrt(2) from it (Hartley normalisation).
function conditioner(points) {
  let mx = 0, my = 0;
  for (const [x, y] of points) { mx += x; my += y; }
  mx /= points.length; my /= points.length;
  let d = 0;
  for (const [x, y] of points) d += Math.hypot(x - mx, y - my);
  d /= points.length;
  const s = d > 0 ? Math.SQRT2 / d : 1;
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}

// Solve the n x n system M x = v in place (Gaussian elimination, partial pivoting).
function solve(M, v) {
  const n = v.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('Degenerate points');
    [M[col], M[piv]] = [M[piv], M[col]];
    [v[col], v[piv]] = [v[piv], v[col]];
    for (let r = col + 1; r < n; r++) {
      const k = M[r][col] / M[col][col];
      for (let c = col; c < n; c++) M[r][c] -= k * M[col][c];
      v[r] -= k * v[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = v[r];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// Least-squares homography mapping src[i] to dst[i] (at least 4 pairs, no
// three of the first four collinear). Normalised DLT with h8 fixed to 1.
export function solveHomography(src, dst) {
  if (src.length < 4 || src.length !== dst.length) throw new Error('Need at least 4 point pairs');
  const Ts = conditioner(src), Td = conditioner(dst);
  const s = src.map((p) => applyH(Ts, p));
  const d = dst.map((p) => applyH(Td, p));
  // Normal equations A^T A h = A^T b for the 8 unknowns.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const add = (row, b) => {
    for (let r = 0; r < 8; r++) {
      Atb[r] += row[r] * b;
      for (let c = 0; c < 8; c++) AtA[r][c] += row[r] * row[c];
    }
  };
  for (let i = 0; i < s.length; i++) {
    const [x, y] = s[i], [u, v] = d[i];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(AtA, Atb);
  const Hn = [...h, 1];
  return normalise(multiplyH(invertH(Td), multiplyH(Hn, Ts)));
}

// Root-mean-square distance between H(src[i]) and dst[i].
export function rmsError(H, src, dst) {
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const [x, y] = applyH(H, src[i]);
    sum += (x - dst[i][0]) ** 2 + (y - dst[i][1]) ** 2;
  }
  return Math.sqrt(sum / src.length);
}

function fitGroups(groups) {
  return solveHomography(groups.flatMap((g) => g.src), groups.flatMap((g) => g.dst));
}

// Fit from groups of point pairs (one group per marker). A bad group can pull
// a joint fit towards itself, so each group is judged by a fit of all the
// others (leave one out); the worst is dropped while it is clearly off.
// Returns { H, kept, dropped, error }.
// groups: [{ key, src: [[x, y]...], dst: [[x, y]...] }]
export function fitRobust(groups, { tolerance = 3, minGroups = 2 } = {}) {
  let kept = [...groups];
  const dropped = [];
  while (kept.length > minGroups) {
    let worst = -1, worstErr = tolerance;
    kept.forEach((g, i) => {
      let err;
      try {
        err = rmsError(fitGroups(kept.filter((_, j) => j !== i)), g.src, g.dst);
      } catch {
        return;
      }
      if (err > worstErr) { worst = i; worstErr = err; }
    });
    if (worst < 0) break;
    dropped.push(kept[worst]);
    kept = kept.filter((_, i) => i !== worst);
  }
  const H = fitGroups(kept);
  return { H, kept, dropped, error: rmsError(H, kept.flatMap((g) => g.src), kept.flatMap((g) => g.dst)) };
}
