/* ============================================================================
 * ui.js  —  DOM helpers, shared controls, and the auto-generated tool form.
 *
 * Layout engine (shared with the node editor):
 *   • input.row — group inputs on one line · input.flex — width weight
 *   • input.visibleWhen(values) — show/hide a field (empty rows collapse)
 *   • input.advanced — folds into "More options"
 *   • tool.onInput(name, values) — react to a change (e.g. auto-fill defaults)
 *
 * Controls: text · textarea · number · select · checkbox · richtext.
 * Output types: text · number · table · html.
 *
 * BIG VALUES ARE NEVER TRUNCATED. Nothing is hidden from you — if a match is at
 * base 4,000,000 you can still see it. Staying fast at that size is a rendering
 * problem, solved twice:
 *   • plain text goes into a readonly <textarea>. The browser's own text engine
 *     only lays out the visible lines, so megabytes cost about the same as
 *     kilobytes — a wrapped <div> would lay out every line to find its height.
 *   • marked-up sequence goes through seqLinesHtml(), which emits one element
 *     per 60 bases with `content-visibility: auto`, so off-screen lines are
 *     skipped by the browser entirely.
 * ==========================================================================*/
window.MBT = window.MBT || {};

(function (MBT) {
  'use strict';
  var ui = {};

  ui.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    ui.append(node, children); return node;
  };
  ui.append = function (node, children) { if (children == null) return node; (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c == null || c === false) return; node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return node; };
  ui.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  ui.escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  ui.stripHtml = function (h) { return String(h == null ? '' : h).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); };
  ui.fmtInt = function (n) { return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-US') : String(n); };

  /* ---- layout engine ----------------------------------------------------- */
  ui.layoutRows = function (inputs) {
    var rows = [], cur = null, curId = null;
    (inputs || []).forEach(function (inp) {
      if (!inp.row) { rows.push([inp]); cur = null; curId = null; }
      else if (inp.row === curId && cur) { cur.push(inp); }
      else { cur = [inp]; curId = inp.row; rows.push(cur); }
    });
    return rows;
  };
  ui.visible = function (input, values) { return !input.visibleWhen || !!input.visibleWhen(values); };
  ui.setControlValue = function (ctl, value) {
    if (!ctl) return;
    if (ctl.__edit) { var h = value == null ? '' : String(value); if (ctl.__edit.innerHTML !== h) ctl.__edit.innerHTML = h; return; }
    if (ctl.type === 'checkbox') { ctl.checked = !!value; return; }
    var v = value == null ? '' : String(value);
    if (ctl.value !== v) ctl.value = v;
  };

  /* ---- clipboard / download ---------------------------------------------- */
  ui.copy = function (text) { text = String(text == null ? '' : text); if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return ui._copyFallback(text); }); return Promise.resolve(ui._copyFallback(text)); };
  ui._copyFallback = function (text) { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); return ok; };
  ui.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = ui.el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };
  ui.copyButton = function (getText, label) {
    var btn = ui.el('button', { class: 'icon-btn', type: 'button', title: 'Copy to clipboard' }, label || 'copy');
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      Promise.resolve(ui.copy(getText())).then(function () {
        var old = btn.textContent; btn.textContent = 'copied'; btn.classList.add('is-copied');
        setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied'); }, 1100);
      });
    });
    return btn;
  };
  ui.flashCopied = function (el) { var toast = ui.el('span', { class: 'copy-toast' }, 'copied'); el.appendChild(toast); setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 850); };
  ui.enableClickCopy = function (el, getText) {
    el.classList.add('click-copy'); var sx = 0, sy = 0;
    el.addEventListener('mousedown', function (e) { sx = e.clientX; sy = e.clientY; });
    el.addEventListener('mouseup', function (e) {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) return;      // a drag = selecting text
      if (window.getSelection && String(window.getSelection()).length > 0) return;
      var text = getText(); if (text == null || text === '') return;
      Promise.resolve(ui.copy(text)).then(function () { ui.flashCopied(el); });
    });
  };
  ui.enablePaste = function (el) {
    el.addEventListener('contextmenu', function (e) {
      if (!(navigator.clipboard && navigator.clipboard.readText && window.isSecureContext)) return;
      e.preventDefault();
      navigator.clipboard.readText().then(function (text) {
        var s = el.selectionStart, en = el.selectionEnd;
        if (s == null) el.value += text;
        else { el.value = el.value.slice(0, s) + text + el.value.slice(en); el.selectionStart = el.selectionEnd = s + text.length; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }).catch(function () {});
    });
  };

  /* ---- the full-screen value inspector ---------------------------------- */
  // A readonly textarea, so it opens instantly whatever the size. "ruler"
  // reformats into numbered 10-base blocks — still plain text, still fast.
  ui.openInspector = function (opts) {
    opts = opts || {};
    var text = String(opts.text == null ? '' : opts.text);
    var isSeq = !!opts.seq;
    var existing = document.getElementById('mbtInspector'); if (existing) existing.remove();

    var area = ui.el('textarea', { class: 'insp-body mono', readonly: 'readonly', spellcheck: 'false' });
    var wrapOn = true, rulerOn = false;
    function render() {
      area.classList.toggle('nowrap', !wrapOn);
      area.value = (isSeq && rulerOn) ? ui.seqRuler(text, 60) : text;
    }
    function tgl(label, title, get, set) {
      var b = ui.el('button', { class: 'icon-btn', type: 'button', title: title }, label);
      function sync() { b.classList.toggle('is-on', get()); }
      b.addEventListener('click', function () { set(!get()); sync(); render(); }); sync(); return b;
    }
    var head = ui.el('div', { class: 'insp-head' }, [
      ui.el('span', { class: 'insp-title' }, opts.title || 'Value'),
      ui.el('span', { class: 'insp-meta mono' }, ui.describeValue(text, isSeq)),
      ui.el('span', { class: 'spacer' }),
      isSeq ? tgl('ruler', 'Number the sequence in 10-base blocks', function () { return rulerOn; }, function (v) { rulerOn = v; }) : null,
      tgl('wrap', 'Wrap long lines', function () { return wrapOn; }, function (v) { wrapOn = v; }),
      ui.copyButton(function () { return text; }),
      ui.el('button', { class: 'icon-btn', type: 'button', title: 'Download as a file',
        onclick: function () { ui.download((opts.filename || 'value') + '.txt', text); } }, 'save'),
      ui.el('button', { class: 'icon-btn', type: 'button', title: 'Close (Esc)', onclick: close }, 'close')
    ]);
    var panel = ui.el('div', { class: 'insp-panel' }, [head, area]);
    var overlay = ui.el('div', { class: 'insp-overlay', id: 'mbtInspector' }, panel);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    function close() { document.removeEventListener('keydown', onKey, true); overlay.remove(); }
    document.addEventListener('keydown', onKey, true);
    render();
    document.body.appendChild(overlay);
    return { close: close };
  };

  // "1,204 nt · 61.2% GC" / "3 lines · 84 chars" — the one-line summary shown
  // under every output box so you know what you're looking at without counting.
  ui.describeValue = function (v, isSeq) {
    if (v == null || v === '') return 'empty';
    if (typeof v === 'number') return isFinite(v) ? ui.fmtInt(v) : '—';
    if (typeof v === 'object') return v.headers ? ((v.rows || []).length + ' rows') : 'value';
    var s = String(v);
    if (isSeq && MBT.bio) {
      var letters = s.replace(/[^A-Za-z]/g, '');
      if (letters.length) {
        var gc = MBT.bio.gcFraction(letters);
        var isNt = /^[ACGTUNRYSWKMBDHV]+$/i.test(letters);
        return ui.fmtInt(letters.length) + (isNt ? ' nt' : ' aa') + (isNt ? ' · ' + (gc * 100).toFixed(1) + '% GC' : '');
      }
    }
    var lines = s.split('\n').length;
    return ui.fmtInt(s.length) + ' chars' + (lines > 1 ? ' · ' + ui.fmtInt(lines) + ' lines' : '');
  };

  // Sequence as plain text in numbered 10-base blocks.
  ui.seqRuler = function (seq, perLine) {
    var s = String(seq == null ? '' : seq).replace(/\s+/g, '');
    perLine = perLine || 60;
    if (!s) return '';
    var width = String(s.length).length, out = [];
    for (var i = 0; i < s.length; i += perLine) {
      var chunk = s.substr(i, perLine), blocks = [];
      for (var j = 0; j < chunk.length; j += 10) blocks.push(chunk.substr(j, 10));
      var pos = String(i + 1); while (pos.length < width) pos = ' ' + pos;
      out.push(pos + '  ' + blocks.join(' '));
    }
    return out.join('\n');
  };

  // A sequence viewer: one line per `perLine` bases, with a position ruler and
  // the given 1-based inclusive ranges wrapped in <mark>.
  //
  // Lines are grouped into pages carrying `content-visibility: auto` (see
  // .sv-page in the stylesheet), so the browser skips layout and paint for the
  // pages you have scrolled past. That is what lets a two-megabyte sequence sit
  // in the DOM in full — every base and every match is really there, and the
  // cost of showing it stays roughly constant.
  ui.SEQ_PAGE_LINES = 50;
  ui.seqLinesHtml = function (seq, ranges, perLine) {
    var s = String(seq == null ? '' : seq);
    perLine = perLine || 60;
    if (!s) return '';
    ranges = ranges || [];
    var width = String(s.length).length;
    var pages = [], page = [], out;
    var r = 0;                                   // index into ranges as we sweep
    for (var i = 0; i < s.length; i += perLine) {
      var lineEnd = Math.min(i + perLine, s.length);   // 0-based, exclusive
      var pos = String(i + 1); while (pos.length < width) pos = ' ' + pos;
      var body = '', at = i;
      // Ranges are sorted and non-overlapping, so one forward sweep is enough.
      while (r < ranges.length && ranges[r][1] <= i) r++;
      var k = r;
      while (k < ranges.length && ranges[k][0] - 1 < lineEnd) {
        var from = Math.max(ranges[k][0] - 1, i), to = Math.min(ranges[k][1], lineEnd);
        if (from > at) body += ui.escapeHtml(s.slice(at, from));
        body += '<mark class="hit">' + ui.escapeHtml(s.slice(from, to)) + '</mark>';
        at = to;
        if (ranges[k][1] > lineEnd) break;        // this range continues overleaf
        k++;
      }
      if (at < lineEnd) body += ui.escapeHtml(s.slice(at, lineEnd));
      // The position ruler is a CSS ::before on data-pos rather than a real
      // element: one less node per line (which matters at 30,000 lines), and
      // copying the viewer then gives you clean sequence without the numbers.
      page.push('<div class="sv-line" data-pos="' + pos + '  ">' + body + '</div>');
      if (page.length >= ui.SEQ_PAGE_LINES) { pages.push('<div class="sv-page">' + page.join('') + '</div>'); page = []; }
    }
    if (page.length) pages.push('<div class="sv-page">' + page.join('') + '</div>');
    out = pages.join('');
    return out;
  };

  // Several strands stacked and column-aligned — a duplex, a duplex plus its
  // transcript, an alignment. Wrapped into blocks with a labelled position
  // ruler, using the same paging trick as seqLinesHtml so it stays cheap
  // however long the molecule is.
  //
  // rows: [{ label, seq, cls, marks, noPos }] — every seq the same length.
  // The caller decides what the rows mean; this only lays them out.
  ui.strandsHtml = function (rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && r.seq != null; });
    if (!rows.length || !rows[0].seq.length) return '';
    var perLine = opts.perLine || 60, startPos = opts.startPos || 1;
    var len = rows[0].seq.length;
    var labelW = rows.reduce(function (w, r) { return Math.max(w, (r.label || '').length); }, 0);
    var posW = String(startPos + len - 1).length;
    function gutter(label, pos) {
      var l = label || ''; while (l.length < labelW) l += ' ';
      var p = pos == null ? '' : String(pos);
      while (p.length < posW) p = ' ' + p;
      return l + ' ' + p + '  ';
    }
    // Each row keeps its own cursor into its own mark list.
    rows.forEach(function (r) { r._m = 0; });

    function markedSlice(row, from, to) {
      var marks = row.marks;
      if (!marks || !marks.length) return ui.escapeHtml(row.seq.slice(from, to));
      var body = '', at = from;
      while (row._m < marks.length && marks[row._m][1] <= from) row._m++;
      var k = row._m;
      while (k < marks.length && marks[k][0] - 1 < to) {
        var a = Math.max(marks[k][0] - 1, from), b = Math.min(marks[k][1], to);
        if (a > at) body += ui.escapeHtml(row.seq.slice(at, a));
        body += '<mark class="hit">' + ui.escapeHtml(row.seq.slice(a, b)) + '</mark>';
        at = b;
        if (marks[k][1] > to) break;
        k++;
      }
      if (at < to) body += ui.escapeHtml(row.seq.slice(at, to));
      return body;
    }

    var pages = [], page = [], blocks = 0;
    for (var i = 0; i < len; i += perLine) {
      var end = Math.min(i + perLine, len);
      var block = '';
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var g = row.noPos ? gutter('', null).replace(/[^ ]/g, ' ') : gutter(row.label, startPos + i);
        // The last strand of each block carries the gap to the next block.
        var cls = 'sv-line ' + (row.cls || '') + (r === rows.length - 1 ? ' sv-blockend' : '');
        block += '<div class="' + cls + '" data-pos="' + ui.escapeHtml(g) + '">' + markedSlice(row, i, end) + '</div>';
      }
      page.push(block);
      if (++blocks % 16 === 0) { pages.push('<div class="sv-page">' + page.join('') + '</div>'); page = []; }
    }
    if (page.length) pages.push('<div class="sv-page">' + page.join('') + '</div>');
    return pages.join('');
  };

  /* ---- table + html outputs --------------------------------------------- */
  ui.tableToText = function (v) {
    if (!v || !v.headers) return '';
    var lines = [];
    if (v.caption) lines.push(v.caption);
    lines.push(v.headers.join('\t'));
    (v.rows || []).forEach(function (r) { lines.push(r.join('\t')); });
    if (v.foot) lines.push(v.foot.join('\t'));
    return lines.join('\n');
  };
  ui.tableToCsv = function (v) {
    if (!v || !v.headers) return '';
    function cell(c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }
    var lines = [v.headers.map(cell).join(',')];
    (v.rows || []).forEach(function (r) { lines.push(r.map(cell).join(',')); });
    if (v.foot) lines.push(v.foot.map(cell).join(','));
    return lines.join('\n');
  };
  ui.renderTableInto = function (container, v) {
    ui.clear(container);
    if (!v || typeof v !== 'object') { container.appendChild(document.createTextNode('—')); return; }
    if (v.caption) container.appendChild(ui.el('div', { class: 'out-table-cap' }, v.caption));
    if (!v.headers) { if (!v.caption) container.appendChild(document.createTextNode('—')); return; }
    function cells(tag, arr) { return ui.el('tr', null, arr.map(function (c, i) { return ui.el(tag, { class: i ? 'num' : '' }, String(c)); })); }
    var kids = [ui.el('thead', null, cells('th', v.headers)), ui.el('tbody', null, (v.rows || []).map(function (r) { return cells('td', r); }))];
    if (v.foot) kids.push(ui.el('tfoot', null, cells('td', v.foot)));
    container.appendChild(ui.el('table', { class: 'out-table' }, kids));
  };
  ui.renderHtmlInto = function (container, html) { container.innerHTML = html == null ? '' : html; };

  /* ---- input controls ---------------------------------------------------- */
  function richControl(input, value, onChange) {
    var wrap = ui.el('div', { class: 'ctl-rich-wrap' });
    var edit = ui.el('div', { class: 'ctl ctl-rich mono', contenteditable: 'true', spellcheck: 'false' });
    edit.innerHTML = value == null ? '' : value;
    edit.addEventListener('input', function () { onChange(edit.innerHTML); });
    function cmd(c, arg) { return function (e) { e.preventDefault(); edit.focus(); try { document.execCommand(c, false, arg); } catch (x) {} onChange(edit.innerHTML); }; }
    function tbtn(label, title, fn) { var b = ui.el('button', { class: 'rich-btn', type: 'button', title: title }, label); b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); }); b.addEventListener('click', fn); return b; }
    // Highlight: yellow background + dark text so it reads in BOTH themes.
    function hi(e) { e.preventDefault(); edit.focus(); try { if (!document.execCommand('hiliteColor', false, '#ffe066')) document.execCommand('backColor', false, '#ffe066'); document.execCommand('foreColor', false, '#1a1a1a'); } catch (x) {} onChange(edit.innerHTML); }
    var bar = ui.el('div', { class: 'rich-bar' }, [
      tbtn('B', 'Bold', cmd('bold')),
      tbtn('mark', 'Highlight', hi),
      tbtn('clear', 'Clear formatting', cmd('removeFormat')),
      tbtn('fit', 'Auto-fit height on/off', function (e) { e.preventDefault(); edit.classList.toggle('fit'); })
    ]);
    wrap.appendChild(bar); wrap.appendChild(edit);
    wrap.__edit = edit;
    return wrap;
  }
  ui.control = function (input, value, onChange) {
    var c = input.control, node;
    if (c === 'richtext') { node = richControl(input, value, onChange); }
    else if (c === 'textarea') {
      node = ui.el('textarea', { class: 'ctl ctl-textarea mono', placeholder: input.placeholder || '', spellcheck: 'false', rows: input.rows || 6 });
      node.value = value == null ? '' : value;
      node.addEventListener('input', function () { onChange(node.value); });
      ui.enablePaste(node);
    } else if (c === 'select') {
      node = ui.el('select', { class: 'ctl ctl-select' });
      (input.options || []).forEach(function (o) { var opt = ui.el('option', { value: o.value }, o.label || o.value); if (String(o.value) === String(value)) opt.selected = true; node.appendChild(opt); });
      node.addEventListener('change', function () { onChange(node.value); });
    } else if (c === 'checkbox') {
      node = ui.el('input', { type: 'checkbox', class: 'ctl-checkbox' });
      node.checked = !!value;
      node.addEventListener('change', function () { onChange(node.checked); });
    } else if (c === 'number') {
      node = ui.el('input', { type: 'number', class: 'ctl ctl-number', placeholder: input.placeholder || '' });
      if (input.min != null) node.min = input.min;
      if (input.max != null) node.max = input.max;
      if (input.step != null) node.step = input.step;
      node.value = value == null ? '' : value;
      node.addEventListener('input', function () { onChange(node.value === '' ? '' : Number(node.value)); });
    } else {
      node = ui.el('input', { type: 'text', class: 'ctl ctl-text mono', placeholder: input.placeholder || '', spellcheck: 'false' });
      node.value = value == null ? '' : value;
      node.addEventListener('input', function () { onChange(node.value); });
      ui.enablePaste(node);
    }
    node.dataset.inputName = input.name;
    return node;
  };
  ui.defaultValue = function (input) {
    if (input.default != null) return input.default;
    if (input.control === 'checkbox') return false;
    if (input.control === 'select') return (input.options && input.options[0] && input.options[0].value) || '';
    return '';
  };
  ui.typeTag = function (t) { return ui.el('span', { class: 'type-tag', title: 'Socket data type' }, t); };
  ui.label = function (input) {
    return ui.el('label', { class: 'field-label' }, [
      input.label || input.name,
      input.required ? ui.el('span', { class: 'req', title: 'Required' }, '*') : null,
      input.socket ? ui.typeTag(input.type) : null
    ]);
  };
  ui.codeBlock = function (code) {
    return ui.el('div', { class: 'code-wrap' }, [
      ui.el('div', { class: 'code-head' }, [ui.el('span', { class: 'muted' }, 'Core logic'), ui.copyButton(function () { return code; })]),
      ui.el('pre', { class: 'code-block' }, ui.el('code', null, code))
    ]);
  };

  /* ---- a single output view, shared by tool pages and nodes -------------- */
  // Returns { el, set(value, error), getText() }.
  ui.outputView = function (out) {
    var kind = out.type, isSeq = !!out.seq, last = null, lastErr = null;
    var isText = (kind !== 'number' && kind !== 'table' && kind !== 'html');
    var box, errEl = null;

    if (kind === 'number') box = ui.el('div', { class: 'out-val out-num' }, '—');
    else if (kind === 'table') box = ui.el('div', { class: 'out-val out-table-wrap' });
    else if (kind === 'html') box = ui.el('div', { class: 'out-val out-html mono' });
    // Plain text lives in a readonly textarea: the browser lays out only the
    // visible lines, so nothing has to be truncated to stay responsive.
    else box = ui.el('textarea', { class: 'out-val out-text mono', readonly: 'readonly', spellcheck: 'false', 'aria-label': out.label || out.name });

    function getText() {
      if (kind === 'table') return ui.tableToText(last);
      if (kind === 'html') {
        // Line elements have no newlines between them, so copying the raw
        // textContent would give one run-on string. Rebuild the line breaks.
        var lines = box.querySelectorAll('.sv-line');
        if (lines.length) return Array.prototype.map.call(lines, function (l) { return l.textContent; }).join('\n');
        return box.textContent;
      }
      if (last == null) return '';
      return typeof last === 'number' ? (isFinite(last) ? String(last) : '') : String(last);
    }
    function set(v, err) {
      last = v; lastErr = err || null;
      box.classList.toggle('is-error', !!err);
      if (isText) {
        if (err) { box.value = '⚠ ' + err; return; }
        var t = v == null ? '' : String(v);
        if (box.value !== t) box.value = t;
        box.classList.toggle('empty', t === '');
        return;
      }
      if (err) { ui.clear(box); box.textContent = '⚠ ' + err; return; }
      if (kind === 'table') { ui.renderTableInto(box, v); return; }
      if (kind === 'html') { box.innerHTML = v == null ? '' : String(v); return; }
      var blank = (v === '' || v == null || (typeof v === 'number' && isNaN(v)));
      box.textContent = blank ? '—' : (typeof v === 'number' ? ui.fmtInt(+(+v).toPrecision(8)) : String(v));
      box.classList.toggle('empty', blank);
    }
    // Click-to-copy stays on the small, unambiguous boxes. A text area is
    // something you select inside, so it gets the explicit copy button instead.
    if (!isText) ui.enableClickCopy(box, getText);
    return {
      el: box, set: set, getText: getText, isText: isText,
      value: function () { return last; },
      describe: function () { return lastErr ? 'error' : ui.describeValue(kind === 'table' ? last : getText(), isSeq); },
      open: function () { ui.openInspector({ title: out.label || out.name, text: kind === 'table' ? ui.tableToText(last) : getText(), seq: isSeq, filename: out.name }); }
    };
  };

  /* ---- standalone tool form --------------------------------------------- */
  ui.renderToolForm = function (tool, mount) {
    ui.clear(mount);
    var values = {};
    tool.inputs.forEach(function (inp) { values[inp.name] = ui.defaultValue(inp); });
    var outputsWrap = ui.el('div', { class: 'tool-outputs' }), views = {}, fields = [];
    var inputsWrap = ui.el('div', { class: 'tool-inputs' });

    function recompute() {
      var res = MBT.run(tool, values);
      tool.outputs.forEach(function (out) {
        views[out.name].set(res.ok ? res.outputs[out.name] : '', res.ok ? null : res.error);
        views[out.name].meta.textContent = views[out.name].describe();
      });
    }
    function onChange(inp, v) {
      values[inp.name] = v;
      if (tool.onInput) tool.onInput(inp.name, values);
      fields.forEach(function (x) { if (x.inp.name !== inp.name) ui.setControlValue(x.ctl, values[x.inp.name]); });
      updateVisibility(); recompute();
    }
    function updateVisibility() {
      fields.forEach(function (x) { x.f.style.display = ui.visible(x.inp, values) ? '' : 'none'; });
      Array.prototype.forEach.call(inputsWrap.querySelectorAll('.field-row'), function (r) {
        var any = Array.prototype.some.call(r.children, function (c) { return c.style.display !== 'none'; });
        r.style.display = any ? '' : 'none';
      });
    }

    var advWrap = null;
    ui.layoutRows(tool.inputs).forEach(function (rowInputs) {
      var rowEl = ui.el('div', { class: 'field-row' });
      rowInputs.forEach(function (inp) {
        var ctl = ui.control(inp, values[inp.name], function (v) { onChange(inp, v); });
        var f = ui.el('div', { class: 'field field-' + inp.control }, [ui.label(inp), ctl, inp.hint ? ui.el('div', { class: 'field-hint' }, inp.hint) : null]);
        f.style.flex = (inp.flex || 1) + ' 1 0';
        rowEl.appendChild(f); fields.push({ inp: inp, f: f, ctl: ctl });
      });
      if (rowInputs.every(function (i) { return i.advanced; })) {
        if (!advWrap) advWrap = ui.el('details', { class: 'adv' }, ui.el('summary', null, 'More options'));
        advWrap.appendChild(rowEl);
      } else { inputsWrap.appendChild(rowEl); }
    });
    if (advWrap) inputsWrap.appendChild(advWrap);

    tool.outputs.forEach(function (out) {
      var view = ui.outputView(out);
      var meta = ui.el('span', { class: 'out-meta mono' }, '');
      view.meta = meta;
      outputsWrap.appendChild(ui.el('div', { class: 'output' }, [
        ui.el('div', { class: 'output-head' }, [
          ui.el('span', { class: 'output-label' }, out.label || out.name),
          meta,
          ui.el('span', { class: 'spacer' }),
          ui.el('button', { class: 'icon-btn', type: 'button', title: 'Open full value', onclick: view.open }, 'open'),
          ui.copyButton(view.getText)
        ]),
        view.el
      ]));
      views[out.name] = view;
    });

    mount.appendChild(ui.el('div', { class: 'tool-grid' }, [
      ui.el('section', { class: 'panel' }, [ui.el('h2', { class: 'panel-title' }, 'Input'), inputsWrap]),
      ui.el('section', { class: 'panel' }, [ui.el('h2', { class: 'panel-title' }, 'Output'), outputsWrap])
    ]));
    updateVisibility(); recompute();
    return { values: values, recompute: recompute };
  };

  MBT.ui = ui;
})(window.MBT);
