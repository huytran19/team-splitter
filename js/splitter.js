/* =========================================================
   splitter.js — Logic chia đội có ràng buộc
   ---------------------------------------------------------
   - pairs  : hai người BẮT BUỘC cùng đội
   - rivals : hai người BẮT BUỘC khác đội
   Thuật toán:
     1. Union-Find gộp các "pair" thành nhóm dính liền.
     2. Dựng đồ thị "rival" giữa các nhóm → tô 2 màu (bipartite check).
     3. Mỗi thành phần liên thông cho 2 lựa chọn (lật màu hay không).
     4. DP subset-sum để chọn tổ hợp sao cho sĩ số đội 1 = mục tiêu,
        truy vết ngược có random hoá → kết quả vẫn ngẫu nhiên thật sự.
   ========================================================= */

/* ---------- tiện ích ---------- */

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- roster ---------- */

/** Tạo danh sách người chơi từ số lượng. */
export function rosterFromCount(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i, name: `Người ${i + 1}` }));
}

/** Tạo danh sách người chơi từ text (xuống dòng hoặc dấu phẩy). */
export function rosterFromText(text) {
  const raw = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Map();
  return raw.map((name, i) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return { id: i, name: count > 1 ? `${name} (${count})` : name };
  });
}

/* ---------- union-find ---------- */

class DSU {
  constructor(n) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    this.p[rb] = ra;
    return true;
  }
}

/* ---------- thuật toán chính ---------- */

/**
 * @param {Array<{id:number,name:string}>} roster
 * @param {Array<[number,number]>} pairs   cùng đội
 * @param {Array<[number,number]>} rivals  khác đội
 * @param {'auto'|'a'|'b'} biggerSide      đội nào đông hơn khi lẻ
 * @returns {{ok:boolean, teams?:[Array,Array], error?:string, warnings:string[]}}
 */
