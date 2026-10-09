import { api } from './api.js';
import { state, setState, subscribe } from './state.js';
import {
  currentMonth, shiftMonth, formatMonth, todayISO, escapeHTML, formatIDR,
} from './formatters.js';
import { renderSummary } from './dashboard.js';
import { renderTransactionTable, wireTransactionForm } from './transactions.js';
import { renderCategoryCards, wireCategoryCards, renderCategoryOptions } from './categories.js';
import { toast, setLoading, setError } from './ui.js';

async function boot() {
  const params = new URLSearchParams(location.search);
  setState({
    selectedMonth: params.get('month') || currentMonth(),
  });

  wireMonthNav();
  wireTransactionForm();
  wireCategoryCards();
  wireFilters();
  wireExports();

  subscribe(onStateChange);

  await refreshAll();
}

function onStateChange() {
  document.getElementById('month-label').textContent = formatMonth(state.selectedMonth);
  renderSummary(state);
  renderCategoryCards();
  renderCategoryOptions();
  renderTransactionTable();
}

async function refreshAll() {
  const wrap = document.getElementById('transaction-table-container');
  setLoading(wrap, 'Loading transactions…');
  try {
    const [txs, cats] = await Promise.all([
      api.listTransactions(state.selectedMonth),
      api.listCategories(false),
    ]);
    setState({ transactions: txs || [], categories: cats || [] });
  } catch (err) {
    setError(wrap, err);
    toast(err.message, 'error');
  }
}

function wireMonthNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    setState({ selectedMonth: shiftMonth(state.selectedMonth, -1) });
    refreshAll();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    setState({ selectedMonth: shiftMonth(state.selectedMonth, 1) });
    refreshAll();
  });
  document.getElementById('today-btn').addEventListener('click', () => {
    setState({ selectedMonth: currentMonth() });
    refreshAll();
  });
}

function wireFilters() {
  document.getElementById('filter-kind').addEventListener('change', (e) => {
    setState({ filters: { ...state.filters, kind: e.target.value } });
  });
  document.getElementById('filter-category').addEventListener('change', (e) => {
    setState({ filters: { ...state.filters, categoryId: e.target.value } });
  });
}

function wireExports() {
  document.getElementById('export-csv').addEventListener('click', () => {
    const rows = [['date', 'description', 'type', 'status', 'category', 'amount', 'notes']];
    for (const t of state.transactions) {
      const cat = state.categories.find(c => c.id === t.category_id);
      rows.push([
        t.status === 'planned' ? t.planned_date : t.date,
        t.description, t.type, t.status,
        cat?.name || '', String(t.amount), t.notes || '',
      ]);
    }
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`transactions-${state.selectedMonth}.csv`, csv, 'text/csv');
  });

  document.getElementById('export-json').addEventListener('click', () => {
    const backup = {
      exported_at: new Date().toISOString(),
      transactions: state.transactions,
      categories: state.categories,
      settings: state.settings,
    };
    downloadFile(`backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  });
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

boot().catch(err => {
  console.error(err);
  toast('Failed to start: ' + err.message, 'error');
});