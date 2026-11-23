/* ============================================================================
 * ui.js  —  DOM helpers + the auto-generated standalone tool form.
 *
 * Layout engine (shared with workflow nodes):
 *   • input.row — group inputs on one line · input.flex — width weight
 *   • input.visibleWhen(values) — show/hide a field (empty rows collapse)
 *   • tool.onInput(name, values) — react to a change (e.g. auto-fill defaults)
 *   A socket input may be grouped; in a node the first socket of a row gets the port.
 *
 * Controls: text · textarea · number · select · checkbox · richtext (notebook).
 * Output types: 'text' (textarea) · 'number' (chip) · 'table' · 'html' (highlight).
 * ==========================================================================*/
window.MBT = window.MBT || {};

(function (MBT) {
  'use strict';
  var ui = {}, controlId = 0;

  ui.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    ui.append(node, children); return node;
  };
  ui.append = function (node, children) { if (children == null) return node; (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c == null || c === false) return; node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return node; };
  ui.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  ui.escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  ui.stripHtml = function (h) { return String(h == null ? '' : h).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); };

  /* ---- layout engine ----------------------------------------------------- */
  ui.layoutRows = function (inputs) {
    var rows = [], cur = null, curId = null;
    (inputs || []).filter(function (inp) { return inp.control !== 'internal'; }).forEach(function (inp) {
      if (!inp.row) { rows.push([inp]); cur = null; curId = null; }
      else if (inp.row === curId && cur) { cur.push(inp); }
      else { cur = [inp]; curId = inp.row; rows.push(cur); }
    });
    return rows;
  };
  ui.visible = function (input, values) { return !input.visibleWhen || !!input.visibleWhen(values); };
  // Retain the notebook formatting supported by the toolbar when restoring pasted or imported content.
  function notebookHtml(html) {
    var source = document.createElement('template'), result = document.createElement('div');
    source.innerHTML = String(html == null ? '' : html);
    function append(node, parent) {
      if (node.nodeType === 3) { parent.appendChild(document.createTextNode(node.data)); return; }
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|SVG|MATH|TEMPLATE)$/.test(node.tagName)) return;
      var tags = {B: 'b', STRONG: 'strong', MARK: 'mark', DIV: 'div', P: 'p', BR: 'br', I: 'i', EM: 'em', U: 'u', LI: 'div'};
      var tag = tags[node.tagName];
      if (!tag && node.style && node.style.backgroundColor) tag = 'mark';
      var next = tag ? document.createElement(tag) : parent;
      if (next !== parent) parent.appendChild(next);
      Array.from(node.childNodes).forEach(function (child) { append(child, next); });
    }
    Array.from(source.content.childNodes).forEach(function (child) { append(child, result); });
    return result.innerHTML;
  }
  ui.setControlValue = function (ctl, value) { if (!ctl) return; if (value && typeof value === 'object' && value.__job) value = value.out || ''; if (ctl.__edit) { var safe = notebookHtml(value); if (ctl.__edit.innerHTML !== safe) ctl.__edit.innerHTML = safe; return; } if (ctl.type === 'checkbox') { ctl.checked = !!value; return; } var text = String(value == null ? '' : value); if (ctl.value !== text) ctl.value = text; };

  /* ---- clipboard --------------------------------------------------------- */
  ui.copy = function (text) { text = String(text == null ? '' : text); if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return ui._copyFallback(text); }); return Promise.resolve(ui._copyFallback(text)); };
  ui._copyFallback = function (text) { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); return ok; };
  ui.copyButton = function (getText, label) {
    var name = label || 'Copy', timer;
    var btn = ui.el('button', {class: 'copy-btn', type: 'button', title: 'Copy to clipboard'}, name);
    btn.addEventListener('click', async function (event) {
      event.stopPropagation();
      var ok = await ui.copy(getText());
      btn.textContent = ok === false ? 'Copy failed' : 'Copied';
      clearTimeout(timer); timer = setTimeout(function () { btn.textContent = name; }, 1100);
    });
    return btn;
  };

  /* ---- table + html outputs --------------------------------------------- */
  ui.tableToText = function (v) { if (!v || !v.headers) return ''; var lines = []; if (v.caption) lines.push(v.caption); lines.push(v.headers.join('\t')); (v.rows || []).forEach(function (r) { lines.push(r.join('\t')); }); if (v.foot) lines.push(v.foot.join('\t')); return lines.join('\n'); };
  ui.renderTableInto = function (container, v) {
    ui.clear(container);
    if (!v) { container.appendChild(document.createTextNode('—')); return; }
    if (v.caption) container.appendChild(ui.el('div', { class: 'out-table-cap' }, v.caption));
    if (!v.headers) { if (!v.caption) container.appendChild(document.createTextNode('—')); return; }
    function cells(tag, arr) { return ui.el('tr', null, arr.map(function (c, i) { return ui.el(tag, { class: i ? 'num' : '' }, String(c)); })); }
    var kids = [ui.el('thead', null, cells('th', v.headers)), ui.el('tbody', null, (v.rows || []).map(function (r) { return cells('td', r); }))];
    if (v.foot) kids.push(ui.el('tfoot', null, cells('td', v.foot)));
    container.appendChild(ui.el('table', { class: 'out-table' }, kids));
  };
  ui.renderHtmlInto = function (container, html) { container.innerHTML = html == null ? '' : html; };

  /* ---- input controls ---------------------------------------------------- */
  function richControl(input, value, onChange) {
    var wrap = ui.el('div', { class: 'ctl-rich-wrap' });
    var edit = ui.el('div', { class: 'ctl ctl-rich mono', contenteditable: 'true', spellcheck: 'false' });
    edit.innerHTML = notebookHtml(value);
    edit.addEventListener('paste', function (e) { if (!e.clipboardData) return; e.preventDefault(); var rich = e.clipboardData.getData('text/html'); if (rich) document.execCommand('insertHTML', false, notebookHtml(rich)); else document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    edit.addEventListener('input', function () { onChange(edit.innerHTML); });
    function cmd(c, arg) { return function (e) { e.preventDefault(); edit.focus(); try { document.execCommand(c, false, arg); } catch (x) {} onChange(edit.innerHTML); }; }
    function tbtn(label, title, fn) { var b = ui.el('button', { class: 'rich-btn', type: 'button', title: title }, label); b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', fn); return b; }
    // highlight: yellow background + dark text so it's readable in BOTH light and dark themes
    function hi(e) { e.preventDefault(); edit.focus(); try { if (!document.execCommand('hiliteColor', false, '#ffe066')) document.execCommand('backColor', false, '#ffe066'); document.execCommand('foreColor', false, '#1a1a1a'); } catch (x) {} onChange(edit.innerHTML); }
    var fit = tbtn('↕ fit', 'Auto-fit height on/off', function (e) { e.preventDefault(); edit.classList.toggle('fit'); });
    var bar = ui.el('div', { class: 'rich-bar' }, [tbtn('B', 'Bold', cmd('bold')), tbtn('▤', 'Highlight', hi), tbtn('⌫', 'Clear formatting', cmd('removeFormat')), fit]);
    wrap.appendChild(bar); wrap.appendChild(edit);
    wrap.__edit = edit;
    return wrap;
  }
  ui.control = function (input, value, onChange) {
    var c = input.control, node;
    if (c === 'richtext') { node = richControl(input, value, onChange); }
    else if (c === 'textarea') { node = ui.el('textarea', { class: 'ctl ctl-textarea mono', placeholder: input.placeholder || '', spellcheck: 'false', rows: input.rows || 6 }); node.value = value == null ? '' : value; node.addEventListener('input', function () { onChange(node.value); }); }
    else if (c === 'select') { node = ui.el('select', { class: 'ctl ctl-select' }); (input.options || []).forEach(function (o) { var opt = ui.el('option', { value: o.value }, o.label || o.value); if (String(o.value) === String(value)) opt.selected = true; node.appendChild(opt); }); node.addEventListener('change', function () { onChange(node.value); }); }
    else if (c === 'checkbox') { node = ui.el('input', { type: 'checkbox', class: 'ctl-checkbox' }); node.checked = !!value; node.addEventListener('change', function () { onChange(node.checked); }); }
    else if (c === 'number') { node = ui.el('input', { type: 'number', class: 'ctl ctl-number', placeholder: input.placeholder || '' }); if (input.min != null) node.min = input.min; if (input.max != null) node.max = input.max; if (input.step != null) node.step = input.step; node.value = value == null ? '' : value; node.addEventListener('input', function () { onChange(node.value === '' ? '' : Number(node.value)); }); }
    else { node = ui.el('input', { type: 'text', class: 'ctl ctl-text mono', placeholder: input.placeholder || '', spellcheck: 'false' }); node.value = value == null ? '' : value; node.addEventListener('input', function () { onChange(node.value); }); }
    node.id = 'field-' + (++controlId); node.dataset.inputName = input.name; (node.__edit || node).setAttribute('aria-label', input.label || input.name); return node;
  };
  ui.defaultValue = function (input) { if (input.default != null) return input.default; if (input.control === 'checkbox') return false; if (input.control === 'select') return (input.options && input.options[0] && input.options[0].value) || ''; return ''; };
  ui.label = function (input, ctl) { return ui.el('label', { class: 'field-label', for: ctl.id }, [input.label || input.name, input.socket ? ui.el('span', { class: 'type-tag', title: 'Data type' }, input.type) : null]); };
  ui.codeBlock = function (code) { return ui.el('div', { class: 'code-wrap' }, [ui.el('div', { class: 'code-head' }, [ui.el('span', { class: 'muted' }, 'Core logic'), ui.copyButton(function () { return code; })]), ui.el('pre', { class: 'code-block' }, ui.el('code', null, code))]); };

  /* ---- standalone tool form --------------------------------------------- */
  ui.renderToolForm = function (tool, mount) {
    ui.clear(mount);
    var values = {};
    tool.inputs.forEach(function (inp) { values[inp.name] = ui.defaultValue(inp); });
    var outputsWrap = ui.el('div', { class: 'tool-outputs' }), outputViews = {}, fields = [];
    var inputsWrap = ui.el('div', { class: 'tool-inputs' }), refreshControls, rangePanels = [];

    function recompute() { rangePanels.forEach(function (r) { r.update(); }); if (refreshControls) refreshControls(values); var res = MBT.run(tool, values); tool.outputs.forEach(function (out) { outputViews[out.name].set(res.ok ? res.outputs[out.name] : '', res.ok ? null : res.error, res.outputs); }); }
    function onChange(inp, v) {
      values[inp.name] = v;
      if (tool.onInput) tool.onInput(inp.name, values);
      fields.forEach(function (x) { if (x.inp.name !== inp.name) ui.setControlValue(x.ctl, values[x.inp.name]); });
      updateVisibility(); recompute();
    }
    function updateVisibility() {
      fields.forEach(function (x) { x.f.style.display = ui.visible(x.inp, values) ? '' : 'none'; });
      Array.prototype.forEach.call(inputsWrap.querySelectorAll('.field-row'), function (r) { var any = Array.prototype.some.call(r.children, function (c) { return c.style.display !== 'none'; }); r.style.display = any ? '' : 'none'; });
    }

    var advWrap = null;
    ui.layoutRows(tool.inputs).forEach(function (rowInputs) {
      var rowEl = ui.el('div', { class: 'field-row' });
      rowInputs.forEach(function (inp) {
        var ctl = ui.control(inp, values[inp.name], function (v) { onChange(inp, v); });
        var f = ui.el('div', { class: 'field field-' + inp.control }, [ui.label(inp, ctl), ctl, inp.control === 'textarea' || ctl.__edit ? ui.fieldGrip(ctl.__edit || ctl, {label: inp.label}) : null, inp.hint ? ui.el('div', { class: 'field-hint' }, inp.hint) : null]);
        if (inp.control === 'textarea') {
          var range = ui.rangeCopy(function () { return ctl.value; }, inp.label); f.appendChild(range); rangePanels.push(range);
        }
        f.style.flex = (inp.flex || 1) + ' 1 0'; rowEl.appendChild(f); fields.push({ inp: inp, f: f, ctl: ctl });
      });
      if (rowInputs.every(function (i) { return i.advanced; })) {
        if (!advWrap) { advWrap = ui.el('details', { class: 'wf-adv' }, ui.el('summary', null, 'More options')); }
        advWrap.appendChild(rowEl);
      } else { inputsWrap.appendChild(rowEl); }
    });
    if (advWrap) inputsWrap.appendChild(advWrap);

    if (tool.controls) refreshControls = tool.controls(inputsWrap, function () { return values; }, function (name, value) { values[name] = value; recompute(); });
    tool.outputs.forEach(function (out) {
      var valueEl, getText, setter, lastTable = null;
      if (out.type === 'number') { valueEl = ui.el('div', { class: 'out-number' }, '—'); getText = function () { return valueEl.textContent; }; setter = function (v, err) { var blank = (v === '' || v == null || (typeof v === 'number' && isNaN(v))); valueEl.textContent = err ? ('⚠ ' + err) : (blank ? '—' : v); }; }
      else if (out.type === 'table') { valueEl = ui.el('div', { class: 'out-table-wrap' }); getText = function () { return ui.tableToText(lastTable); }; setter = function (v, err) { if (err) { ui.clear(valueEl); valueEl.appendChild(document.createTextNode('⚠ ' + err)); } else { lastTable = v; ui.renderTableInto(valueEl, v); } }; }
      else if (out.type === 'html') { valueEl = ui.el('div', { class: 'out-html' }); getText = function () { return valueEl.textContent; }; setter = function (v, err) { if (err) valueEl.textContent = '⚠ ' + err; else ui.renderHtmlInto(valueEl, v); }; }
      else { valueEl = ui.el('textarea', { class: 'out-text mono', readonly: 'readonly', rows: 5, spellcheck: 'false' }); getText = function () { return valueEl.value; }; setter = function (v, err) { valueEl.value = err ? ('⚠ ' + err) : (v == null ? '' : v); }; }
      var viewer = out.viewer === 'matches' ? ui.matchViewer(valueEl) : null;
      if (viewer) getText = function () { return outputViews[out.name].sequence || ''; };
      valueEl.setAttribute('aria-label', out.label || out.name);
      var range = (out.type === 'text' || viewer) ? ui.rangeCopy(getText, out.label) : null;
      if (viewer) valueEl.title = 'Sequence context. The main Copy button copies the full sequence.';
      outputsWrap.appendChild(ui.el('div', {class: 'output'}, [
        ui.el('div', {class: 'output-head'}, [ui.el('span', {class: 'output-label'}, out.label || out.name), ui.copyButton(getText)]),
        viewer ? viewer.bar : null, valueEl, out.type !== 'number' ? ui.fieldGrip(valueEl, {label: out.label}) : null, range]));
      outputViews[out.name] = {set: function (v, err, outputs) {
        if (viewer) { var data = outputs && outputs.view; this.sequence = data && data.seq; viewer.update(data); }
        else setter(v, err);
        if (range) range.update();
      }};
    });

    if (tool.buttons && tool.buttons.length) {
      var status = ui.el('div', {class: 'wf-node-status', role: 'status'});
      tool.buttons.forEach(function (action) {
        outputsWrap.appendChild(ui.el('button', {type: 'button', class: 'btn btn-sm', title: action.title || '',
          onclick: function () { action.onClick({inputs: values, outputs: MBT.run(tool, values).outputs,
            setStatus: function (html) { status.innerHTML = html; }}); }}, action.label));
      });
      outputsWrap.appendChild(status);
    }
    mount.appendChild(ui.el('div', { class: 'tool-grid' }, [
      ui.el('div', { class: 'panel' }, [ui.el('h3', { class: 'panel-title' }, 'Input'), inputsWrap]),
      ui.el('div', { class: 'panel' }, [ui.el('h3', { class: 'panel-title' }, 'Output'), outputsWrap])
    ]));
    updateVisibility(); recompute();
    return { values: values, recompute: recompute };
  };

  MBT.ui = ui;
})(window.MBT);
