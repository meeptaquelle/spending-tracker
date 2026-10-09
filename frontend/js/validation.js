export function validateTransactionInput({ description, amount, date, kind }) {
  const errors = {};
  if (!description || !description.trim()) errors.description = 'Description is required';
  if (description && description.length > 200) errors.description = 'Too long (max 200)';

  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) errors.amount = 'Amount must be greater than zero';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Date is required (YYYY-MM-DD)';
  if (!['income', 'expense', 'planned'].includes(kind)) errors.kind = 'Invalid type';
  return errors;
}

export function validateCategoryInput({ name, monthly_budget, daily_budget }) {
  const errors = {};
  if (!name || !name.trim()) errors.name = 'Name is required';
  if (name && name.length > 60) errors.name = 'Too long (max 60)';
  if (monthly_budget !== '' && monthly_budget != null) {
    const v = Number(monthly_budget);
    if (!Number.isFinite(v) || v <= 0) errors.monthly_budget = 'Must be a positive number or blank';
  }
  if (daily_budget !== '' && daily_budget != null) {
    const v = Number(daily_budget);
    if (!Number.isFinite(v) || v <= 0) errors.daily_budget = 'Must be a positive number or blank';
  }
  return errors;
}