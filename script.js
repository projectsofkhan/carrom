/* ═══════════════════════════════════════════════════════════
   CARROM 3P FREESTYLE • MAIN SCRIPT
   Peer-to-peer multiplayer using PeerJS
   Sound via Howler.js
═══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   GLOBAL STATE
───────────────────────────────────────────── */
const GAME = {
  mode: 'menu', // menu, host, join, practice, playing
  myPlayerIndex: 0,
  playerCount: 1,
  currentTurn: 0,
  isHost: false,
  isPractice: false,
  roomCode: null,
  players: [
    { id: null, name: 'YOU', connected: false, score: 0 },
    { id: null, name: 'WAITING', connected: false, score: 0 },
    { id: null, name: 'WAITING', connected: false, score: 0 }
  ],
  audioEnabled: true,
  soundVolume: 0.6
};

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#9c6ade'];
const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3'];

/* ─────────────────────────────────────────────
   AUDIO MANAGER (Howler)
───────────────────────────────────────────── */
const AudioManager = {
  sounds: {},
  initialized: false,

  init() {
    if (this.initialized) return;
    
    // Generate sounds via Web Audio API (no external files needed)
    // Using Howler with synthesized audio buffers would require base64,
    // so we use a hybrid: Howler for control + Web Audio for synthesis
    
    this.initialized = true;
    console.log('🎵 Audio manager initialized');
  },

  play(type, options = {}) {
    if (!GAME.audioEnabled) return;
    const { pan = 0, volume = 1 } = options;
    this.synthesize(type, pan, volume);
  },

  synthesize(type, pan, volume) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const master = ctx.createGain();
      const panner = ctx.createStereoPanner();
      
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      master.gain.value = GAME.soundVolume * volume;
      
      master.connect(panner);
      panner.connect(ctx.destination);

      switch(type) {
        case 'hit_soft':
          this.tone(ctx, master, 480, 220, 'triangle', 0.06, 0.3);
          break;
        case 'hit_hard':
          this.tone(ctx, master, 620, 180, 'square', 0.05, 0.5);
          this.noise(ctx, master, 0.03, 0.2);
          break;
        case 'wall':
          this.tone(ctx, master, 240, 120, 'sine', 0.08, 0.25);
          break;
        case 'pocket':
          this.tone(ctx, master, 700, 200, 'sawtooth', 0.12, 0.4);
          this.tone(ctx, master, 1200, 400, 'sine', 0.2, 0.3);
          break;
        case 'striker_pocket':
          this.tone(ctx, master, 180, 80, 'square', 0.3, 0.5);
          this.tone(ctx, master, 90, 60, 'sawtooth', 0.4, 0.4);
          break;
        case 'shot':
          this.tone(ctx, master, 340, 180, 'triangle', 0.1, 0.4);
          break;
        case 'win':
          this.melody(ctx, master, [523, 659, 784, 1047], 0.15, 0.4);
          break;
        case 'lose':
          this.melody(ctx, master, [400, 350, 280, 200], 0.15, 0.3);
          break;
        case 'click':
          this.tone(ctx, master, 800, 400, 'sine', 0.04, 0.15);
          break;
        case 'connect':
          this.melody(ctx, master, [440, 660], 0.1, 0.3);
          break;
        case 'notification':
          this.tone(ctx, master, 880, 660, 'sine', 0.15, 0.25);
          break;
        case 'turn':
          this.melody(ctx, master, [440, 587], 0.08, 0.25);
          break;
      }
    } catch(e) {
      // Silently fail
    }
  },

  getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  },

  tone(ctx, dest, freqStart, freqEnd, wave, duration, gainVal) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = wave;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), now + duration);
    
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    
    osc.connect(gain);
    gain.connect(dest);
    
    osc.start(now);
    osc.stop(now + duration + 0.02);
  },

  noise(ctx, dest, duration, gainVal) {
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(gain);
    gain.connect(dest);
    src.start(now);
  },

  melody(ctx, dest, notes, noteDur, gainVal) {
    let t = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(gainVal, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + noteDur + 0.02);
      t += noteDur;
    });
  }
};

/* ─────────────────────────────────────────────
   P2P NETWORK MANAGER (PeerJS)
───────────────────────────────────────────── */
const Network = {
  peer: null,
  connections: [], // Array of DataConnections
  isHost: false,
  roomCode: null,
  onPlayerJoin: null,
  onPlayerLeave: null,
  onData: null,
  onError: null,

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  initHost(callbacks) {
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    this.onPlayerJoin = callbacks.onPlayerJoin;
    this.onPlayerLeave = callbacks.onPlayerLeave;
    this.onData = callbacks.onData;
    this.onError = callbacks.onError;
    
    // Use a deterministic ID with prefix so joiners can find us
    const peerId = 'carrom3p-' + this.roomCode;
    
    return new Promise((resolve, reject) => {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('✅ Host ready, room:', this.roomCode);
        AudioManager.play('connect');
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        console.log('👤 Incoming connection:', conn.peer);
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('❌ Peer error:', err);
        if (this.onError) this.onError(err);
        reject(err);
      });

      this.peer.on('disconnected', () => {
        console.warn('⚠️ Peer disconnected');
      });
    });
  },

  initClient(roomCode, callbacks) {
    this.isHost = false;
    this.roomCode = roomCode;
    this.onData = callbacks.onData;
    this.onError = callbacks.onError;
    this.onPlayerJoin = callbacks.onPlayerJoin;
    this.onPlayerLeave = callbacks.onPlayerLeave;

    const hostPeerId = 'carrom3p-' + roomCode.toUpperCase();
    
    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', () => {
        console.log('🔌 Client ready, connecting to:', hostPeerId);
        const conn = this.peer.connect(hostPeerId, { reliable: true });
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('❌ Client error:', err);
        if (this.onError) this.onError(err);
        reject(err);
      });
    });
  },

  setupConnection(conn) {
    conn.on('open', () => {
      console.log('✅ Connection open:', conn.peer);
      this.connections.push(conn);
      AudioManager.play('connect');
      if (this.onPlayerJoin) {
        this.onPlayerJoin(conn, this.connections.length);
      }
    });

    conn.on('data', (data) => {
      if (this.onData) this.onData(data, conn);
    });

    conn.on('close', () => {
      console.log('🔌 Connection closed:', conn.peer);
      this.connections = this.connections.filter(c => c !== conn);
      if (this.onPlayerLeave) this.onPlayerLeave(conn);
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  },

  broadcast(data) {
    this.connections.forEach(conn => {
      if (conn.open) {
        try { conn.send(data); } catch(e) { console.error('Send error:', e); }
      }
    });
  },

  sendTo(conn, data) {
    if (conn && conn.open) {
      try { conn.send(data); } catch(e) { console.error('Send error:', e); }
    }
  },

  disconnect() {
    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
      this.peer = null;
    }
    this.connections = [];
  }
};

