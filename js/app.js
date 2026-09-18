/* =========================================================
   app.js — Điều phối UI, hiệu ứng và chuỗi animation
   ========================================================= */

import { sfx } from './audio.js';
import { initParticles, COLORS } from './particles.js';
import {
  rosterFromCount, rosterFromText, splitTeams, validateRules,
} from './splitter.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- state ---------------- */

const state = {
  mode: 'names',          // 'names' | 'count' — mặc định nhập tên thật
  rolling: false,
  skip: false,
  result: null,           // [teamA, teamB]
  roster: [],
  pairs: [],              // [{a, b}]
  rivals: [],
  sound: true,
  fx: true,
  speed: 'normal',      // 'fast' | 'normal' | 'slow'
  collapsed: false,
};

const SPEED_HINT = {
  fast:   'Bỏ đếm ngược, hiện kết quả gần như tức thì.',
  normal: 'Đếm ngược 3·2·1 rồi lộ lần lượt cả hai đội.',
  slow:   'Từng người hiện thẻ tên giữa màn hình rồi bay về đội — hồi hộp nhất.',
};

const STORE_KEY = 'team-splitter:v1';

/* ---------------- DOM ---------------- */

const el = {
  shake:       $('#shake-root'),
  tabs:        $('.tabs'),
  count:       $('#input-count'),
  names:       $('#input-names'),
  namesCount:  $('#names-counter'),
  nameA:       $('#name-a'),
  nameB:       $('#name-b'),
  oddSide:     $('#odd-side'),
  chkPairs:    $('#chk-pairs'),
  chkRivals:   $('#chk-rivals'),
  pairsBox:    $('#pairs-box'),
  rivalsBox:   $('#rivals-box'),
  pairsList:   $('#pairs-list'),
  rivalsList:  $('#rivals-list'),
  messages:    $('#messages'),
  roll:        $('#btn-roll'),
  arena:       $('#arena'),
  teamA:       $('#team-a'),
  teamB:       $('#team-b'),
  rift:        $('#rift'),
  riftCount:   $('#rift-count'),
  flash:       $('#flash'),
  toast:       $('#toast'),
  btnSound:    $('#btn-sound'),
  btnFx:       $('#btn-fx'),
  layout:      $('.layout'),
  setup:       $('#setup'),
  collapse:    $('#btn-collapse'),
  rail:        $('#setup-rail'),
};

const particles = initParticles($('#bg-canvas'), $('#fx-canvas'));

/* ---------------- helpers ---------------- */

/** setTimeout có thể bị "skip" bằng phím Esc */
const timers = new Set();
function sleep(ms) {
  if (state.skip) return Promise.resolve();
  return new Promise((resolve) => {
    const entry = { resolve, id: setTimeout(() => { timers.delete(entry); resolve(); }, ms) };
    timers.add(entry);
  });
}
/** Animation (Web Animations API) đang chạy — để Esc có thể cắt ngang */
const runningAnims = new Set();
function track(anim) {
  runningAnims.add(anim);
  return anim.finished.catch(() => {}).finally(() => runningAnims.delete(anim));
}

function skipAll() {
  state.skip = true;
  timers.forEach((t) => { clearTimeout(t.id); t.resolve(); });
  timers.clear();
  runningAnims.forEach((a) => { try { a.finish(); } catch { /* đã kết thúc */ } });
  runningAnims.clear();
}

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2200);
}

function centerOf(node) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

/**
 * Tâm để phát hiệu ứng khi đang thấy sàn đấu: lấy huy hiệu VS — tức là
 * chính giữa hai bảng đội — chứ KHÔNG phải giữa màn hình, vì bảng thiết lập
 * bên trái đẩy sàn đấu lệch sang phải.
 */
