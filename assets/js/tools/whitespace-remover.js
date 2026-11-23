/* Whitespace Remover — collapse line breaks, tabs and spaces. */
MBT.registerTool({
  id: 'whitespace-remover',
  name: 'Whitespace Remover',
  category: 'Cleanup & Format',
  description: 'Strip spaces, tabs and line breaks to flatten a sequence into one continuous row.',
  inputs: [
    { name: 'text', label: 'Input', control: 'textarea', rows: 7,
      placeholder: 'atgcatgcat gcatgcatgc\natgc...', hint: 'Paste a multi-line / spaced sequence.' },
    { name: 'mode', label: 'Mode', control: 'select', default: 'all', options: [
      { value: 'all', label: 'Remove all whitespace → single row' },
      { value: 'collapse', label: 'Collapse runs to one space' },
      { value: 'lines', label: 'Trim each line, drop blank lines' }
    ] }
  ],
  outputs: [{ name: 'text', label: 'Cleaned', type: 'text', mono: true }],
  compute: function (inp) {
    var s = String(inp.text || '');
    if (inp.mode === 'collapse') return { text: s.replace(/\s+/g, ' ').trim() };
    if (inp.mode === 'lines') return { text: s.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; }).join('\n') };
    return { text: s.replace(/\s+/g, '') };
  },
  doc: '<p>Genome browsers and most analysis tools want a single unbroken string. Sequences copied from ' +
    'papers or databases arrive wrapped across many lines with spaces between blocks — this flattens them.</p>' +
    '<p><strong>Modes.</strong> <em>Remove all whitespace</em> (default) yields one continuous row. ' +
    '<em>Collapse runs</em> turns any run of whitespace into a single space (keeps word boundaries). ' +
    '<em>Trim each line</em> keeps line breaks but removes leading/trailing spaces and empty lines.</p>',
  code: "// default: remove every whitespace character\n" +
    "out = text.replace(/\\s+/g, '');\n" +
    "// collapse:  text.replace(/\\s+/g, ' ').trim()\n" +
    "// lines:     split('\\n').map(trim).filter(nonEmpty).join('\\n')"
});
