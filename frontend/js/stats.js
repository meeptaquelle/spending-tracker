import { api } from './api.js';
import { state, setState } from './state.js';
import { toast, confirmDialog } from './ui.js';
import {
  formatIDR, formatMonth, escapeHTML, todayISO, shiftMonth,
} from './formatters.js';
import { attachMoneyInput, getMoneyValue } from './money-input.js';

const REMINDER_KEY = 'reminders';

// ---------------- Reminders ----------------

export async function loadReminders() {
  try {
    const kv = await api.getSettings();
    const raw = kv?.[REMINDER_KEY];
    const list = raw ? JSON.parse(raw) : [];
    setState({ reminders: Array.isArray(list) ? list : [] });
  } catch (err) {
    console.warn('reminders load failed', err);
    setState({ reminders: [] });
  }
}

async function saveReminders(list) {
  await api.putSettings({ [REMINDER_KEY]: JSON.stringify(list) });
  setState({ reminders: list });
}

export function renderReminders() {
  const el = document.getElementById('reminders-list');
  if (!el) return;
  const list = (state.reminders || []).slice().sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.label.localeCompare(b.label);
  });

  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state small">No reminders. Add debts, upcoming bills, anything you want to keep in view.</div>`;
    return;
  }

  const today = todayISO();
  el.innerHTML = list.map(r => {
    const overdue = r.due && r.due < today;
    const dueSoon = r.due && !overdue && r.due <= addDaysISO(today, 7);
    const cls = overdue ? 'overdue' : dueSoon ? 'soon' : '';
    return `
      <div class="reminder ${cls}" data-id="${escapeHTML(r.id)}" role="button" tabindex="0">
        <div class="reminder-main">
          <div class="reminder-label">${escapeHTML(r.label)}</div>
          ${r.amount ? `<div class="reminder-amount">${formatIDR(r.amount)}</div>` : ''}
          ${r.due ? `<div class="reminder-due">${escapeHTML(r.due)}${overdue ? ' · overdue' : dueSoon ? ' · due soon' : ''}</div>` : ''}
          ${r.notes ? `<div class="reminder-notes">${escapeHTML(r.notes)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

export function wireReminders() {
  document.getElementById('add-reminder')?.addEventListener('click', () => openReminderDialog(null));
  const listEl = document.getElementById('reminders-list');
  listEl?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    const r = (state.reminders || []).find(x => x.id === item.dataset.id);
    if (r) openReminderDialog(r);
  });
  listEl?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('[data-id]');
    if (!item) return;
    e.preventDefault();
    const r = (state.reminders || []).find(x => x.id === item.dataset.id);
    if (r) openReminderDialog(r);
  });
  wireReminderDialog();
}

let editingReminderId = null;

function openReminderDialog(r) {
  const dlg = document.getElementById('reminder-dialog');
  const title = document.getElementById('reminder-dialog-title');
  const labelEl = document.getElementById('reminder-label');
  const amountEl = document.getElementById('reminder-amount');
  const dueEl = document.getElementById('reminder-due');
  const notesEl = document.getElementById('reminder-notes');
  const deleteBtn = document.getElementById('reminder-delete');

  const amountCtl = attachMoneyInput(amountEl);

  if (r) {
    editingReminderId = r.id;
    title.textContent = 'Edit reminder';
    labelEl.value = r.label || '';
    amountCtl.setValue(r.amount || '');
    dueEl.value = r.due || '';
    notesEl.value = r.notes || '';
    deleteBtn.hidden = false;
  } else {
    editingReminderId = null;
    title.textContent = 'New reminder';
    labelEl.value = '';
    amountCtl.setValue('');
    dueEl.value = '';
    notesEl.value = '';
    deleteBtn.hidden = true;
  }
  dlg.showModal();
  setTimeout(() => labelEl.focus(), 0);
}

