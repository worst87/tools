/* Scratchpad — a free rich-text notebook. Paste, edit, delete, bold or
 * highlight sequences while you work; the output is the plain text. As a node
 * it has one input (loads text in) and one output (plain text out). Resize it
 * freely: drag the editor's own grip, drag any node border when selected, or
 * press ↕ for auto-fit. */
MBT.registerTool({
  id: 'scratchpad',
  name: 'Scratchpad',
  category: 'Cleanup & Format',
  description: 'A free rich-text notebook to jot, trim, bold or highlight sequences. Outputs the plain text.',
  inputs: [
    { name: 'content', label: 'Notebook', control: 'richtext', type: 'text', socket: true,
      hint: 'Type or paste freely. B / ▤ / ⌫ bold, highlight or clear; ↕ toggles auto-fit. Drag the editor edge (or any node border when selected) to resize.' }
  ],
  outputs: [
    { name: 'text', label: 'Plain text', type: 'text', mono: true }
  ],
  compute: function (inp) { return { text: MBT.ui.stripHtml(inp.content) }; },
  doc: '<p>A scratch area for when you just want to look at, trim, or mark up a sequence without it becoming ' +
    'part of a calculation. Type or paste anything, delete bits, <strong>bold</strong> or <mark>highlight</mark> ' +
    'regions, then copy what you need.</p>' +
    '<p>In the Workflow builder it has an input socket (pipe a sequence in to scratch on) and an output socket ' +
    'that emits the <em>plain</em> text (formatting is visual only). Resize it any way you like — drag the ' +
    'editor’s corner grip, drag any border once the node is selected, or hit <strong>↕</strong> to auto-fit the ' +
    'height to the content.</p>',
  code: "// formatting via the contenteditable toolbar (bold / highlight / clear)\n" +
    "output.text = stripHtmlTags(content);   // visual formatting removed for piping"
});
