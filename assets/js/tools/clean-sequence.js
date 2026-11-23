/* Clean Sequence / Text — one node for the everyday tidy-ups that used to be
 * three separate tools: strip numbers, strip symbols, fix whitespace, set case.
 * Ticks/menus are applied top-to-bottom, so what you see is the order applied. */
MBT.registerTool({
  id: 'clean-sequence',
  name: 'Clean Sequence / Text',
  category: 'Cleanup & Format',
  description: 'Clean numbered sequence lines, remove a FASTA header, or normalize pasted text.',
  inputs: [
    { name: 'text', label: 'Text or sequence', control: 'textarea', rows: 7, required: true,
      placeholder: '1 atgcatgcat gcatgcatgc\n61 ...', hint: 'Paste a sequence or text to clean.' },
    { name: 'preset', label: 'Cleanup preset', control: 'select', default: 'custom', socket: false,
      options: [{value: 'custom', label: 'Custom settings'}, {value: 'sequence', label: 'Sequence · one uppercase line'},
        {value: 'fasta', label: 'Single FASTA · remove header'}, {value: 'paragraph', label: 'Text · normalize spacing'}, {value: 'case', label: 'Text · uppercase only'}] },
    { name: 'stripHeader', label: 'Remove FASTA header', control: 'checkbox', default: false, socket: false },
    { name: 'removeNumbers', label: 'Remove numbers', control: 'checkbox', socket: false, default: true, row: 'ops', flex: 1,
      hint: 'Delete digits 0–9 (e.g. GenBank position numbers).' },
    { name: 'removeSymbols', label: 'Remove symbols', control: 'checkbox', socket: false, default: true, row: 'ops', flex: 1,
      hint: 'Delete punctuation/symbols, keeping letters, digits and whitespace.' },
    { name: 'whitespace', label: 'Whitespace', control: 'select', socket: false, default: 'all', row: 'fmt', flex: 1,
      hint: 'How to handle spaces, tabs and line breaks.',
      options: [
        { value: 'all', label: 'Remove all → single row' },
        { value: 'collapse', label: 'Collapse runs to one space' },
        { value: 'lines', label: 'Trim lines, drop blanks' },
        { value: 'keep', label: 'Keep as-is' } ] },
    { name: 'case', label: 'Letter case', control: 'select', socket: false, default: 'keep', row: 'fmt', flex: 1,
      hint: 'Optionally force UPPER/lower case.',
      options: [ { value: 'keep', label: 'Keep as-is' }, { value: 'upper', label: 'UPPERCASE' }, { value: 'lower', label: 'lowercase' } ] }
  ],
  outputs: [
    { name: 'text', label: 'Cleaned text', type: 'text', mono: true },
    { name: 'removed', label: 'Characters removed', type: 'number' }
  ],
  onInput: function (name, v) {
    if (name === 'text') return;
    if (name !== 'preset') { v.preset = 'custom'; return; }
    if (v.preset === 'custom') return;
    var sequence = v.preset === 'sequence' || v.preset === 'fasta';
    v.stripHeader = v.preset === 'fasta'; v.removeNumbers = sequence; v.removeSymbols = sequence;
    v.whitespace = sequence ? 'all' : v.preset === 'paragraph' ? 'collapse' : 'keep';
    v.case = v.preset === 'paragraph' ? 'keep' : 'upper';
  },
  compute: function (inp) {
    var s = String(inp.text == null ? '' : inp.text), n0 = s.length;
    if (inp.stripHeader) {
      var records = s.match(/^\s*>[^\r\n]*/gm) || [];
      if (records.length > 1) throw Error('Paste one FASTA record at a time to keep sequence boundaries.');
      s = s.replace(/^\s*>[^\r\n]*(?:\r?\n|$)/m, '');
    }
    if (inp.removeNumbers) s = s.replace(/[0-9]/g, '');
    if (inp.removeSymbols) s = s.replace(/[^A-Za-z0-9\s]/g, '');   // keep letters, digits, whitespace
    if (inp.whitespace === 'all') s = s.replace(/\s+/g, '');
    else if (inp.whitespace === 'collapse') s = s.replace(/\s+/g, ' ').trim();
    else if (inp.whitespace === 'lines') s = s.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; }).join('\n');
    if (inp.case === 'upper') s = s.toUpperCase();
    else if (inp.case === 'lower') s = s.toLowerCase();
    return { text: s, removed: n0 - s.length };
  },
  doc: '<p>The everyday clean-up steps in one node, applied in the order shown: <strong>remove numbers</strong> ' +
    '(digits), <strong>remove symbols</strong> (punctuation — letters/digits/whitespace kept), a ' +
    '<strong>whitespace</strong> choice (flatten to one row, collapse runs, trim lines, or keep), and an ' +
    'optional <strong>case</strong> change. Each is independent, so tick only what you need.</p>' +
    '<p>This replaces the old separate Number/Symbol Remover, Whitespace Remover and Case Converter — the same ' +
    'behaviours, now composable in a single step. <code>removed</code> is the net drop in character count.</p>',
  code: "if (removeNumbers) s = s.replace(/[0-9]/g,'');\n" +
    "if (removeSymbols) s = s.replace(/[^A-Za-z0-9\\s]/g,'');\n" +
    "whitespace: all→/\\s+/g→'' · collapse→' ' · lines→trim+dropBlank\n" +
    "case: upper→toUpperCase · lower→toLowerCase"
});
