(function (ui) {
  'use strict';
  var el = ui.el;

  // A separate grip leaves the editor's native text-selection behavior intact.
  ui.fieldGrip = function (box, options) {
    options = options || {};
    var label = 'Resize ' + (options.label || 'field');
    var grip = el('button', {type: 'button', class: 'field-grip', 'aria-label': label,
      title: label + '. Drag vertically, use the up and down keys, or double-click to reset.'});
    var initialHeight = box.style.height, initialMax = box.style.maxHeight;
    function apply(h) {
      if (h == null) {
        box.style.height = initialHeight; box.style.maxHeight = initialMax;
      } else {
        h = Math.round(Math.max(40, Math.min(2400, h)));
        box.style.maxHeight = 'none'; box.style.height = h + 'px';
      }
      if (options.change) options.change(h);
    }
    if (options.height) { box.style.maxHeight = 'none'; box.style.height = options.height + 'px'; }
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      var y = event.clientY, height = box.offsetHeight, scale = options.scale ? options.scale() : 1;
      grip.setPointerCapture(event.pointerId);
      function move(e) { apply(height + (e.clientY - y) / scale); }
      function stop() { grip.removeEventListener('pointermove', move); grip.removeEventListener('lostpointercapture', stop); }
      grip.addEventListener('pointermove', move); grip.addEventListener('lostpointercapture', stop);
    });
    grip.addEventListener('dblclick', function () { apply(null); });
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); apply(box.offsetHeight + (e.key === 'ArrowUp' ? -24 : 24));
      } else if (e.key === 'Home') { e.preventDefault(); apply(null); }
    });
    return grip;
  };

  ui.rangeCopy = function (read, label) {
    var start = el('input', {type: 'number', min: 1, step: 1, value: 1, 'aria-label': 'First character of ' + label});
    var end = el('input', {type: 'number', min: 1, step: 1, value: 1, 'aria-label': 'Last character of ' + label});
    var status = el('span', {role: 'status'});
    var copy = el('button', {type: 'button', class: 'copy-btn'}, 'Copy range');
    var panel = el('details', {class: 'range-copy', hidden: true}, [el('summary', null, 'Copy a range'),
      el('div', null, [el('label', null, ['From ', start]), el('label', null, ['Through ', end]), copy]), status]);
    copy.onclick = async function () {
      var text = read(), a = Number(start.value), b = Number(end.value);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a > b || b > text.length) {
        status.textContent = 'Enter inclusive positions between 1 and ' + text.length + '.'; return;
      }
      var ok = await ui.copy(text.slice(a - 1, b));
      status.textContent = ok === false ? 'Copy failed.' : 'Copied characters ' + a + '–' + b + '.';
    };
    panel.update = function () {
      var length = read().length; panel.hidden = length < 2000; start.max = end.max = length;
      if (panel.dataset.length !== String(length)) status.textContent = '';
      panel.dataset.length = length;
    };
    return panel;
  };

  ui.matchViewer = function (box) {
    var active = 0, data, full = false;
    var label = el('span', {class: 'match-status', role: 'status'});
    var jump = el('input', {type: 'number', min: 1, step: 1, 'aria-label': 'Match number', class: 'match-jump'});
    function button(name, fn) { return el('button', {type: 'button', class: 'copy-btn', onclick: fn}, name); }
    var prev = button('Previous', function () { show(active - 1); });
    var next = button('Next', function () { show(active + 1); });
    var go = button('Go', function () { show(Number(jump.value) - 1); });
    jump.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    var toggle = button('Full sequence', function () { full = !full; show(active); });
    var copyHit = ui.copyButton(function () {
      var h = data.hits[active]; return data.seq.slice(h.start, h.end);
    }, 'Copy match');
    var bar = el('div', {class: 'match-nav'}, [label,
      el('div', {class: 'match-buttons'}, [prev, next, jump, go, copyHit, toggle])]);
    function show(index) {
      var list = data ? data.hits : [], seq = data ? data.seq : '';
      active = Math.max(0, Math.min(list.length - 1, Math.trunc(index) || 0));
      var h = list[active];
      [prev, next, go, jump, copyHit].forEach(function (b) { b.disabled = !h; });
      prev.disabled = !h || active === 0; next.disabled = !h || active === list.length - 1;
      toggle.disabled = !h; jump.max = list.length; jump.value = h ? active + 1 : '';
      toggle.textContent = full ? 'Match context' : 'Full sequence';
      if (!h) { label.textContent = seq && data.query ? 'No matches' : 'Enter a sequence and query'; box.textContent = seq; return; }
      var start = Math.max(0, h.start - 60), end = Math.min(seq.length, h.end + 60);
      label.textContent = 'Hit ' + (active + 1) + ' of ' + data.count.toLocaleString() +
        (list.length < data.count ? ' (first ' + list.length + ' available)' : '') +
        ' · bases ' + (h.start + 1) + '–' + h.end + ' · ' + h.strand + ' strand · ' + h.mm + ' mm';
      if (full) {
        var left = data.hits.filter(function (other) { return other.start < h.start; }).map(function (other) { return {start: other.start, end: Math.min(h.start, other.end)}; });
        var right = data.hits.filter(function (other) { return other.end > h.end; }).map(function (other) { return {start: Math.max(0, other.start - h.end), end: other.end - h.end}; });
        box.innerHTML = MBT.motif.highlight({seq: seq.slice(0, h.start), hits: left}) +
          '<mark class="current-hit">' + seq.slice(h.start, h.end) + '</mark>' +
          MBT.motif.highlight({seq: seq.slice(h.end), hits: right});
        var selected = box.querySelector('.current-hit'), rect = box.getBoundingClientRect();
        var scale = box.offsetHeight ? rect.height / box.offsetHeight : 1;
        if (scale) box.scrollTop += (selected.getBoundingClientRect().top - rect.top) / scale - box.clientHeight / 3;
      }
      else {
        box.replaceChildren(document.createTextNode(seq.slice(start, h.start)),
          el('mark', {class: 'hit current-hit'}, seq.slice(h.start, h.end)), document.createTextNode(seq.slice(h.end, end)));
      }
      if (!full) box.scrollTop = 0;
    }
    return {bar: bar, update: function (value) { if (value === data && label.textContent) return; data = value; full = false; show(0); }};
  };
})(window.MBT.ui);
