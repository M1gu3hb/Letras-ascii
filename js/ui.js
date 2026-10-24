// Pequeñas piezas de interfaz sin dependencias.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export const debounce = (fn, ms) => {
  let id = 0;
  const d = (...a) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
  d.now = (...a) => {
    clearTimeout(id);
    fn(...a);
  };
  d.cancel = () => clearTimeout(id);
  return d;
};

let toastEl = null;
let toastId = 0;
export function toast(msg, kind = '') {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + kind;
  clearTimeout(toastId);
  toastId = setTimeout(() => (toastEl.className = 'toast'), kind === 'bad' ? 6500 : 3200);
}

// fila con etiqueta + control
export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('div', { class: 'lab' }, label, hint ? h('span', { class: 'hint' }, hint) : null), control);
}

// deslizador con valor visible
export function slider({ min, max, step, value, onInput, fmt = (v) => String(v), label, hint }) {
  const out = h('output', { class: 'val' }, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
  inp.addEventListener('input', () => {
    out.textContent = fmt(+inp.value);
    onInput(+inp.value);
  });
  const row = h('div', { class: 'slide' }, inp, out);
  row.set = (v) => {
    inp.value = v;
    out.textContent = fmt(+v);
  };
  if (!label) return row;
  const el = field(label, row, hint);
  el.set = row.set;
  return el;
}

// interruptor tipo casilla grande
export function toggle(label, value, onChange, hint) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!value;
  inp.addEventListener('change', () => onChange(inp.checked));
  const el = h('label', { class: 'switch' }, inp, h('span', { class: 'knob' }), h('span', { class: 'txt' }, label, hint ? h('small', {}, hint) : null));
  el.set = (v) => (inp.checked = !!v);
  return el;
}

// grupo de botones de una sola opción
export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label || null });
  const btns = options.map(([v, text]) => {
    const b = h('button', { type: 'button', class: 'segb' + (v === value ? ' on' : ''), 'aria-pressed': v === value ? 'true' : 'false', onclick: () => {
      set(v);
      onChange(v);
    } }, text);
    b.dataset.v = String(v);
    return b;
  });
  function set(v) {
    btns.forEach((b) => {
      const on = b.dataset.v === String(v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  wrap.append(...btns);
  wrap.set = set;
  return wrap;
}

// chips de selección múltiple
export function chips(options, values, onChange, { min = 0, render } = {}) {
  const cur = new Set(values);
  const wrap = h('div', { class: 'chips' });
  const btns = options.map(([v, text]) => {
    const b = h('button', { type: 'button', class: 'chip' + (cur.has(v) ? ' on' : ''), 'aria-pressed': cur.has(v) ? 'true' : 'false', onclick: () => {
      if (cur.has(v)) {
        if (cur.size <= min) return;
        cur.delete(v);
      } else cur.add(v);
      paint();
      onChange([...cur]);
    } }, render ? render(v, text) : text);
    b.dataset.v = String(v);
    return b;
  });
  function paint() {
    btns.forEach((b) => {
      const on = cur.has(b.dataset.v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  wrap.append(...btns);
  wrap.set = (vals) => {
    cur.clear();
    vals.forEach((v) => cur.add(v));
    paint();
  };
  return wrap;
}

export function select(options, value, onChange, label) {
  const s = h('select', { 'aria-label': label || null });
  for (const [v, text] of options) s.append(h('option', { value: v }, text));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function fmtBytes(n) {
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1048576).toFixed(n > 20 * 1048576 ? 0 : 1) + ' MB';
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}
