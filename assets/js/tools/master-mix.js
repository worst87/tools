/* Master Mix Calculator — table output. Choose #components, name each with its
 * µl/reaction, set an overage; the recipe table shows per-rxn and total volumes. */
(function () {
  var N = 10, H = ['Component', 'µl/rxn', 'mix µl'];
  function num(v) { return (v === '' || v == null) ? 0 : +v; }
  function round(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }
  function vis(i) { return function (v) { return (parseInt(v.numComponents, 10) || 1) >= i; }; }

  function mix(inp) {
    var n = num(inp.numRxn);
    if (!(n > 0)) return { recipe: { caption: 'Enter the number of reactions.', headers: H, rows: [] }, totalMix: NaN, perRxn: NaN };
    var nc = parseInt(inp.numComponents, 10) || 1, mode = inp.overageMode;
    var blank = (inp.overageValue === '' || inp.overageValue == null);
    var ov = blank ? (mode === 'extra' ? Math.round(0.05 * n * 2) / 2 : 5) : num(inp.overageValue);
    var eff = mode === 'extra' ? n + ov : n * (1 + ov / 100);
    var comps = [];
    for (var i = 1; i <= nc; i++) { var nm = String(inp['name' + i] || '').trim(), v = num(inp['vol' + i]); if (nm && v > 0) comps.push({ name: nm, vol: v }); }
    if (!comps.length) return { recipe: { caption: 'Add at least one component (name + µl/rxn).', headers: H, rows: [] }, totalMix: NaN, perRxn: NaN };
    var perRxn = comps.reduce(function (s, c) { return s + c.vol; }, 0);
    var rows = comps.map(function (c) { return [c.name, round(c.vol, 2), round(c.vol * eff, 2)]; });
    var caption = round(eff, 2) + ' effective rxns  (' + n + (mode === 'extra' ? ' + ' + round(ov, 1) + ' extra' : ' + ' + round(ov, 1) + '%') + ')';
    return { recipe: { caption: caption, headers: H, rows: rows, foot: ['Total / tube', round(perRxn, 2), round(perRxn * eff, 2)] }, totalMix: round(perRxn * eff, 2), perRxn: round(perRxn, 2) };
  }

  function compRows() {
    var arr = [];
    for (var i = 1; i <= N; i++) {
      arr.push({ name: 'name' + i, label: 'Component ' + i, control: 'text', socket: false, row: 'c' + i, flex: 2, placeholder: i === 1 ? 'e.g. 2× PCR mix' : 'name', visibleWhen: vis(i) });
      arr.push({ name: 'vol' + i, label: 'µl/rxn', control: 'number', min: 0, step: 'any', socket: false, row: 'c' + i, flex: 1, visibleWhen: vis(i) });
    }
    return arr;
  }
  function compOptions() { var a = []; for (var i = 1; i <= N; i++) a.push({ value: String(i), label: i + (i === 1 ? ' component' : ' components') }); return a; }

  MBT.registerTool({
    id: 'master-mix', name: 'Master Mix Calculator', category: 'Calculators',
    description: 'Scale a per-reaction recipe to N reactions with an overage; clean per-rxn / total table.',
    inputs: [
      { name: 'numRxn', label: 'Reactions', control: 'number', default: 10, min: 1, step: 1, socket: false, row: 'top', flex: 1 },
      { name: 'numComponents', label: 'Components', control: 'select', default: '4', socket: false, row: 'top', flex: 1, options: compOptions() },
      { name: 'overageMode', label: 'Overage as', control: 'select', default: 'percent', socket: false, row: 'ov', flex: 1, options: [{ value: 'percent', label: 'Extra %' }, { value: 'extra', label: 'Extra reactions' }] },
      { name: 'overageValue', label: 'Overage', control: 'number', default: 5, min: 0, step: 'any', socket: false, row: 'ov', flex: 1, hint: '% or extra-reaction count, per the mode.' }
    ].concat(compRows()),
    outputs: [
      { name: 'recipe', label: 'Master mix', type: 'table' },
      { name: 'totalMix', label: 'Total mix volume (µl)', type: 'number' },
      { name: 'perRxn', label: 'Per-reaction volume (µl)', type: 'number' }
    ],
    compute: mix,
    doc: '<p>Builds a master mix from a per-reaction recipe. Set how many components you have; each appears as a ' +
      'row of <em>name</em> + <em>µl/rxn</em>, like a table. Every volume is multiplied by the number of reactions ' +
      'plus an overage, so you don’t run short on the last tube.</p>' +
      '<p><strong>Overage.</strong> A percentage (effective = <code>n × (1 + %/100)</code>) or a fixed number of ' +
      'extra reactions (<code>n + extra</code>). The default is 5 % (in “extra reactions” mode, 5 % of the count ' +
      'rounded to the nearest 0.5). The TOTAL row is the per-tube volume and its scaled total.</p>',
    code: "eff = (mode==='extra') ? n + overage : n * (1 + overage/100);\n" +
      "row.mix = volPerRxn * eff;   perTube = Σ volPerRxn;   total = perTube * eff;"
  });
})();
