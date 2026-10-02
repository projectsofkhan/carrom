/* ═══════════════════════════════════════════════════════════
   CARROM 3P • v9
   • Striker pockets (foul = −20)
   • First to 100 wins
   • Solid flat colors, pure white bg
   • Two Player on One Screen added
   • Striker adjuster skips puck overlap zones
   • 3 Player on One Screen (formerly "Practice Solo")
═══════════════════════════════════════════════════════════ */

const WIN_SCORE = 100;
const STRIKER_FOUL = -20;

const GAME = {
  mode: 'menu',             // menu | host | join | local | playing
  myPlayerIndex: 0,
  currentTurn: 0,
  isHost: false,
  // local-only flags
  localMode: null,          // null | 'practice3p' | 'local2p'
  isPractice: false,
  roomCode: null,
  players: [
    { id: 'me', connected: true, score: 0 },
    { id: null, connected: false, score: 0 },
    { id: null, connected: false, score: 0 }
  ],
  activePlayers: 3,         // 2 for local 2P
  audioEnabled: true,
  soundVolume: 0.55
};

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#9c6ade'];
const POINTS = { black: 10, white: 20 };
const playerLabel = i => (i === GAME.myPlayerIndex) ? 'YOU' : 'P' + (i + 1);

/* ───────── AUDIO ───────── */
const AudioManager = {
  _ctx: null, _master: null,

  init() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._ctx.createGain();
        this._master.gain.value = 1;
        this._master.connect(this._ctx.destination);
      } catch (e) {}
    }
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  },

  play(type, opts = {}) {
    if (!GAME.audioEnabled || !this._ctx) return;
    const pan = Math.max(-1, Math.min(1, opts.pan ?? 0));
    const vol = opts.volume ?? 1;
    this.synth(type, pan, vol);
  },

  out(pan, volume) {
    const ctx = this._ctx;
    const g = ctx.createGain();
    g.gain.value = GAME.soundVolume * volume;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this._master || ctx.destination);
    } else g.connect(this._master || ctx.destination);
    return g;
  },

  synth(type, pan, volume) {
    try {
      const ctx = this._ctx;
      const out = this.out(pan, volume);
      switch (type) {
        case 'striker_hit':
          this.tone(ctx, out, 1100, 380, 'square', 0.045, 0.5);
          this.tone(ctx, out, 520, 260, 'triangle', 0.06, 0.35);
          this.noise(ctx, out, 0.03, 0.18);
          break;
        case 'puck_hit_soft': this.tone(ctx, out, 720, 380, 'triangle', 0.045, 0.32); break;
        case 'puck_hit_med':
          this.tone(ctx, out, 820, 340, 'triangle', 0.05, 0.42);
          this.noise(ctx, out, 0.02, 0.12);
          break;
        case 'puck_hit_hard':
          this.tone(ctx, out, 980, 260, 'square', 0.05, 0.5);
          this.tone(ctx, out, 500, 240, 'triangle', 0.06, 0.32);
          this.noise(ctx, out, 0.028, 0.2);
          break;
        case 'wall_tick': this.tone(ctx, out, 340, 180, 'sine', 0.05, 0.2); break;
        case 'wall_thud':
          this.tone(ctx, out, 220, 110, 'sine', 0.09, 0.42);
          this.noise(ctx, out, 0.03, 0.14);
          break;
        case 'puck_pocket':
          this.tone(ctx, out, 260, 90, 'sine', 0.14, 0.42);
          this.tone(ctx, out, 420, 200, 'triangle', 0.08, 0.3);
          this.tone(ctx, out, 1320, 880, 'sine', 0.22, 0.22);
          break;
        case 'striker_pocket':
          // lower, ominous double-thud
          this.tone(ctx, out, 180, 70, 'square', 0.3, 0.55);
          this.tone(ctx, out, 120, 55, 'sawtooth', 0.36, 0.4);
          this.melody(ctx, out, [320, 200], 0.12, 0.32);
          break;
        case 'striker_roll': this.tone(ctx, out, 300, 240, 'triangle', 0.06, 0.12); break;
        case 'shoot':
          this.tone(ctx, out, 440, 200, 'triangle', 0.075, 0.5);
          this.noise(ctx, out, 0.02, 0.12);
          break;
        case 'pickup': this.tone(ctx, out, 640, 800, 'sine', 0.045, 0.22); break;
        case 'release': this.tone(ctx, out, 520, 320, 'sine', 0.045, 0.2); break;
        case 'click': this.tone(ctx, out, 900, 500, 'sine', 0.028, 0.16); break;
        case 'connect': this.melody(ctx, out, [520, 780], 0.075, 0.28); break;
        case 'notification': this.tone(ctx, out, 980, 720, 'sine', 0.11, 0.24); break;
        case 'turn': this.melody(ctx, out, [500, 660], 0.07, 0.26); break;
        case 'turn_pass': this.melody(ctx, out, [500, 380], 0.09, 0.28); break;
        case 'second_chance': this.melody(ctx, out, [660, 880, 1100], 0.06, 0.28); break;
        case 'foul': this.tone(ctx, out, 320, 120, 'square', 0.2, 0.4); break;
        case 'win': this.melody(ctx, out, [523, 659, 784, 1047], 0.13, 0.4); break;
      }
    } catch (e) {}
  },

  tone(ctx, dest, f1, f2, wave, dur, gv) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gv, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain); gain.connect(dest);
    osc.start(now); osc.stop(now + dur + 0.02);
  },

  noise(ctx, dest, dur, gv) {
    const now = ctx.currentTime;
    const size = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gv, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(g); g.connect(dest); src.start(now);
  },

  melody(ctx, dest, notes, noteDur, gv) {
    let t = ctx.currentTime;
    notes.forEach(f => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gv, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + noteDur + 0.02);
      t += noteDur;
    });
  }
};

