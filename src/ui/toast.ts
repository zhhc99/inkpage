import { dom, runtime } from '../state';

export function showToast(message: string): void {
  dom.toastEl.textContent = message;
  dom.toastEl.classList.add('show');
  if (runtime.toastTimer !== null) clearTimeout(runtime.toastTimer);
  runtime.toastTimer = window.setTimeout(() => dom.toastEl.classList.remove('show'), 1800);
}
