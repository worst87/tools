/* Bash Script — the end of a chain. Assembles every upstream node into one
 * pasteable WSL script: closes any "For each file" loops, optionally converts
 * leftover Windows paths to /mnt, and a "Scan for problems" button checks it. */
(function () {
  var C = MBT.code;
  function assemble(up, convert, shebang) {
    up = C.asJob(up);
    var s = up.script || '';
    if (up.loops > 0) s = (s ? s + '\n' : '') + C.closeLoops(up);   // add the closing "done"(s)
    if (convert) s = C.convertScriptPaths(s);
    if (!s.trim()) return '';
    var head = shebang ? '#!/usr/bin/env bash\nset -euo pipefail\n\n' : '';
    return head + s + '\n';
  }
  MBT.registerTool({
    id: 'bash-script', name: 'Bash Script (output)', group: 'code', category: 'Output',
    description: 'Turn the connected nodes into one script to paste into WSL, and scan it for problems.',
    inputs: [
      { name: 'in', label: 'Pipeline (wire the last step here)', control: 'text', type: 'job', socket: true, required: true, hint: 'Connect the final node of your chain. The whole script is built from every node feeding into it.' },
      { name: 'convert', label: 'Convert Windows paths to WSL', control: 'checkbox', socket: false, default: true, hint: 'Rewrites any C:\\… left in the script to /mnt/c/… so you never have to add WSL Path nodes. Leave on.' },
      { name: 'shebang', label: 'Add safety header (recommended)', control: 'checkbox', socket: false, default: true, advanced: true, hint: 'Adds "#!/usr/bin/env bash" and "set -euo pipefail" so the script stops at the first error instead of charging on.' }
    ],
    outputs: [ { name: 'script', label: 'Bash script', type: 'text', mono: true } ],
    buttons: [
      { label: 'Scan for problems', title: 'Static check of the assembled script — no commands are run.',
        onClick: function (ctx) {
          var up = C.asJob(ctx.inputs.in);
          var finalScript = assemble(up, ctx.inputs.convert !== false, false);
          ctx.setStatus(C.lintHtml(C.lint({ __job: true, script: finalScript, warnings: up.warnings || [], loops: 0 })));
        } }
    ],
    compute: function (inp) {
      var up = C.asJob(inp.in);
      return { script: assemble(up, inp.convert !== false, inp.shebang !== false) };
    },
    doc: '<p>The last node in a chain. It shows every upstream command as one script you can copy straight into a ' +
      'WSL terminal, and it tidies up automatically: it adds the closing <code>done</code> for any ' +
      '<strong>For each file</strong> loop, and (by default) rewrites any leftover Windows paths to ' +
      '<code>/mnt/…</code> — so you can type Windows paths anywhere and never wire a WSL Path node.</p>' +
      '<p><strong>Scan for problems</strong> runs a static check on demand (paths still in Windows form, output ' +
      'folders that may not exist, required fields left blank, file-type mismatches between steps, and which ' +
      'external tools you’ll need installed). It only reads the text — it never runs anything.</p>',
    code: "#!/usr/bin/env bash\nset -euo pipefail\n\nfor f in '/mnt/c/data/merged'/barcode*.fastq.gz; do\n  stem=\"${f##*/}\"; stem=\"${stem%.gz}\"; stem=\"${stem%.*}\"\n  # … per-file commands …\ndone"
  });
})();