function arenaCenter() {
  const vs = $('.vs');
  if (vs) {
    const r = vs.getBoundingClientRect();
    if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function initials(name) {
  const parts = name.replace(/\(\d+\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------- roster ---------------- */

function currentRoster() {
  if (state.mode === 'count') {
    const n = clampCount(parseInt(el.count.value, 10) || 0);
    return rosterFromCount(n);
  }
  return rosterFromText(el.names.value);
}

function clampCount(n) { return Math.max(2, Math.min(64, n)); }

/** Đồng bộ roster + làm sạch các ràng buộc trỏ tới người đã biến mất */
function syncRoster() {
  state.roster = currentRoster();
  const ids = new Set(state.roster.map((p) => p.id));

  const clean = (list) => list.filter((r) =>
    (r.a === null || ids.has(r.a)) && (r.b === null || ids.has(r.b))
  ).map((r) => ({
    a: r.a !== null && ids.has(r.a) ? r.a : null,
    b: r.b !== null && ids.has(r.b) ? r.b : null,
  }));

  state.pairs = clean(state.pairs);
  state.rivals = clean(state.rivals);

  if (state.mode === 'names') {
    const n = state.roster.length;
    el.namesCount.textContent = `${n} người`;
  }

  renderRules();
  updateQuickPicks();
  validate();
  save();
}

/* ---------------- rules UI ---------------- */

function ruleRow(kind, rule, idx) {
  const row = document.createElement('div');
  row.className = 'rule-row';
  row.dataset.type = kind;

  const mkSelect = (value, which) => {
    const s = document.createElement('select');
    s.className = 'select';
    s.innerHTML = '<option value="">— chọn người —</option>' +
      state.roster.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    s.value = value === null ? '' : String(value);
    s.addEventListener('change', () => {
      const list = kind === 'pair' ? state.pairs : state.rivals;
      list[idx][which] = s.value === '' ? null : Number(s.value);
      sfx.click();
      validate();
      save();
    });
    return s;
  };

  const link = document.createElement('span');
  link.className = 'rule-link';
  link.textContent = kind === 'pair' ? '+' : '⚔';
  link.title = kind === 'pair' ? 'cùng đội' : 'khác đội';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'rule-del';
  del.innerHTML = '×';
  del.title = 'Xoá';
  del.addEventListener('click', () => {
    const list = kind === 'pair' ? state.pairs : state.rivals;
    list.splice(idx, 1);
    sfx.click();
    renderRules(); validate(); save();
  });

  row.append(mkSelect(rule.a, 'a'), link, mkSelect(rule.b, 'b'), del);
  return row;
}

function renderRules() {
  const render = (list, kind, container) => {
    container.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'rules-empty';
      p.textContent = kind === 'pair'
        ? 'Chưa có cặp nào — mọi người được chia tự do.'
        : 'Chưa có cặp kỵ nhau nào.';
      container.append(p);
      return;
    }
    list.forEach((r, i) => container.append(ruleRow(kind, r, i)));
  };

  render(state.pairs, 'pair', el.pairsList);
  render(state.rivals, 'rival', el.rivalsList);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- validation ---------------- */

function showMessages(list) {
  el.messages.innerHTML = '';
  for (const m of list) {
    const div = document.createElement('div');
    div.className = `msg msg--${m.type}`;
    const icon = m.type === 'error' ? '⛔' : m.type === 'warn' ? '⚠️'
               : m.type === 'info' ? '💡' : '✅';
    div.innerHTML = `<span class="msg-icon">${icon}</span><span>${escapeHtml(m.text)}</span>`;
    el.messages.append(div);
  }
}

/** Trả về true nếu có thể chia */
function validate(quiet = true) {
  const msgs = [];
  const roster = state.roster;

  if (roster.length < 2) {
    // Chưa gõ gì thì đây là trạng thái bình thường, không phải lỗi
    const chuaNhap = state.mode === 'names' && !el.names.value.trim();
    msgs.push(chuaNhap
      ? { type: 'info', text: 'Nhập danh sách tên để bắt đầu — mỗi dòng một người. Cần chia nhanh theo số thì bấm tab "Số lượng".' }
      : { type: 'error', text: 'Cần ít nhất 2 người để chia đội.' });
    showMessages(msgs);
    el.roll.disabled = true;
    return false;
  }

  const pairs  = activePairs();
  const rivals = activeRivals();

  const rawPairs  = el.chkPairs.checked  ? state.pairs.map((r) => [r.a, r.b])  : [];
  const rawRivals = el.chkRivals.checked ? state.rivals.map((r) => [r.a, r.b]) : [];
  const issues = validateRules(roster, rawPairs, rawRivals);
  for (const t of issues) msgs.push({ type: 'warn', text: t });

  // thử chia khô để phát hiện mâu thuẫn ngay
  const dry = splitTeams(roster, pairs, rivals, el.oddSide.value);
  if (!dry.ok) {
    msgs.push({ type: 'error', text: dry.error });
    showMessages(msgs);
    el.roll.disabled = true;
    return false;
  }
  for (const w of dry.warnings) msgs.push({ type: 'warn', text: w });

  if (!quiet && !msgs.length) {
    const big = Math.ceil(roster.length / 2);
    msgs.push({ type: 'ok', text: `Sẵn sàng: ${roster.length} người → ${big} vs ${roster.length - big}.` });
  }

  showMessages(msgs);
  el.roll.disabled = false;
  return true;
}

function activePairs() {
  if (!el.chkPairs.checked) return [];
  return state.pairs.filter((r) => r.a !== null && r.b !== null && r.a !== r.b).map((r) => [r.a, r.b]);
}
function activeRivals() {
  if (!el.chkRivals.checked) return [];
  return state.rivals.filter((r) => r.a !== null && r.b !== null && r.a !== r.b).map((r) => [r.a, r.b]);
}

/* ---------------- render teams ---------------- */

function teamMeta() {
  return [
    { node: el.teamA, key: 'blue', side: 0, name: el.nameA.value.trim() || 'ĐỘI XANH', color: COLORS.BLUE, dir: 1 },
    { node: el.teamB, key: 'red',  side: 1, name: el.nameB.value.trim() || 'ĐỘI ĐỎ',  color: COLORS.RED,  dir: -1 },
  ];
}

function clearTeams() {
  for (const { node } of teamMeta()) {
    $('[data-roster]', node).innerHTML = '';
    $('[data-count]', node).textContent = '0';
    node.classList.remove('has-players', 'is-live');
  }
  el.arena.classList.remove('has-result');
}

function buildChip(player, idx, tagMap) {
  const li = document.createElement('li');
  li.className = 'chip';

  const av = document.createElement('div');
  av.className = 'chip-avatar';
  av.textContent = initials(player.name);

  const nm = document.createElement('div');
  nm.className = 'chip-name';
  nm.textContent = player.name;

  const ix = document.createElement('span');
  ix.className = 'chip-index';
  ix.textContent = String(idx + 1).padStart(2, '0');

  li.append(av, nm);

  const tag = tagMap.get(player.id);
  if (tag) {
    const t = document.createElement('span');
    t.className = 'chip-tag' + (tag.kind === 'rival' ? ' chip-tag--rival' : '');
    t.textContent = tag.label;
    li.append(t);
  }

  li.append(ix);
  return li;
}

/** Gắn nhãn cho người có ràng buộc (đi chung / kỵ nhau) */
function buildTagMap() {
  const map = new Map();
  const name = (id) => state.roster.find((p) => p.id === id)?.name ?? '';

  activePairs().forEach(([a, b]) => {
    map.set(a, { kind: 'pair', label: `⛓ ${short(name(b))}` });
    map.set(b, { kind: 'pair', label: `⛓ ${short(name(a))}` });
  });
  activeRivals().forEach(([a, b]) => {
    if (!map.has(a)) map.set(a, { kind: 'rival', label: `⚔ ${short(name(b))}` });
    if (!map.has(b)) map.set(b, { kind: 'rival', label: `⚔ ${short(name(a))}` });
  });
  return map;
}

const short = (s) => (s.length > 9 ? s.slice(0, 8) + '…' : s);

/** Đổ tên vào 2 đội — rẽ nhánh theo tốc độ đã chọn */
async function revealTeams(teams) {
  const metas = teamMeta();
  const tagMap = buildTagMap();

  metas.forEach((m, i) => {
    $('[data-team-name]', m.node).textContent = m.name;
    $('[data-count]', m.node).textContent = String(teams[i].length);
    m.node.classList.toggle('has-players', teams[i].length > 0);
    m.node.classList.add('is-live');
  });

  el.arena.classList.add('has-result');

  sfx.swoosh(0);
  await sleep(90);
  sfx.swoosh(1);

  if (state.speed === 'slow') await revealSlow(teams, metas, tagMap);
  else await revealQuick(teams, metas, tagMap);
}

/** Tia lửa khi một thẻ đáp xuống danh sách */
function landingSparks(chip, meta) {
  const { rect } = centerOf(chip);
  const x = meta.dir === 1 ? rect.left + 24 : rect.right - 24;
  const y = rect.top + rect.height / 2;
  particles.fx.streak(x, y, meta.dir, meta.color, 14);
  particles.fx.burst(x, y, meta.color, 10, { speed: .7, gravity: .05 });
}

/** Chế độ nhanh / thường: tên hiện lần lượt, xen kẽ hai đội */
async function revealQuick(teams, metas, tagMap) {
  const total = Math.max(teams[0].length, teams[1].length);
  const gap = state.speed === 'fast' ? 44
            : total > 14 ? 70 : total > 9 ? 100 : 135;

  for (let i = 0; i < total; i++) {
    for (let t = 0; t < 2; t++) {
      const player = teams[t][i];
      if (!player) continue;

      const meta = metas[t];
      const chip = buildChip(player, i, tagMap);
      $('[data-roster]', meta.node).append(chip);

      requestAnimationFrame(() => {
        chip.classList.add('is-in');
        landingSparks(chip, meta);
      });

      sfx.reveal(i, total, t);
      await sleep(gap / 2);
    }
  }
}

/** Chế độ chậm: từng người một hiện thẻ ở giữa rồi bay về đội mình */
async function revealSlow(teams, metas, tagMap) {
  const total = Math.max(teams[0].length, teams[1].length);

  for (let i = 0; i < total; i++) {
    for (let t = 0; t < 2; t++) {
      const player = teams[t][i];
      if (!player) continue;

      const meta = metas[t];
      const chip = buildChip(player, i, tagMap);
      $('[data-roster]', meta.node).append(chip);

      // Bấm Esc giữa chừng → đổ hết phần còn lại ra ngay
      if (state.skip) {
        chip.classList.add('is-in');
        continue;
      }

      await flyIn(player, meta, chip);
      await sleep(130);
    }
  }
}

/**
 * Thẻ tên phóng to ở giữa màn hình, giữ một nhịp cho mọi người đọc,
 * rồi bay về đúng chỗ của nó trong danh sách đội.
 */
async function flyIn(player, meta, chip) {
  const flyer = document.createElement('div');
  flyer.className = `flyer flyer--${meta.key}`;

  const av = document.createElement('div');
  av.className = 'flyer-avatar';
  av.textContent = initials(player.name);

  const txt = document.createElement('div');
  txt.className = 'flyer-text';
  const nm = document.createElement('div');
  nm.className = 'flyer-name';
  nm.textContent = player.name;
  const dest = document.createElement('div');
  dest.className = 'flyer-dest';
  dest.textContent = `→ ${meta.name}`;
  txt.append(nm, dest);

  flyer.append(av, txt);

  // Neo thẻ vào giữa hai bảng đội, không phải giữa màn hình
  const { x: cx, y: cy } = arenaCenter();
  flyer.style.left = `${cx}px`;
  flyer.style.top  = `${cy}px`;
  document.body.append(flyer);

  /* 1 — hiện ra giữa màn hình */
  sfx.summon(meta.side);
  particles.fx.shockwave(cx, cy, meta.color, { speed: 9, decay: .04, max: 300, width: 2 });
  particles.fx.burst(cx, cy, meta.color, 24, { speed: 1.1, gravity: .03 });

  await track(flyer.animate([
    { transform: 'translate(-50%,-50%) scale(.3)',  opacity: 0, filter: 'blur(9px)' },
    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, filter: 'blur(0px)', offset: .6 },
    { transform: 'translate(-50%,-50%) scale(1)',   opacity: 1, filter: 'blur(0px)' },
  ], { duration: 430, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }));

  await sleep(340);   // nhịp giữ để đọc tên

  // Esc bấm đúng lúc này → bỏ luôn đoạn bay, thả thẻ vào đội ngay
  if (state.skip) {
    flyer.remove();
    chip.classList.add('is-in');
    return;
  }

  /* 2 — bay về đội, kéo theo vệt hạt */
  const cr = chip.getBoundingClientRect();
  const fr = flyer.getBoundingClientRect();
  const dx = (cr.left + cr.width / 2) - (fr.left + fr.width / 2);
  const dy = (cr.top + cr.height / 2) - (fr.top + fr.height / 2);
  const scaleTo = Math.max(.25, Math.min(1, cr.width / Math.max(1, fr.width)));

  let raf = requestAnimationFrame(function trail() {
    const b = flyer.getBoundingClientRect();
    particles.fx.burst(b.left + b.width / 2, b.top + b.height / 2, meta.color, 2, { speed: .35, gravity: .02 });
    raf = requestAnimationFrame(trail);
  });

  sfx.swoosh(meta.side);

  await track(flyer.animate([
    { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(-50%,-50%) translate(${dx * .5}px, ${dy * .5 - 42}px) scale(.82)`, opacity: 1, offset: .55 },
    { transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) scale(${scaleTo})`, opacity: 0 },
  ], { duration: 620, easing: 'cubic-bezier(.55,.06,.68,.19)', fill: 'forwards' }));

  cancelAnimationFrame(raf);
  flyer.remove();

  /* 3 — đáp xuống */
  chip.classList.add('is-in');
  landingSparks(chip, meta);
  sfx.land();
}

/* ---------------- chuỗi animation chính ---------------- */

async function roll() {
  if (state.rolling) return;

  syncRoster();
  if (!validate()) {
    sfx.error();
    el.shake.classList.add('shake-hard');
    setTimeout(() => el.shake.classList.remove('shake-hard'), 520);
    return;
  }

  const result = splitTeams(state.roster, activePairs(), activeRivals(), el.oddSide.value);
  if (!result.ok) { sfx.error(); showMessages([{ type: 'error', text: result.error }]); return; }

  state.rolling = true;
  state.skip = false;
  state.result = result.teams;
  el.roll.disabled = true;

  sfx.init();
  sfx.click();
  clearTeams();
  particles.fx.clear();

  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;

  /* --- mở cổng --- */
  const quick = state.speed === 'fast';
  const riserDur = quick ? 0.85 : 1.75;

  el.rift.classList.add('is-open');
  particles.fx.charge(riserDur * 1000);
  particles.fx.shockwave(cx, cy, COLORS.GOLD, { speed: 9, decay: .03, max: 520, width: 2 });
  sfx.riser(riserDur);

  /* --- đếm ngược 3 · 2 · 1 (bỏ qua ở chế độ nhanh) --- */
  if (quick) {
    el.riftCount.textContent = '';
    await sleep(850);
  } else {
    for (const n of [3, 2, 1]) {
      el.riftCount.textContent = n;
      el.riftCount.classList.remove('tick');
      void el.riftCount.offsetWidth;   // reflow để chạy lại animation
      el.riftCount.classList.add('tick');
      particles.fx.shockwave(cx, cy, COLORS.GOLD, { speed: 7, decay: .045, max: 330, width: 2 });
      await sleep(560);
    }
  }

  /* --- IMPACT --- */
  sfx.impact();
  el.flash.classList.remove('is-on');
  void el.flash.offsetWidth;
  el.flash.classList.add('is-on');

  el.shake.classList.add('shake-hard');
  setTimeout(() => el.shake.classList.remove('shake-hard'), 520);

  particles.fx.shockwave(cx, cy, COLORS.WHITE, { speed: 26, decay: .015, width: 6 });
  particles.fx.shockwave(cx, cy, COLORS.GOLD,  { speed: 19, decay: .012, width: 3 });
  particles.fx.burst(cx, cy, COLORS.GOLD, 130, { speed: 2.2, gravity: .05 });
  particles.fx.burst(cx, cy, COLORS.WHITE, 50, { speed: 2.6, gravity: .04 });
  particles.fx.bolts(COLORS.GOLD);

  await sleep(260);
  el.rift.classList.remove('is-open');
  el.riftCount.textContent = '';
  await sleep(170);

  /* --- lộ đội hình --- */
  await revealTeams(result.teams);

  await sleep(160);
  sfx.fanfare();
  const ac = arenaCenter();
  particles.fx.celebrate(ac.x, ac.y);

  const warn = result.warnings.map((t) => ({ type: 'warn', text: t }));
  showMessages([
    ...warn,
    { type: 'ok', text: `Đã chia xong: ${result.teams[0].length} vs ${result.teams[1].length}.` },
  ]);

  state.rolling = false;
  state.skip = false;
  el.roll.disabled = false;
  el.roll.querySelector('.roll-btn-label').lastChild.textContent = ' CHIA LẠI';
}

/* ---------------- đổi bên ---------------- */

function swapSides() {
  if (!state.result || state.rolling) return;
  state.result = [state.result[1], state.result[0]];
  sfx.swoosh(0);

  clearTeams();
  const metas = teamMeta();
  const tagMap = buildTagMap();

  metas.forEach((m, i) => {
    const teams = state.result[i];
    $('[data-team-name]', m.node).textContent = m.name;
    $('[data-count]', m.node).textContent = String(teams.length);
    m.node.classList.toggle('has-players', teams.length > 0);
    m.node.classList.add('is-live');
    const list = $('[data-roster]', m.node);
    teams.forEach((p, idx) => {
      const chip = buildChip(p, idx, tagMap);
      list.append(chip);
      requestAnimationFrame(() => chip.classList.add('is-in'));
    });
  });
  el.arena.classList.add('has-result');
}

/* ---------------- copy ---------------- */

async function copyResult() {
  if (!state.result) { toast('Chưa có kết quả để copy'); return; }
  const [a, b] = state.result;
  const nameA = el.nameA.value.trim() || 'ĐỘI XANH';
  const nameB = el.nameB.value.trim() || 'ĐỘI ĐỎ';

  const text =
    `${nameA} (${a.length})\n` + a.map((p, i) => `${i + 1}. ${p.name}`).join('\n') +
    `\n\n${nameB} (${b.length})\n` + b.map((p, i) => `${i + 1}. ${p.name}`).join('\n');

  try {
    await navigator.clipboard.writeText(text);
    toast('✓ Đã copy kết quả');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('✓ Đã copy kết quả');
  }
  sfx.click();
}

/* ---------------- lưu / khôi phục ---------------- */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      mode: state.mode,
      count: el.count.value,
      names: el.names.value,
      nameA: el.nameA.value,
      nameB: el.nameB.value,
      oddSide: el.oddSide.value,
      usePairs: el.chkPairs.checked,
      useRivals: el.chkRivals.checked,
      pairs: state.pairs,
      rivals: state.rivals,
      sound: state.sound,
      fx: state.fx,
      speed: state.speed,
      collapsed: state.collapsed,
    }));
  } catch { /* storage bị chặn — bỏ qua */ }
}