function wireReminderDialog() {
  const form = document.getElementById('reminder-form');
  const dlg = document.getElementById('reminder-dialog');
  const deleteBtn = document.getElementById('reminder-delete');

  form?.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const label = document.getElementById('reminder-label').value.trim();
    if (!label) { toast('Label is required', 'error'); return; }
    const amountEl = document.getElementById('reminder-amount');
    const amount = amountEl.value.trim() === '' ? null : getMoneyValue(amountEl);
    const due = document.getElementById('reminder-due').value || null;
    const notes = document.getElementById('reminder-notes').value.trim();

    const list = (state.reminders || []).slice();
    if (editingReminderId) {
      const idx = list.findIndex(x => x.id === editingReminderId);
      if (idx >= 0) list[idx] = { ...list[idx], label, amount, due, notes };
    } else {
      list.push({
        id: 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        label, amount, due, notes,
        created_at: new Date().toISOString(),
      });
    }
    try {
      await saveReminders(list);
      toast('Reminder saved', 'success');
      dlg.close('saved');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!editingReminderId) return;
    const ok = await confirmDialog('Delete reminder', 'Remove this reminder?');
    if (!ok) return;
    const list = (state.reminders || []).filter(x => x.id !== editingReminderId);
    try {
      await saveReminders(list);
      toast('Reminder deleted', 'success');
      dlg.close('deleted');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------- Spending growth chart ----------------

let currentSpan = 6;

export function wireStatsTabs() {
  const tabs = document.getElementById('span-tabs');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.stat-tab');
    if (!btn) return;
    currentSpan = Number(btn.dataset.span) || 6;
    tabs.querySelectorAll('.stat-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderSpendingChart();
  });
}

export function renderSpendingChart() {
  const canvas = document.getElementById('spending-chart');
  const legend = document.getElementById('spending-chart-legend');
  if (!canvas || !legend) return;

  const series = buildSeries(state.transactions, state.selectedMonth, currentSpan);
  const pts = series.points;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = 200;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW, H = cssH;
  const padding = { top: 14, right: 12, bottom: 22, left: 48 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  ctx.clearRect(0, 0, W, H);

  if (pts.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', W / 2, H / 2);
    legend.innerHTML = '';
    return;
  }

  let yMax = 0, yMin = 0;
  for (const p of pts) {
    yMax = Math.max(yMax, p.income, p.expense, p.net);
    yMin = Math.min(yMin, p.income, p.expense, p.net);
  }
  if (yMax === yMin) yMax = yMin + 1;
  const ySpan = yMax - yMin;
  yMax += ySpan * 0.08;
  yMin -= ySpan * 0.08;

  const xFor = (i) => pts.length === 1
    ? padding.left + chartW / 2
    : padding.left + (i / (pts.length - 1)) * chartW;
  const yFor = (v) => padding.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  const yTicks = 4;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (yMax - yMin) * (i / yTicks);
    const y = yFor(v);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fillText(abbrevIDR(v), padding.left - 6, y);
  }

  if (yMin < 0 && yMax > 0) {
    const zeroY = yFor(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(padding.left + chartW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const baselineY = yFor(yMin < 0 ? 0 : yMin);
  const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  areaGrad.addColorStop(0, 'rgba(79, 140, 255, 0.32)');
  areaGrad.addColorStop(1, 'rgba(79, 140, 255, 0)');

  ctx.beginPath();
  ctx.moveTo(xFor(0), baselineY);
  for (let i = 0; i < pts.length; i++) ctx.lineTo(xFor(i), yFor(pts[i].net));
  ctx.lineTo(xFor(pts.length - 1), baselineY);
  ctx.closePath();
  ctx.fillStyle = areaGrad;
  ctx.fill();

  strokeLine(ctx, pts, 'income', xFor, yFor, 'rgba(52, 211, 153, 0.55)', 1.25);
  strokeLine(ctx, pts, 'expense', xFor, yFor, 'rgba(248, 113, 113, 0.55)', 1.25);
  strokeLine(ctx, pts, 'net', xFor, yFor, '#4f8cff', 2);

  const lastX = xFor(pts.length - 1);
  const lastY = yFor(pts[pts.length - 1].net);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(79, 140, 255, 0.18)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#4f8cff';
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const maxLabels = Math.max(2, Math.floor(chartW / 55));
  const stride = Math.max(1, Math.ceil(pts.length / maxLabels));
  const drawn = new Set();
  for (let i = 0; i < pts.length; i += stride) {
    ctx.fillText(pts[i].label, xFor(i), padding.top + chartH + 5);
    drawn.add(i);
  }
  const lastIdx = pts.length - 1;
  if (pts.length > 1 && !drawn.has(lastIdx)) {
    ctx.fillText(pts[lastIdx].label, xFor(lastIdx), padding.top + chartH + 5);
  }

  const last = pts[lastIdx];
  legend.innerHTML = `
    <span class="lg"><i style="background:#4f8cff"></i>Net ${formatIDR(last.net)}</span>
    <span class="lg"><i style="background:#34d399"></i>Income ${formatIDR(last.income)}</span>
    <span class="lg"><i style="background:#f87171"></i>Expenses ${formatIDR(last.expense)}</span>
  `;
}

function strokeLine(ctx, pts, key, xFor, yFor, color, width) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = xFor(i);
    const y = yFor(pts[i][key]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ---------------- Series builders ----------------

function buildSeries(txs, anchorMonth, span) {
  if (span === 1) return seriesByDay(txs, anchorMonth);
  if (span === 3) return seriesByWeek(txs, anchorMonth, 3);
  return seriesByMonth(txs, anchorMonth, span);
}

function seriesByDay(txs, month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayISO();
  const isCurrentMonth = month === today.slice(0, 7);
  const lastDay = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;

  let cumIncome = 0, cumExpense = 0;
  const points = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    let inc = 0, exp = 0;
    for (const t of txs) {
      if (t.status !== 'completed' || t.date !== dateStr) continue;
      if (t.type === 'income') inc += Number(t.amount);
      else if (t.type === 'expense') exp += Number(t.amount);
    }
    cumIncome += inc;
    cumExpense += exp;
    points.push({
      label: String(d),
      income: cumIncome,
      expense: cumExpense,
      net: cumIncome - cumExpense,
    });
  }
  return { points, granularity: 'day' };
}

function seriesByWeek(txs, anchorMonth, span) {
  const startMonth = shiftMonth(anchorMonth, -(span - 1));
  const cursor = new Date(startMonth + '-01T00:00:00Z');
  const today = todayISO();

  let cumIncome = 0, cumExpense = 0;
  const points = [];

  while (true) {
    const weekStart = cursor.toISOString().slice(0, 10);
    if (weekStart > today) break;

    const weekEndDate = new Date(cursor);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    let inc = 0, exp = 0;
    for (const t of txs) {
      if (t.status !== 'completed' || !t.date) continue;
      if (t.date >= weekStart && t.date <= weekEnd) {
        if (t.type === 'income') inc += Number(t.amount);
        else if (t.type === 'expense') exp += Number(t.amount);
      }
    }
    cumIncome += inc;
    cumExpense += exp;

    points.push({
      label: weekStart.slice(8, 10),
      income: cumIncome,
      expense: cumExpense,
      net: cumIncome - cumExpense,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 7);

    if (weekStart.slice(0, 7) > anchorMonth) break;
  }
  return { points, granularity: 'week' };
}

function seriesByMonth(txs, anchorMonth, span) {
  const months = [];
  for (let i = span - 1; i >= 0; i--) months.push(shiftMonth(anchorMonth, -i));

  let cumIncome = 0, cumExpense = 0;
  const points = months.map(m => {
    let inc = 0, exp = 0;
    for (const t of txs) {
      if (t.status !== 'completed' || !t.date) continue;
      if (t.date.slice(0, 7) !== m) continue;
      if (t.type === 'income') inc += Number(t.amount);
      else if (t.type === 'expense') exp += Number(t.amount);
    }
    cumIncome += inc;
    cumExpense += exp;
    return {
      label: shortMonth(m),
      income: cumIncome,
      expense: cumExpense,
      net: cumIncome - cumExpense,
    };
  });
  return { points, granularity: 'month' };
}

// ---------------- Formatting helpers ----------------

function shortMonth(ym) {
  const [, m] = ym.split('-').map(Number);
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[m - 1] || ym;
}

function abbrevIDR(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + trimZero((abs / 1e9).toFixed(1)) + 'M';
  if (abs >= 1e6) return sign + trimZero((abs / 1e6).toFixed(1)) + 'jt';
  if (abs >= 1e3) return sign + Math.round(abs / 1e3) + 'rb';
  return sign + String(Math.round(abs));
}

function trimZero(s) {
  return s.replace(/\.0$/, '');
}

// ---------------- Lifetime totals ----------------

export function renderLifetimeTotals() {
  const el = document.getElementById('lifetime-totals');
  if (!el) return;
  let income = 0, expense = 0, plannedOutstanding = 0;
  let firstDate = null, lastDate = null;
  for (const t of state.transactions) {
    const d = t.date || t.planned_date;
    if (d) {
      if (!firstDate || d < firstDate) firstDate = d;
      if (!lastDate || d > lastDate) lastDate = d;
    }
    if (t.type === 'income' && t.status === 'completed') income += Number(t.amount);
    if (t.type === 'expense' && t.status === 'completed') expense += Number(t.amount);
    if (t.type === 'expense' && t.status === 'planned') plannedOutstanding += Number(t.amount);
  }
  const net = income - expense;
  const cell = (label, value, cls = '') =>
    `<div class="lt-cell"><div class="lt-label">${label}</div><div class="lt-value ${cls}">${value}</div></div>`;

  el.innerHTML = [
    cell('All-time income', formatIDR(income), 'positive'),
    cell('All-time spent', formatIDR(expense), 'negative'),
    cell('Net saved', formatIDR(net), net < 0 ? 'negative' : 'positive'),
    cell('Planned outstanding', formatIDR(plannedOutstanding), plannedOutstanding > 0 ? 'pending' : ''),
  ].join('');

  const meta = document.getElementById('lifetime-meta');
  if (meta) {
    meta.textContent = firstDate
      ? `Data from ${firstDate} to ${lastDate}`
      : 'No data yet';
  }
}

// ---------------- Quick stats (this month) ----------------

export function renderQuickStats() {
  const el = document.getElementById('quick-stats');
  if (!el) return;
  const month = state.selectedMonth;
  const today = todayISO();

  let income = 0, expense = 0;
  for (const t of state.transactions) {
    const d = t.status === 'planned' && t.planned_date ? t.planned_date : t.date;
    if (!d || d.slice(0, 7) !== month) continue;
    if (t.type === 'income' && t.status === 'completed') income += Number(t.amount);
    if (t.type === 'expense' && t.status === 'completed') expense += Number(t.amount);
  }

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isCurrentMonth = month === today.slice(0, 7);
  const dayOfMonth = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth;

  const avgPerDay = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const projected = avgPerDay * daysInMonth;
  const remaining = income - expense;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const burn = daysLeft > 0 && remaining > 0 ? (remaining / daysLeft) : 0;

  const cell = (label, value, cls = '') =>
    `<div class="qs-cell"><div class="qs-label">${label}</div><div class="qs-value ${cls}">${value}</div></div>`;

  el.innerHTML = [
    cell('Avg / day', formatIDR(avgPerDay)),
    cell('Projected spend', formatIDR(projected), projected > income ? 'negative' : ''),
    cell('Days left', String(daysLeft)),
    cell('Safe to spend / day', daysLeft > 0 ? formatIDR(burn) : '—'),
  ].join('');
}

// ---------------- Master render ----------------

export function renderStatsColumn() {
  // Defer to the next frame so the browser has settled layout. Without this,
  // the first render fires before #reminders-list and #spending-chart have
  // been laid out, and both modules silently no-op.
  const run = () => {
    renderReminders();
    renderSpendingChart();
    renderLifetimeTotals();
    renderQuickStats();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}