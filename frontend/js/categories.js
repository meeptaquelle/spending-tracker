import { api } from './api.js';
import { state, setState } from './state.js';
import { toast, confirmDialog } from './ui.js';
import { formatIDR, escapeHTML, todayISO } from './formatters.js';
import { categoryActual, categoryPlanned, categoryDailyActual, budgetProgress } from './calculations.js';
import { validateCategoryInput } from './validation.js';

const ICONS = ['🍔', '🚌', '🏠', '💊', '🎬', '🛒', '💡', '📚', '🎁', '✈️', '💼', '🧾'];

export function renderCategoryCards() {
  const container = document.getElementById('category-cards');
  const month = state.selectedMonth;

  if (state.categories.length === 0) {
    container.innerHTML = `
      <div class="category-card add-card" data-action="add-category">
        <div>+ Add category</div>
      </div>`;
    return;
  }

  const today = todayISO();

  container.innerHTML = state.categories.map(c => {
    const actual = categoryActual(state.transactions, c.id, month);
    const planned = categoryPlanned(state.transactions, c.id, month);
    const progress = budgetProgress(c, actual);
    const remaining = c.monthly_budget != null ? c.monthly_budget - actual : null;
    const over = remaining != null && remaining < 0;

    const dailyActual = c.daily_budget != null ? categoryDailyActual(state.transactions, c.id, today) : null;
    const dailyRemaining = c.daily_budget != null ? c.daily_budget - dailyActual : null;

    return `
      <div class="category-card" data-id="${escapeHTML(c.id)}">
        <div class="cat-head">
          <div>
            <span class="cat-icon">${escapeHTML(c.icon)}</span>
            <span class="cat-name">${escapeHTML(c.name)}</span>
          </div>
          <button class="btn btn-ghost" data-action="edit-category" data-id="${escapeHTML(c.id)}">…</button>
        </div>
        <div class="cat-amounts">
          ${c.monthly_budget != null
            ? `${formatIDR(actual)} / ${formatIDR(c.monthly_budget)}`
            : formatIDR(actual)}
        </div>
        ${progress != null ? `
          <div class="progress ${over ? 'over' : ''}">
            <div style="width: ${Math.min(100, Math.max(0, progress * 100)).toFixed(1)}%"></div>
          </div>
          <div class="cat-remaining ${over ? 'over' : ''}">
            ${over ? `${formatIDR(-remaining)} over budget` : `${formatIDR(remaining)} remaining`}
          </div>` : ''}
        ${planned > 0 ? `<div class="cat-remaining">Planned: ${formatIDR(planned)}</div>` : ''}
        ${c.daily_budget != null ? `
          <div class="cat-remaining">
            Today: ${formatIDR(dailyActual)} / ${formatIDR(c.daily_budget)}
            ${dailyRemaining < 0 ? `(${formatIDR(-dailyRemaining)} over)` : `(${formatIDR(dailyRemaining)} left)`}
          </div>` : ''}
      </div>`;
  }).join('') + `
    <div class="category-card add-card" data-action="add-category">
      <div>+ Add category</div>
    </div>`;
}

export function wireCategoryCards() {
  document.getElementById('category-cards').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'add-category') { await addCategoryFlow(); return; }
    if (action === 'edit-category') {
      const cat = state.categories.find(c => c.id === id);
      if (cat) await editCategoryFlow(cat);
      return;
    }
  });
}

async function addCategoryFlow() {
  const name = prompt('Category name:');
  if (!name) return;
  const icon = prompt(`Icon (one of: ${ICONS.join(' ')}):`, ICONS[0]) || ICONS[0];
  const monthly = prompt('Monthly budget (IDR, blank for none):', '');
  const daily = prompt('Daily budget (IDR, blank for none):', '');

  const monthly_budget = monthly && monthly.trim() !== '' ? Number(monthly) : null;
  const daily_budget = daily && daily.trim() !== '' ? Number(daily) : null;

  const errors = validateCategoryInput({ name, monthly_budget, daily_budget });
  if (Object.keys(errors).length) { toast(Object.values(errors)[0], 'error'); return; }

  try {
    const created = await api.createCategory({ name, icon, monthly_budget, daily_budget, is_archived: false });
    setState({ categories: [...state.categories, created] });
    toast('Category added', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function editCategoryFlow(cat) {
  const name = prompt('Name:', cat.name);
  if (name == null) return;
  const icon = prompt('Icon:', cat.icon) || cat.icon;
  const monthly = prompt('Monthly budget (blank to clear):', cat.monthly_budget ?? '');
  const daily = prompt('Daily budget (blank to clear):', cat.daily_budget ?? '');

  const monthly_budget = monthly && monthly.trim() !== '' ? Number(monthly) : null;
  const daily_budget = daily && daily.trim() !== '' ? Number(daily) : null;

  const errors = validateCategoryInput({ name, monthly_budget, daily_budget });
  if (Object.keys(errors).length) { toast(Object.values(errors)[0], 'error'); return; }

  const choice = prompt('Type "save" to save, "archive" to archive:', 'save');
  if (!choice) return;

  try {
    if (choice.toLowerCase() === 'archive') {
      const ok = await confirmDialog('Archive category', `Archive "${cat.name}"? Historical transactions keep their category.`);
      if (!ok) return;
      await api.archiveCategory(cat.id);
      setState({ categories: state.categories.filter(c => c.id !== cat.id) });
      toast('Archived', 'success');
      return;
    }
    const updated = await api.updateCategory(cat.id, { ...cat, name, icon, monthly_budget, daily_budget });
    setState({ categories: state.categories.map(c => c.id === cat.id ? updated : c) });
    toast('Updated', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function renderCategoryOptions() {
  const txSelect = document.getElementById('tx-category');
  const filterSelect = document.getElementById('filter-category');

  const opts = state.categories.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
  txSelect.innerHTML = `<option value="">—</option>` + opts;
  filterSelect.innerHTML = `<option value="">All</option>` + opts;
}