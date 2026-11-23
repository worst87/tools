/* Number & Symbol Remover — strip digits and/or punctuation/symbols from a
 * pasted sequence (e.g. GenBank position numbers, stray "$%^"). Whitespace is
 * always preserved here — use the separate Whitespace Remover to flatten lines. */
MBT.registerTool({
  id: 'number-remover',
  name: 'Number & Symbol Remover',
  category: 'Cleanup & Format',
  description: 'Remove digits and/or symbols (GenBank numbers, punctuation, stray characters). Keeps letters & spaces.',
  inputs: [
    { name: 'text', label: 'Input', control: 'textarea', rows: 7,
      placeholder: '1 atgcatgcat gcatgcatgc\n61 ...', hint: 'Paste a sequence containing junk characters.' },
    { name: 'mode', label: 'Remove', control: 'select', default: 'both', options: [
      { value: 'both', label: 'Numbers + symbols (default)' },
      { value: 'numbers', label: 'Numbers only' },
      { value: 'symbols', label: 'Symbols only (keep numbers)' }
    ] }
  ],
  outputs: [
    { name: 'text', label: 'Cleaned', type: 'text', mono: true },
    { name: 'removed', label: 'Characters removed', type: 'number' }
  ],
  compute: function (inp) {
    var s = String(inp.text || ''), out;
    if (inp.mode === 'numbers') out = s.replace(/[0-9]/g, '');
    else if (inp.mode === 'symbols') out = s.replace(/[^A-Za-z0-9\s]/g, '');
    else out = s.replace(/[^A-Za-z\s]/g, '');                 // 'both' — keep letters + whitespace
    return { text: out, removed: s.length - out.length };
  },
  doc: '<p>Pasting sequences from GenBank, NCBI, papers or spreadsheets often drags in junk: ' +
    'position numbers, punctuation, bullet characters, etc. This tool deletes those, leaving clean residues. ' +
    '<strong>Whitespace is always kept</strong> — flatten lines afterwards with the dedicated Whitespace Remover.</p>' +
    '<p><strong>Modes.</strong> <em>Numbers + symbols</em> (default) keeps only letters and whitespace. ' +
    '<em>Numbers only</em> deletes digits (classic GenBank line numbers). <em>Symbols only</em> deletes ' +
    'punctuation but keeps digits.</p>' +
    '<p><strong>Method.</strong> A single regular-expression replace per mode; <code>removed</code> is the ' +
    'input length minus the output length.</p>',
  code: "// 'both' (default): keep letters and whitespace only\n" +
    "out = text.replace(/[^A-Za-z\\s]/g, '');\n" +
    "// numbers only:  text.replace(/[0-9]/g, '')\n" +
    "// symbols only:   text.replace(/[^A-Za-z0-9\\s]/g, '')"
});
