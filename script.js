/* ═══════════════════════════════════════════════════════════
   CARROM 3P • v7
   • Smaller striker (24), bigger pucks (16)
   • Aim from anywhere on the screen (pointer capture)
   • Softer, punchier physics + rich SFX
   • Cleaner, smoother UI
   • Fixed netcode desync, chat, turn, scoring, play-again bugs
═══════════════════════════════════════════════════════════ */

const GAME = {
  mode: 'menu',            // menu | host | join | practice | playing
  myPlayerIndex: 0,
  currentTurn: 0,
  isHost: false,
  isPractice: false,
  roomCode: null,
  players: [
    { id: 'me', connected: true, score: 0 },
    { id: null, connected: false, score: 0 },
    { id: null, connected: false, score: 0 }
  ],
  audioEnabled: true,
  soundVolume: 0.55
};

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#9c6ade'];
const playerLabel = i => (i === GAME.myPlayerIndex) ? 'YOU' : 'P' + (i + 1);

/* ───────── AUDIO ───────── */
const AudioManager = {
  _ctx: null,
  _master: null,
  _lastRoll: 0,
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
    const { pan = 0, volume = 1 } = opts;
    this.synth(type, Math.max(-1, Math.min(1, pan)), volume);
  },
  out(pan, volume) {
    const ctx = this._ctx;
    const g = ctx.createGain();
    g.gain.value = GAME.soundVolume * volume;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this._master || ctx.destination);
    } else {
      g.connect(this._master || ctx.destination);
    }
    return g;
  },
  synth(type, pan, volume) {
    try {
      const ctx = this._ctx;
      const out = this.out(pan, volume);
      switch (type) {
        case 'striker_hit':
          this.tone(ctx, out, 900, 380, 'square', 0.05, 0.55);
          this.noise(ctx, out, 0.035, 0.25);
          break;
        case 'puck_hit_soft':
          this.tone(ctx, out, 620, 300, 'triangle', 0.05, 0.35);
          break;
        case 'puck_hit_hard':
          this.tone(ctx, out, 780, 260, 'square', 0.05, 0.5);
          this.noise(ctx, out, 0.028, 0.2);
          break;
        case 'wall_tick':
          this.tone(ctx, out, 320, 180, 'sine', 0.05, 0.22);
          break;
        case 'wall_thud':
          this.tone(ctx, out, 220, 120, 'sine', 0.09, 0.4);
          this.noise(ctx, out, 0.03, 0.18);
          break;
        case 'puck_pocket':
          this.tone(ctx, out, 820, 260, 'sawtooth', 0.1, 0.4);
          this.tone(ctx, out, 1320, 520, 'sine', 0.16, 0.28);
          break;
        case 'striker_pocket':
          this.tone(ctx, out, 220, 80, 'square', 0.28, 0.5);
          this.tone(ctx, out, 110, 60, 'sawtooth', 0.34, 0.35);
          break;
        case 'striker_roll':
          this.tone(ctx, out, 300, 240, 'triangle', 0.07, 0.14);
          break;
        case 'shoot':
          this.tone(ctx, out, 420, 220, 'triangle', 0.08, 0.5);
          break;
        case 'pickup':
          this.tone(ctx, out, 620, 780, 'sine', 0.05, 0.25);
          break;
        case 'release':
          this.tone(ctx, out, 520, 320, 'sine', 0.05, 0.22);
          break;
        case 'click':
          this.tone(ctx, out, 900, 500, 'sine', 0.03, 0.18);
          break;
        case 'connect':
          this.melody(ctx, out, [520, 780], 0.08, 0.3);
          break;
        case 'notification':
          this.tone(ctx, out, 980, 720, 'sine', 0.12, 0.25);
          break;
        case 'turn': this.melody(ctx, out, [500, 660], 0.07, 0.26); break;
        case 'turn_pass': this.melody(ctx, out, [500, 380], 0.09, 0.28); break;
        case 'foul':
          this.tone(ctx, out, 320, 120, 'square', 0.22, 0.42);
          break;
        case 'win':
          this.melody(ctx, out, [523, 659, 784, 1047], 0.14, 0.4);
          break;
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
    gain.gain.exponentialRampToValueAtTime(gv, now + 0.006);
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
      g.gain.exponentialRampToValueAtTime(gv, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + noteDur + 0.02);
      t += noteDur;
    });
  }
};

