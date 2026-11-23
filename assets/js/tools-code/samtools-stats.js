/* samtools summary nodes — flagstat (mapping summary), idxstats (reads per
 * reference), depth (coverage). All loop-aware; reads flow through unchanged. */
(function () {
  var C = MBT.code;
  function report(up, outName, ext) {
    if (outName) return ' > ' + C.q(C.toWsl(outName));
    if (up.inLoop) return ' > ' + C.outFile(up, { ext: ext }).ref;
    return '';
  }
  function bamWarn(up) { var w = []; if (!up.out) w.push(C.warn('err', 'input BAM is required.')); if (up.kind === 'fastq' || up.kind === 'fastq.gz') w.push(C.warn('warn', 'expects a BAM, but the input looks like ' + up.kind + '.')); return w; }

  MBT.registerTool({
    id: 'samtools-flagstat', name: 'samtools flagstat', group: 'code', category: 'BAM / SAM',
    description: 'One-glance mapping summary: how many reads total, mapped, properly paired, secondary, duplicates.',
    inputs: [
      { name: 'in', label: 'BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'The BAM to summarise. Tells you what fraction of reads actually aligned.' },
      { name: 'outFile', label: 'Save report to', control: 'text', socket: false, advanced: true, placeholder: 'blank = print to the terminal', hint: 'Optional file for the summary. Blank = just print it.' }
    ],
    outputs: [ { name: 'out', label: 'Same BAM (job)', type: 'job' } ],
    compute: function (inp) { var up = C.asJob(inp.in), w = bamWarn(up); var line = up.out ? ('samtools flagstat ' + C.inputRef(up) + report(up, inp.outFile, 'flagstat.txt')) : ''; return { out: C.step(inp.in, { line: line, warnings: w }) }; },
    doc: '<p><code>samtools flagstat</code> counts the SAM flags across the whole BAM and prints a short report — ' +
      'total reads, how many <strong>mapped</strong> (and the %), how many are <strong>properly paired</strong>, ' +
      '<strong>secondary</strong>/<strong>supplementary</strong> alignments, and duplicates. The quickest way to ' +
      'check a run’s overall mapping rate.</p>',
    code: "samtools flagstat in.sorted.bam"
  });

  MBT.registerTool({
    id: 'samtools-idxstats', name: 'samtools idxstats', group: 'code', category: 'BAM / SAM',
    description: 'Reads mapped per reference/contig (needs an indexed BAM) — see which targets got coverage.',
    inputs: [
      { name: 'in', label: 'Indexed BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'A coordinate-sorted, indexed BAM. Output columns: reference name, length, #mapped reads, #unmapped.' },
      { name: 'outFile', label: 'Save report to', control: 'text', socket: false, advanced: true, placeholder: 'blank = print to the terminal', hint: 'Optional file for the per-reference table.' }
    ],
    outputs: [ { name: 'out', label: 'Same BAM (job)', type: 'job' } ],
    compute: function (inp) { var up = C.asJob(inp.in), w = bamWarn(up); var line = up.out ? ('samtools idxstats ' + C.inputRef(up) + report(up, inp.outFile, 'idxstats.tsv')) : ''; return { out: C.step(inp.in, { line: line, warnings: w }) }; },
    doc: '<p><code>samtools idxstats</code> lists, per reference sequence (chromosome/contig/plasmid), its length ' +
      'and how many reads mapped to it. Great for a multi-target reference — you can see instantly which targets ' +
      'were hit and how strongly. Needs the <code>.bai</code> index (run samtools index first).</p>',
    code: "samtools idxstats in.sorted.bam"
  });

  MBT.registerTool({
    id: 'samtools-depth', name: 'samtools depth', group: 'code', category: 'BAM / SAM',
    description: 'Per-base read depth (coverage) down a BAM, optionally within a region.',
    inputs: [
      { name: 'in', label: 'Sorted BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'A coordinate-sorted BAM. Output is one line per position: reference, position, depth (how many reads cover it).' },
      { name: 'region', label: 'Region', control: 'text', socket: false, advanced: true, placeholder: 'e.g. chr1:1-10000', hint: 'Limit to a region (needs an indexed BAM). Blank = whole genome (can be a big file).' },
      { name: 'outFile', label: 'Save to', control: 'text', socket: false, advanced: true, placeholder: 'auto in a loop; else prints', hint: 'File to write the depth table to. In a loop it auto-writes one per input.' }
    ],
    outputs: [ { name: 'out', label: 'Same BAM (job)', type: 'job' } ],
    compute: function (inp) { var up = C.asJob(inp.in), w = bamWarn(up); var line = up.out ? ('samtools depth' + (inp.region ? ' -r ' + C.q(inp.region) : '') + ' ' + C.inputRef(up) + report(up, inp.outFile, 'depth.tsv')) : ''; return { out: C.step(inp.in, { line: line, warnings: w }) }; },
    doc: '<p><code>samtools depth</code> prints the number of reads covering every base (its <strong>depth</strong>/' +
      'coverage). Restrict it to a <em>region</em> for a quick look, or run genome-wide and summarise later. In a ' +
      '“For each file” loop it writes one depth table per barcode.</p>',
    code: "samtools depth -r chr1:1-10000 in.sorted.bam > depth.tsv"
  });
})();
