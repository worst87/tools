/* ============================================================================
 * logger.js  —  Activity log. Captures uncaught errors, mirrors console
 * warnings/errors, and records app/workflow events reported via MBT.log.
 * A floating "⚑ Log" button (red badge on errors) opens a filterable panel.
 *
 * API:  MBT.log.info|warn|error|event(message[, detail])
 *       MBT.log.all() · MBT.log.clear()
 * ==========================================================================*/
window.MBT = window.MBT || {};

(function (MBT) {
  'use strict';
  var MAX = 500, entries = [], errorCount = 0;
  var launchBtn, badgeEl, overlay, listEl, countEl, filter = 'all';

  function stamp() { var d = new Date(); return d.toTimeString().slice(0, 8); }
  function add(level, msg, detail) {
    var e = { t: stamp(), level: level, msg: String(msg), detail: detail != null ? String(detail) : '' };
    entries.push(e); if (entries.length > MAX) entries.shift();
    if (level === 'error') { errorCount++; }
    updateBadge();
    if (overlay && overlay.style.display !== 'none') renderList();
    return e;
  }
  var Log = {
    info: function (m, d) { return add('info', m, d); },
    event: function (m, d) { return add('event', m, d); },
    warn: function (m, d) { return add('warn', m, d); },
    error: function (m, d) { return add('error', m, d); },
    all: function () { return entries.slice(); },
    clear: function () { entries.length = 0; errorCount = 0; updateBadge(); renderList(); }
  };

  function elf(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function build() {
    if (launchBtn || !document.body) return;
    launchBtn = elf('button', 'mbt-log-launch', '⚑ Log');
    badgeEl = elf('span', 'mbt-log-badge', '0'); badgeEl.style.display = 'none';
    launchBtn.appendChild(badgeEl);
    launchBtn.addEventListener('click', open);
    document.body.appendChild(launchBtn);
  }
  function buildPanel() {
    overlay = elf('div', 'mbt-log-overlay'); overlay.style.display = 'none';
    var panel = elf('div', 'mbt-log-panel');
    var head = elf('div', 'mbt-log-head');
    head.appendChild(elf('span', 'mbt-log-title', 'Activity log'));
    countEl = elf('span', 'mbt-log-count muted', ''); head.appendChild(countEl);
    ['all', 'event', 'info', 'warn', 'error'].forEach(function (lv) {
      var b = elf('button', 'mbt-log-filter' + (lv === filter ? ' active' : ''), lv);
      b.addEventListener('click', function () { filter = lv; Array.prototype.forEach.call(head.querySelectorAll('.mbt-log-filter'), function (x) { x.classList.toggle('active', x.textContent === lv); }); renderList(); });
      head.appendChild(b);
    });
    var copyBtn = elf('button', 'btn btn-sm', 'Copy all');
    copyBtn.addEventListener('click', function () {
      var text = entries.map(function (e) { return '[' + e.t + '] ' + e.level.toUpperCase() + ' ' + e.msg + (e.detail ? ' — ' + e.detail : ''); }).join('\n');
      if (MBT.ui) MBT.ui.copy(text);
    });
    var clearBtn = elf('button', 'btn btn-sm', 'Clear'); clearBtn.addEventListener('click', function () { Log.clear(); });
    var closeBtn = elf('button', 'btn btn-sm', 'Close'); closeBtn.addEventListener('click', close);
    head.appendChild(copyBtn); head.appendChild(clearBtn); head.appendChild(closeBtn);
    listEl = elf('div', 'mbt-log-list');
    panel.appendChild(head); panel.appendChild(listEl);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }
  function renderList() {
    if (!listEl) return;
    listEl.textContent = '';
    var shown = entries.filter(function (e) { return filter === 'all' || e.level === filter; });
    if (countEl) countEl.textContent = entries.length + ' entries · ' + errorCount + ' error(s)';
    if (!shown.length) { listEl.appendChild(elf('div', 'mbt-log-empty', 'Nothing logged for this filter yet.')); return; }
    for (var i = shown.length - 1; i >= 0; i--) {
      var e = shown[i];
      var row = elf('div', 'mbt-log-entry');
      row.appendChild(elf('span', 'mbt-log-time', e.t));
      row.appendChild(elf('span', 'mbt-log-lvl ' + e.level, e.level));
      var msg = elf('span', 'mbt-log-msg', e.msg);
      if (e.detail) { var d = elf('span', 'mbt-log-detail', '  ' + e.detail); msg.appendChild(d); }
      row.appendChild(msg);
      listEl.appendChild(row);
    }
  }
  function updateBadge() {
    if (!badgeEl) return;
    if (errorCount > 0) { badgeEl.textContent = errorCount; badgeEl.style.display = ''; launchBtn.classList.add('has-errors'); }
    else { badgeEl.style.display = 'none'; if (launchBtn) launchBtn.classList.remove('has-errors'); }
  }
  function open() { if (!overlay) buildPanel(); overlay.style.display = 'flex'; renderList(); }
  function close() { if (overlay) overlay.style.display = 'none'; }

  // mirror console.warn / console.error into the log
  ['warn', 'error'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      try { add(k === 'warn' ? 'warn' : 'error', Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (ev) {
    var where = ev.filename ? (' @ ' + String(ev.filename).split('/').pop() + ':' + ev.lineno) : '';
    add('error', (ev.message || 'Script error') + where);
  });
  window.addEventListener('unhandledrejection', function (ev) { var r = ev.reason; add('error', 'Unhandled rejection: ' + ((r && r.message) || r)); });

  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);

  MBT.log = Log;
  Log.info('Activity log ready.');
})(window.MBT);