/* ───────── NETWORK (unchanged) ───────── */
const Network = {
  peer: null, connections: [], isHost: false, roomCode: null,
  onData: null, onError: null, onPeerJoin: null, onPeerLeave: null,

  generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); },
  generateClientId() { return 'c9-cli-' + Math.random().toString(36).slice(2, 9) + '-' + Date.now(); },

  initHost(cb) {
    this.isHost = true;
    this.roomCode = this.generateCode();
    Object.assign(this, { onData: cb.onData, onError: cb.onError, onPeerJoin: cb.onPeerJoin, onPeerLeave: cb.onPeerLeave });
    const peerId = 'c9-' + this.roomCode;
    return new Promise((resolve, reject) => {
      let settled = false, attempts = 0;
      const maxAttempts = 6;
      const tryCreate = () => {
        attempts++;
        try {
          if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
          this.peer = new Peer(peerId, {
            debug: 0,
            config: { iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ] }
          });
          const timeout = setTimeout(() => {
            if (settled) return;
            if (attempts >= maxAttempts) { settled = true; reject(new Error('host-timeout')); return; }
            this.roomCode = this.generateCode(); tryCreate();
          }, 8000);
          this.peer.on('open', () => {
            if (settled) return; settled = true; clearTimeout(timeout);
            AudioManager.play('connect'); resolve(this.roomCode);
          });
          this.peer.on('connection', conn => this.setupConnection(conn));
          this.peer.on('error', err => {
            if (err.type === 'unavailable-id') {
              clearTimeout(timeout);
              if (settled) return;
              this.roomCode = this.generateCode(); tryCreate(); return;
            }
            if (!settled) { settled = true; clearTimeout(timeout); reject(err); }
            else if (this.onError) this.onError(err);
          });
          this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) {} });
        } catch (e) { if (!settled) { settled = true; reject(e); } }
      };
      tryCreate();
    });
  },

  initClient(roomCode, cb) {
    this.isHost = false;
    this.roomCode = roomCode;
    Object.assign(this, { onData: cb.onData, onError: cb.onError, onPeerJoin: cb.onPeerJoin, onPeerLeave: cb.onPeerLeave });
    const hostPeerId = 'c9-' + roomCode;
    const clientId = this.generateClientId();
    return new Promise((resolve, reject) => {
      let settled = false, retries = 0;
      const maxRetries = 3;
      const tryConnect = () => {
        retries++;
        try {
          if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
          this.peer = new Peer(clientId + '-r' + retries, {
            debug: 0,
            config: { iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ] }
          });
          const attemptTimeout = setTimeout(() => {
            if (settled) return;
            if (retries >= maxRetries) { settled = true; reject(new Error('client-timeout')); }
            else tryConnect();
          }, 15000);
          this.peer.on('open', () => {
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            conn.on('open', () => {
              if (settled) return; settled = true; clearTimeout(attemptTimeout);
              if (!this.connections.includes(conn)) this.connections.push(conn);
              conn.on('data', d => { if (this.onData) this.onData(d, conn); });
              conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
                if (this.onPeerLeave) this.onPeerLeave(conn);
              });
              conn.on('error', e => console.error('conn error:', e));
              setTimeout(() => { try { conn.send({ type: 'hello' }); } catch (e) {} }, 100);
              AudioManager.play('connect'); resolve(conn);
            });
            conn.on('error', err => {
              if (!settled) {
                clearTimeout(attemptTimeout);
                if (retries < maxRetries) tryConnect();
                else { settled = true; reject(err); }
              }
            });
          });
          this.peer.on('error', err => {
            if (err.type === 'peer-unavailable') {
              clearTimeout(attemptTimeout);
              if (!settled) {
                if (retries < maxRetries) setTimeout(() => tryConnect(), 500);
                else { settled = true; reject(new Error('peer-unavailable')); }
              }
              return;
            }
            if (err.type === 'unavailable-id') {
              clearTimeout(attemptTimeout);
              if (!settled) setTimeout(() => tryConnect(), 200);
              return;
            }
            if (!settled) { settled = true; clearTimeout(attemptTimeout); reject(err); }
            else if (this.onError) this.onError(err);
          });
          this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) {} });
        } catch (e) {
          if (retries < maxRetries) setTimeout(() => tryConnect(), 500);
          else if (!settled) { settled = true; reject(e); }
        }
      };
      tryConnect();
    });
  },

  setupConnection(conn) {
    conn.on('open', () => {
      if (!this.connections.includes(conn)) this.connections.push(conn);
      AudioManager.play('connect');
      if (this.onPeerJoin) this.onPeerJoin(conn);
    });
    conn.on('data', d => { if (this.onData) this.onData(d, conn); });
    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
      if (this.onPeerLeave) this.onPeerLeave(conn);
    });
    conn.on('error', e => console.error('host conn error:', e));
  },

  broadcast(data) { this.connections.forEach(c => { if (c.open) { try { c.send(data); } catch (e) {} } }); },
  sendTo(conn, data) { if (conn && conn.open) { try { conn.send(data); } catch (e) {} } },
  disconnect() { if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; } this.connections = []; }
};