function restore() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { data = null; }
  if (!data) return;

  if (data.count) el.count.value = data.count;
  if (typeof data.names === 'string') el.names.value = data.names;
  if (data.nameA) el.nameA.value = data.nameA;
  if (data.nameB) el.nameB.value = data.nameB;
  if (data.oddSide) el.oddSide.value = data.oddSide;

  el.chkPairs.checked  = !!data.usePairs;
  el.chkRivals.checked = !!data.useRivals;
  state.pairs  = Array.isArray(data.pairs)  ? data.pairs  : [];
  state.rivals = Array.isArray(data.rivals) ? data.rivals : [];

  if (data.mode === 'count' || data.mode === 'names') state.mode = data.mode;

  if (SPEED_HINT[data.speed]) setSpeed(data.speed, true);
  if (data.collapsed) setCollapsed(true, true);

  state.sound = data.sound !== false;
  state.fx = data.fx !== false;
  applyToggles();
  syncBoxes();
}

/* ---------------- toggles ---------------- */

function applyToggles() {
  el.btnSound.classList.toggle('is-off', !state.sound);
  el.btnSound.setAttribute('aria-pressed', String(state.sound));
  sfx.setEnabled(state.sound);

  el.btnFx.classList.toggle('is-off', !state.fx);
  el.btnFx.setAttribute('aria-pressed', String(state.fx));
  particles.setEnabled(state.fx);
  document.body.classList.toggle('no-fx', !state.fx);
}

