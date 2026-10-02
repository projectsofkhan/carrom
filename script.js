/* ═══════════════════════════════════════════════════════════
   CARROM 3P • MAJOR UPDATE
   - Adjustable striker bar (slides along player's baseline)
   - Striker placed on SIDES not corners:
       P1: bottom edge (slides left↔right)
       P2: left edge   (slides up↔down)
       P3: top edge    (slides left↔right)
   - Wait overlay when not your turn
   - Safe drag (no accidental shoot when finger leaves board)
   - Emoji chat broadcast + floating animation
   - Practice solo fully supported
═══════════════════════════════════════════════════════════ */

const GAME = {
  mode: 'menu',
  myPlayerIndex: 0,
  currentTurn: 0,
  isHost: false,
  isPractice: false,
  roomCode: null,
  players: [
    { id: 'me', name: 'YOU', connected: true, score: 0 },
    { id: null, name: 'P2', connected: false, score: 0 },
    { id: null, name: 'P3', connected: false, score: 0 }
  ],
  audioEnabled: true,
  soundVolume: 0.5
};

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#9c6ade'];

function playerLabel(i) {
  if (i === GAME.myPlayerIndex) return 'YOU';
  return 'P' + (i + 1);
}

/* ───────────── AUDIO ───────────── */
const AudioManager = {
  _ctx: null,
  init() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  },
  play(type, options = {}) {
    if (!GAME.audioEnabled) return;
    const { pan = 0, volume = 1 } = options;
    this.synth(type, pan, volume);
  },
  synth(type, pan, volume) {
    if (!this._ctx) return;
    try {
      const ctx = this._ctx;
      const now = ctx.currentTime;
      const master = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      master.gain.value = GAME.soundVolume * volume;
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        master.connect(panner);
        panner.connect(ctx.destination);
      } else master.connect(ctx.destination);

      switch(type) {
        case 'hit_soft': this.tone(ctx, master, 520, 240, 'triangle', 0.055, 0.28); break;
        case 'hit_hard':
          this.tone(ctx, master, 680, 200, 'square', 0.045, 0.42);
          this.noise(ctx, master, 0.025, 0.15);
          break;
        case 'wall': this.tone(ctx, master, 260, 130, 'sine', 0.07, 0.22); break;
        case 'pocket':
          this.tone(ctx, master, 760, 240, 'sawtooth', 0.11, 0.35);
          this.tone(ctx, master, 1280, 480, 'sine', 0.18, 0.25);
          break;
        case 'striker_pocket':
          this.tone(ctx, master, 200, 90, 'square', 0.28, 0.42);
          this.tone(ctx, master, 100, 65, 'sawtooth', 0.35, 0.32);
          break;
        case 'shot': this.tone(ctx, master, 380, 200, 'triangle', 0.09, 0.35); break;
        case 'slide': this.tone(ctx, master, 1100, 900, 'sine', 0.03, 0.08); break;
        case 'win': this.melody(ctx, master, [523, 659, 784, 1047], 0.14, 0.38); break;
        case 'click': this.tone(ctx, master, 850, 420, 'sine', 0.035, 0.13); break;
        case 'connect': this.melody(ctx, master, [440, 660], 0.09, 0.28); break;
        case 'notification': this.tone(ctx, master, 920, 680, 'sine', 0.14, 0.22); break;
        case 'turn': this.melody(ctx, master, [460, 620], 0.075, 0.22); break;
      }
    } catch(e) {}
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
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  },
  noise(ctx, dest, dur, gv) {
    const now = ctx.currentTime;
    const size = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gv, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(gain);
    gain.connect(dest);
    src.start(now);
  },
  melody(ctx, dest, notes, noteDur, gv) {
    let t = ctx.currentTime;
    notes.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(gv, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + noteDur + 0.02);
      t += noteDur;
    });
  }
};

/* ───────────── NETWORK (unchanged from working version) ───────────── */
const Network = {
  peer: null,
  connections: [],
  isHost: false,
  roomCode: null,
  onPlayerJoin: null,
  onPlayerLeave: null,
  onData: null,
  onError: null,

  generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); },
  generateClientId() { return 'c3p-client-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now(); },

  initHost(cb) {
    this.isHost = true;
    this.roomCode = this.generateCode();
    this.onPlayerJoin = cb.onPlayerJoin;
    this.onPlayerLeave = cb.onPlayerLeave;
    this.onData = cb.onData;
    this.onError = cb.onError;
    const peerId = 'c3p-' + this.roomCode;

    return new Promise((resolve, reject) => {
      let settled = false;
      let attempts = 0;
      const maxAttempts = 5;
      const tryCreate = () => {
        attempts++;
        try {
          this.peer = new Peer(peerId, {
            debug: 1,
            config: { iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ] }
          });
          const timeout = setTimeout(() => {
            if (settled) return;
            if (attempts >= maxAttempts) { settled = true; reject(new Error('host-timeout')); return; }
            try { this.peer.destroy(); } catch(e) {}
            this.roomCode = this.generateCode();
            tryCreate();
          }, 10000);
          this.peer.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            AudioManager.play('connect');
            resolve(this.roomCode);
          });
          this.peer.on('connection', conn => this.setupConnection(conn));
          this.peer.on('error', err => {
            if (err.type === 'unavailable-id') {
              clearTimeout(timeout);
              if (settled) return;
              try { this.peer.destroy(); } catch(e) {}
              this.roomCode = this.generateCode();
              tryCreate();
              return;
            }
            if (!settled) { settled = true; clearTimeout(timeout); reject(err); }
            else if (this.onError) this.onError(err);
          });
          this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch(e) {} });
        } catch(e) { if (!settled) { settled = true; reject(e); } }
      };
      tryCreate();
    });
  },

  initClient(roomCode, cb) {
    this.isHost = false;
    this.roomCode = roomCode;
    this.onData = cb.onData;
    this.onError = cb.onError;
    this.onPlayerJoin = cb.onPlayerJoin;
    this.onPlayerLeave = cb.onPlayerLeave;
    const hostPeerId = 'c3p-' + roomCode;
    const clientId = this.generateClientId();

    return new Promise((resolve, reject) => {
      let settled = false;
      let retries = 0;
      const maxRetries = 3;
      const tryConnect = () => {
        retries++;
        try {
          if (this.peer) { try { this.peer.destroy(); } catch(e) {} this.peer = null; }
          this.peer = new Peer(clientId + '-' + retries, {
            debug: 1,
            config: { iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ] }
          });
          const attemptTimeout = setTimeout(() => {
            if (settled) return;
            if (retries >= maxRetries) { settled = true; reject(new Error('client-timeout')); }
            else tryConnect();
          }, 20000);
          this.peer.on('open', () => {
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            conn.on('open', () => {
              if (settled) return;
              settled = true;
              clearTimeout(attemptTimeout);
              if (!this.connections.includes(conn)) this.connections.push(conn);
              conn.on('data', data => { if (this.onData) this.onData(data, conn); });
              conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
                if (this.onPlayerLeave) this.onPlayerLeave(conn);
              });
              conn.on('error', err => console.error('Connection error:', err));
              setTimeout(() => {
                try { conn.send({ type: 'hello', clientId }); } catch(e) {}
              }, 100);
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
          this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch(e) {} });
        } catch(e) {
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
    });
    conn.on('data', data => { if (this.onData) this.onData(data, conn); });
    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
      if (this.onPlayerLeave) this.onPlayerLeave(conn);
    });
    conn.on('error', err => console.error('Host connection error:', err));
  },

  broadcast(data) {
    this.connections.forEach(c => {
      if (c.open) { try { c.send(data); } catch(e) {} }
    });
  },
  sendTo(conn, data) {
    if (conn && conn.open) { try { conn.send(data); } catch(e) {} }
  },
  disconnect() {
    if (this.peer) { try { this.peer.destroy(); } catch(e) {} this.peer = null; }
    this.connections = [];
  }
};

