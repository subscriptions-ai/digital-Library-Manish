import React from 'react';
import { createRoot } from 'react-dom/client';

/*
 * A tiny template runtime. The page's markup (<script id="dc-template">) uses {{holes}}, <sc-if>, <sc-for> and <sc-icon>;
 * its logic (<script id="dc-logic">) is one class whose renderVals() returns everything the markup reads. React does the DOM work.
 */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  book: '<path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V19c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5z"/><path d="M12 6v13.5"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
  building: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01"/>',
  message: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 003.4 0"/>',
  moon: '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevl: '<path d="M15 18l-6-6 6-6"/>',
  chevr: '<path d="M9 6l6 6-6 6"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 9.5 6 9.5 6a17 17 0 01-3.1 3.8M6.6 6.7C3.9 8.5 2.5 12 2.5 12S6 18 12 18c1.5 0 2.9-.4 4-1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  refresh: '<path d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
};

const ATTRS = { autofocus: 'autoFocus', tabindex: 'tabIndex', maxlength: 'maxLength', readonly: 'readOnly', spellcheck: 'spellCheck', autocomplete: 'autoComplete', enterkeyhint: 'enterKeyHint', inputmode: 'inputMode', colspan: 'colSpan', rows: 'rows' };
const EVENTS = { onclick: 'onClick', oninput: 'onChange', onchange: 'onChange', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onmousemove: 'onMouseMove', onkeydown: 'onKeyDown', onfocus: 'onFocus', onblur: 'onBlur', onsubmit: 'onSubmit' };
const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const VOID = new Set(['input', 'br', 'img', 'hr']);

function lookup(path, scope) {
  if (path === 'true') return true;
  if (path === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  let v = scope;
  for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
const evalAttr = (raw, scope) => { if (raw == null) return undefined; const m = WHOLE.exec(raw); return m ? lookup(m[1], scope) : raw.replace(HOLE, (_, p) => String(lookup(p, scope) ?? '')); };
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function styleObj(str) {
  const out = {};
  for (const decl of String(str || '').split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim(); if (!k) continue;
    out[k.startsWith('--') ? k : camel(k)] = v;
  }
  return out;
}

function build(node, scope) {
  if (node.nodeType === 3) {
    const t = node.textContent;
    if (!t.trim() && t.includes('\n')) return null;
    if (!t.includes('{{')) return t;
    return t.replace(HOLE, (_, p) => String(lookup(p, scope) ?? ''));
  }
  if (node.nodeType !== 1) return null;
  const tag = node.localName;
  const kids = (sc) => [...node.childNodes].map((c, i) => React.createElement(React.Fragment, { key: i }, build(c, sc)));
  if (tag === 'sc-if') return evalAttr(node.getAttribute('value'), scope) ? React.createElement(React.Fragment, null, ...kids(scope)) : null;
  if (tag === 'sc-icon') {
    const size = Number(evalAttr(node.getAttribute('size'), scope) || 18), name = evalAttr(node.getAttribute('name'), scope);
    return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: Number(node.getAttribute('stroke') || 2), strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', className: node.getAttribute('class') || undefined, style: node.hasAttribute('style') ? styleObj(evalAttr(node.getAttribute('style'), scope)) : undefined, dangerouslySetInnerHTML: { __html: ICONS[name] || '' } });
  }
  if (tag === 'sc-for') {
    const list = evalAttr(node.getAttribute('list'), scope) || [], as = node.getAttribute('as'), keyAttr = node.getAttribute('key');
    return list.map((item, i) => {
      const sc = { ...scope, [as]: item, $index: i };
      const k = keyAttr ? evalAttr(keyAttr, sc) : i;
      return React.createElement(React.Fragment, { key: k }, ...[...node.childNodes].map((c, j) => React.createElement(React.Fragment, { key: j }, build(c, sc))));
    });
  }
  const props = {};
  for (const a of node.attributes) {
    const name = a.name;
    if (name.startsWith('hint-')) continue;
    const val = evalAttr(a.value, scope);
    if (name === 'class') props.className = val;
    else if (name === 'for') props.htmlFor = val;
    else if (name === 'style') props.style = styleObj(val);
    else if (EVENTS[name]) props[EVENTS[name]] = val;
    else if (name === 'key') props.key = val;
    else if (ATTRS[name]) props[ATTRS[name]] = val;
    else if (val !== undefined) props[/^(aria|data)-/.test(name) || !name.includes('-') ? name : camel(name)] = val;
  }
  if (tag === 'input' && 'value' in props && !props.onChange) props.readOnly = true;
  if (VOID.has(tag)) return React.createElement(tag, props);
  return React.createElement(tag, props, ...kids(scope));
}

const template = document.getElementById('dc-template').textContent;
const code = document.getElementById('dc-logic').textContent;
const doc = new DOMParser().parseFromString('<body>' + template + '</body>', 'text/html');
const roots = [...doc.body.childNodes];
class DCLogic extends React.Component {}
const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
Component.prototype.render = function () {
  const vals = this.renderVals();
  return React.createElement(React.Fragment, null, ...roots.map((n, i) => React.createElement(React.Fragment, { key: i }, build(n, vals))));
};
createRoot(document.getElementById('root')).render(React.createElement(Component, {}));
