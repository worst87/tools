/* ORF Finder & Reading Frames — finds the coding region for you.
 *
 * "I just want to find the ORF": this scans all six frames for AUG…STOP and
 * shows the longest open reading frame with its start and stop codons clearly
 * bracketed, the flanking UTRs, and the protein. The full six-frame view is
 * provided below with a plain-language legend. */
(function () {
  var Bio = MBT.bio;

  function analyse(seq, isRna) {
    var fwd = Bio.lettersOnly(seq);
    if (!fwd) return { report: '', protein: '', orf: '', frames: '' };
    var rev = Bio.reverseComplement(fwd, isRna), n = fwd.length;
    var orfs = Bio.findOrfs(fwd, isRna);

    // --- best ORF report with start/stop marked + flanks ---
    var report;
    if (!orfs.length) {
      report = 'No ORF found (no AUG…stop in any of the 6 frames).';
    } else {
      var o = orfs[0];
      var plus = o.frame.charAt(0) === '+';
      var strand = plus ? fwd : rev;
      var sStart = plus ? (o.ntStart - 1) : (n - o.ntEnd);
      var sEnd = sStart + o.dna.length;
      var pre = strand.slice(0, sStart), post = strand.slice(sEnd);
      var start3 = o.dna.slice(0, 3), stop3 = o.dna.slice(-3);
      var marked = '[' + start3 + ']' + o.dna.slice(3, -3) + '[' + stop3 + ']';
      report = [
        'Longest ORF — frame ' + o.frame + ', nt ' + o.ntStart + '–' + o.ntEnd +
          '  (' + o.dna.length + ' nt → ' + (o.protein.length) + ' aa incl. stop)' + (plus ? '' : '  [on reverse strand]'),
        'Start codon: ' + start3 + '   Stop codon: ' + stop3,
        '',
        "5′ flank / UTR (" + pre.length + ' nt): ' + (pre || '—'),
        'ORF: ' + marked,
        'Protein: ' + o.protein,
        "3′ flank / UTR (" + post.length + ' nt): ' + (post || '—'),
        (orfs.length > 1 ? '\n(' + (orfs.length - 1) + ' other, shorter ORF(s) also found.)' : '')
      ].join('\n');
    }

    // --- six-frame legend + translations ---
    var lines = ['+1/+2/+3 read the given strand starting at base 1, 2, 3.',
                 '−1/−2/−3 read the reverse-complement strand. Stops shown as *.', ''];
    [['+', fwd], ['−', rev]].forEach(function (d) {
      for (var f = 0; f < 3; f++) lines.push('Frame ' + d[0] + (f + 1) + ':  ' + (Bio.translate(d[1].slice(f)).protein || '(none)'));
    });

    return { report: report, protein: orfs.length ? orfs[0].protein : '', orf: orfs.length ? orfs[0].dna : '', frames: lines.join('\n') };
  }

  MBT.registerTool({
    id: 'reading-frames',
    name: 'ORF Finder & Reading Frames',
    category: 'Sequence Tools',
    description: 'Finds the longest open reading frame (start→stop) and shows all 6 frames. Marks the start & stop codons.',
    inputs: [
      { name: 'seq', label: 'Sequence', control: 'textarea', rows: 6, placeholder: 'Paste DNA or RNA (UTRs and all)…' },
      { name: 'type', label: 'Input is', control: 'select', default: 'DNA', options: [
        { value: 'DNA', label: 'DNA' }, { value: 'RNA', label: 'RNA' }
      ] }
    ],
    outputs: [
      { name: 'report', label: 'Best ORF (start/stop marked)', type: 'text', mono: true },
      { name: 'protein', label: 'ORF protein (for chaining)', type: 'text', mono: true },
      { name: 'orf', label: 'ORF nucleotides (for chaining)', type: 'text', mono: true },
      { name: 'frames', label: 'All six frames', type: 'text', mono: true }
    ],
    compute: function (inp) { return analyse(inp.seq, inp.type === 'RNA'); },
    doc: '<p>A real transcript has untranslated regions (UTRs) before and after the coding sequence, so ' +
      'the protein does not necessarily start at base 1. This tool therefore <strong>scans for the actual ' +
      'coding region</strong> rather than blindly translating from the start.</p>' +
      '<p><strong>What “frame” means.</strong> There are three ways to chop a strand into triplets ' +
      '(starting at base 1, 2 or 3) — those are frames <code>+1, +2, +3</code>. The opposite ' +
      '(reverse-complement) strand gives three more, <code>−1, −2, −3</code>. Six in total.</p>' +
      '<p><strong>How the ORF is found.</strong> In every frame the tool looks for a start codon ' +
      '(<code>AUG</code>/<code>ATG</code>) and reads until the next stop (<code>UAA/UAG/UGA</code>). The ' +
      'longest such open reading frame is reported with its start and stop codons in [brackets], the 5′ and ' +
      '3′ flanks (your UTRs), and the translated protein. Other shorter ORFs are noted.</p>',
    code: "// scan all 6 frames for ATG…stop, keep the longest\n" +
      "for (strand of [fwd, revComp]) for (f of [0,1,2])\n" +
      "  for (i=f; i+3<=strand.length; i+=3)\n" +
      "    if (codon(i)==='AUG')\n" +
      "      for (j=i; j+3<=strand.length; j+=3)\n" +
      "        if (isStop(codon(j))) { recordORF(i, j+3); break; }\n" +
      "// report: 5'UTR | [START]…[STOP] | 3'UTR  + protein"
  });
})();
