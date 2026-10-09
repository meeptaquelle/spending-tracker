import { summarize } from './calculations.js';
import { formatIDR } from './formatters.js';

const CARDS = [
  { key: 'actual_income',     label: 'Total income' },
  { key: 'actual_expenses',   label: 'Actual expenses' },
  { key: 'available_balance', label: 'Available balance' },
  { key: 'planned_expenses',  label: 'Planned expenses' },
  { key: 'projected_balance', label: 'Projected balance' },
];

export function renderSummary(state) {
  const container = document.getElementById('summary-cards');
  const s = summarize(state.transactions, state.selectedMonth);

  container.innerHTML = CARDS.map(({ key, label }) => {
    const val = s[key];
    const cls = val < 0 ? 'negative' : (key === 'actual_income' ? 'positive' : '');
    return `
      <div class="summary-card">
        <div class="label">${label}</div>
        <div class="value ${cls}">${formatIDR(val)}</div>
      </div>`;
  }).join('');
}