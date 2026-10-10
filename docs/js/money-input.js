// Attaches a thousand-separator formatter to any input[type="text"][data-money].
// Displays "15.000" but reads/stores "15000" as an integer.

const IDR_GROUP = new Intl.NumberFormat('id-ID');

export function attachMoneyInput(el) {
  // Track the raw digit-only string so we can reformat without losing cursor sanity.
  let raw = '';

  const format = (digits) => {
    if (digits === '') return '';
    // Strip leading zeros but keep a single zero
    digits = digits.replace(/^0+(?=\d)/, '');
    return IDR_GROUP.format(BigInt(digits));
  };

  const render = () => {
    const caretFromEnd = el.value.length - el.selectionStart;
    el.value = format(raw);
    // Restore caret from the right, so typing is stable
    const newPos = Math.max(0, el.value.length - caretFromEnd);
    el.setSelectionRange(newPos, newPos);
  };

  // Initialize from existing value if present
  if (el.value) {
    raw = String(el.value).replace(/\D/g, '');
    render();
  }

  el.addEventListener('input', (e) => {
    const before = el.value;
    const caretBefore = el.selectionStart;

    // Count digits to the left of the caret — used to keep the caret
    // anchored to the same digit after reformatting.
    const digitsLeftOfCaret = before.slice(0, caretBefore).replace(/\D/g, '').length;

    raw = before.replace(/\D/g, '');
    render();

    // Reposition caret so it stays to the right of the same digit count
    let seen = 0;
    let pos = el.value.length;
    for (let i = 0; i < el.value.length; i++) {
      if (/\d/.test(el.value[i])) {
        seen++;
        if (seen === digitsLeftOfCaret) { pos = i + 1; break; }
      }
    }
    el.setSelectionRange(pos, pos);
  });

  // Block wheel/spinner weirdness on focus
  el.addEventListener('wheel', (e) => { if (document.activeElement === el) e.preventDefault(); }, { passive: false });

  return {
    getValue() { return raw === '' ? 0 : Number(raw); },
    setValue(n) {
      raw = (n === null || n === undefined || n === '') ? '' : String(Math.trunc(Number(n)));
      render();
    },
  };
}

export function attachAllMoneyInputs(root = document) {
  const controllers = new Map();
  root.querySelectorAll('input[data-money]').forEach((el) => {
    if (controllers.has(el)) return;
    controllers.set(el, attachMoneyInput(el));
  });
  return controllers;
}

export function getMoneyValue(el) {
  const digits = el.value.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}