/* ───────── PHYSICS ───────── */
const Physics = {
  W: 700, H: 700,
  BOARD_PADDING: 62,
  PUCK_RADIUS: 17,
  STRIKER_RADIUS: 24,
  POCKET_RADIUS: 46,
  FRICTION: 0.989,
  WALL_BOUNCE: 0.8,
  MIN_SPEED: 0.05,
  MAX_POWER: 26,
  RESTITUTION: 0.94,

  pockets: [], pucks: [], striker: null,

  init() {
    const p = this.BOARD_PADDING;
    this.pockets = [
      { x: p, y: p }, { x: this.W - p, y: p },
      { x: p, y: this.H - p }, { x: this.W - p, y: this.H - p }
    ];
  },

  bounds() { const p = this.BOARD_PADDING; return { left: p, right: this.W - p, top: p, bottom: this.H - p }; },

  getBaseline(i) {
    const p = this.BOARD_PADDING;
    const inset = 46;
    switch (i) {
      case 0: return { axis: 'x', x: this.W / 2, y: this.H - p - inset, min: p + 76, max: this.W - p - 76 };
      case 1: return { axis: 'y', x: p + inset, y: this.H / 2, min: p + 76, max: this.H - p - 76 };
      case 2: return { axis: 'x', x: this.W / 2, y: p + inset, min: p + 76, max: this.W - p - 76 };
      default: return { axis: 'x', x: this.W / 2, y: this.H - p - inset, min: p + 76, max: this.W - p - 76 };
    }
  },

  createPucks() {
    const pucks = [];
    const cx = this.W / 2, cy = this.H / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
      pucks.push({ x: cx + Math.cos(a) * 58, y: cy + Math.sin(a) * 58, vx: 0, vy: 0,
        radius: this.PUCK_RADIUS, color: '#f3e3bd', rim: '#c19a52',
        type: 'white', points: POINTS.white, active: true, trail: [] });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      pucks.push({ x: cx + Math.cos(a) * 30, y: cy + Math.sin(a) * 30, vx: 0, vy: 0,
        radius: this.PUCK_RADIUS, color: '#1a1a1a', rim: '#000',
        type: 'black', points: POINTS.black, active: true, trail: [] });
    }
    pucks.push({ x: cx, y: cy, vx: 0, vy: 0, radius: this.PUCK_RADIUS,
      color: '#f3e3bd', rim: '#c19a52', type: 'white', points: POINTS.white, active: true, trail: [] });
    return pucks;
  },

  createStriker(i, sideOffset = 0.5) {
    const base = this.getBaseline(i);
    let x, y;
    if (base.axis === 'x') { x = base.min + (base.max - base.min) * sideOffset; y = base.y; }
    else { x = base.x; y = base.min + (base.max - base.min) * sideOffset; }
    const s = { x, y, vx: 0, vy: 0, radius: this.STRIKER_RADIUS, color: PLAYER_COLORS[i], type: 'striker', active: true, trail: [] };
    this.separateFromPucks(s);
    return s;
  },

  separateFromPucks(s) {
    for (let n = 0; n < 24; n++) {
      let anyOverlap = false;
      for (const puck of this.pucks) {
        if (!puck.active) continue;
        const dx = s.x - puck.x, dy = s.y - puck.y;
        const d = Math.hypot(dx, dy);
        const minD = s.radius + puck.radius + 1;
        if (d < minD && d > 0.01) {
          anyOverlap = true;
          const nx = dx / d, ny = dy / d;
          s.x = puck.x + nx * minD;
          s.y = puck.y + ny * minD;
        }
      }
      if (!anyOverlap) return;
    }
  },

  /* Check if striker at (x,y) would collide with any puck */
  strikerOverlapsPuck(x, y, extraMargin = 4) {
    for (const puck of this.pucks) {
      if (!puck.active) continue;
      const dx = x - puck.x, dy = y - puck.y;
      const d = Math.hypot(dx, dy);
      const minD = this.STRIKER_RADIUS + puck.radius + extraMargin;
      if (d < minD) return true;
    }
    return false;
  },

  /* Given an axis position pct [0..1], find a legal slot that doesn't overlap a puck. */
  findFreeBaselinePos(playerIndex, targetPct) {
    const base = this.getBaseline(playerIndex);
    const min = base.min, max = base.max;
    const span = max - min;
    // try target first
    const tryPct = (p) => {
      const clamped = Math.max(0, Math.min(1, p));
      const pos = min + span * clamped;
      const x = base.axis === 'x' ? pos : base.x;
      const y = base.axis === 'x' ? base.y : pos;
      if (!this.strikerOverlapsPuck(x, y)) return { pct: clamped, x, y };
      return null;
    };
    let r = tryPct(targetPct); if (r) return r;
    // scan outward in small steps
    const step = 0.01;
    for (let d = step; d <= 1; d += step) {
      r = tryPct(targetPct + d); if (r) return r;
      r = tryPct(targetPct - d); if (r) return r;
    }
    // no legal slot — return the original clamped
    const clamped = Math.max(0, Math.min(1, targetPct));
    const pos = min + span * clamped;
    return {
      pct: clamped,
      x: base.axis === 'x' ? pos : base.x,
      y: base.axis === 'x' ? base.y : pos
    };
  },

  resolveCollision(a, b, onHit) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    const minDist = a.radius + b.radius;
    if (d2 >= minDist * minDist || d2 < 0.0001) return;
    const dist = Math.sqrt(d2);
    const nx = dx / dist, ny = dy / dist;
    const overlap = (minDist - dist) * 0.5;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    const vn = dvx * nx + dvy * ny;
    if (vn > 0) return;
    const invA = 1 / a.radius, invB = 1 / b.radius;
    const j = -(1 + this.RESTITUTION) * vn / (invA + invB);
    const clampedJ = Math.max(-24, Math.min(24, j));
    const ix = clampedJ * nx, iy = clampedJ * ny;
    a.vx -= ix * invA; a.vy -= iy * invA;
    b.vx += ix * invB; b.vy += iy * invB;
    if (Math.abs(vn) > 0.4 && onHit) {
      onHit(Math.min(Math.abs(vn) / 18, 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  },

  step(onCollision, onPocket, onWall, onStrikerRoll) {
    const b = this.bounds();
    if (this.striker && this.striker.active) {
      const pre = Math.hypot(this.striker.vx, this.striker.vy);
      this.stepBody(this.striker, b, onWall);
      this.checkPockets(this.striker, onPocket, true);
      if (pre > 2.4 && onStrikerRoll) onStrikerRoll(this.striker);
    }
    for (const puck of this.pucks) {
      if (!puck.active) continue;
      this.stepBody(puck, b, onWall);
      this.checkPockets(puck, onPocket, false);
    }
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.pucks.length; i++) {
        if (!this.pucks[i].active) continue;
        for (let j = i + 1; j < this.pucks.length; j++) {
          if (!this.pucks[j].active) continue;
          this.resolveCollision(this.pucks[i], this.pucks[j], iter === 0 ? onCollision : null);
        }
      }
      if (this.striker && this.striker.active) {
        for (const puck of this.pucks) {
          if (!puck.active) continue;
          this.resolveCollision(this.striker, puck, iter === 0 ? onCollision : null);
        }
      }
    }
  },

  stepBody(body, bounds, onWall) {
    body.x += body.vx; body.y += body.vy;
    body.vx *= this.FRICTION; body.vy *= this.FRICTION;
    const speed = Math.hypot(body.vx, body.vy);
    if (speed < this.MIN_SPEED) { body.vx = 0; body.vy = 0; }
    if (speed > 2.5) { body.trail.push({ x: body.x, y: body.y }); if (body.trail.length > 8) body.trail.shift(); }
    else if (body.trail.length > 0) body.trail.shift();

    let hitWall = false, wallSpeed = 0;
    if (body.x - body.radius < bounds.left) { body.x = bounds.left + body.radius; wallSpeed = Math.abs(body.vx); body.vx *= -this.WALL_BOUNCE; hitWall = true; }
    else if (body.x + body.radius > bounds.right) { body.x = bounds.right - body.radius; wallSpeed = Math.abs(body.vx); body.vx *= -this.WALL_BOUNCE; hitWall = true; }
    if (body.y - body.radius < bounds.top) { body.y = bounds.top + body.radius; wallSpeed = Math.max(wallSpeed, Math.abs(body.vy)); body.vy *= -this.WALL_BOUNCE; hitWall = true; }
    else if (body.y + body.radius > bounds.bottom) { body.y = bounds.bottom - body.radius; wallSpeed = Math.max(wallSpeed, Math.abs(body.vy)); body.vy *= -this.WALL_BOUNCE; hitWall = true; }
    if (hitWall && onWall) onWall(body, wallSpeed);
  },

  checkPockets(body, onPocket, isStriker) {
    for (const p of this.pockets) {
      const dx = body.x - p.x, dy = body.y - p.y;
      const threshold = this.POCKET_RADIUS - body.radius * 0.5;
      if (dx * dx + dy * dy < threshold * threshold) {
        body.active = false; body.vx = 0; body.vy = 0;
        if (onPocket) onPocket(body, p, isStriker);
        return true;
      }
    }
    return false;
  },

  allStopped() {
    if (this.striker && this.striker.active && Math.hypot(this.striker.vx, this.striker.vy) > 0.01) return false;
    for (const p of this.pucks) if (p.active && Math.hypot(p.vx, p.vy) > 0.01) return false;
    return true;
  },

  activePucksCount() { return this.pucks.filter(p => p.active).length; },

  snapshot() {
    return {
      pucks: this.pucks.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, active: p.active })),
      striker: this.striker ? { x: this.striker.x, y: this.striker.y, vx: this.striker.vx, vy: this.striker.vy, active: this.striker.active } : null
    };
  },
  applySnapshot(s) {
    if (!s) return;
    if (s.pucks) s.pucks.forEach((ps, i) => {
      const p = this.pucks[i]; if (!p) return;
      p.x = ps.x; p.y = ps.y; p.vx = ps.vx; p.vy = ps.vy; p.active = ps.active;
    });
    if (s.striker && this.striker) {
      this.striker.x = s.striker.x; this.striker.y = s.striker.y;
      this.striker.vx = s.striker.vx; this.striker.vy = s.striker.vy;
      this.striker.active = s.striker.active;
    }
  }
};

