/**
 * A 2D camera over the tile grid: world units are tiles (1 tile ≈ 1 metre).
 */
export class Camera {
  /** World point at the centre of the screen. */
  x = 15;
  y = 10;
  /** Screen pixels per tile (CSS pixels). */
  zoom = 24;
  width = 800;
  height = 600;
  min = 7;
  max = 90;
  bounds = { x0: -6, y0: -6, x1: 36, y1: 30 };

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.clamp();
  }

  setBounds(x0: number, y0: number, x1: number, y1: number): void {
    this.bounds = { x0, y0, x1, y1 };
    this.clamp();
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.width / 2, y: (wy - this.y) * this.zoom + this.height / 2 };
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.width / 2) / this.zoom + this.x, y: (sy - this.height / 2) / this.zoom + this.y };
  }

  panBy(dxPx: number, dyPx: number): void {
    this.x -= dxPx / this.zoom;
    this.y -= dyPx / this.zoom;
    this.clamp();
  }

  /** Zooms keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(this.min, Math.min(this.max, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  /** Frames a rectangle of the world, leaving room for UI at the edges. */
  fit(x0: number, y0: number, x1: number, y1: number, pad = { top: 60, bottom: 90, left: 20, right: 20 }): void {
    const w = Math.max(1, this.width - pad.left - pad.right);
    const h = Math.max(1, this.height - pad.top - pad.bottom);
    this.zoom = Math.max(this.min, Math.min(this.max, Math.min(w / (x1 - x0), h / (y1 - y0))));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    // Shift so the padded area (not the whole screen) is centred on the rectangle.
    this.x = cx - (pad.left - pad.right) / 2 / this.zoom;
    this.y = cy - (pad.top - pad.bottom) / 2 / this.zoom;
    this.clamp();
  }

  clamp(): void {
    const b = this.bounds;
    const halfW = this.width / 2 / this.zoom;
    const halfH = this.height / 2 / this.zoom;
    // Allow the lot to be pushed partly off-screen, never lost.
    this.x = Math.max(b.x0 - halfW * 0.5, Math.min(b.x1 + halfW * 0.5, this.x));
    this.y = Math.max(b.y0 - halfH * 0.5, Math.min(b.y1 + halfH * 0.5, this.y));
  }
}
