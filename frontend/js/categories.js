import { api } from './api.js';
import { state, setState } from './state.js';
import { toast, confirmDialog } from './ui.js';
import { formatIDR, escapeHTML, todayISO } from './formatters.js';
import { categoryActual, categoryPlanned, categoryDailyActual, budgetProgress } from './calculations.js';
import { validateCategoryInput } from './validation.js';

const ICONS = ['🍔', '🚌', '🏠', '💊', '🎬', '🛒', '💡', '📚', '🎁', '✈️', '💼', '🧾', '☕', '🍜', '⛽', '📱'];

export function renderCategoryCards() {
  const container = document.getElementById('category-cards');
  const month = state.selectedMonth;
  const today = todayISO();

  const cards = state.categories.map(c => categoryCardHTML(c, month, today)).join('');

  container.innerHTML = cards + `
    <div class="category-card add-card" data-action="add-category" role="button" tabindex="0">
      <div>+ Add category</div>
    </div>`;
}

function categoryCardHTML(c, month, today) {
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
        <button class="btn btn-ghost" data-action="edit-category" data-id="${escapeHTML(c.id)}"
                aria-label="Edit ${escapeHTML(c.name)}">✎</button>
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
}

export function wireCategoryCards() {
  const container = document.getElementById('category-cards');

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'add-category') return openCategoryDialog(null);
    if (action === 'edit-category') {
      const cat = state.categories.find(c => c.id === id);
      if (cat) openCategoryDialog(cat);
    }
  });

  // Keyboard activation for the add card (it's role=button tabindex=0)
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.add-card');
    if (card) { e.preventDefault(); openCategoryDialog(null); }
  });

  wireCategoryDialog();
}

function populateIconSelect(selected) {
  const sel = document.getElementById('cat-icon');
  sel.innerHTML = ICONS
    .map(i => `<option value="${i}" ${i === selected ? 'selected' : ''}>${i}</option>`)
    .join('');
  if (!selected) sel.value = ICONS[0];
}

let dialogMode = 'create';
let dialogCategoryId = null;

function openCategoryDialog(cat) {
  const dlg = document.getElementById('category-dialog');
  const title = document.getElementById('category-dialog-title');
  const nameEl = document.getElementById('cat-name');
  const monthlyEl = document.getElementById('cat-monthly');
  const dailyEl = document.getElementById('cat-daily');
  const archiveBtn = document.getElementById('cat-archive');

  if (cat) {
    dialogMode = 'edit';
    dialogCategoryId = cat.id;
    title.textContent = 'Edit category';
    nameEl.value = cat.name;
    populateIconSelect(cat.icon);
    monthlyEl.value = cat.monthly_budget ?? '';
    dailyEl.value = cat.daily_budget ?? '';
    archiveBtn.hidden = false;
  } else {
    dialogMode = 'create';
    dialogCategoryId = null;
    title.textContent = 'New category';
    nameEl.value = '';
    populateIconSelect(null);
    monthlyEl.value = '';
    dailyEl.value = '';
    archiveBtn.hidden = true;
  }

  dlg.showModal();
  setTimeout(() => nameEl.focus(), 0);
}

function wireCategoryDialog() {
  const dlg = document.getElementById('category-dialog');
  const form = document.getElementById('category-form');
  const archiveBtn = document.getElementById('cat-archive');

  form.addEventListener('submit', async (e) => {
    // 'save' is the submitter; check e.submitter value
    if (e.submitter && e.submitter.value === 'cancel') return; // let dialog close

    e.preventDefault();

    const name = document.getElementById('cat-name').value.trim();
    const icon = document.getElementById('cat-icon').value;
    const monthlyRaw = document.getElementById('cat-monthly').value.trim();
    const dailyRaw = document.getElementById('cat-daily').value.trim();

    const monthly_budget = monthlyRaw === '' ? null : Number(monthlyRaw);
    const daily_budget = dailyRaw === '' ? null : Number(dailyRaw);

    const errors = validateCategoryInput({ name, monthly_budget, daily_budget });
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0], 'error');
      return;
    }

    try {
      if (dialogMode === 'create') {
        const created = await api.createCategory({ name, icon, monthly_budget, daily_budget, is_archived: false });
        setState({ categories: [...state.categories, created] });
        toast('Category added', 'success');
      } else {
        const cat = state.categories.find(c => c.id === dialogCategoryId);
        const updated = await api.updateCategory(cat.id, {
          ...cat, name, icon, monthly_budget, daily_budget,
        });
        setState({ categories: state.categories.map(c => c.id === cat.id ? updated : c) });
        toast('Category updated', 'success');
      }
      dlg.close('saved');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  archiveBtn.addEventListener('click', async () => {
    const cat = state.categories.find(c => c.id === dialogCategoryId);
    if (!cat) return;
    const ok = await confirmDialog(
      'Archive category',
      `Archive "${cat.name}"? Historical transactions keep their category.`
    );
    if (!ok) return;
    try {
      await api.archiveCategory(cat.id);
      setState({ categories: state.categories.filter(c => c.id !== cat.id) });
      toast('Category archived', 'success');
      dlg.close('archived');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function renderCategoryOptions() {
  const txSelect = document.getElementById('tx-category');
  const filterSelect = document.getElementById('filter-category');

  const opts = state.categories
    .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`)
    .join('');

  const txCurrent = txSelect.value;
  txSelect.innerHTML = `<option value="">—</option>` + opts;
  if (txCurrent && state.categories.some(c => c.id === txCurrent)) {
    txSelect.value = txCurrent;
  }

  const filterCurrent = state.filters.categoryId || '';
  filterSelect.innerHTML = `<option value="">All</option>` + opts;
  if (filterCurrent && state.categories.some(c => c.id === filterCurrent)) {
    filterSelect.value = filterCurrent;
  } else {
    filterSelect.value = '';
  }
}