/* ───────── RENDERER (flat solid colors) ───────── */
const Renderer = {
  canvas: null, ctx: null, W: 700, H: 700, time: 0, pocketPops: [],

  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.W; this.canvas.height = this.H;
  },

  addPocketPop(x, y, color) { this.pocketPops.push({ x, y, color, life: 1 }); },

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawBoard();
    this.drawBaseline();
    this.drawTrails();
    this.drawPucks();
    this.drawStriker();
    this.drawPocketPops();
    this.drawAim();
  },

  drawBoard() {
    const ctx = this.ctx, p = Physics.BOARD_PADDING;
    const w = this.W - p * 2, h = this.H - p * 2;

    // Solid wooden surround (flat)
    ctx.fillStyle = '#d9b678';
    this.roundRect(ctx, 0, 0, this.W, this.H, 34); ctx.fill();

    // Flat playing surface
    ctx.fillStyle = '#fffdf6';
    this.roundRect(ctx, p - 10, p - 10, w + 20, h + 20, 18); ctx.fill();

    // Border
    ctx.strokeStyle = '#a0763c';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, p - 10, p - 10, w + 20, h + 20, 18); ctx.stroke();

    // Centre circle
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 74, 0, Math.PI * 2);
    ctx.strokeStyle = '#e6d5b0'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#a0763c'; ctx.fill();
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fffdf6'; ctx.fill();

    // Corner arcs
    const corners = [
      { x: p, y: p, s: 0, e: Math.PI / 2 },
      { x: this.W - p, y: p, s: Math.PI / 2, e: Math.PI },
      { x: this.W - p, y: this.H - p, s: Math.PI, e: Math.PI * 1.5 },
      { x: p, y: this.H - p, s: Math.PI * 1.5, e: Math.PI * 2 }
    ];
    ctx.strokeStyle = '#ece0c4';
    ctx.lineWidth = 1.4;
    corners.forEach(c => { ctx.beginPath(); ctx.arc(c.x, c.y, 64, c.s, c.e); ctx.stroke(); });

    // Pockets — flat solid black with a thin wooden ring
    for (const pk of Physics.pockets) {
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1207'; ctx.fill();
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = '#000'; ctx.fill();
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = '#8a5a20'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  },

  drawBaseline() {
    if (GAME.mode === 'menu') return;
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    const isMyTurn = isLocal || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMyTurn) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.3) return;
    const base = Physics.getBaseline(GAME.currentTurn);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = PLAYER_COLORS[GAME.currentTurn];
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -this.time * 26;
    ctx.beginPath();
    if (base.axis === 'x') { ctx.moveTo(base.min, base.y); ctx.lineTo(base.max, base.y); }
    else { ctx.moveTo(base.x, base.min); ctx.lineTo(base.x, base.max); }
    ctx.stroke();
    ctx.restore();
  },

  drawTrails() {
    const ctx = this.ctx;
    const all = [Physics.striker, ...Physics.pucks];
    for (const b of all) {
      if (!b || !b.active || !b.trail || b.trail.length < 2) continue;
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const k = i / b.trail.length;
        const a = k * 0.22;
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.radius * (0.5 + k * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = b.color + Math.floor(a * 255).toString(16).padStart(2, '0');
        ctx.fill();
      }
    }
  },

  drawPucks() {
    const ctx = this.ctx;
    for (const puck of Physics.pucks) {
      if (!puck.active) continue;
      ctx.beginPath(); ctx.arc(puck.x, puck.y + 1.8, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 90, 40, 0.15)'; ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = puck.color; ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius - 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = puck.type === 'black' ? '#000' : '#c19a52';
      ctx.lineWidth = 1.2; ctx.stroke();
      // Simple highlight (flat arc)
      ctx.beginPath();
      ctx.arc(puck.x - puck.radius * 0.25, puck.y - puck.radius * 0.25, puck.radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = puck.type === 'white' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = puck.type === 'white' ? '#c19a52' : '#333'; ctx.fill();
    }
  },

  drawStriker() {
    const s = Physics.striker;
    if (!s || !s.active) return;
    const ctx = this.ctx;
    const isMoving = Math.hypot(s.vx, s.vy) > 0.3;
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    const isMyTurn = isLocal || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMoving && isMyTurn && GAME.mode !== 'menu') {
      const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 6 + pulse * 2, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.35 + pulse * 0.25;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(s.x, s.y + 2.2, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 90, 40, 0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x - s.radius * 0.25, s.y - s.radius * 0.25, s.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
  },

  drawPocketPops() {
    const ctx = this.ctx;
    for (let i = this.pocketPops.length - 1; i >= 0; i--) {
      const pop = this.pocketPops[i];
      pop.life -= 0.045;
      if (pop.life <= 0) { this.pocketPops.splice(i, 1); continue; }
      const radius = Physics.POCKET_RADIUS * (1 + (1 - pop.life) * 0.9);
      ctx.beginPath(); ctx.arc(pop.x, pop.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = pop.color + Math.floor(pop.life * 180).toString(16).padStart(2, '0');
      ctx.lineWidth = 3 * pop.life; ctx.stroke();
    }
  },

  drawAim() {
    if (!Input.isAiming) return;
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    const isMyTurn = isLocal || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMyTurn) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.4) return;
    const ctx = this.ctx;
    const start = Input.aimStart, current = Input.aimCurrent;
    if (!start || !current) return;
    const dx = current.x - start.x, dy = current.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) return;
    const power = Math.min(dist / 130, 1);
    const angle = Math.atan2(-dy, -dx);
    const lineLen = 90 + power * 240;
    const endX = s.x + Math.cos(angle) * lineLen;
    const endY = s.y + Math.sin(angle) * lineLen;

    // White halo
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -this.time * 38;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.stroke();
    // Solid aim line
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#d99a10';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    const endRadius = 5 + power * 9;
    ctx.beginPath(); ctx.arc(endX, endY, endRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217,154,16,0.25)'; ctx.fill();
    ctx.strokeStyle = '#d99a10'; ctx.lineWidth = 2; ctx.stroke();

    const aLen = 10;
    ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(-aLen, -aLen * 0.55); ctx.lineTo(-aLen, aLen * 0.55); ctx.closePath();
    ctx.fillStyle = '#d99a10'; ctx.fill();
    ctx.restore();

    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 6 + power * 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#d99a10'; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
  },

  roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
};

/* ───────── INPUT (aim from anywhere) ───────── */
const Input = {
  isAiming: false, aimStart: null, aimCurrent: null, canvas: null,
  _pointerId: null, _lastMoveBroadcast: 0,

  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    window.addEventListener('pointermove', this.onMove.bind(this), { passive: false });
    window.addEventListener('pointerup', this.onUp.bind(this));
    window.addEventListener('pointercancel', this.onCancel.bind(this));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  coords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  },

  canShoot() {
    if (GAME.mode !== 'playing' && GAME.mode !== 'local' && !GAME.isPractice) return false;
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    if (!isLocal && GAME.currentTurn !== GAME.myPlayerIndex) return false;
    const s = Physics.striker;
    if (!s || !s.active) return false;
    if (Math.hypot(s.vx, s.vy) > 0.3) return false;
    if (Game.isResolving) return false;
    return true;
  },

  isInsideBoard(pos) {
    const p = Physics.BOARD_PADDING - 2;
    return pos.x > p && pos.x < Physics.W - p && pos.y > p && pos.y < Physics.H - p;
  },

  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this._pointerId !== null) return;
    AudioManager.init();
    if (!this.canShoot()) return;
    const pos = this.coords(e);
    if (!this.isInsideBoard(pos)) return;
    this._pointerId = e.pointerId;
    this.isAiming = true;
    this.aimStart = { x: pos.x, y: pos.y };
    this.aimCurrent = { x: pos.x, y: pos.y };
    try { e.target.setPointerCapture?.(e.pointerId); } catch (err) {}
    AudioManager.play('pickup');
  },

  onMove(e) {
    if (!this.isAiming) return;
    if (e.pointerId !== undefined && e.pointerId !== this._pointerId) return;
    if (e.cancelable) e.preventDefault();
    const pos = this.coords(e);
    this.aimCurrent = { x: pos.x, y: pos.y };
    const dx = pos.x - this.aimStart.x, dy = pos.y - this.aimStart.y;
    Game.updatePower(Math.min(Math.hypot(dx, dy) / 130, 1));
  },

  onUp(e) {
    if (!this.isAiming) return;
    if (e.pointerId !== undefined && e.pointerId !== this._pointerId) return;
    const start = this.aimStart;
    const cur = this.aimCurrent;
    this.isAiming = false;
    this._pointerId = null;
    this.aimStart = null;
    this.aimCurrent = null;
    Game.updatePower(0);
    if (!start || !cur) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    const dx = cur.x - start.x, dy = cur.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) { AudioManager.play('release'); return; }
    const power = Math.min(dist / 130, 1) * Physics.MAX_POWER;
    const angle = Math.atan2(-dy, -dx);
    s.vx = Math.cos(angle) * power;
    s.vy = Math.sin(angle) * power;
    AudioManager.play('shoot');
    if (GAME.mode === 'playing' && !GAME.isPractice) {
      Network.broadcast({
        type: 'shot', player: GAME.myPlayerIndex,
        vx: s.vx, vy: s.vy, x: s.x, y: s.y
      });
    }
    Game.isResolving = true;
    Game.resolveStartTime = performance.now();
    Game.turnHadFoul = false;
    Game.turnPocketed = 0;
  },

  onCancel() {
    if (!this.isAiming) return;
    this.isAiming = false;
    this._pointerId = null;
    this.aimStart = null;
    this.aimCurrent = null;
    Game.updatePower(0);
    AudioManager.play('release');
  }
};