function syncBoxes() {
  el.pairsBox.classList.toggle('is-collapsed', !el.chkPairs.checked);
  el.rivalsBox.classList.toggle('is-collapsed', !el.chkRivals.checked);
}

function setMode(mode, silent = false) {
  const prev = state.mode;
  state.mode = mode;

  // Chuyển qua lại giữa hai cách nhập mà không mất công gõ lại:
  // - sang "Danh sách tên" khi chưa gõ gì  → điền sẵn Người 1..N để sửa đè
  // - sang "Số lượng"                      → lấy luôn số người đang có
  if (prev !== mode) {
    if (mode === 'names' && !el.names.value.trim()) {
      const n = clampCount(parseInt(el.count.value, 10) || 0);
      el.names.value = rosterFromCount(n).map((p) => p.name).join('\n');
    } else if (mode === 'count') {
      const n = rosterFromText(el.names.value).length;
      if (n >= 2) el.count.value = clampCount(n);
    }
  }

  el.tabs.dataset.active = mode;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.mode === mode));
  $$('.mode-pane').forEach((p) => p.classList.toggle('is-hidden', p.dataset.pane !== mode));
  if (!silent) sfx.click();
  syncRoster();
}

function updateQuickPicks() {
  const v = parseInt(el.count.value, 10);
  $$('[data-pane="count"] .pill').forEach((p) =>
    p.classList.toggle('is-active', Number(p.dataset.count) === v));
}

