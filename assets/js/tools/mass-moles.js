/* DNA Mass ⇄ Moles — convert ng ↔ pmol for a known length. */
(function () {
  var MW = { dsDNA: 650, ssDNA: 330, ssRNA: 340 }, AVOGADRO = 6.022e23;
  function isBlank(v) { return v === '' || v == null; }
  function calc(length, type, ng, pmol) {
    var mw = MW[type] || 650;
    if (!(length > 0)) return { result: NaN, summary: 'Enter a positive length.' };
    var haveNg = !isBlank(ng), havePmol = !isBlank(pmol);
    if (haveNg === havePmol) return { result: NaN, summary: 'Enter exactly one of mass (ng) or moles (pmol); leave the other blank to solve for it.' };
    var outNg, outPmol;
    if (haveNg) { outNg = ng; outPmol = ng * 1000 / (length * mw); } else { outPmol = pmol; outNg = pmol * length * mw / 1000; }
    var molecules = outPmol * 1e-12 * AVOGADRO, solvedVal = haveNg ? outPmol : outNg;
    return { result: +solvedVal.toPrecision(5), summary: [
      (haveNg ? 'Moles: ' + (+outPmol.toPrecision(5)) + ' pmol' : 'Mass: ' + (+outNg.toPrecision(5)) + ' ng'), '',
      type + ', ' + length + (type === 'dsDNA' ? ' bp' : ' nt') + '  (MW ≈ ' + mw + ' g/mol per ' + (type === 'dsDNA' ? 'bp' : 'nt') + ')',
      'Mass ' + (+outNg.toPrecision(5)) + ' ng  ↔  ' + (+outPmol.toPrecision(5)) + ' pmol',
      '≈ ' + molecules.toExponential(2) + ' molecules'
    ].join('\n') };
  }
  MBT.registerTool({
    id: 'mass-moles',
    name: 'DNA Mass ⇄ Moles',
    category: 'Calculators',
    description: 'Convert between ng and pmol for DNA/RNA of a known length. Leave one blank to solve.',
    inputs: [
      { name: 'length', label: 'Length', control: 'number', default: 1000, min: 1, step: 'any', hint: 'bp for dsDNA, nt for single-stranded.' },
      { name: 'type', label: 'Molecule type', control: 'select', default: 'dsDNA', options: [
        { value: 'dsDNA', label: 'dsDNA (650 g/mol/bp)' }, { value: 'ssDNA', label: 'ssDNA (330 g/mol/nt)' }, { value: 'ssRNA', label: 'ssRNA (340 g/mol/nt)' }] },
      { name: 'ng', label: 'Mass (ng)', control: 'number', step: 'any', placeholder: 'leave blank to solve' },
      { name: 'pmol', label: 'Moles (pmol)', control: 'number', step: 'any', placeholder: 'leave blank to solve' }
    ],
    outputs: [
      { name: 'result', label: 'Solved value', type: 'number' },
      { name: 'summary', label: 'Details', type: 'text' }
    ],
    compute: function (inp) { return calc(inp.length, inp.type, inp.ng, inp.pmol); },
    doc: '<p>Converts between the mass and the molar amount of a nucleic acid, given its length. Enter the ' +
      'length and either the mass (ng) or the moles (pmol); leave the other blank to solve for it. The result ' +
      'also reports the approximate number of molecules.</p>' +
      '<p><strong>Method.</strong> Average molecular weight per unit: dsDNA ≈ 650 g/mol per bp, ssDNA ≈ 330 ' +
      'and ssRNA ≈ 340 g/mol per nt. Then <code>pmol = ng × 1000 / (length × MW_per_unit)</code> (and the ' +
      'inverse). Molecules = pmol × 10⁻¹² × 6.022×10²³.</p>',
    code: "pmol = ng * 1000 / (length * MWperUnit);   // MW: ds 650, ssDNA 330, ssRNA 340\n" +
      "ng   = pmol * length * MWperUnit / 1000;\n" +
      "molecules = pmol * 1e-12 * 6.022e23;"
  });
})();
