/* Split & Filter Lines — a plain-text workhorse for lists: filter, dedupe,
 * sort, slice, re-join. Pairs with FASTA Records when you are handling many
 * sequences at once (e.g. a column of primers pasted from a spreadsheet). */
(function () {
  function run(inp) {
    var raw = String(inp.text == null ? '' : inp.text);
    var lines = raw.split(/\r?\n/);
    if (inp.trim !== false) lines = lines.map(function (l) { return l.trim(); });
    if (inp.dropBlank !== false) lines = lines.filter(function (l) { return l.length; });
    var before = lines.length, note = '';

    var q = String(inp.match == null ? '' : inp.match);
    if (q) {
      var test;
      if (inp.matchMode === 'regex') {
        try { var re = new RegExp(q, 'i'); test = function (l) { return re.test(l); }; }
        catch (e) { note = '⚠ Invalid regular expression: ' + e.message; test = null; }
      } else {
        var lower = q.toLowerCase();
        test = function (l) { return l.toLowerCase().indexOf(lower) !== -1; };
      }
      if (test) lines = lines.filter(function (l) { return inp.invert ? !test(l) : test(l); });
    }
    if (inp.unique) { var seen = {}; lines = lines.filter(function (l) { if (seen[l]) return false; seen[l] = 1; return true; }); }
    if (inp.sort === 'az') lines.sort();
    else if (inp.sort === 'za') lines.sort().reverse();
    else if (inp.sort === 'len') lines.sort(function (a, b) { return b.length - a.length; });

    var limit = parseInt(inp.limit, 10);
    if (limit > 0 && lines.length > limit) lines = lines.slice(0, limit);

    var sep = inp.join === 'newline' ? '\n' : inp.join === 'comma' ? ', ' : inp.join === 'space' ? ' ' : '';
    var text = lines.join(sep);
    var summary = before + ' line(s) in · ' + lines.length + ' out' + (note ? '\n' + note : '');
    return { text: text, lines: lines.join('\n'), count: lines.length, summary: summary };
  }

  MBT.registerTool({
    id: 'text-lines', name: 'Split & Filter Lines', category: 'Cleanup & Format',
    description: 'Treat a paste as a list of lines: filter, de-duplicate, sort, take the first N, re-join.',
    keywords: 'lines list filter grep unique dedupe sort join split rows column primers',
    inputs: [
      { name: 'text', label: 'Text', control: 'textarea', rows: 8, required: true, placeholder: 'one item per line…' },
      { name: 'match', label: 'Keep lines matching', control: 'text', default: '', row: 'f', flex: 2, placeholder: '(blank = keep all)' },
      { name: 'matchMode', label: 'as', control: 'select', socket: false, default: 'contains', row: 'f', flex: 1,
        options: [{ value: 'contains', label: 'Contains' }, { value: 'regex', label: 'Regex' }] },
      { name: 'invert', label: 'Invert (drop the matches instead)', control: 'checkbox', socket: false, default: false },
      { name: 'unique', label: 'Remove duplicates', control: 'checkbox', socket: false, default: false, row: 'o', flex: 1 },
      { name: 'sort', label: 'Sort', control: 'select', socket: false, default: 'none', row: 'o', flex: 1,
        options: [{ value: 'none', label: 'Keep order' }, { value: 'az', label: 'A → Z' }, { value: 'za', label: 'Z → A' }, { value: 'len', label: 'Longest first' }] },
      { name: 'limit', label: 'Keep only the first', control: 'number', type: 'number', default: '', min: 1, step: 1, row: 'l', flex: 1, placeholder: 'all' },
      { name: 'join', label: 'Join with', control: 'select', socket: false, default: 'newline', row: 'l', flex: 1,
        options: [{ value: 'newline', label: 'A line break' }, { value: 'comma', label: 'A comma' }, { value: 'space', label: 'A space' }, { value: 'nothing', label: 'Nothing' }] },
      { name: 'trim', label: 'Trim spaces from each line', control: 'checkbox', socket: false, default: true, advanced: true, row: 'a', flex: 1 },
      { name: 'dropBlank', label: 'Drop blank lines', control: 'checkbox', socket: false, default: true, advanced: true, row: 'a', flex: 1 }
    ],
    outputs: [
      { name: 'text', label: 'Result (joined as chosen)', type: 'text' },
      { name: 'lines', label: 'Result (always one per line)', type: 'text' },
      { name: 'count', label: 'Lines kept', type: 'number' },
      { name: 'summary', label: 'Summary', type: 'text' }
    ],
    compute: run,
    doc: '<p>The grep/sort/uniq of the toolkit, for when what you pasted is a <em>list</em> — a column of primer ' +
      'names from a spreadsheet, a set of barcodes, the output of another node.</p>' +
      '<p>Operations run in a fixed, predictable order: trim → drop blanks → filter → de-duplicate → sort → ' +
      'take the first N → join. <em>Contains</em> is a case-insensitive substring test; <em>regex</em> is a ' +
      'JavaScript regular expression (an invalid one is reported, not thrown). <em>Invert</em> turns the filter ' +
      'into “drop these”.</p>' +
      '<p>Two text outputs so you can chain either way: one joined the way you asked, and one always one item ' +
      'per line for feeding straight back into this node.</p>',
    code: "lines = text.split('\\n').map(trim).filter(nonEmpty)\n" +
      "        .filter(matches).filter(unique).sort(order).slice(0, limit);\n" +
      "result = lines.join(separator);"
  });
})();