function setCollapsed(on, silent = false) {
  state.collapsed = on;
  el.layout.classList.toggle('is-collapsed', on);
  el.setup.classList.toggle('is-collapsed', on);
  el.collapse.setAttribute('aria-expanded', String(!on));
  if (!silent) sfx.click();
  save();
}

function setSpeed(v, silent = false) {
  state.speed = v;
  $$('#speed-seg .pill').forEach((b) => b.classList.toggle('is-active', b.dataset.speed === v));
  $('#speed-hint').textContent = SPEED_HINT[v];
  if (!silent) sfx.click();
  save();
}

/* ---------------- events ---------------- */

function bind() {
  // tabs
  $$('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // stepper
  $$('.step-btn').forEach((b) => b.addEventListener('click', () => {
    el.count.value = clampCount((parseInt(el.count.value, 10) || 0) + Number(b.dataset.step));
    sfx.click();
    syncRoster();
  }));
  el.count.addEventListener('input', () => syncRoster());
  el.count.addEventListener('blur', () => { el.count.value = clampCount(parseInt(el.count.value, 10) || 2); syncRoster(); });

  $$('[data-pane="count"] .pill').forEach((p) => p.addEventListener('click', () => {
    el.count.value = p.dataset.count;
    sfx.click();
    syncRoster();
  }));

  $$('#speed-seg .pill').forEach((b) =>
    b.addEventListener('click', () => setSpeed(b.dataset.speed)));

  // names
  let nameTimer;
  el.names.addEventListener('input', () => {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(syncRoster, 180);
  });
  $('#btn-sample').addEventListener('click', () => {
    el.names.value = 'Huy\nNam\nLinh\nTrang\nKhoa\nMinh\nPhương\nTuấn\nHà\nSơn';
    sfx.click();
    syncRoster();
  });
  $('#btn-clear-names').addEventListener('click', () => {
    el.names.value = '';
    sfx.click();
    syncRoster();
  });

  // team names / odd side
  [el.nameA, el.nameB].forEach((i) => i.addEventListener('input', () => {
    const idx = i === el.nameA ? 0 : 1;
    $('[data-team-name]', teamMeta()[idx].node).textContent = i.value.trim() || (idx ? 'ĐỘI ĐỎ' : 'ĐỘI XANH');
    save();
  }));
  el.oddSide.addEventListener('change', () => { sfx.click(); validate(); save(); });

  // rule toggles
  el.chkPairs.addEventListener('change', () => {
    syncBoxes(); sfx.click();
    if (el.chkPairs.checked && !state.pairs.length) addRule('pair');
    validate(); save();
  });
  el.chkRivals.addEventListener('change', () => {
    syncBoxes(); sfx.click();
    if (el.chkRivals.checked && !state.rivals.length) addRule('rival');
    validate(); save();
  });

  $$('.add-rule').forEach((b) => b.addEventListener('click', () => addRule(b.dataset.add)));

  // actions
  el.roll.addEventListener('click', roll);
  $('#btn-reroll').addEventListener('click', roll);
  $('#btn-swap').addEventListener('click', swapSides);
  $('#btn-copy').addEventListener('click', copyResult);

  el.btnSound.addEventListener('click', () => {
    state.sound = !state.sound;
    applyToggles();
    if (state.sound) sfx.click();
    save();
  });
  el.collapse.addEventListener('click', () => setCollapsed(true));
  el.rail.addEventListener('click', () => setCollapsed(false));
  el.rail.addEventListener('mouseenter', () => sfx.hover());
  el.collapse.addEventListener('mouseenter', () => sfx.hover());

  el.btnFx.addEventListener('click', () => {
    state.fx = !state.fx;
    applyToggles(); sfx.click(); save();
  });

  // hover ticks
  $$('.ghost-btn, .pill, .tab, .step-btn, .icon-btn').forEach((b) =>
    b.addEventListener('mouseenter', () => sfx.hover())
  );
  el.roll.addEventListener('mouseenter', () => sfx.hover());

  // bàn phím
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');

    if (e.key === 'Escape') { skipAll(); return; }
    if (typing) return;

    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); roll(); }
    else if (e.key === 'r' || e.key === 'R') roll();
    else if (e.key === 'c' || e.key === 'C') copyResult();
    else if (e.key === 's' || e.key === 'S') swapSides();
    else if (e.key === 'h' || e.key === 'H') setCollapsed(!state.collapsed);
  });

  // mở audio context ở tương tác đầu tiên
  const unlock = () => { sfx.init(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

function addRule(kind) {
  const list = kind === 'pair' ? state.pairs : state.rivals;
  list.push({ a: null, b: null });
  sfx.click();
  renderRules();
  save();
}

/* ---------------- boot ---------------- */

restore();
bind();
syncBoxes();
setMode(state.mode, true);   // đồng bộ tab + khung nhập, tự gọi syncRoster()
updateQuickPicks();
