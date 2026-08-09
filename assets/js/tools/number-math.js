/* Number Math — glue for the node editor. Lets a number coming out of one node
 * (a length, a GC%, a Tm) be scaled or combined before it feeds a calculator. */
(function () {
  function num(v) { return (v === '' || v == null) ? NaN : Number(v); }

  function run(inp) {
    var a = num(inp.a), b = num(inp.b), r, expr;
    switch (inp.op) {
      case 'sub': r = a - b; expr = a + ' − ' + b; break;
      case 'mul': r = a * b; expr = a + ' × ' + b; break;
      case 'div': r = b === 0 ? NaN : a / b; expr = a + ' ÷ ' + b; break;
      case 'pct': r = b === 0 ? NaN : 100 * a / b; expr = '100 × ' + a + ' ÷ ' + b; break;
      case 'min': r = Math.min(a, b); expr = 'min(' + a + ', ' + b + ')'; break;
      case 'max': r = Math.max(a, b); expr = 'max(' + a + ', ' + b + ')'; break;
      default: r = a + b; expr = a + ' + ' + b;
    }
    if (isFinite(r)) {
      var dp = inp.round === '' || inp.round == null ? null : parseInt(inp.round, 10);
      if (dp != null && dp >= 0) r = +r.toFixed(dp);
    }
    var ok = isFinite(r);
    return {
      result: ok ? r : NaN,
      text: ok ? String(r) : '',
      summary: (isNaN(a) || isNaN(b)) ? 'Enter both numbers (or wire them in).' : expr + '  =  ' + (ok ? r : 'undefined')
    };
  }

  MBT.registerTool({
    id: 'number-math', name: 'Number Math', category: 'Calculators',
    description: 'Combine two numbers (+ − × ÷ %, min, max) — the glue between numeric sockets.',
    keywords: 'math arithmetic add subtract multiply divide percent ratio scale glue number',
    inputs: [
      { name: 'a', label: 'A', control: 'number', type: 'number', default: 0, step: 'any', row: 'v', flex: 1 },
      { name: 'op', label: 'Operation', control: 'select', socket: false, default: 'add', row: 'v', flex: 1,
        options: [{ value: 'add', label: 'A + B' }, { value: 'sub', label: 'A − B' }, { value: 'mul', label: 'A × B' },
          { value: 'div', label: 'A ÷ B' }, { value: 'pct', label: 'A as % of B' }, { value: 'min', label: 'min(A, B)' }, { value: 'max', label: 'max(A, B)' }] },
      { name: 'b', label: 'B', control: 'number', type: 'number', default: 1, step: 'any', row: 'v', flex: 1 },
      { name: 'round', label: 'Round to decimals', control: 'number', socket: false, default: '', min: 0, max: 10, step: 1, placeholder: 'no rounding' }
    ],
    outputs: [
      { name: 'result', label: 'Result', type: 'number' },
      { name: 'text', label: 'Result as text', type: 'text' },
      { name: 'summary', label: 'Working', type: 'text' }
    ],
    compute: run,
    doc: '<p>A small node whose only job is to sit between two others. Sequence Stats gives you a length; ' +
      'this turns it into a length ÷ 3, or a percentage of another length, or the larger of two values, before ' +
      'it reaches a calculator input.</p>' +
      '<p>Division by zero and empty inputs produce an empty result rather than <code>Infinity</code> or ' +
      '<code>NaN</code> leaking downstream. The <em>result as text</em> output exists so a number can also be ' +
      'dropped into a text field (a FASTA name, a Join separator).</p>',
    code: "result = op === 'pct' ? 100 * a / b : op === 'div' ? a / b : a ⊕ b;\n" +
      "if (round != null) result = +result.toFixed(round);"
  });
})();
