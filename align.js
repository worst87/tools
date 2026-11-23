/* minimap2 — align long reads (Nanopore/PacBio) to a reference and (by default)
 * pipe straight into samtools sort to get a ready-to-index sorted BAM. */
(function () {
  var C = MBT.code;
  MBT.registerTool({
    id: 'minimap2', name: 'minimap2 (align)', group: 'code', category: 'Align',
    description: 'Map FASTQ reads to a reference genome → a sorted BAM (or SAM). ONT preset by default.',
    inputs: [
      { name: 'reads', label: 'Reads (FASTQ)', control: 'text', type: 'job', socket: true, required: true, hint: 'The reads to align. Wire a merged/filtered FASTQ here (or run it inside a “For each file” loop to align each barcode).' },
      { name: 'ref', label: 'Reference (FASTA or .mmi)', control: 'text', socket: false, required: true, placeholder: 'C:\\refs\\genome.fasta', hint: 'The genome/target you’re mapping against — a FASTA file, or a prebuilt minimap2 .mmi index. Every read is compared to this.' },
      { name: 'preset', label: 'Read type (preset -x)', control: 'select', socket: false, default: 'map-ont', hint: 'Tuning for your data. map-ont = Nanopore (default), map-pb = PacBio, sr = short Illumina reads, splice = spliced/mRNA.', options: [ { value: 'map-ont', label: 'Nanopore (map-ont)' }, { value: 'map-pb', label: 'PacBio (map-pb)' }, { value: 'sr', label: 'Short reads (sr)' }, { value: 'splice', label: 'Spliced / mRNA (splice)' } ] },
      { name: 'sort', label: 'Sort into a BAM (recommended)', control: 'checkbox', socket: false, default: true, hint: 'On = pipe the alignment through samtools sort to produce a sorted .bam ready for indexing. Off = write raw .sam text.' },
      { name: 'threads', label: 'CPU threads', control: 'number', socket: false, default: 4, min: 1, step: 1, advanced: true, hint: 'Processor threads for aligning and sorting. More = faster.' },
      { name: 'outName', label: 'Output path', control: 'text', socket: false, advanced: true, placeholder: 'auto: <name>.bam', hint: 'Leave blank to write <name>.bam (or .sam) next to the reads, or per-file in a loop’s output folder.' }
    ],
    outputs: [ { name: 'out', label: 'Aligned BAM/SAM (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.reads), warn = [];
      if (!up.out) warn.push(C.warn('err', 'minimap2: reads are required.'));
      var ref = C.toWsl(inp.ref); if (!ref) warn.push(C.warn('err', 'minimap2: a reference (FASTA or .mmi) is required.'));
      var T = parseInt(inp.threads, 10); T = T > 0 ? T : 4;
      var preset = inp.preset || 'map-ont', readsRef = C.inputRef(up), line = '', o;
      if (inp.sort !== false) {
        o = C.outFile(up, { name: inp.outName, ext: 'bam' });
        line = (up.out && ref) ? ('minimap2 -a -x ' + preset + ' -t ' + T + ' ' + C.q(ref) + ' ' + readsRef + ' | samtools sort -@ ' + T + ' -o ' + o.ref + ' -') : '';
        return { out: C.step(inp.reads, { line: line, out: o.out, ref: o.ref, kind: 'bam', warnings: warn }) };
      }
      o = C.outFile(up, { name: inp.outName, ext: 'sam' });
      line = (up.out && ref) ? ('minimap2 -a -x ' + preset + ' -t ' + T + ' ' + C.q(ref) + ' ' + readsRef + ' > ' + o.ref) : '';
      return { out: C.step(inp.reads, { line: line, out: o.out, ref: o.ref, kind: 'sam', warnings: warn }) };
    },
    doc: '<p><strong>minimap2</strong> is the standard long-read aligner: it works out where each read sits on a ' +
      'reference genome. <code>-x map-ont</code> tunes it for Nanopore error profiles (use <code>map-pb</code> for ' +
      'PacBio). <code>-a</code> makes it output SAM.</p>' +
      '<p>With <em>Sort into a BAM</em> on (recommended) the output is piped through <code>samtools sort</code>, ' +
      'so you get a coordinate-sorted <code>.bam</code> in one step — then just add <em>samtools index</em>. This ' +
      'is the usual first node: reads in, sorted BAM out, ready for the BAM/SAM tools.</p>',
    code: "minimap2 -a -x map-ont -t 4 ref.fasta reads.fastq.gz | samtools sort -@ 4 -o reads.bam -"
  });
})();
