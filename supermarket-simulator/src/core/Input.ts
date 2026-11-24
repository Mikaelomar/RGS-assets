// Unified input: desktop keyboard/mouse + mobile touch (virtual joystick, drag-to-look, buttons).

export type ButtonName = 'action' | 'alt' | 'run' | 'drop' | 'tool';

interface TouchTrack { id: number; kind: 'move' | 'look'; x0: number; y0: number; x: number; y: number; }

/** Elements that handle their own taps; touches starting on them never steer the game. */
const CONTROL_SELECTOR = 'button, a, input, select, textarea, label, .btn, .btn-round, .sidebtn, .pill, .avatar, .overlay, .window, .title-screen, .pospad, .drawer, .co-return, .co-leave, .subtab, .card, [data-control]';

export class Input {
  readonly isTouch: boolean;
  moveX = 0; // strafe -1..1
  moveY = 0; // forward -1..1
  lookDX = 0; // accumulated look deltas (pixels) since last consume
  lookDY = 0;
  sensitivity = 1;
  invertY = false;
  runToggle = false;
  /** When false (menus open) the world ignores movement/look. */
  enabled = true;
  pointerLocked = false;

  private keys = new Set<string>();
  private down = new Set<ButtonName>();
  private pressed = new Set<ButtonName>();
  private released = new Set<ButtonName>();
  private touches = new Map<number, TouchTrack>();
  private canvas: HTMLCanvasElement;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private joyRadius = 60;
  /** Taps on the 3D view (used by checkout mode & build mode). */
  taps: { x: number; y: number }[] = [];
  private tapStart = new Map<number, { x: number; y: number; t: number; n: number }>();
  wheel = 0;
  /** Left-side joystick active (walking / driving); off at the checkout and in build mode, where the left side is tapped. */
  joystick = true;
  private mouseDrag: { x: number; y: number; x0: number; y0: number; moved: boolean } | null = null;
  private lastTouchT = -1e9;
  /** Pointer lock refused (embedded page): fall back to drag-to-look. */
  private lockFailed = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    uiRoot.appendChild(this.joyBase);
    this.joyBase.style.display = 'none';

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.down.clear(); });

    // Pointer/touch input is read on the whole document: HUD containers, hints and prompts lie on top
    // of the canvas, and they must not swallow the joystick, look drags or taps on the 3D view.
    // Touches that start on a real control (buttons, menus, windows) are left to that control.
    const isControl = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null;
      if (!el || el === canvas) return false;
      return !!el.closest(CONTROL_SELECTOR);
    };
    document.addEventListener('mousedown', (e) => { if (!isControl(e.target)) this.onMouseDown(e); });
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
        return;
      }
      // drag to look (pointer lock refused, e.g. inside an embedded page, or a touchscreen laptop)
      const d = this.mouseDrag;
      if (!d || !(e.buttons & 1)) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 5) d.moved = true;
      if (d.moved && this.joystick) {
        this.lookDX += dx * 1.5;
        this.lookDY += dy * 1.5;
      }
      d.x = e.clientX;
      d.y = e.clientY;
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('touchstart', (e) => { if (!isControl(e.target)) this.onTouchStart(e); }, { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  get showTouchControls() { return this.isTouch; }

  requestPointerLock() {
    if (this.isTouch || this.lockFailed) return;
    if (document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock?.() as any;
        if (p && typeof p.catch === 'function') p.catch(() => { this.lockFailed = true; });
      } catch {
        this.lockFailed = true;
      }
    }
  }
  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Called by on-screen buttons. */
  buttonDown(b: ButtonName) {
    if (!this.down.has(b)) this.pressed.add(b);
    this.down.add(b);
  }
  buttonUp(b: ButtonName) {
    if (this.down.has(b)) this.released.add(b);
    this.down.delete(b);
  }
  isDown(b: ButtonName) { return this.down.has(b); }
  wasPressed(b: ButtonName) { return this.pressed.has(b); }
  wasReleased(b: ButtonName) { return this.released.has(b); }
  keyDown(code: string) { return this.keys.has(code); }

  private keyHandlers: ((code: string, e: KeyboardEvent) => void)[] = [];
  onKeyPress(fn: (code: string, e: KeyboardEvent) => void) { this.keyHandlers.push(fn); }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = e.code;
    if (isDown) {
      if (!this.keys.has(c)) for (const fn of this.keyHandlers) fn(c, e);
      this.keys.add(c);
    } else this.keys.delete(c);
    const map: Record<string, ButtonName> = { KeyE: 'action', KeyF: 'alt', KeyQ: 'drop', KeyG: 'drop', KeyR: 'tool' };
    const b = map[c];
    if (b) {
      if (isDown) this.buttonDown(b);
      else this.buttonUp(b);
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(c)) e.preventDefault();
  }

  private onMouseDown(e: MouseEvent) {
    if (performance.now() - this.lastTouchT < 800) return; // compatibility mouse event after a touch
    if (!this.pointerLocked) {
      if (e.button !== 0) return;
      this.mouseDrag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
      if (!this.joystick) this.taps.push({ x: e.clientX, y: e.clientY }); // checkout / build: click the 3D view
      else if (!this.lockFailed) this.requestPointerLock(); // walking: capture the mouse to look around
      return;
    }
    if (e.button === 0) this.buttonDown('action');
    if (e.button === 2) this.buttonDown('drop');
  }
  private onMouseUp(e: MouseEvent) {
    const d = this.mouseDrag;
    this.mouseDrag = null;
    // without pointer lock a plain click (no drag) does the main action
    if (e.button === 0 && d && !d.moved && !this.pointerLocked && this.joystick && (this.lockFailed || this.isTouch)) this.pressed.add('action');
    if (e.button === 0) this.buttonUp('action');
    if (e.button === 2) this.buttonUp('drop');
  }

  private onTouchStart(e: TouchEvent) {
    if (e.cancelable) e.preventDefault();
    this.lastTouchT = performance.now();
    const w = window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const leftZone = t.clientX < w * 0.42 && t.clientY > window.innerHeight * 0.28;
      const hasMove = [...this.touches.values()].some((k) => k.kind === 'move');
      const kind: 'move' | 'look' = leftZone && !hasMove && this.enabled && this.joystick ? 'move' : 'look';
      this.touches.set(t.identifier, { id: t.identifier, kind, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
      this.tapStart.set(t.identifier, { x: t.clientX, y: t.clientY, t: e.timeStamp, n: performance.now() });
      if (kind === 'move') {
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = t.clientX - this.joyRadius + 'px';
        this.joyBase.style.top = t.clientY - this.joyRadius + 'px';
        this.joyKnob.style.transform = 'translate(0px,0px)';
      }
    }
  }
  private onTouchMove(e: TouchEvent) {
    let mine = false;
    for (const t of Array.from(e.changedTouches)) {
      const tr = this.touches.get(t.identifier);
      if (!tr) continue;
      mine = true;
      if (tr.kind === 'look') {
        this.lookDX += (t.clientX - tr.x) * 1.6;
        this.lookDY += (t.clientY - tr.y) * 1.6;
      }
      tr.x = t.clientX;
      tr.y = t.clientY;
      if (tr.kind === 'move') {
        let dx = tr.x - tr.x0;
        let dy = tr.y - tr.y0;
        const len = Math.hypot(dx, dy);
        const max = this.joyRadius;
        if (len > max) {
          // Let the joystick base follow the finger so it never "sticks".
          const ex = len - max;
          tr.x0 += (dx / len) * ex;
          tr.y0 += (dy / len) * ex;
          this.joyBase.style.left = tr.x0 - this.joyRadius + 'px';
          this.joyBase.style.top = tr.y0 - this.joyRadius + 'px';
          dx = tr.x - tr.x0;
          dy = tr.y - tr.y0;
        }
        this.joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      }
    }
    // only game touches block scrolling; a list scrolled inside a window keeps working
    if (mine && e.cancelable) e.preventDefault();
  }
  private onTouchEnd(e: TouchEvent) {
    let mine = false;
    for (const t of Array.from(e.changedTouches)) {
      const tr = this.touches.get(t.identifier);
      if (tr) mine = true;
      const st = this.tapStart.get(t.identifier);
      if (st && tr && tr.kind === 'look') {
        const moved = Math.hypot(t.clientX - st.x, t.clientY - st.y);
        // A tap is short by either clock: event time stamps (a busy frame does not turn a tap into a hold)
        // or handler times (some browsers and emulators stamp queued touch events far in the past).
        const byStamp = e.timeStamp > 0 && st.t > 0 ? e.timeStamp - st.t : Infinity;
        const byClock = performance.now() - st.n;
        if (moved < 14 && Math.min(byStamp, byClock) < 400) this.taps.push({ x: t.clientX, y: t.clientY });
      }
      this.tapStart.delete(t.identifier);
      if (tr?.kind === 'move') this.joyBase.style.display = 'none';
      this.touches.delete(t.identifier);
    }
    if (mine && e.cancelable) e.preventDefault();
  }

  /** Read continuous movement for this frame. */
  update() {
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    for (const tr of this.touches.values()) {
      if (tr.kind !== 'move') continue;
      const dx = (tr.x - tr.x0) / this.joyRadius;
      const dy = (tr.y - tr.y0) / this.joyRadius;
      mx += Math.max(-1, Math.min(1, dx));
      my += Math.max(-1, Math.min(1, -dy));
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    // Small dead zone for touch.
    if (len < 0.12) { mx = 0; my = 0; }
    this.moveX = mx;
    this.moveY = my;
  }

  get running() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.runToggle;
  }

  consumeLook(): [number, number] {
    const s = 0.0026 * this.sensitivity;
    const r: [number, number] = [this.lookDX * s, this.lookDY * s * (this.invertY ? -1 : 1)];
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  /** Must be called at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.taps.length = 0;
    this.wheel = 0;
  }

  /** Drop all touches (used when opening menus). */
  reset() {
    this.touches.clear();
    this.joyBase.style.display = 'none';
    this.down.clear();
    this.lookDX = this.lookDY = 0;
    this.moveX = this.moveY = 0;
  }
}
