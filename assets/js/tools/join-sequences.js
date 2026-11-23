/* Join Sequences — concatenate two inputs (with an optional separator).
 * A "fan-in" node: feed two upstream outputs into A and B in the Workflow. */
(function () {
  var Bio = MBT.bio;
  function run(a, b, sep, order, clean) {
    var A = String(a == null ? '' : a), B = String(b == null ? '' : b);
    if (clean) { A = Bio.lettersOnly(A); B = Bio.lettersOnly(B); }
    var first = order === 'BA' ? B : A, second = order === 'BA' ? A : B;
    var result = first + (sep == null ? '' : sep) + second;
    return { result: result, length: result.length };
  }
  MBT.registerTool({
    id: 'join-sequences',
    name: 'Join Sequences',
    category: 'Sequence Tools',
    description: 'Concatenate two inputs (A + B) with an optional separator — useful for adding adapters/tags.',
    inputs: [
      { name: 'a', label: 'Input A', control: 'textarea', rows: 3, placeholder: 'first part…' },
      { name: 'b', label: 'Input B', control: 'textarea', rows: 3, placeholder: 'second part…' },
      { name: 'sep', label: 'Separator', control: 'text', default: '', socket: false, placeholder: '(none)' },
      { name: 'order', label: 'Order', control: 'select', default: 'AB', socket: false, options: [
        { value: 'AB', label: 'A then B' }, { value: 'BA', label: 'B then A' }] },
      { name: 'clean', label: 'Strip non-letters before joining', control: 'checkbox', default: false }
    ],
    outputs: [
      { name: 'result', label: 'Joined', type: 'text', mono: true },
      { name: 'length', label: 'Length', type: 'number' }
    ],
    compute: function (inp) { return run(inp.a, inp.b, inp.sep, inp.order, !!inp.clean); },
    doc: '<p>Sticks two sequences together. In the Workflow builder this is the main two-input (“fan-in”) ' +
      'node: wire one upstream result into A and another into B — for example to prepend a cloning adapter ' +
      'or append a tag to a coding sequence.</p>' +
      '<p><strong>Options.</strong> An optional <em>separator</em> is inserted between the two parts; ' +
      '<em>order</em> swaps which comes first; <em>strip non-letters</em> cleans each part (letters only) ' +
      'before joining so you do not introduce spaces.</p>',
    code: "result = (order==='BA' ? B + sep + A : A + sep + B);\n" +
      "// 'strip non-letters' applies lettersOnly() to A and B first"
  });
})();
