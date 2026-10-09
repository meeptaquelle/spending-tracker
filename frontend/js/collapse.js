// Marks any element with [data-collapsible="key"] as toggleable.
// Adds a small chevron next to the section title.
// State is in-memory only: resets on every page load.

const collapsed = {};   // key -> boolean, lives for the tab's lifetime

export function wireCollapsibles() {
  document.querySelectorAll('[data-collapsible]').forEach((section) => {
    const key = section.dataset.collapsible;
    const title = section.querySelector('.section-title');
    if (!title) return;

    // Anchor for the toggle: reuse .section-head if present, otherwise
    // wrap the title in a row so the toggle sits on the same line.
    let head = section.querySelector('.section-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'section-head';
      title.parentNode.insertBefore(head, title);
      head.appendChild(title);
    }

    // Collect everything after the header into a body we can hide
    const body = document.createElement('div');
    body.className = 'collapsible-body';
    let node = head.nextSibling;
    while (node) {
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }
    section.appendChild(body);

    // Add the toggle button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'collapse-toggle';
    btn.setAttribute('aria-label', 'Toggle section');
    head.appendChild(btn);

    const apply = (isCollapsed) => {
      section.classList.toggle('collapsed', isCollapsed);
      body.hidden = isCollapsed;
      btn.textContent = isCollapsed ? '▸' : '▾';
      btn.setAttribute('aria-expanded', String(!isCollapsed));
    };

    // Always start expanded
    collapsed[key] = false;
    apply(false);

    btn.addEventListener('click', () => {
      const next = !collapsed[key];
      collapsed[key] = next;
      apply(next);
      // If we just expanded the chart, kick it so it redraws into visible space
      if (!next && key === 'graph') {
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}