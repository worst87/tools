/* ============================================================================
 * _codelib.js  —  Shared helpers for the Coding (WSL) canvas tools.
 *
 * The Coding canvas builds shell commands to PASTE INTO WSL — nothing runs in
 * the browser. Nodes chain by a single "job" value flowing along the wires
 * (socket type 'job'):
 *
 *   job = {
 *     __job:true,
 *     out:   '/mnt/c/.../barcode01.bam',  // this step's output (for display + kind)
 *     ref:   "'/mnt/c/.../barcode01.bam'", // how the NEXT node references it (quoted/expr)
 *     kind:  'fastq.gz'|'fastq'|'bam'|'sam'|'csv'|'dir'|'unknown',
 *     line:  '…',        // shell line(s) THIS node contributes
 *     script:'…',        // full bash accumulated from the source to here
 *     warnings:[{level,msg}],
 *     // loop context (set by the "For each file" node):
 *     inLoop:false, indent:'', outdir:'', loops:0
 *   }
 *
 * A tool's compute() typically does:
 *   var up = MBT.code.asJob(inp.in);
 *   var o  = MBT.code.outFile(up, { name: inp.outName, suffix:'.sorted', ext:'bam' });
 *   var line = 'samtools sort -o ' + o.ref + ' ' + MBT.code.inputRef(up);
 *   return { out: MBT.code.step(inp.in, { line: line, out:o.out, ref:o.ref, kind:'bam' }) };
 *
 * Inside a "For each file" loop the loop variable is $f and $stem is the
 * filename without extensions, so outFile() writes clean per-file names like
 * <outdir>/$stem.sorted.bam — no path juggling for the user.
 * ==========================================================================*/
