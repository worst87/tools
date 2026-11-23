/* WSL Path — optional source node. Paste a Windows path and it becomes a WSL
 * /mnt path you can wire into other nodes. (You can also just type Windows paths
 * straight into any node — the Bash Script node converts them for you.) */
(function () {
  var C = MBT.code;
  MBT.registerTool({
    id: 'wsl-path', name: 'WSL Path (source)', group: 'code', category: 'Paths',
    description: 'Optional: turn one Windows path into a WSL /mnt path you can wire into the tool nodes.',
    inputs: [
      { name: 'path', label: 'Windows or WSL path', control: 'text', socket: false, required: true,
        placeholder: 'C:\\data\\260416_gtail\\basecalling\\...\\pass\\barcode01',
        hint: 'Paste a Windows path. WSL sees your C: drive at /mnt/c, so C:\\data\\x becomes /mnt/c/data/x. Paths already in /mnt form are left alone. A path with no file extension is treated as a folder.' },
      { name: 'kind', label: 'This path is a', control: 'select', socket: false, default: 'auto',
        hint: 'What this path points at. Leave on Auto to detect it from the file extension; set it only when the guess is wrong (this just controls the friendly warnings, not the command).',
        options: [
          { value: 'auto', label: 'Auto-detect' }, { value: 'dir', label: 'Folder / directory' },
          { value: 'fastq.gz', label: 'FASTQ (.fastq.gz)' }, { value: 'fastq', label: 'FASTQ (.fastq)' },
          { value: 'bam', label: 'BAM' }, { value: 'sam', label: 'SAM' }, { value: 'csv', label: 'CSV/TSV' } ] }
    ],
    outputs: [
      { name: 'out', label: 'WSL path — drag into a tool', type: 'job' }
    ],
    compute: function (inp) {
      var wsl = C.toWsl(inp.path);
      if (!wsl) return { out: C.emptyJob() };
      var kind = (inp.kind && inp.kind !== 'auto') ? inp.kind : C.guessKind(wsl);
      var j = C.emptyJob(); j.out = wsl; j.ref = C.q(wsl); j.kind = kind;
      return { out: j };
    },
    doc: '<p><strong>You usually don’t need this node.</strong> Every tool field accepts a Windows path and ' +
      'converts it automatically, and the Bash Script node has a “Convert Windows paths” switch that fixes any ' +
      'that slipped through. Use this node only when you want one path in one place to feed several tools.</p>' +
      '<p>WSL mounts your Windows drives under <code>/mnt</code>: <code>C:\\data\\x</code> → ' +
      '<code>/mnt/c/data/x</code>. The single output shows the converted path (click it to copy) and can be ' +
      'dragged into any tool node’s input.</p>',
    code: "C:\\data\\x\\barcode01   ->   /mnt/c/data/x/barcode01"
  });
})();
