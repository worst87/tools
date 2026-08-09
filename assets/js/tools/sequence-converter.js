/* Sequence Converter — From {DNA,RNA,Protein} → To {RNA,DNA,Protein,Complement,
 * Reverse complement,Reverse}. Translation marks start (AUG→M) and stops (*). */
(function () {
  var Bio = MBT.bio;
  function annotate(codons) {
    var firstStart = -1, stops = [], unknown = 0;
    codons.forEach(function (c, i) { if (firstStart < 0 && c.isStart) firstStart = i; if (c.isStop) stops.push({ i: i, codon: c.codon }); if (c.aa === 'X') unknown++; });
    var parts = [codons.length + ' codons → ' + codons.length + ' aa'];
    parts.push(firstStart >= 0 ? 'Start (AUG→M): codon ' + (firstStart + 1) + ' (nt ' + (firstStart * 3 + 1) + ')' : 'Start: no AUG in this frame');
    parts.push(stops.length ? 'Stop (' + stops.length + '): ' + stops.map(function (s) { return 'codon ' + (s.i + 1) + ' ' + s.codon; }).join(', ') : 'Stop: none (open frame)');
    if (unknown) parts.push(unknown + ' ambiguous/unknown codon(s) → X');
    return parts.join('\n');
  }
  function convert(seq, from, to) {
    var s = Bio.lettersOnly(seq);
    if (!s) return { result: '', info: '' };
    if (from === 'Protein') {
      if (to === 'DNA') return { result: Bio.reverseTranslate(s, false), info: '⚠ Representative back-translation (most-common human codons). Ambiguous.' };
      if (to === 'RNA') return { result: Bio.reverseTranslate(s, true), info: '⚠ Representative back-translation (most-common human codons). Ambiguous.' };
      if (to === 'Reverse') return { result: Bio.reverse(s), info: 'Residues reversed (N↔C order).' };
      if (to === 'Protein') return { result: s, info: 'Length: ' + s.length + ' aa' };
      return { result: '', info: 'Complement / reverse-complement do not apply to a protein sequence.' };
    }
    var isRna = (from === 'RNA');
    switch (to) {
      case 'DNA': return { result: Bio.reverseTranscribe(s), info: 'Length: ' + s.length + ' nt' };
      case 'RNA': return { result: Bio.transcribe(s), info: 'Length: ' + s.length + ' nt' };
      case 'Complement': return { result: Bio.complement(s, isRna), info: 'Base-by-base complement (same 5′→3′ orientation).' };
      case 'Reverse complement': return { result: Bio.reverseComplement(s, isRna), info: 'Length: ' + s.length + ' nt · reverse complement (5′→3′).' };
      case 'Reverse': return { result: Bio.reverse(s), info: 'Length: ' + s.length + ' nt · reversed (3′→5′), not complemented.' };
      case 'Protein': { var t = Bio.translate(s, {}); return { result: t.protein, info: annotate(t.codons) + (s.length % 3 ? '\nNote: ' + (s.length % 3) + ' trailing nt ignored.' : '') }; }
      default: return { result: s, info: '' };
    }
  }
  MBT.registerTool({
    id: 'sequence-converter', name: 'Sequence Converter', category: 'Sequence Tools',
    description: 'DNA ⇄ RNA, translate to protein (marks start/stop), complement, reverse & reverse complement — one tool.',
    inputs: [
      { name: 'seq', label: 'Sequence', control: 'textarea', rows: 6, placeholder: 'Paste DNA, RNA or protein…', hint: 'Non-letter characters are ignored automatically.' },
      { name: 'from', label: 'From', control: 'select', default: 'DNA', row: 'ft', flex: 1, options: [{ value: 'DNA', label: 'DNA' }, { value: 'RNA', label: 'RNA' }, { value: 'Protein', label: 'Protein (aa)' }] },
      { name: 'to', label: 'To', control: 'select', default: 'RNA', row: 'ft', flex: 1, options: [{ value: 'RNA', label: 'RNA' }, { value: 'DNA', label: 'DNA' }, { value: 'Protein', label: 'Protein (translate)' }, { value: 'Complement', label: 'Complement' }, { value: 'Reverse complement', label: 'Reverse complement' }, { value: 'Reverse', label: 'Reverse (no complement)' }] }
    ],
    keywords: 'dna rna protein translate transcribe complement reverse complement revcomp back translation',
    outputs: [
      { name: 'result', label: 'Result', type: 'text', seq: true },
      { name: 'info', label: 'Details (start / stop / notes)', type: 'text' }
    ],
    compute: function (inp) { return convert(inp.seq, inp.from, inp.to); },
    doc: '<p>One tool for the everyday conversions, chosen with two dropdowns. Input is cleaned to letters ' +
      'automatically.</p>' +
      '<p><strong>To options.</strong> <em>RNA/DNA</em> swap T↔U. <em>Complement</em> pairs each base keeping ' +
      'orientation. <em>Reverse complement</em> is the other strand 5′→3′. <em>Reverse</em> just flips order. ' +
      '<em>Protein</em> translates frame 1 from the start with the Standard Genetic Code, marking the first ' +
      '<code>AUG</code> (M) and stops (<code>*</code>); for the real coding region within UTRs use the ORF ' +
      'Finder. Protein→DNA/RNA is a representative, ambiguous back-translation.</p>',
    code: "transcribe: T→U   reverseTranscribe: U→T   reverse: flip order\n" +
      "complement: A↔T/U, G↔C (IUPAC aware)   revComp: complement+reverse\n" +
      "translate: codonTable[RNA codon]  // AUG→M, UAA/UAG/UGA→*"
  });
})();
