import { api } from './api.js';
import { state, setState } from './state.js';
import { toast, confirmDialog } from './ui.js';
import { formatIDR, escapeHTML, todayISO } from './formatters.js';
import { validateTransactionInput } from './validation.js';
import { getMoneyValue, attachMoneyInput } from './money-input.js';

export function renderTransactionTable() {
  const wrap = document.getElementById('transaction-table-container');

  const filtered = state.transactions
    .filter(t => {
      const d = t.status === 'planned' ? t.planned_date : t.date;
      return d && d.slice(0, 7) === state.selectedMonth;
    })
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
          <th></th>
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
  const idEsc = escapeHTML(t.id);

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
    ? `<button class="btn btn-ghost btn-icon" data-action="complete" data-id="${idEsc}"
             aria-label="Mark ${escapeHTML(t.description)} as completed" title="Mark as completed">☐</button>`
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
          <button class="btn btn-ghost btn-icon" data-action="edit" data-id="${idEsc}"
                  aria-label="Edit transaction" title="Edit">✎</button>
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
    const amount = getMoneyValue(document.getElementById('tx-amount'));
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

    if (action === 'edit') { openTransactionDialog(tx); return; }
    if (action === 'complete') { await completeFlow(tx); return; }
  });
  attachMoneyInput(document.getElementById('tx-amount'));

  wireTransactionDialog();
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

// ---------- Edit / delete modal ----------

let editingTxId = null;

function openTransactionDialog(tx) {
  editingTxId = tx.id;
  const dlg = document.getElementById('tx-dialog');

  document.getElementById('tx-dialog-title').textContent =
    tx.type === 'income' ? 'Edit income'
      : tx.status === 'planned' ? 'Edit planned expense'
      : 'Edit expense';

  document.getElementById('edit-description').value = tx.description;
  const editAmountEl = document.getElementById('edit-amount');
attachMoneyInput(editAmountEl).setValue(tx.amount);

  const dateLabel = document.getElementById('edit-date-label-text');
  const dateEl = document.getElementById('edit-date');
  if (tx.status === 'planned') {
    dateLabel.textContent = 'Planned date';
    dateEl.value = tx.planned_date || tx.date || '';
  } else {
    dateLabel.textContent = tx.type === 'income' ? 'Received on' : 'Date';
    dateEl.value = tx.date || tx.actual_date || '';
  }

  const catSelect = document.getElementById('edit-category');
  const opts = state.categories
    .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`)
    .join('');
  catSelect.innerHTML = `<option value="">—</option>` + opts;
  catSelect.value = tx.category_id || '';

  document.getElementById('edit-notes').value = tx.notes || '';

  dlg.showModal();
  setTimeout(() => document.getElementById('edit-description').focus(), 0);
}

function wireTransactionDialog() {
  const dlg = document.getElementById('tx-dialog');
  const form = document.getElementById('tx-edit-form');
  const deleteBtn = document.getElementById('edit-delete');

  form.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return; // let dialog close
    e.preventDefault();

    const tx = state.transactions.find(t => t.id === editingTxId);
    if (!tx) { dlg.close(); return; }

    const description = document.getElementById('edit-description').value.trim();
    const amount = getMoneyValue(document.getElementById('edit-amount'));
    const dateVal = document.getElementById('edit-date').value;
    const category_id = document.getElementById('edit-category').value || '';
    const notes = document.getElementById('edit-notes').value.trim();

    const errors = validateTransactionInput({
      description,
      amount,
      date: dateVal,
      kind: tx.type === 'income' ? 'income' : (tx.status === 'planned' ? 'planned' : 'expense'),
    });
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0], 'error');
      return;
    }

    const payload = { ...tx, description, amount, category_id, notes };
    if (tx.status === 'planned') {
      payload.planned_date = dateVal;
      // keep date in sync so monthOf() works even if completed later
      payload.date = dateVal;
    } else {
      payload.date = dateVal;
      payload.actual_date = dateVal;
    }

    try {
      const updated = await api.updateTransaction(tx.id, payload);
      setState({ transactions: state.transactions.map(t => t.id === tx.id ? updated : t) });
      toast('Updated', 'success');
      dlg.close('saved');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const tx = state.transactions.find(t => t.id === editingTxId);
    if (!tx) return;
    const ok = await confirmDialog(
      'Delete transaction',
      `Delete "${tx.description}"? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await api.deleteTransaction(tx.id);
      setState({ transactions: state.transactions.filter(t => t.id !== tx.id) });
      toast('Deleted', 'success');
      dlg.close('deleted');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}