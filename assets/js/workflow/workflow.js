/* ============================================================================
 * workflow.js  —  The node editor. Every node wraps a tool's compute(), so
 * there is zero duplicated logic between a tool page and its node.
 *
 * ---- How it stays fast on big graphs ---------------------------------------
 * The old version measured every port with getBoundingClientRect() and rebuilt
 * every wire on every mousemove, which meant a forced layout per port per
 * frame. Now:
 *   • port positions are measured ONCE per node (into node._ports, in node-local
 *     coordinates) and only re-measured when that node's layout actually
 *     changes — never during a drag;
 *   • a drag updates a CSS transform plus the `d` of the few wires that touch
 *     the dragged nodes, inside one requestAnimationFrame;
 *   • editing an input re-evaluates only that node and its descendants;
 *   • nodes are created/removed incrementally instead of nuking the canvas;
 *   • output values are never truncated — text renders into a readonly
 *     textarea and marked-up sequence into skippable lines, so size costs the
 *     browser almost nothing (see the note at the top of ui.js).
 *
 * ---- Connecting ------------------------------------------------------------
 * Ports sit above everything and stay grabbable at all times; while you are
 * linking, every resize handle on the canvas goes inert, so a selected node can
 * never "resize instead of connect".
 *   • drag a port onto another port, or
 *   • CLICK a port, then click the other one (no dragging at all), or
 *   • drag a port onto empty canvas to pick a compatible node and auto-wire it,
 *   • or select two nodes and press C.
 * ==========================================================================*/
