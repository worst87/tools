/* samtools nodes — sort · merge · index · view. Each builds a samtools command
 * (targets samtools >= 1.10) to paste into WSL. Loop-aware: drop any of them
 * after a "For each file" node to run per barcode. Nothing runs in the browser. */
(function () {
  var C = MBT.code;
  function thr(n) { n = parseInt(n, 10); return (n > 0) ? ' -@ ' + n : ''; }
  function needBam(up) { return (up.kind === 'fastq' || up.kind === 'fastq.gz') ? [C.warn('warn', 'This samtools step expects an aligned BAM/SAM, but the input looks like ' + up.kind + '. Align the reads first (e.g. with minimap2).')] : []; }

  /* ---- sort -------------------------------------------------------------- */
  MBT.registerTool({
    id: 'samtools-sort', name: 'samtools sort', group: 'code', category: 'BAM / SAM',
    description: 'Put a BAM’s alignments in genome-coordinate order (needed before indexing).',
    inputs: [
      { name: 'in', label: 'Input BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'The BAM to sort. Wire it in or paste a .bam path; after a “For each file” loop it sorts each file.' },
      { name: 'byName', label: 'Sort by read name instead (-n)', control: 'checkbox', socket: false, default: false, advanced: true, hint: 'Off (default) = sort by genome position, which indexing and most tools need. On = group mates together by read name (for some paired workflows).' },
      { name: 'threads', label: 'CPU threads (-@)', control: 'number', socket: false, default: 4, min: 1, step: 1, advanced: true, hint: 'How many processor threads to use. More = faster on a big file. 4 is a safe default.' },
      { name: 'outName', label: 'Output BAM path', control: 'text', socket: false, advanced: true, placeholder: 'auto: <name>.sorted.bam', hint: 'Leave blank to write <name>.sorted.bam next to the input (or in the loop’s output folder).' }
    ],
    outputs: [ { name: 'out', label: 'Sorted BAM (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = needBam(up);
      if (!up.out) warn.push(C.warn('err', 'samtools sort: input BAM is required.'));
      var o = C.outFile(up, { name: inp.outName, suffix: '.sorted', ext: 'bam' });
      var line = up.out ? ('samtools sort' + (inp.byName ? ' -n' : '') + thr(inp.threads) + ' -o ' + o.ref + ' ' + C.inputRef(up)) : '';
      return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: 'bam', warnings: warn }) };
    },
    doc: '<p>Aligners emit reads in the order they were processed; almost everything downstream (indexing, ' +
      'region queries, viewing in IGV) needs them in <strong>genome-coordinate order</strong>. ' +
      '<code>samtools sort -o out.bam in.bam</code> does that. Read-name order (<code>-n</code>) is only for ' +
      'specific paired-end steps.</p>',
    code: "samtools sort -@ 4 -o in.sorted.bam in.bam"
  });

  /* ---- merge ------------------------------------------------------------- */
  MBT.registerTool({
    id: 'samtools-merge', name: 'samtools merge', group: 'code', category: 'BAM / SAM',
    description: 'Combine several coordinate-sorted BAMs into one BAM.',
    inputs: [
      { name: 'bams', label: 'BAMs to merge (one path per line)', control: 'textarea', socket: false, required: true, rows: 3, placeholder: 'C:\\...\\a.sorted.bam\nC:\\...\\b.sorted.bam', hint: 'Two or more BAM files to combine, one path per line. They should already be coordinate-sorted (samtools sort).' },
      { name: 'out', label: 'Output BAM path', control: 'text', socket: false, required: true, placeholder: 'C:\\...\\merged.bam', hint: 'The combined BAM to create.' },
      { name: 'in', label: 'Also include this BAM (wired)', control: 'text', type: 'job', socket: true, advanced: true, placeholder: 'optional', hint: 'Optional: a BAM coming from another node, added to the list above.' },
      { name: 'threads', label: 'CPU threads', control: 'number', socket: false, default: 4, min: 1, step: 1, row: 'a', flex: 1, advanced: true, hint: 'Processor threads to use.' },
      { name: 'force', label: 'Overwrite if it exists (-f)', control: 'checkbox', socket: false, default: true, row: 'a', flex: 1, advanced: true, hint: 'Replace the output file if it already exists instead of erroring.' }
    ],
    outputs: [ { name: 'out', label: 'Merged BAM (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      var refs = C.splitLines(inp.bams).map(function (x) { return C.q(C.toWsl(x)); });
      if (up.out) refs.push(C.inputRef(up));
      var out = C.toWsl(inp.out);
      if (!out) warn.push(C.warn('err', 'samtools merge: output path is required.'));
      if (refs.length < 2) warn.push(C.warn('warn', 'samtools merge combines 2+ BAMs — add more input paths.'));
      var line = (out && refs.length) ? ('samtools merge' + (inp.force ? ' -f' : '') + thr(inp.threads) + ' ' + C.q(out) + ' ' + refs.join(' ')) : '';
      return { out: C.step(inp.in, { line: line, out: out, ref: C.q(out), kind: 'bam', warnings: warn }) };
    },
    doc: '<p><code>samtools merge out.bam in1.bam in2.bam …</code> stitches multiple coordinate-sorted BAMs into ' +
      'one (e.g. combining several sequencing runs of the same sample). Sort the inputs first.</p>',
    code: "samtools merge -f -@ 4 merged.bam a.sorted.bam b.sorted.bam"
  });

  /* ---- index ------------------------------------------------------------- */
  MBT.registerTool({
    id: 'samtools-index', name: 'samtools index', group: 'code', category: 'BAM / SAM',
    description: 'Build the .bai index so tools can jump to any region instantly.',
    inputs: [
      { name: 'in', label: 'Sorted BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'A coordinate-sorted BAM. Creates <name>.bam.bai beside it. Index before doing region queries or opening in IGV.' },
      { name: 'threads', label: 'CPU threads', control: 'number', socket: false, default: 4, min: 1, step: 1, advanced: true, hint: 'Processor threads to use.' }
    ],
    outputs: [ { name: 'out', label: 'Indexed BAM (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = needBam(up);
      if (!up.out) warn.push(C.warn('err', 'samtools index: input BAM is required.'));
      var line = up.out ? ('samtools index' + thr(inp.threads) + ' ' + C.inputRef(up)) : '';
      return { out: C.step(inp.in, { line: line, kind: 'bam', warnings: warn }) };   // path unchanged
    },
    doc: '<p>An index (<code>.bai</code>) is a small companion file that lets samtools/IGV/etc. fetch reads for a ' +
      'given region without scanning the whole BAM. The BAM must be coordinate-sorted first. The file itself is ' +
      'unchanged, so the chain continues with the same BAM.</p>',
    code: "samtools index -@ 4 in.sorted.bam      # -> in.sorted.bam.bai"
  });

  /* ---- view (filter / convert) ------------------------------------------ */
  MBT.registerTool({
    id: 'samtools-view', name: 'samtools view (filter)', group: 'code', category: 'BAM / SAM',
    description: 'Keep only the reads you want (by quality, region or flags) and/or convert BAM ⇄ SAM.',
    inputs: [
      { name: 'in', label: 'Input BAM/SAM', control: 'text', type: 'job', socket: true, required: true, hint: 'The alignments to filter. A region filter needs a coordinate-sorted + indexed BAM.' },
      { name: 'fmt', label: 'Output as', control: 'select', socket: false, default: 'bam', row: 'a', flex: 1, hint: 'BAM = compact binary (for pipelines/IGV). SAM = human-readable text.', options: [ { value: 'bam', label: 'BAM' }, { value: 'sam', label: 'SAM (text)' } ] },
      { name: 'minMapq', label: 'Min mapping quality', control: 'number', socket: false, min: 0, step: 1, row: 'a', flex: 1, placeholder: 'e.g. 20', hint: 'Drop reads whose MAPQ (confidence the read is in the right place, 0–60) is below this. 20 is a common cutoff; blank = keep all.' },
      { name: 'region', label: 'Region', control: 'text', socket: false, placeholder: 'e.g. chr1:1-10000', hint: 'Optional: keep only reads overlapping this region (chromosome[:start-end]). Requires an indexed BAM.' },
      { name: 'exclFlag', label: 'Exclude reads flagged (-F)', control: 'number', socket: false, min: 0, step: 1, advanced: true, placeholder: 'e.g. 2308', hint: 'Drop reads that have ANY of these SAM-flag bits set. 2308 = unmapped (4) + secondary (256) + supplementary (2048), i.e. keep only primary mapped reads.' },
      { name: 'inclFlag', label: 'Keep only reads flagged (-f)', control: 'number', socket: false, min: 0, step: 1, advanced: true, placeholder: 'e.g. 2', hint: 'Keep only reads that have ALL of these SAM-flag bits set. 2 = properly paired. Leave blank to not require any.' },
      { name: 'header', label: 'Include header (-h)', control: 'checkbox', socket: false, default: true, advanced: true, hint: 'Include the @-lines header (needed if the SAM/BAM will be used again downstream). BAM always keeps it.' },
      { name: 'outName', label: 'Output path', control: 'text', socket: false, advanced: true, placeholder: 'auto: <name>.filtered.<ext>', hint: 'Leave blank to write <name>.filtered.bam/.sam next to the input (or in the loop’s output folder).' }
    ],
    outputs: [ { name: 'out', label: 'Filtered (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = needBam(up);
      if (!up.out) warn.push(C.warn('err', 'samtools view: input is required.'));
      var sam = inp.fmt === 'sam', ext = sam ? 'sam' : 'bam';
      var o = C.outFile(up, { name: inp.outName, suffix: '.filtered', ext: ext });
      var opts = [];
      if (!sam) opts.push('-b'); if (sam && inp.header) opts.push('-h');
      if (inp.minMapq !== '' && inp.minMapq != null) opts.push('-q ' + inp.minMapq);
      if (inp.inclFlag !== '' && inp.inclFlag != null) opts.push('-f ' + inp.inclFlag);
      if (inp.exclFlag !== '' && inp.exclFlag != null) opts.push('-F ' + inp.exclFlag);
      var line = up.out ? ('samtools view ' + (opts.length ? opts.join(' ') + ' ' : '') + '-o ' + o.ref + ' ' + C.inputRef(up) + (inp.region ? ' ' + C.q(inp.region) : '')) : '';
      return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: ext, warnings: warn }) };
    },
    doc: '<p><code>samtools view</code> subsets and converts alignments. Common uses: keep confidently-mapped ' +
      'reads (<em>min mapping quality</em>, e.g. 20), keep one <em>region</em>, or use SAM <em>flags</em> to keep ' +
      'primary mapped reads only.</p>' +
      '<p><strong>Mapping quality (MAPQ)</strong> is how sure the aligner is the read sits in the right place ' +
      '(higher = surer). <strong>Flags</strong> are a set of yes/no bits per read (mapped? paired? secondary?); ' +
      '<code>-F 2308</code> drops unmapped/secondary/supplementary reads, leaving one primary alignment per read.</p>',
    code: "samtools view -b -q 20 -F 2308 -o out.bam in.sorted.bam chr1:1-10000"
  });
})();