/* ═══════════════════════════════════════════════════════════
   PHYSICS — striker placed on sides, adjust along baseline
═══════════════════════════════════════════════════════════ */
const Physics = {
  W: 700, H: 700,
  BOARD_PADDING: 62,
  PUCK_RADIUS: 15,
  STRIKER_RADIUS: 18,
  POCKET_RADIUS: 22,
  FRICTION: 0.983,
  WALL_BOUNCE: 0.74,
  MIN_SPEED: 0.06,
  MAX_POWER: 11,
  RESTITUTION: 0.9,

  pockets: [], pucks: [], striker: null,

  init() {
    const p = this.BOARD_PADDING;
    this.pockets = [
      { x: p, y: p }, { x: this.W - p, y: p },
      { x: p, y: this.H - p }, { x: this.W - p, y: this.H - p }
    ];
  },

  bounds() {
    const p = this.BOARD_PADDING;
    return { left: p, right: this.W - p, top: p, bottom: this.H - p };
  },

  /* Baseline for a player: returns {x, y, min, max, axis}
     P0 (bottom): slides along x at bottom edge
     P1 (left):   slides along y at left edge
     P2 (top):    slides along x at top edge
  */
  getBaseline(playerIndex) {
    const p = this.BOARD_PADDING;
    const inset = 40; // distance from board edge
    switch(playerIndex) {
      case 0: return {
        axis: 'x',
        x: this.W / 2,
        y: this.H - p - inset,
        min: p + 80,
        max: this.W - p - 80
      };
      case 1: return {
        axis: 'y',
        x: p + inset,
        y: this.H / 2,
        min: p + 80,
        max: this.H - p - 80
      };
      case 2: return {
        axis: 'x',
        x: this.W / 2,
        y: p + inset,
        min: p + 80,
        max: this.W - p - 80
      };
      default: return {
        axis: 'x',
        x: this.W / 2,
        y: this.H - p - inset,
        min: p + 80,
        max: this.W - p - 80
      };
    }
  },

  createPucks() {
    const pucks = [];
    const cx = this.W / 2, cy = this.H / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
      pucks.push({
        x: cx + Math.cos(a) * 56, y: cy + Math.sin(a) * 56,
        vx: 0, vy: 0, radius: this.PUCK_RADIUS,
        color: '#f5ede0', rim: '#d4c4a8',
        type: 'white', active: true, trail: []
      });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      pucks.push({
        x: cx + Math.cos(a) * 28, y: cy + Math.sin(a) * 28,
        vx: 0, vy: 0, radius: this.PUCK_RADIUS,
        color: '#1a1a1a', rim: '#000000',
        type: 'black', active: true, trail: []
      });
    }
    pucks.push({
      x: cx, y: cy, vx: 0, vy: 0,
      radius: this.PUCK_RADIUS,
      color: '#f5ede0', rim: '#d4c4a8',
      type: 'white', active: true, trail: []
    });
    return pucks;
  },

  createStriker(playerIndex, sideOffset = 0.5) {
    const base = this.getBaseline(playerIndex);
    let x, y;
    if (base.axis === 'x') {
      x = base.min + (base.max - base.min) * sideOffset;
      y = base.y;
    } else {
      x = base.x;
      y = base.min + (base.max - base.min) * sideOffset;
    }
    const s = {
      x, y, vx: 0, vy: 0,
      radius: this.STRIKER_RADIUS,
      color: PLAYER_COLORS[playerIndex],
      type: 'striker', active: true, trail: []
    };
    // Push out of overlapping pucks
    for (const puck of this.pucks) {
      if (!puck.active) continue;
      const dx = s.x - puck.x, dy = s.y - puck.y;
      const d = Math.hypot(dx, dy);
      const minD = s.radius + puck.radius + 1;
      if (d < minD && d > 0.01) {
        const nx = dx / d, ny = dy / d;
        s.x = puck.x + nx * minD;
        s.y = puck.y + ny * minD;
      }
    }
    return s;
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

    const invA = 1 / a.radius;
    const invB = 1 / b.radius;
    const j = -(1 + this.RESTITUTION) * vn / (invA + invB);
    const maxJ = 8;
    const clampedJ = Math.max(-maxJ, Math.min(maxJ, j));
    const ix = clampedJ * nx, iy = clampedJ * ny;
    a.vx -= ix * invA; a.vy -= iy * invA;
    b.vx += ix * invB; b.vy += iy * invB;

    if (Math.abs(vn) > 0.6 && onHit) {
      onHit(Math.min(Math.abs(vn) / 14, 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  },

  step(onCollision, onPocket, onWall) {
    const b = this.bounds();
    if (this.striker && this.striker.active) {
      this.stepBody(this.striker, b, onWall);
      this.checkPockets(this.striker, onPocket, true);
    }
    for (const puck of this.pucks) {
      if (!puck.active) continue;
      this.stepBody(puck, b, onWall);
      this.checkPockets(puck, onPocket, false);
    }
    for (let iter = 0; iter < 2; iter++) {
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

    if (speed > 3) {
      body.trail.push({ x: body.x, y: body.y });
      if (body.trail.length > 8) body.trail.shift();
    } else if (body.trail.length > 0) {
      body.trail.shift();
    }

    let hitWall = false;
    if (body.x - body.radius < bounds.left) { body.x = bounds.left + body.radius; body.vx *= -this.WALL_BOUNCE; hitWall = true; }
    else if (body.x + body.radius > bounds.right) { body.x = bounds.right - body.radius; body.vx *= -this.WALL_BOUNCE; hitWall = true; }
    if (body.y - body.radius < bounds.top) { body.y = bounds.top + body.radius; body.vy *= -this.WALL_BOUNCE; hitWall = true; }
    else if (body.y + body.radius > bounds.bottom) { body.y = bounds.bottom - body.radius; body.vy *= -this.WALL_BOUNCE; hitWall = true; }
    if (hitWall && onWall) onWall(body);
  },

  checkPockets(body, onPocket, isStriker) {
    for (const p of this.pockets) {
      const dx = body.x - p.x, dy = body.y - p.y;
      if (dx * dx + dy * dy < (this.POCKET_RADIUS - 3) * (this.POCKET_RADIUS - 3)) {
        body.active = false; body.vx = 0; body.vy = 0;
        if (onPocket) onPocket(body, p, isStriker);
        return true;
      }
    }
    return false;
  },

  allStopped() {
    if (this.striker && this.striker.active) {
      if (Math.hypot(this.striker.vx, this.striker.vy) > 0.01) return false;
    }
    for (const p of this.pucks) {
      if (p.active && Math.hypot(p.vx, p.vy) > 0.01) return false;
    }
    return true;
  },

  activePucksCount() { return this.pucks.filter(p => p.active).length; }
};

/* ═══════════════════════════════════════════════════════════
   RENDERER
═══════════════════════════════════════════════════════════ */
const Renderer = {
  canvas: null, ctx: null,
  W: 700, H: 700,
  time: 0,
  pocketPops: [],

  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
  },

  addPocketPop(x, y, color) {
    this.pocketPops.push({ x, y, color, life: 1 });
  },

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
    const ctx = this.ctx;
    const p = Physics.BOARD_PADDING;
    const w = this.W - p * 2, h = this.H - p * 2;

    const og = ctx.createLinearGradient(0, 0, this.W, this.H);
    og.addColorStop(0, '#a06838');
    og.addColorStop(0.5, '#7a4a24');
    og.addColorStop(1, '#5a3218');
    ctx.fillStyle = og;
    this.roundRect(ctx, 0, 0, this.W, this.H, 40);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    this.roundRect(ctx, 12, 12, this.W - 24, this.H - 24, 32);
    ctx.fill();

    const bg = ctx.createRadialGradient(this.W / 2, this.H / 2, 40, this.W / 2, this.H / 2, this.W / 1.35);
    bg.addColorStop(0, '#f8eed8');
    bg.addColorStop(0.7, '#f2e4c8');
    bg.addColorStop(1, '#e8d6b0');
    ctx.fillStyle = bg;
    this.roundRect(ctx, p - 8, p - 8, w + 16, h + 16, 20);
    ctx.fill();

    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, p - 8, p - 8, w + 16, h + 16, 20);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, p - 5, p - 5, w + 10, h + 10, 18);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(this.W / 2, this.H / 2, 72, 0, Math.PI * 2);
    ctx.strokeStyle = '#c4a276';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.W / 2, this.H / 2, 62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(196,162,118,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.W / 2, this.H / 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#c4a276';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.W / 2, this.H / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f8eed8';
    ctx.fill();

    // Corner arcs
    const corners = [
      { x: p, y: p, s: 0, e: Math.PI / 2 },
      { x: this.W - p, y: p, s: Math.PI / 2, e: Math.PI },
      { x: this.W - p, y: this.H - p, s: Math.PI, e: Math.PI * 1.5 },
      { x: p, y: this.H - p, s: Math.PI * 1.5, e: Math.PI * 2 }
    ];
    ctx.strokeStyle = 'rgba(196,162,118,0.4)';
    ctx.lineWidth = 1.5;
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 66, c.s, c.e);
      ctx.stroke();
    });

    // Pockets
    for (const pk of Physics.pockets) {
      const pg = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, Physics.POCKET_RADIUS);
      pg.addColorStop(0, '#000000');
      pg.addColorStop(0.6, '#160a04');
      pg.addColorStop(1, '#2a1508');
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 80, 40, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  /* Draw the current player's baseline as a subtle highlight */
  drawBaseline() {
    if (GAME.mode === 'menu') return;
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.3) return;
    const base = Physics.getBaseline(GAME.currentTurn);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = PLAYER_COLORS[GAME.currentTurn] + '55';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.beginPath();
    if (base.axis === 'x') {
      ctx.moveTo(base.min, base.y);
      ctx.lineTo(base.max, base.y);
    } else {
      ctx.moveTo(base.x, base.min);
      ctx.lineTo(base.x, base.max);
    }
    ctx.stroke();
    ctx.restore();
  },

  drawTrails() {
    const ctx = this.ctx;
    const all = [Physics.striker, ...Physics.pucks];
    for (const body of all) {
      if (!body || !body.active || !body.trail || body.trail.length < 2) continue;
      for (let i = 0; i < body.trail.length; i++) {
        const t = body.trail[i];
        const a = (i / body.trail.length) * 0.28;
        ctx.beginPath();
        ctx.arc(t.x, t.y, body.radius * (0.5 + (i / body.trail.length) * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = body.color + Math.floor(a * 255).toString(16).padStart(2, '0');
        ctx.fill();
      }
    }
  },

  drawPucks() {
    const ctx = this.ctx;
    for (const puck of Physics.pucks) {
      if (!puck.active) continue;
      ctx.beginPath();
      ctx.arc(puck.x, puck.y + 2, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = puck.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.strokeStyle = puck.rim;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const hg = ctx.createRadialGradient(
        puck.x - puck.radius * 0.35, puck.y - puck.radius * 0.35, 1,
        puck.x, puck.y, puck.radius
      );
      hg.addColorStop(0, 'rgba(255,255,255,0.55)');
      hg.addColorStop(0.6, 'rgba(255,255,255,0.05)');
      hg.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = hg;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = puck.type === 'white'
        ? 'rgba(180, 150, 100, 0.35)'
        : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(puck.x, puck.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = puck.type === 'white' ? '#d4c4a8' : '#3a3a3a';
      ctx.fill();
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
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 8, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(s.x, s.y, s.radius, s.x, s.y, s.radius + 8);
      grd.addColorStop(0, s.color + '00');
      grd.addColorStop(0.5, s.color + Math.floor((0.3 + pulse * 0.3) * 255).toString(16).padStart(2, '0'));
      grd.addColorStop(1, s.color + '00');
      ctx.fillStyle = grd;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y + 2.5, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const hg = ctx.createRadialGradient(
      s.x - s.radius * 0.35, s.y - s.radius * 0.35, 1,
      s.x, s.y, s.radius
    );
    hg.addColorStop(0, 'rgba(255,255,255,0.75)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    hg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius - 0.5, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  },

  drawPocketPops() {
    const ctx = this.ctx;
    for (let i = this.pocketPops.length - 1; i >= 0; i--) {
      const pop = this.pocketPops[i];
      pop.life -= 0.04;
      if (pop.life <= 0) { this.pocketPops.splice(i, 1); continue; }
      const radius = Physics.POCKET_RADIUS * (1 + (1 - pop.life) * 0.9);
      ctx.beginPath();
      ctx.arc(pop.x, pop.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = pop.color + Math.floor(pop.life * 180).toString(16).padStart(2, '0');
      ctx.lineWidth = 3 * pop.life;
      ctx.stroke();
    }
  },

  drawAim() {
    if (!Input.isDragging) return;
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return;
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.4) return;

    const ctx = this.ctx;
    const start = Input.aimStart, current = Input.aimCurrent;
    if (!start || !current) return;
    const dx = current.x - start.x, dy = current.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) return;

    const power = Math.min(dist / 90, 1);
    const angle = Math.atan2(-dy, -dx);
    const lineLen = 90 + power * 200;
    const endX = s.x + Math.cos(angle) * lineLen;
    const endY = s.y + Math.sin(angle) * lineLen;

    const lg = ctx.createLinearGradient(s.x, s.y, endX, endY);
    lg.addColorStop(0, `rgba(245, 197, 66, ${0.75 + power * 0.25})`);
    lg.addColorStop(1, `rgba(245, 197, 66, 0)`);

    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    const endRadius = 5 + power * 10;
    ctx.beginPath();
    ctx.arc(endX, endY, endRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(245, 197, 66, ${0.15 + power * 0.35})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(245, 197, 66, ${0.6 + power * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    const aLen = 11;
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-aLen, -aLen * 0.55);
    ctx.lineTo(-aLen, aLen * 0.55);
    ctx.closePath();
    ctx.fillStyle = `rgba(245, 197, 66, ${0.7 + power * 0.3})`;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius + 5 + power * 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(245, 197, 66, ${0.4 + power * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
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

/* ═══════════════════════════════════════════════════════════
   INPUT
   - Two modes:
     1. ADJUST mode: drag the striker along its baseline (started
        from touching the striker)
     2. AIM mode: drag anywhere else to aim (finger movement
        defines the shot vector)
   - If finger goes OFF the board during AIM, we do NOT shoot.
     We wait for the user to lift their finger to cancel.
   - Only shoots when finger lifts INSIDE the board.
═══════════════════════════════════════════════════════════ */
const Input = {
  isDragging: false,
  mode: null, // 'adjust' or 'aim'
  adjustStart: null, // { x, y } of striker when adjust began
  aimStart: null,    // { x, y } of the finger when aim began
  aimCurrent: null,
  canvas: null,

  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('mousedown', this.onDown.bind(this));
    canvas.addEventListener('mousemove', this.onMove.bind(this));
    canvas.addEventListener('mouseup', this.onUp.bind(this));
    canvas.addEventListener('mouseleave', this.onCancel.bind(this));
    canvas.addEventListener('touchstart', this.onDown.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.onMove.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.onUp.bind(this), { passive: false });
    canvas.addEventListener('touchcancel', this.onCancel.bind(this), { passive: false });
  },

  coords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    let cx, cy;
    if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else if (e.changedTouches && e.changedTouches.length) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  },

  canPlay() {
    if (GAME.mode !== 'playing' && !GAME.isPractice) return false;
    if (!GAME.isPractice && GAME.currentTurn !== GAME.myPlayerIndex) return false;
    const s = Physics.striker;
    if (!s || !s.active) return false;
    if (Math.hypot(s.vx, s.vy) > 0.3) return false;
    if (Game.isResolving) return false;
    return true;
  },

  isInsideBoard(pos) {
    const p = Physics.BOARD_PADDING - 4;
    return pos.x > p && pos.x < Physics.W - p && pos.y > p && pos.y < Physics.H - p;
  },

  onDown(e) {
    if (e.cancelable) e.preventDefault();
    AudioManager.init();
    if (!this.canPlay()) return;

    const s = Physics.striker;
    const pos = this.coords(e);
    const dist = Math.hypot(pos.x - s.x, pos.y - s.y);

    // If user touches the striker: enter adjust mode
    if (dist < s.radius + 24) {
      this.isDragging = true;
      this.mode = 'adjust';
      this.adjustStart = { x: s.x, y: s.y };
      AudioManager.play('click');
      return;
    }

    // Otherwise, if user touches anywhere else on the board: enter aim mode
    if (this.isInsideBoard(pos)) {
      this.isDragging = true;
      this.mode = 'aim';
      this.aimStart = { x: pos.x, y: pos.y };
      this.aimCurrent = { x: pos.x, y: pos.y };
      AudioManager.play('click');
    }
  },

  onMove(e) {
    if (!this.isDragging) return;
    if (e.cancelable) e.preventDefault();
    const pos = this.coords(e);

    if (this.mode === 'adjust') {
      // Slide striker along baseline
      const base = Physics.getBaseline(GAME.currentTurn);
      const s = Physics.striker;
      if (!s || !s.active) return;
      if (base.axis === 'x') {
        s.x = Math.max(base.min, Math.min(base.max, pos.x));
      } else {
        s.y = Math.max(base.min, Math.min(base.max, pos.y));
      }
      // No sound spam — play only occasionally
      if (Math.random() < 0.15) AudioManager.play('slide', { volume: 0.3 });
      return;
    }

    if (this.mode === 'aim') {
      this.aimCurrent = { x: pos.x, y: pos.y };
      const dx = pos.x - this.aimStart.x, dy = pos.y - this.aimStart.y;
      const dist = Math.hypot(dx, dy);
      Game.updatePower(Math.min(dist / 90, 1));
    }
  },

  onUp(e) {
    if (!this.isDragging) return;
    if (e.cancelable) e.preventDefault();

    const mode = this.mode;
    const aimStart = this.aimStart;
    const adjustStart = this.adjustStart;

    // Reset state FIRST
    this.isDragging = false;
    this.mode = null;
    this.aimStart = null;
    this.aimCurrent = null;
    this.adjustStart = null;
    Game.updatePower(0);

    if (mode === 'adjust') {
      // Just slide — no shot on release
      if (Physics.striker && Physics.striker.active) {
        // Broadcast new striker position for others to see
        if (GAME.mode === 'playing' && !GAME.isPractice) {
          Network.broadcast({
            type: 'striker_move',
            player: GAME.myPlayerIndex,
            x: Physics.striker.x,
            y: Physics.striker.y
          });
        }
      }
      return;
    }

    if (mode === 'aim') {
      const pos = this.coords(e);
      // CRITICAL: if user lifted finger OUTSIDE the board, cancel the shot
      if (!this.isInsideBoard(pos)) {
        AudioManager.play('click');
        return;
      }

      const s = Physics.striker;
      if (!s || !s.active || !aimStart) return;

      const dx = pos.x - aimStart.x, dy = pos.y - aimStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 18) return;

      const power = Math.min(dist / 90, 1) * Physics.MAX_POWER;
      const angle = Math.atan2(-dy, -dx);
      s.vx = Math.cos(angle) * power;
      s.vy = Math.sin(angle) * power;
      AudioManager.play('shot');

      if (GAME.mode === 'playing' && !GAME.isPractice) {
        Network.broadcast({
          type: 'shot',
          player: GAME.myPlayerIndex,
          vx: s.vx, vy: s.vy, x: s.x, y: s.y
        });
      }
      Game.isResolving = true;
      Game.resolveStartTime = performance.now();
    }
  },

  onCancel(e) {
    if (!this.isDragging) return;
    // Cancel entirely — no shot
    this.isDragging = false;
    this.mode = null;
    this.aimStart = null;
    this.aimCurrent = null;
    this.adjustStart = null;
    Game.updatePower(0);
  }
};

/* ═══════════════════════════════════════════════════════════
   GAME CONTROLLER
═══════════════════════════════════════════════════════════ */
const Game = {
  isResolving: false,
  resolveStartTime: 0,
  loopId: null,
  lastTime: 0,

  start() {
    Renderer.init();
    Input.init(Renderer.canvas);
    Physics.init();
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
    this.isResolving = false;
    this.updateAdjustSlider();
    this.updateWaitOverlay();
    this.loop(performance.now());
  },

  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    Renderer.time += dt;

    Physics.step(
      (intensity, x, y) => {
        const pan = (x / Physics.W) * 2 - 1;
        if (intensity > 0.5) AudioManager.play('hit_hard', { pan, volume: Math.min(intensity, 1) });
        else AudioManager.play('hit_soft', { pan, volume: Math.min(intensity + 0.25, 0.65) });
      },
      (body, pocket, isStriker) => {
        const pan = (body.x / Physics.W) * 2 - 1;
        Renderer.addPocketPop(pocket.x, pocket.y, body.color);
        if (isStriker) {
          AudioManager.play('striker_pocket', { pan });
          Toast.show('Foul — Striker pocketed', 'error', '⚠️');
        } else {
          AudioManager.play('pocket', { pan });
          if (GAME.mode === 'playing' || GAME.isPractice) {
            GAME.players[GAME.currentTurn].score++;
            this.updateScores();
          }
        }
      },
      body => {
        const pan = (body.x / Physics.W) * 2 - 1;
        const vol = Math.min(Math.hypot(body.vx, body.vy) / 14, 0.55);
        if (vol > 0.1) AudioManager.play('wall', { pan, volume: vol });
      }
    );

    if (this.isResolving) {
      const elapsed = t - this.resolveStartTime;
      const stopped = Physics.allStopped();
      if (stopped || elapsed > 8000) {
        this.isResolving = false;
        this.endTurn();
      }
    }

    if (Physics.activePucksCount() === 0 && !this.isResolving) {
      this.endGame();
    }

    Renderer.draw();
    this.loopId = requestAnimationFrame(this.loop.bind(this));
  },

  endTurn() {
    const foul = !Physics.striker || !Physics.striker.active;
    if (foul) Toast.show('Foul — Turn passes', 'error', '⚠️');
    GAME.currentTurn = (GAME.currentTurn + 1) % 3;
    Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
    if (GAME.mode === 'playing' && !GAME.isPractice && GAME.isHost) {
      Network.broadcast({ type: 'turn_change', currentTurn: GAME.currentTurn });
    }
    this.updateTurnUI();
    this.updateAdjustSlider();
    this.updateWaitOverlay();
    AudioManager.play('turn');
  },

  endGame() {
    AudioManager.play('win');
    this.confetti();
    let max = -1, winner = 0;
    GAME.players.forEach((p, i) => { if (p.score > max) { max = p.score; winner = i; } });
    setTimeout(() => this.showGameOver(winner), 700);
  },

  showGameOver(winnerIdx) {
    const overlay = document.getElementById('gameOverOverlay');
    const icon = document.getElementById('goIcon');
    const heading = document.getElementById('goHeading');
    const text = document.getElementById('goText');
    const scores = document.getElementById('goScores');
    const isMe = winnerIdx === GAME.myPlayerIndex;
    icon.textContent = isMe ? '🏆' : '🎯';
    heading.textContent = isMe ? 'VICTORY!' : 'GAME OVER';
    text.textContent = playerLabel(winnerIdx) + ' wins the match';
    scores.innerHTML = GAME.players.map((p, i) => `
      <div class="go-score" style="animation-delay:${i * 0.1 + 0.1}s">
        <div class="go-score-val" style="color:${PLAYER_COLORS[i]}">${p.score}</div>
        <div class="go-score-lbl">${playerLabel(i)}</div>
      </div>
    `).join('');
    overlay.classList.remove('hidden');
  },

  confetti() {
    const colors = ['#e63946', '#2a9d8f', '#9c6ade', '#f5c542', '#ffffff'];
    for (let i = 0; i < 70; i++) {
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
    if (p > 0.05) row.classList.add('active');
    else row.classList.remove('active');
  },

  updateTurnUI() {
    document.querySelectorAll('.player-chip').forEach((c, i) => {
      c.classList.toggle('active', i === GAME.currentTurn);
    });
    const swatch = document.getElementById('turnSwatch');
    const label = document.getElementById('turnLabel');
    swatch.style.background = PLAYER_COLORS[GAME.currentTurn];
    swatch.style.color = PLAYER_COLORS[GAME.currentTurn];
    if (GAME.currentTurn === GAME.myPlayerIndex) label.textContent = 'YOUR TURN';
    else label.textContent = playerLabel(GAME.currentTurn) + "'S TURN";
    const frame = document.getElementById('boardFrame');
    if (GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex) frame.classList.add('active');
    else frame.classList.remove('active');
  },

  /* Show/hide the adjust slider row */
  updateAdjustSlider() {
    const row = document.getElementById('adjustRow');
    const thumb = document.getElementById('adjustThumb');
    const track = document.getElementById('adjustTrack');
    const isMyTurn = GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex;
    if (!isMyTurn || !Physics.striker || !Physics.striker.active) {
      row.classList.add('hidden');
      return;
    }
    row.classList.remove('hidden');
    const base = Physics.getBaseline(GAME.currentTurn);
    // Compute thumb position: 0–1 along baseline
    let pct = 0.5;
    if (base.axis === 'x') {
      pct = (Physics.striker.x - base.min) / (base.max - base.min);
    } else {
      pct = (Physics.striker.y - base.min) / (base.max - base.min);
    }
    pct = Math.max(0, Math.min(1, pct));
    thumb.style.left = (pct * 100) + '%';

    // Setup track drag if not already
    if (!track.dataset.bound) {
      track.dataset.bound = '1';
      track.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        AudioManager.init();
        if (!Input.canPlay()) return;
        const rect = track.getBoundingClientRect();
        const updateFromX = (clientX) => {
          const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          const pct = x / rect.width;
          const s = Physics.striker;
          if (!s || !s.active) return;
          const base = Physics.getBaseline(GAME.currentTurn);
          if (base.axis === 'x') {
            s.x = base.min + (base.max - base.min) * pct;
          } else {
            s.y = base.min + (base.max - base.min) * pct;
          }
          thumb.style.left = (pct * 100) + '%';
          if (Math.random() < 0.3) AudioManager.play('slide', { volume: 0.25 });
        };
        updateFromX(e.clientX);
        const onMove = (ev) => {
          if (ev.cancelable) ev.preventDefault();
          updateFromX(ev.clientX);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          // Broadcast new position
          if (GAME.mode === 'playing' && !GAME.isPractice && Physics.striker) {
            Network.broadcast({
              type: 'striker_move',
              player: GAME.myPlayerIndex,
              x: Physics.striker.x,
              y: Physics.striker.y
            });
          }
        };
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
      });
    }
  },

  /* Show/hide the wait overlay */
  updateWaitOverlay() {
    const overlay = document.getElementById('waitOverlay');
    const title = document.getElementById('waitTitle');
    const sub = document.getElementById('waitSub');
    const isMyTurn = GAME.isPractice || GAME.currentTurn === GAME.myPlayerIndex;
    if (isMyTurn || GAME.mode === 'menu') {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    title.textContent = 'WAIT...';
    sub.textContent = playerLabel(GAME.currentTurn) + ' is playing';
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

/* ───────────── UI ───────────── */
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
    document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
    document.getElementById('goMenuBtn').addEventListener('click', () => this.goMenu());
    document.querySelectorAll('.reaction').forEach(btn => {
      btn.addEventListener('click', () => this.sendReaction(btn.dataset.emoji));
    });
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
          inputs[i - 1].focus();
          inputs[i - 1].value = '';
          this.updateDigitState();
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
    inputs.forEach(inp => {
      if (inp.value) inp.classList.add('filled');
      else inp.classList.remove('filled');
      code += inp.value;
    });
    document.getElementById('joinCodeInput').value = code;
    const btn = document.getElementById('connectBtn');
    const btnText = document.getElementById('connectBtnText');
    if (code.length === 4) {
      btn.disabled = false;
      btnText.textContent = 'CONNECT';
    } else {
      btn.disabled = true;
      btnText.textContent = 'ENTER 4 DIGITS';
    }
  },

  getJoinCode() { return document.getElementById('joinCodeInput').value; },

  async onCreate() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'host';
    GAME.isHost = true;
    GAME.isPractice = false;
    GAME.myPlayerIndex = 0;
    GAME.players = [
      { id: 'me', name: 'YOU', connected: true, score: 0 },
      { id: null, name: 'P2', connected: false, score: 0 },
      { id: null, name: 'P3', connected: false, score: 0 }
    ];
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('roomCodeDisplay').textContent = '----';
    this.updateFriendSlots();
    try {
      const code = await Network.initHost({
        onPlayerJoin: (conn) => this.onJoinEvent(conn),
        onPlayerLeave: conn => this.onLeaveEvent(conn),
        onData: (data, conn) => this.onData(data, conn),
        onError: err => this.onNetError(err)
      });
      GAME.roomCode = code;
      document.getElementById('roomCodeDisplay').textContent = code;
      Toast.show('Room #' + code + ' created', 'success', '✅');
    } catch(err) {
      Toast.show('Failed to create room', 'error', '❌');
      this.closeModal('createModal');
    }
  },

  onJoin() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'join';
    GAME.isHost = false;
    GAME.isPractice = false;
    document.querySelectorAll('.digit-input').forEach(i => { i.value = ''; i.classList.remove('filled'); });
    document.getElementById('joinCodeInput').value = '';
    this.updateDigitState();
    document.getElementById('joinModal').classList.remove('hidden');
    setTimeout(() => document.querySelector('.digit-input').focus(), 300);
  },

  onPractice() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'practice';
    GAME.isPractice = true;
    GAME.myPlayerIndex = 0;
    GAME.currentTurn = 0;
    GAME.players = [
      { id: 'me', name: 'YOU', connected: true, score: 0 },
      { id: 'p2', name: 'P2', connected: true, score: 0 },
      { id: 'p3', name: 'P3', connected: true, score: 0 }
    ];
    this.enterGame();
  },

  onJoinEvent(conn) {
    if (!GAME.isHost) return;
    const slot = GAME.players.findIndex((p, i) => i > 0 && !p.connected);
    if (slot < 0) { Network.sendTo(conn, { type: 'room_full' }); return; }
    GAME.players[slot].connected = true;
    GAME.players[slot].id = conn.peer;
    GAME.players[slot].name = 'P' + (slot + 1);
    Network.sendTo(conn, {
      type: 'welcome',
      playerIndex: slot,
      players: GAME.players,
      roomCode: GAME.roomCode
    });
    Network.broadcast({ type: 'players_update', players: GAME.players });
    this.updateFriendSlots();
    Toast.show('P' + (slot + 1) + ' joined', 'success', '🎉');
    AudioManager.play('notification');
  },

  onLeaveEvent(conn) {
    const idx = GAME.players.findIndex(p => p.id === conn.peer);
    if (idx > 0) {
      GAME.players[idx].connected = false;
      GAME.players[idx].id = null;
      GAME.players[idx].name = 'P' + (idx + 1);
      this.updateFriendSlots();
      Network.broadcast({ type: 'players_update', players: GAME.players });
      Toast.show('Player left', 'info', '👋');
    }
  },

  onData(data, conn) {
    switch(data.type) {
      case 'hello': this.onJoinEvent(conn); break;
      case 'welcome':
        GAME.myPlayerIndex = data.playerIndex;
        GAME.players = data.players;
        GAME.roomCode = data.roomCode;
        document.getElementById('connectingOverlay').classList.add('hidden');
        Toast.show('Connected as ' + playerLabel(GAME.myPlayerIndex), 'success', '🎉');
        setTimeout(() => {
          Game.updateScores();
          Game.relabelChips();
        }, 100);
        break;
      case 'room_full':
        document.getElementById('connectingOverlay').classList.add('hidden');
        Toast.show('Room full', 'error', '🚫');
        Network.disconnect();
        GAME.mode = 'menu';
        break;
      case 'players_update':
        GAME.players = data.players;
        break;
      case 'start_game':
        GAME.players = data.players;
        GAME.currentTurn = data.currentTurn;
        this.enterGame();
        break;
      case 'shot':
        if (data.player !== GAME.myPlayerIndex) {
          if (Physics.striker) {
            Physics.striker.x = data.x;
            Physics.striker.y = data.y;
            Physics.striker.vx = data.vx;
            Physics.striker.vy = data.vy;
          }
          Game.isResolving = true;
          Game.resolveStartTime = performance.now();
        }
        break;
      case 'striker_move':
        // Another player moved their striker along baseline
        if (data.player !== GAME.myPlayerIndex && Physics.striker) {
          Physics.striker.x = data.x;
          Physics.striker.y = data.y;
        }
        break;
      case 'turn_change':
        GAME.currentTurn = data.currentTurn;
        Physics.striker = Physics.createStriker(GAME.currentTurn, 0.5);
        Game.isResolving = false;
        Game.updateTurnUI();
        Game.updateAdjustSlider();
        Game.updateWaitOverlay();
        AudioManager.play('turn');
        break;
      case 'reaction':
        // Only show if it's from someone else
        if (data.player !== GAME.myPlayerIndex) {
          this.showReaction(data.emoji);
        }
        break;
      case 'play_again':
        this.playAgain();
        break;
    }
  },

  onNetError(err) {
    document.getElementById('connectingOverlay').classList.add('hidden');
    Toast.show('Network error', 'error', '❌');
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
        tag.textContent = '✓ READY';
      } else {
        slot.classList.remove('connected');
        avatar.classList.add('empty');
        avatar.textContent = (idx + 1);
        name.textContent = 'Waiting...';
        tag.textContent = 'Not connected';
      }
    });
    const count = GAME.players.filter(p => p.connected).length;
    const btn = document.getElementById('startGameBtn');
    const btnText = document.getElementById('startBtnText');
    const hint = document.getElementById('waitingHint');
    if (count === 3) {
      btn.disabled = false;
      btnText.textContent = 'START GAME';
      hint.classList.add('hidden');
    } else {
      btn.disabled = true;
      const need = 3 - count;
      btnText.textContent = `NEED ${need} MORE PLAYER${need > 1 ? 'S' : ''}`;
      hint.classList.remove('hidden');
    }
  },

  copyCode() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    if (code && code !== '----') {
      navigator.clipboard.writeText(code).then(() => {
        Toast.show('Code copied', 'success', '📋');
        AudioManager.play('notification');
      });
    }
  },

  shareLink() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    if (!code || code === '----') return;
    const url = location.origin + location.pathname + '?room=' + code;
    const text = `Join Carrom 3P! Code: ${code}\n${url}`;
    if (navigator.share) {
      navigator.share({ title: 'Carrom 3P', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        Toast.show('Link copied', 'success', '🔗');
      });
    }
  },

  async connect() {
    const code = this.getJoinCode();
    if (code.length !== 4) { Toast.show('Enter 4-digit code', 'error', '⚠️'); return; }
    AudioManager.play('click');
    this.closeModal('joinModal');
    document.getElementById('connectingOverlay').classList.remove('hidden');
    document.getElementById('connectingText').textContent = 'Connecting to #' + code + '...';
    try {
      await Network.initClient(code, {
        onPlayerJoin: (c) => this.onJoinEvent(c),
        onPlayerLeave: c => this.onLeaveEvent(c),
        onData: (d, c) => this.onData(d, c),
        onError: e => this.onNetError(e)
      });
      setTimeout(() => {
        const overlay = document.getElementById('connectingOverlay');
        if (!overlay.classList.contains('hidden')) {
          overlay.classList.add('hidden');
          Toast.show('Connected to #' + code, 'success', '🎉');
        }
      }, 3000);
    } catch(err) {
      document.getElementById('connectingOverlay').classList.add('hidden');
      if (err && err.message === 'peer-unavailable') Toast.show('Room not found', 'error', '❌');
      else if (err && err.message === 'client-timeout') Toast.show('Connection timed out', 'error', '⏱️');
      else Toast.show('Connection failed', 'error', '❌');
      Network.disconnect();
      GAME.mode = 'menu';
    }
  },

  startGame() {
    const count = GAME.players.filter(p => p.connected).length;
    if (count < 3) { Toast.show('Need 3 players', 'error', '⚠️'); return; }
    GAME.currentTurn = 0;
    AudioManager.play('click');
    Network.broadcast({ type: 'start_game', players: GAME.players, currentTurn: 0 });
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
    document.querySelectorAll('.player-chip').forEach(chip => {
      const idx = parseInt(chip.dataset.p);
      const nameEl = chip.querySelector('.pc-name');
      if (nameEl) nameEl.textContent = playerLabel(idx);
    });
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
    GAME.mode = 'menu';
    GAME.isPractice = false;
    GAME.isHost = false;
    GAME.currentTurn = 0;
    GAME.myPlayerIndex = 0;
    GAME.players = [
      { id: 'me', name: 'YOU', connected: true, score: 0 },
      { id: null, name: 'P2', connected: false, score: 0 },
      { id: null, name: 'P3', connected: false, score: 0 }
    ];
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    document.getElementById('createModal').classList.add('hidden');
    document.getElementById('joinModal').classList.add('hidden');
    document.getElementById('connectingOverlay').classList.add('hidden');
    Physics.pucks = [];
    Physics.striker = null;
    Renderer.pocketPops = [];
    Game.isResolving = false;
  },

  playAgain() {
    document.getElementById('gameOverOverlay').classList.add('hidden');
    GAME.players.forEach(p => p.score = 0);
    GAME.currentTurn = 0;
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(0, 0.5);
    Renderer.pocketPops = [];
    Game.isResolving = false;
    Game.updateScores();
    Game.updateTurnUI();
    Game.updateAdjustSlider();
    Game.updateWaitOverlay();
    if (GAME.mode === 'playing' && GAME.isHost) {
      Network.broadcast({ type: 'play_again' });
    }
  },

  /* Emoji chat — send to all peers AND show locally */
  sendReaction(emoji) {
    AudioManager.play('click');
    this.showReaction(emoji);
    if (GAME.mode === 'playing' && !GAME.isPractice) {
      Network.broadcast({ type: 'reaction', emoji, player: GAME.myPlayerIndex });
    }
  },

  /* Shows a floating emoji over the board */
  showReaction(emoji) {
    const layer = document.getElementById('emojiLayer');
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = (15 + Math.random() * 70) + '%';
    el.style.bottom = '120px';
    el.style.animationDuration = (2.4 + Math.random() * 0.8) + 's';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3400);
    // Play a soft pop sound
    if (GAME.audioEnabled) AudioManager.play('notification', { volume: 0.3 });
  },

  closeModal(id) { document.getElementById(id).classList.add('hidden'); }
};