(function (MBT) {
  'use strict';
  var ui = MBT.ui, el = ui.el;

  var DEFAULT_W = 280, DEFAULT_OUTH = 104, ZMIN = 0.2, ZMAX = 2.5;
  var MIN_W = 200, MAX_W = 1200, MIN_H = 44, MAX_H = 2000;
  var GRID = 20;
  var RZ_DIRS = ['e', 'w', 's', 'se', 'sw'];      // no north handles: they fight the header
  var DRAG_IGNORE = 'input,textarea,select,button,a,label,.wf-port,.out-val,.ctl-rich,.ctl-rich-wrap,.wf-rz,.wf-node-err,.out-table-wrap,summary';

  /* ---- built-in nodes ---------------------------------------------------- */
  var TEXT_DEF = {
    id: '__text__', name: 'Text / Sequence', category: 'Input',
    description: 'A place to paste sequence or text and feed it into the graph.',
    inputs: [{ name: 'text', label: 'Text', control: 'textarea', rows: 6, socket: false, type: 'text', placeholder: 'Paste or type a sequence…' }],
    outputs: [{ name: 'text', label: 'Text', type: 'text', seq: true }],
    compute: function (inp) { return { text: inp.text == null ? '' : inp.text }; }
  };
  var NUM_DEF = {
    id: '__number__', name: 'Number', category: 'Input',
    description: 'A constant you can wire into any numeric input.',
    inputs: [{ name: 'value', label: 'Value', control: 'number', socket: false, type: 'number', default: 0, step: 'any' }],
    outputs: [{ name: 'value', label: 'Value', type: 'number' }],
    compute: function (inp) { return { value: inp.value === '' || inp.value == null ? 0 : +inp.value }; }
  };
  var BUILTIN = { __text__: TEXT_DEF, __number__: NUM_DEF };

  function getDef(node) {
    if (!node) return null;
    if (BUILTIN[node.toolId]) return BUILTIN[node.toolId];
    if (node.toolId === '__note__') return null;
    return MBT.getTool(node.toolId);
  }
  function isNote(node) { return node && node.toolId === '__note__'; }
  function isMissing(node) { return !isNote(node) && !getDef(node); }

  var CAT_CLASS = { 'Cleanup & Format': 'cat-clean', 'Sequence Tools': 'cat-seq', 'Calculators': 'cat-calc', 'Input': 'cat-input' };
  function catClass(node) {
    if (isNote(node)) return 'cat-note';
    var def = getDef(node);
    if (!def) return 'cat-missing';
    return CAT_CLASS[def.category] || 'cat-other';
  }

  /* ---- state ------------------------------------------------------------- */
  var graph = { nodes: {}, wires: [] };
  var nextId = 1, panX = 60, panY = 40, scale = 1;
  var selected = {}, primaryId = null, selectedWire = null, clipboard = null;
  var lastMouseX = 0, lastMouseY = 0;
  var canvas, world, svg, wireLayer, tempPath, marquee, statusEl, minimap, minictx;
  var drag = null, link = null, docBound = false, panMode = true;
  var undoStack = [], redoStack = [];
  var store = null, currentId = null, pendingAnchorNote = null, els = {};
  var autoRun = true, topoCache = null, recent = [];
  var PKEY = 'mbt-wf-projects';

  // requestAnimationFrame, except in a hidden tab (where the browser never fires
  // it) or a headless DOM (where it may not exist) — there a timer stands in, so
  // queued edits always settle.
  function raf(fn) {
    return (typeof requestAnimationFrame === 'function' && !document.hidden) ? requestAnimationFrame(fn) : setTimeout(fn, 0);
  }

  function uid(p) { return p + (nextId++); }
  function pid() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function log(m, d) { if (MBT.log) MBT.log.event(m, d); }
  function stringify(v) {
    if (v == null) return '';
    if (typeof v === 'number') return isNaN(v) ? '' : String(v);
    if (typeof v === 'object') return v.headers ? ui.tableToText(v) : String(v);
    return String(v);
  }

  /* ---- graph ops --------------------------------------------------------- */
  function addNode(toolId, x, y, values) {
    var node = { id: uid('n'), toolId: toolId, x: Math.round(x), y: Math.round(y), values: {}, note: '',
      anchor: null, dx: 0, dy: 0, width: null, outH: null, fontScale: null, collapsed: false, outputs: {} };
    var def = getDef(node);
    if (def) def.inputs.forEach(function (inp) { node.values[inp.name] = ui.defaultValue(inp); });
    if (values) Object.keys(values).forEach(function (k) { node.values[k] = values[k]; });
    graph.nodes[node.id] = node; topoCache = null;
    return node;
  }
  function removeNode(id) {
    graph.wires.forEach(function (w) { if (w.from.node === id) bakeInput(w.to.node, w.to.port); });
    graph.wires = graph.wires.filter(function (w) {
      var drop = w.from.node === id || w.to.node === id;
      if (drop && w._path) { w._path.remove(); w._path = null; }
      return !drop;
    });
    var n = graph.nodes[id];
    if (n && n._box) n._box.remove();
    delete graph.nodes[id];
    Object.keys(graph.nodes).forEach(function (k) { if (graph.nodes[k].anchor === id) graph.nodes[k].anchor = null; });
    delete selected[id];
    if (primaryId === id) primaryId = null;
    topoCache = null;
  }
  function isConnected(nodeId, io, port) {
    return graph.wires.some(function (w) { return io === 'in' ? (w.to.node === nodeId && w.to.port === port) : (w.from.node === nodeId && w.from.port === port); });
  }
  function incomingWire(nodeId, port) { return graph.wires.filter(function (w) { return w.to.node === nodeId && w.to.port === port; })[0]; }
  function resolveInput(node, port) {
    var w = incomingWire(node.id, port);
    if (!w) return node.values[port];
    var up = graph.nodes[w.from.node];
    return up && up.outputs ? up.outputs[w.from.port] : '';
  }
  // When a wire is cut, freeze the value it was carrying into the field so the
  // downstream node keeps working instead of silently emptying.
  function bakeInput(nodeId, port) {
    var node = graph.nodes[nodeId]; if (!node) return;
    var v = resolveInput(node, port);
    node.values[port] = (typeof v === 'number') ? v : stringify(v);
  }
  function reaches(start, target) {
    var seen = {}, stack = [start];
    while (stack.length) {
      var n = stack.pop();
      if (n === target) return true;
      if (seen[n]) continue; seen[n] = 1;
      graph.wires.forEach(function (w) { if (w.from.node === n) stack.push(w.to.node); });
    }
    return false;
  }
  function wouldCycle(fromNode, toNode) { return fromNode === toNode || reaches(toNode, fromNode); }
  // A number can be read as text; text can't be read as a number.
  function typesFit(fromType, toType) { return fromType === toType || (fromType === 'number' && toType === 'text'); }

  function addWire(from, to, type) {
    var ex = incomingWire(to.node, to.port);
    if (ex) { if (ex._path) ex._path.remove(); graph.wires = graph.wires.filter(function (w) { return w.id !== ex.id; }); }
    var w = { id: uid('w'), from: from, to: to, type: type };
    graph.wires.push(w); topoCache = null;
    return w;
  }
  function removeWire(id) {
    graph.wires = graph.wires.filter(function (w) {
      if (w.id !== id) return true;
      if (w._path) w._path.remove();
      return false;
    });
    topoCache = null;
  }

  /* ---- evaluation -------------------------------------------------------- */
  function topoOrder() {
    if (topoCache) return topoCache;
    var ids = Object.keys(graph.nodes), indeg = {};
    ids.forEach(function (i) { indeg[i] = 0; });
    graph.wires.forEach(function (w) { if (indeg[w.to.node] != null) indeg[w.to.node]++; });
    var queue = ids.filter(function (i) { return indeg[i] === 0; }), order = [];
    while (queue.length) {
      var n = queue.shift(); order.push(n);
      graph.wires.forEach(function (w) { if (w.from.node === n && --indeg[w.to.node] === 0) queue.push(w.to.node); });
    }
    ids.forEach(function (i) { if (order.indexOf(i) === -1) order.push(i); });
    topoCache = order;
    return order;
  }
  function descendants(ids) {
    var seen = {}, stack = ids.slice();
    while (stack.length) {
      var n = stack.pop();
      if (seen[n]) continue; seen[n] = 1;
      graph.wires.forEach(function (w) { if (w.from.node === n && !seen[w.to.node]) stack.push(w.to.node); });
    }
    return seen;
  }
  function computeNode(node) {
    var def = getDef(node);
    if (!def) { node.outputs = {}; node._error = isMissing(node) ? 'This tool no longer exists.' : null; return; }
    var inputs = {};
    def.inputs.forEach(function (inp) { inputs[inp.name] = resolveInput(node, inp.name); });
    var res = MBT.run(def, inputs);
    node.outputs = res.ok ? res.outputs : {};
    node._error = res.ok ? null : res.error;
  }
  // Evaluate everything, or only `ids` and whatever depends on them.
  function evaluate(ids) {
    var t0 = performance.now();
    var only = ids ? descendants(ids) : null;
    var order = topoOrder(), n = 0;
    for (var i = 0; i < order.length; i++) {
      if (only && !only[order[i]]) continue;
      computeNode(graph.nodes[order[i]]); n++;
    }
    lastEvalMs = performance.now() - t0; lastEvalCount = n;
    return only;
  }
  var lastEvalMs = 0, lastEvalCount = 0;

  /* ---- undo / redo ------------------------------------------------------- */
  var MAX_SNAPSHOT = 4e6;                      // don't try to snapshot a genome
  function snapshot() {
    var json;
    try { json = JSON.stringify(serializeGraph()); } catch (e) { return; }
    if (json.length > MAX_SNAPSHOT) {
      if (MBT.log) MBT.log.warn('Graph too large to add to undo history (' + ui.fmtInt(json.length) + ' chars)');
      return;
    }
    undoStack.push(json);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0; updateHistoryButtons();
  }
  function restore(json) { loadGraph(JSON.parse(json)); rebuildAll(); scheduleSave(); }
  function undo() { if (!undoStack.length) return; try { redoStack.push(JSON.stringify(serializeGraph())); } catch (e) {} restore(undoStack.pop()); updateHistoryButtons(); }
  function redo() { if (!redoStack.length) return; try { undoStack.push(JSON.stringify(serializeGraph())); } catch (e) {} restore(redoStack.pop()); updateHistoryButtons(); }
  function updateHistoryButtons() { if (els.undo) els.undo.disabled = !undoStack.length; if (els.redo) els.redo.disabled = !redoStack.length; }
  var editGuard = false;
  function beginEdit() { if (!editGuard) { snapshot(); editGuard = true; setTimeout(function () { editGuard = false; }, 800); } }

  /* ---- geometry ---------------------------------------------------------- */
  // Offset of `el` inside the node box, without touching getBoundingClientRect.
  function localOffset(elm, root) {
    var x = 0, y = 0, n = elm;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y };
  }
  // Measure a node's ports once; every wire endpoint is then pure arithmetic.
  function measureNode(node) {
    var box = node._box; if (!box) return;
    node._w = box.offsetWidth; node._h = box.offsetHeight;
    var ports = {};
    Array.prototype.forEach.call(box.querySelectorAll('.wf-port'), function (p) {
      var o = localOffset(p, box);
      ports[p.dataset.io + ':' + p.dataset.port] = { x: o.x + p.offsetWidth / 2, y: o.y + p.offsetHeight / 2 };
    });
    node._ports = ports;
    node._measured = true;
  }
  function portPoint(nodeId, io, port) {
    var n = graph.nodes[nodeId]; if (!n) return null;
    if (!n._measured) measureNode(n);
    var p = n._ports && n._ports[io + ':' + port];
    if (!p) return null;
    return { x: n.x + p.x, y: n.y + p.y };
  }
  function toWorld(cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left - panX) / scale, y: (cy - r.top - panY) / scale }; }

  /* ---- wires (SVG) ------------------------------------------------------- */
  function svgEl(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
  function wirePath(x1, y1, x2, y2) {
    var dx = clamp(Math.abs(x2 - x1) * 0.5, 30, 160);
    return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
  }
  function ensureWirePath(w) {
    if (w._path) return w._path;
    var p = svgEl('path', { class: 'wf-wire ' + (w.type || 'text') });
    p.dataset.wire = w.id;
    wireLayer.appendChild(p);
    w._path = p;
    return p;
  }
  function updateWire(w) {
    var a = portPoint(w.from.node, 'out', w.from.port), b = portPoint(w.to.node, 'in', w.to.port);
    var p = ensureWirePath(w);
    if (!a || !b) { p.style.display = 'none'; return; }
    p.style.display = '';
    p.setAttribute('d', wirePath(a.x, a.y, b.x, b.y));
    p.setAttribute('class', 'wf-wire ' + (w.type || 'text') + (selectedWire === w.id ? ' selected' : ''));
  }
  function updateWiresFor(nodeIds) {
    var set = {}; nodeIds.forEach(function (i) { set[i] = 1; });
    for (var i = 0; i < graph.wires.length; i++) {
      var w = graph.wires[i];
      if (set[w.from.node] || set[w.to.node]) updateWire(w);
    }
  }
  function redrawWires() {
    for (var i = 0; i < graph.wires.length; i++) updateWire(graph.wires[i]);
    redrawAnchors();
  }
  function redrawAnchors() {
    Array.prototype.forEach.call(svg.querySelectorAll('.wf-anchor-line'), function (p) { p.remove(); });
    Object.keys(graph.nodes).forEach(function (id) {
      var n = graph.nodes[id];
      if (!isNote(n) || !n.anchor || !graph.nodes[n.anchor]) return;
      var a = graph.nodes[n.anchor];
      var c1 = { x: n.x + (n._w || 200) / 2, y: n.y + (n._h || 80) / 2 };
      var c2 = { x: a.x + (a._w || DEFAULT_W) / 2, y: a.y + (a._h || 120) / 2 };
      svg.insertBefore(svgEl('path', { class: 'wf-anchor-line', d: 'M ' + c1.x + ' ' + c1.y + ' L ' + c2.x + ' ' + c2.y }), svg.firstChild);
    });
  }

  /* ---- frame scheduling -------------------------------------------------- */
  var frameReq = 0, pendingWireNodes = null, pendingFull = false;
  function requestFrame(nodeIds) {
    if (nodeIds) { pendingWireNodes = pendingWireNodes || []; pendingWireNodes.push.apply(pendingWireNodes, nodeIds); }
    else pendingFull = true;
    if (frameReq) return;
    frameReq = raf(function () {
      frameReq = 0;
      if (pendingFull) redrawWires();
      else if (pendingWireNodes) { updateWiresFor(pendingWireNodes); redrawAnchors(); }
      pendingFull = false; pendingWireNodes = null;
      drawMinimap();
    });
  }

  /* ---- node rendering ---------------------------------------------------- */
  function makePort(node, io, portDef) {
    var p = el('div', { class: 'wf-port ' + io + ' t-' + portDef.type, title: (io === 'in' ? 'Input' : 'Output') + ' · ' + (portDef.label || portDef.name) + ' (' + portDef.type + ') — drag or click to connect' });
    p.dataset.node = node.id; p.dataset.port = portDef.name; p.dataset.io = io; p.dataset.type = portDef.type;
    if (isConnected(node.id, io, portDef.name)) p.classList.add('connected');
    p.addEventListener('mousedown', onPortDown);
    p.addEventListener('mouseup', onPortUp);
    return p;
  }
  function headButton(label, title, fn) {
    var b = el('button', { class: 'wf-node-btn', type: 'button', title: title }, label);
    b.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(e); });
    return b;
  }
  function nodeHead(node, title) {
    var btns = [];
    if (isNote(node)) {
      var anchored = !!(node.anchor && graph.nodes[node.anchor]);
      btns.push(headButton(anchored ? '⛓' : '🔗', anchored ? 'Unlink from node' : 'Anchor to a node (then click a node)', function () {
        if (anchored) { snapshot(); node.anchor = null; refreshNode(node); requestFrame(); }
        else { pendingAnchorNote = node.id; canvas.classList.add('wf-pickmode'); setStatus('Click a node to anchor this note to it · Esc to cancel'); }
      }));
    }
    btns.push(headButton(node.collapsed ? '▸' : '▾', node.collapsed ? 'Expand' : 'Collapse', function () {
      node.collapsed = !node.collapsed; refreshNode(node); requestFrame(); scheduleSave();
    }));
    btns.push(headButton('↺', 'Reset size and text zoom', function () {
      snapshot(); node.width = null; node.outH = null; node.fontScale = null; refreshNode(node); requestFrame(); scheduleSave();
    }));
    btns.push(headButton('×', 'Delete node (X)', function () {
      snapshot(); removeNode(node.id); requestFrame(); refreshStatus(); scheduleSave(); log('Removed node');
    }));
    var head = el('div', { class: 'wf-node-head' }, [el('span', { class: 'cat-dot' }), el('span', { class: 'title', title: title }, title)].concat(btns));
    head.addEventListener('dblclick', function (e) { e.stopPropagation(); node.collapsed = !node.collapsed; refreshNode(node); requestFrame(); scheduleSave(); });
    return head;
  }
  function addResizeHandles(box, node) {
    RZ_DIRS.forEach(function (dir) {
      var d = el('div', { class: 'wf-rz wf-rz-' + dir, title: 'Drag to resize' });
      d.addEventListener('mousedown', function (e) { startResize(node, e, dir); });
      box.appendChild(d);
    });
  }
  function onInputChange(node, inp, v) {
    beginEdit();
    // Typing into a wired field detaches the wire but keeps what you typed.
    if (inp.socket && isConnected(node.id, 'in', inp.name)) {
      var w = incomingWire(node.id, inp.name);
      if (w) {
        removeWire(w.id);
        var p = node._portEls && node._portEls['in:' + inp.name];
        if (p) p.classList.remove('connected');
        if (node._ctl[inp.name]) node._ctl[inp.name].classList.remove('linked');
        requestFrame();
        log('Detached ' + inp.name + ' (edited directly)');
      }
    }
    node.values[inp.name] = v;
    var def = getDef(node);
    if (def && def.onInput) {
      def.onInput(inp.name, node.values);
      Object.keys(node._ctl).forEach(function (nm) { if (nm !== inp.name) ui.setControlValue(node._ctl[nm], node.values[nm]); });
    }
    markDirty(node.id);
  }

  function renderNode(node) {
    var def = getDef(node);
    var box = el('div', { class: 'wf-node ' + catClass(node) });
    box.dataset.node = node.id;
    box.style.transform = 'translate(' + node.x + 'px,' + node.y + 'px)';
    if (node.width) box.style.width = node.width + 'px';
    if (node.fontScale) box.style.setProperty('--wf-fs', node.fontScale);
    box.classList.toggle('selected', !!selected[node.id]);
    box.classList.toggle('primary', primaryId === node.id);
    box.classList.toggle('collapsed', !!node.collapsed);

    node._box = box; node._views = {}; node._ctl = {}; node._growEls = []; node._cells = []; node._rows = []; node._portEls = {}; node._measured = false;
    box.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(DRAG_IGNORE)) return;
      startNodeDrag(node, e);
    });

    /* --- note node --- */
    if (isNote(node)) {
      box.appendChild(nodeHead(node, 'Note'));
      var ta = el('textarea', { placeholder: 'Comment…', spellcheck: 'false' });
      ta.value = node.note || '';
      ta.addEventListener('input', function () { beginEdit(); node.note = ta.value; scheduleSave(); });
      box.appendChild(ta);
      node._growEls.push({ el: ta, prop: 'height' });
      if (node.outH) ta.style.height = node.outH + 'px';
      addResizeHandles(box, node);
      world.appendChild(box);
      return box;
    }

    /* --- a node whose tool no longer exists --- */
    if (!def) {
      box.appendChild(nodeHead(node, node.toolId));
      box.appendChild(el('div', { class: 'wf-node-body' }, [
        el('div', { class: 'wf-node-err' }, 'This node’s tool (' + node.toolId + ') is not part of the toolkit any more. Delete it, or replace it with a current node — its wires have already been cut.')
      ]));
      addResizeHandles(box, node);
      world.appendChild(box);
      return box;
    }

    box.appendChild(nodeHead(node, def.name));
    var body = el('div', { class: 'wf-node-body' });
    var errEl = el('div', { class: 'wf-node-err' }); errEl.style.display = 'none';
    node._errEl = errEl; body.appendChild(errEl);

    var advWrap = null;
    ui.layoutRows(def.inputs).forEach(function (rowInputs) {
      var rowEl = el('div', { class: 'wf-inrow' });
      var socketInput = null;
      rowInputs.forEach(function (i) { if (i.socket && !socketInput) socketInput = i; });
      if (socketInput) {
        rowEl.classList.add('has-port');
        var pel = makePort(node, 'in', socketInput);
        node._portEls['in:' + socketInput.name] = pel;
        rowEl.appendChild(pel);
      }
      rowInputs.forEach(function (inp) {
        var connected = inp.socket && isConnected(node.id, 'in', inp.name);
        var ctl = ui.control(inp, node.values[inp.name], function (v) { onInputChange(node, inp, v); });
        if (connected) ctl.classList.add('linked');
        node._ctl[inp.name] = ctl;
        if (inp.control === 'textarea') { node._growEls.push({ el: ctl, prop: 'height' }); if (node.outH) ctl.style.height = node.outH + 'px'; }
        else if (ctl.__edit) { node._growEls.push({ el: ctl.__edit, prop: 'height' }); if (node.outH) ctl.__edit.style.height = node.outH + 'px'; }
        var labelEl = el('div', { class: 'wf-port-label' }, [
          el('span', { class: 'lab' }, inp.label || inp.name),
          inp.required ? el('span', { class: 'req', title: 'Required' }, '*') : null,
          inp.socket ? ui.typeTag(inp.type) : null
        ]);
        var cell = el('div', { class: 'wf-cell', title: fieldTip(inp) }, [labelEl, ctl]);
        cell.style.flex = (inp.flex || 1) + ' 1 0';
        rowEl.appendChild(cell);
        node._cells.push({ inp: inp, el: cell });
      });
      node._rows.push(rowEl);
      if (rowInputs.every(function (i) { return i.advanced; })) {
        if (!advWrap) {
          advWrap = el('details', { class: 'adv' });
          var sm = el('summary', null, 'More options');
          sm.addEventListener('mousedown', function (e) { e.stopPropagation(); });
          sm.addEventListener('click', function () { setTimeout(function () { measureNode(node); requestFrame(); }, 0); });
          advWrap.appendChild(sm);
        }
        advWrap.appendChild(rowEl);
      } else { body.appendChild(rowEl); }
    });
    if (advWrap) body.appendChild(advWrap);

    def.outputs.forEach(function (out) {
      var row = el('div', { class: 'wf-outrow' });
      var pel = makePort(node, 'out', out);
      node._portEls['out:' + out.name] = pel;
      row.appendChild(pel);
      var view = ui.outputView(out);
      var meta = el('span', { class: 'out-meta mono' }, '');
      view.meta = meta;
      // A textarea is sized by height; a scrolling div by max-height.
      if (out.type !== 'number') {
        var prop = view.isText ? 'height' : 'maxHeight';
        if (node.outH) view.el.style[prop] = node.outH + 'px';
        node._growEls.push({ el: view.el, prop: prop });
      }
      row.appendChild(el('div', { class: 'wf-out-head' }, [
        ui.typeTag(out.type),
        el('span', { class: 'lab' }, out.label || out.name),
        el('span', { class: 'spacer' }),
        meta,
        el('button', { class: 'icon-btn', type: 'button', title: 'Open the full value', onmousedown: function (e) { e.stopPropagation(); }, onclick: function (e) { e.stopPropagation(); view.open(); } }, 'open'),
        ui.copyButton(view.getText)
      ]));
      row.appendChild(view.el);
      body.appendChild(row);
      node._views[out.name] = view;
    });

    box.appendChild(body);
    addResizeHandles(box, node);
    world.appendChild(box);
    return box;
  }
  function fieldTip(inp) {
    var bits = [];
    if (inp.hint) bits.push(inp.hint);
    if (inp.default !== undefined && inp.default !== '' && inp.default !== null && inp.control !== 'checkbox') bits.push('Default: ' + inp.default);
    bits.push(inp.required ? 'Required' : 'Optional');
    return bits.join('  ·  ');
  }
  // Re-render a single node in place. Keeping its DOM position matters: the
  // paint order of overlapping nodes is the DOM order, so re-appending at the
  // end would quietly shuffle a node in front of its neighbours.
  function refreshNode(node) {
    var after = node._box ? node._box.nextSibling : null;
    if (node._box) node._box.remove();
    renderNode(node);
    if (after && node._box) world.insertBefore(node._box, after);
    updateNodeVisibility(node);
    updateNodeDisplay(node);
    measureNode(node);
  }

  function updateNodeVisibility(node) {
    if (!node._cells || !node._cells.length) return;
    var changed = false;
    node._cells.forEach(function (c) {
      var want = ui.visible(c.inp, node.values) ? '' : 'none';
      if (c.el.style.display !== want) { c.el.style.display = want; changed = true; }
    });
    node._rows.forEach(function (r) {
      var cells = r.querySelectorAll('.wf-cell'); if (!cells.length) return;
      var any = Array.prototype.some.call(cells, function (c) { return c.style.display !== 'none'; });
      var want = any ? '' : 'none';
      if (r.style.display !== want) { r.style.display = want; changed = true; }
    });
    if (changed) node._measured = false;
    return changed;
  }
  function updateNodeDisplay(node) {
    if (!node._views) return;
    if (node._errEl) {
      var msg = node._error || '';
      node._errEl.textContent = msg ? '⚠ ' + msg : '';
      node._errEl.style.display = msg ? '' : 'none';
      if (node._box) node._box.classList.toggle('has-error', !!msg);
    }
    Object.keys(node._views).forEach(function (name) {
      var view = node._views[name];
      view.set(node.outputs ? node.outputs[name] : '', null);
      view.meta.textContent = view.describe();
    });
    // Mirror upstream values into wired controls (unless you're typing in one).
    if (node._ctl) Object.keys(node._ctl).forEach(function (name) {
      if (!isConnected(node.id, 'in', name)) return;
      var ctl = node._ctl[name];
      if (ctl === document.activeElement || (ctl.__edit && ctl.__edit === document.activeElement)) return;
      var v = resolveInput(node, name);
      ui.setControlValue(ctl, stringify(v));
    });
  }

  /* ---- the dirty-node pipeline ------------------------------------------- */
  var dirty = null, dirtyReq = 0;
  function markDirty(id) {
    if (!autoRun) { setStatus('Auto-run is off — press Ctrl+Enter to recompute'); scheduleSave(); return; }
    dirty = dirty || {};
    dirty[id] = 1;
    if (dirtyReq) return;
    dirtyReq = raf(function () {
      dirtyReq = 0;
      var ids = Object.keys(dirty || {}); dirty = null;
      if (!ids.length) return;
      var touched = evaluate(ids);
      Object.keys(touched).forEach(function (nid) {
        var n = graph.nodes[nid]; if (!n) return;
        if (updateNodeVisibility(n)) measureNode(n);
        updateNodeDisplay(n);
      });
      requestFrame(Object.keys(touched));
      refreshStatus(); scheduleSave();
    });
  }
  function runAll() {
    evaluate(null);
    Object.keys(graph.nodes).forEach(function (id) {
      var n = graph.nodes[id];
      updateNodeVisibility(n); updateNodeDisplay(n);
    });
    requestFrame(); refreshStatus();
  }

  /* ---- full rebuild (load / undo / paste) -------------------------------- */
  function rebuildAll() {
    Array.prototype.forEach.call(world.querySelectorAll('.wf-node'), function (n) { n.remove(); });
    Array.prototype.forEach.call(wireLayer.querySelectorAll('.wf-wire'), function (p) { p.remove(); });
    graph.wires.forEach(function (w) { w._path = null; });
    Object.keys(graph.nodes).forEach(function (id) { renderNode(graph.nodes[id]); });
    evaluate(null);
    Object.keys(graph.nodes).forEach(function (id) {
      var n = graph.nodes[id];
      updateNodeVisibility(n); updateNodeDisplay(n); measureNode(n);
    });
    applyTransform();
    redrawWires(); drawMinimap(); refreshStatus();
  }

  /* ---- dragging ---------------------------------------------------------- */
  function positionNode(n) { if (n._box) n._box.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)'; }
  function startNodeDrag(node, e) {
    if (pendingAnchorNote) {
      var note = graph.nodes[pendingAnchorNote];
      if (note && !isNote(node) && node.id !== pendingAnchorNote) {
        snapshot(); note.anchor = node.id; note.dx = note.x - node.x; note.dy = note.y - node.y;
        refreshNode(note); log('Anchored note');
      }
      pendingAnchorNote = null; canvas.classList.remove('wf-pickmode'); refreshStatus();
      e.preventDefault(); return;
    }
    e.preventDefault();
    selectWire(null);
    if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelection(node.id); return; }
    if (!selected[node.id]) setSelection([node.id]);
    else { primaryId = node.id; refreshSelectedClasses(); }
    // Alt-drag duplicates instead of moving.
    if (e.altKey) { duplicateSelection(0, 0); }
    var movers = Object.keys(selected).map(function (k) { return graph.nodes[k]; }).filter(Boolean);
    var notes = Object.keys(graph.nodes).map(function (k) { return graph.nodes[k]; })
      .filter(function (n) { return isNote(n) && n.anchor && selected[n.anchor] && !selected[n.id]; });
    drag = { mode: 'node', origins: movers.concat(notes).map(function (n) { return { node: n, ox: n.x, oy: n.y }; }),
      sx: e.clientX, sy: e.clientY, moved: false, single: node };
    document.body.classList.add('wf-dragging');
  }
  function startResize(node, e, dir) {
    if (link) return;                                  // never resize mid-connection
    e.preventDefault(); e.stopPropagation();
    setSelection([node.id]);
    drag = { mode: 'resize', node: node, dir: dir, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y,
      ow: node.width || (node._box ? node._box.offsetWidth : DEFAULT_W), oh: node.outH || DEFAULT_OUTH, moved: false };
    document.body.classList.add('wf-dragging');
  }
  function startPan(e) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, opx: panX, opy: panY }; canvas.classList.add('panning'); }
  function startMarquee(e) {
    var p = toWorld(e.clientX, e.clientY);
    drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, wx: p.x, wy: p.y, add: e.shiftKey, base: Object.keys(selected) };
    marquee.style.display = '';
  }

  function onMouseMove(e) {
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    if (link && link.mode === 'drag') {
      var a = portPoint(link.node, link.io, link.port);
      var m = toWorld(e.clientX, e.clientY);
      if (a) tempPath.setAttribute('d', link.io === 'out' ? wirePath(a.x, a.y, m.x, m.y) : wirePath(m.x, m.y, a.x, a.y));
      return;
    }
    if (!drag) return;
    if (drag.mode === 'node') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      var dxw = (e.clientX - drag.sx) / scale, dyw = (e.clientY - drag.sy) / scale;
      var snap = !e.ctrlKey && !e.metaKey;
      var ids = [];
      drag.origins.forEach(function (o) {
        var nx = o.ox + dxw, ny = o.oy + dyw;
        if (snap) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
        o.node.x = nx; o.node.y = ny; positionNode(o.node); ids.push(o.node.id);
      });
      if (isNote(drag.single) && drag.single.anchor && graph.nodes[drag.single.anchor]) {
        var an = graph.nodes[drag.single.anchor];
        drag.single.dx = drag.single.x - an.x; drag.single.dy = drag.single.y - an.y;
      }
      requestFrame(ids);
    } else if (drag.mode === 'resize') {
      if (!drag.moved) { snapshot(); drag.moved = true; }
      var dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale, dir = drag.dir, n = drag.node;
      if (dir.indexOf('e') >= 0) n.width = Math.round(clamp(drag.ow + dx, MIN_W, MAX_W));
      if (dir.indexOf('w') >= 0) { var w = Math.round(clamp(drag.ow - dx, MIN_W, MAX_W)); n.x = drag.ox + (drag.ow - w); n.width = w; }
      if (dir.indexOf('s') >= 0) n.outH = Math.round(clamp(drag.oh + dy, MIN_H, MAX_H));
      if (n.width) n._box.style.width = n.width + 'px';
      positionNode(n);
      if (n.outH) n._growEls.forEach(function (g) { g.el.style[g.prop] = n.outH + 'px'; });
      n._measured = false;
      requestFrame([n.id]);
    } else if (drag.mode === 'pan') {
      panX = drag.opx + (e.clientX - drag.sx); panY = drag.opy + (e.clientY - drag.sy);
      applyTransform(); drawMinimapSoon();
    } else if (drag.mode === 'marquee') {
      var r = canvas.getBoundingClientRect();
      var x1 = Math.min(drag.sx, e.clientX) - r.left, y1 = Math.min(drag.sy, e.clientY) - r.top;
      var x2 = Math.max(drag.sx, e.clientX) - r.left, y2 = Math.max(drag.sy, e.clientY) - r.top;
      marquee.style.left = x1 + 'px'; marquee.style.top = y1 + 'px';
      marquee.style.width = (x2 - x1) + 'px'; marquee.style.height = (y2 - y1) + 'px';
      var a1 = toWorld(Math.min(drag.sx, e.clientX), Math.min(drag.sy, e.clientY));
      var a2 = toWorld(Math.max(drag.sx, e.clientX), Math.max(drag.sy, e.clientY));
      var hit = Object.keys(graph.nodes).filter(function (id) {
        var n = graph.nodes[id], w = n._w || DEFAULT_W, h = n._h || 120;
        return n.x < a2.x && n.x + w > a1.x && n.y < a2.y && n.y + h > a1.y;
      });
      setSelection(drag.add ? drag.base.concat(hit) : hit);
    }
  }
  function onMouseUp(e) {
    if (link && link.mode === 'drag') { finishDragLink(e); return; }
    if (!drag) return;
    if (drag.mode === 'node' || drag.mode === 'resize') {
      if (drag.mode === 'resize') measureNode(drag.node);
      requestFrame(); scheduleSave();
    }
    if (drag.mode === 'marquee') { marquee.style.display = 'none'; refreshStatus(); }
    canvas.classList.remove('panning');
    document.body.classList.remove('wf-dragging');
    drag = null;
  }

  /* ---- linking ----------------------------------------------------------- */
  function beginLink(nodeId, port, io, type, mode) {
    link = { node: nodeId, port: port, io: io, type: type, mode: mode, _downX: lastMouseX, _downY: lastMouseY };
    document.body.classList.add('wf-linking');
    tempPath.style.display = '';
    tempPath.setAttribute('class', 'wf-wire wf-wire-temp t-' + type);
    var a = portPoint(nodeId, io, port);
    if (a) tempPath.setAttribute('d', wirePath(a.x, a.y, a.x, a.y));
    highlightCompatible();
    setStatus(mode === 'click'
      ? 'Click a matching ' + (io === 'out' ? 'input' : 'output') + ' port to connect · Esc to cancel'
      : 'Drop on a matching port, or on empty canvas to pick a new node');
  }
  function endLink() {
    link = null;
    document.body.classList.remove('wf-linking');
    tempPath.style.display = 'none';
    Array.prototype.forEach.call(world.querySelectorAll('.wf-port'), function (p) { p.classList.remove('ok', 'no'); });
    refreshStatus();
  }
  function portFits(p) {
    if (!link) return false;
    if (p.dataset.io === link.io) return false;
    if (p.dataset.node === link.node) return false;
    var fromType = link.io === 'out' ? link.type : p.dataset.type;
    var toType = link.io === 'out' ? p.dataset.type : link.type;
    if (!typesFit(fromType, toType)) return false;
    var fromNode = link.io === 'out' ? link.node : p.dataset.node;
    var toNode = link.io === 'out' ? p.dataset.node : link.node;
    return !wouldCycle(fromNode, toNode);
  }
  function highlightCompatible() {
    Array.prototype.forEach.call(world.querySelectorAll('.wf-port'), function (p) {
      p.classList.remove('ok', 'no');
      p.classList.add(portFits(p) ? 'ok' : 'no');
    });
  }
  function completeLink(p) {
    var fromNode = link.io === 'out' ? link.node : p.dataset.node;
    var fromPort = link.io === 'out' ? link.port : p.dataset.port;
    var toNode = link.io === 'out' ? p.dataset.node : link.node;
    var toPort = link.io === 'out' ? p.dataset.port : link.port;
    var type = link.io === 'out' ? link.type : p.dataset.type;
    snapshot();
    connect(fromNode, fromPort, toNode, toPort, type);
    endLink();
  }
  function connect(fromNode, fromPort, toNode, toPort, type) {
    var prev = incomingWire(toNode, toPort);
    if (prev) {
      var pn = graph.nodes[prev.to.node];
      if (pn && pn._portEls && pn._portEls['in:' + prev.to.port]) pn._portEls['in:' + prev.to.port].classList.remove('connected');
    }
    var w = addWire({ node: fromNode, port: fromPort }, { node: toNode, port: toPort }, type);
    var a = graph.nodes[fromNode], b = graph.nodes[toNode];
    if (a && a._portEls['out:' + fromPort]) a._portEls['out:' + fromPort].classList.add('connected');
    if (b) {
      if (b._portEls['in:' + toPort]) b._portEls['in:' + toPort].classList.add('connected');
      if (b._ctl[toPort]) b._ctl[toPort].classList.add('linked');
    }
    updateWire(w);
    markDirty(toNode);
    log('Connected ' + (getDef(a) ? getDef(a).name : fromNode) + ' → ' + (getDef(b) ? getDef(b).name : toNode));
    return w;
  }
  function disconnect(w) {
    bakeInput(w.to.node, w.to.port);
    var b = graph.nodes[w.to.node], a = graph.nodes[w.from.node];
    removeWire(w.id);
    if (b) {
      if (b._portEls['in:' + w.to.port]) b._portEls['in:' + w.to.port].classList.remove('connected');
      if (b._ctl[w.to.port]) { b._ctl[w.to.port].classList.remove('linked'); ui.setControlValue(b._ctl[w.to.port], stringify(b.values[w.to.port])); }
    }
    if (a && a._portEls['out:' + w.from.port] && !isConnected(a.id, 'out', w.from.port)) a._portEls['out:' + w.from.port].classList.remove('connected');
    markDirty(w.to.node);
  }
  function onPortDown(e) {
    e.stopPropagation(); e.preventDefault();
    var io = this.dataset.io, nodeId = this.dataset.node, port = this.dataset.port, type = this.dataset.type;
    // Click-to-connect: a second click on a compatible port completes the link.
    if (link) { if (portFits(this)) { completeLink(this); return; } endLink(); }
    if (io === 'in') {
      var w = incomingWire(nodeId, port);
      if (w) {                                  // grabbing a wired input detaches and re-drags it
        var fn = w.from.node, fp = w.from.port, ft = w.type;
        snapshot(); disconnect(w); requestFrame();
        beginLink(fn, fp, 'out', ft, 'drag');
        return;
      }
    }
    lastMouseX = e.clientX; lastMouseY = e.clientY;
    beginLink(nodeId, port, io, type, 'drag');
  }
  function onPortUp(e) {
    if (!link || link.mode !== 'drag') return;
    if (portFits(this)) { e.stopPropagation(); completeLink(this); }
  }
  function finishDragLink(e) {
    var moved = Math.abs(e.clientX - link._downX) + Math.abs(e.clientY - link._downY) > 4;
    var target = document.elementFromPoint(e.clientX, e.clientY);
    var p = target && target.closest ? target.closest('.wf-port') : null;
    if (p && portFits(p)) { completeLink(p); return; }
    if (!moved) { link.mode = 'click'; setStatus('Now click a matching ' + (link.io === 'out' ? 'input' : 'output') + ' port · Esc to cancel'); return; }
    // Released over empty canvas: offer the nodes that could accept this value.
    if (target === canvas || target === world || target === svg || (target && target.classList && target.classList.contains('wf-world'))) {
      var pending = link;
      openAddMenu(e.clientX, e.clientY, toWorld(e.clientX, e.clientY), pending);
      endLink();
      return;
    }
    endLink();
  }

  /* ---- selection --------------------------------------------------------- */
  function refreshSelectedClasses() {
    Object.keys(graph.nodes).forEach(function (k) {
      var n = graph.nodes[k];
      if (!n._box) return;
      n._box.classList.toggle('selected', !!selected[k]);
      n._box.classList.toggle('primary', k === primaryId && !!selected[k]);
    });
  }
  function setSelection(ids, primary) {
    selected = {};
    (ids || []).forEach(function (i) { if (graph.nodes[i]) selected[i] = true; });
    primaryId = (primary !== undefined) ? primary : ((ids && ids.length) ? ids[ids.length - 1] : null);
    refreshSelectedClasses(); refreshStatus();
  }
  function toggleSelection(id) {
    if (selected[id]) { delete selected[id]; if (primaryId === id) primaryId = Object.keys(selected)[0] || null; }
    else { selected[id] = true; primaryId = id; }
    refreshSelectedClasses(); refreshStatus();
  }
  function selectWire(id) {
    selectedWire = id;
    graph.wires.forEach(function (w) { if (w._path) w._path.classList.toggle('selected', w.id === id); });
  }
  function selectedIds() { return Object.keys(selected).filter(function (i) { return graph.nodes[i]; }); }

  function copySelection() {
    var ids = selectedIds(); if (!ids.length) return;
    clipboard = {
      nodes: ids.map(function (id) { return serNode(graph.nodes[id]); }),
      wires: graph.wires.filter(function (w) { return selected[w.from.node] && selected[w.to.node]; })
        .map(function (w) { return { from: w.from, to: w.to, type: w.type }; })
    };
    setStatus('Copied ' + ids.length + ' node(s)');
  }
  function pasteAt(nodes, wires, ox, oy) {
    snapshot();
    var map = {}, newIds = [];
    nodes.forEach(function (n) { map[n.id] = uid('n'); });
    nodes.forEach(function (n) {
      var nn = { id: map[n.id], toolId: n.toolId, x: (n.x || 0) + ox, y: (n.y || 0) + oy,
        values: JSON.parse(JSON.stringify(n.values || {})), note: n.note || '',
        anchor: (n.anchor && map[n.anchor]) ? map[n.anchor] : null, dx: n.dx || 0, dy: n.dy || 0,
        width: n.width || null, outH: n.outH || null, fontScale: n.fontScale || null, collapsed: !!n.collapsed, outputs: {} };
      graph.nodes[nn.id] = nn; newIds.push(nn.id);
    });
    wires.forEach(function (w) {
      if (map[w.from.node] && map[w.to.node]) graph.wires.push({ id: uid('w'), from: { node: map[w.from.node], port: w.from.port }, to: { node: map[w.to.node], port: w.to.port }, type: w.type });
    });
    topoCache = null;
    newIds.forEach(function (id) { renderNode(graph.nodes[id]); });
    evaluate(newIds);
    newIds.forEach(function (id) { var n = graph.nodes[id]; updateNodeVisibility(n); updateNodeDisplay(n); measureNode(n); });
    setSelection(newIds);
    requestFrame(); scheduleSave();
    return newIds;
  }
  function pasteClipboard() { if (clipboard && clipboard.nodes.length) { var n = pasteAt(clipboard.nodes, clipboard.wires, 36, 36); setStatus('Pasted ' + n.length + ' node(s)'); } }
  function duplicateSelection(ox, oy) {
    var ids = selectedIds(); if (!ids.length) return;
    var nodes = ids.map(function (id) { return serNode(graph.nodes[id]); });
    var wires = graph.wires.filter(function (w) { return selected[w.from.node] && selected[w.to.node]; }).map(function (w) { return { from: w.from, to: w.to, type: w.type }; });
    pasteAt(nodes, wires, ox == null ? 30 : ox, oy == null ? 30 : oy);
  }
  function deleteSelection() {
    if (selectedWire) { var w = graph.wires.filter(function (x) { return x.id === selectedWire; })[0]; if (w) { snapshot(); disconnect(w); selectWire(null); requestFrame(); scheduleSave(); return; } }
    var ids = selectedIds(); if (!ids.length) return;
    snapshot(); ids.forEach(removeNode);
    requestFrame(); refreshStatus(); scheduleSave();
    setStatus('Deleted ' + ids.length + ' node(s)');
  }

  /* ---- auto-connect (the C shortcut) ------------------------------------- */
  // Wire the selected nodes into a chain, left to right, choosing the first
  // output/input pair whose types fit and whose input is still free.
  function connectSelected() {
    var ids = selectedIds();
    if (ids.length < 2) { setStatus('Select two or more nodes, then press C to chain them'); return; }
    ids.sort(function (a, b) { return graph.nodes[a].x - graph.nodes[b].x || graph.nodes[a].y - graph.nodes[b].y; });
    snapshot();
    var made = 0;
    for (var i = 0; i < ids.length - 1; i++) {
      var pair = bestPair(ids[i], ids[i + 1]);
      if (pair) { connect(ids[i], pair.out, ids[i + 1], pair.in, pair.type); made++; }
    }
    requestFrame();
    setStatus(made ? 'Connected ' + made + ' link(s)' : 'No compatible sockets between those nodes');
    if (!made) undo();
  }
  function bestPair(aId, bId) {
    var a = getDef(graph.nodes[aId]), b = getDef(graph.nodes[bId]);
    if (!a || !b || wouldCycle(aId, bId)) return null;
    var outs = a.outputs || [], ins = (b.inputs || []).filter(function (i) { return i.socket; });
    for (var i = 0; i < ins.length; i++) {
      if (isConnected(bId, 'in', ins[i].name)) continue;
      for (var j = 0; j < outs.length; j++) {
        if (typesFit(outs[j].type, ins[i].type)) return { out: outs[j].name, in: ins[i].name, type: outs[j].type };
      }
    }
    return null;
  }

  /* ---- view: zoom / pan / fit / arrange ---------------------------------- */
  function applyTransform() {
    world.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
    canvas.style.backgroundSize = (GRID * scale) + 'px ' + (GRID * scale) + 'px';
    canvas.style.backgroundPosition = panX + 'px ' + panY + 'px';
    if (els.zoom) els.zoom.textContent = Math.round(scale * 100) + '%';
  }
  function zoomAt(factor, cx, cy) {
    var wx = (cx - panX) / scale, wy = (cy - panY) / scale;
    scale = clamp(scale * factor, ZMIN, ZMAX);
    panX = cx - wx * scale; panY = cy - wy * scale;
    applyTransform(); drawMinimapSoon(); scheduleSave();
  }
  function zoomButton(factor) { var r = canvas.getBoundingClientRect(); zoomAt(factor, r.width / 2, r.height / 2); }
  function bounds(ids) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(function (id) {
      var n = graph.nodes[id]; if (!n) return;
      var w = n._w || DEFAULT_W, h = n._h || 140;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    });
    return isFinite(minX) ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null;
  }
  function fit(ids) {
    ids = (ids && ids.length) ? ids : Object.keys(graph.nodes);
    var b = bounds(ids);
    if (!b) { scale = 1; panX = 40; panY = 40; applyTransform(); drawMinimap(); return; }
    var pad = 60, bw = (b.maxX - b.minX) + pad * 2, bh = (b.maxY - b.minY) + pad * 2;
    var cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
    scale = clamp(Math.min(cw / bw, ch / bh), ZMIN, 1.4);
    panX = (cw - bw * scale) / 2 - (b.minX - pad) * scale;
    panY = (ch - bh * scale) / 2 - (b.minY - pad) * scale;
    applyTransform(); drawMinimap(); scheduleSave();
  }
  function autoArrange() {
    var ids = Object.keys(graph.nodes).filter(function (i) { return !isNote(graph.nodes[i]); });
    if (!ids.length) return;
    snapshot();
    var depth = {}; ids.forEach(function (i) { depth[i] = 0; });
    topoOrder().forEach(function (i) {
      if (isNote(graph.nodes[i])) return;
      graph.wires.forEach(function (w) {
        if (w.from.node === i && graph.nodes[w.to.node] && !isNote(graph.nodes[w.to.node])) depth[w.to.node] = Math.max(depth[w.to.node], depth[i] + 1);
      });
    });
    var layers = {}; ids.forEach(function (i) { (layers[depth[i]] = layers[depth[i]] || []).push(i); });
    var x = 40;
    Object.keys(layers).sort(function (a, b) { return a - b; }).forEach(function (d) {
      var colW = 0, y = 40;
      layers[d].forEach(function (id) {
        var n = graph.nodes[id];
        n.x = x; n.y = y;
        colW = Math.max(colW, n._w || DEFAULT_W);
        y += (n._h || 160) + 40;
        positionNode(n);
      });
      x += colW + 90;
    });
    Object.keys(graph.nodes).forEach(function (id) {
      var n = graph.nodes[id];
      if (isNote(n) && n.anchor && graph.nodes[n.anchor]) { var a = graph.nodes[n.anchor]; n.x = a.x + (n.dx || 0); n.y = a.y + (n.dy || 0); positionNode(n); }
    });
    redrawWires(); fit(); scheduleSave();
    setStatus('Tidied ' + ids.length + ' nodes');
  }

  /* ---- minimap ----------------------------------------------------------- */
  var miniReq = 0;
  function drawMinimapSoon() { if (miniReq) return; miniReq = raf(function () { miniReq = 0; drawMinimap(); }); }
  function drawMinimap() {
    if (!minictx || minimap.parentNode.classList.contains('hidden')) return;
    var W = minimap.width, H = minimap.height;
    minictx.clearRect(0, 0, W, H);
    var ids = Object.keys(graph.nodes);
    var cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 600;
    var view = { minX: -panX / scale, minY: -panY / scale, maxX: (-panX + cw) / scale, maxY: (-panY + ch) / scale };
    var b = bounds(ids) || { minX: view.minX, minY: view.minY, maxX: view.maxX, maxY: view.maxY };
    b = { minX: Math.min(b.minX, view.minX), minY: Math.min(b.minY, view.minY), maxX: Math.max(b.maxX, view.maxX), maxY: Math.max(b.maxY, view.maxY) };
    var pad = 40, bw = (b.maxX - b.minX) + pad * 2, bh = (b.maxY - b.minY) + pad * 2;
    var k = Math.min(W / bw, H / bh);
    var ox = (W - bw * k) / 2 - (b.minX - pad) * k, oy = (H - bh * k) / 2 - (b.minY - pad) * k;
    minimap._k = k; minimap._ox = ox; minimap._oy = oy;
    var css = getComputedStyle(canvas);
    minictx.strokeStyle = css.getPropertyValue('--wf-mini-view').trim() || '#888';
    minictx.fillStyle = css.getPropertyValue('--wf-mini-node').trim() || '#888';
    ids.forEach(function (id) {
      var n = graph.nodes[id];
      minictx.fillRect(n.x * k + ox, n.y * k + oy, Math.max(2, (n._w || DEFAULT_W) * k), Math.max(2, (n._h || 140) * k));
    });
    minictx.lineWidth = 1.5;
    minictx.strokeRect(view.minX * k + ox, view.minY * k + oy, (view.maxX - view.minX) * k, (view.maxY - view.minY) * k);
  }
  function minimapTo(e) {
    var r = minimap.getBoundingClientRect();
    var mx = (e.clientX - r.left) * (minimap.width / r.width), my = (e.clientY - r.top) * (minimap.height / r.height);
    var wx = (mx - minimap._ox) / minimap._k, wy = (my - minimap._oy) / minimap._k;
    panX = (canvas.clientWidth / 2) - wx * scale; panY = (canvas.clientHeight / 2) - wy * scale;
    applyTransform(); drawMinimap();
  }

  /* ---- persistence ------------------------------------------------------- */
  function serNode(n) {
    return { id: n.id, toolId: n.toolId, x: n.x, y: n.y, values: n.values, note: n.note, anchor: n.anchor,
      dx: n.dx, dy: n.dy, width: n.width, outH: n.outH, fontScale: n.fontScale, collapsed: !!n.collapsed };
  }
  function serializeGraph() {
    return { nextId: nextId, nodes: Object.keys(graph.nodes).map(function (id) { return serNode(graph.nodes[id]); }),
      wires: graph.wires.map(function (w) { return { id: w.id, from: w.from, to: w.to, type: w.type }; }) };
  }
  function serializeFull() { var g = serializeGraph(); g.panX = panX; g.panY = panY; g.scale = scale; g.version = 2; return g; }
  function loadGraph(data) {
    graph = { nodes: {}, wires: [] };
    nextId = data.nextId || 1; selected = {}; primaryId = null; selectedWire = null; topoCache = null;
    var moved = 0, missing = 0;
    (data.nodes || []).forEach(function (n) {
      var toolId = n.toolId;
      var newId = MBT.resolveId ? MBT.resolveId(toolId) : null;
      if (newId) { toolId = newId; moved++; }
      var node = { id: n.id, toolId: toolId, x: n.x || 0, y: n.y || 0, values: n.values || {}, note: n.note || '',
        anchor: n.anchor || null, dx: n.dx || 0, dy: n.dy || 0, width: n.width || null, outH: n.outH || null,
        fontScale: n.fontScale || null, collapsed: !!n.collapsed, outputs: {} };
      var def = getDef(node);
      if (def) def.inputs.forEach(function (inp) { if (node.values[inp.name] === undefined) node.values[inp.name] = ui.defaultValue(inp); });
      else if (!isNote(node)) missing++;
      graph.nodes[n.id] = node;
    });
    // Drop wires whose endpoints no longer exist or no longer have that socket.
    graph.wires = (data.wires || []).filter(function (w) {
      var a = graph.nodes[w.from.node], b = graph.nodes[w.to.node];
      if (!a || !b) return false;
      var da = getDef(a), db = getDef(b);
      if (!da || !db) return false;
      var hasOut = (da.outputs || []).some(function (o) { return o.name === w.from.port; });
      var hasIn = (db.inputs || []).some(function (i) { return i.name === w.to.port && i.socket; });
      return hasOut && hasIn;
    });
    if (moved) log('Updated ' + moved + ' node(s) to their current tool');
    if (missing && MBT.log) MBT.log.warn(missing + ' node(s) reference a tool that no longer exists — shown as placeholders you can delete.');
  }
  function loadView(data) { if (data.panX != null) panX = data.panX; if (data.panY != null) panY = data.panY; if (data.scale) scale = clamp(data.scale, ZMIN, ZMAX); }

  function loadStore() { try { return JSON.parse(localStorage.getItem(PKEY)); } catch (e) { return null; } }
  function persistStore() { try { localStorage.setItem(PKEY, JSON.stringify(store)); } catch (e) { if (MBT.log) MBT.log.warn('Could not save workspace (storage full?)'); } }
  function projectList() {
    return Object.keys(store.projects).map(function (id) { return { id: id, name: store.projects[id].name, updated: store.projects[id].updated || 0 }; })
      .sort(function (a, b) { return b.updated - a.updated; });
  }
  function saveCurrent() {
    if (!store || !currentId || !store.projects[currentId]) return;
    store.projects[currentId].data = serializeFull();
    store.projects[currentId].updated = Date.now();
    store.currentId = currentId;
    // Merge into whatever is actually on disk instead of overwriting it, so a
    // second tab (or a workspace saved since we loaded) does not get wiped.
    // We only ever claim the workspace we have open.
    var disk = loadStore();
    if (disk && disk.projects) {
      Object.keys(disk.projects).forEach(function (id) {
        if (id === currentId) return;
        var mine = store.projects[id];
        if (!mine || (disk.projects[id].updated || 0) > (mine.updated || 0)) store.projects[id] = disk.projects[id];
      });
    }
    persistStore();
  }
  var saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 400); }
  function openProject(id) {
    if (!store.projects[id]) return;
    currentId = id; store.currentId = id;
    var data = store.projects[id].data || {};
    loadGraph(data); loadView(data);
    undoStack.length = 0; redoStack.length = 0; updateHistoryButtons();
    rebuildAll(); refreshProjectSelect(); persistStore();
    log('Opened workspace: ' + store.projects[id].name);
  }
  function switchProject(id) { if (id === currentId) return; saveCurrent(); openProject(id); }
  function newProject() {
    var name = prompt('Name for the new workspace:', 'Untitled');
    if (name == null) return;
    saveCurrent();
    var id = pid();
    store.projects[id] = { name: name || 'Untitled', data: { nextId: 1, nodes: [], wires: [], panX: 60, panY: 40, scale: 1 }, updated: Date.now() };
    persistStore(); openProject(id);
  }
  function renameProject() {
    var p = store.projects[currentId]; if (!p) return;
    var name = prompt('Rename workspace:', p.name);
    if (name == null) return;
    p.name = name || p.name; p.updated = Date.now(); persistStore(); refreshProjectSelect();
  }
  function deleteProject() {
    var p = store.projects[currentId];
    if (!confirm('Delete the workspace “' + (p ? p.name : '') + '”? This cannot be undone.')) return;
    delete store.projects[currentId];
    if (!Object.keys(store.projects).length) {
      var id = pid();
      store.projects[id] = { name: 'Untitled', data: { nextId: 1, nodes: [], wires: [], panX: 60, panY: 40, scale: 1 }, updated: Date.now() };
    }
    persistStore(); openProject(projectList()[0].id);
  }
  function refreshProjectSelect() {
    if (!els.proj) return;
    ui.clear(els.proj);
    projectList().forEach(function (p) {
      var o = el('option', { value: p.id }, p.name);
      if (p.id === currentId) o.selected = true;
      els.proj.appendChild(o);
    });
  }

  function demoData() {
    var sample = '>example mRNA fragment\n1 auggccauu gagaaauggc\n21 auuaaggccg u';
    return { nextId: 20, panX: 40, panY: 40, scale: 1,
      nodes: [
        { id: 'n1', toolId: '__text__', x: 20, y: 20, values: { text: sample } },
        { id: 'n2', toolId: 'clean-sequence', x: 360, y: 20, values: { removeNumbers: true, removeSymbols: true, whitespace: 'all', case: 'upper' } },
        { id: 'n3', toolId: 'sequence-stats', x: 720, y: 0, values: {} },
        { id: 'n4', toolId: 'sequence-converter', x: 720, y: 300, values: { from: 'RNA', to: 'Protein' } },
        { id: 'n5', toolId: 'reading-frames', x: 720, y: 600, values: { type: 'RNA' } }
      ],
      wires: [
        { id: 'w1', from: { node: 'n1', port: 'text' }, to: { node: 'n2', port: 'text' }, type: 'text' },
        { id: 'w2', from: { node: 'n2', port: 'text' }, to: { node: 'n3', port: 'seq' }, type: 'text' },
        { id: 'w3', from: { node: 'n2', port: 'text' }, to: { node: 'n4', port: 'seq' }, type: 'text' },
        { id: 'w4', from: { node: 'n2', port: 'text' }, to: { node: 'n5', port: 'seq' }, type: 'text' }
      ] };
  }
  function loadExample() { snapshot(); var d = demoData(); loadGraph(d); loadView(d); rebuildAll(); scheduleSave(); }
  function initProjects() {
    store = loadStore();
    if (!store || !store.projects || !Object.keys(store.projects).length) {
      store = { currentId: null, projects: {} };
      var old = null; try { old = localStorage.getItem('mbt-workflow'); } catch (e) {}
      var id = pid();
      if (old) { try { store.projects[id] = { name: 'My workflow', data: JSON.parse(old), updated: Date.now() }; } catch (e) { old = null; } }
      if (!old) store.projects[id] = { name: 'Example', data: demoData(), updated: Date.now() };
      store.currentId = id; persistStore();
    }
    currentId = (store.currentId && store.projects[store.currentId]) ? store.currentId : projectList()[0].id;
  }

  /* ---- add-node menu ----------------------------------------------------- */
  // pending = an in-flight link; when set, the menu only offers nodes that can
  // accept (or produce) that value, and wires the new node up automatically.
  function openAddMenu(x, y, spawnPos, pending) {
    closeAddMenu();
    var menu = el('div', { class: 'wf-menu', id: 'wfAddMenu' });
    var search = el('input', { class: 'wf-menu-search', type: 'text', placeholder: pending ? 'Search compatible nodes…' : 'Search nodes…  (type, then Enter)', spellcheck: 'false' });
    var list = el('div', { class: 'wf-menu-list' });
    var items = [], cursor = 0;

    function matchPort(def) {
      if (!pending) return null;
      if (pending.io === 'out') {
        var ins = (def.inputs || []).filter(function (i) { return i.socket && typesFit(pending.type, i.type); });
        return ins.length ? { in: ins[0].name } : null;
      }
      var outs = (def.outputs || []).filter(function (o) { return typesFit(o.type, pending.type); });
      return outs.length ? { out: outs[0].name } : null;
    }
    function spawn(toolId, label) {
      snapshot();
      var x0 = spawnPos ? spawnPos.x : (-panX / scale + 90), y0 = spawnPos ? spawnPos.y : (-panY / scale + 90);
      var n = addNode(toolId, x0, y0);
      renderNode(n); evaluate([n.id]); updateNodeVisibility(n); updateNodeDisplay(n); measureNode(n);
      if (pending) {
        var def = getDef(n), m = def ? matchPort(def) : null;
        if (m) {
          if (pending.io === 'out') { n.x = Math.round(x0); connect(pending.node, pending.port, n.id, m.in, pending.type); }
          else { connect(n.id, m.out, pending.node, pending.port, pending.type); n.x = Math.round(x0 - (n._w || DEFAULT_W)); positionNode(n); measureNode(n); }
        }
      }
      remember(toolId);
      setSelection([n.id]);
      requestFrame(); refreshStatus(); scheduleSave(); closeAddMenu();
      log('Added node: ' + label);
    }
    function item(def, label, toolId) {
      var b = el('button', { type: 'button', class: 'wf-menu-item' }, [
        el('span', { class: 'mi-name' }, label),
        def && def.description ? el('span', { class: 'mi-desc' }, def.description) : null
      ]);
      b.addEventListener('click', function () { spawn(toolId, label); });
      b.addEventListener('mouseenter', function () { cursor = items.indexOf(rec); paint(); });
      var rec = { q: ((label + ' ' + ((def && def.description) || '') + ' ' + ((def && def.keywords) || '')).toLowerCase()), btn: b, toolId: toolId, label: label };
      items.push(rec);
      return b;
    }
    function head(text) { return el('div', { class: 'menu-cat' }, text); }

    var heads = [];
    function section(title, defs) {
      var usable = defs.filter(function (d) { return !pending || matchPort(d); });
      if (!usable.length) return;
      var h = head(title); heads.push(h); list.appendChild(h);
      usable.forEach(function (d) { list.appendChild(item(d, d.name, d.id)); });
    }
    section('Input', [TEXT_DEF, NUM_DEF]);
    if (!pending) { var h0 = head('Annotate'); heads.push(h0); list.appendChild(h0); list.appendChild(item({ name: 'Note', id: '__note__', description: 'A sticky note you can pin to a node.' }, 'Note', '__note__')); }
    if (!pending && recent.length) {
      var rdefs = recent.map(function (id) { return BUILTIN[id] || MBT.getTool(id); }).filter(Boolean);
      if (rdefs.length) section('Recent', rdefs);
    }
    MBT.categoriesFor().forEach(function (cat) { section(cat, MBT.toolsByCategory(cat)); });

    var empty = el('div', { class: 'wf-menu-empty' }, pending ? 'No node accepts a “' + pending.type + '” value there.' : 'No matching node.');
    empty.style.display = 'none'; list.appendChild(empty);

    function paint() {
      items.forEach(function (it, i) { it.btn.classList.toggle('active', i === cursor && it.btn.style.display !== 'none'); });
      var act = items[cursor];
      if (act && act.btn.style.display !== 'none' && act.btn.scrollIntoView) {
        try { act.btn.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    }
    function applyFilter() {
      var q = search.value.trim().toLowerCase(), shown = [];
      items.forEach(function (it) {
        var hit = !q || q.split(/\s+/).every(function (t) { return it.q.indexOf(t) !== -1; });
        it.btn.style.display = hit ? '' : 'none';
        if (hit) shown.push(it);
      });
      heads.forEach(function (h) { h.style.display = q ? 'none' : ''; });
      empty.style.display = shown.length ? 'none' : '';
      cursor = shown.length ? items.indexOf(shown[0]) : -1;
      paint();
    }
    function move(d) {
      var vis = items.filter(function (it) { return it.btn.style.display !== 'none'; });
      if (!vis.length) return;
      var at = vis.indexOf(items[cursor]);
      at = clamp(at + d, 0, vis.length - 1);
      cursor = items.indexOf(vis[at]); paint();
    }
    search.addEventListener('input', applyFilter);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); var it = items[cursor]; if (it && it.btn.style.display !== 'none') spawn(it.toolId, it.label); }
      else if (e.key === 'Escape') { e.preventDefault(); closeAddMenu(); }
    });

    menu.appendChild(search);
    menu.appendChild(list);
    menu.appendChild(el('div', { class: 'wf-menu-foot' }, pending ? 'Only nodes that fit a ' + pending.type + ' value are listed' : '↑↓ to move · Enter to add · Esc to close'));
    document.body.appendChild(menu);
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - mh - 8)) + 'px';
    applyFilter();
    setTimeout(function () { document.addEventListener('mousedown', outsideMenu); search.focus(); }, 0);
  }
  function outsideMenu(e) { if (!e.target.closest('#wfAddMenu')) closeAddMenu(); }
  function closeAddMenu() { var m = document.getElementById('wfAddMenu'); if (m) m.remove(); document.removeEventListener('mousedown', outsideMenu); }
  function remember(id) { if (id.slice(0, 2) === '__') return; recent = [id].concat(recent.filter(function (r) { return r !== id; })).slice(0, 5); }

  /* ---- help -------------------------------------------------------------- */
  var SHORTCUTS = [
    ['Space / A', 'Add a node where the cursor is (type to search)'],
    ['Double-click', 'Same, on empty canvas'],
    ['Drag a port', 'Connect — drop on a matching port'],
    ['Click a port', 'Connect without dragging: click one, then the other'],
    ['Port → empty', 'Drop on empty canvas to pick a compatible node and auto-wire'],
    ['C', 'Chain the selected nodes together, left to right'],
    ['Click a wire', 'Select it · Delete removes it · double-click removes at once'],
    ['Drag header/body', 'Move node(s) — hold Ctrl for free (un-snapped) movement'],
    ['Drag an edge', 'Resize: left/right set width, bottom grows the boxes'],
    ['Alt + drag', 'Duplicate the node and drag the copy'],
    ['Shift + drag', 'Marquee-select on empty canvas (or flip the mode button)'],
    ['Middle-drag', 'Pan from anywhere — dragging the background pans too'],
    ['Scroll', 'Zoom · Ctrl+scroll over a box zooms only that node’s text'],
    ['F', 'Fit — the selection if there is one, otherwise everything'],
    ['X / Delete', 'Delete the selection'],
    ['Ctrl + D', 'Duplicate'], ['Ctrl + C / V', 'Copy / paste nodes'],
    ['Ctrl + A', 'Select all'], ['Ctrl + Z / Y', 'Undo / redo'],
    ['Ctrl + Enter', 'Recompute now (needed when auto-run is off)'],
    ['Arrow keys', 'Nudge the selection · Shift for a bigger step'],
    ['Esc', 'Cancel a connection, a note anchor, or the menu'],
    ['Drop a .json', 'Import a workspace exported from here']
  ];
  function toggleShortcuts() {
    var ex = document.getElementById('wfHelp');
    if (ex) { ex.remove(); return; }
    var panel = el('div', { class: 'wf-help', id: 'wfHelp' }, [
      el('div', { class: 'wf-help-head' }, [el('span', null, 'Keyboard & mouse'), el('button', { class: 'icon-btn', type: 'button', onclick: function () { panel.remove(); } }, 'close')])
    ].concat(SHORTCUTS.map(function (s) {
      return el('div', { class: 'wf-help-row' }, [el('span', { class: 'kbd' }, s[0]), el('span', null, s[1])]);
    })));
    document.body.appendChild(panel);
  }

  /* ---- import / export --------------------------------------------------- */
  function exportJson() {
    var name = ((store.projects[currentId] && store.projects[currentId].name) || 'workflow').replace(/[^\w-]+/g, '_');
    ui.download('worst-toolkit-' + name + '.json', JSON.stringify(serializeFull(), null, 2), 'application/json');
    log('Exported workspace');
  }
  function importFile(f) {
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        snapshot();
        var d = JSON.parse(fr.result);
        loadGraph(d); loadView(d); rebuildAll(); scheduleSave();
        setStatus('Imported ' + (f.name || 'workspace'));
      } catch (e) {
        if (MBT.log) MBT.log.error('Import failed: ' + e.message);
        alert('That file could not be read as a workspace.\n\n' + e.message);
      }
    };
    fr.readAsText(f);
  }
  function importJson() {
    var inp = el('input', { type: 'file', accept: 'application/json' });
    inp.addEventListener('change', function () { importFile(inp.files[0]); });
    inp.click();
  }

  /* ---- status bar -------------------------------------------------------- */
  var statusTimer = null;
  function setStatus(msg) {
    if (!statusEl) return;
    els.msg.textContent = msg || '';
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(function () { els.msg.textContent = ''; }, 4000);
  }
  function refreshStatus() {
    if (!statusEl) return;
    var n = Object.keys(graph.nodes).length, w = graph.wires.length, s = selectedIds().length;
    els.counts.textContent = n + (n === 1 ? ' node' : ' nodes') + ' · ' + w + (w === 1 ? ' link' : ' links') +
      (s ? ' · ' + s + ' selected' : '');
    els.perf.textContent = lastEvalCount ? (lastEvalCount + ' computed in ' + lastEvalMs.toFixed(1) + ' ms') : '';
  }

  /* ---- toolbar ----------------------------------------------------------- */
  function btn(label, fn, title, cls) {
    var b = el('button', { class: 'btn btn-sm ' + (cls || ''), type: 'button', title: title || '' }, label);
    b.addEventListener('click', fn);
    return b;
  }
  function sep() { return el('span', { class: 'wf-sep' }); }
  function buildToolbar() {
    els.proj = el('select', { class: 'wf-proj-select', title: 'Switch workspace' });
    els.proj.addEventListener('change', function () { switchProject(els.proj.value); });

    var addBtn = btn('+ Node', function (e) {
      e.stopPropagation();
      var r = addBtn.getBoundingClientRect();
      openAddMenu(r.left, r.bottom + 6, { x: -panX / scale + 120, y: -panY / scale + 120 });
    }, 'Add a node (Space)', 'btn-primary');

    els.undo = btn('undo', undo, 'Undo (Ctrl+Z)');
    els.redo = btn('redo', redo, 'Redo (Ctrl+Y)');
    els.zoom = el('button', { class: 'wf-zoom-label', type: 'button', title: 'Reset zoom to 100%' }, '100%');
    els.zoom.addEventListener('click', function () { var r = canvas.getBoundingClientRect(); zoomAt(1 / scale, r.width / 2, r.height / 2); });

    // Which mode the plain left-drag on empty canvas is in. Shift always does
    // the other one, so this is a convenience rather than a mode you get stuck in.
    els.mode = btn('drag: pan', function () {
      panMode = !panMode;
      els.mode.textContent = 'drag: ' + (panMode ? 'pan' : 'select');
      els.mode.classList.toggle('is-off', !panMode);
      canvas.classList.toggle('select-mode', !panMode);
    }, 'What dragging the empty canvas does (Shift always does the other)');

    els.auto = btn('auto-run: on', function () {
      autoRun = !autoRun;
      els.auto.textContent = 'auto-run: ' + (autoRun ? 'on' : 'off');
      els.auto.classList.toggle('is-off', !autoRun);
      if (autoRun) runAll();
      setStatus(autoRun ? 'Recomputing as you type' : 'Paused — press Ctrl+Enter to recompute');
    }, 'Pause recomputation while you build a big graph');

    var bar = el('div', { class: 'wf-toolbar' }, [
      el('span', { class: 'wf-proj-wrap' }, [els.proj,
        btn('+', newProject, 'New workspace'),
        btn('rename', renameProject, 'Rename this workspace'),
        btn('delete', deleteProject, 'Delete this workspace')]),
      sep(), addBtn, btn('tidy', autoArrange, 'Auto-arrange the graph'),
      sep(), els.undo, els.redo,
      sep(), btn('−', function () { zoomButton(1 / 1.2); }, 'Zoom out'), els.zoom, btn('+', function () { zoomButton(1.2); }, 'Zoom in'),
      btn('fit', function () { fit(selectedIds()); }, 'Fit the selection, or everything (F)'),
      sep(), els.mode, els.auto,
      el('span', { class: 'spacer' }),
      btn('example', loadExample, 'Load the demo pipeline'),
      btn('clear', function () { if (!Object.keys(graph.nodes).length || confirm('Remove every node from this workspace?')) { snapshot(); graph = { nodes: {}, wires: [] }; topoCache = null; rebuildAll(); scheduleSave(); } }, 'Empty this workspace'),
      btn('export', exportJson, 'Download this workspace as .json'),
      btn('import', importJson, 'Load a .json workspace'),
      btn('? keys', toggleShortcuts, 'Keyboard & mouse reference')
    ]);
    updateHistoryButtons();
    return bar;
  }

  /* ---- mount ------------------------------------------------------------- */
  function mount(container) {
    if (store && currentId) { try { saveCurrent(); } catch (e) {} }
    undoStack.length = 0; redoStack.length = 0;
    ui.clear(container);

    canvas = el('div', { class: 'wf-canvas' });
    world = el('div', { class: 'wf-world' });
    svg = svgEl('svg', { class: 'wf-svg' });
    wireLayer = svgEl('g', { class: 'wf-wires' });
    tempPath = svgEl('path', { class: 'wf-wire wf-wire-temp' });
    tempPath.style.display = 'none';
    svg.appendChild(wireLayer); svg.appendChild(tempPath);
    world.appendChild(svg);
    marquee = el('div', { class: 'wf-marquee' }); marquee.style.display = 'none';
    canvas.appendChild(world); canvas.appendChild(marquee);

    minimap = el('canvas', { class: 'wf-minimap-canvas', width: 220, height: 140 });
    // No 2d context in a headless DOM — the minimap is then simply absent.
    try { minictx = minimap.getContext('2d'); } catch (e) { minictx = null; }
    var miniWrap = el('div', { class: 'wf-minimap' }, [minimap,
      el('button', { class: 'wf-mini-toggle icon-btn', type: 'button', title: 'Hide the minimap', onclick: function () { miniWrap.classList.toggle('hidden'); drawMinimap(); } }, 'map')]);
    minimap.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); minimapTo(e); var mv = function (ev) { minimapTo(ev); }; var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); });
    canvas.appendChild(miniWrap);

    els.counts = el('span', { class: 'wf-status-counts' }, '');
    els.msg = el('span', { class: 'wf-status-msg' }, '');
    els.perf = el('span', { class: 'wf-status-perf mono' }, '');
    statusEl = el('div', { class: 'wf-status' }, [els.counts, els.msg, el('span', { class: 'spacer' }), els.perf,
      el('span', { class: 'wf-status-hint' }, 'Space to add · drag or click ports to connect · ? keys for the rest')]);

    container.appendChild(el('div', { class: 'wf-page' }, [buildToolbar(), canvas, statusEl]));

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 1) { e.preventDefault(); startPan(e); return; }
      if (e.target !== canvas && e.target !== world && e.target !== svg && e.target !== marquee) return;
      if (link) { endLink(); return; }
      if (pendingAnchorNote) { pendingAnchorNote = null; canvas.classList.remove('wf-pickmode'); refreshStatus(); return; }
      selectWire(null);
      if (e.shiftKey || e.ctrlKey || e.metaKey || !panMode) { setSelection(e.shiftKey ? selectedIds() : []); startMarquee(e); }
      else { setSelection([]); startPan(e); }
    });
    canvas.addEventListener('dblclick', function (e) {
      if (e.target !== canvas && e.target !== world && e.target !== svg) return;
      openAddMenu(e.clientX, e.clientY, toWorld(e.clientX, e.clientY));
    });
    canvas.addEventListener('wheel', function (e) {
      // Ctrl/⌘ + wheel over a box zooms that node's TEXT only.
      if (e.ctrlKey || e.metaKey) {
        var tb = e.target && e.target.closest ? e.target.closest('.wf-node textarea, .wf-node .ctl, .wf-node .out-val') : null;
        var nb = tb ? tb.closest('.wf-node') : null;
        if (nb && graph.nodes[nb.dataset.node]) {
          e.preventDefault();
          var nd = graph.nodes[nb.dataset.node];
          nd.fontScale = clamp((nd.fontScale || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.5, 3);
          nb.style.setProperty('--wf-fs', nd.fontScale);
          nd._measured = false; requestFrame([nd.id]); scheduleSave();
          return;
        }
      }
      var sc = e.target && e.target.closest ? e.target.closest('textarea, .out-val, .ctl-rich, .out-table-wrap') : null;
      if (sc && sc.scrollHeight > sc.clientHeight + 1) return;     // let the box scroll
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    canvas.addEventListener('auxclick', function (e) { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('dragover', function (e) { e.preventDefault(); canvas.classList.add('wf-dropping'); });
    canvas.addEventListener('dragleave', function (e) { if (e.target === canvas) canvas.classList.remove('wf-dropping'); });
    canvas.addEventListener('drop', function (e) {
      e.preventDefault(); canvas.classList.remove('wf-dropping');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.json$/i.test(f.name)) importFile(f);
      else if (f) alert('Drop a .json workspace exported from here.');
    });
    // Wire hit-testing lives on the SVG layer so a click on a curve is cheap.
    wireLayer.addEventListener('click', function (e) {
      var id = e.target && e.target.dataset ? e.target.dataset.wire : null;
      if (!id) return;
      selectWire(selectedWire === id ? null : id);
      setSelection([]);
      setStatus('Wire selected — press Delete to remove it');
    });
    wireLayer.addEventListener('dblclick', function (e) {
      var id = e.target && e.target.dataset ? e.target.dataset.wire : null;
      if (!id) return;
      var w = graph.wires.filter(function (x) { return x.id === id; })[0];
      if (w) { snapshot(); disconnect(w); selectWire(null); requestFrame(); scheduleSave(); setStatus('Connection removed'); }
    });

    if (!docBound) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', function () { drawMinimapSoon(); });
      docBound = true;
    }
    initProjects(); openProject(currentId);
  }

  /* ---- keyboard ---------------------------------------------------------- */
  function onKeyDown(e) {
    if (!document.querySelector('.wf-canvas')) return;
    if (document.getElementById('wfAddMenu') || document.getElementById('mbtInspector')) return;
    if (e.key === 'Escape') {
      if (link) { endLink(); return; }
      if (pendingAnchorNote) { pendingAnchorNote = null; if (canvas) canvas.classList.remove('wf-pickmode'); refreshStatus(); return; }
      if (selectedWire) { selectWire(null); return; }
    }
    var t = document.activeElement, tag = t ? t.tagName : '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'Enter') { e.preventDefault(); runAll(); setStatus('Recomputed'); return; }
    if (typing) return;
    var hasSel = window.getSelection && String(window.getSelection()).trim().length > 0;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (ctrl && k === 'c') { if (hasSel) return; e.preventDefault(); copySelection(); }
    else if (ctrl && k === 'v') { e.preventDefault(); pasteClipboard(); }
    else if (ctrl && k === 'd') { e.preventDefault(); duplicateSelection(); }
    else if (ctrl && k === 'a') { if (hasSel) return; e.preventDefault(); setSelection(Object.keys(graph.nodes)); }
    else if (ctrl) return;
    else if (e.key === ' ') { e.preventDefault(); openAddMenu(lastMouseX, lastMouseY, toWorld(lastMouseX, lastMouseY)); }
    else if (k === 'a') { e.preventDefault(); openAddMenu(lastMouseX, lastMouseY, toWorld(lastMouseX, lastMouseY)); }
    else if (k === 'f') { e.preventDefault(); fit(selectedIds()); }
    else if (k === 'c') { e.preventDefault(); connectSelected(); }
    else if (k === 'n') { e.preventDefault(); var p = toWorld(lastMouseX, lastMouseY); snapshot(); var nn = addNode('__note__', p.x, p.y); renderNode(nn); measureNode(nn); setSelection([nn.id]); scheduleSave(); }
    else if (k === '?' || k === 'h') { e.preventDefault(); toggleShortcuts(); }
    else if (k === 'x' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (e.key.indexOf('Arrow') === 0) {
      var ids = selectedIds(); if (!ids.length) return;
      e.preventDefault();
      var step = e.shiftKey ? GRID * 5 : GRID;
      var dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      var dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      beginEdit();
      ids.forEach(function (id) { var n = graph.nodes[id]; n.x += dx; n.y += dy; positionNode(n); });
      requestFrame(ids); scheduleSave();
    }
  }

  MBT.workflow = { mount: mount };
})(window.MBT);
