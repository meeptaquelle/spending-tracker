const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatIDR(value) {
  const n = Number(value) || 0;
  return idr.format(n).replace(/\s/g, ' ');
}

export function formatSignedIDR(value, sign) {
  const s = formatIDR(Math.abs(value));
  if (value === 0) return s;
  return (sign === '-' ? '-' : '+') + ' ' + s;
}

export function formatMonth(ym) {
  if (!ym || ym.length < 7) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}