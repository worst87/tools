/* Docker run — paste an image you found online and build a `docker run` command
 * with volume mounts (Windows paths auto-converted to /mnt for WSL). */
(function () {
  var C = MBT.code;
  MBT.registerTool({
    id: 'docker-run', name: 'Docker run', group: 'code', category: 'Docker',
    description: 'Build a "docker run" command: an image, folders to share, and the command to run inside it.',
    inputs: [
      { name: 'image', label: 'Image', control: 'text', socket: false, required: true, placeholder: 'staphb/samtools:latest', hint: 'The container image name (and optional :tag) from Docker Hub / quay.io — e.g. staphb/samtools:latest.' },
      { name: 'command', label: 'Command to run inside', control: 'text', socket: false, placeholder: 'samtools --version', hint: 'The command executed inside the container. Leave blank to use the image’s default.' },
      { name: 'mounts', label: 'Folders to share (one per line)', control: 'textarea', socket: false, rows: 3, placeholder: 'C:\\data  ->  /data', hint: 'Share a Windows/WSL folder into the container so it can read/write your files. Each line: "hostpath -> containerpath", or just a host path to expose it at the same /mnt/… location. Windows paths convert automatically.' },
      { name: 'in', label: 'Also share this path (wired)', control: 'text', type: 'job', socket: true, advanced: true, placeholder: 'optional', hint: 'Optional: a path from another node, mounted at the same /mnt location inside the container.' },
      { name: 'rm', label: 'Auto-remove container (--rm)', control: 'checkbox', socket: false, default: true, row: 'f', flex: 1, advanced: true, hint: 'Delete the container when it finishes (recommended — avoids clutter).' },
      { name: 'it', label: 'Interactive (-it)', control: 'checkbox', socket: false, default: false, row: 'f', flex: 1, advanced: true, hint: 'Attach a terminal — for interactive shells/prompts.' },
      { name: 'gpus', label: 'GPUs (--gpus all)', control: 'checkbox', socket: false, default: false, row: 'f', flex: 1, advanced: true, hint: 'Expose GPUs to the container (needs the NVIDIA container toolkit; e.g. for GPU basecalling).' },
      { name: 'pull', label: 'docker pull first', control: 'checkbox', socket: false, default: false, row: 'f', flex: 1, advanced: true, hint: 'Download the newest image before running.' },
      { name: 'workdir', label: 'Working dir inside (-w)', control: 'text', socket: false, advanced: true, placeholder: '/data', hint: 'Folder to start in inside the container.' },
      { name: 'extra', label: 'Extra flags', control: 'text', socket: false, advanced: true, placeholder: '--user $(id -u):$(id -g)', hint: 'Any extra docker flags, added exactly as typed.' }
    ],
    outputs: [ { name: 'out', label: 'docker command (job)', type: 'job' } ],
    compute: function (inp) {
      var up = C.asJob(inp.in), warn = [];
      if (!inp.image) warn.push(C.warn('err', 'Docker run: an image is required.'));
      function mount(spec) { var a = String(spec).split('->'); var host = C.toWsl(a[0].trim()); if (!host) return ''; var cont = a[1] ? a[1].trim() : host; return '-v ' + C.q(host + ':' + cont); }
      var mounts = C.splitLines(inp.mounts).map(mount).filter(Boolean);
      if (up.out) mounts.push('-v ' + C.q(up.out + ':' + up.out));
      var parts = ['docker run'];
      if (inp.rm) parts.push('--rm'); if (inp.it) parts.push('-it'); if (inp.gpus) parts.push('--gpus all');
      parts = parts.concat(mounts);
      if (inp.workdir) parts.push('-w ' + C.q(inp.workdir));
      if (inp.extra) parts.push(inp.extra.trim());
      if (inp.image) parts.push(inp.image.trim());
      if (inp.command) parts.push(inp.command.trim());
      var run = inp.image ? parts.join(' ') : '';
      var line = (inp.pull && inp.image) ? ('docker pull ' + inp.image.trim() + '\n' + run) : run;
      return { out: C.step(inp.in, { line: line, out: inp.workdir || up.out, ref: C.q(inp.workdir || up.out || ''), kind: 'unknown', warnings: warn }) };
    },
    doc: '<p>Docker lets you run a tool in a ready-made container without installing it. Paste the image name, ' +
      'share the folder your data lives in (so the container can see it), and give the command to run. Each ' +
      '<em>mount</em> maps a folder on your machine to a path inside the container: ' +
      '<code>hostpath -&gt; containerpath</code>.</p>' +
      '<p>Needs Docker Desktop with WSL integration (or docker installed in WSL) running.</p>',
    code: "docker run --rm -v '/mnt/c/data:/data' -w /data staphb/samtools:latest samtools --version"
  });
})();
