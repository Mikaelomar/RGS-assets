// Unified input: desktop keyboard/mouse + mobile touch (virtual joystick, drag-to-look, buttons).

export type ButtonName = 'action' | 'alt' | 'run' | 'drop' | 'tool';

interface TouchTrack { id: number; kind: 'move' | 'look'; x0: number; y0: number; x: number; y: number; }

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
  private tapStart = new Map<number, { x: number; y: number; t: number }>();
  wheel = 0;

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

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  get showTouchControls() { return this.isTouch; }

  requestPointerLock() {
    if (this.isTouch) return;
    if (document.pointerLockElement !== this.canvas) {
      const p = this.canvas.requestPointerLock?.() as any;
      if (p && typeof p.catch === 'function') p.catch(() => {});
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
    if (this.isTouch) return;
    if (!this.pointerLocked) {
      this.taps.push({ x: e.clientX, y: e.clientY });
      return;
    }
    if (e.button === 0) this.buttonDown('action');
    if (e.button === 2) this.buttonDown('drop');
  }
  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.buttonUp('action');
    if (e.button === 2) this.buttonUp('drop');
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault();
    const w = window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const leftZone = t.clientX < w * 0.42 && t.clientY > window.innerHeight * 0.28;
      const hasMove = [...this.touches.values()].some((k) => k.kind === 'move');
      const kind: 'move' | 'look' = leftZone && !hasMove && this.enabled ? 'move' : 'look';
      this.touches.set(t.identifier, { id: t.identifier, kind, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
      this.tapStart.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now() });
      if (kind === 'move') {
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = t.clientX - this.joyRadius + 'px';
        this.joyBase.style.top = t.clientY - this.joyRadius + 'px';
        this.joyKnob.style.transform = 'translate(0px,0px)';
      }
    }
  }
  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const tr = this.touches.get(t.identifier);
      if (!tr) continue;
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
  }
  private onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const tr = this.touches.get(t.identifier);
      const st = this.tapStart.get(t.identifier);
      if (st && tr && tr.kind === 'look') {
        const moved = Math.hypot(t.clientX - st.x, t.clientY - st.y);
        if (moved < 14 && performance.now() - st.t < 350) this.taps.push({ x: t.clientX, y: t.clientY });
      }
      this.tapStart.delete(t.identifier);
      if (tr?.kind === 'move') this.joyBase.style.display = 'none';
      this.touches.delete(t.identifier);
    }
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
