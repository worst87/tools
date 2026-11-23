/* For each file (loop) — run the SAME chain of tools on every file in a folder.
 * Point it at a folder + a pattern (e.g. barcode*.fastq.gz for barcode01..96);
 * every tool you chain after it runs once per file, and the Bash Script node
 * closes the loop for you. Inside the loop the current file is "$f" and $stem is
 * its name without extensions (barcode01.fastq.gz -> barcode01), so tools write
 * tidy per-file outputs like <outputfolder>/barcode01.sorted.bam. */
(function () {
  var C = MBT.code;
  MBT.registerTool({
    id: 'for-each', name: 'For each file (loop)', group: 'code', category: 'Loop',
    description: 'Repeat the chained tools once per matching file in a folder (e.g. all 96 barcodes).',
    inputs: [
      { name: 'dir', label: 'Folder to loop over', control: 'text', type: 'job', socket: true, required: true,
        placeholder: 'C:\\data\\260416_gtail\\merged',
        hint: 'The folder that holds the files you want to process one by one. Wire a WSL Path here or paste it.' },
      { name: 'glob', label: 'File pattern', control: 'text', socket: false, required: true, default: '*.fastq.gz',
        placeholder: 'barcode*.fastq.gz',
        hint: 'Which files in the folder to loop over. Examples: *.fastq.gz (all), barcode*.fastq.gz (barcode01..96), *.bam. The * stands for “anything”.' },
      { name: 'outdir', label: 'Output folder for results', control: 'text', socket: false, advanced: true,
        placeholder: 'defaults to the same folder',
        hint: 'Where each tool writes its per-file result. Leave blank to write next to the inputs. Tools name outputs <folder>/<barcode>.<step>.<ext>.' }
    ],
    outputs: [ { name: 'each', label: 'Each file — chain tools after this', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.dir), dir = up.out, warn = [];
      var glob = inp.glob || '*';
      var outdir = C.toWsl(inp.outdir) || dir;
      if (!dir) warn.push(C.warn('err', 'For each file: a folder is required.'));
      var header = 'for f in ' + C.q(dir) + '/' + glob + '; do\n  [ -f "$f" ] || continue\n  stem="${f##*/}"; stem="${stem%.gz}"; stem="${stem%.*}"';
      var j = C.step(inp.dir, { line: dir ? header : '', out: (dir ? dir + '/' + glob : ''), ref: '"$f"', kind: C.guessKind(glob), warnings: warn, inLoop: true, indent: '  ', outdir: outdir, loops: (up.loops || 0) + 1 });
      return { each: j };
    },
    doc: '<p>Turns a whole folder into a batch. Everything you chain <em>after</em> this node runs once for every ' +
      'file that matches the pattern, so a folder of <code>barcode01.fastq.gz … barcode96.fastq.gz</code> is one ' +
      'node, not 96.</p>' +
      '<p><strong>How to use it.</strong> Set the folder and the pattern, then chain your tools (e.g. gunzip → ' +
      'align → samtools sort → index). End the chain in a Bash Script node — it adds the closing <code>done</code>. ' +
      'The result is a normal bash <code>for</code> loop:</p>' +
      '<p>Inside the loop two shell variables are available: <code>$f</code> is the current file’s full path, and ' +
      '<code>$stem</code> is its name with extensions stripped (<code>barcode01.fastq.gz</code> → ' +
      '<code>barcode01</code>). Tools use <code>$stem</code> to name their outputs, so you get ' +
      '<code>barcode01.sorted.bam</code>, <code>barcode02.sorted.bam</code>, and so on.</p>',
    code: "for f in '/mnt/c/data/merged'/barcode*.fastq.gz; do\n  stem=\"${f##*/}\"; stem=\"${stem%.gz}\"; stem=\"${stem%.*}\"\n  # …chained tools run here, once per file…\ndone"
  });
})();
