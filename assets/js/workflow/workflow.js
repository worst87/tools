/* ============================================================================
 * workflow.js  —  Node-based workflow builder ("geometry nodes for DNA").
 *
 * Each node wraps a tool's compute() — zero duplicated logic.
 *   • compact rows (input.row/flex), conditional fields (visibleWhen),
 *     reactive defaults (tool.onInput). A row's first socket gets the port.
 *   • RESIZE (one mechanism): click a node to select it (it becomes the
 *     "primary") and drag ANY border/corner. E/W set the node width; N/S grow
 *     the resizable boxes (textareas, rich editor, text/table/html outputs).
 *     Bare number outputs stay fixed. A header ↺ resets size to default.
 *   • drag a node by header or empty body; MIDDLE-mouse drag pans anywhere.
 *   • outputs render as text / number / table / html(highlight); click to copy.
 *   • scroll a scrollable box to scroll it, else zoom (zooms into the node).
 *   • editable wired inputs · multi-select + Ctrl+C/V · drop .json · projects · colours
 * ==========================================================================*/
(function (MBT) {
  'use strict';
  var ui = MBT.ui, el = ui.el;
  var DEFAULT_W = 296, DEFAULT_OUTH = 96, ZMIN = 0.25, ZMAX = 2.5;
  var DRAG_IGNORE = 'input,textarea,select,button,a,.wf-port,.wf-out-val,.out-table-wrap,.out-html,.ctl-rich,.ctl-rich-wrap,.copy-btn,.wf-rz,.wf-node-status,.match-nav,.reference-controls,.range-copy,summary,label';
  var RZ_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  var TEXT_DEF = {
    id: '__text__', name: 'Text / Sequence Input', category: 'Input',
    inputs: [{ name: 'text', label: 'Text', control: 'textarea', rows: 5, socket: false, type: 'text', placeholder: 'Paste or type a sequence…' }],
    outputs: [{ name: 'text', label: 'Text', type: 'text' }],
    compute: function (inp) { return { text: inp.text == null ? '' : inp.text }; }
  };
  function getDef(node) { if (node.toolId === '__text__') return TEXT_DEF; if (node.toolId === '__note__') return null; return MBT.getTool(node.toolId); }
  var CAT_CLASS = { 'Cleanup & Format': 'cat-clean', 'Sequence Tools': 'cat-seq', 'Calculators': 'cat-calc' };
  // Coding-canvas categories each get their own colour so they're easy to spot.
  var CODE_CAT_CLASS = { 'Paths': 'cat-path', 'FASTQ': 'cat-fastq', 'Reads / QC': 'cat-reads', 'Align': 'cat-align', 'Loop': 'cat-loop', 'BAM / SAM': 'cat-bam', 'QC / Trim': 'cat-qc', 'Docker': 'cat-docker', 'Output': 'cat-output' };
  function catClass(node) {
    if (node.toolId === '__text__') return 'cat-input';
    if (node.toolId === '__note__') return 'cat-note';
    var def = getDef(node); if (!def) return 'cat-code';
    if (def.group === 'code') return CODE_CAT_CLASS[def.category] || 'cat-code';
    return CAT_CLASS[def.category] || 'cat-code';
  }

  /* ---- state ------------------------------------------------------------- */
  var graph = { nodes: {}, wires: [] };
  var nextId = 1, panX = 60, panY = 40, scale = 1, addOffset = 0;
  var selected = {}, primaryId = null, clipboard = null, lastMouseX = 0, lastMouseY = 0;
  var canvas, world, svg, tempPath, drag = null, docBound = false;
  var undoStack = [], redoStack = [];
  var store = null, currentId = null, pendingAnchorNote = null, els = {};
  // Per-canvas config, set by mount(): which tool group to show, the localStorage
  // key for its saved workspaces, an optional demo builder, and a UI label.
  var GROUP = 'bio', PKEY = 'mbt-wf-projects', DEMO = null, LABEL = 'Workflow';

  function uid(p) { return p + (nextId++); }
  function pid() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function stringify(v) { if (v == null) return ''; if (typeof v === 'number') return isNaN(v) ? '' : String(v); if (typeof v === 'object' && v.__job) return v.out == null ? '' : String(v.out); if (typeof v === 'object' && v.headers) return ui.tableToText(v); return String(v); }
  // Hover tooltip for a node input: what to enter, its default, required/optional.
  function fieldTip(inp) {
    var bits = []; if (inp.hint) bits.push(inp.hint);
    if (inp.default !== undefined && inp.default !== '' && inp.default !== null && inp.control !== 'checkbox') bits.push('Default: ' + inp.default);
    bits.push(inp.required ? 'Required' : 'Optional');
    return bits.join('  ·  ');
  }
  function log(m) { if (MBT.log) MBT.log.event(m); }

  /* ---- graph ops --------------------------------------------------------- */
  function addNode(toolId, x, y, values) {
    var node = { id: uid('n'), toolId: toolId, x: x, y: y, values: {}, note: '', anchor: null, dx: 0, dy: 0, width: null, outH: null, fontScale: null, outputs: {} };
    var def = getDef(node);
    if (def) def.inputs.forEach(function (inp) { node.values[inp.name] = ui.defaultValue(inp); });
    if (values) Object.keys(values).forEach(function (k) { node.values[k] = values[k]; });
    graph.nodes[node.id] = node; return node;
  }
  function removeNode(id) {
    graph.wires.forEach(function (w) { if (w.from.node === id) bakeInput(w.to.node, w.to.port); });
    delete graph.nodes[id];
    graph.wires = graph.wires.filter(function (w) { return w.from.node !== id && w.to.node !== id; });
    Object.keys(graph.nodes).forEach(function (k) { if (graph.nodes[k].anchor === id) graph.nodes[k].anchor = null; });
    delete selected[id]; if (primaryId === id) primaryId = null;
  }
  function isConnected(nodeId, io, port) { return graph.wires.some(function (w) { return io === 'in' ? (w.to.node === nodeId && w.to.port === port) : (w.from.node === nodeId && w.from.port === port); }); }
  function incomingWire(nodeId, port) { return graph.wires.find(function (w) { return w.to.node === nodeId && w.to.port === port; }); }
  function resolveInput(node, port) { var w = incomingWire(node.id, port); if (!w) return node.values[port]; var up = graph.nodes[w.from.node]; return up && up.outputs ? up.outputs[w.from.port] : ''; }
  function bakeInput(nodeId, port) { var node = graph.nodes[nodeId]; if (!node) return; var v = resolveInput(node, port); node.values[port] = (typeof v === 'number') ? v : stringify(v); }
  function reaches(start, target) { var seen = {}, stack = [start]; while (stack.length) { var n = stack.pop(); if (n === target) return true; if (seen[n]) continue; seen[n] = 1; graph.wires.forEach(function (w) { if (w.from.node === n) stack.push(w.to.node); }); } return false; }
  function wouldCycle(fromNode, toNode) { return fromNode === toNode || reaches(toNode, fromNode); }
  function addWire(from, to, type) { var ex = incomingWire(to.node, to.port); if (ex) graph.wires = graph.wires.filter(function (w) { return w.id !== ex.id; }); graph.wires.push({ id: uid('w'), from: from, to: to, type: type }); }
  function removeWire(id) { graph.wires = graph.wires.filter(function (w) { return w.id !== id; }); }

  /* ---- evaluation -------------------------------------------------------- */
  function topoOrder() {
    var ids = Object.keys(graph.nodes), indeg = {};
    ids.forEach(function (i) { indeg[i] = 0; });
    graph.wires.forEach(function (w) { if (indeg[w.to.node] != null) indeg[w.to.node]++; });
    var queue = ids.filter(function (i) { return indeg[i] === 0; }), order = [];
    while (queue.length) { var n = queue.shift(); order.push(n); graph.wires.forEach(function (w) { if (w.from.node === n && --indeg[w.to.node] === 0) queue.push(w.to.node); }); }
    ids.forEach(function (i) { if (order.indexOf(i) === -1) order.push(i); });
    return order;
  }
  function evaluate() {
    topoOrder().forEach(function (id) {
      var node = graph.nodes[id], def = getDef(node);
      if (!def) { node.outputs = {}; return; }
      var inputs = {}; def.inputs.forEach(function (inp) { inputs[inp.name] = resolveInput(node, inp.name); });
      if (node._inputs && def.inputs.every(function (i) { return inputs[i.name] === node._inputs[i.name]; })) return;
      node._inputs = inputs;
      var res = MBT.run(def, inputs); node.outputs = res.ok ? res.outputs : {}; node._error = res.ok ? null : res.error;
    });
  }

  /* ---- undo / redo ------------------------------------------------------- */
  function snapshot() { undoStack.push(JSON.stringify(serializeGraph())); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; updateHistoryButtons(); }
  function restore(json) { loadGraph(JSON.parse(json)); rebuildAll(); applyTransform(); scheduleSave(); }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(serializeGraph())); restore(undoStack.pop()); updateHistoryButtons(); log('Undo'); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(serializeGraph())); restore(redoStack.pop()); updateHistoryButtons(); log('Redo'); }
  function updateHistoryButtons() { if (els.undo) els.undo.disabled = !undoStack.length; if (els.redo) els.redo.disabled = !redoStack.length; }

  /* ---- rendering --------------------------------------------------------- */
  function typeTag(t) { return el('span', { class: 'type-tag' }, t); }
  function makePort(node, io, portDef) {
    var p = el('div', { class: 'wf-port ' + io + ' ' + portDef.type });
    p.dataset.node = node.id; p.dataset.port = portDef.name; p.dataset.io = io; p.dataset.type = portDef.type;
    if (isConnected(node.id, io, portDef.name)) p.classList.add('connected');
    p.addEventListener('pointerdown', onPortDown);
    return p;
  }
  function nodeHead(node, title) {
    var btns = [];
    if (node.toolId === '__note__') {
      var anchored = !!(node.anchor && graph.nodes[node.anchor]);
      var ab = el('button', { class: 'wf-node-btn', type: 'button', title: anchored ? 'Unlink from node' : 'Anchor to a node (then click a node)' }, anchored ? '⛓' : '🔗');
      ab.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      ab.addEventListener('click', function (e) { e.stopPropagation(); if (anchored) { snapshot(); node.anchor = null; rebuildAll(); } else { pendingAnchorNote = node.id; canvas.classList.add('wf-pickmode'); log('Pick a node to anchor the note'); } });
      btns.push(ab);
    }
    var rs = el('button', { class: 'wf-node-btn', type: 'button', title: 'Reset size to default' }, '↺');
    rs.addEventListener('mousedown', function (e) { e.stopPropagation(); }); rs.addEventListener('click', function (e) { e.stopPropagation(); snapshot(); node.width = null; node.outH = null; node.fontScale = null; node.fieldHeights = {}; rebuildAll(); scheduleSave(); log('Reset node size'); }); btns.push(rs);
    var del = el('button', { class: 'wf-node-del', type: 'button', title: 'Delete node' }, '×');
    del.addEventListener('mousedown', function (e) { e.stopPropagation(); }); del.addEventListener('click', function (e) { e.stopPropagation(); snapshot(); removeNode(node.id); rebuildAll(); log('Removed node'); }); btns.push(del);
    return el('div', { class: 'wf-node-head' }, [el('span', { class: 'cat-dot' }), el('span', { class: 'title' }, title)].concat(btns));
  }
  function addResizeHandles(box, node) { RZ_DIRS.forEach(function (dir) { var d = el('div', { class: 'wf-rz wf-rz-' + dir, title: 'Drag to resize' }); d.addEventListener('pointerdown', function (e) { startResize(node, e, dir); }); box.appendChild(d); }); }
  function onInputChange(node, inp, v) {
    beginEdit();
    if (inp.socket && isConnected(node.id, 'in', inp.name)) { var w = incomingWire(node.id, inp.name); if (w) { removeWire(w.id); var p = findPortEl(node.id, 'in', inp.name); if (p) p.classList.remove('connected'); if (node._allCtl[inp.name]) node._allCtl[inp.name].classList.remove('linked'); redrawWires(); log('Detached ' + node.id + '.' + inp.name + ' (edited)'); } }
    node.values[inp.name] = v;
    var def = getDef(node);
    if (def && def.onInput) { def.onInput(inp.name, node.values); Object.keys(node._allCtl).forEach(function (nm) { if (nm !== inp.name) ui.setControlValue(node._allCtl[nm], node.values[nm]); }); }
    onValueEdit();
  }
  function grip(node, field, key, label) {
    node.fieldHeights = node.fieldHeights || {};
    return ui.fieldGrip(field, {label: label, height: node.fieldHeights[key], scale: function () { return scale; },
      change: function (height) {
        if (height == null) delete node.fieldHeights[key]; else node.fieldHeights[key] = height;
        redrawWires(); scheduleSave();
      }});
  }
  function resolved(node, def) {
    var v = {}; def.inputs.forEach(function (inp) { v[inp.name] = resolveInput(node, inp.name); }); return v;
  }
  function renderNode(node) {
    var def = getDef(node);
    var box = el('div', { class: 'wf-node ' + catClass(node) + (selected[node.id] ? ' selected' : '') + (primaryId === node.id ? ' primary' : '') });
    box.style.left = node.x + 'px'; box.style.top = node.y + 'px';
    if (node.width) box.style.width = node.width + 'px';
    box.dataset.node = node.id;                                   // for ctrl+scroll text-zoom lookup
    if (node.fontScale) box.style.setProperty('--wf-fs', node.fontScale);
    node._box = box; node._ranges = []; node._outEls = {}; node._outKinds = {}; node._allCtl = {}; node._growEls = []; node._cells = []; node._inrows = [];
    box.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; if (e.target.closest(DRAG_IGNORE)) return; startNodeDrag(node, e); });

    if (node.toolId === '__note__') {
      box.appendChild(nodeHead(node, 'Note'));
      var ta = el('textarea', { placeholder: 'Comment…', spellcheck: 'false' }); ta.value = node.note || '';
      ta.addEventListener('input', function () { beginEdit(); node.note = ta.value; scheduleSave(); });
      box.appendChild(ta); node._growEls.push({ el: ta, prop: 'height' });
      if (node.outH) ta.style.height = node.outH + 'px';
      box.appendChild(grip(node, ta, 'note', 'note'));
      addResizeHandles(box, node); world.appendChild(box); return;
    }

    box.appendChild(nodeHead(node, def.name));
    var body = el('div', { class: 'wf-node-body' });

    var advWrap = null;   // collapsible "More options" holder for advanced inputs
    ui.layoutRows(def.inputs).forEach(function (rowInputs) {
      var rowEl = el('div', { class: 'wf-inrow' });
      var socketInput = null; rowInputs.forEach(function (i) { if (i.socket && !socketInput) socketInput = i; });
      if (socketInput) { rowEl.classList.add('has-port'); rowEl.appendChild(makePort(node, 'in', socketInput)); }
      rowInputs.forEach(function (inp) {
        var connected = inp.socket && isConnected(node.id, 'in', inp.name);
        var ctl = ui.control(inp, node.values[inp.name], function (v) { onInputChange(node, inp, v); });
        if (connected) ctl.classList.add('linked');
        node._allCtl[inp.name] = ctl;
        // Growable inputs (multi-line text editors) follow the node's drag-resize height.
        if (inp.control === 'textarea') { node._growEls.push({ el: ctl, prop: 'height' }); if (node.outH) ctl.style.height = node.outH + 'px'; }
        else if (ctl.__edit) { node._growEls.push({ el: ctl.__edit, prop: 'height' }); if (node.outH) ctl.__edit.style.height = node.outH + 'px'; }
        var reqMark = inp.required ? el('span', { class: 'wf-req', title: 'Required' }, '*') : null;
        var labelEl = el('label', { class: 'wf-port-label', for: ctl.id }, [inp.label || inp.name, reqMark, inp.socket ? typeTag(inp.type) : null]);
        var cell = el('div', { class: 'wf-cell', title: fieldTip(inp) }, [labelEl, ctl, inp.control === 'textarea' || ctl.__edit ? grip(node, ctl.__edit || ctl, 'in-' + inp.name, inp.label) : null]);
        if (inp.control === 'textarea') {
          var range = ui.rangeCopy(function () { return ctl.value; }, inp.label); cell.appendChild(range); node._ranges.push(range);
        }
        cell.style.flex = (inp.flex || 1) + ' 1 0'; rowEl.appendChild(cell); node._cells.push({ inp: inp, el: cell });
      });
      node._inrows.push(rowEl);
      // A whole row of advanced-only inputs collapses into "More options".
      if (rowInputs.every(function (i) { return i.advanced; })) {
        if (!advWrap) { advWrap = el('details', { class: 'wf-adv' }); var sm = el('summary', null, 'More options'); sm.addEventListener('mousedown', function (e) { e.stopPropagation(); }); advWrap.appendChild(sm); }
        advWrap.appendChild(rowEl);
      } else { body.appendChild(rowEl); }
    });
    if (advWrap) { advWrap.addEventListener('toggle', redrawWires); body.appendChild(advWrap); }
    if (def.controls) node._refreshControls = def.controls(body, function () { return resolved(node, def); }, function (name, value) {
      beginEdit(); node.values[name] = value; onValueEdit();
    });

    def.outputs.forEach(function (out) {
      var row = el('div', { class: 'wf-row out' });
      row.appendChild(makePort(node, 'out', out));
      // A bare number is one short value — it is never resizable. Text / table /
      // html outputs hold variable-length content, so they grow with the node.
      var growable = out.type !== 'number';
      var valEl = out.type === 'table' ? el('div', { class: 'wf-out-val out-table-wrap' })
        : out.type === 'html' ? el('div', { class: 'wf-out-val out-html' })
        : out.type === 'number' ? el('div', { class: 'wf-out-val wf-out-num empty' }, '—')
        : el('div', { class: 'wf-out-val empty' }, '—');
      if (growable) { if (node.outH) { valEl.style.height = node.outH + 'px'; valEl.style.maxHeight = 'none'; } node._growEls.push({ el: valEl, prop: 'height' }); }
      node._outEls[out.name] = valEl; node._outKinds[out.name] = out.type;
      var getText = function () { var v = node.outputs[out.name]; return out.type === 'table' ? ui.tableToText(v) : out.type === 'html' ? valEl.textContent : stringify(v); };
      var viewer = out.viewer === 'matches' ? ui.matchViewer(valEl) : null;
      if (viewer) { valEl._viewer = viewer; getText = function () { return node.outputs.view ? node.outputs.view.seq : ''; }; }
      row.appendChild(el('div', { class: 'wf-out-head' }, [el('span', { class: 'wf-port-label' }, [typeTag(out.type), out.label || out.name]), ui.copyButton(getText)]));
      if (viewer) row.appendChild(viewer.bar);
      row.appendChild(valEl);
      if (growable) row.appendChild(grip(node, valEl, 'out-' + out.name, out.label));
      if (out.type === 'text' || viewer) {
        var range = ui.rangeCopy(getText, out.label); row.appendChild(range); node._ranges.push(range);
      }
      body.appendChild(row);
    });

    // Tool-defined action buttons (e.g. the Script node's "Scan for problems").
    // onClick gets the node's resolved inputs and a setStatus(html) to report back.
    if (def.buttons && def.buttons.length) {
      var statusEl = el('div', { class: 'wf-node-status' });
      var brow = el('div', { class: 'wf-row wf-btn-row' });
      def.buttons.forEach(function (bt) {
        var b = el('button', { class: 'btn btn-sm', type: 'button', title: bt.title || '' }, bt.label);
        b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var inputs = {}; def.inputs.forEach(function (inp) { inputs[inp.name] = resolveInput(node, inp.name); });
          try { bt.onClick({ node: node, inputs: inputs, outputs: node.outputs, setStatus: function (html) { statusEl.innerHTML = html; } }); }
          catch (err) { statusEl.textContent = 'Scan error: ' + err.message; }
        });
        brow.appendChild(b);
      });
      body.appendChild(brow); body.appendChild(statusEl);
    }

    box.appendChild(body);
    addResizeHandles(box, node);
    world.appendChild(box);
  }
  function updateNodeVisibility(node) {
    if (!node._cells) return;
    node._ranges.forEach(function (range) { range.update(); });
    if (node._refreshControls) node._refreshControls(resolved(node, getDef(node)));
    node._cells.forEach(function (c) { c.el.style.display = ui.visible(c.inp, node.values) ? '' : 'none'; });
    node._inrows.forEach(function (r) { var cells = r.querySelectorAll('.wf-cell'); if (!cells.length) return; var any = Array.prototype.some.call(cells, function (c) { return c.style.display !== 'none'; }); r.style.display = any ? '' : 'none'; });
  }
  function rebuildAll() {
    Array.prototype.slice.call(world.querySelectorAll('.wf-node')).forEach(function (n) { n.remove(); });
    Object.keys(graph.nodes).forEach(function (id) { renderNode(graph.nodes[id]); });
    evaluate(); updateDisplays();
    Object.keys(graph.nodes).forEach(function (id) { updateNodeVisibility(graph.nodes[id]); });
    if (els.status) els.status.textContent = Object.keys(graph.nodes).length + ' nodes · ' + graph.wires.length + ' connections';
    redrawWires(); scheduleSave();
  }
  function updateDisplays() {
    Object.keys(graph.nodes).forEach(function (id) {
      var node = graph.nodes[id];
      if (node._outEls) Object.keys(node._outEls).forEach(function (name) {
        var kind = node._outKinds ? node._outKinds[name] : 'text', v = node.outputs ? node.outputs[name] : '', e = node._outEls[name];
        if (node._error) { e.textContent = node._error; delete e._last; return; }
        if (e._viewer) { e._viewer.update(node.outputs && node.outputs.view); return; }
        if (Object.prototype.hasOwnProperty.call(e, '_last') && Object.is(e._last, v)) return;
        e._last = v;
        if (kind === 'table') ui.renderTableInto(e, v);
        else if (kind === 'html') e.innerHTML = (v == null ? '' : v);
        else { var s = stringify(v); e.textContent = s === '' ? '—' : s; e.classList.toggle('empty', s === ''); }
      });
      if (node._allCtl) Object.keys(node._allCtl).forEach(function (name) { if (!isConnected(id, 'in', name)) return; var ctl = node._allCtl[name]; if (ctl === document.activeElement || (ctl.__edit && ctl.__edit === document.activeElement)) return; ui.setControlValue(ctl, resolveInput(node, name)); });
    });
  }
  function onValueEdit() { evaluate(); updateDisplays(); Object.keys(graph.nodes).forEach(function (id) { updateNodeVisibility(graph.nodes[id]); }); redrawWires(); scheduleSave(); }

  /* ---- wires (SVG) ------------------------------------------------------- */
  function svgEl(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
  function portCenter(elx) { var r = elx.getBoundingClientRect(), wr = world.getBoundingClientRect(); return { x: (r.left + r.width / 2 - wr.left) / scale, y: (r.top + r.height / 2 - wr.top) / scale }; }
  function boxCenter(b) { var r = b.getBoundingClientRect(), wr = world.getBoundingClientRect(); return { x: (r.left + r.width / 2 - wr.left) / scale, y: (r.top + r.height / 2 - wr.top) / scale }; }
  function findPortEl(nodeId, io, port) { return world.querySelector('.wf-port.' + io + '[data-node="' + nodeId + '"][data-port="' + port + '"]'); }
  function wirePath(x1, y1, x2, y2) { var dx = Math.max(40, Math.abs(x2 - x1) * 0.4); return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2; }
  function redrawWires() {
    Array.prototype.slice.call(svg.querySelectorAll('.wf-wire, .wf-anchor-line')).forEach(function (p) { p.remove(); });
    graph.wires.forEach(function (w) {
      var a = findPortEl(w.from.node, 'out', w.from.port), b = findPortEl(w.to.node, 'in', w.to.port);
      if (!a || !b) return;
      var p1 = portCenter(a), p2 = portCenter(b);
      var path = svgEl('path', { class: 'wf-wire ' + (w.type || 'text'), d: wirePath(p1.x, p1.y, p2.x, p2.y) });
      path.style.pointerEvents = 'stroke'; path.style.cursor = 'pointer';
      path.addEventListener('click', function () { snapshot(); bakeInput(w.to.node, w.to.port); removeWire(w.id); rebuildAll(); log('Removed connection'); });
      path.addEventListener('mouseenter', function () { path.style.strokeWidth = '4'; });
      path.addEventListener('mouseleave', function () { path.style.strokeWidth = ''; });
      var t = svgEl('title'); t.textContent = 'Click to remove connection'; path.appendChild(t); svg.appendChild(path);
    });
    Object.keys(graph.nodes).forEach(function (id) { var n = graph.nodes[id]; if (n.toolId === '__note__' && n.anchor && graph.nodes[n.anchor] && n._box && graph.nodes[n.anchor]._box) { var c1 = boxCenter(n._box), c2 = boxCenter(graph.nodes[n.anchor]._box); svg.appendChild(svgEl('path', { class: 'wf-anchor-line', d: 'M ' + c1.x + ' ' + c1.y + ' L ' + c2.x + ' ' + c2.y })); } });
  }

  /* ---- drag -------------------------------------------------------------- */
  function toWorld(cx, cy) { var wr = world.getBoundingClientRect(); return { x: (cx - wr.left) / scale, y: (cy - wr.top) / scale }; }
  function positionNode(n) { if (n._box) { n._box.style.left = n.x + 'px'; n._box.style.top = n.y + 'px'; } }
  function startNodeDrag(node, e) {
    if (e.button !== 0) return;
    if (pendingAnchorNote) { var note = graph.nodes[pendingAnchorNote]; if (note && node.toolId !== '__note__' && node.id !== pendingAnchorNote) { snapshot(); note.anchor = node.id; note.dx = note.x - node.x; note.dy = note.y - node.y; } pendingAnchorNote = null; canvas.classList.remove('wf-pickmode'); rebuildAll(); e.preventDefault(); return; }
    e.preventDefault();
    if (e.shiftKey) { toggleSelection(node.id); return; }
    if (!selected[node.id]) setSelection([node.id]);
    else { primaryId = node.id; refreshSelectedClasses(); }
    var movers = Object.keys(selected).map(function (k) { return graph.nodes[k]; }).filter(Boolean);
    var notes = Object.keys(graph.nodes).map(function (k) { return graph.nodes[k]; }).filter(function (n) { return n.toolId === '__note__' && n.anchor && selected[n.anchor] && !selected[n.id]; });
    drag = { mode: 'node', origins: movers.concat(notes).map(function (n) { return { node: n, ox: n.x, oy: n.y }; }), sx: e.clientX, sy: e.clientY, moved: false, single: node };
  }
  function startResize(node, e, dir) { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); setSelection([node.id]); drag = { mode: 'resize', node: node, dir: dir, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, ow: node.width || (node._box ? node._box.offsetWidth : DEFAULT_W), oh: node.outH || DEFAULT_OUTH, moved: false }; }
  function startPan(e) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, opx: panX, opy: panY }; canvas.classList.add('panning'); }
  function startWireDrag(portEl) { drag = { mode: 'wire', fromNode: portEl.dataset.node, fromPort: portEl.dataset.port, fromType: portEl.dataset.type, fromEl: portEl }; tempPath.style.display = ''; tempPath.setAttribute('class', 'wf-wire wf-wire-temp ' + portEl.dataset.type); }
  function onPortDown(e) { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); if (this.dataset.io === 'out') { startWireDrag(this); return; } var w = incomingWire(this.dataset.node, this.dataset.port); if (w) { var fn = w.from.node, fp = w.from.port; snapshot(); bakeInput(w.to.node, w.to.port); removeWire(w.id); rebuildAll(); var src = findPortEl(fn, 'out', fp); if (src) startWireDrag(src); } }
  function onMouseMove(e) {
    if (!drag) return;
    if (drag.mode === 'node') {
      var dxw = (e.clientX - drag.sx) / scale, dyw = (e.clientY - drag.sy) / scale;
      if (!drag.moved) { if (Math.abs(dxw) + Math.abs(dyw) < 3 / scale) return; snapshot(); drag.moved = true; }
      drag.origins.forEach(function (o) { o.node.x = o.ox + dxw; o.node.y = o.oy + dyw; positionNode(o.node); });
      if (drag.single.toolId === '__note__' && drag.single.anchor && graph.nodes[drag.single.anchor]) { var an = graph.nodes[drag.single.anchor]; drag.single.dx = drag.single.x - an.x; drag.single.dy = drag.single.y - an.y; }
      redrawWires();
    } else if (drag.mode === 'resize') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      var dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale, dir = drag.dir, n = drag.node;
      if (dir.indexOf('e') >= 0) n.width = clamp(drag.ow + dx, 180, 1000);
      if (dir.indexOf('w') >= 0) { var w = clamp(drag.ow - dx, 180, 1000); n.x = drag.ox + (drag.ow - w); n.width = w; }
      if (dir.indexOf('s') >= 0) n.outH = clamp(drag.oh + dy, 40, 1400);
      if (dir.indexOf('n') >= 0) { var h = clamp(drag.oh - dy, 40, 1400); n.y = drag.oy + (drag.oh - h); n.outH = h; }
      if (n.width) n._box.style.width = n.width + 'px';
      n._box.style.left = n.x + 'px'; n._box.style.top = n.y + 'px';
      if (n.outH && /[ns]/.test(dir)) {
        n.fieldHeights = {};
        n._growEls.forEach(function (g) { g.el.style.height = n.outH + 'px'; g.el.style.maxHeight = 'none'; });
      }
      redrawWires();
    } else if (drag.mode === 'pan') { panX = drag.opx + (e.clientX - drag.sx); panY = drag.opy + (e.clientY - drag.sy); applyTransform(); }
    else if (drag.mode === 'wire') { var a = portCenter(drag.fromEl), m = toWorld(e.clientX, e.clientY); tempPath.setAttribute('d', wirePath(a.x, a.y, m.x, m.y)); }
  }
  function onMouseUp(e) {
    if (!drag) return;
    if (drag.mode === 'wire') {
      var target = document.elementFromPoint(e.clientX, e.clientY);
      var port = target && target.closest ? target.closest('.wf-port.in') : null;
      if (port && port.dataset.node !== drag.fromNode && port.dataset.type === drag.fromType && !wouldCycle(drag.fromNode, port.dataset.node)) { snapshot(); addWire({ node: drag.fromNode, port: drag.fromPort }, { node: port.dataset.node, port: port.dataset.port }, drag.fromType); rebuildAll(); log('Connected ' + drag.fromNode + '.' + drag.fromPort + ' → ' + port.dataset.node + '.' + port.dataset.port); }
      tempPath.style.display = 'none';
    }
    if (drag.mode === 'node' || drag.mode === 'resize') { redrawWires(); scheduleSave(); }
    if (drag.mode === 'pan') scheduleSave();
    canvas.classList.remove('panning'); drag = null;
  }
  var editGuard = false;
  function beginEdit() { if (!editGuard) { snapshot(); editGuard = true; setTimeout(function () { editGuard = false; }, 700); } }

  /* ---- selection / copy-paste ------------------------------------------- */
  function refreshSelectedClasses() { Object.keys(graph.nodes).forEach(function (k) { var n = graph.nodes[k]; if (n._box) { n._box.classList.toggle('selected', !!selected[k]); n._box.classList.toggle('primary', k === primaryId && !!selected[k]); } }); }
  function setSelection(ids, primary) { selected = {}; (ids || []).forEach(function (i) { selected[i] = true; }); primaryId = (primary !== undefined) ? primary : ((ids && ids.length) ? ids[ids.length - 1] : null); refreshSelectedClasses(); }
  function toggleSelection(id) { if (selected[id]) { delete selected[id]; if (primaryId === id) primaryId = Object.keys(selected)[0] || null; } else { selected[id] = true; primaryId = id; } refreshSelectedClasses(); }
  function copySelection() { var ids = Object.keys(selected); if (!ids.length) return; clipboard = { nodes: ids.map(function (id) { return JSON.parse(JSON.stringify(serNode(graph.nodes[id]))); }), wires: graph.wires.filter(function (w) { return selected[w.from.node] && selected[w.to.node]; }).map(function (w) { return { from: w.from, to: w.to, type: w.type }; }) }; log('Copied ' + ids.length + ' node(s)'); }
  function pasteClipboard() {
    if (!clipboard || !clipboard.nodes.length) return;
    snapshot(); var map = {}, newIds = [];
    clipboard.nodes.forEach(function (n) { map[n.id] = uid('n'); });
    clipboard.nodes.forEach(function (n) { var nn = { id: map[n.id], toolId: n.toolId, x: (n.x || 0) + 34, y: (n.y || 0) + 34, values: JSON.parse(JSON.stringify(n.values || {})), note: n.note || '', anchor: (n.anchor && map[n.anchor]) ? map[n.anchor] : null, dx: n.dx || 0, dy: n.dy || 0, width: n.width || null, outH: n.outH || null, fontScale: n.fontScale || null, fieldHeights: Object.assign({}, n.fieldHeights), outputs: {} }; graph.nodes[nn.id] = nn; newIds.push(nn.id); });
    clipboard.wires.forEach(function (w) { if (map[w.from.node] && map[w.to.node]) graph.wires.push({ id: uid('w'), from: { node: map[w.from.node], port: w.from.port }, to: { node: map[w.to.node], port: w.to.port }, type: w.type }); });
    setSelection(newIds); rebuildAll(); scheduleSave(); log('Pasted ' + newIds.length + ' node(s)');
  }

  /* ---- zoom / pan / arrange --------------------------------------------- */
  function applyTransform() { world.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')'; if (els.zoom) els.zoom.textContent = Math.round(scale * 100) + '%'; }
  function zoomAt(factor, cx, cy) { var wx = (cx - panX) / scale, wy = (cy - panY) / scale; scale = clamp(scale * factor, ZMIN, ZMAX); panX = cx - wx * scale; panY = cy - wy * scale; applyTransform(); scheduleSave(); }
  function zoomButton(factor) { var r = canvas.getBoundingClientRect(); zoomAt(factor, r.width / 2, r.height / 2); }
  function fit() {
    var ids = Object.keys(graph.nodes);
    if (!ids.length) { scale = 1; panX = 40; panY = 40; applyTransform(); scheduleSave(); return; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(function (id) { var n = graph.nodes[id], w = (n._box ? n._box.offsetWidth : DEFAULT_W), h = (n._box ? n._box.offsetHeight : 160); minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h); });
    var pad = 60, bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2, cw = canvas.clientWidth || 800, ch = canvas.clientHeight || 600;
    scale = clamp(Math.min(cw / bw, ch / bh), ZMIN, 1.4); panX = (cw - bw * scale) / 2 - (minX - pad) * scale; panY = (ch - bh * scale) / 2 - (minY - pad) * scale; applyTransform(); scheduleSave();
  }
  function autoArrange(skipSnapshot) {
    if (skipSnapshot !== true) snapshot();
    var ids = Object.keys(graph.nodes).filter(function (i) { return graph.nodes[i].toolId !== '__note__'; });
    var depth = {}; ids.forEach(function (i) { depth[i] = 0; });
    topoOrder().forEach(function (i) { if (graph.nodes[i].toolId === '__note__') return; graph.wires.forEach(function (w) { if (w.from.node === i && graph.nodes[w.to.node] && graph.nodes[w.to.node].toolId !== '__note__') depth[w.to.node] = Math.max(depth[w.to.node], depth[i] + 1); }); });
    var layers = {}; ids.forEach(function (i) { (layers[depth[i]] = layers[depth[i]] || []).push(i); });
    var x = 40;
    var notes = Object.values(graph.nodes).filter(function (n) { return n.toolId === '__note__'; });
    var loose = notes.filter(function (n) { return !n.anchor; });
    if (loose.length) layers[Object.keys(layers).length] = loose.map(function (n) { return n.id; });
    Object.keys(layers).sort(function (a, b) { return a - b; }).forEach(function (d) {
      var y = 40, width = 0;
      layers[d].forEach(function (id) {
        var n = graph.nodes[id];
        var left = 0, top = 0, right = n._box.offsetWidth || DEFAULT_W, bottom = n._box.offsetHeight || 180;
        notes.filter(function (note) { return note.anchor === id; }).forEach(function (note) {
          left = Math.min(left, note.dx); top = Math.min(top, note.dy);
          right = Math.max(right, note.dx + note._box.offsetWidth); bottom = Math.max(bottom, note.dy + note._box.offsetHeight);
        });
        n.x = x - left; n.y = y - top;
        width = Math.max(width, right - left); y += bottom - top + 40;
      });
      x += width + 64;
    });
    Object.keys(graph.nodes).forEach(function (id) { var n = graph.nodes[id]; if (n.toolId === '__note__' && n.anchor && graph.nodes[n.anchor]) { var a = graph.nodes[n.anchor]; n.x = a.x + (n.dx || 0); n.y = a.y + (n.dy || 0); } });
    Object.values(graph.nodes).forEach(positionNode); redrawWires(); fit(); log('Auto-arranged ' + ids.length + ' nodes');
  }

  /* ---- persistence ------------------------------------------------------- */
  function serNode(n) { return { id: n.id, toolId: n.toolId, x: n.x, y: n.y, values: n.values, note: n.note, anchor: n.anchor, dx: n.dx, dy: n.dy, width: n.width, outH: n.outH, fontScale: n.fontScale, fieldHeights: n.fieldHeights }; }
  function serializeGraph() { return { nextId: nextId, nodes: Object.keys(graph.nodes).map(function (id) { return serNode(graph.nodes[id]); }), wires: graph.wires.map(function (w) { return { id: w.id, from: w.from, to: w.to, type: w.type }; }) }; }
  function serializeFull() { var g = serializeGraph(); g.panX = panX; g.panY = panY; g.scale = scale; return g; }
  function prepareGraph(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.wires)) throw Error('Expected a workspace with nodes and wires.');
    var nodes = Object.create(null), used = new Set(), next = Number.isSafeInteger(data.nextId) ? Math.max(1, data.nextId) : 1;
    function identifier(id) {
      if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || used.has(id) || id in Object.prototype) throw Error('Invalid or duplicate node or wire identifier.');
      used.add(id); var suffix = /^[nw](\d+)$/.exec(id);
      if (suffix) next = Math.max(next, Number(suffix[1]) + 1);
    }
    data.nodes.forEach(function (n) {
      identifier(n.id);
      var values = Object.assign({}, n.values), toolId = n.toolId;
      if (['number-remover', 'case-converter', 'whitespace-remover'].includes(toolId)) {
        var mode = values.mode;
        values = {text: values.text || '', removeNumbers: toolId === 'number-remover' && mode !== 'symbols',
          removeSymbols: toolId === 'number-remover' && mode !== 'numbers', whitespace: toolId === 'whitespace-remover' ? mode || 'all' : 'keep',
          case: toolId === 'case-converter' ? mode || 'upper' : 'keep'};
        toolId = 'clean-sequence';
      }
      var node = {id: n.id, toolId: toolId, x: Number(n.x) || 0, y: Number(n.y) || 0, values: values,
        note: n.note || '', anchor: n.anchor || null, dx: Number(n.dx) || 0, dy: Number(n.dy) || 0,
        width: n.width || null, outH: n.outH || null, fontScale: n.fontScale || null, fieldHeights: Object.assign({}, n.fieldHeights), outputs: {}};
      var def = getDef(node);
      if (toolId !== '__note__' && (!def || (def.group && def.group !== GROUP))) throw Error('Unrecognized node for this canvas: ' + toolId);
      if (def) def.inputs.forEach(function (i) { if (!Object.hasOwn(values, i.name)) values[i.name] = ui.defaultValue(i); });
      nodes[n.id] = node;
    });
    var occupied = new Set(), children = new Map(), degrees = {};
    Object.keys(nodes).forEach(function (id) { children.set(id, []); degrees[id] = 0; });
    data.wires.forEach(function (w) {
      identifier(w.id);
      var a = w.from && nodes[w.from.node], b = w.to && nodes[w.to.node];
      var source = a && getDef(a), target = b && getDef(b);
      var out = source && source.outputs.find(function (o) { return o.name === w.from.port; });
      var input = target && target.inputs.find(function (i) { return i.name === w.to.port && i.socket; });
      var key = b && (b.id + '/' + w.to.port);
      if (!out || !input || input.type !== out.type || w.type !== out.type || occupied.has(key)) throw Error('A connection has an invalid endpoint or type.');
      occupied.add(key); children.get(a.id).push(b.id); degrees[b.id]++;
    });
    var queue = Object.keys(nodes).filter(function (id) { return !degrees[id]; });
    for (var i = 0; i < queue.length; i++) children.get(queue[i]).forEach(function (id) { if (--degrees[id] === 0) queue.push(id); });
    if (queue.length !== children.size) throw Error('The workspace contains a cycle.');
    return {nodes: nodes, wires: data.wires, next: next};
  }
  function loadGraph(data) {
    var prepared = prepareGraph(data);
    graph = {nodes: prepared.nodes, wires: prepared.wires.slice()}; nextId = prepared.next; selected = {}; primaryId = null;
  }
  function loadView(data) { if (Number.isFinite(data.panX)) panX = data.panX; if (Number.isFinite(data.panY)) panY = data.panY; if (Number.isFinite(data.scale)) scale = clamp(data.scale, ZMIN, ZMAX); }

  function loadStore() { try { return JSON.parse(localStorage.getItem(PKEY)); } catch (e) { return null; } }
  function persistStore() { try { localStorage.setItem(PKEY, JSON.stringify(store)); } catch (e) { if (els.status) els.status.textContent = 'Browser storage full or unavailable. Export JSON to save.'; } }
  function projectList() { return Object.keys(store.projects).map(function (id) { return { id: id, name: store.projects[id].name, updated: store.projects[id].updated || 0 }; }).sort(function (a, b) { return b.updated - a.updated; }); }
  function saveCurrent() { if (!store || !currentId || !store.projects[currentId]) return; store.projects[currentId].data = serializeFull(); store.projects[currentId].updated = Date.now(); store.currentId = currentId; persistStore(); }
  var saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 250); }
  function openProject(id) { if (!store.projects[id]) return; currentId = id; store.currentId = id; var data = store.projects[id].data || {}; loadGraph(data); loadView(data); undoStack.length = 0; redoStack.length = 0; updateHistoryButtons(); rebuildAll(); applyTransform(); refreshProjectSelect(); persistStore(); log('Opened workspace: ' + store.projects[id].name); }
  function switchProject(id) { if (id === currentId) return; saveCurrent(); openProject(id); }
  function newProject() { var name = prompt('Name for the new workspace:', 'Untitled'); if (name == null) return; saveCurrent(); var id = pid(); store.projects[id] = { name: name || 'Untitled', data: { nextId: 1, nodes: [], wires: [], panX: 60, panY: 40, scale: 1 }, updated: Date.now() }; persistStore(); openProject(id); }
  function renameProject() { var p = store.projects[currentId]; if (!p) return; var name = prompt('Rename workspace:', p.name); if (name == null) return; p.name = name || p.name; p.updated = Date.now(); persistStore(); refreshProjectSelect(); }
  function deleteProject() { if (!confirm('Delete this workspace? This cannot be undone.')) return; delete store.projects[currentId]; if (!Object.keys(store.projects).length) { var id = pid(); store.projects[id] = { name: 'Untitled', data: { nextId: 1, nodes: [], wires: [], panX: 60, panY: 40, scale: 1 }, updated: Date.now() }; } persistStore(); openProject(projectList()[0].id); }
  function refreshProjectSelect() { if (!els.proj) return; els.proj.textContent = ''; projectList().forEach(function (p) { var o = el('option', { value: p.id }, p.name); if (p.id === currentId) o.selected = true; els.proj.appendChild(o); }); }

  function demoData() {
    var sample = '1 auggccauu gagaaauggc\n21 auuaaggccg u';
    return { nextId: 20, panX: 30, panY: 30, scale: 1,
      nodes: [
        { id: 'n1', toolId: '__text__', x: 20, y: 20, values: { text: sample } },
        { id: 'n2', toolId: 'clean-sequence', x: 320, y: 20, values: { removeNumbers: true, removeSymbols: true, whitespace: 'keep', case: 'keep' } },
        { id: 'n3', toolId: 'clean-sequence', x: 620, y: 20, values: { removeNumbers: false, removeSymbols: false, whitespace: 'all', case: 'keep' } },
        { id: 'n4', toolId: 'sequence-stats', x: 940, y: -10, values: {} },
        { id: 'n5', toolId: 'sequence-converter', x: 940, y: 250, values: { from: 'RNA', to: 'Protein' } },
        { id: 'n6', toolId: 'reading-frames', x: 940, y: 520, values: { type: 'RNA' } }
      ],
      wires: [
        { id: 'w1', from: { node: 'n1', port: 'text' }, to: { node: 'n2', port: 'text' }, type: 'text' },
        { id: 'w2', from: { node: 'n2', port: 'text' }, to: { node: 'n3', port: 'text' }, type: 'text' },
        { id: 'w3', from: { node: 'n3', port: 'text' }, to: { node: 'n4', port: 'seq' }, type: 'text' },
        { id: 'w4', from: { node: 'n3', port: 'text' }, to: { node: 'n5', port: 'seq' }, type: 'text' },
        { id: 'w5', from: { node: 'n3', port: 'text' }, to: { node: 'n6', port: 'seq' }, type: 'text' }
      ] };
  }
  function loadExample() { if (!DEMO) return; snapshot(); var example = DEMO(); loadGraph(example); loadView(example); rebuildAll(); autoArrange(true); scheduleSave(); }
  function starterData() {
    var sample = 'GCTATGACCTGATGAGTCTTACCGGATCAGTGCTGACCTATGACCTGATTGC';
    return {nextId: 4, panX: 24, panY: 24, scale: 1, nodes: [
      {id: 'n1', toolId: '__text__', x: 0, y: 0, values: {text: sample}},
      {id: 'n2', toolId: 'sequence-find', x: 352, y: 0, values: {query: 'ATGACCTGA', both: false}}],
      wires: [{id: 'w3', from: {node: 'n1', port: 'text'}, to: {node: 'n2', port: 'seq'}, type: 'text'}]};
  }
  function initProjects() {
    store = loadStore();
    if (!store || !store.projects || !Object.keys(store.projects).length) {
      store = { currentId: null, projects: {} };
      // one-time migration of the original single-workflow key (bio only)
      var old = null; if (GROUP === 'bio') { try { old = localStorage.getItem('mbt-workflow'); } catch (e) {} }
      var id = pid();
      if (old) { try { store.projects[id] = { name: 'My workflow', data: JSON.parse(old), updated: Date.now() }; } catch (e) { old = null; } }
      if (!old) {
        var blank = { nextId: 1, nodes: [], wires: [], panX: 60, panY: 40, scale: 1 };
        store.projects[id] = DEMO ? { name: 'Sequence search', data: starterData(), updated: Date.now() }
                                  : { name: 'Untitled', data: blank, updated: Date.now() };
      }
      store.currentId = id; persistStore();
    }
    currentId = (store.currentId && store.projects[store.currentId]) ? store.currentId : projectList()[0].id;
  }

  /* ---- add-node menu / shortcuts / IO ----------------------------------- */
  // x,y = where to show the menu (screen px). spawnPos (optional, world coords)
  // = where the NEW node should be placed — passed when opened via Space so the
  // node lands under the cursor. Without it, nodes cascade from the pan origin.
  function openAddMenu(x, y, spawnPos) {
    closeAddMenu();
    var menu = el('div', { class: 'wf-menu', id: 'wfAddMenu' });
    var search = el('input', { class: 'wf-menu-search', type: 'text', placeholder: 'Search nodes…', spellcheck: 'false' });
    var list = el('div', { class: 'wf-menu-list' });
    var items = [], heads = [];
    function spawn(toolId, label) {
      snapshot();
      var x0, y0;
      if (spawnPos) { x0 = spawnPos.x; y0 = spawnPos.y; }
      else { addOffset = (addOffset + 28) % 140; x0 = -panX / scale + 80 + addOffset; y0 = -panY / scale + 90 + addOffset; }
      var n = addNode(toolId, x0, y0); rebuildAll(); setSelection([n.id]); closeAddMenu(); log('Added node: ' + label);
    }
    function item(label, toolId) { var b = el('button', { type: 'button' }, label); b.addEventListener('click', function () { spawn(toolId, label); }); items.push({ q: (label + ' ' + (MBT.getTool(toolId) || {}).description).toLowerCase(), btn: b, toolId: toolId, label: label }); return b; }
    function head(text) { var h = el('div', { class: 'menu-cat' }, text); heads.push(h); return h; }
    list.appendChild(head('Inputs & notes'));
    list.appendChild(item('Text / Sequence Input', '__text__')); list.appendChild(item('Note', '__note__'));
    var cats = MBT.categoriesFor(GROUP);
    cats.forEach(function (cat) { var tools = MBT.toolsByCategory(cat, GROUP); if (!tools.length) return; list.appendChild(head(cat)); tools.forEach(function (t) { list.appendChild(item(t.name, t.id)); }); });
    if (!cats.length) list.appendChild(el('div', { class: 'wf-menu-empty' }, 'No ' + LABEL + ' tools yet — add them in assets/js/tools-code/ (see project.md).'));
    function applyFilter() {
      var q = search.value.trim().toLowerCase(), shown = 0;
      items.forEach(function (it) { var hit = !q || it.q.indexOf(q) !== -1; it.btn.style.display = hit ? '' : 'none'; if (hit) shown++; });
      heads.forEach(function (h) { h.style.display = q ? 'none' : ''; });    // flat list while searching
      if (empty) empty.style.display = (q && !shown) ? '' : 'none';
    }
    var empty = el('div', { class: 'wf-menu-empty' }, 'No matching node.'); empty.style.display = 'none'; list.appendChild(empty);
    search.addEventListener('input', applyFilter);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var vis = items.filter(function (it) { return it.btn.style.display !== 'none'; }); if (vis.length) { e.preventDefault(); spawn(vis[0].toolId, vis[0].label); } }
      else if (e.key === 'Escape') { e.preventDefault(); closeAddMenu(); }
    });
    menu.appendChild(search); menu.appendChild(list);
    menu.style.left = Math.min(x, window.innerWidth - 250) + 'px'; menu.style.top = Math.min(y, window.innerHeight - 340) + 'px';
    document.body.appendChild(menu); setTimeout(function () { document.addEventListener('mousedown', outsideMenu); search.focus(); }, 0);
  }
  function outsideMenu(e) { if (!e.target.closest('#wfAddMenu')) closeAddMenu(); }
  function closeAddMenu() { var m = document.getElementById('wfAddMenu'); if (m) m.remove(); document.removeEventListener('mousedown', outsideMenu); }
  var SHORTCUTS = [['Space', 'Add-node menu at the cursor (type to search)'], ['F', 'Fit all nodes in view'], ['X / Delete', 'Delete selected node(s)'], ['Click a node', 'Select it (drag any border to resize)'], ['Shift + click', 'Add / remove from selection'], ['Ctrl + C / V', 'Copy / paste nodes (text if selected)'], ['Ctrl + A', 'Select all'], ['Ctrl + Z / Y', 'Undo / redo'], ['Esc', 'Cancel “anchor note”'], ['Drag header / body', 'Move node(s)'], ['Select + drag a border', 'Resize the node (E/W width · N/S box height)'], ['Drag output→input', 'Connect (matching type)'], ['Click a wire', 'Remove connection'], ['Output fields', 'Drag to select text. Use Copy for the whole output.'], ['Field grip', 'Drag to resize a single field, double-click to reset'], ['Scroll', 'Zoom (or scroll a scrollable box)'], ['Ctrl + Scroll', 'Zoom the text in a node box (↺ resets)'], ['Middle-drag', 'Pan the canvas'], ['Drop a .json', 'Import a workflow']];
  function toggleShortcuts() { var ex = document.getElementById('wfShortcuts'); if (ex) { ex.remove(); return; } document.body.appendChild(el('div', { class: 'wf-shortcuts', id: 'wfShortcuts' }, [el('div', { class: 'wf-shortcuts-title' }, 'Keyboard & mouse')].concat(SHORTCUTS.map(function (s) { return el('div', { class: 'wf-shortcut-row' }, [el('span', { class: 'kbd' }, s[0]), el('span', null, s[1])]); })))); }
  function exportJson() { var blob = new Blob([JSON.stringify(serializeFull(), null, 2)], { type: 'application/json' }); var name = (store.projects[currentId] && store.projects[currentId].name || 'workflow').replace(/[^\w-]+/g, '_'); var a = el('a', { href: URL.createObjectURL(blob), download: 'molbio-' + name + '.json' }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); log('Exported workspace JSON'); }
  function importFile(f) { if (!f) return; var fr = new FileReader(); fr.onload = function () { try { var d = JSON.parse(fr.result); prepareGraph(d); snapshot(); loadGraph(d); loadView(d); rebuildAll(); applyTransform(); scheduleSave(); log('Imported workflow: ' + (f.name || 'file')); } catch (e) { if (MBT.log) MBT.log.error('Import failed: ' + e.message); alert('Could not import workspace. ' + e.message); } }; fr.readAsText(f); }
  function importJson() { var inp = el('input', { type: 'file', accept: 'application/json' }); inp.addEventListener('change', function () { importFile(inp.files[0]); }); inp.click(); }

  /* ---- toolbar + mount --------------------------------------------------- */
  function btn(label, fn, title) { var b = el('button', { class: 'btn btn-sm', title: title || '' }, label); b.addEventListener('click', fn); return b; }
  function sep() { return el('span', { class: 'wf-sep' }); }
  function buildToolbar() {
    els.proj = el('select', {class: 'wf-proj-select', 'aria-label': 'Current workspace'});
    els.proj.onchange = function () { switchProject(els.proj.value); };
    var add = btn('+ Add node', function () {
      var r = add.getBoundingClientRect(); openAddMenu(r.left, r.bottom + 4);
    }, 'Find a node (Space)');
    add.classList.add('add-node');
    els.undo = btn('Undo', undo, 'Undo (Ctrl+Z)'); els.redo = btn('Redo', redo, 'Redo (Ctrl+Y)');
    var menu = el('details', {class: 'workspace-menu'}, [el('summary', null, 'Workspace'),
      el('div', {class: 'workspace-commands'}, [btn('New workspace', newProject), btn('Rename', renameProject),
        btn('Export JSON', exportJson), btn('Import JSON', importJson), DEMO ? btn('Load Example', loadExample) : null,
        btn('Clear canvas', function () { snapshot(); graph = {nodes: {}, wires: []}; setSelection([]); rebuildAll(); }),
        btn('Delete workspace', deleteProject), btn('Shortcuts', toggleShortcuts)])]);
    menu.addEventListener('click', function (e) { if (e.target.closest('button')) menu.open = false; });
    var bar = el('div', {class: 'wf-toolbar'}, [
      el('div', {class: 'wf-project-heading'}, [el('h1', null, LABEL), els.proj]), el('span', {class: 'spacer'}),
      add, btn('Tidy layout', autoArrange, 'Arrange by connections and actual node sizes'), els.undo, els.redo, menu]);
    updateHistoryButtons(); return bar;
  }
  function buildLibrary() {
    var search = el('input', {type: 'search', class: 'library-filter', placeholder: 'Filter nodes', 'aria-label': 'Filter node library'});
    var list = el('div', {class: 'library-list'}), groups = [];
    function group(name, entries) {
      var section = el('section', {}, el('h3', null, name)), items = [];
      entries.forEach(function (t) {
        var button = el('button', {type: 'button', title: t.description || t.name}, [el('span', null, t.name), el('span', {'aria-hidden': 'true'}, '+')]);
        button.onclick = function () {
          snapshot();
          addOffset = (addOffset + 26) % 130;
          var n = addNode(t.id, (45 - panX) / scale + addOffset, (35 - panY) / scale + addOffset);
          rebuildAll(); setSelection([n.id]);
        };
        section.appendChild(button); items.push({button: button, text: (t.name + ' ' + (t.description || '') + ' ' + name).toLowerCase()});
      });
      groups.push({section: section, items: items}); list.appendChild(section);
    }
    group('Inputs & notes', [TEXT_DEF, {id: '__note__', name: 'Note'}]);
    MBT.categoriesFor(GROUP).forEach(function (cat) { group(cat, MBT.toolsByCategory(cat, GROUP)); });
    var empty = el('p', {hidden: true, class: 'muted'}, 'No nodes match your filter.');
    search.oninput = function () {
      var total = 0, q = search.value.trim().toLowerCase();
      groups.forEach(function (g) {
        var any = false;
        g.items.forEach(function (it) { it.button.hidden = !it.text.includes(q); if (!it.button.hidden) { any = true; total++; } });
        g.section.hidden = !any;
      });
      empty.hidden = total > 0;
    };
    return el('aside', {class: 'node-library', 'aria-label': 'Node library'}, [el('h2', null, 'Node library'), search, list, empty]);
  }
  function canvasTools() {
    els.zoom = el('span', {class: 'wf-zoom-label'}, '100%');
    return el('div', {class: 'canvas-tools'}, [btn('−', function () { zoomButton(1/1.2); }, 'Zoom out'), els.zoom,
      btn('+', function () { zoomButton(1.2); }, 'Zoom in'), btn('Fit', fit, 'Fit all nodes (F)')]);
  }
  function mount(container, opts) {
    opts = opts || {};
    // Flush any pending save from a previously-mounted canvas before switching.
    clearTimeout(saveTimer); closeAddMenu(); var shortcuts = document.getElementById('wfShortcuts'); if (shortcuts) shortcuts.remove();
    if (store && currentId) { try { saveCurrent(); } catch (e) {} }
    GROUP = opts.group || 'bio';
    PKEY = opts.storeKey || (GROUP === 'bio' ? 'mbt-wf-projects' : 'mbt-wf-' + GROUP + '-projects');
    DEMO = opts.demo || (GROUP === 'bio' ? demoData : null);
    LABEL = opts.label || 'Workflow';
    clipboard = null; drag = null; pendingAnchorNote = null;
    undoStack.length = 0; redoStack.length = 0;
    ui.clear(container);
    canvas = el('div', { class: 'wf-canvas' }); world = el('div', { class: 'wf-world' });
    svg = svgEl('svg', { class: 'wf-svg', width: '1', height: '1' }); tempPath = svgEl('path', { class: 'wf-wire wf-wire-temp' }); tempPath.style.display = 'none';
    svg.appendChild(tempPath); world.appendChild(svg); canvas.appendChild(el('div', {class: 'canvas-surface'})); canvas.appendChild(world);
    var toolbar = buildToolbar(); canvas.appendChild(canvasTools());
    els.status = el('span', {class: 'canvas-status', role: 'status'});
    canvas.appendChild(els.status);
    container.appendChild(el('div', {class: 'wf-page'}, [toolbar,
      el('div', {class: 'bench-layout'}, [buildLibrary(), canvas])]));

    canvas.addEventListener('mousemove', function (e) { lastMouseX = e.clientX; lastMouseY = e.clientY; });
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button === 1) { e.preventDefault(); startPan(e); return; }                    // middle-drag pans from anywhere
      if (e.button === 0 && (e.target === canvas || e.target === world || e.target === svg || e.target.classList.contains('canvas-surface'))) {
        if (pendingAnchorNote) { pendingAnchorNote = null; canvas.classList.remove('wf-pickmode'); return; }
        setSelection([]); startPan(e);
      }
    });
    canvas.addEventListener('wheel', function (e) {
      // Ctrl/⌘ + wheel over a node's text/table box zooms just that node's TEXT
      // (font size) without changing the node size. The header ↺ resets it.
      if (e.ctrlKey || e.metaKey) {
        var tb = e.target && e.target.closest ? e.target.closest('.wf-node textarea, .wf-node .ctl-text, .wf-node .ctl-rich, .wf-node .wf-out-val, .wf-node .out-table-wrap, .wf-node .out-html') : null;
        var nb = tb ? tb.closest('.wf-node') : null;
        if (nb && nb.dataset.node && graph.nodes[nb.dataset.node]) {
          e.preventDefault();
          var nd = graph.nodes[nb.dataset.node];
          nd.fontScale = clamp((nd.fontScale || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.5, 3);
          nb.style.setProperty('--wf-fs', nd.fontScale); scheduleSave(); return;
        }
      }
      var sc = e.target && e.target.closest ? e.target.closest('textarea, .wf-out-val, .out-table-wrap, .out-html, .ctl-rich') : null;
      if (sc) return;                              // scroll the box
      e.preventDefault(); var r = canvas.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    canvas.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('dragover', function (e) { e.preventDefault(); canvas.classList.add('wf-dropping'); });
    canvas.addEventListener('dragleave', function (e) { if (e.target === canvas) canvas.classList.remove('wf-dropping'); });
    canvas.addEventListener('drop', function (e) { e.preventDefault(); canvas.classList.remove('wf-dropping'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /\.json$/i.test(f.name)) importFile(f); else if (f) alert('Drop a .json workflow file exported from here.'); });

    if (!docBound) { window.addEventListener('pagehide', saveCurrent); document.addEventListener('pointermove', onMouseMove); document.addEventListener('pointerup', onMouseUp); document.addEventListener('pointercancel', function () { if (drag) { drag = null; canvas.classList.remove('panning'); tempPath.style.display = 'none'; scheduleSave(); } }); document.addEventListener('keydown', onKeyDown); docBound = true; }
    initProjects(); openProject(currentId);
  }
  function onKeyDown(e) {
    if (!document.querySelector('.wf-canvas')) return;
    if (e.key === 'Escape' && pendingAnchorNote) { pendingAnchorNote = null; if (canvas) canvas.classList.remove('wf-pickmode'); return; }
    var t = document.activeElement, tag = t ? t.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var ctrl = e.ctrlKey || e.metaKey, hasSel = window.getSelection && String(window.getSelection()).trim().length > 0;
    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (ctrl && e.key.toLowerCase() === 'c') { if (hasSel) return; e.preventDefault(); copySelection(); }
    else if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
    else if (ctrl && e.key.toLowerCase() === 'a') { if (hasSel) return; e.preventDefault(); setSelection(Object.keys(graph.nodes), primaryId); }
    else if (!ctrl && e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); openAddMenu(lastMouseX, lastMouseY, toWorld(lastMouseX, lastMouseY)); }
    else if (!ctrl && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); fit(); }
    else if (!ctrl && (e.key === 'x' || e.key === 'X') && Object.keys(selected).length) { e.preventDefault(); snapshot(); Object.keys(selected).forEach(removeNode); rebuildAll(); log('Deleted selected node(s)'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && Object.keys(selected).length) { e.preventDefault(); snapshot(); Object.keys(selected).forEach(removeNode); rebuildAll(); log('Deleted selected node(s)'); }
  }

  MBT.workflow = { mount: mount };
})(window.MBT);
