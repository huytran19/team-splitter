/* =========================================================
   particles.js — 2 lớp canvas
   - BG : bụi hextech trôi nhẹ + đường nối (luôn chạy)
   - FX : hiệu ứng sự kiện (hút vào tâm, sóng xung kích,
          tia lửa khi lộ tên, pháo hoa ăn mừng)
   ========================================================= */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

const GOLD = [200, 170, 110];
const BLUE = [10, 200, 185];
const RED  = [255, 70, 85];
const WHITE = [240, 230, 210];

export const COLORS = { GOLD, BLUE, RED, WHITE };

/* ---------------------------------------------------------
   Nền: bụi trôi + lưới nối
   --------------------------------------------------------- */
class Background {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.motes = [];
    this.dpr = 1;
    this.enabled = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = this.w * this.dpr;
    this.cv.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const target = Math.round(Math.min(90, (this.w * this.h) / 19000));
    this.motes = Array.from({ length: target }, () => this.spawn(true));
  }

  spawn(anywhere = false) {
    return {
      x: rand(0, this.w),
      y: anywhere ? rand(0, this.h) : this.h + rand(10, 80),
      r: rand(0.7, 2.3),
      vy: rand(-0.32, -0.08),
      vx: rand(-0.14, 0.14),
      a: rand(0.18, 0.7),
      tw: rand(0, TAU),
      tws: rand(0.012, 0.04),
      c: Math.random() < 0.72 ? GOLD : (Math.random() < 0.5 ? BLUE : RED),
    };
  }

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.enabled) return;

    // đường nối giữa các hạt gần nhau
    ctx.lineWidth = 1;
    for (let i = 0; i < this.motes.length; i++) {
      const a = this.motes[i];
      for (let j = i + 1; j < this.motes.length; j++) {
        const b = this.motes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 15000) {
          const o = (1 - d2 / 15000) * 0.11;
          ctx.strokeStyle = `rgba(200,170,110,${o})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const m of this.motes) {
      m.x += m.vx; m.y += m.vy; m.tw += m.tws;
      if (m.y < -20 || m.x < -20 || m.x > this.w + 20) Object.assign(m, this.spawn());

      const alpha = m.a * (0.55 + 0.45 * Math.sin(m.tw));
      const [r, g, b] = m.c;

      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 3.4, 0, TAU);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.1})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  }
}

/* ---------------------------------------------------------
   FX: tia lửa, vòng xung kích, hạt hút vào tâm
   --------------------------------------------------------- */
class Effects {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.rings = [];
    this.pullUntil = 0;
    this.enabled = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = this.w * this.dpr;
    this.cv.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _cap() { return this.enabled ? 1400 : 260; }

  _push(p) {
    if (this.parts.length > this._cap()) this.parts.shift();
    this.parts.push(p);
  }

  /** Tia lửa toả tròn */
  burst(x, y, color = GOLD, count = 26, opts = {}) {
    const n = this.enabled ? count : Math.ceil(count / 3);
    const speed = opts.speed ?? 1;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU);
      const sp = rand(1.4, 8) * speed;
      this._push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1, decay: rand(0.012, 0.03),
        r: rand(0.9, 2.6),
        c: color,
        g: opts.gravity ?? 0.06,
        drag: 0.965,
        trail: Math.random() < 0.35,
      });
    }
  }

  /** Vệt sáng bắn ngang (dùng khi tên xuất hiện) */
  streak(x, y, dir = 1, color = GOLD, count = 16) {
    const n = this.enabled ? count : Math.ceil(count / 3);
    for (let i = 0; i < n; i++) {
      const ang = rand(-0.55, 0.55);
      const sp = rand(2.5, 10);
      this._push({
        x, y,
        vx: Math.cos(ang) * sp * dir,
        vy: Math.sin(ang) * sp + rand(-1.4, 1.4),
        life: 1, decay: rand(0.02, 0.045),
        r: rand(0.8, 2.1),
        c: color, g: 0.03, drag: 0.94, trail: true,
      });
    }
  }

  /** Vòng xung kích lan ra */
  shockwave(x, y, color = GOLD, opts = {}) {
    this.rings.push({
      x, y, r: opts.r0 ?? 10,
      max: opts.max ?? Math.max(this.w, this.h) * 0.85,
      speed: opts.speed ?? 16,
      life: 1, decay: opts.decay ?? 0.017,
      w: opts.width ?? 4,
      c: color,
    });
  }

  /** Hạt bị hút về tâm màn hình (giai đoạn nạp) */
  charge(duration = 1800) {
    this.pullUntil = performance.now() + duration;
    this.pullStart = performance.now();
  }

  _spawnPull() {
    const cx = this.w / 2, cy = this.h / 2;
    const ang = rand(0, TAU);
    const dist = Math.max(this.w, this.h) * rand(0.4, 0.75);
    const c = Math.random() < 0.45 ? GOLD : (Math.random() < 0.5 ? BLUE : RED);
    this._push({
      x: cx + Math.cos(ang) * dist,
      y: cy + Math.sin(ang) * dist,
      vx: 0, vy: 0,
      life: 1, decay: 0.006,
      r: rand(1, 2.8),
      c, g: 0, drag: 1,
      pull: { cx, cy, acc: rand(0.22, 0.55) },
      trail: true,
    });
  }

  /** Pháo hoa ăn mừng */
  celebrate(x, y) {
    const cx = x ?? this.w / 2;
    const cy = y ?? this.h / 2;
    this.shockwave(cx, cy, GOLD, { speed: 13, decay: 0.014, width: 3 });
    this.burst(cx, cy, GOLD, 80, { speed: 1.5, gravity: 0.11 });
    this.burst(cx, cy, WHITE, 34, { speed: 1.9, gravity: 0.09 });

    const shots = this.enabled ? 7 : 2;
    for (let i = 0; i < shots; i++) {
      setTimeout(() => {
        const px = rand(this.w * 0.12, this.w * 0.88);
        const py = rand(this.h * 0.14, this.h * 0.6);
        const c = [GOLD, BLUE, RED, WHITE][i % 4];
        this.burst(px, py, c, 40, { speed: 1.25, gravity: 0.13 });
        this.shockwave(px, py, c, { speed: 7, decay: 0.035, max: 260, width: 2 });
      }, 130 + i * 175);
    }
  }

  /** Sét hextech từ tâm ra 2 bên */
  bolts(color = GOLD) {
    const cx = this.w / 2, cy = this.h / 2;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 10; i++) {
        this._push({
          x: cx, y: cy,
          vx: side * rand(6, 19),
          vy: rand(-3.4, 3.4),
          life: 1, decay: rand(0.018, 0.035),
          r: rand(1.2, 3), c: color, g: 0.01, drag: 0.98, trail: true,
        });
      }
    }
  }

  draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';

    // sinh hạt hút vào tâm
    if (performance.now() < this.pullUntil) {
      const batch = this.enabled ? 7 : 2;
      for (let i = 0; i < batch; i++) this._spawnPull();
    }

    // vòng xung kích
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += r.speed;
      r.life -= r.decay;
      if (r.life <= 0 || r.r > r.max) { this.rings.splice(i, 1); continue; }

      const [cr, cg, cb] = r.c;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${r.life * 0.75})`;
      ctx.lineWidth = r.w * r.life;
      ctx.stroke();

      // vòng phụ mờ
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * 0.86, 0, TAU);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${r.life * 0.22})`;
      ctx.lineWidth = r.w * 2.4 * r.life;
      ctx.stroke();
    }

    // hạt
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];

      if (p.pull) {
        const dx = p.pull.cx - p.x, dy = p.pull.cy - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * p.pull.acc;
        p.vy += (dy / d) * p.pull.acc;
        p.vx *= 0.97; p.vy *= 0.97;
        if (d < 26) p.life -= 0.14;
      }

      const px = p.x, py = p.y;
      p.vy += p.g;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) { this.parts.splice(i, 1); continue; }

      const [cr, cg, cb] = p.c;
      const a = Math.max(0, p.life);

      if (p.trail) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a * 0.5})`;
        ctx.lineWidth = p.r * 0.85;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, TAU);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.fill();

      // quầng sáng
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3.2 * a, 0, TAU);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a * 0.13})`;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  clear() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.pullUntil = 0;
  }
}

/* --------------------------------------------------------- */

export function initParticles(bgCanvas, fxCanvas) {
  const bg = new Background(bgCanvas);
  const fx = new Effects(fxCanvas);

  let running = true;
  const loop = () => {
    if (running) { bg.draw(); fx.draw(); }
    requestAnimationFrame(loop);
  };
  loop();

  document.addEventListener('visibilitychange', () => { running = !document.hidden; });

  return {
    bg, fx,
    setEnabled(on) { bg.enabled = on; fx.enabled = on; if (!on) fx.clear(); },
  };
}