/* ─────────────────────────────────────────────
   PHYSICS ENGINE (Carrom)
───────────────────────────────────────────── */
const Physics = {
  W: 700, H: 700,
  BOARD_PADDING: 56,
  PUCK_RADIUS: 17,
  STRIKER_RADIUS: 20,
  POCKET_RADIUS: 24,
  FRICTION: 0.9785,
  WALL_BOUNCE: 0.72,
  MIN_SPEED: 0.1,
  MAX_POWER: 12,
  
  pockets: [],
  pucks: [],
  striker: null,
  particles: [],
  trails: [],

  init() {
    this.pockets = [
      { x: this.BOARD_PADDING, y: this.BOARD_PADDING },
      { x: this.W - this.BOARD_PADDING, y: this.BOARD_PADDING },
      { x: this.BOARD_PADDING, y: this.H - this.BOARD_PADDING },
      { x: this.W - this.BOARD_PADDING, y: this.H - this.BOARD_PADDING }
    ];
  },

  getBoardBounds() {
    const p = this.BOARD_PADDING;
    return {
      left: p,
      right: this.W - p,
      top: p,
      bottom: this.H - p
    };
  },

  createPucks() {
    const pucks = [];
    const cx = this.W / 2;
    const cy = this.H / 2;
    
    // 9 white outer ring
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 - Math.PI / 2;
      pucks.push({
        id: 'w' + i,
        x: cx + Math.cos(angle) * 62,
        y: cy + Math.sin(angle) * 62,
        vx: 0, vy: 0,
        radius: this.PUCK_RADIUS,
        color: '#f5ede0',
        rimColor: '#d4c4a8',
        type: 'white',
        active: true,
        trail: []
      });
    }
    
    // 9 black inner ring
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + 0.35;
      pucks.push({
        id: 'b' + i,
        x: cx + Math.cos(angle) * 32,
        y: cy + Math.sin(angle) * 32,
        vx: 0, vy: 0,
        radius: this.PUCK_RADIUS,
        color: '#1e1e1e',
        rimColor: '#000000',
        type: 'black',
        active: true,
        trail: []
      });
    }
    
    // 1 center extra
    pucks.push({
      id: 'c0',
      x: cx, y: cy,
      vx: 0, vy: 0,
      radius: this.PUCK_RADIUS,
      color: '#f5ede0',
      rimColor: '#d4c4a8',
      type: 'white',
      active: true,
      trail: []
    });
    
    return pucks;
  },

  createStriker(playerIndex) {
    const bases = [
      { x: this.W / 2, y: this.H - this.BOARD_PADDING - 60 },
      { x: this.BOARD_PADDING + 110, y: this.BOARD_PADDING + 110 },
      { x: this.W - this.BOARD_PADDING - 110, y: this.BOARD_PADDING + 110 }
    ];
    const b = bases[playerIndex];
    return {
      x: b.x, y: b.y,
      vx: 0, vy: 0,
      radius: this.STRIKER_RADIUS,
      color: PLAYER_COLORS[playerIndex],
      type: 'striker',
      active: true,
      trail: []
    };
  },

  resolveCollision(a, b, onHit) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    
    if (dist < minDist && dist > 0.01) {
      const overlap = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      
      const dvx = b.vx - a.vx;
      const dvy = b.vy - a.vy;
      const vn = dvx * nx + dvy * ny;
      
      if (vn > 0) return;
      
      const e = 0.88;
      const j = -(1 + e) * vn / (1/a.radius + 1/b.radius);
      const impulseX = j * nx;
      const impulseY = j * ny;
      
      a.vx -= impulseX / a.radius;
      a.vy -= impulseY / a.radius;
      b.vx += impulseX / b.radius;
      b.vy += impulseY / b.radius;
      
      const speed = Math.abs(vn);
      if (speed > 0.5 && onHit) {
        onHit(Math.min(speed / 15, 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      
      // Particles
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 4;
        this.particles.push({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 1.0,
          decay: 0.025 + Math.random() * 0.02,
          size: 3 + Math.random() * 5,
          color: Math.random() > 0.5 ? a.color : b.color
        });
      }
    }
  },

  step(onCollision, onPocket, onWall) {
    const b = this.getBoardBounds();
    
    // Update striker
    if (this.striker && this.striker.active) {
      this.stepBody(this.striker, b, onWall);
      this.checkPockets(this.striker, onPocket, true);
    }
    
    // Update pucks
    for (const puck of this.pucks) {
      if (!puck.active) continue;
      this.stepBody(puck, b, onWall);
      this.checkPockets(puck, onPocket, false);
    }
    
    // Puck-puck collisions
    for (let i = 0; i < this.pucks.length; i++) {
      if (!this.pucks[i].active) continue;
      for (let j = i + 1; j < this.pucks.length; j++) {
        if (!this.pucks[j].active) continue;
        this.resolveCollision(this.pucks[i], this.pucks[j], onCollision);
      }
    }
    
    // Striker-puck collisions
    if (this.striker && this.striker.active) {
      for (const puck of this.pucks) {
        if (!puck.active) continue;
        this.resolveCollision(this.striker, puck, onCollision);
      }
    }
    
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= pt.decay;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  },

  stepBody(body, bounds, onWall) {
    body.x += body.vx;
    body.y += body.vy;
    body.vx *= this.FRICTION;
    body.vy *= this.FRICTION;
    
    if (Math.hypot(body.vx, body.vy) < this.MIN_SPEED) {
      body.vx = 0;
      body.vy = 0;
    }
    
    // Trail
    if (Math.hypot(body.vx, body.vy) > 1) {
      body.trail.push({ x: body.x, y: body.y, life: 1.0 });
      if (body.trail.length > 12) body.trail.shift();
    }
    
    // Walls
    let hitWall = false;
    if (body.x - body.radius < bounds.left) {
      body.x = bounds.left + body.radius;
      body.vx *= -this.WALL_BOUNCE;
      hitWall = true;
    }
    if (body.x + body.radius > bounds.right) {
      body.x = bounds.right - body.radius;
      body.vx *= -this.WALL_BOUNCE;
      hitWall = true;
    }
    if (body.y - body.radius < bounds.top) {
      body.y = bounds.top + body.radius;
      body.vy *= -this.WALL_BOUNCE;
      hitWall = true;
    }
    if (body.y + body.radius > bounds.bottom) {
      body.y = bounds.bottom - body.radius;
      body.vy *= -this.WALL_BOUNCE;
      hitWall = true;
    }
    
    if (hitWall && onWall) onWall(body);
  },

  checkPockets(body, onPocket, isStriker) {
    for (const p of this.pockets) {
      const dist = Math.hypot(body.x - p.x, body.y - p.y);
      if (dist < this.POCKET_RADIUS - 4) {
        body.active = false;
        body.vx = 0;
        body.vy = 0;
        if (onPocket) onPocket(body, p, isStriker);
        return true;
      }
    }
    return false;
  },

  allPucksStopped() {
    if (this.striker && this.striker.active && Math.hypot(this.striker.vx, this.striker.vy) > 0.05) return false;
    for (const p of this.pucks) {
      if (p.active && Math.hypot(p.vx, p.vy) > 0.05) return false;
    }
    return true;
  },

  activePucksCount() {
    return this.pucks.filter(p => p.active).length;
  }
};

