# 🧬 Worst Toolkit

_(named after the author, "Worst" — the site lives in the `Molbio_website` folder.)_

A clean, fast, **free** collection of everyday molecular-biology tools in one website — plus a visual **Workflow builder** that lets you chain tools together like nodes (think "geometry nodes in Blender, but for sequences").

Pasted sequences and calculations run in the browser. Grab Flanking can search the hg38 and T2T-CHM13v2.0 indices at GGGenome when you click Search reference. Fetch interval sends the assembly and selected coordinates to UCSC. GitHub Pages serves the application directly.

---

## 1. Test it locally first (30 seconds)

You can check everything works **before** publishing.

### Easiest way — just open it
Double-click **`index.html`**. It opens in your browser and fully works (the site uses plain `<script>` files with no build step, so `file://` is fine). Click around: try a tool, open the **Workflow** tab (a demo pipeline loads automatically).

### Optional — run it like a real web server
A local server behaves identically to GitHub Pages. From this folder:

```bash
# Python (already on most machines)
python -m http.server 8000
# then open http://localhost:8000
```

```bash
# or Node, if you prefer
npx serve .
```

> If `Copy` buttons ever don't work from `file://`, that's just a browser clipboard restriction on local files — it works fine once hosted (or via the local server above).

---

## 2. Update the published toolkit

