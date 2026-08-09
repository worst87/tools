/* Dilution Calculator — C1·V1 = C2·V2. Leave one field blank to solve. */
(function () {
  function isBlank(v) { return v === '' || v == null; }
  function solve(c1, v1, c2, v2) {
    var vals = { c1: c1, v1: v1, c2: c2, v2: v2 };
    var blanks = Object.keys(vals).filter(function (k) { return isBlank(vals[k]); });
    if (blanks.length !== 1) return { result: NaN, summary: 'Leave exactly one field blank to solve for it (you left ' + blanks.length + ').\nC1·V1 = C2·V2 — keep concentration units consistent and volume units consistent.' };
    var k = blanks[0], r;
    if (k === 'c1') r = (c2 * v2) / v1; else if (k === 'v1') r = (c2 * v2) / c1; else if (k === 'c2') r = (c1 * v1) / v2; else r = (c1 * v1) / c2;
    if (!isFinite(r)) return { result: NaN, summary: 'Cannot solve — check for a zero in the denominator.' };
    var label = { c1: 'Stock concentration C1', v1: 'Stock volume V1', c2: 'Final concentration C2', v2: 'Final volume V2' }[k];
    var lines = [label + ' = ' + (+r.toPrecision(6))];
    if (k === 'v1') { var diluent = v2 - r; lines.push('', 'Recipe: take ' + (+r.toPrecision(6)) + ' of stock and add ' + (diluent >= 0 ? (+diluent.toPrecision(6)) + ' of diluent' : '(check values — negative diluent)') + ' to reach ' + v2 + ' total.'); }
    return { result: +r.toPrecision(6), summary: lines.join('\n') };
  }
  MBT.registerTool({
    id: 'dilution-calculator',
    name: 'Dilution Calculator',
    category: 'Calculators',
    description: 'C1·V1 = C2·V2. Leave one field blank to solve for it (e.g. how much stock to use).',
    inputs: [
      { name: 'c1', label: 'Stock concentration (C1)', control: 'number', step: 'any', placeholder: 'e.g. 100' },
      { name: 'v1', label: 'Stock volume (V1)', control: 'number', step: 'any', placeholder: 'leave blank to solve' },
      { name: 'c2', label: 'Final concentration (C2)', control: 'number', step: 'any', placeholder: 'e.g. 10' },
      { name: 'v2', label: 'Final volume (V2)', control: 'number', step: 'any', placeholder: 'e.g. 50' }
    ],
    outputs: [
      { name: 'result', label: 'Solved value', type: 'number' },
      { name: 'summary', label: 'Details', type: 'text' }
    ],
    note: 'Units are up to you — just keep the two concentrations in the same unit and the two volumes in the same unit.',
    compute: function (inp) { return solve(inp.c1, inp.v1, inp.c2, inp.v2); },
    doc: '<p>The everyday dilution relationship: the amount of solute is conserved, so ' +
      '<code>C1·V1 = C2·V2</code>. Enter any three of the four values and leave the fourth blank — the ' +
      'tool rearranges the equation to solve for the missing one.</p>' +
      '<p>When you solve for the stock volume (V1) it also prints a recipe: how much stock to take and how ' +
      'much diluent to add. Units are unit-agnostic; just keep both concentrations in one unit and both ' +
      'volumes in another.</p>',
    code: "// whichever field is blank is solved for:\n" +
      "C1 = C2·V2 / V1     V1 = C2·V2 / C1\n" +
      "C2 = C1·V1 / V2     V2 = C1·V1 / C2"
  });
})();
