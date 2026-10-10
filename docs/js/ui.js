import { escapeHTML } from './formatters.js';

export function toast(message, kind = '') {
  const region = document.getElementById('toast-region');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('confirm-dialog');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;

    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'confirm');
    };
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

export function setLoading(container, label = 'Loading…') {
  container.innerHTML = `<div class="empty-state">${escapeHTML(label)}</div>`;
}

export function setEmpty(container, label, actionHTML = '') {
  container.innerHTML = `<div class="empty-state">${escapeHTML(label)}${actionHTML}</div>`;
}

export function setError(container, err) {
  container.innerHTML = `<div class="empty-state">Error: ${escapeHTML(err.message || String(err))}</div>`;
}