/* ─────────────────────────────────────────────
   RENDERER
───────────────────────────────────────────── */
const Renderer = {
  canvas: null,
  ctx: null,
  W: 700,
  H: 700,
  time: 0,

  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
  },

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    
    this.drawBoard();
    this.drawParticles();
    this.drawPucks();
    this.drawStriker();
    this.drawAim();
  },

  drawBoard() {
    const ctx = this.ctx;
    const p = Physics.BOARD_PADDING;
    const w = this.W - p * 2;
    const h = this.H - p * 2;
    
    // Outer frame
    ctx.save();
    const outerGrad = ctx.createLinearGradient(0, 0, this.W, this.H);
    outerGrad.addColorStop(0, '#a06838');
    outerGrad.addColorStop(0.5, '#7a4a24');
    outerGrad.addColorStop(1, '#5a3218');
    ctx.fillStyle = outerGrad;
    this.roundRect(ctx, 0, 0, this.W, this.H, 40);
    ctx.fill();
    
    // Inner playing surface
    const boardGrad = ctx.createRadialGradient(
      this.W/2, this.H/2, 50,
      this.W/2, this.H/2, this.W/1.4
    );
    boardGrad.addColorStop(0, '#f7ead4');
    boardGrad.addColorStop(0.7, '#f0e0c4');
    boardGrad.addColorStop(1, '#e8d5b0');
    
    ctx.fillStyle = boardGrad;
    this.roundRect(ctx, p - 8, p - 8, w + 16, h + 16, 24);
    ctx.fill();
    
    // Board pattern - subtle grid
    ctx.strokeStyle = 'rgba(180, 150, 100, 0.15)';
    ctx.lineWidth = 1;
    const gridCount = 14;
    for (let i = 0; i <= gridCount; i++) {
      const x = p + (i * w) / gridCount;
      const y = p + (i * h) / gridCount;
      ctx.beginPath();
      ctx.moveTo(x, p);
      ctx.lineTo(x, this.H - p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, y);
      ctx.lineTo(this.W - p, y);
      ctx.stroke();
    }
    
    // Border lines
    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = 3;
    this.roundRect(ctx, p - 8, p - 8, w + 16, h + 16, 24);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, p - 4, p - 4, w + 8, h + 8, 20);
    ctx.stroke();
    
    // Center circle
    ctx.beginPath();
    ctx.arc(this.W/2, this.H/2, 78, 0, Math.PI * 2);
    ctx.strokeStyle = '#b89268';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(this.W/2, this.H/2, 68, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(184, 146, 104, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Center design
    ctx.beginPath();
    ctx.arc(this.W/2, this.H/2, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#b89268';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(this.W/2, this.H/2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f7ead4';
    ctx.fill();
    
    // Corner arcs
    const corners = [
      { x: p, y: p, start: 0, end: Math.PI/2 },
      { x: this.W - p, y: p, start: Math.PI/2, end: Math.PI },
      { x: this.W - p, y: this.H - p, start: Math.PI, end: Math.PI * 1.5 },
      { x: p, y: this.H - p, start: Math.PI * 1.5, end: Math.PI * 2 }
    ];
    
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 70, c.start, c.end);
      ctx.strokeStyle = 'rgba(184, 146, 104, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Pockets
    for (const pocket of Physics.pockets) {
      // Shadow
      const pg = ctx.createRadialGradient(
        pocket.x, pocket.y, 2,
        pocket.x, pocket.y, Physics.POCKET_RADIUS
      );
      pg.addColorStop(0, '#000000');
      pg.addColorStop(0.7, '#1a0f08');
      pg.addColorStop(1, '#2a1a0e');
      
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, Physics.POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();
      
      // Inner shadow
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, Physics.POCKET_RADIUS - 4, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
      
      // Rim highlight
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, Physics.POCKET_RADIUS - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 80, 40, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    
    ctx.restore();
  },

  drawPucks() {
    const ctx = this.ctx;
    for (const puck of Physics.pucks) {
      if (!puck.active) continue;
      
      // Trail
      if (puck.trail && puck.trail.length > 1) {
        ctx.save();
        for (let i = 0; i < puck.trail.length; i++) {
          const t = puck.trail[i];
          const alpha = (i / puck.trail.length) * 0.25;
          ctx.beginPath();
          ctx.arc(t.x, t.y, puck.radius * (i / puck.trail.length) * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = puck.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }
        ctx.restore();
      }
      
      // Shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.fillStyle = puck.color;
      ctx.fill();
      ctx.restore();
      
      // Rim
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
      ctx.strokeStyle = puck.rimColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Highlight
      const hg = ctx.createRadialGradient(
        puck.x - puck.radius * 0.4,
        puck.y - puck.radius * 0.4,
        1,
        puck.x,
        puck.y,
        puck.radius
      );
      hg.addColorStop(0, 'rgba(255,255,255,0.5)');
      hg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      hg.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius - 1, 0, Math.PI * 2);
      ctx.fillStyle = hg;
      ctx.fill();
      
      // Inner ring
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, puck.radius * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = puck.type === 'white' ? 'rgba(180, 150, 100, 0.4)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      
      // Center dot
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = puck.type === 'white' ? '#d4c4a8' : '#333';
      ctx.fill();
    }
  },

  drawStriker() {
    const s = Physics.striker;
    if (!s || !s.active) return;
    const ctx = this.ctx;
    
    // Trail
    if (s.trail && s.trail.length > 1) {
      for (let i = 0; i < s.trail.length; i++) {
        const t = s.trail[i];
        const alpha = (i / s.trail.length) * 0.3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, s.radius * (i / s.trail.length) * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = s.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      }
    }
    
    // Glow when active
    const isMoving = Math.hypot(s.vx, s.vy) > 0.3;
    if (!isMoving && GAME.currentTurn === GAME.myPlayerIndex && (GAME.mode === 'playing' || GAME.isPractice)) {
      const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
      ctx.save();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 20 + pulse * 15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = s.color + Math.floor((0.4 + pulse * 0.4) * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    
    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.restore();
    
    // Highlight
    const hg = ctx.createRadialGradient(
      s.x - s.radius * 0.4,
      s.y - s.radius * 0.4,
      1,
      s.x,
      s.y,
      s.radius
    );
    hg.addColorStop(0, 'rgba(255,255,255,0.7)');
    hg.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    hg.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius - 1, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();
    
    // Ring
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Center dot
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  },

  drawAim() {
    if (!Input.isDragging) return;
    if (GAME.currentTurn !== GAME.myPlayerIndex && !GAME.isPractice) return;
    
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.5) return;
    
    const ctx = this.ctx;
    const start = Input.dragStart;
    const current = Input.dragCurrent;
    
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < 15) return;
    
    const power = Math.min(dist / 80, 1);
    const angle = Math.atan2(-dy, -dx);
    
    // Aim line
    const lineLen = 100 + power * 180;
    const endX = s.x + Math.cos(angle) * lineLen;
    const endY = s.y + Math.sin(angle) * lineLen;
    
    // Gradient line
    const lg = ctx.createLinearGradient(s.x, s.y, endX, endY);
    lg.addColorStop(0, `rgba(245, 197, 66, ${0.3 + power * 0.5})`);
    lg.addColorStop(1, `rgba(245, 197, 66, 0)`);
    
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    
    // Power indicator circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(endX, endY, 8 + power * 14, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(245, 197, 66, ${0.2 + power * 0.4})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(245, 197, 66, ${0.5 + power * 0.5})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    
    // Direction arrow head
    const arrowSize = 14;
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowSize, -arrowSize * 0.6);
    ctx.lineTo(-arrowSize, arrowSize * 0.6);
    ctx.closePath();
    ctx.fillStyle = `rgba(245, 197, 66, ${0.6 + power * 0.4})`;
    ctx.fill();
    ctx.restore();
  },

  drawParticles() {
    const ctx = this.ctx;
    for (const pt of Physics.particles) {
      ctx.globalAlpha = pt.life * 0.85;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

/* ─────────────────────────────────────────────
   INPUT HANDLER
───────────────────────────────────────────── */
const Input = {
  isDragging: false,
  dragStart: null,
  dragCurrent: null,
  canvas: null,

  init(canvas) {
    this.canvas = canvas;
    
    canvas.addEventListener('mousedown', this.onDown.bind(this));
    canvas.addEventListener('mousemove', this.onMove.bind(this));
    canvas.addEventListener('mouseup', this.onUp.bind(this));
    canvas.addEventListener('mouseleave', this.onUp.bind(this));
    
    canvas.addEventListener('touchstart', this.onDown.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.onMove.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.onUp.bind(this), { passive: false });
    canvas.addEventListener('touchcancel', this.onUp.bind(this), { passive: false });
  },

  getCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let clientX, clientY;
    
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  },

  onDown(e) {
    e.preventDefault();
    AudioManager.init();
    
    if (GAME.mode !== 'playing' && !GAME.isPractice) return;
    if (GAME.currentTurn !== GAME.myPlayerIndex && !GAME.isPractice) return;
    
    const s = Physics.striker;
    if (!s || !s.active) return;
    if (Math.hypot(s.vx, s.vy) > 0.5) return;
    
    const pos = this.getCoords(e);
    const dist = Math.hypot(pos.x - s.x, pos.y - s.y);
    
    if (dist < 100) {
      this.isDragging = true;
      this.dragStart = { x: s.x, y: s.y };
      this.dragCurrent = { x: pos.x, y: pos.y };
      AudioManager.play('click');
    }
  },

  onMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const pos = this.getCoords(e);
    this.dragCurrent = { x: pos.x, y: pos.y };
    
    const dx = pos.x - this.dragStart.x;
    const dy = pos.y - this.dragStart.y;
    const dist = Math.hypot(dx, dy);
    const power = Math.min(dist / 80, 1);
    
    Game.updatePowerMeter(power);
  },

  onUp(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    
    const s = Physics.striker;
    if (!s || !s.active) {
      this.reset();
      return;
    }
    
    const pos = this.getCoords(e);
    const dx = pos.x - this.dragStart.x;
    const dy = pos.y - this.dragStart.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 20) {
      const power = Math.min(dist / 80, 1) * Physics.MAX_POWER;
      const angle = Math.atan2(-dy, -dx);
      
      s.vx = Math.cos(angle) * power;
      s.vy = Math.sin(angle) * power;
      
      AudioManager.play('shot');
      
      // Broadcast shot if multiplayer
      if (GAME.mode === 'playing' && !GAME.isPractice) {
        Network.broadcast({
          type: 'shot',
          player: GAME.myPlayerIndex,
          vx: s.vx,
          vy: s.vy,
          x: s.x,
          y: s.y
        });
      }
      
      Game.startTurnResolution();
    }
    
    this.reset();
  },

  reset() {
    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    Game.updatePowerMeter(0);
  }
};

