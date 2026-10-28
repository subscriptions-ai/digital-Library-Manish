import React from 'react';
import { createRoot } from 'react-dom/client';

// A small stand-in for the design tool's runtime: it reads the same template (holes, sc-if, sc-for, event attributes) and the same logic class,
// and renders them with React, so the standalone page is the prototype itself and not a copy of it.
const ATTRS = { autofocus: 'autoFocus', tabindex: 'tabIndex', maxlength: 'maxLength', readonly: 'readOnly', spellcheck: 'spellCheck', autocomplete: 'autoComplete', enterkeyhint: 'enterKeyHint', inputmode: 'inputMode', colspan: 'colSpan' };
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
  if (tag === 'sc-for') {
    const list = evalAttr(node.getAttribute('list'), scope) || [], as = node.getAttribute('as');
    const keyAttr = node.getAttribute('key');
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

const { template, code } = window.__DC__;
const doc = new DOMParser().parseFromString('<body>' + template + '</body>', 'text/html');
const roots = [...doc.body.childNodes];
class DCLogic extends React.Component {}
const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
Component.prototype.render = function () {
  const vals = this.renderVals();
  return React.createElement(React.Fragment, null, ...roots.map((n, i) => React.createElement(React.Fragment, { key: i }, build(n, vals))));
};
createRoot(document.getElementById('root')).render(React.createElement(Component, {}));