(function (MBT) {
  'use strict';
  var code = {};

  /* ---- path conversion (Windows <-> WSL /mnt) ---------------------------- */
  code.toWsl = function (p) {
    p = String(p == null ? '' : p).trim();
    if (!p) return '';
    var m = p.match(/^([A-Za-z]):[\\/](.*)$/);
    if (m) return '/mnt/' + m[1].toLowerCase() + '/' + m[2].replace(/\\/g, '/');
    return p.replace(/\\/g, '/');
  };
  code.toWin = function (p) {
    p = String(p == null ? '' : p).trim(); if (!p) return '';
    var m = p.match(/^\/mnt\/([a-z])\/(.*)$/i);
    if (m) return m[1].toUpperCase() + ':\\' + m[2].replace(/\//g, '\\');
    return p;
  };
  // Convert EVERY Windows drive path found in a blob of text to its /mnt form.
  code.convertScriptPaths = function (s) {
    return String(s == null ? '' : s).replace(/(^|[\s'"=(])([A-Za-z]):[\\/]([^\s'"|<>;()]*)/g, function (m, boundary, d, rest) { return boundary + '/mnt/' + d.toLowerCase() + '/' + rest.replace(/\\/g, '/'); });
  };

  /* ---- shell quoting / names -------------------------------------------- */
  code.q = function (p) { p = String(p == null ? '' : p); if (p === '') return "''"; return "'" + p.replace(/'/g, "'\\''") + "'"; };
  code.basename = function (p) { p = String(p || '').replace(/[\\/]+$/, ''); var i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i >= 0 ? p.slice(i + 1) : p; };
  code.dirname = function (p) { p = String(p || '').replace(/[\\/]+$/, ''); var i = p.lastIndexOf('/'); return i > 0 ? p.slice(0, i) : (i === 0 ? '/' : ''); };
  var KNOWN_EXT = /\.(fastq\.gz|fq\.gz|fasta\.gz|fa\.gz|fna\.gz|fastq|fq|fa|fasta|fna|bam|sam|cram|vcf\.gz|vcf|bed|csv|tsv|gz)$/i;
  code.stem = function (p) { var b = code.basename(p); return b.replace(KNOWN_EXT, ''); };
  code.splitLines = function (s) { return String(s == null ? '' : s).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); };

  code.guessKind = function (p) {
    p = String(p || '').toLowerCase().replace(/[\\/]+$/, '');
    if (/\.(fastq|fq)\.gz$/.test(p)) return 'fastq.gz';
    if (/\.(fastq|fq)$/.test(p)) return 'fastq';
    if (/\.(?:fa|fasta|fna)(?:\.gz)?$/.test(p)) return 'fasta';
    if (/\.bam$/.test(p)) return 'bam';
    if (/\.sam$/.test(p)) return 'sam';
    if (/\.cram$/.test(p)) return 'cram';
    if (/\.(csv|tsv)$/.test(p)) return 'csv';
    if (/\*/.test(p)) { var mm = p.match(/\.(\w+(?:\.gz)?)$/); return mm ? code.guessKind('x.' + mm[1]) : 'unknown'; }
    if (/\.[a-z0-9]{1,6}$/.test(p)) return 'file';
    return 'dir';
  };

  /* ---- job model --------------------------------------------------------- */
  function base() { return { __job: true, out: '', ref: '', kind: 'unknown', line: '', script: '', warnings: [], inLoop: false, indent: '', outdir: '', loops: 0 }; }
  code.emptyJob = base;
  code.asJob = function (v) {
    if (v && typeof v === 'object' && v.__job) { if (v.ref == null) v.ref = v.out ? code.q(v.out) : ''; if (v.warnings == null) v.warnings = []; if (v.loops == null) v.loops = 0; return v; }
    if (typeof v === 'string' && v.trim()) { var w = code.toWsl(v); var j = base(); j.out = w; j.ref = code.q(w); j.kind = code.guessKind(w); return j; }
    return base();
  };
  // How the NEXT node should reference this job's file on the command line.
  code.inputRef = function (up) { up = code.asJob(up); return up.ref || code.q(up.out); };
  // Extend an upstream job with this node's own line(s) (indented if in a loop).
  code.step = function (up, opts) {
    up = code.asJob(up); opts = opts || {};
    var indent = up.indent || '';
    var raw = opts.line || '';
    var line = raw ? raw.split('\n').map(function (l) { return l ? indent + l : l; }).join('\n') : '';
    var script = line ? (up.script ? up.script + '\n' + line : line) : up.script;
    return {
      __job: true,
      out: (opts.out != null ? opts.out : up.out),
      ref: (opts.ref != null ? opts.ref : up.ref),
      kind: (opts.kind || up.kind),
      line: line,
      script: script,
      warnings: (up.warnings || []).slice().concat(opts.warnings || []),
      inLoop: (opts.inLoop != null ? opts.inLoop : up.inLoop),
      indent: (opts.indent != null ? opts.indent : up.indent),
      outdir: (opts.outdir != null ? opts.outdir : up.outdir),
      loops: (opts.loops != null ? opts.loops : up.loops)
    };
  };
  // Compute an output file path + its shell reference. spec: {name, dir, suffix, ext}
  code.outFile = function (up, spec) {
    up = code.asJob(up); spec = spec || {};
    var suffix = spec.suffix || '', ext = spec.ext || 'out';
    if (spec.name) { var p = code.toWsl(spec.name); return { out: p, ref: code.q(p) }; }
    if (up.inLoop) {
      var dir = spec.dir ? code.toWsl(spec.dir) : (up.outdir || '');
      var body = (dir ? dir + '/' : '') + '$stem' + suffix + '.' + ext;
      return { out: (dir ? dir + '/' : '') + '<name>' + suffix + '.' + ext, ref: '"' + body + '"' };
    }
    var d = spec.dir ? code.toWsl(spec.dir) : code.dirname(up.out);
    var q = (d ? d + '/' : '') + code.stem(up.out) + suffix + '.' + ext;
    return { out: q, ref: code.q(q) };
  };
  // Close any for-loops left open by "For each file" nodes.
  code.closeLoops = function (job) { job = code.asJob(job); var n = job.loops || 0, arr = []; for (var i = n - 1; i >= 0; i--) arr.push(new Array(i + 1).join('  ') + 'done'); return arr.join('\n'); };
  code.warn = function (level, msg) { return { level: level, msg: msg }; };

  /* ---- linter (Scan button in the Bash Script node) --------------------- */
  code.lint = function (job) {
    job = code.asJob(job);
    var issues = (job.warnings || []).slice();
    var s = job.script || '';
    if (!s.trim()) { issues.push(code.warn('warn', 'No commands yet — connect a chain of nodes into this one.')); return issues; }
    if (/(^|[\s'"=(])[A-Za-z]:[\\/]/.test(s)) issues.push(code.warn('err', 'A Windows path (C:\\…) is still in the script. Turn on “Convert Windows paths” below, or use a WSL Path node, so it becomes /mnt/… .'));
    var mkdirs = {}; (s.match(/mkdir\s+-p\s+('[^']*'|"[^"]*"|\S+)/g) || []).forEach(function (m) { mkdirs[m.replace(/^mkdir\s+-p\s+/, '').replace(/^['"]|['"]$/g, '')] = 1; });
    (s.match(/>\s*('[^']*'|"[^"]*"|\S+)/g) || []).forEach(function (m) {
      var t = m.replace(/^>\s*/, '').replace(/^['"]|['"]$/g, ''); var d = code.dirname(t);
      if (d && d.indexOf('$') === -1 && !mkdirs[d]) issues.push(code.warn('info', 'Writes into ' + d + ' — add a "mkdir -p" (Merge FASTQ can) if that folder might not exist yet.'));
    });
    if (/\bsamtools\b/.test(s)) issues.push(code.warn('info', 'Uses samtools — install it in WSL: conda/mamba install -c bioconda samtools (or apt install samtools).'));
    if (/\bseqkit\b/.test(s)) issues.push(code.warn('info', 'Uses seqkit — install: conda/mamba install -c bioconda seqkit.'));
    if (/\bbbduk(\.sh)?\b/.test(s)) issues.push(code.warn('info', 'Uses bbduk — install BBMap and make bbduk.sh available on PATH.'));
    if (/\bdocker\b/.test(s)) issues.push(code.warn('info', 'Uses docker — Docker Desktop with WSL integration (or docker in WSL) must be running.'));
    return issues;
  };
  code.lintHtml = function (issues) {
    if (!issues.length) return '<span class="lint-ok">✓ No problems found.</span>';
    var esc = MBT.ui.escapeHtml, errs = issues.filter(function (i) { return i.level === 'err'; }).length, warns = issues.filter(function (i) { return i.level === 'warn'; }).length;
    return esc(errs + ' error(s), ' + warns + ' warning(s):') + '<ul>' + issues.map(function (i) { return '<li class="' + i.level + '">' + esc(i.msg) + '</li>'; }).join('') + '</ul>';
  };

  MBT.code = code;
})(window.MBT);
