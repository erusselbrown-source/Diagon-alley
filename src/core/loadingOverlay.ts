/** Minimal full-screen loading overlay with progress text. */
export class LoadingOverlay {
  private readonly el: HTMLDivElement;

  constructor(text = 'Loading…') {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '20',
      font: '13px ui-monospace, Menlo, monospace', color: '#cfe3ff', background: 'rgba(7,8,11,0.92)',
      transition: 'opacity 0.5s',
    } satisfies Partial<CSSStyleDeclaration>);
    this.el.textContent = text;
    document.body.appendChild(this.el);
  }

  set(text: string): void {
    this.el.textContent = text;
  }

  done(): void {
    this.el.style.opacity = '0';
    setTimeout(() => this.el.remove(), 550);
  }
}