/* ─────────────────────────────────────────────
   GAME CONTROLLER
───────────────────────────────────────────── */
const Game = {
  isResolving: false,
  gameLoopId: null,
  lastTime: 0,

  start() {
    Renderer.init();
    Input.init(Renderer.canvas);
    Physics.init();
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(GAME.currentTurn);
    this.loop(performance.now());
  },

  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 0.05);
    this.lastTime = t;
    Renderer.time += dt;
    
    Physics.step(
      (intensity, x, y) => {
        // Collision sound
        const pan = (x / Physics.W) * 2 - 1;
        if (intensity > 0.4) {
          AudioManager.play('hit_hard', { pan, volume: Math.min(intensity, 1) });
        } else {
          AudioManager.play('hit_soft', { pan, volume: Math.min(intensity + 0.2, 0.7) });
        }
      },
      (body, pocket, isStriker) => {
        // Pocket sound
        const pan = (body.x / Physics.W) * 2 - 1;
        if (isStriker) {
          AudioManager.play('striker_pocket', { pan });
          Toast.show('Foul! Striker pocketed', 'error', '⚠️');
        } else {
          AudioManager.play('pocket', { pan });
          // Add to current player's score
          if (GAME.mode === 'playing' || GAME.isPractice) {
            GAME.players[GAME.currentTurn].score++;
            this.updateScoreboard();
          }
        }
      },
      (body) => {
        // Wall sound
        const pan = (body.x / Physics.W) * 2 - 1;
        const vol = Math.min(Math.hypot(body.vx, body.vy) / 12, 0.6);
        if (vol > 0.1) AudioManager.play('wall', { pan, volume: vol });
      }
    );
    
    // Check if turn is done
    if (this.isResolving && Physics.allPucksStopped()) {
      this.isResolving = false;
      this.endTurn();
    }
    
    // Check win
    if (Physics.activePucksCount() === 0 && !this.isResolving) {
      this.endGame();
    }
    
    Renderer.draw();
    this.gameLoopId = requestAnimationFrame(this.loop.bind(this));
  },

  startTurnResolution() {
    this.isResolving = true;
  },

  endTurn() {
    // Check for foul (striker pocketed)
    const strikerPocketed = !Physics.striker || !Physics.striker.active;
    
    if (!strikerPocketed) {
      // No foul, switch player
      this.switchPlayer();
    } else {
      // Foul: switch player and re-spawn striker
      Toast.show('Foul! Turn passes', 'error', '⚠️');
      this.switchPlayer();
    }
    
    // Reset striker for next player
    Physics.striker = Physics.createStriker(GAME.currentTurn);
    
    // Sync in multiplayer
    if (GAME.mode === 'playing' && !GAME.isPractice && GAME.isHost) {
      Network.broadcast({
        type: 'turn_change',
        currentTurn: GAME.currentTurn
      });
    }
    
    this.updateTurnUI();
    AudioManager.play('turn');
  },

  switchPlayer() {
    GAME.currentTurn = (GAME.currentTurn + 1) % 3;
    // Skip disconnected players
    let attempts = 0;
    while (!GAME.players[GAME.currentTurn].connected && attempts < 3) {
      GAME.currentTurn = (GAME.currentTurn + 1) % 3;
      attempts++;
    }
  },

  endGame() {
    if (this.gameLoopId) {
      // Keep rendering but stop accepting input
    }
    
    AudioManager.play('win');
    this.showConfetti();
    
    // Find winner
    let maxScore = -1;
    let winner = 0;
    GAME.players.forEach((p, i) => {
      if (p.score > maxScore) {
        maxScore = p.score;
        winner = i;
      }
    });
    
    setTimeout(() => this.showGameOver(winner), 800);
  },

  showGameOver(winnerIdx) {
    const overlay = document.getElementById('gameOverOverlay');
    const title = document.getElementById('goTitle');
    const subtitle = document.getElementById('goSubtitle');
    const stats = document.getElementById('goStats');
    
    const isMe = winnerIdx === GAME.myPlayerIndex;
    
    title.textContent = isMe ? 'VICTORY!' : 'GAME OVER';
    subtitle.textContent = GAME.players[winnerIdx].name + ' wins the match';
    
    stats.innerHTML = GAME.players.map((p, i) => `
      <div class="go-stat">
        <div class="go-stat-value" style="color:${PLAYER_COLORS[i]}">${p.score}</div>
        <div class="go-stat-label">${p.name}</div>
      </div>
    `).join('');
    
    overlay.classList.remove('hidden');
  },

  showConfetti() {
    const colors = ['#e63946', '#2a9d8f', '#9c6ade', '#f5c542', '#ffffff'];
    for (let i = 0; i < 80; i++) {
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

  updatePowerMeter(power) {
    const fill = document.getElementById('powerFill');
    const wrap = document.getElementById('powerMeterWrap');
    fill.style.width = (power * 100) + '%';
    if (power > 0.05) {
      wrap.classList.add('active');
    } else {
      wrap.classList.remove('active');
    }
  },

  updateTurnUI() {
    // Scoreboard
    document.querySelectorAll('.score-card').forEach((card, i) => {
      card.classList.toggle('active', i === GAME.currentTurn);
    });
    
    // Turn indicator
    const swatch = document.getElementById('turnSwatch');
    const text = document.getElementById('turnText');
    swatch.style.background = PLAYER_COLORS[GAME.currentTurn];
    swatch.style.color = PLAYER_COLORS[GAME.currentTurn];
    
    if (GAME.isPractice) {
      text.textContent = 'YOUR TURN';
    } else if (GAME.currentTurn === GAME.myPlayerIndex) {
      text.textContent = 'YOUR TURN';
    } else {
      text.textContent = GAME.players[GAME.currentTurn].name + "'S TURN";
    }
    
    // Board glow
    const frame = document.querySelector('.board-frame');
    if (GAME.currentTurn === GAME.myPlayerIndex || GAME.isPractice) {
      frame.classList.add('active');
    } else {
      frame.classList.remove('active');
    }
  },

  updateScoreboard() {
    GAME.players.forEach((p, i) => {
      const el = document.getElementById('scoreP' + i);
      if (el) el.textContent = p.score;
      const nameEl = document.getElementById('nameP' + i);
      if (nameEl) nameEl.textContent = p.name;
    });
  }
};

/* ─────────────────────────────────────────────
   UI CONTROLLER
───────────────────────────────────────────── */
const UI = {
  init() {
    // Main menu
    document.getElementById('hostBtn').addEventListener('click', () => this.onHostClick());
    document.getElementById('joinBtn').addEventListener('click', () => this.onJoinClick());
    document.getElementById('practiceBtn').addEventListener('click', () => this.onPracticeClick());
    
    // Host modal
    document.getElementById('hostModalClose').addEventListener('click', () => this.closeModal('hostModal'));
    document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyRoomCode());
    document.getElementById('startGameBtn').addEventListener('click', () => this.startMultiplayerGame());
    
    // Join modal
    document.getElementById('joinModalClose').addEventListener('click', () => this.closeModal('joinModal'));
    document.getElementById('connectBtn').addEventListener('click', () => this.connectToRoom());
    document.getElementById('joinCodeInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    document.getElementById('joinCodeInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.connectToRoom();
    });
    
    // Game screen
    document.getElementById('backBtn').addEventListener('click', () => this.confirmQuit());
    document.getElementById('soundToggle').addEventListener('click', () => this.toggleSound());
    document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
    document.getElementById('goMainMenuBtn').addEventListener('click', () => this.goToMainMenu());
    
    // Reactions
    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.sendReaction(emoji);
      });
    });
  },

  async onHostClick() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'host';
    GAME.isHost = true;
    GAME.isPractice = false;
    GAME.myPlayerIndex = 0;
    
    document.getElementById('hostModal').classList.remove('hidden');
    document.getElementById('hostRoomCode').textContent = '......';
    
    try {
      const code = await Network.initHost({
        onPlayerJoin: (conn, count) => this.onPlayerJoined(conn, count),
        onPlayerLeave: (conn) => this.onPlayerLeft(conn),
        onData: (data, conn) => this.onNetworkData(data, conn),
        onError: (err) => this.onNetworkError(err)
      });
      
      GAME.roomCode = code;
      document.getElementById('hostRoomCode').textContent = code;
      Toast.show('Room created: ' + code, 'success', '✅');
    } catch (err) {
      Toast.show('Failed to create room', 'error', '❌');
      this.closeModal('hostModal');
    }
  },

  onJoinClick() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'join';
    GAME.isHost = false;
    GAME.isPractice = false;
    document.getElementById('joinModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('joinCodeInput').focus(), 300);
  },

  onPracticeClick() {
    AudioManager.init();
    AudioManager.play('click');
    GAME.mode = 'practice';
    GAME.isPractice = true;
    GAME.myPlayerIndex = 0;
    GAME.currentTurn = 0;
    
    // Setup fake players
    GAME.players = [
      { id: 'me', name: 'YOU', connected: true, score: 0 },
      { id: 'p2', name: 'PLAYER 2', connected: true, score: 0 },
      { id: 'p3', name: 'PLAYER 3', connected: true, score: 0 }
    ];
    GAME.playerCount = 3;
    
    this.enterGame();
  },

  async connectToRoom() {
    const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
    if (code.length !== 6) {
      Toast.show('Enter 6-character code', 'error', '⚠️');
      return;
    }
    
    AudioManager.play('click');
    this.closeModal('joinModal');
    document.getElementById('connectingOverlay').classList.remove('hidden');
    document.getElementById('connectingText').textContent = 'Connecting to ' + code + '...';
    
    try {
      await Network.initClient(code, {
        onPlayerJoin: (conn, count) => this.onPlayerJoined(conn, count),
        onPlayerLeave: (conn) => this.onPlayerLeft(conn),
        onData: (data, conn) => this.onNetworkData(data, conn),
        onError: (err) => this.onNetworkError(err)
      });
      
      // Wait a moment for the connection to open
      setTimeout(() => {
        if (Network.connections.length === 0) {
          document.getElementById('connectingOverlay').classList.add('hidden');
          Toast.show('Could not connect to room', 'error', '❌');
          GAME.mode = 'menu';
        }
      }, 5000);
      
    } catch (err) {
      document.getElementById('connectingOverlay').classList.add('hidden');
      Toast.show('Connection failed', 'error', '❌');
      GAME.mode = 'menu';
    }
  },

  onPlayerJoined(conn, count) {
    console.log('Player joined, total connections:', count);
    
    if (GAME.isHost) {
      // Assign next available slot
      const slot = GAME.players.findIndex((p, i) => i > 0 && !p.connected);
      if (slot > 0) {
        GAME.players[slot].connected = true;
        GAME.players[slot].id = conn.peer;
        GAME.players[slot].name = 'PLAYER ' + (slot + 1);
        GAME.playerCount = GAME.players.filter(p => p.connected).length;
        
        // Send welcome to the new player
        Network.sendTo(conn, {
          type: 'welcome',
          playerIndex: slot,
          players: GAME.players,
          roomCode: GAME.roomCode
        });
        
        // Broadcast updated players to everyone
        Network.broadcast({
          type: 'players_update',
          players: GAME.players
        });
        
        this.updateHostModalPlayers();
        Toast.show(GAME.players[slot].name + ' joined!', 'success', '🎉');
        AudioManager.play('notification');
      }
    }
  },

  onPlayerLeft(conn) {
    const idx = GAME.players.findIndex(p => p.id === conn.peer);
    if (idx > 0) {
      GAME.players[idx].connected = false;
      GAME.players[idx].id = null;
      GAME.players[idx].name = 'WAITING';
      GAME.playerCount = GAME.players.filter(p => p.connected).length;
      
      this.updateHostModalPlayers();
      this.updateWaitingList();
      Toast.show('A player left', 'info', '👋');
    }
  },

  onNetworkData(data, conn) {
    switch(data.type) {
      case 'welcome':
        GAME.myPlayerIndex = data.playerIndex;
        GAME.players = data.players;
        GAME.roomCode = data.roomCode;
        GAME.playerCount = 3;
        document.getElementById('connectingOverlay').classList.add('hidden');
        Toast.show('Connected! You are ' + GAME.players[GAME.myPlayerIndex].name, 'success', '🎉');
        break;
        
      case 'players_update':
        GAME.players = data.players;
        this.updateWaitingList();
        break;
        
      case 'start_game':
        GAME.players = data.players;
        GAME.currentTurn = data.currentTurn;
        this.enterGame();
        break;
        
      case 'shot':
        if (data.player !== GAME.myPlayerIndex) {
          // Replicate the shot
          Physics.striker.x = data.x;
          Physics.striker.y = data.y;
          Physics.striker.vx = data.vx;
          Physics.striker.vy = data.vy;
          Game.isResolving = true;
        }
        break;
        
      case 'turn_change':
        GAME.currentTurn = data.currentTurn;
        Physics.striker = Physics.createStriker(GAME.currentTurn);
        Game.updateTurnUI();
        AudioManager.play('turn');
        break;
        
      case 'reaction':
        this.showReaction(data.emoji, data.player);
        break;
    }
  },

  onNetworkError(err) {
    document.getElementById('connectingOverlay').classList.add('hidden');
    Toast.show('Network error', 'error', '❌');
  },

  updateHostModalPlayers() {
    const list = document.getElementById('waitingList');
    const count = GAME.players.filter(p => p.connected).length;
    document.getElementById('playerCount').textContent = count;
    
    list.innerHTML = GAME.players.map((p, i) => {
      if (p.connected) {
        return `
          <div class="waiting-player slot-filled">
            <div class="wp-color" style="background:${PLAYER_COLORS[i]}"></div>
            <span>${p.name}${i === 0 ? ' (Host)' : ''}</span>
            <div class="wp-status ready">READY</div>
          </div>
        `;
      } else {
        return `
          <div class="waiting-player slot-empty">
            <div class="wp-color empty"></div>
            <span>Waiting...</span>
            <div class="wp-status">—</div>
          </div>
        `;
      }
    }).join('');
    
    document.getElementById('startGameBtn').disabled = count < 3;
  },

  updateWaitingList() {
    this.updateHostModalPlayers();
  },

  copyRoomCode() {
    const code = document.getElementById('hostRoomCode').textContent;
    if (code && code !== '......') {
      navigator.clipboard.writeText(code).then(() => {
        Toast.show('Code copied!', 'success', '📋');
        AudioManager.play('notification');
      });
    }
  },

  startMultiplayerGame() {
    const connectedCount = GAME.players.filter(p => p.connected).length;
    if (connectedCount < 3) {
      Toast.show('Need 3 players to start', 'error', '⚠️');
      return;
    }
    
    GAME.currentTurn = 0;
    AudioManager.play('click');
    
    Network.broadcast({
      type: 'start_game',
      players: GAME.players,
      currentTurn: 0
    });
    
    this.closeModal('hostModal');
    this.enterGame();
  },

  enterGame() {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    
    GAME.mode = GAME.isPractice ? 'practice' : 'playing';
    
    // Reset scores
    GAME.players.forEach(p => p.score = 0);
    
    // Update UI
    Game.updateScoreboard();
    Game.updateTurnUI();
    
    // Start the game
    Game.start();
    
    Toast.show(GAME.isPractice ? 'Practice mode' : 'Match started!', 'info', '🎮');
  },

  toggleSound() {
    GAME.audioEnabled = !GAME.audioEnabled;
    document.getElementById('soundOnIcon').style.display = GAME.audioEnabled ? 'block' : 'none';
    document.getElementById('soundOffIcon').style.display = GAME.audioEnabled ? 'none' : 'block';
    if (GAME.audioEnabled) AudioManager.play('click');
  },

  confirmQuit() {
    if (confirm('Leave the game?')) {
      this.goToMainMenu();
    }
  },

  goToMainMenu() {
    // Cleanup
    if (Game.gameLoopId) cancelAnimationFrame(Game.gameLoopId);
    Network.disconnect();
    
    // Reset state
    GAME.mode = 'menu';
    GAME.isPractice = false;
    GAME.isHost = false;
    GAME.currentTurn = 0;
    GAME.myPlayerIndex = 0;
    GAME.players = [
      { id: null, name: 'YOU', connected: false, score: 0 },
      { id: null, name: 'WAITING', connected: false, score: 0 },
      { id: null, name: 'WAITING', connected: false, score: 0 }
    ];
    
    // Reset UI
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    Physics.pucks = [];
    Physics.striker = null;
    Physics.particles = [];
  },

  playAgain() {
    document.getElementById('gameOverOverlay').classList.add('hidden');
    GAME.players.forEach(p => p.score = 0);
    GAME.currentTurn = 0;
    
    Physics.pucks = Physics.createPucks();
    Physics.striker = Physics.createStriker(0);
    Physics.particles = [];
    
    Game.updateScoreboard();
    Game.updateTurnUI();
    
    if (GAME.mode === 'playing' && GAME.isHost) {
      Network.broadcast({ type: 'play_again' });
    }
  },

  sendReaction(emoji) {
    AudioManager.play('click');
    this.showReaction(emoji, GAME.myPlayerIndex);
    
    if (GAME.mode === 'playing' && !GAME.isPractice) {
      Network.broadcast({
        type: 'reaction',
        emoji,
        player: GAME.myPlayerIndex
      });
    }
  },

  showReaction(emoji, playerIdx) {
    const layer = document.getElementById('emojiLayer');
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = (15 + Math.random() * 70) + '%';
    el.style.bottom = '80px';
    el.style.animationDuration = (2 + Math.random() * 0.8) + 's';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }
};

