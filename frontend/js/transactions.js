import { api } from './api.js';
import { state, setState } from './state.js';
import { toast, confirmDialog } from './ui.js';
import {
  formatIDR, formatSignedIDR, escapeHTML, todayISO,
} from './formatters.js';
import { validateTransactionInput } from './validation.js';

export function renderTransactionTable() {
  const wrap = document.getElementById('transaction-table-container');

  const filtered = state.transactions
    .filter(t => {
      if (state.filters.kind === 'income') return t.type === 'income';
      if (state.filters.kind === 'expense') return t.type === 'expense' && t.status === 'completed';
      if (state.filters.kind === 'planned') return t.type === 'expense' && t.status === 'planned';
      return true;
    })
    .filter(t => !state.filters.categoryId || t.category_id === state.filters.categoryId);

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No transactions for this month.</div>`;
    return;
  }

  filtered.sort((a, b) => {
    const da = a.status === 'planned' ? a.planned_date : a.date;
    const db = b.status === 'planned' ? b.planned_date : b.date;
    if (da === db) return (b.created_at || '').localeCompare(a.created_at || '');
    return (db || '').localeCompare(da || '');
  });

  const catById = Object.fromEntries(state.categories.map(c => [c.id, c]));

  wrap.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Type</th>
          <th>Category</th>
          <th class="num">Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => rowHTML(t, catById)).join('')}
      </tbody>
    </table>
  `;
}

function rowHTML(t, catById) {
  const isPlanned = t.status === 'planned';
  const date = isPlanned ? t.planned_date : t.date;
  const cat = t.category_id ? (catById[t.category_id]?.name || '') : '';

  let typeLabel, amountHTML, statusClass;
  if (t.type === 'income') {
    typeLabel = 'Income';
    statusClass = 'status-income';
    amountHTML = `<span class="status-income">+${formatIDR(t.amount)}</span>`;
  } else if (isPlanned) {
    typeLabel = 'Planned';
    statusClass = 'status-planned';
    amountHTML = `<span class="status-planned">${formatIDR(t.amount)}</span>`;
  } else {
    typeLabel = 'Expense';
    statusClass = 'status-expense';
    amountHTML = `<span class="status-expense">−${formatIDR(t.amount)}</span>`;
  }

  const completeBtn = isPlanned
    ? `<button class="btn btn-ghost" data-action="complete" data-id="${escapeHTML(t.id)}" title="Mark as completed">☐</button>`
    : '';

  return `
    <tr>
      <td>${escapeHTML(date || '')}</td>
      <td>${escapeHTML(t.description)}</td>
      <td class="${statusClass}">${typeLabel}</td>
      <td>${escapeHTML(cat)}</td>
      <td class="num">${amountHTML}</td>
      <td>
        <div class="row-actions">
          ${completeBtn}
          <button class="btn btn-ghost" data-action="edit" data-id="${escapeHTML(t.id)}">Edit</button>
          <button class="btn btn-ghost btn-danger" data-action="delete" data-id="${escapeHTML(t.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

export function wireTransactionForm() {
  const form = document.getElementById('transaction-form');
  const kindEl = document.getElementById('tx-kind');
  const dateEl = document.getElementById('tx-date');

  dateEl.value = todayISO();

  kindEl.addEventListener('change', () => {
    dateEl.value = dateEl.value || todayISO();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const kind = fd.get('kind');
    const description = String(fd.get('description') || '').trim();
    const amount = Number(fd.get('amount'));
    const date = String(fd.get('date') || '');
    const category_id = String(fd.get('category_id') || '');
    const notes = String(fd.get('notes') || '').trim();

    const errors = validateTransactionInput({ description, amount, date, kind });
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0], 'error');
      return;
    }

    const isPlanned = kind === 'planned';
    const payload = {
      description,
      type: isPlanned ? 'expense' : kind,
      status: isPlanned ? 'planned' : 'completed',
      amount,
      date,
      category_id: category_id || '',
      notes,
    };
    if (isPlanned) payload.planned_date = date;
    else payload.actual_date = date;

    try {
      const created = await api.createTransaction(payload);
      setState({ transactions: [created, ...state.transactions] });
      form.reset();
      dateEl.value = todayISO();
      toast('Saved', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('transaction-table-container').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;

    if (action === 'delete') {
      const ok = await confirmDialog('Delete transaction', `Delete "${tx.description}"?`);
      if (!ok) return;
      try {
        await api.deleteTransaction(id);
        setState({ transactions: state.transactions.filter(t => t.id !== id) });
        toast('Deleted', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }

    if (action === 'complete') {
      await completeFlow(tx);
      return;
    }

    if (action === 'edit') {
      await editFlow(tx);
      return;
    }
  });
}

async function completeFlow(tx) {
  const date = prompt('Actual completion date (YYYY-MM-DD):', todayISO());
  if (!date) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Invalid date', 'error'); return; }
  const amountStr = prompt('Amount (leave blank to keep):', String(tx.amount));
  const payload = { actual_date: date };
  if (amountStr && amountStr.trim() !== '') payload.amount = Number(amountStr);

  try {
    const updated = await api.completeTransaction(tx.id, payload);
    setState({ transactions: state.transactions.map(t => t.id === tx.id ? updated : t) });
    toast('Marked completed', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editFlow(tx) {
  const description = prompt('Description:', tx.description);
  if (description == null) return;
  const amountStr = prompt('Amount:', String(tx.amount));
  if (amountStr == null) return;
  const dateVal = prompt('Effective date (YYYY-MM-DD):', tx.status === 'planned' ? tx.planned_date : tx.date);
  if (dateVal == null) return;

  const payload = { ...tx, description, amount: Number(amountStr) };
  if (tx.status === 'planned') payload.planned_date = dateVal;
  else { payload.date = dateVal; payload.actual_date = dateVal; }

  try {
    const updated = await api.updateTransaction(tx.id, payload);
    setState({ transactions: state.transactions.map(t => t.id === tx.id ? updated : t) });
    toast('Updated', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}