import { splitTeams, rosterFromCount, rosterFromText }
  from '../js/splitter.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓', m)) : (fail++, console.log('  ✗ FAIL:', m)); };
const side = (teams, id) => teams[0].some(p => p.id === id) ? 0 : 1;

console.log('\n── 1. Chia đôi cơ bản ──');
for (const n of [2, 4, 7, 10, 11, 25, 64]) {
  const r = splitTeams(rosterFromCount(n));
  const [a, b] = r.teams;
  ok(r.ok && a.length + b.length === n, `n=${n}: tổng đúng ${a.length}+${b.length}`);
  ok(Math.abs(a.length - b.length) === (n % 2), `n=${n}: lệch ${Math.abs(a.length-b.length)} (mong đợi ${n%2})`);
  ok(new Set([...a, ...b].map(p => p.id)).size === n, `n=${n}: không trùng/mất người`);
}

console.log('\n── 2. Cặp đi chung (1000 lần) ──');
{
  const roster = rosterFromCount(10);
  const pairs = [[0, 1], [2, 3], [4, 5]];
  let bad = 0, sizes = new Set();
  for (let i = 0; i < 1000; i++) {
    const r = splitTeams(roster, pairs);
    if (!r.ok) { bad++; continue; }
    for (const [x, y] of pairs) if (side(r.teams, x) !== side(r.teams, y)) bad++;
    sizes.add(`${r.teams[0].length}v${r.teams[1].length}`);
  }
  ok(bad === 0, `mọi cặp luôn cùng đội (vi phạm: ${bad})`);
  ok([...sizes].every(s => s === '5v5'), `sĩ số luôn 5v5: ${[...sizes]}`);
}

console.log('\n── 3. Cặp kỵ nhau (1000 lần) ──');
{
  const roster = rosterFromCount(10);
  const rivals = [[0, 1], [2, 3], [4, 5], [6, 7]];
  let bad = 0;
  for (let i = 0; i < 1000; i++) {
    const r = splitTeams(roster, [], rivals);
    if (!r.ok) { bad++; continue; }
    for (const [x, y] of rivals) if (side(r.teams, x) === side(r.teams, y)) bad++;
  }
  ok(bad === 0, `mọi cặp kỵ luôn khác đội (vi phạm: ${bad})`);
}

console.log('\n── 4. Kết hợp cả hai ──');
{
  const roster = rosterFromCount(12);
  const pairs = [[0, 1], [2, 3]];
  const rivals = [[0, 2], [4, 5]];
  let bad = 0;
  for (let i = 0; i < 1000; i++) {
    const r = splitTeams(roster, pairs, rivals);
    if (!r.ok) { bad++; continue; }
    for (const [x, y] of pairs)  if (side(r.teams, x) !== side(r.teams, y)) bad++;
    for (const [x, y] of rivals) if (side(r.teams, x) === side(r.teams, y)) bad++;
    if (r.teams[0].length !== 6) bad++;
  }
  ok(bad === 0, `pairs + rivals + sĩ số đều đúng (vi phạm: ${bad})`);
}

console.log('\n── 5. Phát hiện mâu thuẫn ──');
ok(!splitTeams(rosterFromCount(6), [[0,1]], [[0,1]]).ok, 'vừa cùng vừa khác đội → báo lỗi');
ok(!splitTeams(rosterFromCount(6), [], [[0,1],[1,2],[2,0]]).ok, 'vòng lẻ A≠B≠C≠A → báo lỗi');
ok(!splitTeams(rosterFromCount(6), [[0,1],[1,2],[2,3],[3,4]]).ok, 'nhóm 5 người > sức chứa 3 → báo lỗi');
ok(!splitTeams(rosterFromCount(1)).ok, 'n=1 → báo lỗi');

console.log('\n── 6. Nhóm lẻ khiến lệch (cảnh báo, không im lặng) ──');
{
  // 10 người, 3 nhóm 3 người + 1 lẻ → nhóm cỡ {3,3,3,1}, không tổ hợp nào ra 5
  const r = splitTeams(rosterFromCount(10), [[0,1],[1,2],[3,4],[4,5],[6,7],[7,8]]);
  ok(r.ok, 'vẫn chia được');
  ok(r.warnings.length > 0, `có cảnh báo lệch: "${r.warnings[0] || ''}"`);
}

console.log('\n── 7. Bên đông hơn khi lẻ ──');
{
  const roster = rosterFromCount(11);
  const A = Array.from({length: 200}, () => splitTeams(roster, [], [], 'a').teams[0].length);
  const B = Array.from({length: 200}, () => splitTeams(roster, [], [], 'b').teams[0].length);
  const auto = new Set(Array.from({length: 300}, () => splitTeams(roster, [], [], 'auto').teams[0].length));
  ok(A.every(v => v === 6), 'ép đội 1 đông hơn → luôn 6');
  ok(B.every(v => v === 5), 'ép đội 2 đông hơn → đội 1 luôn 5');
  ok(auto.size === 2, `auto → đổi qua lại: ${[...auto].sort()}`);
}

console.log('\n── 8. Tính ngẫu nhiên ──');
{
  const roster = rosterFromCount(10);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const r = splitTeams(roster);
    seen.add(r.teams[0].map(p => p.id).sort((a,b)=>a-b).join(','));
  }
  ok(seen.size > 150, `400 lần cho ${seen.size} tổ hợp khác nhau (không bị kẹt 1 kết quả)`);

  // ngẫu nhiên kể cả khi có ràng buộc
  const seen2 = new Set();
  for (let i = 0; i < 400; i++) {
    const r = splitTeams(roster, [[0,1]], [[2,3]]);
    seen2.add(r.teams[0].map(p => p.id).sort((a,b)=>a-b).join(','));
  }
  ok(seen2.size > 50, `có ràng buộc vẫn cho ${seen2.size} tổ hợp khác nhau`);
}

console.log('\n── 9. Parse tên ──');
{
  const r = rosterFromText('Huy\nNam, Linh;Trang\n\n  Huy  ');
  ok(r.length === 5, `tách được 5 tên: ${r.map(p=>p.name).join(' | ')}`);
  ok(r[4].name === 'Huy (2)', 'tên trùng được đánh số');
}

console.log(`\n${'='.repeat(46)}\n  PASS: ${pass}   FAIL: ${fail}\n${'='.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
