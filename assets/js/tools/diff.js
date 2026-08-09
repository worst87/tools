/* Compare Texts — LINEAR diff. Matches the common start and the common end of
 * the two inputs and highlights only the differing middle (deletions in A,
 * insertions in B). This is intentionally simple and predictable: it never
 * scatters matches across repeated motifs the way an LCS diff does — e.g.
 * "ATCG…CTGC" vs "ATCG…CTGCCGATCG…" highlights only the trailing extra in B. */
(function () {
  var esc = MBT.ui.escapeHtml;
  function tokenize(s, mode) { if (mode === 'word') return s.split(/(\s+)/).filter(function (x) { return x !== ''; }); if (mode === 'line') return s.split(/(\n)/).filter(function (x) { return x !== ''; }); return s.split(''); }

  function linear(A, B) {
    var n = A.length, m = B.length, p = 0;
    while (p < n && p < m && A[p] === B[p]) p++;                 // common prefix (tokens)
    var s = 0;
    while (s < n - p && s < m - p && A[n - 1 - s] === B[m - 1 - s]) s++; // common suffix
    return { prefix: A.slice(0, p), midA: A.slice(p, n - s), midB: B.slice(p, m - s), suffix: A.slice(n - s) };
  }

  function run(a, b, mode) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    if (!a && !b) return { aDiff: '', bDiff: '', identity: 100, summary: 'Both inputs are empty.' };
    var d = linear(tokenize(a, mode), tokenize(b, mode));
    var pre = esc(d.prefix.join('')), suf = esc(d.suffix.join('')), mA = d.midA.join(''), mB = d.midB.join('');
    var aDiff = pre + (mA ? '<mark class="d-del">' + esc(mA) + '</mark>' : '') + suf;
    var bDiff = pre + (mB ? '<mark class="d-ins">' + esc(mB) + '</mark>' : '') + suf;
    var common = d.prefix.join('').length + d.suffix.join('').length;
    var maxlen = Math.max(a.length, b.length);
    var identity = maxlen ? +(100 * common / maxlen).toFixed(1) : 100;
    var summary = 'Identity (common ends): ' + identity + '%\nA: ' + a.length + ' chars · B: ' + b.length + ' chars\n' +
      (a === b ? 'Texts are identical.' : (mA || mB ? 'The differing middle is highlighted; the matching start and end are plain.' : '—'));
    return { aDiff: aDiff, bDiff: bDiff, identity: identity, summary: summary };
  }

  MBT.registerTool({
    id: 'diff', name: 'Compare Texts', category: 'Cleanup & Format',
    description: 'Compare two texts/sequences and highlight the differing part (deletions in A, insertions in B). Linear: matches the common start & end.',
    inputs: [
      { name: 'a', label: 'Text A', control: 'textarea', rows: 5, placeholder: 'first sequence/text…' },
      { name: 'b', label: 'Text B', control: 'textarea', rows: 5, placeholder: 'second sequence/text…' },
      { name: 'mode', label: 'Compare by', control: 'select', default: 'characters', socket: false, options: [{ value: 'characters', label: 'Characters (sequences)' }, { value: 'word', label: 'Words' }, { value: 'line', label: 'Lines' }] }
    ],
    outputs: [
      { name: 'aDiff', label: 'A (deletions highlighted)', type: 'html' },
      { name: 'bDiff', label: 'B (insertions highlighted)', type: 'html' },
      { name: 'identity', label: 'Identity %', type: 'number' },
      { name: 'summary', label: 'Summary', type: 'text' }
    ],
    compute: function (inp) { return run(inp.a, inp.b, inp.mode); },
    doc: '<p>Finds how far the two inputs agree from the <strong>start</strong> and from the <strong>end</strong>, ' +
      'then highlights only the bit in the middle that differs — the part unique to A in the A panel (a deletion), ' +
      'the part unique to B in the B panel (an insertion). Shared start/end are shown plain.</p>' +
      '<p><strong>Why “linear”.</strong> A general LCS diff maximises matched characters and, with repetitive ' +
      'sequences, ends up matching repeated motifs out of order — scattering highlights through the middle. This ' +
      'tool deliberately does a single common-prefix + common-suffix comparison, so e.g. a sequence and the same ' +
      'sequence with extra bases appended highlights only the appended tail. Trade-off: if there are several ' +
      'separate edits, everything between the outermost matching ends is shown as one highlighted block.</p>' +
      '<p>Compare by characters (sequences), words, or lines. Identity = matching start+end characters ÷ longer length.</p>',
    code: "p = length of common prefix;  s = length of common suffix (after the prefix);\n" +
      "A: prefix + [del: A.slice(p, |A|-s)] + suffix\n" +
      "B: prefix + [ins: B.slice(p, |B|-s)] + suffix"
  });
})();
