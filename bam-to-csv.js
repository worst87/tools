/* BAM -> CSV — tick the SAM columns you want; builds a
 *   samtools view … | awk … > out.csv
 * command. Optional named tags (NM, AS, …) are pulled from the optional fields.
 * Loop-aware: after a "For each file" node it writes one CSV per input. */
(function () {
  var C = MBT.code;
  // [name, SAM field #, plain-language help, advanced?]
  var COLS = [
    ['QNAME', 1, 'Read name — the sequencing read’s unique ID.', false],
    ['FLAG', 2, 'Flags — a number encoding yes/no facts about the read (mapped, paired, reverse strand, secondary…).', false],
    ['RNAME', 3, 'Reference name — which chromosome/contig the read mapped to ("*" = unmapped).', false],
    ['POS', 4, 'Position — 1-based leftmost coordinate where the read maps on the reference.', false],
    ['MAPQ', 5, 'Mapping quality — confidence the read is placed correctly (higher = surer, 0–60).', false],
    ['CIGAR', 6, 'CIGAR — compact code for how the read aligns: M=match/mismatch, I=insertion, D=deletion, S=soft-clip (e.g. 98M2S).', false],
    ['RNEXT', 7, 'Mate’s reference — the chromosome of this read’s mate for paired-end data ("=" = same chromosome, "*" = none).', true],
    ['PNEXT', 8, 'Mate’s position — where the mate read maps (paired-end); 0 if there is none.', true],
    ['TLEN', 9, 'Template length — observed fragment/insert size across a read pair (signed); 0 for single reads.', true],
    ['SEQ', 10, 'Sequence — the read’s bases (A/C/G/T/N).', true],
    ['QUAL', 11, 'Base qualities — per-base Phred quality as ASCII characters ("*" if absent).', true]
  ];
  var DEFAULT_ON = { QNAME: 1, FLAG: 1, RNAME: 1, POS: 1, MAPQ: 1, CIGAR: 1 };
  var colInputs = COLS.map(function (c, i) {
    return { name: 'c' + c[0], label: c[0], control: 'checkbox', socket: false, default: !!DEFAULT_ON[c[0]],
      row: 'col' + Math.floor(i / 3), flex: 1, advanced: c[3], hint: c[2] };
  });

  MBT.registerTool({
    id: 'bam-to-csv', name: 'BAM → CSV', group: 'code', category: 'BAM / SAM',
    description: 'Export the alignment columns you tick (plus optional tags) from a BAM to a CSV/TSV table.',
    inputs: [
      { name: 'in', label: 'Input BAM', control: 'text', type: 'job', socket: true, required: true, hint: 'The BAM to read. After a “For each file” loop it exports one CSV per input file.' }
    ].concat(colInputs).concat([
      { name: 'delim', label: 'Separator', control: 'select', socket: false, default: 'comma', row: 'opt', flex: 1, hint: 'Comma makes a .csv; Tab makes a .tsv. Choose Tab if any field might contain a comma (safer for strict parsing).', options: [ { value: 'comma', label: 'Comma (CSV)' }, { value: 'tab', label: 'Tab (TSV)' } ] },
      { name: 'outCsv', label: 'Output CSV path', control: 'text', socket: false, row: 'opt', flex: 2, placeholder: 'blank = <name>.csv next to the BAM', hint: 'Where to write the table. Leave blank to save <name>.csv beside the input (or per-file inside a loop).' },
      { name: 'tags', label: 'Extra tags (e.g. NM, AS)', control: 'text', socket: false, advanced: true, placeholder: 'NM, AS, de', hint: 'Optional aligner tags to add as columns. Common ONT/minimap2 ones: NM (edit distance to reference), AS (alignment score), de (per-base gap-compressed divergence). Comma-separated.' },
      { name: 'header', label: 'Write a header row', control: 'checkbox', socket: false, default: true, advanced: true, hint: 'Put the column names in the first row of the file.' },
      { name: 'region', label: 'Region', control: 'text', socket: false, advanced: true, placeholder: 'e.g. chr1:1-10000', hint: 'Optional: export only reads overlapping this region (needs an indexed BAM).' }
    ]),
    outputs: [ { name: 'out', label: 'CSV (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!up.out) warn.push(C.warn('err', 'BAM → CSV: input BAM is required.'));
      var selected = COLS.filter(function (c) { return !!inp['c' + c[0]]; });
      var tags = String(inp.tags || '').split(/[,\s]+/).filter(function (t) { return /^[A-Za-z][A-Za-z0-9]$/.test(t); });
      if (!selected.length && !tags.length) warn.push(C.warn('warn', 'BAM → CSV: tick at least one column.'));
      var o = C.outFile(up, { name: inp.outCsv, ext: 'csv' });
      var headerNames = selected.map(function (c) { return c[0]; }).concat(tags);
      var fields = selected.map(function (c) { return '$' + c[1]; }).concat(tags).join(',');
      var hdr = (inp.header && headerNames.length) ? ('BEGIN{print ' + headerNames.map(function (n) { return '"' + n + '"'; }).join(',') + '}') : '';
      var tagInit = tags.map(function (t) { return t + '=""'; }).join(';');
      var tagLoop = tags.length ? ('for(i=12;i<=NF;i++){' + tags.map(function (t) { return 'if($i~/^' + t + ':/){__s=split($i,__a,":");' + t + '=__a[__s]}'; }).join('') + '}') : '';
      var body = '{' + (tagInit ? tagInit + ';' : '') + tagLoop + 'print ' + fields + '}';
      var ofs = inp.delim === 'tab' ? "\\t" : ',';
      var line = (up.out && fields) ? ('samtools view ' + C.inputRef(up) + (inp.region ? ' ' + C.q(inp.region) : '') + " | awk -v OFS='" + ofs + "' '" + hdr + body + "' > " + o.ref) : '';
      return { out: C.step(inp.in, { line: line, out: o.out, ref: o.ref, kind: 'csv', warnings: warn }) };
    },
    doc: '<p>A BAM is a binary alignment file; this turns the parts you care about into a plain table you can open ' +
      'in Excel or pandas. It runs <code>samtools view</code> (which prints one line per read) through ' +
      '<code>awk</code> to keep just the ticked columns, in standard SAM order. Header (<code>@</code>) lines are ' +
      'skipped automatically.</p>' +
      '<p><strong>Columns</strong> are the 11 standard SAM fields — hover any checkbox for what it means. ' +
      '<strong>Tags</strong> are extra key:value annotations the aligner adds (e.g. <code>NM</code> = edit ' +
      'distance, <code>AS</code> = alignment score). Pick <strong>Tab (TSV)</strong> if a field such as a tag ' +
      'value might contain a comma.</p>',
    code: "samtools view in.bam | awk -v OFS=',' 'BEGIN{print \"QNAME\",\"FLAG\"}{print $1,$2}' > reads.csv"
  });
})();
