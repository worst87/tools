/* ============================================================================
 * registry.js  —  Central tool registry + global namespace.
 *
 * Every tool is defined ONCE with MBT.registerTool({...}). That single
 * definition powers BOTH:
 *    1. the standalone tool page (auto-generated form), and
 *    2. the node editor (auto-generated node with typed sockets).
 *
 * To add a tool: create one file in assets/js/tools/, call registerTool(), and
 * add one <script> line in index.html. To remove one: delete both. Nothing
 * else needs to change.
 *
 * ---- TOOL DEFINITION SCHEMA -------------------------------------------------
 * {
 *   id:          'unique-id',              // used in URLs and the registry
 *   name:        'Human Name',
 *   category:    one of MBT.categories,
 *   description: 'One short sentence.',
 *   keywords:    'extra search terms',     // optional; helps search find it
 *   inputs: [ {                            // each input = 1 form field + 1 socket
 *       name:    'seq',                    // key inside the object passed to compute()
 *       label:   'DNA sequence',
 *       type:    'text' | 'number',        // socket data type (connection compatibility)
 *       control: 'textarea'|'text'|'number'|'select'|'checkbox'|'richtext',
 *       socket:  true|false,               // can receive a wire? (default: not select/checkbox)
 *       options: [ {value, label} ],       // for control:'select'
 *       default: '',                       // initial value
 *       placeholder: '', hint: '',         // UI helpers
 *       required: true,                    // marks the field with *
 *       advanced: true,                    // collapses into "More options"
 *       row: 'a', flex: 2,                 // put several inputs on one line
 *       visibleWhen: function (values) {}, // show/hide dynamically
 *       min, max, step                     // for control:'number'
 *   } ],
 *   outputs: [ {
 *       name:  'result',                   // key returned by compute()
 *       label: 'Result',
 *       type:  'text' | 'number' | 'table' | 'html',
 *       seq:   true                        // render as a sequence (monospace + ruler)
 *   } ],
 *   compute(inputs) { return { result: ... }; },  // PURE; should not throw
 *   onInput(name, values) {},              // optional: react to an edit
 *   doc: '<p>…</p>', code: '…'             // the tool page is its own documentation
 * }
 * ==========================================================================*/

window.MBT = window.MBT || {};

(function (MBT) {
  'use strict';

  MBT.tools = [];                 // ordered list of tool definitions
  MBT._toolsById = {};            // id -> definition

  // The fixed category order used by the home page AND the add-node menu.
  MBT.categories = ['Cleanup & Format', 'Sequence Tools', 'Calculators'];

  // A one-line blurb per category, shown on the home rail and the node menu.
  MBT.categoryBlurb = {
    'Cleanup & Format': 'Tidy pasted text into something a tool will accept.',
    'Sequence Tools': 'Transform, search and measure sequences.',
    'Calculators': 'Bench arithmetic — dilutions, ligations, mixes.'
  };

  // Tool ids that have been merged away. A saved workspace or bookmark that
  // still points at one is silently redirected instead of breaking.
  MBT.legacyIds = {
    'number-remover': 'clean-sequence',
    'whitespace-remover': 'clean-sequence',
    'case-converter': 'clean-sequence'
  };

  /** Register a tool. Fills in sensible defaults so tool files stay terse. */
  MBT.registerTool = function (def) {
    if (!def || !def.id) throw new Error('registerTool: missing id');
    if (MBT._toolsById[def.id]) throw new Error('Duplicate tool id: ' + def.id);
    // Fail at load, not at first click: a tool with no compute() is a typo.
    if (typeof def.compute !== 'function') throw new Error('Tool "' + def.id + '" has no compute() function');
    if (!(def.outputs || []).length) throw new Error('Tool "' + def.id + '" declares no outputs');
    if (MBT.categories.indexOf(def.category) < 0) {
      // Not fatal — the tool still works, but say so loudly during development.
      if (MBT.log) MBT.log.warn('Tool "' + def.id + '" has unknown category "' + def.category + '"');
    }

    (def.inputs || []).forEach(function (inp) {
      if (inp.type == null) inp.type = (inp.control === 'number') ? 'number' : 'text';
      if (inp.control == null) inp.control = (inp.type === 'number') ? 'number' : 'text';
      // Sockets accept wires by default for free-text/number data; selects and
      // checkboxes are "settings" and are not connectable unless asked.
      if (inp.socket == null) inp.socket = !(inp.control === 'select' || inp.control === 'checkbox');
    });
    (def.outputs || []).forEach(function (out) { if (out.type == null) out.type = 'text'; });

    // Precomputed haystack for the home search and the add-node menu.
    def._search = (def.name + ' ' + (def.description || '') + ' ' + (def.keywords || '') + ' ' +
      def.category + ' ' + def.id).toLowerCase();

    MBT.tools.push(def);
    MBT._toolsById[def.id] = def;
    return def;
  };

  /** Look up a tool, following legacy id redirects. */
  MBT.getTool = function (id) {
    if (MBT._toolsById[id]) return MBT._toolsById[id];
    var moved = MBT.legacyIds[id];
    return moved ? (MBT._toolsById[moved] || null) : null;
  };

  /** The id a legacy id should become, or null if `id` is already current. */
  MBT.resolveId = function (id) {
    if (MBT._toolsById[id]) return null;
    var moved = MBT.legacyIds[id];
    return (moved && MBT._toolsById[moved]) ? moved : null;
  };

  MBT.toolsByCategory = function (category) {
    return MBT.tools.filter(function (t) { return t.category === category; });
  };

  /** Categories that actually have tools, in MBT.categories order. */
  MBT.categoriesFor = function () {
    return MBT.categories.filter(function (c) { return MBT.toolsByCategory(c).length > 0; });
  };

  /** Free-text search over every tool. Returns definitions, best-ish first. */
  MBT.searchTools = function (query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return MBT.tools.slice();
    var terms = q.split(/\s+/);
    return MBT.tools.filter(function (t) {
      return terms.every(function (term) { return t._search.indexOf(term) !== -1; });
    }).sort(function (a, b) {
      // Prefer a hit in the name over a hit buried in the description.
      var an = a.name.toLowerCase().indexOf(terms[0]), bn = b.name.toLowerCase().indexOf(terms[0]);
      if (an < 0) an = 99; if (bn < 0) bn = 99;
      return an - bn;
    });
  };

  /** Run a tool's compute() safely. Returns { ok, outputs, error }. */
  MBT.run = function (tool, inputs) {
    try {
      var outputs = tool.compute(inputs || {}) || {};
      return { ok: true, outputs: outputs, error: null };
    } catch (e) {
      var msg = (e && e.message) || String(e);
      if (MBT.log) MBT.log.error('compute "' + (tool && tool.id) + '": ' + msg, e && e.stack);
      return { ok: false, outputs: {}, error: msg };
    }
  };

})(window.MBT);
