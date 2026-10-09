// Pure financial calculations. No DOM, no fetch.

export function monthOf(tx) {
  const d = (tx.status === 'planned' && tx.planned_date) ? tx.planned_date : tx.date;
  return d ? d.slice(0, 7) : '';
}

export function inMonth(tx, month) {
  return monthOf(tx) === month;
}

export function actualIncome(txs, month) {
  return txs
    .filter(t => t.type === 'income' && t.status === 'completed' && inMonth(t, month))
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function actualExpenses(txs, month) {
  return txs
    .filter(t => t.type === 'expense' && t.status === 'completed' && inMonth(t, month))
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function availableBalance(txs, month) {
  return actualIncome(txs, month) - actualExpenses(txs, month);
}

export function plannedExpenses(txs, month) {
  return txs
    .filter(t => t.type === 'expense' && t.status === 'planned' && inMonth(t, month))
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function projectedBalance(txs, month) {
  return availableBalance(txs, month) - plannedExpenses(txs, month);
}

export function summarize(txs, month) {
  const income = actualIncome(txs, month);
  const expenses = actualExpenses(txs, month);
  const planned = plannedExpenses(txs, month);
  return {
    month,
    actual_income: income,
    actual_expenses: expenses,
    available_balance: income - expenses,
    planned_expenses: planned,
    projected_balance: income - expenses - planned,
  };
}

export function categoryActual(txs, categoryId, month) {
  return txs
    .filter(t => t.type === 'expense' && t.status === 'completed'
      && t.category_id === categoryId && inMonth(t, month))
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function categoryPlanned(txs, categoryId, month) {
  return txs
    .filter(t => t.type === 'expense' && t.status === 'planned'
      && t.category_id === categoryId && inMonth(t, month))
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function categoryDailyActual(txs, categoryId, dateISO) {
  return txs
    .filter(t => t.type === 'expense' && t.status === 'completed'
      && t.category_id === categoryId && t.date === dateISO)
    .reduce((s, t) => s + Number(t.amount), 0);
}

export function budgetProgress(category, actual) {
  if (category.monthly_budget == null) return null;
  if (category.monthly_budget <= 0) return null;
  return actual / category.monthly_budget;
}