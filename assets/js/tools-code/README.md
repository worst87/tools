# Coding / WSL canvas tools (`group: 'code'`)

This folder holds the tools for the **Coding** canvas (`#/coding`) — small WSL2 /
command-line conveniences such as Windows ↔ `/mnt/c` path conversion, FASTA/barcode
merging, batch-rename string builders, and command-string assemblers.

**Nothing is registered yet** — the canvas is intentionally empty so you can decide
what you actually need first. The framework is fully wired: the Coding canvas already
runs on the same engine as the Workflow canvas (`assets/js/workflow/workflow.js`),
has its own saved workspaces (`localStorage` key `mbt-code-projects`), its own node
colour (teal, `.cat-code`), and its own add-node menu scoped to `group: 'code'`.

## Add a code tool (recipe)

A code tool is an ordinary `MBT.registerTool({...})` — identical to a biology tool —
with **one extra field**: `group: 'code'`. That single field routes it to the Coding
canvas instead of the Workflow canvas. Everything else (typed sockets, the auto-built
standalone-style node, pure `compute`, `doc`/`code`) works exactly the same.

```js
// assets/js/tools-code/wsl-path.js   (EXAMPLE — not yet enabled)
MBT.registerTool({
  id: 'wsl-path', name: 'Windows ↔ WSL path', group: 'code', category: 'Paths',
  description: 'Convert C:\\Users\\me to /mnt/c/Users/me and back.',
  inputs: [
    { name: 'path', label: 'Path', control: 'text', socket: true, type: 'text',
      placeholder: 'C:\\Users\\me\\data' },
    { name: 'dir', label: 'Direction', control: 'select', socket: false, default: 'win2wsl',
      options: [{ value: 'win2wsl', label: 'Windows → WSL' },
                { value: 'wsl2win', label: 'WSL → Windows' }] }
  ],
  outputs: [{ name: 'result', label: 'Converted', type: 'text', mono: true }],
  compute: function (inp) {
    var p = (inp.path || '').trim(); if (!p) return { result: '' };
    if (inp.dir === 'wsl2win') {
      var m = p.match(/^\/mnt\/([a-z])\/(.*)$/i);
      return { result: m ? m[1].toUpperCase() + ':\\' + m[2].replace(/\//g, '\\') : p };
    }
    var w = p.match(/^([A-Za-z]):[\\/](.*)$/);
    return { result: w ? '/mnt/' + w[1].toLowerCase() + '/' + w[2].replace(/\\/g, '/') : p };
  },
  doc: '<p>Maps a drive-letter Windows path to its WSL <code>/mnt/&lt;drive&gt;</code> form and back.</p>',
  code: "win→wsl: C:\\x → /mnt/c/x ;  wsl→win: /mnt/c/x → C:\\x"
});
```

Then enable it with **one line** in `index.html`, in the
`<!-- tools: Coding / WSL canvas -->` block:

```html
<script src="assets/js/tools-code/wsl-path.js"></script>
```

The tool then appears in the Coding canvas's "+ Add node" menu under its category
(here, **Paths**). To pin a category order, add it to `MBT.categoryOrder.code` in
`assets/js/core/registry.js`; otherwise categories show in first-seen order.

## Conventions (same as the biology tools)

- Vanilla JS IIFE / `MBT.registerTool`, classic `<script>` tag, no build step.
- `compute()` is **pure** and must never throw (guard empty/invalid input).
- All transforms are **client-side string work only** — there is no real shell.
- Keep each tool's `doc`/`code` accurate; the node IS its documentation.
