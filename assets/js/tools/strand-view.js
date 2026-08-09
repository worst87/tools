/* DNA / RNA Visualiser — put a sequence back in its proper frame.
 *
 * You have a string. You are not sure whether it is the coding strand, the
 * template, or something a colleague wrote out backwards. Say which it is, and
 * this draws the duplex the conventional way round — + strand 5′→3′ on top,
 * − strand 3′→5′ underneath — plus the RNA that comes off it. Once it is drawn
 * that way, "upstream" is simply left and "downstream" is simply right. */
(function () {
  var Bio = MBT.bio, ui = MBT.ui;

  function run(inp) {
    var raw = Bio.lettersOnly(inp.seq);
    if (!raw) return blank('Paste a sequence.');
    var isRna = inp.type === 'RNA';
    var hadU = /U/.test(raw), hadT = /T/.test(raw);
    var s = Bio.reverseTranscribe(raw);            // work in DNA letters throughout

    // Two statements about how the sequence was written down, applied in order.
    if (inp.written35) s = Bio.reverse(s);         // now it reads 5′→3′ along its own strand
    var plus;
    if (isRna) plus = s;                           // mRNA is the coding strand, T for U
    else plus = inp.minusStrand ? Bio.reverseComplement(s) : s;

    var minus35 = Bio.complement(plus);            // written under the +, so it runs 3′→5′
    var minus53 = Bio.reverseComplement(plus);     // the same strand written the normal way
    var rna = Bio.transcribe(plus);
    var pairs = new Array(plus.length + 1).join('|');

    var rows = [
      { label: "+ 5′→3′", seq: plus, cls: 'dx-top' },
      { label: '', seq: pairs, cls: 'dx-mid', noPos: true },
      { label: "− 3′→5′", seq: minus35, cls: 'dx-bot' }
    ];
    if (inp.showRna !== false) rows.push({ label: "RNA 5′→3′", seq: rna, cls: 'dx-rna' });

    var read = [];
    read.push('You said: ' + (isRna ? 'RNA' : 'DNA') +
      ', written ' + (inp.written35 ? '3′→5′' : '5′→3′') +
      (isRna ? '' : ', ' + (inp.minusStrand ? 'the − (template / antisense) strand' : 'the + (coding / sense) strand')) + '.');
    if (!isRna && !inp.written35 && !inp.minusStrand) read.push('That is already the standard frame, so nothing was flipped.');
    else {
      var steps = [];
      if (inp.written35) steps.push('reversed it, so it reads 5′→3′');
      if (!isRna && inp.minusStrand) steps.push('took the reverse complement, to get the + strand');
      if (isRna) steps.push('read U as T to recover the coding strand');
      read.push('So the tool ' + steps.join(', then ') + '.');
    }
    if (hadU && hadT) read.push('⚠ The input contains both T and U — check you pasted what you meant to.');
    if (isRna && hadT && !hadU) read.push('⚠ Marked as RNA but contains T and no U.');
    if (!isRna && hadU) read.push('⚠ Marked as DNA but contains U; it was read as T.');

    var summary = read.concat([
      '',
      'Length: ' + ui.fmtInt(plus.length) + ' nt · GC ' + (Bio.gcFraction(plus) * 100).toFixed(1) + '%',
      '',
      'In the picture, the left-hand end is the 5′ end of the + strand — everything',
      'to the left is upstream, everything to the right is downstream.',
      '',
      'The − strand is drawn 3′→5′ because that is the direction it runs when it is',
      'paired with the + strand. Written on its own the normal way (5′→3′) it is the',
      '“− strand” output below, which is the reverse complement of the + strand.',
      '',
      isRna
        ? 'The RNA you gave is the transcript; the duplex above is the DNA it came from.'
        : 'RNA polymerase reads the − strand and builds the transcript, which therefore',
      isRna ? '' : 'matches the + strand with U in place of T — the RNA line above.'
    ]).filter(function (x) { return x !== ''; }).join('\n');

    return {
      view: ui.strandsHtml(rows),
      plus: plus, minus: minus53, rna: rna,
      summary: summary,
      length: plus.length
    };
  }

  function blank(msg) { return { view: '', plus: '', minus: '', rna: '', summary: msg, length: 0 }; }

  MBT.registerTool({
    id: 'strand-view', name: 'DNA / RNA Visualiser', category: 'Sequence Tools',
    description: 'Say which strand and direction your sequence is in, and see the double-stranded DNA and its RNA drawn the standard way round.',
    keywords: 'strand orientation sense antisense coding template plus minus 5 3 prime upstream downstream double stranded duplex transcription mrna visualise draw',
    inputs: [
      { name: 'seq', label: 'Sequence', control: 'textarea', rows: 6, required: true,
        placeholder: 'ATGCGTACGT…  or  AUGCGUACGU…' },
      { name: 'type', label: 'This sequence is', control: 'select', socket: false, default: 'DNA',
        options: [{ value: 'DNA', label: 'DNA' }, { value: 'RNA', label: 'RNA' }] },
      { name: 'written35', label: 'It is written 3′→5′  (leave off for the usual 5′→3′)', control: 'checkbox', socket: false, default: false },
      { name: 'minusStrand', label: 'It is the − strand — template / antisense  (leave off for the + coding strand)',
        control: 'checkbox', socket: false, default: false,
        visibleWhen: function (v) { return v.type !== 'RNA'; } },
      { name: 'showRna', label: 'Include the RNA line in the picture', control: 'checkbox', socket: false, default: true, advanced: true }
    ],
    outputs: [
      { name: 'view', label: 'Double-stranded view', type: 'html' },
      { name: 'summary', label: 'What this means', type: 'text' },
      { name: 'plus', label: '+ strand, coding / sense (5′→3′)', type: 'text', seq: true },
      { name: 'minus', label: '− strand, template / antisense (5′→3′)', type: 'text', seq: true },
      { name: 'rna', label: 'RNA transcript (5′→3′)', type: 'text', seq: true },
      { name: 'length', label: 'Length (nt)', type: 'number' }
    ],
    compute: run,
    note: 'Every output states its strand and its direction, because a sequence without those two ' +
      'labels is ambiguous. The <strong>+ / coding / sense</strong> strand is the one that matches the ' +
      'mRNA; the <strong>− / template / antisense</strong> strand is the one polymerase actually reads.',
    doc: '<p>Paste a sequence, say what it is, and get the standard picture:</p>' +
      '<pre class="code-block"><code>+ 5′→3′   1  ATGCGTACGTTAGC\n' +
      '             ||||||||||||||\n' +
      '− 3′→5′   1  TACGCATGCAATCG\n' +
      'RNA 5′→3′ 1  AUGCGUACGUUAGC</code></pre>' +
      '<p><strong>The two checkboxes describe your input, not what you want out.</strong> Tick ' +
      '<em>written 3′→5′</em> if the string was typed back to front (it gets reversed). Tick ' +
      '<em>− strand</em> if what you have is the template rather than the coding strand (it gets ' +
      'reverse-complemented). Both are applied in that order, and the “What this means” panel spells out ' +
      'exactly what was done, so you can check the tool understood you.</p>' +
      '<p><strong>Why the bottom strand runs backwards.</strong> The two strands of DNA are antiparallel. ' +
      'Drawn as a pair, if the top runs 5′→3′ left to right then the bottom must run 3′→5′. That is the ' +
      'real molecule. Written on its own — to order it, or to BLAST it — the same strand is normally typed ' +
      '5′→3′, which is the reverse complement of the top; that is the separate “− strand” output.</p>' +
      '<p><strong>Transcription.</strong> Polymerase reads the − strand 3′→5′ and builds RNA 5′→3′, so the ' +
      'transcript ends up matching the + strand with U in place of T. Give the tool RNA instead and it runs ' +
      'the same logic backwards: U becomes T to recover the coding strand, and the duplex it came from is ' +
      'drawn above it.</p>' +
      '<p><strong>Upstream and downstream.</strong> Once everything is in this frame, the left-hand end is ' +
      'the 5′ end of the coding strand: to the left is upstream (promoter, 5′ UTR), to the right is ' +
      'downstream. That is the whole point of normalising it first.</p>',
    code: "if (written 3'->5')  s = reverse(s);\n" +
      "plus  = isRNA ? U->T(s) : (minusStrand ? reverseComplement(s) : s);\n" +
      "minus = complement(plus);       // drawn underneath, so 3'->5'\n" +
      "rna   = T->U(plus);             // transcript matches the coding strand"
  });
})();