/* ───────── GAME CONTROLLER ───────── */
const Game = {
  isResolving: false, resolveStartTime: 0, loopId: null, lastTime: 0,
  turnHadFoul: false, turnPocketed: 0, ended: false,
  _lastNetTick: 0, _lastRollSound: 0,

  start() {
    Renderer.init();
    Input.init(Renderer.canvas);
    Physics.init();
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
    this.isResolving = false;
    this.turnHadFoul = false;
    this.turnPocketed = 0;
    this.ended = false;
    this.updateAdjustSlider();
    this.updateWaitBar();
    this.lastTime = performance.now();
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loop(this.lastTime);
  },

  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    Renderer.time += dt;

    const isAuthority = true; // local & host always simulate

    if (isAuthority) {
      Physics.step(
        (intensity, x, y) => {
          const pan = (x / Physics.W) * 2 - 1;
          const strikerInvolved = Physics.striker && Physics.striker.active &&
            Math.hypot(Physics.striker.x - x, Physics.striker.y - y) < 60;
          if (strikerInvolved) AudioManager.play('striker_hit', { pan, volume: Math.min(0.55 + intensity * 0.55, 1) });
          else if (intensity > 0.7) AudioManager.play('puck_hit_hard', { pan, volume: Math.min(intensity, 1) });
          else if (intensity > 0.35) AudioManager.play('puck_hit_med', { pan, volume: Math.min(intensity + 0.15, 0.9) });
          else AudioManager.play('puck_hit_soft', { pan, volume: Math.min(intensity + 0.3, 0.8) });
        },
        (body, pocket, isStriker) => {
          const pan = (body.x / Physics.W) * 2 - 1;
          Renderer.addPocketPop(pocket.x, pocket.y, body.color);
          if (isStriker) {
            // STRIKER FOUL: −20
            AudioManager.play('striker_pocket', { pan });
            this.turnHadFoul = true;
            const idx = GAME.currentTurn;
            GAME.players[idx].score = Math.max(0, GAME.players[idx].score + STRIKER_FOUL);
            FloatingText.spawn(pocket.x, pocket.y - 20, `${STRIKER_FOUL}`, '#dc2626');
            Toast.show(`Foul! Striker pocketed · ${STRIKER_FOUL} pts`, 'error', '⚠');
            this.updateScores();
            if (GAME.isHost && GAME.mode === 'playing' && !GAME.isPractice) {
              Network.broadcast({ type: 'score_update', playerIndex: idx, score: GAME.players[idx].score });
            }
          } else {
            AudioManager.play('puck_pocket', { pan });
            const pts = body.points || 0;
            GAME.players[GAME.currentTurn].score += pts;
            this.turnPocketed++;
            this.updateScores();
            FloatingText.spawn(pocket.x, pocket.y - 20, `+${pts}`, PLAYER_COLORS[GAME.currentTurn]);
            if (GAME.isHost && GAME.mode === 'playing' && !GAME.isPractice) {
              Network.broadcast({ type: 'score_update', playerIndex: GAME.currentTurn, score: GAME.players[GAME.currentTurn].score });
            }
          }
        },
        (body, wallSpeed) => {
          const pan = (body.x / Physics.W) * 2 - 1;
          const v = Math.min(wallSpeed / 14, 1);
          if (v < 0.15) return;
          if (v > 0.5) AudioManager.play('wall_thud', { pan, volume: v });
          else AudioManager.play('wall_tick', { pan, volume: 0.4 + v * 0.4 });
        },
        (striker) => {
          const now = performance.now();
          if (now - this._lastRollSound > 80) {
            this._lastRollSound = now;
            const pan = (striker.x / Physics.W) * 2 - 1;
            const spd = Math.hypot(striker.vx, striker.vy);
            AudioManager.play('striker_roll', { pan, volume: Math.min(0.12 + spd / 34, 0.4) });
          }
        }
      );
    }

    if (this.isResolving) {
      const elapsed = t - this.resolveStartTime;
      const stopped = Physics.allStopped();
      if (stopped || elapsed > 12000) {
        this.isResolving = false;
        if (GAME.mode === 'playing' && GAME.isHost) {
          Network.broadcast({
            type: 'sync_state',
            state: Physics.snapshot(),
            currentTurn: GAME.currentTurn,
            players: GAME.players
          });
        }
        this.endTurn();
      }
    }

    if (GAME.isHost && GAME.mode === 'playing' && !GAME.isPractice) {
      const moving = !Physics.allStopped();
      if (moving || this.isResolving) {
        const now = performance.now();
        if (now - this._lastNetTick > 50) {
          this._lastNetTick = now;
          Network.broadcast({ type: 'sync_state', state: Physics.snapshot() });
        }
      }
    }

    // Win by 100
    if (!this.ended) {
      const winner = this.checkWinner();
      if (winner !== -1) {
        this.ended = true;
        this.endGame(winner);
      } else if (Physics.activePucksCount() === 0 && !this.isResolving) {
        this.ended = true;
        this.endGame(-1);
      }
    }

    FloatingText.update(dt);
    Renderer.draw();
    FloatingText.draw(Renderer.ctx);
    this.loopId = requestAnimationFrame(this.loop.bind(this));
  },

  checkWinner() {
    for (let i = 0; i < GAME.activePlayers; i++) {
      if (GAME.players[i].score >= WIN_SCORE) return i;
    }
    return -1;
  },

  endTurn() {
    const foul = this.turnHadFoul;
    const scored = this.turnPocketed > 0;

    if (foul) {
      AudioManager.play('turn_pass');
    } else if (scored) {
      Toast.show('Nice! Play again', 'success', '✦');
      AudioManager.play('second_chance');
    } else {
      AudioManager.play('turn');
    }

    const keepTurn = !foul && scored;

    this.turnHadFoul = false;
    this.turnPocketed = 0;

    if (!keepTurn) {
      GAME.currentTurn = (GAME.currentTurn + 1) % GAME.activePlayers;
    }
    Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);

    if (GAME.mode === 'playing' && !GAME.isPractice && GAME.isHost) {
      Network.broadcast({ type: 'turn_change', currentTurn: GAME.currentTurn, players: GAME.players });
    }

    this.updateTurnUI();
    this.updateAdjustSlider();
    this.updateWaitBar();
  },

  endGame(winnerIdx) {
    AudioManager.play('win');
    this.confetti();
    if (winnerIdx === -1) {
      let max = -1, w = 0;
      GAME.players.forEach((p, i) => { if (i < GAME.activePlayers && p.score > max) { max = p.score; w = i; } });
      winnerIdx = w;
    }
    if (GAME.isHost && GAME.mode === 'playing') {
      Network.broadcast({ type: 'game_over', winner: winnerIdx, players: GAME.players });
    }
    setTimeout(() => this.showGameOver(winnerIdx), 650);
  },

  showGameOver(winnerIdx) {
    const overlay = document.getElementById('gameOverOverlay');
    const icon = document.getElementById('goIcon');
    const heading = document.getElementById('goHeading');
    const text = document.getElementById('goText');
    const scores = document.getElementById('goScores');
    const isMe = winnerIdx === GAME.myPlayerIndex && GAME.mode !== 'local';
    icon.textContent = isMe ? '🏆' : '🎯';
    heading.textContent = isMe ? 'VICTORY' : (winnerIdx === 0 ? 'VICTORY' : 'GAME OVER');
    text.textContent = playerLabel(winnerIdx) + ' wins · ' + GAME.players[winnerIdx].score + ' pts';
    scores.innerHTML = GAME.players.slice(0, GAME.activePlayers).map((p, i) => `
      <div class="go-score" style="animation-delay:${i * 0.08 + 0.1}s">
        <div class="go-score-val" style="color:${PLAYER_COLORS[i]}">${p.score}</div>
        <div class="go-score-lbl">${playerLabel(i)}</div>
      </div>
    `).join('');
    overlay.classList.remove('hidden');
  },

  confetti() {
    const colors = ['#e63946', '#2a9d8f', '#9c6ade', '#d99a10', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.width = (6 + Math.random() * 8) + 'px';
        el.style.height = (6 + Math.random() * 8) + 'px';
        el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        el.style.animationDuration = (2 + Math.random() * 2) + 's';
        el.style.animationDelay = (Math.random() * 0.5) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4500);
      }, i * 30);
    }
  },

  updatePower(p) {
    const fill = document.getElementById('powerFill');
    const row = document.getElementById('powerRow');
    fill.style.width = (p * 100) + '%';
    row.classList.toggle('active', p > 0.05);
  },

  updateTurnUI() {
    document.querySelectorAll('.player-chip').forEach((c, i) => {
      c.classList.toggle('active', i === GAME.currentTurn);
      c.classList.toggle('hidden-chip', i >= GAME.activePlayers);
    });
    const swatch = document.getElementById('turnSwatch');
    const label = document.getElementById('turnLabel');
    swatch.style.background = PLAYER_COLORS[GAME.currentTurn];
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    if (isLocal || GAME.currentTurn === GAME.myPlayerIndex) label.textContent = 'YOUR TURN';
    else label.textContent = playerLabel(GAME.currentTurn) + "'S TURN";
    document.getElementById('boardFrame').classList.toggle('active', isLocal || GAME.currentTurn === GAME.myPlayerIndex);
  },

  updateAdjustSlider() {
    const row = document.getElementById('adjustRow');
    const thumb = document.getElementById('adjustThumb');
    const fill = document.getElementById('adjustFill');
    const track = document.getElementById('adjustTrack');
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    const isMyTurn = isLocal || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMyTurn || !Physics.striker || !Physics.striker.active || this.isResolving) {
      row.classList.add('hidden'); return;
    }
    row.classList.remove('hidden');
    const base = Physics.getBaseline(GAME.currentTurn);
    let pct = 0.5;
    if (base.axis === 'x') pct = (Physics.striker.x - base.min) / (base.max - base.min);
    else pct = (Physics.striker.y - base.min) / (base.max - base.min);
    pct = Math.max(0, Math.min(1, pct));
    thumb.style.left = (pct * 100) + '%';
    fill.style.width = (pct * 100) + '%';

    if (!track.dataset.bound) {
      track.dataset.bound = '1';
      let dragging = false;
      const updateFromClientX = (clientX) => {
        if (!Input.canShoot()) return;
        const rect = track.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const rawPct = x / rect.width;
        // Snap to a free slot (skips positions overlapping pucks)
        const free = Physics.findFreeBaselinePos(GAME.currentTurn, rawPct);
        const s = Physics.striker; if (!s || !s.active) return;
        s.x = free.x;
        s.y = free.y;
        thumb.style.left = (free.pct * 100) + '%';
        fill.style.width = (free.pct * 100) + '%';
        if (GAME.mode === 'playing' && !GAME.isPractice) {
          const now = performance.now();
          if (now - Input._lastMoveBroadcast > 60) {
            Input._lastMoveBroadcast = now;
            Network.broadcast({ type: 'striker_move', player: GAME.myPlayerIndex, x: s.x, y: s.y });
          }
        }
      };
      track.addEventListener('pointerdown', e => { e.preventDefault(); AudioManager.init(); dragging = true; updateFromClientX(e.clientX); });
      window.addEventListener('pointermove', e => { if (!dragging) return; e.preventDefault(); updateFromClientX(e.clientX); }, { passive: false });
      window.addEventListener('pointerup', () => {
        if (!dragging) return; dragging = false;
        if (GAME.mode === 'playing' && !GAME.isPractice && Physics.striker)
          Network.broadcast({ type: 'striker_move', player: GAME.myPlayerIndex, x: Physics.striker.x, y: Physics.striker.y });
      });
    }
  },

  updateWaitBar() {
    const bar = document.getElementById('waitBar');
    const text = document.getElementById('waitBarText');
    const isLocal = GAME.mode === 'local' || GAME.isPractice;
    if (isLocal || GAME.mode === 'menu') { bar.classList.add('hidden'); return; }
    const isMyTurn = GAME.currentTurn === GAME.myPlayerIndex;
    if (isMyTurn) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    text.textContent = playerLabel(GAME.currentTurn) + ' is playing…';
  },

  updateScores() {
    GAME.players.forEach((p, i) => {
      const el = document.getElementById('scoreP' + i);
      if (el) el.textContent = p.score;
      const nameEl = document.getElementById('nameP' + i);
      if (nameEl) nameEl.textContent = playerLabel(i);
    });
    document.querySelectorAll('.player-chip').forEach(chip => {
      const idx = parseInt(chip.dataset.p);
      const nameEl = chip.querySelector('.pc-name');
      if (nameEl) nameEl.textContent = playerLabel(idx);
      chip.classList.toggle('hidden-chip', idx >= GAME.activePlayers);
    });
  }
};

