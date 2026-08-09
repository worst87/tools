/* Find & Replace — literal or regex find/replace on text. */
(function () {
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function run(text, find, replace, mode, ci) {
    var s = String(text == null ? '' : text);
    if (find == null || find === '') return { result: s, count: 0, info: 'Enter something to find.' };
    var flags = 'g' + (ci ? 'i' : ''), re;
    try { re = new RegExp(mode === 'regex' ? find : escapeRegex(find), flags); }
    catch (e) { if (MBT.log) MBT.log.warn('find-replace: invalid regex — ' + e.message); return { result: s, count: 0, info: '⚠ Invalid regular expression: ' + e.message }; }
    var count = (s.match(re) || []).length;
    return { result: s.replace(re, replace == null ? '' : replace), count: count, info: 'Replaced ' + count + ' occurrence(s).' };
  }
  MBT.registerTool({
    id: 'find-replace', name: 'Find & Replace', category: 'Cleanup & Format',
    description: 'Replace text — literal or regex, optionally case-insensitive. Reports how many were changed.',
    inputs: [
      { name: 'text', label: 'Input', control: 'textarea', rows: 6, placeholder: 'Paste text / sequence…' },
      { name: 'find', label: 'Find', control: 'text', placeholder: 'text or pattern' },
      { name: 'replace', label: 'Replace with', control: 'text', placeholder: '(leave blank to delete)' },
      { name: 'mode', label: 'Match mode', control: 'select', default: 'literal', socket: false, row: 'm', flex: 1, options: [{ value: 'literal', label: 'Literal text' }, { value: 'regex', label: 'Regular expression' }] },
      { name: 'ci', label: 'Case-insensitive', control: 'checkbox', default: false, socket: false, row: 'm', flex: 1 }
    ],
    outputs: [
      { name: 'result', label: 'Result', type: 'text', mono: true },
      { name: 'count', label: 'Replacements', type: 'number' },
      { name: 'info', label: 'Info', type: 'text' }
    ],
    compute: function (inp) { return run(inp.text, inp.find, inp.replace, inp.mode, !!inp.ci); },
    doc: '<p>General-purpose substitution for editing sequences and text — swap a codon, delete a tag, normalise ' +
      'characters, or fix formatting.</p>' +
      '<p><strong>Literal vs regex.</strong> Literal matches the “Find” text exactly (special characters escaped ' +
      'for you). Regex treats “Find” as a JavaScript regular expression (e.g. <code>[^ACGT]</code>, ' +
      '<code>T{3,}</code>); invalid patterns are reported, not thrown. All matches are replaced; tick ' +
      '<em>case-insensitive</em> to ignore case.</p>',
    code: "re = (mode==='regex') ? new RegExp(find,'g'+ci) : new RegExp(escape(find),'g'+ci);\n" +
      "count = (text.match(re)||[]).length;   result = text.replace(re, replacement);"
  });
})();
