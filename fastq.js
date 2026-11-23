/* FASTQ nodes — merge many barcode folders into one .fastq.gz each, and
 * gunzip/gzip (single file, whole folder, or once per file inside a loop). */
(function () {
  var C = MBT.code;

  /* ---- Merge barcode folders -------------------------------------------- */
  MBT.registerTool({
    id: 'fastq-merge', name: 'Merge FASTQ (per folder)', group: 'code', category: 'FASTQ',
    description: 'Join each barcode folder’s many *.fastq.gz chunks into one file: dest/<barcode>.fastq.gz.',
    inputs: [
      { name: 'parent', label: 'Parent folder (holds barcode01, barcode02, …)', control: 'text', type: 'job', socket: true,
        placeholder: 'C:\\data\\260416_gtail\\basecalling\\basecalling_notrim\\pass',
        hint: 'The folder that CONTAINS the barcode folders (…\\pass). One loop then covers every barcode — so even 96 barcodes is a single node. Wire a WSL Path here or paste the path.' },
      { name: 'dest', label: 'Destination folder', control: 'text', socket: false, required: true,
        placeholder: 'C:\\data\\260416_gtail\\merged',
        hint: 'Where the merged files are written, one per barcode: dest\\barcode01.fastq.gz, dest\\barcode02.fastq.gz, …' },
      { name: 'pattern', label: 'Which subfolders', control: 'text', socket: false, default: 'barcode*', row: 'a', flex: 1,
        hint: 'Pattern for the barcode subfolders. barcode* means barcode01, barcode02, …; the * matches anything.' },
      { name: 'ext', label: 'Chunks to join', control: 'select', socket: false, default: 'fastq.gz', row: 'a', flex: 1,
        hint: 'The many small files inside each barcode folder to concatenate.',
        options: [ { value: 'fastq.gz', label: '*.fastq.gz' }, { value: 'fq.gz', label: '*.fq.gz' }, { value: 'fastq', label: '*.fastq' }, { value: 'fq', label: '*.fq' } ] },
      { name: 'folders', label: 'Only these folders (one per line)', control: 'textarea', socket: false, rows: 3, advanced: true,
        placeholder: 'C:\\...\\pass\\barcode01\nC:\\...\\pass\\barcode09',
        hint: 'Optional. Instead of a parent + pattern, list specific barcode folders to merge (one path per line). If filled, this is used instead of the parent folder.' },
      { name: 'mkdir', label: 'Create destination folder first', control: 'checkbox', socket: false, default: true, advanced: true,
        hint: 'Adds "mkdir -p" so the destination exists before writing.' }
    ],
    outputs: [ { name: 'out', label: 'Merged files folder (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.parent), dest = C.toWsl(inp.dest), ext = inp.ext || 'fastq.gz', warn = [];
      var suffix = /\.gz$/.test(ext) ? '.fastq.gz' : '.fastq';
      if (!dest) warn.push(C.warn('err', 'Merge FASTQ: destination folder is required.'));
      var list = C.splitLines(inp.folders).map(C.toWsl), lines = [];
      if (inp.mkdir && dest) lines.push('mkdir -p ' + C.q(dest));
      if (list.length) {
        list.forEach(function (d) { lines.push('cat ' + C.q(d) + '/*.' + ext + ' > ' + C.q(dest + '/' + C.basename(d) + suffix)); });
      } else if (up.out) {
        lines.push('for d in ' + C.q(up.out) + '/' + (inp.pattern || 'barcode*') + '/; do');
        lines.push('  b=$(basename "$d")');
        lines.push('  cat "$d"*.' + ext + ' > ' + C.q(dest) + '/"$b"' + suffix);
        lines.push('done');
      } else { warn.push(C.warn('err', 'Merge FASTQ: give a parent folder, or list specific folders under “More options”.')); }
      var j = C.step(inp.parent, { line: lines.join('\n'), out: dest, ref: C.q(dest), kind: 'dir', warnings: warn });
      return { out: j };
    },
    doc: '<p>Nanopore basecalling writes many <code>*.fastq.gz</code> chunks into one folder per barcode. This ' +
      'joins each barcode folder into a single <code>&lt;barcode&gt;.fastq.gz</code> in your destination.</p>' +
      '<p>Point <em>Parent folder</em> at <code>…\\pass</code> and it writes one <code>for</code> loop covering ' +
      'every <code>barcode*</code> folder, so 96 barcodes stay a single node. Concatenating gzip files with ' +
      '<code>cat</code> is valid — the result is a legal gzip. To then process each merged file, chain a ' +
      '<strong>For each file</strong> node onto the destination.</p>',
    code: "for d in '/mnt/c/.../pass'/barcode*/; do b=$(basename \"$d\"); cat \"$d\"*.fastq.gz > '/mnt/c/.../merged'/\"$b\".fastq.gz; done"
  });

  /* ---- gunzip / gzip ----------------------------------------------------- */
  MBT.registerTool({
    id: 'fastq-gzip', name: 'gunzip / gzip', group: 'code', category: 'FASTQ',
    description: 'Decompress .fastq.gz → .fastq (or compress back) — a single file, a whole folder, or once per file in a loop.',
    inputs: [
      { name: 'in', label: 'File or folder', control: 'text', type: 'job', socket: true, required: true,
        placeholder: 'wire a FASTQ / a folder, or paste a path',
        hint: 'The .fastq.gz file to decompress (or a folder of them). If this comes from a “For each file” loop, it runs once per file.' },
      { name: 'action', label: 'Action', control: 'select', socket: false, default: 'decompress',
        hint: 'Decompress (.gz → plain) or compress (plain → .gz).',
        options: [ { value: 'decompress', label: 'Decompress (gunzip)' }, { value: 'compress', label: 'Compress (gzip)' } ] },
      { name: 'keep', label: 'Keep the original file', control: 'checkbox', socket: false, default: true, row: 'o', flex: 1, advanced: true,
        hint: 'On = keep the source (safer, uses -k / -c). Off = replace it.' },
      { name: 'scope', label: 'If a folder', control: 'select', socket: false, default: 'auto', row: 'o', flex: 1, advanced: true,
        hint: 'When the input is a folder: process every matching file in it.',
        options: [ { value: 'auto', label: 'Auto' }, { value: 'file', label: 'Single file' }, { value: 'folder', label: 'All in folder' } ] },
      { name: 'outName', label: 'Output path (optional)', control: 'text', socket: false, advanced: true,
        placeholder: 'defaults next to the input', hint: 'Force a specific output file (writes with gunzip -c > file).' }
    ],
    outputs: [ { name: 'out', label: 'Result (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), p = up.out, warn = [];
      if (!p) warn.push(C.warn('err', 'gunzip/gzip: input is required.'));
      var decompress = (inp.action || 'decompress') !== 'compress';
      var keep = inp.keep !== false, tool = decompress ? 'gunzip' : 'gzip', inref = C.inputRef(up);
      var line = '', out = p, ref = up.ref, kind = up.kind;
      if (!p) { /* nothing */ }
      else if (up.inLoop) {
        var o = C.outFile(up, { name: inp.outName, ext: decompress ? 'fastq' : 'fastq.gz' });
        line = tool + ' -c ' + inref + ' > ' + o.ref; out = o.out; ref = o.ref; kind = decompress ? 'fastq' : 'fastq.gz';
      } else if (inp.scope === 'folder' || ((inp.scope === 'auto' || !inp.scope) && up.kind === 'dir')) {
        var glob = decompress ? '*.fastq.gz' : '*.fastq';
        line = 'for x in ' + C.q(p) + '/' + glob + '; do ' + tool + (keep ? ' -k' : '') + ' "$x"; done';
        out = p; ref = C.q(p); kind = 'dir';
      } else if (inp.outName) {
        var o2 = C.outFile(up, { name: inp.outName }); line = tool + ' -c ' + inref + ' > ' + o2.ref; out = o2.out; ref = o2.ref; kind = decompress ? 'fastq' : 'fastq.gz';
      } else {
        line = tool + (keep ? ' -k' : '') + ' ' + inref;
        out = decompress ? p.replace(/\.gz$/i, '') : p + '.gz'; ref = C.q(out); kind = decompress ? 'fastq' : 'fastq.gz';
      }
      return { out: C.step(inp.in, { line: line, out: out, ref: ref, kind: kind, warnings: warn }) };
    },
    doc: '<p>Wraps <code>gunzip</code>/<code>gzip</code>. “Keep the original” uses <code>-k</code> (or ' +
      '<code>-c &gt; file</code>) so nothing is deleted. A folder input processes every matching file; inside a ' +
      '<strong>For each file</strong> loop it decompresses that one file to <code>&lt;folder&gt;/$stem.fastq</code>.</p>',
    code: "gunzip -k m.fastq.gz                 # -> m.fastq (original kept)\ngunzip -c \"$f\" > out/$stem.fastq     # inside a loop"
  });
})();
