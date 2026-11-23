/* ============================================================================
 * registry.js  —  Central tool registry + global namespace.
 *
 * Every tool in this site is defined ONCE using MBT.registerTool({...}).
 * That single definition powers BOTH:
 *    1. the standalone tool page (auto-generated form), and
 *    2. the workflow node editor (auto-generated node with typed sockets).
 *
 * This is the heart of the "modular" design: to add a tool, create one file
 * in assets/js/tools/, call registerTool(), and add one <script> line in
 * index.html. To remove a tool, delete the file + the script line. Nothing
 * else needs to change.
 *
 * ---- TOOL DEFINITION SCHEMA -------------------------------------------------
 * {
 *   id:          'unique-id',              // used in URLs and the registry
 *   name:        'Human Name',
 *   group:       'bio' | 'code',           // which canvas (default 'bio')
 *   category:    'Cleanup & Format' | 'Sequence Tools' | 'Calculators' | <code cat>,
 *   description: 'One short sentence.',
 *   inputs: [ {                            // each input = 1 form field + 1 socket
 *       name:    'seq',                    // key inside the object passed to compute()
 *       label:   'DNA sequence',
 *       type:    'text' | 'number',        // socket data type (connection compatibility)
 *       control: 'textarea'|'text'|'number'|'select'|'checkbox',
 *       socket:  true|false,               // can receive a workflow wire? (default below)
 *       options: [ {value, label} ],       // for control:'select'
 *       default: '',                       // initial value
 *       placeholder: '', hint: '',         // UI helpers
 *       min, max, step                     // for control:'number'
 *   } ],
 *   outputs: [ {
 *       name:  'result',                   // key returned by compute()
 *       label: 'Result',
 *       type:  'text' | 'number',          // socket data type
 *       mono:  true                        // render value in monospace (sequences)
 *   } ],
 *   compute(inputs) { return { result: ... }; }  // PURE function, must not throw
 * }
 * ==========================================================================*/

window.MBT = window.MBT || {};

(function (MBT) {
  'use strict';

  MBT.tools = [];                 // ordered list of tool definitions
  MBT._toolsById = {};            // id -> definition

  // The fixed category order for the biology home page + Workflow canvas.
  MBT.categories = ['Cleanup & Format', 'Sequence Tools', 'Calculators'];

  // ---- Canvas groups --------------------------------------------------------
  // Every tool belongs to a "group" — a separate canvas/world of tools that
  // share the SAME engine (workflow.js) but don't mix on the canvas:
  //   • 'bio'  → the molecular-biology tools (home page + Workflow canvas)
  //   • 'code' → the WSL / path / command-line tools (Coding canvas)
  // A tool with no group defaults to 'bio'. To add a code tool, register it
  // with { group: 'code', category: '<your category>' } — nothing else changes.
  // categoryOrder pins a preferred category order per group; any category not
  // listed still shows, appended in first-seen order.
  MBT.categoryOrder = { bio: MBT.categories, code: ['Paths', 'FASTQ', 'Reads / QC', 'Align', 'Loop', 'BAM / SAM', 'Docker', 'Output'] };

  /** Register a tool. Fills in sensible defaults so tool files stay terse. */
  MBT.registerTool = function (def) {
    if (!def || !def.id) throw new Error('registerTool: missing id');
    if (MBT._toolsById[def.id]) throw new Error('Duplicate tool id: ' + def.id);

    if (def.group == null) def.group = 'bio';     // which canvas this tool lives on

    (def.inputs || []).forEach(function (inp) {
      if (inp.type == null) inp.type = (inp.control === 'number') ? 'number' : 'text';
      if (inp.control == null) inp.control = (inp.type === 'number') ? 'number' : 'text';
      // Sockets accept wires by default for free-text/number data; selects and
      // checkboxes are "settings" and are not connectable unless asked.
      if (inp.socket == null) {
        inp.socket = !(inp.control === 'select' || inp.control === 'checkbox');
      }
    });
    (def.outputs || []).forEach(function (out) {
      if (out.type == null) out.type = 'text';
    });

    MBT.tools.push(def);
    MBT._toolsById[def.id] = def;
    return def;
  };

  MBT.getTool = function (id) { return MBT._toolsById[id] || null; };

  // Tools in a category, scoped to a group (defaults to 'bio' for back-compat).
  MBT.toolsByCategory = function (category, group) {
    group = group || 'bio';
    return MBT.tools.filter(function (t) { return t.category === category && (t.group || 'bio') === group; });
  };

  // Ordered list of categories that actually have tools in a given group.
  // Honours categoryOrder first, then appends any extras in first-seen order.
  MBT.categoriesFor = function (group) {
    group = group || 'bio';
    var order = MBT.categoryOrder[group] || [], seen = [];
    MBT.tools.forEach(function (t) { if ((t.group || 'bio') === group && seen.indexOf(t.category) < 0) seen.push(t.category); });
    var out = order.filter(function (c) { return seen.indexOf(c) >= 0; });
    seen.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    return out;
  };

  /** Run a tool's compute() safely. Returns { ok, outputs, error }.
   *  Any thrown error is also reported to the activity log (if present). */
  MBT.run = function (tool, inputs) {
    try {
      var outputs = tool.compute(inputs || {}) || {};
      return { ok: true, outputs: outputs, error: null };
    } catch (e) {
      var msg = (e && e.message) || String(e);
      if (MBT.log) MBT.log.error('compute "' + (tool && tool.id) + '": ' + msg);
      return { ok: false, outputs: {}, error: msg };
    }
  };

})(window.MBT);
