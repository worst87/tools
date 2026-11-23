/* Shared by Sequence Find and Grab Flanking. Coordinates are zero-based internally. */
(function (MBT) {
  'use strict';
  var Bio = MBT.bio;
  var masks = {};
  Object.keys(Bio.IUPAC).forEach(function (base) {
    masks[base] = Array.from(Bio.IUPAC[base]).reduce(function (mask, b) {
      return mask | (1 << 'ACGT'.indexOf(b));
    }, 0);
  });

  function parse(text, label) {
    var lines = String(text || '').trim().split(/\r?\n/);
    if (/^\s*>/.test(lines[0])) lines.shift();
    if (lines.some(function (line) { return /^\s*>/.test(line); })) {
      throw Error('Paste one FASTA record at a time in ' + label + '.');
    }
    var dna = lines.join('').replace(/[\s0-9]/g, '').toUpperCase().replace(/U/g, 'T');
    var bad = dna.match(/[^ACGTRYSWKMBDHVN]/);
    if (bad) throw Error('Unrecognized character “' + bad[0] + '” in ' + label + '.');
    return dna;
  }

  function scan(text, motif, max, both) {
    var seq = parse(text, 'the sequence'), query = parse(motif, 'the query');
    var hits = [], count = 0, limit = 25000;
    function record(start, strand, mm) {
      count++;
      if (hits.length < limit) hits.push({start: start, end: start + query.length, strand: strand, mm: mm});
    }
    if (query && query.length <= seq.length) {
      var reverse = both ? Bio.reverseComplement(query) : '';
      if (!max && /^[ACGT]+$/.test(seq) && /^[ACGT]+$/.test(query)) {
        var plus = seq.indexOf(query), minus = both ? seq.indexOf(reverse) : -1;
        while (plus !== -1 || minus !== -1) {
          if (plus !== -1 && (minus === -1 || plus <= minus)) {
            record(plus, '+', 0); plus = seq.indexOf(query, plus + 1);
          } else {
            record(minus, '-', 0); minus = seq.indexOf(reverse, minus + 1);
          }
        }
      } else {
        var subject = Uint8Array.from(seq, function (b) { return masks[b]; });
        function pattern(bases) { return Uint8Array.from(bases, function (b) { return masks[b]; }); }
        var forwardMask = pattern(query), reverseMask = pattern(reverse);
        function check(i, mask, strand) {
          var mm = 0;
          for (var k = 0; k < mask.length; k++) {
            if (!(subject[i + k] & mask[k]) && ++mm > max) return;
          }
          record(i, strand, mm);
        }
        for (var i = 0; i <= seq.length - query.length; i++) {
          check(i, forwardMask, '+');
          if (both) check(i, reverseMask, '-');
        }
      }
    }
    return {seq: seq, query: query, hits: hits, count: count};
  }

  function extract(seq, hit, before, after) {
    var rev = hit.strand === '-';
    function orient(s) { return rev ? Bio.reverseComplement(s) : s; }
    var left = seq.slice(Math.max(0, hit.start - (rev ? after : before)), hit.start);
    var right = seq.slice(hit.end, hit.end + (rev ? before : after));
    var upstream = orient(rev ? right : left), downstream = orient(rev ? left : right);
    var match = orient(seq.slice(hit.start, hit.end));
    return {upstream: upstream, downstream: downstream, match: match, region: upstream + match + downstream};
  }

  function highlight(data) {
    var parts = [], end = 0, start = -1;
    function close() { if (start !== -1) parts.push('<mark class="hit">' + data.seq.slice(start, end) + '</mark>'); }
    data.hits.forEach(function (hit) {
      if (start === -1 || hit.start > end) {
        close(); parts.push(data.seq.slice(end, hit.start)); start = hit.start;
      }
      end = Math.max(end, hit.end);
    });
    close(); parts.push(data.seq.slice(end)); return parts.join('');
  }
  MBT.motif = {parse: parse, scan: scan, extract: extract, highlight: highlight};
})(window.MBT);
