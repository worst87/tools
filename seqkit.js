/* seqkit nodes — read statistics, length/quality filtering & FASTA conversion,
 * motif/primer search, and grabbing the first N reads. All loop-aware. */
(function () {
  var C = MBT.code;
  // Where a text report should go: an explicit file, a per-file loop file, or the terminal.
  function report(up, outName, ext) {
    if (outName) return ' > ' + C.q(C.toWsl(outName));
    if (up.inLoop) return ' > ' + C.outFile(up, { ext: ext }).ref;
    return '';
  }

  /* ---- seqkit stats ------------------------------------------------------ */
  MBT.registerTool({
    id: 'seqkit-stats', name: 'seqkit stats', group: 'code', category: 'Reads / QC',
    description: 'Quick summary of a FASTQ/FASTA: number of reads, total bases, min/avg/max length, N50.',
    inputs: [
      { name: 'in', label: 'FASTQ / FASTA', control: 'text', type: 'job', socket: true, required: true, hint: 'The read file to summarise (fastq, fastq.gz or fasta). In a loop it summarises each file.' },
      { name: 'all', label: 'All stats (-a: N50, Q20/Q30, GC…)', control: 'checkbox', socket: false, default: false, advanced: true, hint: 'Add the fuller statistics: N50, GC%, quality percentages (Q20/Q30), etc. A little slower.' },
      { name: 'outFile', label: 'Save report to', control: 'text', socket: false, advanced: true, placeholder: 'blank = print to the terminal', hint: 'Optional file to write the table to. Blank = just print it in the terminal.' }
    ],
    outputs: [ { name: 'out', label: 'Same reads (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!up.out) warn.push(C.warn('err', 'seqkit stats: input is required.'));
      var line = up.out ? ('seqkit stats' + (inp.all ? ' -a' : '') + ' ' + C.inputRef(up) + report(up, inp.outFile, 'stats.txt')) : '';
      return { out: C.step(inp.in, { line: line, warnings: warn }) };   // reads flow through unchanged
    },
    doc: '<p><code>seqkit stats</code> prints a one-line-per-file summary: how many reads, total bases, and the ' +
      'shortest/mean/longest read. With <em>All stats</em> it also reports <strong>N50</strong> (half your bases ' +
      'are in reads at least this long — a read-length quality number), GC%, and Q20/Q30 (share of bases with ' +
      'quality ≥ 20 / ≥ 30). The reads pass through unchanged so you can keep chaining.</p>',
    code: "seqkit stats -a reads.fastq.gz"
  });

  /* ---- seqkit seq (filter / convert) ------------------------------------ */
  MBT.registerTool({
    id: 'seqkit-seq', name: 'seqkit seq (filter)', group: 'code', category: 'Reads / QC',
    description: 'Keep only reads within a length / quality range, and optionally convert FASTQ → FASTA.',
    inputs: [
      { name: 'in', label: 'FASTQ', control: 'text', type: 'job', socket: true, required: true, hint: 'The reads to filter (fastq/fastq.gz). In a loop it filters each file.' },
      { name: 'minLen', label: 'Min length (bp)', control: 'number', socket: false, min: 0, step: 1, row: 'a', flex: 1, placeholder: 'e.g. 200', hint: 'Drop reads shorter than this many bases. Blank = no minimum.' },
      { name: 'maxLen', label: 'Max length (bp)', control: 'number', socket: false, min: 0, step: 1, row: 'a', flex: 1, placeholder: 'optional', hint: 'Drop reads longer than this. Blank = no maximum.' },
      { name: 'minQual', label: 'Min average quality (Q)', control: 'number', socket: false, min: 0, step: 1, placeholder: 'e.g. 10', hint: 'Drop reads whose average Phred quality is below this. ONT single-read quality ~10–15 is typical. Blank = no filter.' },
      { name: 'toFasta', label: 'Convert to FASTA', control: 'checkbox', socket: false, default: false, advanced: true, hint: 'Output plain sequences (FASTA, no quality) instead of FASTQ — e.g. for tools that want FASTA.' },
      { name: 'outName', label: 'Output path', control: 'text', socket: false, advanced: true, placeholder: 'auto: <name>.filtered.fastq', hint: 'Leave blank to write next to the input (or per-file in the loop’s folder).' }
    ],
    outputs: [ { name: 'out', label: 'Filtered reads (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!up.out) warn.push(C.warn('err', 'seqkit seq: input is required.'));
      var opts = '';
      if (inp.minLen !== '' && inp.minLen != null) opts += ' -m ' + inp.minLen;
      if (inp.maxLen !== '' && inp.maxLen != null) opts += ' -M ' + inp.maxLen;
      if (inp.minQual !== '' && inp.minQual != null) opts += ' -Q ' + inp.minQual;
      var inref = C.inputRef(up), line = '', o;
      if (inp.toFasta) { o = C.outFile(up, { name: inp.outName, suffix: '.filtered', ext: 'fasta' }); line = up.out ? ('seqkit seq' + opts + ' ' + inref + ' | seqkit fq2fa -o ' + o.ref) : ''; return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: 'fasta', warnings: warn }) }; }
      o = C.outFile(up, { name: inp.outName, suffix: '.filtered', ext: 'fastq' });
      line = up.out ? ('seqkit seq' + opts + ' ' + inref + ' -o ' + o.ref) : '';
      return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: 'fastq', warnings: warn }) };
    },
    doc: '<p><code>seqkit seq</code> filters reads by <strong>length</strong> (<code>-m</code> min, ' +
      '<code>-M</code> max) and <strong>average quality</strong> (<code>-Q</code>) — useful for dropping tiny or ' +
      'low-quality Nanopore reads before mapping. Tick <em>Convert to FASTA</em> to drop the quality lines and ' +
      'output plain sequences.</p>',
    code: "seqkit seq -m 200 -Q 10 reads.fastq.gz -o reads.filtered.fastq"
  });

  /* ---- seqkit locate (find a motif/primer) ------------------------------ */
  MBT.registerTool({
    id: 'seqkit-locate', name: 'seqkit locate (find motif)', group: 'code', category: 'Reads / QC',
    description: 'Find where a sequence (primer, adapter, motif) occurs in each read, with positions & strand.',
    inputs: [
      { name: 'in', label: 'FASTQ / FASTA', control: 'text', type: 'job', socket: true, required: true, hint: 'The reads/sequences to search. In a loop it searches each file.' },
      { name: 'pattern', label: 'Sequence to find', control: 'text', socket: false, required: true, placeholder: 'e.g. GGTGGTGG or NGG', hint: 'The motif/primer/adapter to locate. IUPAC ambiguity codes (N, R, Y…) are allowed — leave the “allow ambiguity” option on for them.' },
      { name: 'degenerate', label: 'Allow ambiguity codes (-d)', control: 'checkbox', socket: false, default: true, advanced: true, hint: 'Treat IUPAC codes in the pattern as their base sets (e.g. N = A/C/G/T). Turn off for an exact-letters search.' },
      { name: 'mismatches', label: 'Allowed mismatches (-m)', control: 'number', socket: false, min: 0, step: 1, advanced: true, placeholder: '0', hint: 'How many mismatched bases to tolerate per hit. 0 = exact.' },
      { name: 'outFile', label: 'Save hits to', control: 'text', socket: false, advanced: true, placeholder: 'blank = print to the terminal', hint: 'Optional file for the results table (columns: read, pattern, strand, start, end).' }
    ],
    outputs: [ { name: 'out', label: 'Same reads (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!up.out) warn.push(C.warn('err', 'seqkit locate: input is required.'));
      if (!inp.pattern) warn.push(C.warn('err', 'seqkit locate: a sequence to find is required.'));
      var opts = (inp.degenerate !== false ? ' -d' : '') + ((inp.mismatches !== '' && inp.mismatches != null) ? ' -m ' + inp.mismatches : '');
      var line = (up.out && inp.pattern) ? ('seqkit locate' + opts + ' -p ' + C.q(inp.pattern) + ' ' + C.inputRef(up) + report(up, inp.outFile, 'locate.tsv')) : '';
      return { out: C.step(inp.in, { line: line, warnings: warn }) };
    },
    doc: '<p><code>seqkit locate</code> reports every place a short sequence appears in your reads — a table of ' +
      'read ID, which strand, and the start/end positions. Handy for spotting a primer/adapter or a PAM ' +
      '(<code>NGG</code>) site. <em>Allow ambiguity</em> (<code>-d</code>) lets the pattern use IUPAC codes, and ' +
      'you can permit a few mismatches.</p>',
    code: "seqkit locate -d -p NGG reads.fastq.gz"
  });

  /* ---- first N reads ----------------------------------------------------- */
  MBT.registerTool({
    id: 'first-n', name: 'First N reads', group: 'code', category: 'Reads / QC',
    description: 'Take just the first N reads from a FASTQ (or first N alignments from a BAM) — great for quick tests.',
    inputs: [
      { name: 'in', label: 'FASTQ or BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'The file to sample the top of. Works on fastq/fastq.gz/fasta (uses seqkit head) and BAM (uses samtools).' },
      { name: 'n', label: 'How many reads', control: 'number', socket: false, required: true, default: 100, min: 1, step: 1, hint: 'Number of reads/alignments to keep from the start of the file.' },
      { name: 'outName', label: 'Output path', control: 'text', socket: false, advanced: true, placeholder: 'auto: <name>.head.<ext>', hint: 'Leave blank to write <name>.head.<ext> next to the input (or per-file in a loop).' }
    ],
    outputs: [ { name: 'out', label: 'First N (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!up.out) warn.push(C.warn('err', 'First N reads: input is required.'));
      var N = (inp.n !== '' && inp.n != null) ? inp.n : 100, inref = C.inputRef(up), line = '', o;
      if (up.kind === 'bam' || up.kind === 'sam' || up.kind === 'cram') {
        o = C.outFile(up, { name: inp.outName, suffix: '.head', ext: 'bam' });
        line = up.out ? ('samtools head -n ' + N + ' ' + inref + ' | samtools view -b -o ' + o.ref + ' -') : '';
        return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: 'bam', warnings: warn }) };
      }
      var ext = (up.kind === 'fasta') ? 'fasta' : 'fastq';
      o = C.outFile(up, { name: inp.outName, suffix: '.head', ext: ext });
      line = up.out ? ('seqkit head -n ' + N + ' ' + inref + ' -o ' + o.ref) : '';
      return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: ext, warnings: warn }) };
    },
    doc: '<p>Pulls the first N records off the top of a file so you can test a pipeline in seconds instead of on ' +
      'the whole dataset. For FASTQ/FASTA it uses <code>seqkit head</code>; for a BAM it keeps the header plus the ' +
      'first N alignments and writes a valid little BAM.</p>',
    code: "seqkit head -n 100 reads.fastq.gz -o reads.head.fastq"
  });
})();