export function splitTeams(roster, pairs = [], rivals = [], biggerSide = 'auto') {
  const warnings = [];
  const n = roster.length;

  if (n < 2) return { ok: false, error: 'Cần ít nhất 2 người để chia đội.', warnings };

  const nameOf = (id) => roster.find((p) => p.id === id)?.name ?? `#${id}`;
  const index = new Map(roster.map((p, i) => [p.id, i]));

  /* --- 1. gộp nhóm bằng pairs --- */
  const dsu = new DSU(n);
  for (const [a, b] of pairs) {
    const ia = index.get(a), ib = index.get(b);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    dsu.union(ia, ib);
  }

  const groupOf = new Array(n);
  const groups = [];          // groups[g] = [chỉ số người]
  const rootToGroup = new Map();
  for (let i = 0; i < n; i++) {
    const r = dsu.find(i);
    if (!rootToGroup.has(r)) { rootToGroup.set(r, groups.length); groups.push([]); }
    const g = rootToGroup.get(r);
    groupOf[i] = g;
    groups[g].push(i);
  }

  const halfBig = Math.ceil(n / 2);

  // nhóm quá to thì không thể nhét vừa đội nào
  const oversized = groups.find((g) => g.length > halfBig);
  if (oversized) {
    return {
      ok: false,
      warnings,
      error: `Nhóm đi chung có ${oversized.length} người (${oversized.map((i) => nameOf(roster[i].id)).join(', ')}) — vượt quá sức chứa tối đa ${halfBig} người của một đội.`,
    };
  }

  /* --- 2. đồ thị rival giữa các nhóm --- */
  const adj = Array.from({ length: groups.length }, () => []);
  for (const [a, b] of rivals) {
    const ia = index.get(a), ib = index.get(b);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    const ga = groupOf[ia], gb = groupOf[ib];
    if (ga === gb) {
      return {
        ok: false,
        warnings,
        error: `Mâu thuẫn: ${nameOf(roster[ia].id)} và ${nameOf(roster[ib].id)} vừa bị buộc cùng đội (qua ghép cặp) vừa bị buộc khác đội.`,
      };
    }
    adj[ga].push(gb);
    adj[gb].push(ga);
  }

  /* --- 3. tô 2 màu từng thành phần liên thông --- */
  const color = new Array(groups.length).fill(-1);
  /** components[i] = { side0:[groupIds], side1:[groupIds], size0, size1 } */
  const components = [];

  for (let g = 0; g < groups.length; g++) {
    if (color[g] !== -1) continue;

    const side0 = [], side1 = [];
    const queue = [g];
    color[g] = 0;

    while (queue.length) {
      const cur = queue.shift();
      (color[cur] === 0 ? side0 : side1).push(cur);
      for (const nb of adj[cur]) {
        if (color[nb] === -1) { color[nb] = 1 - color[cur]; queue.push(nb); }
        else if (color[nb] === color[cur]) {
          return {
            ok: false,
            warnings,
            error: `Ràng buộc "khác đội" tạo thành vòng lặp không thể thoả mãn (ví dụ A≠B, B≠C, C≠A). Hãy bớt một cặp kỵ nhau.`,
          };
        }
      }
    }

    const size = (side) => side.reduce((s, gi) => s + groups[gi].length, 0);
    components.push({ side0, side1, size0: size(side0), size1: size(side1) });
  }

  /* --- 4. DP subset-sum để đạt sĩ số mong muốn --- */

  // Xáo trộn để kết quả đa dạng giữa các lần chia
  const items = shuffle(components);

  // reach[i] = tập sĩ số đội A có thể đạt sau i item đầu
  const reach = [new Set([0])];
  for (const it of items) {
    const prev = reach[reach.length - 1];
    const next = new Set();
    for (const s of prev) {
      next.add(s + it.size0);   // side0 → đội A
      next.add(s + it.size1);   // side1 → đội A (lật)
    }
    reach.push(next);
  }

  const finalSums = [...reach[items.length]];

  // Mục tiêu sĩ số đội A
  const wantBigA =
    biggerSide === 'a' ? true :
    biggerSide === 'b' ? false :
    Math.random() < 0.5;

  const targetA = wantBigA ? halfBig : n - halfBig;

  // chọn sum khả thi gần target nhất
  let best = finalSums[0];
  let bestDist = Infinity;
  for (const s of finalSums) {
    const d = Math.abs(s - targetA);
    if (d < bestDist) { bestDist = d; best = s; }
    else if (d === bestDist && Math.random() < 0.5) { best = s; }
  }

  if (bestDist > 0) {
    const gap = Math.abs(best - (n - best));
    warnings.push(
      `Với ràng buộc hiện tại không thể chia đều tuyệt đối — kết quả lệch ${gap} người (${best} vs ${n - best}).`
    );
  }

  /* --- truy vết ngược, random khi có nhiều lựa chọn --- */
  const assign = new Array(groups.length).fill(null);
  let remain = best;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const prev = reach[i];
    const options = [];
    if (prev.has(remain - it.size0)) options.push(0);
    if (prev.has(remain - it.size1)) options.push(1);

    const chosen = options.length ? pick(options) : 0;
    if (chosen === 0) {
      it.side0.forEach((g) => (assign[g] = 'A'));
      it.side1.forEach((g) => (assign[g] = 'B'));
      remain -= it.size0;
    } else {
      it.side1.forEach((g) => (assign[g] = 'A'));
      it.side0.forEach((g) => (assign[g] = 'B'));
      remain -= it.size1;
    }
  }

  /* --- 5. xuất kết quả --- */
  const teamA = [], teamB = [];
  for (let i = 0; i < n; i++) {
    (assign[groupOf[i]] === 'A' ? teamA : teamB).push(roster[i]);
  }

  return { ok: true, teams: [shuffle(teamA), shuffle(teamB)], warnings };
}

/* ---------- kiểm tra ràng buộc trước khi chia ---------- */

export function validateRules(roster, pairs, rivals) {
  const issues = [];
  const ids = new Set(roster.map((p) => p.id));
  const seen = new Set();

  const check = (list, label) => {
    for (const [a, b] of list) {
      if (a === null || b === null) { issues.push(`Có ${label} chưa chọn đủ 2 người.`); continue; }
      if (a === b) { issues.push(`Không thể ghép một người với chính họ.`); continue; }
      if (!ids.has(a) || !ids.has(b)) { issues.push(`Một ${label} đang trỏ tới người không còn trong danh sách.`); continue; }
      const key = `${label}:${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key)) issues.push(`${label} bị trùng lặp.`);
      seen.add(key);
    }
  };

  check(pairs, 'cặp đi chung');
  check(rivals, 'cặp kỵ nhau');

  return [...new Set(issues)];
}
