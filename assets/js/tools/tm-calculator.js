/* Primer Tm Calculator — nearest-neighbor (SantaLucia 1998) + salt correction. */
(function () {
  var Bio = MBT.bio;
  function calc(seq, oligoNM, naMM) {
    var nn = Bio.tmNearestNeighbor(seq, oligoNM, naMM);
    if (!nn.valid) return { tm: NaN, details: 'Enter a valid DNA primer (≥ 2 nt, A/C/G/T only).\nReason: ' + nn.reason };
    var gcTm = Bio.tmGC(seq, naMM);
    return { tm: +nn.tm.toFixed(1), details: [
      'Tm (nearest-neighbor): ' + nn.tm.toFixed(1) + ' °C', '',
      'Length: ' + nn.n + ' nt', 'GC content: ' + (nn.gc * 100).toFixed(1) + '%',
      'ΔH: ' + nn.dH.toFixed(1) + ' kcal/mol   ΔS: ' + nn.dS.toFixed(1) + ' cal/(mol·K)',
      'Cross-check (GC-rule Tm): ' + gcTm.toFixed(1) + ' °C', '',
      'Conditions: [oligo] ' + (oligoNM || 250) + ' nM, [Na⁺] ' + (naMM || 50) + ' mM.',
      'Model: SantaLucia 1998 unified NN + entropy salt correction.'
    ].join('\n') };
  }
  MBT.registerTool({
    id: 'tm-calculator', name: 'Primer Tm Calculator', category: 'Sequence Tools',
    description: 'Accurate melting temperature for a primer/oligo using the nearest-neighbor model.',
    inputs: [
      { name: 'seq', label: 'Primer sequence (5′→3′)', control: 'textarea', rows: 4, placeholder: 'e.g. GTAAAACGACGGCCAGT', hint: 'DNA only. U is treated as T.' },
      { name: 'oligo', label: 'Oligo conc (nM)', control: 'number', default: 250, min: 1, step: 10, socket: false, row: 'cond', flex: 1 },
      { name: 'na', label: 'Na⁺ (mM)', control: 'number', default: 50, min: 1, step: 5, socket: false, row: 'cond', flex: 1 }
    ],
    outputs: [
      { name: 'tm', label: 'Tm (°C)', type: 'number' },
      { name: 'details', label: 'Details', type: 'text', mono: true }
    ],
    note: 'Tm uses the <strong>SantaLucia (1998)</strong> unified nearest-neighbor parameters with a salt ' +
      'correction — the same model family as IDT / NEB / Primer3. For PCR, ~3–5 °C below the lower primer Tm ' +
      'is a common annealing starting point. Mg²⁺ and dNTPs are not modeled here; verify critical primers in your vendor tool.',
    compute: function (inp) { return calc(inp.seq, inp.oligo, inp.na); },
    doc: '<p>Predicts the melting temperature of a short oligo using the <strong>nearest-neighbor</strong> ' +
      'thermodynamic model (SantaLucia 1998) — the accurate approach used by IDT, NEB and Primer3 — not the ' +
      'rough 2(A+T)+4(G+C) rule.</p>' +
      '<p><strong>How it works.</strong> Each adjacent base-pair step has a measured ΔH° and ΔS°. These are ' +
      'summed with initiation terms for the terminal pairs and a symmetry term for self-complementary oligos; ' +
      'a salt correction adjusts ΔS for [Na⁺]. Then ' +
      '<code>Tm = ΔH·1000 / (ΔS + R·ln(C_T/x)) − 273.15</code> (R = 1.987, x = 4 for non-self-complementary).</p>' +
      '<p><strong>Caveats.</strong> Monovalent salt only (no Mg²⁺/dNTPs). A GC-rule Tm is shown alongside as a ' +
      'sanity check. Validated against a hand calculation in <code>tests/bio-tests.js</code>.</p>',
    code: "for (step of adjacentPairs) { dH += NN[step].H; dS += NN[step].S; }\n" +
      "dH += init(first) + init(last);   dS += 0.368*(N-1)*ln([Na+]);\n" +
      "Tm = (dH*1000)/(dS + 1.987*ln(Coligo/4)) - 273.15;"
  });
})();
