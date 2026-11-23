/* Degenerate Base Finder/Replacer — find IUPAC degenerate bases (non-ACGTU)
 * and optionally replace them. The from/to selectors only show when you pick
 * "Replace a specific code". */
(function () {
  var Bio = MBT.bio;
  function degenRe() { return new RegExp('[' + Bio.DEGENERATE_CODES.join('') + ']', 'g'); }
  function run(seq, action, fromBase, toBase) {
    var s = Bio.lettersOnly(seq);
    if (!s) return { report: '', result: '', count: 0 };
    var found = {}, total = 0, positions = {};
    for (var i = 0; i < s.length; i++) { var b = s[i]; if (Bio.isDegenerate(b)) { found[b] = (found[b] || 0) + 1; total++; (positions[b] = positions[b] || []).push(i + 1); } }
    var codes = Object.keys(found).sort();
    var lines = ['Sequence length: ' + s.length + ' · ' + total + ' degenerate base(s) found.'];
    if (!codes.length) lines.push('None — sequence is all A/C/G/T/U.');
    else codes.forEach(function (c) { var pos = positions[c]; lines.push('  ' + c + ' (' + Bio.IUPAC[c] + ') ×' + found[c] + '  @ ' + (pos.slice(0, 12).join(', ') + (pos.length > 12 ? ', …' : ''))); });
    var result = s, note = '';
    if (action === 'allN') { result = s.replace(degenRe(), 'N'); note = 'Replaced all degenerate bases with N.'; }
    else if (action === 'allRemove') { result = s.replace(degenRe(), ''); note = 'Removed all degenerate bases.'; }
    else if (action === 'specific' && fromBase) { var t = toBase === 'remove' ? '' : toBase; result = s.split(fromBase).join(t); note = 'Replaced ' + fromBase + ' → ' + (toBase === 'remove' ? '(removed)' : toBase) + '.'; }
    if (note) lines.push('', note);
    return { report: lines.join('\n'), result: result, count: total };
  }
  var degenOptions = Bio.DEGENERATE_CODES.map(function (c) { return { value: c, label: c + ' (' + Bio.IUPAC[c] + ')' }; });
  function isSpecific(v) { return v.action === 'specific'; }
  MBT.registerTool({
    id: 'degenerate-bases', name: 'Degenerate Base Finder/Replacer', category: 'Sequence Tools',
    description: 'Find IUPAC degenerate bases (non-ACGT) and optionally replace them — handy when a tool rejects ambiguity codes.',
    inputs: [
      { name: 'seq', label: 'Sequence', control: 'textarea', rows: 6, placeholder: 'Paste DNA/RNA…' },
      { name: 'action', label: 'Action', control: 'select', default: 'report', socket: false, options: [
        { value: 'report', label: 'Report only (find them)' }, { value: 'allN', label: 'Replace ALL degenerate → N' },
        { value: 'allRemove', label: 'Remove ALL degenerate' }, { value: 'specific', label: 'Replace a specific code…' }] },
      { name: 'fromBase', label: 'Replace code', control: 'select', default: 'N', socket: false, row: 'fr', flex: 1, options: degenOptions, visibleWhen: isSpecific },
      { name: 'toBase', label: 'With', control: 'select', default: 'N', socket: false, row: 'fr', flex: 1, visibleWhen: isSpecific, options: [
        { value: 'A', label: 'A' }, { value: 'C', label: 'C' }, { value: 'G', label: 'G' }, { value: 'T', label: 'T' }, { value: 'U', label: 'U' }, { value: 'N', label: 'N' }, { value: 'remove', label: '(remove)' }] }
    ],
    outputs: [
      { name: 'report', label: 'Degenerate bases found', type: 'text', mono: true },
      { name: 'result', label: 'Sequence after replacement', type: 'text', mono: true },
      { name: 'count', label: 'Degenerate count', type: 'number' }
    ],
    compute: function (inp) { return run(inp.seq, inp.action, inp.fromBase, inp.toBase); },
    doc: '<p>IUPAC ambiguity codes (R, Y, S, W, K, M, B, D, H, V, N) represent more than one base, and many ' +
      'aligners/primer tools reject them. This finds every such base (with counts and positions) and can clean ' +
      'them up.</p>' +
      '<p><strong>Actions.</strong> <em>Report only</em> lists what is present. <em>Replace ALL → N</em> ' +
      'collapses ambiguity to N. <em>Remove ALL</em> deletes them. <em>Replace a specific code</em> (then choose ' +
      'from/to) swaps one chosen code for a base or removes it. A base is “degenerate” if it is an IUPAC code ' +
      'outside A/C/G/T/U; each expands to its set (e.g. R = AG).</p>',
    code: "isDegenerate(b) = IUPAC[b] && 'ACGTU'.indexOf(b) === -1;\n" +
      "all→N:  seq.replace(/[RYSWKMBDHVN]/g,'N');\n" +
      "specific:  seq.split(fromCode).join(toBase);"
  });
})();
