/* Sequence Find — locate a motif/primer/site anywhere in a sequence, with
 * mismatches and IUPAC degenerate bases (e.g. NGG). Every match is reported and
 * shown, however long the sequence is: the viewer renders one line per 60 bases
 * so the browser can skip the lines you are not looking at. */
(function () {
  var Bio = MBT.bio, ui = MBT.ui;
  // Purely a memory guard. A search returning more hits than this is not a
  // search anyone is reading — but say so rather than silently stopping.
  var MAX_HITS = 500000;

  function merge(hits) {
    // Overlapping +/− strand hits become one highlighted block.
    var sorted = hits.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var out = [];
    sorted.forEach(function (h) {
      var last = out[out.length - 1];
      if (last && h.start <= last[1] + 1) { if (h.end > last[1]) last[1] = h.end; }
      else out.push([h.start, h.end]);
    });
    return out;
  }

  function run(seq, query, max, both) {
    var hay = Bio.reverseTranscribe(Bio.lettersOnly(seq));
    var q = Bio.reverseTranscribe(Bio.lettersOnly(query));
    if (!hay) return { summary: 'Paste a sequence to search.', count: 0, positions: '', highlighted: '' };
    if (!q) return { summary: 'Enter a motif to look for.', count: 0, positions: '', highlighted: ui.seqLinesHtml(hay, [], 60) };
    if (q.length > hay.length) return { summary: 'The query is longer than the sequence.', count: 0, positions: '', highlighted: ui.seqLinesHtml(hay, [], 60) };

    var hits = Bio.findMotif(hay, q, max, MAX_HITS);
    var capped = hits.length >= MAX_HITS;
    if (both) {
      var rc = Bio.reverseComplement(q);
      if (rc !== q) {
        Bio.findMotif(hay, rc, max, MAX_HITS).forEach(function (h) { h.strand = '−'; hits.push(h); });
      }
    }
    hits.forEach(function (h) { if (!h.strand) h.strand = '+'; });
    hits.sort(function (a, b) { return a.start - b.start || (a.strand < b.strand ? -1 : 1); });

    var degen = q.split('').some(Bio.isDegenerate);
    var lines = [
      'Query: ' + q + '  (' + q.length + ' nt' + (degen ? ', degenerate' : '') + ')  ·  ≤ ' + max + ' mismatch(es)  ·  ' +
        (both ? 'both strands' : 'plus strand only'),
      'Sequence: ' + ui.fmtInt(hay.length) + ' nt  ·  ' + ui.fmtInt(hits.length) + ' match(es)' +
        (capped ? '  ⚠ stopped at ' + ui.fmtInt(MAX_HITS) + ' — use a longer query' : ''),
      ''
    ];
    if (!hits.length) lines.push('No match at this threshold. Try allowing a mismatch, or check the strand setting.');
    else hits.forEach(function (h) { lines.push('pos ' + h.start + '–' + h.end + '   strand ' + h.strand + '   ' + h.mm + ' mm   ' + h.match); });

    return {
      summary: lines.join('\n'),
      count: hits.length,
      positions: hits.map(function (h) { return h.start + '–' + h.end + h.strand; }).join(', '),
      highlighted: ui.seqLinesHtml(hay, merge(hits), 60),
      first: hits.length ? hits[0].start : 0
    };
  }

  MBT.registerTool({
    id: 'sequence-find', name: 'Sequence Find', category: 'Sequence Tools',
    description: 'Find a motif, primer or site with mismatches and IUPAC codes (e.g. NGG) — every position, highlighted in place.',
    keywords: 'search motif find primer pam ngg crispr mismatch degenerate binding site locate position where',
    inputs: [
      { name: 'seq', label: 'Sequence to search', control: 'textarea', rows: 6, required: true, placeholder: 'Paste DNA/RNA — any length…' },
      { name: 'query', label: 'Query / motif', control: 'text', required: true, placeholder: 'e.g. NGG (PAM), GAATTC, a primer…' },
      { name: 'mismatches', label: 'Allowed mismatches', control: 'select', default: '0', socket: false, row: 'opt', flex: 1,
        options: [{ value: '0', label: '0 (exact)' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }] },
      { name: 'both', label: 'Search both strands', control: 'checkbox', default: true, socket: false, row: 'opt', flex: 1 }
    ],
    outputs: [
      { name: 'highlighted', label: 'Sequence with every match highlighted', type: 'html' },
      { name: 'summary', label: 'Matches, with position ranges', type: 'text' },
      { name: 'count', label: 'Match count', type: 'number' },
      { name: 'positions', label: 'Positions start–end (for chaining)', type: 'text' },
      { name: 'first', label: 'First match position', type: 'number' }
    ],
    compute: function (inp) { return run(inp.seq, inp.query, parseInt(inp.mismatches, 10) || 0, !!inp.both); },
    doc: '<p>Slides the query along the sequence and reports <strong>every</strong> window within the chosen ' +
      'number of mismatches, with its exact 1-based position range and strand. The first output shows the whole ' +
      'sequence, numbered every 60 bases, with each match <mark>highlighted</mark> where it actually sits.</p>' +
      '<p><strong>Nothing is hidden.</strong> A match at base 4,000,000 is listed and highlighted just like one ' +
      'at base 4. The viewer renders the sequence as numbered lines and lets the browser skip the lines that are ' +
      'scrolled out of sight, so a long sequence stays as responsive as a short one.</p>' +
      '<p><strong>Degenerate bases.</strong> Query and sequence may both use IUPAC codes; a position matches ' +
      'when the two bases’ allowed sets overlap, so <code>NGG</code> matches AGG/CGG/GGG/TGG with zero ' +
      'mismatches. The reverse strand is searched by matching the reverse complement of the query against the ' +
      'forward sequence, so reported positions always refer to the sequence you pasted.</p>' +
      '<p><strong>Method.</strong> Hamming distance per window. The IUPAC question is resolved once per query ' +
      'position into a lookup table rather than once per compared base, which is what keeps a whole-genome ' +
      'search quick.</p>',
    code: "for (i) { mm = count(k => !iupacOverlap(query[k], seq[i+k]));\n" +
      "  if (mm <= allowed) record({ start: i+1, end: i+L, mm }); }\n" +
      "reverse strand: match reverseComplement(query) against the same forward sequence"
  });
})();