/* ───────── FLOATING POINTS TEXT ───────── */
const FloatingText = {
  items: [],
  spawn(x, y, text, color) { this.items.push({ x, y, text, color, life: 1, vy: -1.4 }); },
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt * 0.9;
      it.y += it.vy;
      it.vy *= 0.96;
      if (it.life <= 0) this.items.splice(i, 1);
    }
  },
  draw(ctx) {
    if (!ctx) return;
    for (const it of this.items) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, it.life);
      ctx.font = '800 26px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(it.text, it.x, it.y);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.x, it.y);
      ctx.restore();
    }
  }
};

/* ───────── UI ───────── */
const UI = {
  init() {
    document.getElementById('createRoomBtn').addEventListener('click', () => this.onCreate());
    document.getElementById('joinRoomBtn').addEventListener('click', () => this.onJoin());
    document.getElementById('practiceBtn').addEventListener('click', () => this.onLocal3P());
    document.getElementById('twoPlayerBtn').addEventListener('click', () => this.onLocal2P());
    document.getElementById('createClose').addEventListener('click', () => this.closeModal('createModal'));
    document.getElementById('joinClose').addEventListener('click', () => this.closeModal('joinModal'));
    document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyCode());
    document.getElementById('shareLinkBtn').addEventListener('click', () => this.shareLink());
    document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
    document.getElementById('connectBtn').addEventListener('click', () => this.connect());
    document.getElementById('backBtn').addEventListener('click', () => this.quit());
    document.getElementById('soundToggle').addEventListener('click', () => this.toggleSound());
    document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain(false));
    document.getElementById('goMenuBtn').addEventListener('click', () => this.goMenu());
    this.setupDigitInputs();
    this.setupChatDropdown();
  },

  setupChatDropdown() {
    const btn = document.getElementById('chatToggle');
    const menu = document.getElementById('chatMenu');
    if (!btn || !menu) return;
    const close = () => { menu.classList.remove('open'); btn.classList.remove('active'); };
    const open = () => { menu.classList.add('open'); btn.classList.add('active'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioManager.init(); AudioManager.play('click');
      menu.classList.contains('open') ? close() : open();
    });
    menu.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sendMessage(item.dataset.msg);
        close();
      });
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.classList.contains('open')) return;
      if (menu.contains(e.target) || btn.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  },

  setupDigitInputs() {
    const inputs = document.querySelectorAll('.digit-input');
    inputs.forEach((input, i) => {
      input.addEventListener('input', e => {
        let v = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = v.slice(0, 1);
        if (v && i < inputs.length - 1) inputs[i + 1].focus();
        this.updateDigitState();
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          inputs[i - 1].focus(); inputs[i - 1].value = ''; this.updateDigitState();
        }
      });
      input.addEventListener('paste', e => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/[^0-9]/g, '').slice(0, 4).split('');
        digits.forEach((d, idx) => { if (inputs[idx]) inputs[idx].value = d; });
        this.updateDigitState();
        const next = Math.min(digits.length, inputs.length - 1);
        inputs[next].focus();
      });
    });
  },

  updateDigitState() {
    const inputs = document.querySelectorAll('.digit-input');
    let code = '';
    inputs.forEach(inp => { inp.classList.toggle('filled', !!inp.value); code += inp.value; });
    document.getElementById('joinCodeInput').value = code;
    const btn = document.getElementById('connectBtn');
    const btnText = document.getElementById('connectBtnText');
    if (code.length === 4) { btn.disabled = false; btnText.textContent = 'CONNECT'; }
    else { btn.disabled = true; btnText.textContent = 'ENTER 4 DIGITS'; }
  },

  getJoinCode() { return document.getElementById('joinCodeInput').value; },

  async onCreate() {
    AudioManager.init(); AudioManager.play('click');
    GAME.mode = 'host'; GAME.isHost = true; GAME.isPractice = false; GAME.myPlayerIndex = 0;
    GAME.localMode = null; GAME.activePlayers = 3;
    GAME.players = [
      { id: 'me', connected: true, score: 0 },
      { id: null, connected: false, score: 0 },
      { id: null, connected: false, score: 0 }
    ];
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('roomCodeDisplay').textContent = '----';
    document.getElementById('hostStatus').textContent = 'Connecting…';
    this.updateFriendSlots();
    try {
      const code = await Network.initHost({
        onData: (d, c) => this.onData(d, c),
        onError: e => this.onNetError(e),
        onPeerJoin: c => this.onPeerJoin(c),
        onPeerLeave: c => this.onPeerLeave(c)
      });
      GAME.roomCode = code;
      document.getElementById('roomCodeDisplay').textContent = code;
      document.getElementById('hostStatus').textContent = 'Ready';
      Toast.show('Room #' + code + ' created', 'success', '✓');
    } catch (err) {
      Toast.show('Failed to create room', 'error', '✕');
      document.getElementById('hostStatus').textContent = 'Failed';
      setTimeout(() => this.closeModal('createModal'), 1500);
    }
  },

  onJoin() {
    AudioManager.init(); AudioManager.play('click');
    GAME.mode = 'join'; GAME.isHost = false; GAME.isPractice = false;
    GAME.localMode = null; GAME.activePlayers = 3;
    document.querySelectorAll('.digit-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
    document.getElementById('joinCodeInput').value = '';
    this.updateDigitState();
    document.getElementById('joinModal').classList.remove('hidden');
    setTimeout(() => document.querySelector('.digit-input').focus(), 300);
  },

  onLocal3P() {
    AudioManager.init(); AudioManager.play('click');
    GAME.mode = 'local'; GAME.isPractice = true;
    GAME.localMode = 'practice3p';
    GAME.myPlayerIndex = 0; GAME.currentTurn = 0;
    GAME.activePlayers = 3;
    GAME.players = [
      { id: 'me', connected: true, score: 0 },
      { id: 'p2', connected: true, score: 0 },
      { id: 'p3', connected: true, score: 0 }
    ];
    this.enterGame();
  },

  onLocal2P() {
    AudioManager.init(); AudioManager.play('click');
    GAME.mode = 'local'; GAME.isPractice = true;
    GAME.localMode = 'local2p';
    GAME.myPlayerIndex = 0; GAME.currentTurn = 0;
    GAME.activePlayers = 2;
    GAME.players = [
      { id: 'me', connected: true, score: 0 },
      { id: 'p2', connected: true, score: 0 },
      { id: 'p3', connected: false, score: 0 }
    ];
    this.enterGame();
  },

  onPeerJoin() {},

  onPeerLeave(conn) {
    if (!GAME.isHost) return;
    const idx = GAME.players.findIndex(p => p.id === conn.peer);
    if (idx > 0) {
      GAME.players[idx].connected = false;
      GAME.players[idx].id = null;
      this.updateFriendSlots();
      Network.broadcast({ type: 'players_update', players: GAME.players });
      Toast.show('Player left', 'info', '👋');
    }
  },

  onData(data, conn) {
    switch (data.type) {
      case 'hello': {
        if (!GAME.isHost) return;
        const slot = GAME.players.findIndex((p, i) => i > 0 && !p.connected);
        if (slot < 0) { Network.sendTo(conn, { type: 'room_full' }); return; }
        GAME.players[slot].connected = true;
        GAME.players[slot].id = conn.peer;
        Network.sendTo(conn, { type: 'welcome', playerIndex: slot, players: GAME.players, roomCode: GAME.roomCode });
        Network.broadcast({ type: 'players_update', players: GAME.players });
        this.updateFriendSlots();
        Toast.show('P' + (slot + 1) + ' joined', 'success', '🎉');
        AudioManager.play('notification');
        break;
      }
      case 'welcome':
        GAME.myPlayerIndex = data.playerIndex;
        GAME.players = data.players;
        GAME.roomCode = data.roomCode;
        document.getElementById('connectingOverlay').classList.add('hidden');
        Toast.show('Connected as ' + playerLabel(GAME.myPlayerIndex), 'success', '🎉');
        setTimeout(() => Game.updateScores(), 100);
        break;
      case 'room_full':
        document.getElementById('connectingOverlay').classList.add('hidden');
        Toast.show('Room full', 'error', '🚫');
        Network.disconnect(); GAME.mode = 'menu';
        break;
      case 'players_update':
        GAME.players = data.players;
        Game.updateScores();
        break;
      case 'start_game':
        GAME.players = data.players;
        GAME.currentTurn = 0;
        this.enterGame();
        break;
      case 'shot':
        if (data.player !== GAME.myPlayerIndex && Physics.striker) {
          Physics.striker.x = data.x; Physics.striker.y = data.y;
          Physics.striker.vx = data.vx; Physics.striker.vy = data.vy;
          Game.isResolving = true;
          Game.resolveStartTime = performance.now();
        }
        break;
      case 'sync_state':
        if (GAME.isHost) return;
        Physics.applySnapshot(data.state);
        if (typeof data.currentTurn === 'number' && data.currentTurn !== GAME.currentTurn) {
          GAME.currentTurn = data.currentTurn;
          Game.updateTurnUI(); Game.updateWaitBar(); Game.updateAdjustSlider();
        }
        if (data.players) { GAME.players = data.players; Game.updateScores(); }
        break;
      case 'striker_move':
        if (data.player !== GAME.myPlayerIndex && Physics.striker && Physics.striker.active) {
          Physics.striker.x = data.x; Physics.striker.y = data.y;
        }
        break;
      case 'turn_change':
        GAME.currentTurn = data.currentTurn;
        if (data.players) GAME.players = data.players;
        Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
        Game.isResolving = false;
        Game.updateScores(); Game.updateTurnUI(); Game.updateAdjustSlider(); Game.updateWaitBar();
        break;
      case 'score_update':
        if (GAME.players[data.playerIndex]) {
          GAME.players[data.playerIndex].score = data.score;
          Game.updateScores();
        }
        break;
      case 'chat_message':
        if (data.player !== GAME.myPlayerIndex) this.showMessage(data.text);
        break;
      case 'game_over':
        GAME.players = data.players;
        Game.updateScores();
        Game.showGameOver(data.winner);
        break;
      case 'play_again': this.playAgain(true); break;
      case 'request_play_again':
        if (GAME.isHost) { Network.broadcast({ type: 'play_again' }); this.playAgain(true); }
        break;
    }
  },

  onNetError() {
    document.getElementById('connectingOverlay').classList.add('hidden');
    Toast.show('Network error', 'error', '✕');
  },

  updateFriendSlots() {
    document.querySelectorAll('.friend-slot').forEach(slot => {
      const idx = parseInt(slot.dataset.slot) - 1;
      const p = GAME.players[idx];
      const avatar = slot.querySelector('.fs-avatar');
      const name = slot.querySelector('.fs-name');
      const tag = slot.querySelector('.fs-tag');
      if (p.connected) {
        slot.classList.add('connected');
        avatar.classList.remove('empty'); avatar.textContent = (idx + 1);
        name.textContent = 'P' + (idx + 1); tag.textContent = 'Ready';
      } else {
        slot.classList.remove('connected');
        avatar.classList.add('empty'); avatar.textContent = (idx + 1);
        name.textContent = 'Waiting…'; tag.textContent = 'Not connected';
      }
    });
    const count = GAME.players.filter(p => p.connected).length;
    const btn = document.getElementById('startGameBtn');
    const btnText = document.getElementById('startBtnText');
    const hint = document.getElementById('waitingHint');
    if (count === 3) { btn.disabled = false; btnText.textContent = 'START GAME'; hint.classList.add('hidden'); }
    else {
      btn.disabled = true;
      const need = 3 - count;
      btnText.textContent = `NEED ${need} MORE`;
      hint.classList.remove('hidden');
    }
  },

  copyCode() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    if (code && code !== '----') {
      navigator.clipboard.writeText(code).then(() => {
        Toast.show('Code copied', 'success', '📋');
        AudioManager.play('notification');
      }).catch(() => {});
    }
  },

  shareLink() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    if (!code || code === '----') return;
    const url = location.origin + location.pathname + '?room=' + code;
    const text = `Join Carrom 3P — Code ${code}\n${url}`;
    if (navigator.share) navigator.share({ title: 'Carrom 3P', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => Toast.show('Link copied', 'success', '🔗')).catch(() => {});
  },

  async connect() {
    const code = this.getJoinCode();
    if (code.length !== 4) { Toast.show('Enter 4-digit code', 'error', '⚠'); return; }
    AudioManager.play('click');
    this.closeModal('joinModal');
    document.getElementById('connectingOverlay').classList.remove('hidden');
    document.getElementById('connectingText').textContent = 'Connecting to #' + code + '…';
    try {
      await Network.initClient(code, {
        onData: (d, c) => this.onData(d, c),
        onError: e => this.onNetError(e),
        onPeerJoin: c => this.onPeerJoin(c),
        onPeerLeave: c => this.onPeerLeave(c)
      });
      setTimeout(() => {
        const overlay = document.getElementById('connectingOverlay');
        if (!overlay.classList.contains('hidden')) {
          overlay.classList.add('hidden');
          Toast.show('Connected to #' + code, 'success', '🎉');
        }
      }, 2500);
    } catch (err) {
      document.getElementById('connectingOverlay').classList.add('hidden');
      if (err && err.message === 'peer-unavailable') Toast.show('Room not found', 'error', '✕');
      else if (err && err.message === 'client-timeout') Toast.show('Connection timed out', 'error', '⏱');
      else Toast.show('Connection failed', 'error', '✕');
      Network.disconnect(); GAME.mode = 'menu';
    }
  },

  startGame() {
    const count = GAME.players.filter(p => p.connected).length;
    if (count < 3) { Toast.show('Need 3 players', 'error', '⚠'); return; }
    GAME.currentTurn = 0;
    AudioManager.play('click');
    Network.broadcast({ type: 'start_game', players: GAME.players });
    this.closeModal('createModal');
    this.enterGame();
  },

  enterGame() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('connectingOverlay').classList.add('hidden');
    if (GAME.mode === 'local') GAME.mode = 'local';
    else if (GAME.isPractice) GAME.mode = 'practice';
    else GAME.mode = 'playing';
    GAME.players.forEach(p => p.score = 0);
    Game.updateScores();
    Game.updateTurnUI();
    Game.start();
    Toast.show(
      GAME.localMode === 'local2p' ? '2P Local mode' :
      GAME.localMode === 'practice3p' ? '3P Local mode' :
      'Match started',
      'info', '🎮'
    );
  },

  toggleSound() {
    GAME.audioEnabled = !GAME.audioEnabled;
    document.getElementById('soundOnIcon').style.display = GAME.audioEnabled ? 'block' : 'none';
    document.getElementById('soundOffIcon').style.display = GAME.audioEnabled ? 'none' : 'block';
    if (GAME.audioEnabled) AudioManager.play('click');
  },

  quit() { if (confirm('Leave the game?')) this.goMenu(); },

  goMenu() {
    if (Game.loopId) cancelAnimationFrame(Game.loopId);
    Network.disconnect();
    GAME.mode = 'menu'; GAME.isPractice = false; GAME.isHost = false;
    GAME.currentTurn = 0; GAME.myPlayerIndex = 0;
    GAME.localMode = null; GAME.activePlayers = 3;
    GAME.players = [
      { id: 'me', connected: true, score: 0 },
      { id: null, connected: false, score: 0 },
      { id: null, connected: false, score: 0 }
    ];
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('createModal').classList.add('hidden');
    document.getElementById('joinModal').classList.add('hidden');
    document.getElementById('connectingOverlay').classList.add('hidden');
    Physics.pucks = []; Physics.striker = null;
    Renderer.pocketPops = [];
    FloatingText.items = [];
    Game.isResolving = false;
    Game.ended = false;
    document.querySelectorAll('.confetti').forEach(el => el.remove());
  },

  playAgain(fromRemote) {
    document.getElementById('gameOverOverlay').classList.add('hidden');
    GAME.players.forEach(p => p.score = 0);
    GAME.currentTurn = 0;
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(0, 0.5);
    Renderer.pocketPops = [];
    FloatingText.items = [];
    Game.isResolving = false;
    Game.ended = false;
    Game.updateScores(); Game.updateTurnUI(); Game.updateAdjustSlider(); Game.updateWaitBar();
    if (!fromRemote && GAME.mode === 'playing') {
      if (GAME.isHost) Network.broadcast({ type: 'play_again' });
      else Network.broadcast({ type: 'request_play_again' });
    }
  },

  sendMessage(text) {
    AudioManager.play('click');
    this.showMessage(text);
    if (GAME.mode === 'playing' && !GAME.isPractice) {
      Network.broadcast({ type: 'chat_message', text, player: GAME.myPlayerIndex });
    }
  },

  showMessage(text) {
    requestAnimationFrame(() => {
      const layer = document.getElementById('chatLayer');
      const el = document.createElement('div');
      el.className = 'chat-bubble';
      el.textContent = text;
      el.style.left = (12 + Math.random() * 56) + '%';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    });
    if (GAME.audioEnabled) AudioManager.play('notification', { volume: 0.3 });
  },

  closeModal(id) { document.getElementById(id).classList.add('hidden'); }
};