/* ───────── NETWORK ───────── */
const Network = {
  peer: null, connections: [], isHost: false, roomCode: null,
  onData: null, onError: null, onPeerJoin: null, onPeerLeave: null,

  generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); },
  generateClientId() { return 'c7-cli-' + Math.random().toString(36).slice(2, 9) + '-' + Date.now(); },

  initHost(cb) {
    this.isHost = true;
    this.roomCode = this.generateCode();
    Object.assign(this, { onData: cb.onData, onError: cb.onError, onPeerJoin: cb.onPeerJoin, onPeerLeave: cb.onPeerLeave });
    const peerId = 'c7-' + this.roomCode;

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
            this.roomCode = this.generateCode();
            tryCreate();
          }, 8000);
          this.peer.on('open', () => {
            if (settled) return; settled = true; clearTimeout(timeout);
            AudioManager.play('connect');
            resolve(this.roomCode);
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
    const hostPeerId = 'c7-' + roomCode;
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
              AudioManager.play('connect');
              resolve(conn);
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
  PUCK_RADIUS: 16,          // bigger balls
  STRIKER_RADIUS: 24,       // shorter striker
  POCKET_RADIUS: 46,
  FRICTION: 0.988,          // smoother slide
  WALL_BOUNCE: 0.8,
  MIN_SPEED: 0.05,
  MAX_POWER: 26,            // punchy
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
      pucks.push({ x: cx + Math.cos(a) * 56, y: cy + Math.sin(a) * 56, vx: 0, vy: 0,
        radius: this.PUCK_RADIUS, color: '#f2e5c9', rim: '#c9b88f', type: 'white', active: true, trail: [] });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      pucks.push({ x: cx + Math.cos(a) * 28, y: cy + Math.sin(a) * 28, vx: 0, vy: 0,
        radius: this.PUCK_RADIUS, color: '#1a1a1a', rim: '#000', type: 'black', active: true, trail: [] });
    }
    pucks.push({ x: cx, y: cy, vx: 0, vy: 0, radius: this.PUCK_RADIUS,
      color: '#f2e5c9', rim: '#c9b88f', type: 'white', active: true, trail: [] });
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
    // Nudge along baseline if it overlaps a puck
    for (let n = 0; n < 20; n++) {
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

/* ───────── RENDERER ───────── */
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

    // Outer wood
    const og = ctx.createLinearGradient(0, 0, 0, this.H);
    og.addColorStop(0, '#5c3d21');
    og.addColorStop(1, '#3a2413');
    ctx.fillStyle = og;
    this.roundRect(ctx, 0, 0, this.W, this.H, 34); ctx.fill();

    // Playing surface
    const bg = ctx.createRadialGradient(this.W / 2, this.H / 2, 60, this.W / 2, this.H / 2, this.W / 1.3);
    bg.addColorStop(0, '#fbf3df');
    bg.addColorStop(1, '#ecdfbe');
    ctx.fillStyle = bg;
    this.roundRect(ctx, p - 10, p - 10, w + 20, h + 20, 18); ctx.fill();

    // Surface border
    ctx.strokeStyle = 'rgba(122, 74, 36, 0.55)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, p - 10, p - 10, w + 20, h + 20, 18); ctx.stroke();

    // Center circle
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 74, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(122, 74, 36, 0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122, 74, 36, 0.5)'; ctx.fill();
    ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf3df'; ctx.fill();

    // Corner arcs
    const corners = [
      { x: p, y: p, s: 0, e: Math.PI / 2 },
      { x: this.W - p, y: p, s: Math.PI / 2, e: Math.PI },
      { x: this.W - p, y: this.H - p, s: Math.PI, e: Math.PI * 1.5 },
      { x: p, y: this.H - p, s: Math.PI * 1.5, e: Math.PI * 2 }
    ];
    ctx.strokeStyle = 'rgba(122, 74, 36, 0.25)';
    ctx.lineWidth = 1.5;
    corners.forEach(c => { ctx.beginPath(); ctx.arc(c.x, c.y, 64, c.s, c.e); ctx.stroke(); });

    // Pockets
    for (const pk of Physics.pockets) {
      const pg = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, Physics.POCKET_RADIUS);
      pg.addColorStop(0, '#000');
      pg.addColorStop(0.7, '#0c0603');
      pg.addColorStop(1, '#2a1508');
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = pg; ctx.fill();
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = '#000'; ctx.fill();
      ctx.beginPath(); ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(160, 104, 56, 0.85)'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  },

  drawBaseline() {
    if (GAME.mode === 'menu') return;
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.3) return;
    const base = Physics.getBaseline(GAME.currentTurn);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = PLAYER_COLORS[GAME.currentTurn] + '66';
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
        const a = (i / b.trail.length) * 0.18;
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.radius * (0.5 + (i / b.trail.length) * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = b.color + Math.floor(a * 255).toString(16).padStart(2, '0');
        ctx.fill();
      }
    }
  },

  drawPucks() {
    const ctx = this.ctx;
    for (const puck of Physics.pucks) {
      if (!puck.active) continue;
      ctx.beginPath(); ctx.arc(puck.x, puck.y + 1.6, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = puck.color; ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.strokeStyle = puck.rim; ctx.lineWidth = 1.4; ctx.stroke();
      const hg = ctx.createRadialGradient(puck.x - puck.radius * 0.35, puck.y - puck.radius * 0.35, 1, puck.x, puck.y, puck.radius);
      hg.addColorStop(0, 'rgba(255,255,255,0.5)');
      hg.addColorStop(0.55, 'rgba(255,255,255,0.05)');
      hg.addColorStop(1, 'rgba(0,0,0,0.14)');
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = hg; ctx.fill();
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.radius * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = puck.type === 'white' ? 'rgba(170,140,90,0.35)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1; ctx.stroke();
    }
  },

  drawStriker() {
    const s = Physics.striker;
    if (!s || !s.active) return;
    const ctx = this.ctx;
    const isMoving = Math.hypot(s.vx, s.vy) > 0.3;
    const isMyTurn = GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMoving && isMyTurn && GAME.mode !== 'menu') {
      const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 8, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(s.x, s.y, s.radius, s.x, s.y, s.radius + 8);
      grd.addColorStop(0, s.color + '00');
      grd.addColorStop(0.55, s.color + Math.floor((0.25 + pulse * 0.25) * 255).toString(16).padStart(2, '0'));
      grd.addColorStop(1, s.color + '00');
      ctx.fillStyle = grd; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(s.x, s.y + 2, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    const hg = ctx.createRadialGradient(s.x - s.radius * 0.35, s.y - s.radius * 0.35, 1, s.x, s.y, s.radius);
    hg.addColorStop(0, 'rgba(255,255,255,0.7)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    hg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius - 0.5, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
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
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return;
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
    const lg = ctx.createLinearGradient(s.x, s.y, endX, endY);
    lg.addColorStop(0, `rgba(245, 197, 66, ${0.7 + power * 0.3})`);
    lg.addColorStop(1, 'rgba(245, 197, 66, 0)');
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -this.time * 38;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(endX, endY);
    ctx.strokeStyle = lg; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
    const endRadius = 5 + power * 9;
    ctx.beginPath(); ctx.arc(endX, endY, endRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(245,197,66,${0.14 + power * 0.3})`; ctx.fill();
    ctx.strokeStyle = `rgba(245,197,66,${0.6 + power * 0.4})`; ctx.lineWidth = 2; ctx.stroke();
    const aLen = 10;
    ctx.save(); ctx.translate(endX, endY); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(-aLen, -aLen * 0.55); ctx.lineTo(-aLen, aLen * 0.55); ctx.closePath();
    ctx.fillStyle = `rgba(245,197,66,${0.7 + power * 0.3})`; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 6 + power * 7, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(245,197,66,${0.35 + power * 0.45})`; ctx.lineWidth = 2; ctx.stroke();
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

/* ───────── INPUT (aim from anywhere on screen) ───────── */
const Input = {
  isAiming: false, aimStart: null, aimCurrent: null, canvas: null,
  _pointerId: null,
  _lastMoveBroadcast: 0,

  init(canvas) {
    this.canvas = canvas;
    // Start aim only when down inside the canvas
    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    // Track aim + release on the window (so leaving the canvas is fine)
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
    if (GAME.mode !== 'playing' && !GAME.isPractice) return false;
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return false;
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
    const dist = Math.hypot(dx, dy);
    Game.updatePower(Math.min(dist / 130, 1));
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

    const isAuthority = GAME.isPractice || GAME.isHost || GAME.mode !== 'playing';

    if (isAuthority) {
      Physics.step(
        // collision
        (intensity, x, y) => {
          const pan = (x / Physics.W) * 2 - 1;
          // Distinguish striker-involved vs puck-puck
          const strikerInvolved = Physics.striker && Physics.striker.active &&
            Math.hypot(Physics.striker.x - x, Physics.striker.y - y) < 60;
          if (strikerInvolved) {
            AudioManager.play('striker_hit', { pan, volume: Math.min(0.5 + intensity * 0.6, 1) });
          } else if (intensity > 0.5) {
            AudioManager.play('puck_hit_hard', { pan, volume: Math.min(intensity, 1) });
          } else {
            AudioManager.play('puck_hit_soft', { pan, volume: Math.min(intensity + 0.3, 0.8) });
          }
        },
        // pocket
        (body, pocket, isStriker) => {
          const pan = (body.x / Physics.W) * 2 - 1;
          Renderer.addPocketPop(pocket.x, pocket.y, body.color);
          if (isStriker) {
            AudioManager.play('striker_pocket', { pan });
            AudioManager.play('foul', { pan: 0, volume: 0.6 });
            this.turnHadFoul = true;
            Toast.show('Foul — Striker pocketed', 'error', '⚠️');
          } else {
            AudioManager.play('puck_pocket', { pan });
            if (GAME.mode === 'playing' || GAME.isPractice) {
              GAME.players[GAME.currentTurn].score++;
              this.turnPocketed++;
              this.updateScores();
              if (GAME.isHost && GAME.mode === 'playing' && !GAME.isPractice) {
                Network.broadcast({
                  type: 'score_update',
                  playerIndex: GAME.currentTurn,
                  score: GAME.players[GAME.currentTurn].score
                });
              }
            }
          }
        },
        // wall
        (body, wallSpeed) => {
          const pan = (body.x / Physics.W) * 2 - 1;
          const v = Math.min(wallSpeed / 14, 1);
          if (v < 0.15) return;
          if (v > 0.5) AudioManager.play('wall_thud', { pan, volume: v });
          else AudioManager.play('wall_tick', { pan, volume: 0.4 + v * 0.4 });
        },
        // striker roll
        (striker) => {
          const now = performance.now();
          if (now - this._lastRollSound > 80) {
            this._lastRollSound = now;
            const pan = (striker.x / Physics.W) * 2 - 1;
            const spd = Math.hypot(striker.vx, striker.vy);
            AudioManager.play('striker_roll', { pan, volume: Math.min(0.15 + spd / 30, 0.45) });
          }
        }
      );
    }

    if (this.isResolving) {
      const elapsed = t - this.resolveStartTime;
      const stopped = Physics.allStopped();
      if (stopped || elapsed > 12000) {
        if (isAuthority) {
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
        } else {
          if (elapsed > 12500) this.isResolving = false;
        }
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

    if (!this.ended && Physics.activePucksCount() === 0 && !this.isResolving) {
      this.ended = true;
      this.endGame();
    }

    Renderer.draw();
    this.loopId = requestAnimationFrame(this.loop.bind(this));
  },

  endTurn() {
    const foul = this.turnHadFoul;
    if (foul) {
      Toast.show('Foul — Turn passes', 'error', '⚠️');
      AudioManager.play('turn_pass');
    } else {
      AudioManager.play('turn');
    }
    this.turnHadFoul = false;
    this.turnPocketed = 0;
    GAME.currentTurn = (GAME.currentTurn + 1) % 3;
    Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
    if (GAME.mode === 'playing' && !GAME.isPractice && GAME.isHost) {
      Network.broadcast({ type: 'turn_change', currentTurn: GAME.currentTurn, players: GAME.players });
    }
    this.updateTurnUI();
    this.updateAdjustSlider();
    this.updateWaitBar();
  },

  endGame() {
    AudioManager.play('win');
    this.confetti();
    let max = -1, winner = 0;
    GAME.players.forEach((p, i) => { if (p.score > max) { max = p.score; winner = i; } });
    if (GAME.isHost && GAME.mode === 'playing') {
      Network.broadcast({ type: 'game_over', winner, players: GAME.players });
    }
    setTimeout(() => this.showGameOver(winner), 650);
  },

  showGameOver(winnerIdx) {
    const overlay = document.getElementById('gameOverOverlay');
    const icon = document.getElementById('goIcon');
    const heading = document.getElementById('goHeading');
    const text = document.getElementById('goText');
    const scores = document.getElementById('goScores');
    const isMe = winnerIdx === GAME.myPlayerIndex;
    icon.textContent = isMe ? '🏆' : '🎯';
    heading.textContent = isMe ? 'VICTORY' : 'GAME OVER';
    text.textContent = playerLabel(winnerIdx) + ' wins the match';
    scores.innerHTML = GAME.players.map((p, i) => `
      <div class="go-score" style="animation-delay:${i * 0.08 + 0.1}s">
        <div class="go-score-val" style="color:${PLAYER_COLORS[i]}">${p.score}</div>
        <div class="go-score-lbl">${playerLabel(i)}</div>
      </div>
    `).join('');
    overlay.classList.remove('hidden');
  },

  confetti() {
    const colors = ['#e63946', '#2a9d8f', '#9c6ade', '#f5c542', '#ffffff'];
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
    document.querySelectorAll('.player-chip').forEach((c, i) => c.classList.toggle('active', i === GAME.currentTurn));
    const swatch = document.getElementById('turnSwatch');
    const label = document.getElementById('turnLabel');
    swatch.style.background = PLAYER_COLORS[GAME.currentTurn];
    swatch.style.boxShadow = `0 0 10px ${PLAYER_COLORS[GAME.currentTurn]}`;
    if (GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex) label.textContent = 'YOUR TURN';
    else label.textContent = playerLabel(GAME.currentTurn) + "'S TURN";
    document.getElementById('boardFrame').classList.toggle('active', GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex);
  },

  updateAdjustSlider() {
    const row = document.getElementById('adjustRow');
    const thumb = document.getElementById('adjustThumb');
    const fill = document.getElementById('adjustFill');
    const track = document.getElementById('adjustTrack');
    const isMyTurn = GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex;
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
        const pct = x / rect.width;
        const s = Physics.striker; if (!s || !s.active) return;
        const base = Physics.getBaseline(GAME.currentTurn);
        if (base.axis === 'x') { s.x = base.min + (base.max - base.min) * pct; s.y = base.y; }
        else { s.x = base.x; s.y = base.min + (base.max - base.min) * pct; }
        thumb.style.left = (pct * 100) + '%';
        fill.style.width = (pct * 100) + '%';
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
    const isMyTurn = GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex;
    if (isMyTurn || GAME.mode === 'menu') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    text.textContent = playerLabel(GAME.currentTurn) + ' is playing...';
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
    });
  }
};

/* ───────── UI ───────── */
const UI = {
  init() {
    document.getElementById('createRoomBtn').addEventListener('click', () => this.onCreate());
    document.getElementById('joinRoomBtn').addEventListener('click', () => this.onJoin());
    document.getElementById('practiceBtn').addEventListener('click', () => this.onPractice());
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
    document.querySelectorAll('.reaction').forEach(btn =>
      btn.addEventListener('click', () => this.sendMessage(btn.dataset.msg)));
    this.setupDigitInputs();
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
    document.querySelectorAll('.digit-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
    document.getElementById('joinCodeInput').value = '';
    this.updateDigitState();
    document.getElementById('joinModal').classList.remove('hidden');
    setTimeout(() => document.querySelector('.digit-input').focus(), 300);
  },

  onPractice() {
    AudioManager.init(); AudioManager.play('click');
    GAME.mode = 'practice'; GAME.isPractice = true; GAME.myPlayerIndex = 0; GAME.currentTurn = 0;
    GAME.players = [
      { id: 'me', connected: true, score: 0 },
      { id: 'p2', connected: true, score: 0 },
      { id: 'p3', connected: true, score: 0 }
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
        Network.sendTo(conn, {
          type: 'welcome', playerIndex: slot, players: GAME.players, roomCode: GAME.roomCode
        });
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
          Game.updateTurnUI();
          Game.updateWaitBar();
          Game.updateAdjustSlider();
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
        Game.updateScores();
        Game.updateTurnUI();
        Game.updateAdjustSlider();
        Game.updateWaitBar();
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
      case 'play_again':
        this.playAgain(true);
        break;
      case 'request_play_again':
        if (GAME.isHost) {
          Network.broadcast({ type: 'play_again' });
          this.playAgain(true);
        }
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
        avatar.classList.remove('empty');
        avatar.textContent = (idx + 1);
        name.textContent = 'P' + (idx + 1);
        tag.textContent = 'Ready';
      } else {
        slot.classList.remove('connected');
        avatar.classList.add('empty');
        avatar.textContent = (idx + 1);
        name.textContent = 'Waiting…';
        tag.textContent = 'Not connected';
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
    GAME.mode = GAME.isPractice ? 'practice' : 'playing';
    GAME.players.forEach(p => p.score = 0);
    Game.updateScores();
    Game.updateTurnUI();
    Game.start();
    Toast.show(GAME.isPractice ? 'Practice mode' : 'Match started', 'info', '🎮');
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
    Game.isResolving = false;
    Game.ended = false;
    Game.updateScores();
    Game.updateTurnUI();
    Game.updateAdjustSlider();
    Game.updateWaitBar();
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

/* Prevent page scroll only on the board */
window.addEventListener('touchmove', e => {
  const t = e.target;
  if (t && (t.id === 'gameCanvas' || t.closest('.board-wrap'))) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (!AudioManager._ctx) return;
  if (document.hidden) AudioManager._ctx.suspend();
  else AudioManager._ctx.resume();
});

window.addEventListener('beforeunload', () => { Network.disconnect(); });
