const listeners = new Set();

export const state = {
  selectedMonth: '',
  transactions: [],
  categories: [],
  settings: {},
  filters: { kind: 'all', categoryId: '' },
  loading: false,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}