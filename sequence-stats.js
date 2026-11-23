/* Sequence Stats / Character Counter — length, composition, GC%, MW. */
(function () {
  var Bio = MBT.bio;
  function pct(n, total) { return total ? (100 * n / total).toFixed(1) + '%' : '0%'; }
  function stats(seq) {
    var s = Bio.lettersOnly(seq), n = s.length;
    if (!n) return { length: 0, gc: 0, summary: '' };
    var comp = Bio.composition(s), gcFrac = Bio.gcFraction(s), order = ['A', 'C', 'G', 'T', 'U'];
    var lines = ['Length: ' + n + ' characters'];
    order.forEach(function (b) { if (comp[b]) lines.push('  ' + b + ': ' + comp[b] + '  (' + pct(comp[b], n) + ')'); });
    var others = Object.keys(comp).filter(function (b) { return order.indexOf(b) === -1; });
    if (others.length) { var oc = others.reduce(function (a, b) { return a + comp[b]; }, 0); lines.push('  other (' + others.sort().join('') + '): ' + oc + '  (' + pct(oc, n) + ')'); }
    lines.push('GC content: ' + (gcFrac * 100).toFixed(1) + '%');
    if (/^[ACGTU]+$/.test(s)) lines.push('ssDNA MW ≈ ' + Math.round(Bio.ssDnaMW(s)).toLocaleString() + ' g/mol');
    return { length: n, gc: +(gcFrac * 100).toFixed(1), summary: lines.join('\n') };
  }
  MBT.registerTool({
    id: 'sequence-stats',
    name: 'Sequence Stats',
    category: 'Sequence Tools',
    description: 'Character count, base composition, GC% and approximate molecular weight.',
    inputs: [{ name: 'seq', label: 'Sequence', control: 'textarea', rows: 6, placeholder: 'Paste a sequence…' }],
    outputs: [
      { name: 'length', label: 'Length (characters)', type: 'number' },
      { name: 'gc', label: 'GC %', type: 'number' },
      { name: 'summary', label: 'Full breakdown', type: 'text', mono: true }
    ],
    compute: function (inp) { return stats(inp.seq); },
    doc: '<p>Quick vital statistics for a sequence, including a numeric <code>length</code> and <code>GC%</code> ' +
      'output you can branch off in the Workflow builder (e.g. into a calculator).</p>' +
      '<p><strong>GC content</strong> is computed over A/C/G/T/U (S counts as GC, W as AT); other characters ' +
      'are ignored. <strong>Molecular weight</strong> is the standard anhydrous estimate for a 5′-OH ' +
      'single-stranded DNA oligo and is shown only for pure nucleotide sequences.</p>',
    code: "length = lettersOnly(seq).length;\n" +
      "GC%    = 100 * (#G + #C) / (#A + #C + #G + #T/U);\n" +
      "ssDNA MW = 313.21·nA + 304.20·nT + 289.18·nC + 329.21·nG − 61.96"
  });
})();
