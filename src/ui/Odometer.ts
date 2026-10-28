/**
 * Mechanical-style digit roller. Positions are written directly every update
 * (not via CSS transitions) so it can track a continuously changing value.
 */
export class Odometer {
  readonly el: HTMLElement;
  private columns: HTMLElement[] = [];
  private value = -1;

  constructor(
    private digits: number,
    className = '',
  ) {
    this.el = document.createElement('span');
    this.el.className = `odometer ${className}`;
    this.el.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < digits; i++) {
      const win = document.createElement('span');
      win.className = 'odometer__window';
      const col = document.createElement('span');
      col.className = 'odometer__col';
      // 0–9 plus a trailing 0 so the wrap from 9 rolls forward instead of snapping back.
      col.textContent = '01234567890';
      win.append(col);
      this.el.append(win);
      this.columns.push(col);
    }
    this.set(0);
  }

  set(v: number): void {
    if (v === this.value) return;
    this.value = v;
    const max = 10 ** this.digits - 1;
    const x = Math.max(0, Math.min(max, v));
    for (let i = 0; i < this.digits; i++) {
      const place = 10 ** (this.digits - 1 - i);
      const lower = x % place;
      let pos = Math.floor(x / place) % 10;
      // Carry: the higher digit rolls only during the last unit of the lower digits.
      if (place === 1) pos = x % 10;
      else pos += Math.max(0, lower - (place - 1));
      const col = this.columns[i];
      if (col) col.style.transform = `translate3d(0, ${(-pos / 11) * 100}%, 0)`;
    }
  }
}
