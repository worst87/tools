/* Sequence Find (mismatches + degenerate bases) — reports each hit's position
 * range and highlights the matches on the sequence. Query/sequence may use
 * IUPAC codes (e.g. NGG). */
(function () {
  function run(seq, query, max, both) {
    var data;
    try { data = MBT.motif.scan(seq, query, max, both); }
    catch (err) { return {highlighted: '', summary: err.message, count: '', positions: ''}; }
    var list = data.hits.slice(0, 1000);
    function location(hit) { return (hit.start + 1) + '–' + hit.end + hit.strand; }
    var summary = data.count + ' strand match' + (data.count === 1 ? '' : 'es') + ' in ' + data.seq.length + ' nt.';
    if (data.count > list.length) summary += ' Listing the first ' + list.length + '.';
    var lines = list.map(function (h) { return 'pos ' + location(h) + '  ' + h.mm + ' mm   ' + data.seq.slice(h.start, Math.min(h.end, h.start + 120)) + (h.end - h.start > 120 ? '…' : ''); });
    if (data.query.length > data.seq.length) summary = 'Query is longer than the sequence.';
    return {summary: data.query && data.seq ? [summary].concat(lines).join('\n') : '',
      count: data.count, positions: list.map(location).join(', '), highlighted: MBT.motif.highlight(data), view: data};
  }
  MBT.registerTool({
    id: 'sequence-find', name: 'Sequence Find', category: 'Sequence Tools',
    description: 'Find a motif/primer/site with mismatches and IUPAC degenerate bases (e.g. NGG); highlights matches and reports positions.',
    inputs: [
      { name: 'seq', label: 'Sequence to search', control: 'textarea', rows: 6, placeholder: 'Paste DNA/RNA…' },
      { name: 'query', label: 'Query / motif', control: 'text', placeholder: 'e.g. NGG (PAM), GAATTC, a primer…' },
      { name: 'mismatches', label: 'Allowed mismatches', control: 'select', default: '0', socket: false, row: 'opt', flex: 1, options: [{ value: '0', label: '0 (exact)' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }] },
      { name: 'both', label: 'Both strands', control: 'checkbox', default: true, socket: false, row: 'opt', flex: 1 }
    ],
    outputs: [
      { name: 'highlighted', label: 'Sequence with matches highlighted', type: 'html', viewer: 'matches' },
      { name: 'summary', label: 'Matches (with position range)', type: 'text', mono: true },
      { name: 'count', label: 'Match count', type: 'number' },
      { name: 'positions', label: 'Match positions', type: 'text', mono: true }
    ],
    compute: function (inp) { return run(inp.seq, inp.query, parseInt(inp.mismatches, 10) || 0, !!inp.both); },
    doc: '<p>Slides the query across the sequence and reports every window within the chosen number of ' +
      'mismatches, with the exact <strong>position range</strong> (1-based) and strand. The first output shows ' +
      '60 bases of context on each side of the selected hit. Previous, Next and Go move between hits. Full sequence highlights the navigable matches in place. Counts cover all hits, navigation covers the first 25,000 and text listings cover the first 1,000.</p>' +
      '<p><strong>Degenerate bases.</strong> Query and sequence may use IUPAC codes; a position matches when the ' +
      'two bases’ allowed sets overlap, so <code>NGG</code> matches AGG/CGG/GGG/TGG with zero mismatches.</p>' +
      '<p><strong>Method.</strong> Hamming distance per window using an IUPAC overlap test; the reverse strand ' +
      'is searched by matching reverseComplement(query) against the forward sequence (positions stay in original coordinates).</p>',
    code: "for (i) { mm = count(k => !iupacOverlap(query[k], seq[i+k]));\n" +
      "  if (mm <= allowed) record({start:i+1, end:i+L, mm}); }\n" +
      "highlight: wrap every matched position range in <mark>…</mark>"
  });
})();