/* ─────────────────────────────────────────────
   TOAST SYSTEM
───────────────────────────────────────────── */
const Toast = {
  show(message, type = 'info', icon = 'ℹ️') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(el);
    
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
};

/* ─────────────────────────────────────────────
   MENU PARTICLE BACKGROUND
───────────────────────────────────────────── */
function initMenuParticles() {
  const layer = document.getElementById('menuParticles');
  if (!layer) return;
  
  const colors = ['#e63946', '#2a9d8f', '#9c6ade', '#f5c542'];
  
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    el.className = 'menu-particle';
    el.style.left = Math.random() * 100 + '%';
    el.style.top = Math.random() * 100 + '%';
    el.style.width = (3 + Math.random() * 8) + 'px';
    el.style.height = el.style.width;
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.setProperty('--dur', (8 + Math.random() * 10) + 's');
    el.style.setProperty('--delay', (Math.random() * 8) + 's');
    el.style.setProperty('--tx', (Math.random() * 100 - 50) + 'px');
    el.style.setProperty('--ty', (Math.random() * -100 - 20) + 'px');
    layer.appendChild(el);
  }
}

/* ─────────────────────────────────────────────
   LOADING SEQUENCE
───────────────────────────────────────────── */
function runLoading() {
  const bar = document.getElementById('loadingBar');
  const status = document.getElementById('loadingStatus');
  const screen = document.getElementById('loadingScreen');
  const menu = document.getElementById('mainMenu');
  
  const steps = [
    { p: 15, t: 'Loading engine...' },
    { p: 35, t: 'Initializing physics...' },
    { p: 55, t: 'Preparing sounds...' },
    { p: 75, t: 'Setting up network...' },
    { p: 95, t: 'Almost ready...' },
    { p: 100, t: 'Ready!' }
  ];
  
  let i = 0;
  const interval = setInterval(() => {
    if (i < steps.length) {
      bar.style.width = steps[i].p + '%';
      status.textContent = steps[i].t;
      i++;
    } else {
      clearInterval(interval);
      setTimeout(() => {
        screen.classList.add('hidden');
        menu.classList.remove('hidden');
        initMenuParticles();
      }, 400);
    }
  }, 320);
}

/* ─────────────────────────────────────────────
   BOOTSTRAP
───────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  runLoading();
  
  // Pre-warm audio on first user interaction
  document.body.addEventListener('touchstart', () => AudioManager.init(), { once: true });
  document.body.addEventListener('click', () => AudioManager.init(), { once: true });
  
  // Prevent context menu on canvas
  document.getElementById('gameCanvas').addEventListener('contextmenu', (e) => e.preventDefault());
  
  // Prevent page zoom on double-tap
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
});

// Prevent scroll/bounce on mobile
window.addEventListener('touchmove', (e) => {
  if (e.target.closest('#gameCanvas') || e.target.closest('.board-frame')) {
    e.preventDefault();
  }
}, { passive: false });

// Visibility change - pause sounds
document.addEventListener('visibilitychange', () => {
  if (document.hidden && AudioManager._ctx) {
    AudioManager._ctx.suspend();
  } else if (AudioManager._ctx) {
    AudioManager._ctx.resume();
  }
});

// Handle beforeunload
window.addEventListener('beforeunload', () => {
  Network.disconnect();
});