const Toast = {
  show(msg, type = 'info', icon = 'ℹ️') {
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
      p = 100;
      clearInterval(iv);
      setTimeout(() => {
        screen.classList.add('hidden');
        menu.classList.remove('hidden');
      }, 350);
    }
    fill.style.width = Math.min(p, 100) + '%';
  }, 200);
  screen.addEventListener('click', () => {
    if (!screen.classList.contains('hidden')) {
      clearInterval(iv);
      fill.style.width = '100%';
      setTimeout(() => {
        screen.classList.add('hidden');
        menu.classList.remove('hidden');
      }, 200);
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
      screen.classList.add('hidden');
      menu.classList.remove('hidden');
      UI.onJoin();
      const digits = roomParam.split('');
      const inputs = document.querySelectorAll('.digit-input');
      digits.forEach((d, i) => { if (inputs[i]) inputs[i].value = d; });
      UI.updateDigitState();
    }, 2500);
  }

  document.body.addEventListener('touchstart', () => AudioManager.init(), { once: true });
  document.body.addEventListener('click', () => AudioManager.init(), { once: true });
  document.getElementById('gameCanvas').addEventListener('contextmenu', e => e.preventDefault());

  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap <= 300) e.preventDefault();
    lastTap = now;
  }, { passive: false });
});

window.addEventListener('touchmove', e => {
  if (e.target.closest('#gameCanvas') || e.target.closest('.board-wrap')) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (!AudioManager._ctx) return;
  if (document.hidden) AudioManager._ctx.suspend();
  else AudioManager._ctx.resume();
});

window.addEventListener('beforeunload', () => { Network.disconnect(); });
