/* Reverse Complement Checker — do these two sequences anneal, and where?
 *
 * Answers the everyday questions: did I order the right bottom oligo, did I
 * paste the wrong strand, does this primer sit on that template — and shows the
 * duplex so a single mismatch is visible instead of implied. */
(function () {
  var Bio = MBT.bio, ui = MBT.ui;

  function pad(s, n) { while (s.length < n) s += ' '; return s; }
  function lead(n) { return new Array(n + 1).join(' '); }

  function run(inp) {
    var A = Bio.reverseTranscribe(Bio.lettersOnly(inp.a));
    var B = Bio.reverseTranscribe(Bio.lettersOnly(inp.b));
    if (!A || !B) return blank('Paste both sequences.');

    var rcB = Bio.reverseComplement(B);

    // The headline cases, checked directly — cheap and unambiguous.
    var verdict, note = '';
    if (A === rcB) verdict = 'Complete reverse complement';
    else if (A === B) verdict = 'Identical — the same strand, not a reverse complement';
    else if (A === Bio.complement(B)) verdict = 'Complement but NOT reversed — one of them is written back to front';
    else if (A === Bio.reverse(B)) verdict = 'Reversed but NOT complemented';
    else verdict = 'Partial';

    // Line the two up on their longest shared stretch. A and rcB share a
    // stretch exactly where A and B are reverse-complementary.
    var region = Bio.longestCommonRegion(A, rcB);
    if (!region) return blank('No shared stretch at all — these two do not anneal anywhere.', verdict);

    var offset = (region.aStart - 1) - (region.bStart - 1);   // rcB's shift under A
    var padTop = offset < 0 ? -offset : 0;
    var padBot = offset > 0 ? offset : 0;
    var top = lead(padTop) + A;
    var partner = lead(padBot) + rcB;                          // rcB, aligned under A
    var width = Math.max(top.length, partner.length);
    top = pad(top, width); partner = pad(partner, width);

    // What is drawn underneath is B read 3'->5', which is the complement of the
    // aligned rcB — so the two printed strands really are the two strands.
    var mid = '', bottom = '', paired = 0, compared = 0, mismatches = [];
    for (var i = 0; i < width; i++) {
      var t = top.charAt(i), p = partner.charAt(i);
      bottom += (p === ' ') ? ' ' : (Bio.complement(p) || 'N');
      if (t === ' ' || p === ' ') { mid += ' '; continue; }
      compared++;
      if (t === p) { mid += '|'; paired++; }
      else if (Bio.iupacMatch(t, p)) { mid += ':'; paired++; }
      else { mid += ' '; if (mismatches.length < 40) mismatches.push(i + 1 - padTop); }
    }

    var shorter = Math.min(A.length, B.length);
    var identity = compared ? +(100 * paired / compared).toFixed(1) : 0;
    var coverage = +(100 * region.length / shorter).toFixed(1);
    if (verdict === 'Partial') {
      verdict = region.length === shorter
        ? 'One is fully contained in the reverse complement of the other'
        : 'Partial — ' + ui.fmtInt(region.length) + ' of ' + ui.fmtInt(shorter) + ' nt are reverse-complementary';
    }
    if (A.length !== B.length) note = 'The two are different lengths (' + ui.fmtInt(A.length) + ' vs ' + ui.fmtInt(B.length) + ' nt), so the overhangs below are unpaired.';

    // Where the shared stretch sits in the sequences the user actually typed.
    // Position p of rcB is position (len(B) - p + 1) of B, counting backwards.
    var bEnd = B.length - region.bStart + 1;
    var bStart = bEnd - region.length + 1;

    var details = [
      verdict + '.',
      '',
      'A: ' + ui.fmtInt(A.length) + ' nt' + (Bio.lettersOnly(inp.a) !== A ? '  (U read as T)' : ''),
      'B: ' + ui.fmtInt(B.length) + ' nt' + (Bio.lettersOnly(inp.b) !== B ? '  (U read as T)' : ''),
      '',
      'Longest reverse-complementary stretch: ' + ui.fmtInt(region.length) + ' nt',
      '   in A, positions ' + region.aStart + '–' + (region.aStart + region.length - 1),
      '   in B, positions ' + bStart + '–' + bEnd + '  (B runs the other way)',
      '',
      'Over the overlapping columns: ' + ui.fmtInt(paired) + '/' + ui.fmtInt(compared) + ' paired (' + identity + '%)',
      'Coverage of the shorter sequence: ' + coverage + '%',
      mismatches.length ? 'Unpaired positions (numbered along A): ' + mismatches.join(', ') + (mismatches.length >= 40 ? ' …' : '') : 'No unpaired positions inside the overlap.',
      note ? '\n' + note : ''
    ].filter(function (x) { return x !== ''; }).join('\n');

    return {
      verdict: verdict,
      duplex: ui.strandsHtml([
        { label: "A 5′→3′", seq: top, cls: 'dx-top', marks: [[region.aStart + padTop, region.aStart + padTop + region.length - 1]] },
        { label: '', seq: mid, cls: 'dx-mid', noPos: true },
        { label: "B 3′→5′", seq: bottom, cls: 'dx-bot' }
      ]),
      details: details,
      matched: A.substr(region.aStart - 1, region.length),
      identity: identity,
      overlap: region.length
    };
  }

  function blank(msg, verdict) {
    return { verdict: verdict || '—', duplex: '', details: msg, matched: '', identity: NaN, overlap: 0 };
  }

  MBT.registerTool({
    id: 'revcomp-check', name: 'Reverse Complement Checker', category: 'Sequence Tools',
    description: 'Check whether two sequences are reverse complements — fully or partly — and see exactly which region anneals.',
    keywords: 'reverse complement check anneal duplex oligo pair bottom strand top strand hybridise complementary overlap primer template',
    inputs: [
      { name: 'a', label: 'Sequence A', control: 'textarea', rows: 4, required: true, placeholder: "5′→3′, e.g. ATGCGTACGTTAGC" },
      { name: 'b', label: 'Sequence B', control: 'textarea', rows: 4, required: true, placeholder: "5′→3′, e.g. GCTAACGTACGCAT" }
    ],
    outputs: [
      { name: 'verdict', label: 'Verdict', type: 'text' },
      { name: 'duplex', label: 'How they pair up', type: 'html' },
      { name: 'details', label: 'Details', type: 'text' },
      { name: 'matched', label: 'The complementary stretch (from A)', type: 'text', seq: true },
      { name: 'identity', label: 'Paired % over the overlap', type: 'number' },
      { name: 'overlap', label: 'Longest complementary stretch (nt)', type: 'number' }
    ],
    compute: run,
    note: 'Both sequences are read <strong>5′→3′</strong>, the way oligos are normally written and ordered. ' +
      'U is treated as T, so an RNA and its DNA counterpart compare cleanly.',
    doc: '<p>Enter two sequences as you would write them — both 5′→3′ — and this reports whether one is the ' +
      'reverse complement of the other, then draws the duplex they would form.</p>' +
      '<p><strong>Reading the picture.</strong> A is drawn 5′→3′ on top and B is drawn <em>3′→5′</em> ' +
      'underneath, because that is the orientation in which two strands actually pair. A <code>|</code> between ' +
      'them is a Watson–Crick pair, <code>:</code> is a pair that only works because one side is an IUPAC ' +
      'ambiguity code (N and friends), and a blank is a mismatch. The longest perfectly complementary stretch ' +
      'is <mark>highlighted</mark>, and the two are slid against each other so that stretch lines up — which ' +
      'is why unequal lengths leave overhangs at the ends.</p>' +
      '<p><strong>The near misses are called out by name.</strong> Complemented but not reversed, reversed but ' +
      'not complemented, or simply the same sequence twice — each gets its own verdict rather than a vague ' +
      '"partial", because those three mistakes are the ones people actually make.</p>' +
      '<p><strong>Coordinates.</strong> The stretch is reported in A’s numbering and in B’s own numbering. They ' +
      'run in opposite directions, so B’s start position is the larger-numbered end of the region in B.</p>' +
      '<p><strong>Method.</strong> A perfect check is a single string comparison against ' +
      '<code>reverseComplement(B)</code>. For the partial case the tool finds the longest stretch shared by A ' +
      'and <code>reverseComplement(B)</code> — exact dynamic programming for anything up to a couple of ' +
      'kilobases each, and k-mer seeding above that so long inputs still answer immediately.</p>',
    code: "rcB = reverseComplement(B);\n" +
      "if (A === rcB) -> complete;\n" +
      "region = longestCommonRegion(A, rcB);       // where they anneal\n" +
      "draw A 5'->3' over complement(rcB) = B 3'->5', '|' where the columns agree"
  });
})();
