import { api } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { state, setState, subscribe } from './state.js';
import {
  currentMonth, shiftMonth, formatMonth, todayISO,
} from './formatters.js';
import { renderSummary } from './dashboard.js';
import { renderTransactionTable, wireTransactionForm } from './transactions.js';
import { renderCategoryCards, wireCategoryCards, renderCategoryOptions } from './categories.js';
import { toast, setLoading, setError } from './ui.js';
import {
  loadReminders, wireReminders, wireStatsTabs, renderStatsColumn,
} from './stats.js';
import { wireCollapsibles } from './collapse.js';

let appBooted = false;

function renderLoginScreen() {
  document.body.innerHTML = `
    <div class="login-shell">
      <form class="login-card" id="login-form">
        <div class="login-brand">Daily Spending Tracker</div>
        <p class="login-hint">Enter your password to continue.</p>
        <label>Password
          <input type="password" id="login-password" autocomplete="current-password" required autofocus />
        </label>
        <label class="login-remember">
          <input type="checkbox" id="login-remember" /> Remember me on this device
        </label>
        <button class="btn btn-primary login-submit" type="submit">Unlock</button>
        <p class="login-error" id="login-error" role="alert"></p>
      </form>
    </div>
  `;

  const form = document.getElementById('login-form');
  const pw = document.getElementById('login-password');
  const remember = document.getElementById('login-remember');
  const errEl = document.getElementById('login-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking…';
    try {
      const result = await api.login(pw.value);
      setToken(result.token, result.expires_at, remember.checked);
      location.reload();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock';
      pw.select();
    }
  });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  setState({ selectedMonth: params.get('month') || currentMonth() });

  wireMonthNav();
  wireTransactionForm();
  wireCategoryCards();
  wireFilters();
  wireExports();
  wireLogout();
  wireStatsTabs();
  wireReminders();

  subscribe(onStateChange);
wireCollapsibles();

  await loadReminders();
  await refreshAll();
  
}
function onStateChange() {
  document.getElementById('month-label').textContent = formatMonth(state.selectedMonth);
  renderSummary(state);
  renderCategoryCards();
  renderCategoryOptions();
  renderTransactionTable();
  renderStatsColumn(); 
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
  const go = (delta) => {
    setState({
      selectedMonth: shiftMonth(state.selectedMonth, delta),
      filters: { ...state.filters, categoryId: '' },
    });
    refreshAll();
  };
  document.getElementById('prev-month').addEventListener('click', () => go(-1));
  document.getElementById('next-month').addEventListener('click', () => go(1));
  document.getElementById('today-btn').addEventListener('click', () => {
    setState({ selectedMonth: currentMonth(), filters: { ...state.filters, categoryId: '' } });
    refreshAll();
  });
}

function wireFilters() {
  document.getElementById('filter-kind').addEventListener('change', (e) => {
    setState({ filters: { ...state.filters, kind: e.target.value } });
  });
  document.getElementById('filter-category').addEventListener('change', (e) => {
    const value = e.target.value || '';
    setState({ filters: { ...state.filters, categoryId: value } });
  });
}

function wireLogout() {
  const header = document.querySelector('.app-header');
  if (!header || document.getElementById('logout-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'logout-btn';
  btn.className = 'btn btn-ghost';
  btn.type = 'button';
  btn.textContent = 'Log out';
  btn.addEventListener('click', () => {
    clearToken();
    location.reload();
  });
  header.appendChild(btn);
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

// Any 401 anywhere → force login screen
window.onUnauthorized = () => {
  clearToken();
  if (appBooted) location.reload();
};

// Entry point
if (getToken()) {
  appBooted = true;
  boot().catch(err => {
    console.error(err);
    toast('Failed to start: ' + err.message, 'error');
  });
} else {
  renderLoginScreen();
}