Extract the release ZIP and upload its contents to the root of the existing `worst87/tools` repository, next to the current `index.html`. Preserve the `assets/` directory structure. Commit to the branch serving Pages, then check the Pages deployment in Actions. The workflow entry point is [worst87.github.io/tools/#/workflow](https://worst87.github.io/tools/#/workflow).

### Setting up a new Pages site

You only need a free GitHub account. Two routes — pick one.

### Route A — no command line (drag-and-drop in the browser)

1. Go to **https://github.com/new** and create a repository.
   - Name it anything, e.g. `molbio-toolkit`.
   - Set it to **Public**.
   - Don't add a README (you already have one). Click **Create repository**.
2. On the new repo page, click **“uploading an existing file”**.
3. Upload `index.html`, the complete `assets/` folder and `.nojekyll` to the Pages source directory. For the existing worst87/tools repository, place them alongside the current root index.html.
   - **Do not** upload `node_modules/` (it's only for tests and is git-ignored anyway).
4. Click **Commit changes**.
5. Go to **Settings → Pages** (left sidebar).
6. Under **Build and deployment → Source**, choose **Deploy from a branch**.
7. Set **Branch** to `main` and folder to **`/ (root)`**, then **Save**.
8. Wait ~1 minute, refresh the Pages settings page, and your live URL appears at the top:
   **`https://<your-username>.github.io/molbio-toolkit/`**

### Route B — with Git (command line)

```bash
cd path/to/Molbio_website
git init
git add .
git commit -m "Worst Toolkit: initial site"
git branch -M main
git remote add origin https://github.com/<your-username>/molbio-toolkit.git
git push -u origin main
```

Then do **Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save** (steps 5–8 above).

### Updating the site later
Re-upload changed files (Route A) or `git add . && git commit -m "update" && git push` (Route B). GitHub Pages redeploys automatically in about a minute.

> **Why `.nojekyll`?** It tells GitHub Pages to serve files as-is (no Jekyll processing). It's already included.

---

## 3. What's inside

| Section | Tools |
|---|---|
| **Cleanup & Format** | Clean Sequence / Text (presets for sequence lines, single-record FASTA, spacing and case) · Find & Replace · **Scratchpad** (rich-text notebook) · **Compare Texts** (linear diff, highlights the differing part) |
| **Sequence Tools** | Sequence Converter (DNA⇄RNA⇄protein, complement, reverse, reverse-complement, translation with start/stop) · ORF Finder & Reading Frames (marks start/stop, UTR breakdown) · Sequence Stats · Primer Tm Calculator · Sequence Find (mismatches + degenerate bases like NGG, previous/next, jump to hit and highlighted context) · Grab Flanking (pasted sequence, hg38 or T2T-CHM13v2.0) · Degenerate Base Finder/Replacer · Join Sequences |
| **Calculators** | Dilution (C1V1=C2V2) · Ligation (NEB-style molar ratio) · DNA Mass ⇄ Moles · **Gibson / NEBuilder Assembly** · **Master Mix** |
| **Workflow** | Node editor for the biology tools: chain tools, branch one output into many · **colour-coded by category** · **zoom** (scroll zooms into the node/canvas under the cursor) · **middle-mouse pan** · **resize** by selecting a node and dragging any border/corner — E/W set width, N/S grow the text/table boxes; bare number outputs stay fixed and nothing overflows the node · **auto-arrange** · **undo/redo** · **multi-select + copy/paste** (shift-click, Ctrl+C/V) · **editable wired inputs** (edit auto-detaches, keeps value) · **drag a .json onto the canvas** to import · **anchored notes** · **named projects** (saved & reloaded automatically) |
| **Coding** *(WSL/path canvas)* | Same node editor, scoped to command-line/WSL tools (`group:'code'`) — its own teal nodes and saved workspaces. Includes 19 command generators for paths, FASTQ, SeqKit, minimap2, samtools, Docker and script export. |

**Workflow shortcuts** (also under the ⌨ Shortcuts button): `Space` opens the add-node menu **at the cursor** — the new node lands where the cursor was, and you can **type to search** the node list (Enter adds the top hit) · `F` fit view · `X`/`Delete` delete selected · `Shift+click` multi-select · `Ctrl+C/V` copy/paste nodes · `Ctrl+A` select all · `Ctrl+Z/Y` undo/redo · `Esc` cancel anchor. To **resize**, click a node to select it, then drag any border or corner — left/right edges set the node width, top/bottom edges grow its text/table boxes (individual grips adjust one field at a time). The connection **ports stay grabbable even when a node is selected**, so you can wire straight from a selected node without hitting a resize edge. **Ctrl+scroll** over a text/table box **zooms that node's text** (font only, node size unchanged); the header `↺` resets size *and* text zoom. **Middle-mouse-drag** pans the canvas. Scrolling zooms into whatever is under the cursor (a scrollable box scrolls instead).

Every tool page doubles as **documentation** — a "How it works" panel explains the method and shows the core code. Use **Copy** for the full output, or **Copy a range** on long text for an inclusive character interval. Drag the grip below an editor or result to change its height. Double-click the grip to restore the default. A filterable **activity log** (⚑ Log, bottom-right) records errors and events.

**Accuracy:** translation uses the Standard Genetic Code; primer Tm uses the **SantaLucia (1998)** unified nearest-neighbor model with salt correction (validated against a hand calculation — see `tests/`).

---

## 4. Project layout

```
index.html                      # app shell + script load order
.nojekyll                       # GitHub Pages: serve files as-is
assets/
  css/style.css                 # all styles, organised in numbered sections
  js/
    core/
      registry.js               # the tool registry + shared schema (read this first)
      bioseq.js                 # all molecular-biology logic (pure, testable)
      ui.js                     # DOM helpers + auto-generated tool forms
      logger.js                 # the ⚑ activity log (errors + events)
    tools/                      # ONE file per biology tool (group:'bio') — add/remove freely
      number-remover.js  whitespace-remover.js  case-converter.js  find-replace.js  scratchpad.js
      sequence-converter.js  reading-frames.js  sequence-stats.js  tm-calculator.js
      sequence-find.js  degenerate-bases.js  diff.js  join-sequences.js
      dilution-calculator.js  ligation-calculator.js  mass-moles.js
      gibson.js  master-mix.js
    tools-code/                 # Coding/WSL tools (group:'code') — none yet; README.md has the recipe
    core/motif.js               # shared match and strand-aware flank calculations
    core/field-views.js         # per-field resize, match navigation and range copy
    tools/grab-flanking.js      # local and indexed human references
    workflow/workflow.js        # node engine — powers BOTH the Workflow and Coding canvases
    app.js                      # hash router (#/workflow bio · #/coding code)
tests/
  bio-tests.js                  # node tests/bio-tests.js   (no install needed)
  dom-tests.js                  # node tests/dom-tests.js    (needs: npm install jsdom)
project.md                      # aims, objectives, phases, design decisions
handover.md                     # current status + where to pick up (for humans or AI)
```

---

## 5. Add or remove a tool (this is the whole point of the design)

Every tool is **one self-contained file** built from a single schema, and that same definition powers **both** the standalone tool page **and** the workflow node. No logic is duplicated.

**To add a tool:**
1. Create `assets/js/tools/my-tool.js`:
   ```js
   MBT.registerTool({
     id: 'my-tool',
     name: 'My Tool',
     category: 'Sequence Tools',            // must be one of MBT.categories
     description: 'What it does, in one line.',
     inputs:  [{ name: 'seq', label: 'Sequence', control: 'textarea' }],
     outputs: [{ name: 'result', label: 'Result', type: 'text' }],
     compute: function (inp) {              // pure; must not throw
       return { result: (inp.seq || '').toUpperCase() };
     },
     doc:  '<p>Explain what it does and the method.</p>',   // shown on the tool page
     code: "result = seq.toUpperCase();"                    // core-logic snippet (optional)
   });
   ```
   Keep `doc` (and `code`) accurate whenever you change the tool — each tool page is its own documentation.

   **Compact layout (optional per input):** add `row: 'x'` to put several inputs on one line, `flex: 2` to size them, and `visibleWhen: function(values){ return ... }` to show/hide a field dynamically. Socket inputs always take a full row so their connection port stays on the node border. These work identically on the tool page and in workflow nodes (see Gibson and Master Mix for examples).
2. Add one line in `index.html`:
   `<script src="assets/js/tools/my-tool.js"></script>`

That's it — it appears on the home page, gets its own page, and is available as a workflow node automatically.

**To remove a tool:** delete its file and its `<script>` line. Nothing else references it.

The full schema (input/output fields, socket types, controls) is documented at the top of **`assets/js/core/registry.js`**.

---

## 6. Run the tests

```bash
node tests/bio-tests.js      # 32 biology checks incl. Tm validation + IUPAC (no deps)
npm install jsdom            # one-time, only for the DOM test
node tests/workbench-tests.js # workflow, matching, reference requests and regression checks
node tests/dom-tests.js      # boots the app, pages, docs, outputs, diff, tool logic, node resize, groups + Coding canvas
```
