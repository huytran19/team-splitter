/* =========================================================
   audio.js — SFX tổng hợp bằng Web Audio API
   ---------------------------------------------------------
   Toàn bộ âm thanh được SINH RA bằng oscillator/noise ngay
   trong trình duyệt (không dùng file audio có bản quyền).
   Phong cách: hextech / epic fantasy — riser, impact trống,
   chuông pha lê khi lộ tên, hợp âm fanfare khi xong.
   ========================================================= */

const NOTE = {
  D2: 73.42,  A2: 110.00, D3: 146.83, F3: 174.61, G3: 196.00, A3: 220.00,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
  Bb4: 466.16, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880.00, D6: 1174.66,
};

/* Thang ngũ cung (D minor pentatonic) — dùng cho chuông lộ tên */
const PENTA = [NOTE.D4, NOTE.F4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.D5, NOTE.F5, NOTE.G5, NOTE.A5, NOTE.D6];

export class SFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
    this._noise = null;
  }

  /* ---------- khởi tạo (cần user gesture) ---------- */
  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    const ctx = this.ctx;

    // master
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    // bảo vệ tai: nén nhẹ
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // reverb hall
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.32;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);

    this.ready = true;
  }

  get t() { return this.ctx.currentTime; }

  _ok() {
    if (!this.enabled) return false;
    if (!this.ready) this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  /* ---------- buffer helper ---------- */

  _impulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * 2, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    return src;
  }

  /** Gửi một node vào reverb với lượng cho trước */
  _send(node, amount = 0.3) {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.reverb);
  }

  /* ---------- UI ---------- */

  hover() {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  }

  click() {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;

    // thân kim loại
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(this.master);
    this._send(g, 0.18);
    o.start(t); o.stop(t + 0.15);

    // tiếng "tách"
    const n = this._noiseSource();
    const nf = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    nf.type = 'highpass'; nf.frequency.value = 3200;
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.06);
  }

  error() {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    [NOTE.A3, NOTE.F3].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t + i * 0.11);
      const st = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.11, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp); lp.connect(g); g.connect(this.master);
      this._send(g, 0.2);
      o.start(st); o.stop(st + 0.32);
    });
  }

  /* ---------- RISER (nạp năng lượng) ---------- */

  riser(duration = 1.8) {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    const end = t + duration;

    // 1. sweep cưa
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(1150, end);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(6500, end);
    lp.Q.value = 7;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.14, t + duration * 0.7);
    og.gain.exponentialRampToValueAtTime(0.22, end - 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    o.connect(lp); lp.connect(og); og.connect(this.master);
    this._send(og, 0.3);
    o.start(t); o.stop(end + 0.15);

    // 2. noise sweep (gió)
    const n = this._noiseSource();
    const bp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7200, end);
    bp.Q.value = 1.6;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.16, end - 0.04);
    ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
    n.connect(bp); bp.connect(ng); ng.connect(this.master);
    this._send(ng, 0.35);
    n.start(t); n.stop(end + 0.12);

    // 3. hợp âm nền dày (drone D minor)
    [NOTE.D2, NOTE.A2, NOTE.D3].forEach((f, i) => {
      const so = ctx.createOscillator();
      const sg = ctx.createGain();
      so.type = i === 2 ? 'triangle' : 'sawtooth';
      so.frequency.value = f;
      so.detune.value = (i - 1) * 7;
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.09, t + duration * 0.8);
      sg.gain.exponentialRampToValueAtTime(0.0001, end + 0.2);
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass'; f2.frequency.value = 1400;
      so.connect(f2); f2.connect(sg); sg.connect(this.master);
      this._send(sg, 0.4);
      so.start(t); so.stop(end + 0.25);
    });

    // 4. nhịp trống dồn dập (tăng tốc dần)
    let time = 0, gap = 0.34;
    while (time < duration - 0.12) {
      this._thump(t + time, 0.5 + (time / duration) * 0.6);
      time += gap;
      gap *= 0.76;
      if (gap < 0.055) gap = 0.055;
    }
  }

  _thump(at, vol = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, at);
    o.frequency.exponentialRampToValueAtTime(48, at + 0.11);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25 * vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g); g.connect(this.master);
    o.start(at); o.stop(at + 0.24);
  }

  /* ---------- IMPACT (nổ) ---------- */

  impact() {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;

    // sub boom
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.65);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(g); g.connect(this.master);
    this._send(g, 0.45);
    o.start(t); o.stop(t + 1);

    // crash kim loại
    const n = this._noiseSource();
    const lp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.75);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(lp); lp.connect(ng); ng.connect(this.master);
    this._send(ng, 0.6);
    n.start(t); n.stop(t + 0.9);

    // chuông đồng ngân
    [NOTE.D4, NOTE.A4, NOTE.D5].forEach((f, i) => {
      const bo = ctx.createOscillator();
      const bg = ctx.createGain();
      bo.type = 'triangle';
      bo.frequency.value = f;
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.14 / (i + 1), t + 0.015);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      bo.connect(bg); bg.connect(this.master);
      this._send(bg, 0.7);
      bo.start(t); bo.stop(t + 1.7);
    });
  }

  /* ---------- CHUÔNG LỘ TÊN ---------- */

  reveal(i = 0, total = 10, side = 0) {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    const step = total <= 1 ? 0 : i / (total - 1);
    const base = PENTA[Math.min(PENTA.length - 1, Math.floor(step * (PENTA.length - 1)))];
    const freq = base * (side === 1 ? 1.5 : 1);   // đội đỏ cao hơn quãng 5

    // FM bell
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modG = ctx.createGain();
    const g = ctx.createGain();

    car.type = 'sine'; car.frequency.value = freq;
    mod.type = 'sine'; mod.frequency.value = freq * 2.74;
    modG.gain.setValueAtTime(freq * 2.2, t);
    modG.gain.exponentialRampToValueAtTime(1, t + 0.42);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);

    mod.connect(modG); modG.connect(car.frequency);
    car.connect(g); g.connect(this.master);
    this._send(g, 0.55);
    car.start(t); car.stop(t + 0.75);
    mod.start(t); mod.stop(t + 0.75);

    // hạt lấp lánh
    const n = this._noiseSource();
    const hp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    hp.type = 'bandpass'; hp.frequency.value = freq * 4; hp.Q.value = 3;
    ng.gain.setValueAtTime(0.045, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);
    this._send(ng, 0.4);
    n.start(t); n.stop(t + 0.2);
  }

  /* ---------- FANFARE kết thúc ---------- */

  fanfare() {
    if (!this._ok()) return;
    const t = this.t;

    // Dm → Bb → F → C (kiểu hùng tráng)
    const chords = [
      { at: 0.00, notes: [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4], dur: 0.62 },
      { at: 0.30, notes: [NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4], dur: 0.70 },
      { at: 0.62, notes: [NOTE.D4, NOTE.F4, NOTE.A4, NOTE.D5], dur: 2.10 },
    ];

    for (const ch of chords) {
      for (const f of ch.notes) this._brass(t + ch.at, f, ch.dur);
    }

    // cymbal
    const ctx = this.ctx;
    const n = this._noiseSource();
    const hp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 5200;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);
    this._send(ng, 0.8);
    n.start(t); n.stop(t + 1.6);

    this._thump(t, 1.2);
    this._thump(t + 0.62, 1.1);
  }

  _brass(at, freq, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, at);
    lp.frequency.exponentialRampToValueAtTime(3400, at + 0.14);
    lp.frequency.exponentialRampToValueAtTime(1100, at + dur);
    lp.Q.value = 1.6;

    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.085, at + 0.045);
    g.gain.setValueAtTime(0.085, at + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.3);

    // 3 dao động lệch pha cho dày
    [-8, 0, 8].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(at); o.stop(at + dur + 0.35);
    });

    lp.connect(g); g.connect(this.master);
    this._send(g, 0.5);
  }

  /* ---------- swoosh khi panel trượt vào ---------- */

  swoosh(side = 0) {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    const n = this._noiseSource();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.16);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.42);
    bp.Q.value = 1.2;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);

    n.connect(bp); bp.connect(g);
    if (pan) { pan.pan.value = side === 0 ? -0.6 : 0.6; g.connect(pan); pan.connect(this.master); }
    else g.connect(this.master);
    this._send(g, 0.4);
    n.start(t); n.stop(t + 0.5);
  }

  /* ---------- triệu hồi thẻ tên (chế độ chia chậm) ---------- */

  summon(side = 0) {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    const base = side === 1 ? NOTE.A3 : NOTE.D3;

    // gió thổi mở ra
    const n = this._noiseSource();
    const bp = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.26);
    bp.Q.value = 1.4;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.1, t + 0.24);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    n.connect(bp); bp.connect(ng); ng.connect(this.master);
    this._send(ng, 0.4);
    n.start(t); n.stop(t + 0.44);

    // hợp âm nhấn (quãng 5)
    [base, base * 1.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i * 6;
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      this._send(g, 0.5);
      o.start(t); o.stop(t + 0.95);
    });
  }

  /** thẻ đáp xuống đội */
  land() {
    if (!this._ok()) return;
    const t = this.t, ctx = this.ctx;
    this._thump(t, 0.5);

    const n = this._noiseSource();
    const hp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2400;
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(hp); hp.connect(g); g.connect(this.master);
    this._send(g, 0.45);
    n.start(t); n.stop(t + 0.24);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.init();
    if (this.master) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.02);
    }
  }
}

export const sfx = new SFX();
