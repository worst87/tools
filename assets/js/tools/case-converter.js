/* Case Converter — switch sequence/text between upper and lower case. */
MBT.registerTool({
  id: 'case-converter',
  name: 'Case Converter',
  category: 'Cleanup & Format',
  description: 'Convert text to UPPERCASE or lowercase (handy before case-sensitive tools).',
  inputs: [
    { name: 'text', label: 'Input', control: 'textarea', rows: 7, placeholder: 'AtGcAtGc...' },
    { name: 'mode', label: 'Convert to', control: 'select', default: 'upper', options: [
      { value: 'upper', label: 'UPPERCASE' }, { value: 'lower', label: 'lowercase' }
    ] }
  ],
  outputs: [{ name: 'text', label: 'Result', type: 'text', mono: true }],
  compute: function (inp) {
    var s = String(inp.text || '');
    return { text: inp.mode === 'lower' ? s.toLowerCase() : s.toUpperCase() };
  },
  doc: '<p>Some tools treat lowercase letters specially (e.g. soft-masked repeats) or are case-sensitive. ' +
    'This normalises an entire sequence one way or the other. Whitespace and other characters are left ' +
    'untouched — only letter case changes.</p>',
  code: "out = (mode === 'lower') ? text.toLowerCase() : text.toUpperCase();"
});
