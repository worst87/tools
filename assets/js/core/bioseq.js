/* ============================================================================
 * bioseq.js  —  Shared molecular-biology logic (the "model" layer).
 *
 * Pure functions only. No DOM here. Tools call into MBT.bio.* so the actual
 * biology lives in ONE place and can be unit-tested in Node (see /tests).
 *
 * Accuracy notes:
 *  - Translation uses the Standard Genetic Code (NCBI transl_table=1).
 *  - Tm uses the SantaLucia (1998) unified nearest-neighbor parameters
 *    [Proc. Natl. Acad. Sci. USA 95:1460-1465] with the standard entropy
 *    salt correction. This is the same model class used by IDT/NEB/Primer3.
 *  - IUPAC degenerate codes are supported for complement and matching.
 * ==========================================================================*/

(function () {
  'use strict';

  var Bio = {};

  /* ---- basic cleaning ---------------------------------------------------- */
  Bio.lettersOnly = function (s) { return String(s || '').replace(/[^A-Za-z]/g, '').toUpperCase(); };

  /* ---- IUPAC degenerate codes ------------------------------------------- */
  // Each code maps to the set of standard bases it represents (DNA alphabet).
  var IUPAC = {
    A: 'A', C: 'C', G: 'G', T: 'T', U: 'T',
    R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC',
    B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT'
  };
  Bio.IUPAC = IUPAC;
  Bio.DEGENERATE_CODES = ['R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V', 'N'];

  // Is a single base a recognised degenerate (non-ACGTU) IUPAC code?
  Bio.isDegenerate = function (b) {
    b = String(b).toUpperCase();
    return 'ACGTU'.indexOf(b) === -1 && IUPAC[b] != null;
  };

  // Do two (possibly degenerate) bases overlap? Used for tolerant searching.
  Bio.iupacMatch = function (q, s) {
    q = String(q).toUpperCase(); s = String(s).toUpperCase();
    var qs = IUPAC[q], ss = IUPAC[s];
    if (!qs || !ss) return q === s;          // unknown letters: require exact
    for (var i = 0; i < qs.length; i++) if (ss.indexOf(qs[i]) !== -1) return true;
    return false;
  };

  /* ---- complement / transcription --------------------------------------- */
  var COMPLEMENT = {
    A: 'T', T: 'A', G: 'C', C: 'G', U: 'A', N: 'N',
    R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
    B: 'V', V: 'B', D: 'H', H: 'D'
  };
  var COMPLEMENT_RNA = Object.assign({}, COMPLEMENT, { A: 'U', T: 'A' });

  Bio.complement = function (seq, asRna) {
    var map = asRna ? COMPLEMENT_RNA : COMPLEMENT;
    return Bio.lettersOnly(seq).split('').map(function (b) { return map[b] || 'N'; }).join('');
  };
  Bio.reverse = function (seq) { return Bio.lettersOnly(seq).split('').reverse().join(''); };
  Bio.reverseComplement = function (seq, asRna) { return Bio.complement(seq, asRna).split('').reverse().join(''); };

  // DNA (coding/sense strand) -> RNA : T -> U  ;  RNA -> DNA : U -> T
  Bio.transcribe = function (seq) { return Bio.lettersOnly(seq).replace(/T/g, 'U'); };
  Bio.reverseTranscribe = function (seq) { return Bio.lettersOnly(seq).replace(/U/g, 'T'); };

  /* ---- genetic code ------------------------------------------------------ */
  var CODON_TABLE = {
    UUU: 'F', UUC: 'F', UUA: 'L', UUG: 'L', CUU: 'L', CUC: 'L', CUA: 'L', CUG: 'L',
    AUU: 'I', AUC: 'I', AUA: 'I', AUG: 'M', GUU: 'V', GUC: 'V', GUA: 'V', GUG: 'V',
    UCU: 'S', UCC: 'S', UCA: 'S', UCG: 'S', CCU: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
    ACU: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCU: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
    UAU: 'Y', UAC: 'Y', UAA: '*', UAG: '*', CAU: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
    AAU: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAU: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
    UGU: 'C', UGC: 'C', UGA: '*', UGG: 'W', CGU: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
    AGU: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGU: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
  };
  Bio.CODON_TABLE = CODON_TABLE;

  // Translate a nucleotide sequence (DNA or RNA) in a single frame.
  Bio.translate = function (seq, opts) {
    opts = opts || {};
    var rna = Bio.transcribe(seq);
    var codons = [], protein = '';
    for (var i = 0; i + 3 <= rna.length; i += 3) {
      var codon = rna.substr(i, 3);
      var aa = CODON_TABLE[codon] || 'X';
      var isStop = aa === '*';
      codons.push({ codon: codon, aa: aa, isStart: codon === 'AUG', isStop: isStop, index: i });
      protein += aa;
      if (isStop && opts.stopAtStop) break;
    }
    return { protein: protein, codons: codons };
  };

  var COMMON_CODON = {
    A: 'GCC', R: 'CGG', N: 'AAC', D: 'GAC', C: 'TGC', E: 'GAG', Q: 'CAG', G: 'GGC', H: 'CAC', I: 'ATC',
    L: 'CTG', K: 'AAG', M: 'ATG', F: 'TTC', P: 'CCC', S: 'AGC', T: 'ACC', W: 'TGG', Y: 'TAC', V: 'GTG', '*': 'TGA'
  };
  Bio.reverseTranslate = function (protein, asRna) {
    var dna = Bio.lettersOnly(protein).split('').map(function (aa) { return COMMON_CODON[aa] || 'NNN'; }).join('');
    return asRna ? Bio.transcribe(dna) : dna;
  };

  /* ---- ORF finding (used by Reading Frames tool) ------------------------ */
  // Scan all six frames of `seq` for ORFs (AUG…stop). Returns array sorted
  // longest-first: { frame:'+1'..'-3', strandSeq, ntStart, ntEnd, dna, protein }.
  // ntStart/ntEnd are 1-based positions on the FORWARD input sequence.
  Bio.findOrfs = function (seq, isRna) {
    // One linear pass per frame. (The obvious version — for every ATG, walk
    // forward hunting a stop — is quadratic on a sequence with few stops, which
    // is exactly the case that matters: a long ORF-rich CDS. Instead we carry
    // the current open start along a single sweep.)
    var fwd = Bio.reverseTranscribe(Bio.lettersOnly(seq));   // work in DNA letters
    var rev = Bio.reverseComplement(fwd, false);
    var n = fwd.length, orfs = [];
    var STOPS = { TAA: 1, TAG: 1, TGA: 1 };
    [['+', fwd], ['-', rev]].forEach(function (dir) {
      var strand = dir[0], s = dir[1], len = s.length;
      for (var f = 0; f < 3; f++) {
        var openAt = -1;
        for (var i = f; i + 3 <= len; i += 3) {
          var codon = s.charAt(i) + s.charAt(i + 1) + s.charAt(i + 2);
          if (openAt < 0) { if (codon === 'ATG') openAt = i; continue; }
          if (!STOPS[codon]) continue;
          var end = i + 3, dna = s.slice(openAt, end);
          orfs.push({
            frame: strand + (f + 1),
            ntStart: strand === '+' ? openAt + 1 : n - end + 1,
            ntEnd: strand === '+' ? end : n - openAt,
            dna: dna, protein: Bio.translate(dna).protein
          });
          openAt = -1;
        }
      }
    });
    orfs.sort(function (a, b) { return b.dna.length - a.dna.length; });
    return orfs;
  };

  /* ---- composition / stats ---------------------------------------------- */
  Bio.composition = function (seq) {
    var s = Bio.lettersOnly(seq), counts = {};
    for (var i = 0; i < s.length; i++) counts[s[i]] = (counts[s[i]] || 0) + 1;
    return counts;
  };
  Bio.gcFraction = function (seq) {
    var s = Bio.lettersOnly(seq), gc = 0, at = 0;
    for (var i = 0; i < s.length; i++) {
      var b = s[i];
      if (b === 'G' || b === 'C' || b === 'S') gc++;
      else if (b === 'A' || b === 'T' || b === 'U' || b === 'W') at++;
    }
    var denom = gc + at; return denom ? gc / denom : 0;
  };
  Bio.ssDnaMW = function (seq) {
    var c = Bio.composition(Bio.reverseTranscribe(seq));
    var mw = (c.A || 0) * 313.21 + (c.T || 0) * 304.20 + (c.C || 0) * 289.18 + (c.G || 0) * 329.21 - 61.96;
    return mw > 0 ? mw : 0;
  };

  /* ---- melting temperature (nearest-neighbor) --------------------------- */
  var NN = {
    AA: [-7.9, -22.2], AT: [-7.2, -20.4], AC: [-8.4, -22.4], AG: [-7.8, -21.0],
    TA: [-7.2, -21.3], TT: [-7.9, -22.2], TC: [-8.2, -22.2], TG: [-8.5, -22.7],
    CA: [-8.5, -22.7], CT: [-7.8, -21.0], CC: [-8.0, -19.9], CG: [-10.6, -27.2],
    GA: [-8.2, -22.2], GT: [-8.4, -22.4], GC: [-9.8, -24.4], GG: [-8.0, -19.9]
  };
  var INIT_GC = [0.1, -2.8], INIT_AT = [2.3, 4.1], R = 1.987;
  function isSelfComplementary(s) { return s.length > 0 && s === Bio.reverseComplement(s); }

  Bio.tmNearestNeighbor = function (seq, oligoNM, naMM) {
    var s = Bio.reverseTranscribe(Bio.lettersOnly(seq));
    var n = s.length, clean = /^[ACGT]+$/.test(s);
    if (n < 2 || !clean) return { tm: NaN, valid: false, n: n, reason: n < 2 ? 'need >= 2 nt' : 'non-ACGT characters' };
    var oligo = (oligoNM > 0 ? oligoNM : 250) * 1e-9, na = (naMM > 0 ? naMM : 50) * 1e-3;
    var dH = 0, dS = 0;
    for (var i = 0; i < n - 1; i++) { var p = NN[s.substr(i, 2)]; dH += p[0]; dS += p[1]; }
    [s[0], s[n - 1]].forEach(function (b) { var t = (b === 'G' || b === 'C') ? INIT_GC : INIT_AT; dH += t[0]; dS += t[1]; });
    var selfComp = isSelfComplementary(s); if (selfComp) dS += -1.4;
    var x = selfComp ? 1 : 4;
    dS += 0.368 * (n - 1) * Math.log(na);
    var tmC = (dH * 1000) / (dS + R * Math.log(oligo / x)) - 273.15;
    return { tm: tmC, valid: true, n: n, gc: Bio.gcFraction(s), dH: dH, dS: dS, method: 'SantaLucia 1998 nearest-neighbor' };
  };
  Bio.tmGC = function (seq, naMM) {
    var s = Bio.reverseTranscribe(Bio.lettersOnly(seq)), n = s.length;
    if (n < 1) return NaN;
    var na = (naMM > 0 ? naMM : 50) / 1000;
    return 81.5 + 16.6 * Math.log10(na) + 0.41 * (Bio.gcFraction(s) * 100) - 600 / n;
  };

  Bio.wrap = function (s, width) {
    width = width || 60; var out = [];
    for (var i = 0; i < s.length; i += width) out.push(s.substr(i, width));
    return out.join('\n');
  };

  /* ---- IUPAC-aware motif search ----------------------------------------- */
  // Every hit of `query` in `hay` allowing `maxMm` mismatches; 1-based inclusive
  // positions. Degenerate codes on either side match by set overlap, so NGG
  // finds AGG/CGG/GGG/TGG. scan() assumes both strings are already clean
  // uppercase letters — findMotif below does the cleaning.
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function scan(hay, query, maxMm, cap) {
    var L = query.length, hits = [];
    if (!L || L > hay.length) return hits;
    // Resolve the IUPAC question once per query position instead of once per
    // compared base — iupacMatch is far too costly to sit in the inner loop.
    var tables = new Array(L);
    for (var q = 0; q < L; q++) {
      var t = {};
      for (var a = 0; a < 26; a++) t[ALPHABET[a]] = Bio.iupacMatch(query[q], ALPHABET[a]);
      tables[q] = t;
    }
    for (var i = 0; i + L <= hay.length && hits.length < cap; i++) {
      var mm = 0;
      for (var k = 0; k < L; k++) {
        if (tables[k][hay.charAt(i + k)] !== true) { mm++; if (mm > maxMm) break; }
      }
      if (mm <= maxMm) hits.push({ start: i + 1, end: i + L, mm: mm, match: hay.substr(i, L) });
    }
    return hits;
  }
  // maxHits caps the number of hits collected, not the length scanned — pass
  // Infinity when you genuinely want every occurrence in a whole chromosome.
  Bio.findMotif = function (hay, query, maxMm, maxHits) {
    return scan(Bio.lettersOnly(hay), Bio.lettersOnly(query), maxMm || 0, maxHits || Infinity);
  };

  /* ---- longest shared stretch ------------------------------------------- */
  // The longest run of identical characters common to `a` and `b`, as
  // { aStart, bStart, length } with 1-based starts, or null.
  //
  // Two implementations, picked by size. Below ~4 M cell-pairs the exact
  // dynamic-programming answer is cheap, so take it. Above that, seed on shared
  // k-mers and extend — near-linear, and the only thing it can miss is a shared
  // stretch shorter than the seed, which is noise at that scale anyway.
  Bio.LCR_EXACT_CELLS = 4e6;
  Bio.LCR_SEED = 14;
  function lcrExact(a, b) {
    var n = a.length, m = b.length;
    var prev = new Int32Array(m + 1), cur = new Int32Array(m + 1), tmp;
    var best = 0, bestA = 0, bestB = 0;
    for (var i = 1; i <= n; i++) {
      var ca = a.charCodeAt(i - 1);
      for (var j = 1; j <= m; j++) {
        var v = (ca === b.charCodeAt(j - 1)) ? prev[j - 1] + 1 : 0;
        cur[j] = v;
        if (v > best) { best = v; bestA = i; bestB = j; }
      }
      tmp = prev; prev = cur; cur = tmp; cur.fill(0);
    }
    return best ? { aStart: bestA - best + 1, bStart: bestB - best + 1, length: best } : null;
  }
  function lcrSeeded(a, b, k) {
    var idx = {}, CAP = 32, i, key, arr;
    for (i = 0; i + k <= b.length; i++) {
      key = b.substr(i, k);
      arr = idx[key];
      if (!arr) idx[key] = [i];
      else if (arr.length < CAP) arr.push(i);      // ignore hyper-repetitive seeds
    }
    var best = null;
    for (i = 0; i + k <= a.length; i++) {
      var cand = idx[a.substr(i, k)];
      if (!cand) continue;
      for (var c = 0; c < cand.length; c++) {
        var j = cand[c], l = 0, r = k;
        while (i - l - 1 >= 0 && j - l - 1 >= 0 && a.charCodeAt(i - l - 1) === b.charCodeAt(j - l - 1)) l++;
        while (i + r < a.length && j + r < b.length && a.charCodeAt(i + r) === b.charCodeAt(j + r)) r++;
        var len = l + r;
        if (!best || len > best.length) best = { aStart: i - l + 1, bStart: j - l + 1, length: len };
      }
      // Having found a long stretch, jump past it rather than re-extending it
      // from every seed inside it.
      if (best && best.length > k) i = Math.max(i, best.aStart - 1 + best.length - k);
    }
    return best;
  }
  Bio.longestCommonRegion = function (a, b) {
    a = String(a == null ? '' : a); b = String(b == null ? '' : b);
    if (!a.length || !b.length) return null;
    if (a.length * b.length <= Bio.LCR_EXACT_CELLS) return lcrExact(a, b);
    return lcrSeeded(a, b, Bio.LCR_SEED);
  };

  /* ---- export (browser global + Node for tests) ------------------------- */
  if (typeof window !== 'undefined') { window.MBT = window.MBT || {}; window.MBT.bio = Bio; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = Bio; }
})();