const Toast = {
  show(msg, type = 'info', icon = '•') {
    const c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};

function runOpening() {
  const fill = document.getElementById('openingBarFill');
  const screen = document.getElementById('openingScreen');
  const menu = document.getElementById('mainMenu');
  let p = 0;
  const iv = setInterval(() => {
    p += 12 + Math.random() * 8;
    if (p >= 100) {
      p = 100; clearInterval(iv);
      setTimeout(() => { screen.classList.add('hidden'); menu.classList.remove('hidden'); }, 300);
    }
    fill.style.width = Math.min(p, 100) + '%';
  }, 190);
  screen.addEventListener('click', () => {
    if (!screen.classList.contains('hidden')) {
      clearInterval(iv); fill.style.width = '100%';
      setTimeout(() => { screen.classList.add('hidden'); menu.classList.remove('hidden'); }, 180);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  runOpening();

  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam && /^\d{4}$/.test(roomParam)) {
    setTimeout(() => {
      const screen = document.getElementById('openingScreen');
      const menu = document.getElementById('mainMenu');
      screen.classList.add('hidden'); menu.classList.remove('hidden');
      UI.onJoin();
      const digits = roomParam.split('');
      const inputs = document.querySelectorAll('.digit-input');
      digits.forEach((d, i) => { if (inputs[i]) inputs[i].value = d; });
      UI.updateDigitState();
    }, 2400);
  }

  document.body.addEventListener('touchstart', () => AudioManager.init(), { once: true });
  document.body.addEventListener('click', () => AudioManager.init(), { once: true });
});

window.addEventListener('touchmove', e => {
  const t = e.target;
  if (t && (t.id === 'gameCanvas' || t.closest('.board-wrap'))) e.preventDefault();
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (!AudioManager._ctx) return;
  if (document.hidden) AudioManager._ctx.suspend();
  else AudioManager._ctx.resume();
});

window.addEventListener('beforeunload', () => { Network.disconnect(); });