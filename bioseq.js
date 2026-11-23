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

  var AA_THREE = {
    A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', E: 'Glu', Q: 'Gln', G: 'Gly', H: 'His', I: 'Ile',
    L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', '*': 'Stop'
  };
  Bio.aaThree = function (one) { return AA_THREE[one] || 'Xaa'; };

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
    var dna = String(protein || '').toUpperCase().replace(/[^A-Z*]/g, '').split('').map(function (aa) { return COMMON_CODON[aa] || 'NNN'; }).join('');
    return asRna ? Bio.transcribe(dna) : dna;
  };

  /* ---- ORF finding (used by Reading Frames tool) ------------------------ */
  // Scan all six frames of `seq` for ORFs (AUG…stop). Returns array sorted
  // longest-first: { frame:'+1'..'-3', strandSeq, ntStart, ntEnd, dna, protein }.
  // ntStart/ntEnd are 1-based positions on the FORWARD input sequence.
  Bio.findOrfs = function (seq, isRna) {
    var fwd = Bio.lettersOnly(seq);
    var rev = Bio.reverseComplement(fwd, isRna);
    var n = fwd.length, orfs = [];
    [['+', fwd], ['-', rev]].forEach(function (dir) {
      var strand = dir[0], s = dir[1];
      for (var f = 0; f < 3; f++) {
        for (var i = f; i + 3 <= s.length; i += 3) {
          if (s.substr(i, 3).replace(/U/g, 'T') === 'ATG' || Bio.transcribe(s.substr(i, 3)) === 'AUG') {
            // walk to stop
            for (var j = i; j + 3 <= s.length; j += 3) {
              var aa = CODON_TABLE[Bio.transcribe(s.substr(j, 3))];
              if (aa === '*') {
                var dna = s.slice(i, j + 3);
                var sStart = i, sEnd = j + 3; // 0-based on strand s
                var ntStart, ntEnd;
                if (strand === '+') { ntStart = sStart + 1; ntEnd = sEnd; }
                else { ntStart = n - sEnd + 1; ntEnd = n - sStart; }
                orfs.push({ frame: strand + (f + 1), ntStart: ntStart, ntEnd: ntEnd,
                  dna: dna, protein: Bio.translate(dna).protein });
                i = j;                  // continue scanning after this ORF
                break;
              }
            }
          }
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

  /* ---- export (browser global + Node for tests) ------------------------- */
  if (typeof window !== 'undefined') { window.MBT = window.MBT || {}; window.MBT.bio = Bio; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = Bio; }
})();
