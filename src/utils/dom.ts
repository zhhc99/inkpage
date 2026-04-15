export function mustGetById<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
}

export function setToolbarHidden(el: HTMLElement, hidden: boolean): void {
  el.classList.toggle('toolbar-hidden', hidden);
}
