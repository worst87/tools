/* Gibson / NEBuilder Assembly Calculator — compact, table output.
 * The pmol used is shown directly: Vector pmol + Each-insert pmol fields whose
 * defaults follow the insert count (1 insert → 0.06/0.03; ≥2 → 0.03/0.03) and
 * stay editable. Max-DNA and max-volume limits may both be set (tighter binds).
 *   ng = pmol × bp × 650 / 1000 ;  µl = ng / conc */
(function () {
  var H = ['Fragment', 'pmol', 'ng', 'µl'];
  function num(v) { return (v === '' || v == null) ? 0 : +v; }
  function round(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }
  function ge(n) { return function (v) { return (parseInt(v.nInserts, 10) || 1) >= n; }; }

  function gibson(inp) {
    var nIns = parseInt(inp.nInserts, 10) || 1;
    var comps = [{ name: 'Vector', bp: num(inp.vectorBp), conc: num(inp.vectorConc), pmol0: num(inp.vectorPmol) > 0 ? num(inp.vectorPmol) : 0.03 }];
    var iP = num(inp.insertPmol) > 0 ? num(inp.insertPmol) : (nIns === 1 ? 0.06 : 0.03);
    for (var i = 1; i <= nIns; i++) comps.push({ name: 'Insert ' + i, bp: num(inp['insert' + i + 'Bp']), conc: num(inp['insert' + i + 'Conc']), pmol0: iP });
    if (!(comps[0].bp > 0)) return { recipe: { caption: 'Enter the vector length (bp).', headers: H, rows: [] }, totalUl: NaN };

    var sNg = comps.reduce(function (s, c) { return s + c.pmol0 * c.bp * 0.65; }, 0);
    var sUl = comps.reduce(function (s, c) { return s + (c.conc > 0 ? c.pmol0 * c.bp * 0.65 / c.conc : 0); }, 0);
    var kMass = (num(inp.maxNg) > 0 && sNg > 0) ? num(inp.maxNg) / sNg : Infinity;
    var kVol = (num(inp.maxVol) > 0 && sUl > 0) ? num(inp.maxVol) / sUl : Infinity;
    var k = 1, scaled = '';
    if (kMass < 1 || kVol < 1) { k = Math.min(kMass, kVol); scaled = (kVol <= kMass) ? ' · ≤' + num(inp.maxVol) + ' µl' : ' · ≤' + num(inp.maxNg) + ' ng'; }

    var totalNg = 0, totalUl = 0, missingConc = false, rows = [];
    comps.forEach(function (c) {
      c.pmol = k * c.pmol0; c.ng = c.pmol * c.bp * 0.65; c.ul = c.conc > 0 ? c.ng / c.conc : NaN;
      totalNg += c.ng; if (c.conc > 0) totalUl += c.ul; else missingConc = true;
      rows.push([c.name + ' · ' + (c.bp || '?') + ' bp', round(c.pmol, 3), round(c.ng, 1), c.conc > 0 ? round(c.ul, 2) : '—']);
    });
    var caption = (nIns === 1 ? 'Single fragment' : nIns + ' inserts') + scaled;
    return { recipe: { caption: caption, headers: H, rows: rows, foot: ['Total', '', round(totalNg, 1), missingConc ? '—' : round(totalUl, 2)] }, totalUl: missingConc ? NaN : round(totalUl, 2) };
  }

  MBT.registerTool({
    id: 'gibson', name: 'Gibson / NEBuilder Assembly', category: 'Calculators',
    description: 'µl of each fragment for a Gibson/NEBuilder reaction. pmol is shown and auto-set by insert count; scale to a max mass/volume.',
    inputs: [
      { name: 'nInserts', label: 'Inserts', control: 'select', default: '1', socket: false, row: 'a', flex: 1, options: [{ value: '1', label: '1 insert' }, { value: '2', label: '2 inserts' }, { value: '3', label: '3 inserts' }, { value: '4', label: '4 inserts' }] },
      { name: 'vectorPmol', label: 'Vector pmol', control: 'number', default: 0.03, min: 0, step: 'any', socket: false, row: 'p', flex: 1 },
      { name: 'insertPmol', label: 'Each insert pmol', control: 'number', default: 0.06, min: 0, step: 'any', socket: false, row: 'p', flex: 1 },
      { name: 'maxNg', label: 'Max DNA (ng)', control: 'number', min: 0, step: 'any', socket: false, row: 'lim', flex: 1, placeholder: 'optional' },
      { name: 'maxVol', label: 'Max volume (µl)', control: 'number', min: 0, step: 'any', socket: false, row: 'lim', flex: 1, placeholder: 'optional' },
      { name: 'vectorBp', label: 'Vector (bp)', control: 'number', type: 'number', default: 5000, min: 1, step: 'any', socket: true, row: 'v', flex: 1 },
      { name: 'vectorConc', label: 'Vector (ng/µl)', control: 'number', default: 50, min: 0, step: 'any', socket: false, row: 'v', flex: 1 },
      { name: 'insert1Bp', label: 'Insert 1 (bp)', control: 'number', type: 'number', default: 1000, min: 0, step: 'any', socket: true, row: 'i1', flex: 1, visibleWhen: ge(1) },
      { name: 'insert1Conc', label: 'Insert 1 (ng/µl)', control: 'number', default: 20, min: 0, step: 'any', socket: false, row: 'i1', flex: 1, visibleWhen: ge(1) },
      { name: 'insert2Bp', label: 'Insert 2 (bp)', control: 'number', type: 'number', min: 0, step: 'any', socket: true, row: 'i2', flex: 1, visibleWhen: ge(2) },
      { name: 'insert2Conc', label: 'Insert 2 (ng/µl)', control: 'number', min: 0, step: 'any', socket: false, row: 'i2', flex: 1, visibleWhen: ge(2) },
      { name: 'insert3Bp', label: 'Insert 3 (bp)', control: 'number', type: 'number', min: 0, step: 'any', socket: true, row: 'i3', flex: 1, visibleWhen: ge(3) },
      { name: 'insert3Conc', label: 'Insert 3 (ng/µl)', control: 'number', min: 0, step: 'any', socket: false, row: 'i3', flex: 1, visibleWhen: ge(3) },
      { name: 'insert4Bp', label: 'Insert 4 (bp)', control: 'number', type: 'number', min: 0, step: 'any', socket: true, row: 'i4', flex: 1, visibleWhen: ge(4) },
      { name: 'insert4Conc', label: 'Insert 4 (ng/µl)', control: 'number', min: 0, step: 'any', socket: false, row: 'i4', flex: 1, visibleWhen: ge(4) }
    ],
    outputs: [
      { name: 'recipe', label: 'Recipe', type: 'table' },
      { name: 'totalUl', label: 'Total DNA volume (µl)', type: 'number' }
    ],
    onInput: function (name, v) { if (name === 'nInserts') { var n = parseInt(v.nInserts, 10) || 1; v.vectorPmol = 0.03; v.insertPmol = n === 1 ? 0.06 : 0.03; } },
    compute: gibson,
    doc: '<p>Calculates the amount of each fragment for a Gibson/NEBuilder HiFi assembly and converts to ' +
      'microlitres using each fragment’s concentration. Pick the insert count; only the needed rows show. The ' +
      '<strong>pmol fields show exactly what’s used</strong> and update with the insert count — 1 insert → vector ' +
      '<code>0.03</code>, insert <code>0.06</code>; 2+ inserts → <code>0.03</code> each. Edit them to override.</p>' +
      '<p>The <em>bp</em> fields have input sockets (numbers), so a length can be wired in from another node. ' +
      'Mass = <code>pmol × bp × 650 / 1000</code>.</p>' +
      '<p><strong>Constraints.</strong> Set a max total DNA mass and/or a max total volume; the tighter limit ' +
      'binds and all fragments scale by one factor (ratio preserved).</p>' +
      '<p><strong>Reaction conditions.</strong> Single-fragment: 50 °C, 5–15 min, then 4 °C / on ice. ' +
      'Multi-fragment: 50 °C, 15–30 min, then 4 °C / on ice. Use a thermocycler for accurate temperature; for >5 ' +
      'fragments extend to 30 min. After assembly, add an equal volume of 2× master mix and water to the final volume.</p>',
    code: "iP = insertPmol || (nInserts===1 ? 0.06 : 0.03);   vP = vectorPmol || 0.03;\n" +
      "ng = k * pmol * bp * 650/1000;   ul = ng / conc;\n" +
      "kMass = maxNg/Σng;  kVol = maxVol/Σul;  k = min(1, kMass, kVol)"
  });
})();
