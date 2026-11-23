/* Ligation Calculator — insert mass for a target insert:vector molar ratio. */
(function () {
  function calc(vectorNg, vectorBp, insertBp, ratio) {
    if (!(vectorNg > 0) || !(vectorBp > 0) || !(insertBp > 0) || !(ratio > 0)) return { insertNg: NaN, summary: 'Enter positive values for vector mass, both lengths, and the molar ratio.' };
    var insertNg = ratio * vectorNg * (insertBp / vectorBp);
    return { insertNg: +insertNg.toPrecision(4), summary: [
      'Insert needed: ' + (+insertNg.toPrecision(4)) + ' ng', '',
      'For a ' + ratio + ' : 1 (insert : vector) molar ratio',
      'with ' + vectorNg + ' ng of vector (' + vectorBp + ' bp) and a ' + insertBp + ' bp insert.', '',
      'Formula: insert ng = ratio × vector ng × (insert bp ÷ vector bp).'
    ].join('\n') };
  }
  MBT.registerTool({
    id: 'ligation-calculator',
    name: 'Ligation Calculator',
    category: 'Calculators',
    description: 'How much insert to add for a target insert:vector molar ratio (NEB-style).',
    inputs: [
      { name: 'vectorNg', label: 'Vector mass (ng)', control: 'number', default: 50, min: 0, step: 'any' },
      { name: 'vectorBp', label: 'Vector length (bp)', control: 'number', default: 5000, min: 1, step: 'any' },
      { name: 'insertBp', label: 'Insert length (bp)', control: 'number', default: 1000, min: 1, step: 'any' },
      { name: 'ratio', label: 'Insert : vector molar ratio', control: 'number', default: 3, min: 0, step: 'any', hint: 'Common: 3:1 or 5:1 for sticky ends, up to 7:1 for blunt.' }
    ],
    outputs: [
      { name: 'insertNg', label: 'Insert to add (ng)', type: 'number' },
      { name: 'summary', label: 'Details', type: 'text' }
    ],
    compute: function (inp) { return calc(inp.vectorNg, inp.vectorBp, inp.insertBp, inp.ratio); },
    doc: '<p>For a ligation you usually fix the amount of vector and want a certain molar ratio of insert to ' +
      'vector. Because longer DNA weighs more per molecule, the mass needed scales with the length ratio.</p>' +
      '<p><strong>Formula</strong> (same as the NEBioCalculator ligation tool): ' +
      '<code>insert ng = ratio × vector ng × (insert bp ÷ vector bp)</code>. So at a 3:1 ratio with 50 ng of ' +
      'a 5000 bp vector and a 1000 bp insert you need 3 × 50 × (1000/5000) = 30 ng of insert.</p>',
    code: "insert_ng = ratio * vector_ng * (insert_bp / vector_bp);"
  });
})();
