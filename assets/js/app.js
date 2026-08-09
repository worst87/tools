/* ============================================================================
 * app.js  —  Hash router + pages (index, tool, workflow, docs).
 * Routes:  #/  ·  #/tool/<id>  ·  #/workflow  ·  #/docs
 * A tool page IS the tool's documentation: form on top, method underneath.
 * ==========================================================================*/
(function (MBT) {
  'use strict';
  var ui = MBT.ui, el = ui.el;
  var app = document.getElementById('app');
  var SITE = 'Worst Toolkit';

  function initTheme() {
    var saved = null; try { saved = localStorage.getItem('mbt-theme'); } catch (e) {}
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    function sync() { btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; }
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      try { localStorage.setItem('mbt-theme', cur); } catch (e) {}
      sync();
    });
    sync();
  }
  function setActiveNav(route) {
    document.querySelectorAll('.nav-links a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === route); });
  }
  function setTitle(t) { document.title = t ? (t + ' · ' + SITE) : SITE; }

  /* ---- index ------------------------------------------------------------- */
  function renderIndex() {
    setActiveNav('home'); setTitle('');
    var cats = MBT.categoriesFor();
    var activeCat = null;

    var search = el('input', { class: 'search-input mono', type: 'search', spellcheck: 'false',
      placeholder: 'filter tools —  tm · gibson · orf · restriction · align · degenerate' });

    var rail = el('nav', { class: 'rail' });
    var railItems = [];
    function railItem(label, count, cat) {
      var b = el('button', { class: 'rail-item', type: 'button' }, [
        el('span', { class: 'rail-name' }, label),
        el('span', { class: 'rail-count mono' }, String(count))
      ]);
      b.addEventListener('click', function () { activeCat = (activeCat === cat) ? null : cat; applyFilter(); });
      railItems.push({ btn: b, cat: cat });
      return b;
    }
    rail.appendChild(railItem('All tools', MBT.tools.length, null));
    cats.forEach(function (c) { rail.appendChild(railItem(c, MBT.toolsByCategory(c).length, c)); });
    rail.appendChild(el('div', { class: 'rail-note' }, [
      'Everything runs in this browser tab. Nothing is uploaded, nothing is stored on a server.',
      el('a', { class: 'rail-link', href: '#/workflow' }, 'Open the node editor →')
    ]));

    var list = el('div', { class: 'tool-list' });
    var groups = {};
    cats.forEach(function (cat) {
      var g = el('section', { class: 'tool-group' }, [
        el('h2', { class: 'group-head' }, [el('span', null, cat), el('span', { class: 'group-blurb' }, MBT.categoryBlurb[cat] || '')])
      ]);
      MBT.toolsByCategory(cat).forEach(function (t) { g.appendChild(toolRow(t)); });
      groups[cat] = g;
      list.appendChild(g);
    });
    var noHits = el('div', { class: 'empty-note' }, 'No tool matches that. Try “tm”, “orf”, “gc”, “dilution”…');
    noHits.style.display = 'none';
    list.appendChild(noHits);

    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var total = 0;
      cats.forEach(function (cat) {
        var g = groups[cat], any = false;
        Array.prototype.forEach.call(g.querySelectorAll('.tool-row'), function (row) {
          var hit = (!activeCat || activeCat === cat) && terms.every(function (t) { return row.dataset.search.indexOf(t) !== -1; });
          row.style.display = hit ? '' : 'none';
          if (hit) { any = true; total++; }
        });
        g.style.display = any ? '' : 'none';
      });
      noHits.style.display = total ? 'none' : '';
      railItems.forEach(function (r) { r.btn.classList.toggle('active', r.cat === activeCat); });
    }
    search.addEventListener('input', applyFilter);
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; activeCat = null; applyFilter(); }
      if (e.key === 'Enter') { var first = list.querySelector('.tool-row:not([style*="none"])'); if (first) location.hash = first.getAttribute('href'); }
    });

    ui.clear(app);
    app.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'strap' }, [
        el('h1', null, 'Everyday molecular biology tools'),
        el('p', null, ['Pick a tool, or wire several together in the ', el('a', { href: '#/workflow' }, 'node editor'), '.'])
      ]),
      el('div', { class: 'search-row' }, search),
      el('div', { class: 'home' }, [rail, list])
    ]));
    app.appendChild(footer());
    applyFilter();
    setTimeout(function () { search.focus(); }, 0);
  }
  function toolRow(tool) {
    var row = el('a', { class: 'tool-row', href: '#/tool/' + tool.id }, [
      el('span', { class: 'tr-name' }, tool.name),
      el('span', { class: 'tr-desc' }, tool.description || ''),
      el('span', { class: 'tr-go mono' }, '→')
    ]);
    row.dataset.search = tool._search;
    return row;
  }

  /* ---- tool page --------------------------------------------------------- */
  function renderTool(id) {
    setActiveNav('home');
    var tool = MBT.getTool(id);
    if (!tool) return renderNotFound(id);
    // A legacy id in the URL quietly becomes the current one.
    var moved = MBT.resolveId(id);
    if (moved) { location.replace('#/tool/' + moved); return; }
    setTitle(tool.name);
    if (MBT.log) MBT.log.event('Opened tool: ' + tool.name);

    var mount = el('div', null);
    var siblings = MBT.toolsByCategory(tool.category).filter(function (t) { return t.id !== tool.id; });
    ui.clear(app);
    app.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'tool-header' }, [
        el('div', { class: 'crumb mono' }, [el('a', { href: '#/' }, 'tools'), ' / ' + tool.category]),
        el('h1', null, tool.name),
        tool.description ? el('p', { class: 'lede' }, tool.description) : null
      ]),
      mount,
      tool.note ? el('div', { class: 'notice', html: tool.note }) : null,
      buildDocPanel(tool),
      el('div', { class: 'tool-foot' }, [
        el('p', null, ['Chain this with other tools in the ', el('a', { href: '#/workflow' }, 'node editor'), '.']),
        siblings.length ? el('p', { class: 'siblings' }, ['Also in ' + tool.category + ': '].concat(
          siblings.map(function (t, i) { return [i ? ' · ' : '', el('a', { href: '#/tool/' + t.id }, t.name)]; })
            .reduce(function (a, b) { return a.concat(b); }, []))) : null
      ])
    ]));
    ui.renderToolForm(tool, mount);
    app.appendChild(footer());
  }
  function buildDocPanel(tool) {
    if (!tool.doc && !tool.code) return null;
    var kids = [el('h2', { class: 'panel-title' }, 'Method')];
    if (tool.doc) kids.push(el('div', { class: 'doc-body', html: tool.doc }));
    if (tool.code) kids.push(ui.codeBlock(tool.code));
    return el('section', { class: 'panel doc-panel' }, kids);
  }

  /* ---- docs -------------------------------------------------------------- */
  function renderDocs() {
    setActiveNav('docs'); setTitle('Docs');
    var kb = [
      ['Space / A', 'add a node where the cursor is'],
      ['drag a port', 'connect two nodes'],
      ['click a port', 'connect without dragging — click one port, then the other'],
      ['port → empty canvas', 'pick a compatible node and wire it up in one go'],
      ['C', 'chain the selected nodes together'],
      ['F', 'fit the view'], ['X', 'delete the selection'],
      ['Ctrl + Enter', 'recompute (when auto-run is off)']
    ];
    ui.clear(app);
    app.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'tool-header' }, [el('h1', null, 'How this works')]),
      el('div', { class: 'docs-grid' }, [
        el('section', { class: 'panel' }, [
          el('h2', { class: 'panel-title' }, 'Two ways to use it'),
          el('p', null, [el('strong', null, 'Single tools. '), 'Pick one from the index. Type or paste on the left, read the result on the right — click any output to copy it, or press ', el('code', null, 'open'), ' to see a long value full-screen with a position ruler.']),
          el('p', null, [el('strong', null, 'The node editor. '), 'Drop the same tools onto a canvas and wire one tool’s output into another’s input. Branch one result into several tools, edit any field, and save named workspaces. Everything recomputes as you type.']),
          el('h2', { class: 'panel-title' }, 'Typed sockets'),
          el('p', null, ['Every input and output carries a type — ', ui.typeTag('text'), ' for sequences and strings, ', ui.typeTag('number'), ' for numeric values. The editor only lets you connect sockets that fit (a number will feed a text input; the reverse will not), and it refuses connections that would make a loop.']),
          el('h2', { class: 'panel-title' }, 'Big inputs'),
          el('p', null, ['Paste as much as you like — ', el('strong', null, 'nothing is ever truncated'), '. A match at base 4,000,000 is listed and highlighted exactly like one at base 4. Text results go into a scrollable box that only renders the lines you can see, and Sequence Find shows the whole sequence as numbered 60-base lines with the same trick, so a 500 kb search draws in under half a second and scrolling stays instant.']),
          el('p', null, 'Editing one field only recomputes that node and whatever depends on it. If a graph still gets heavy, switch auto-run off in the toolbar and recompute with Ctrl+Enter when you are ready.')
        ]),
        el('section', { class: 'panel' }, [
          el('h2', { class: 'panel-title' }, 'Node editor keys'),
          el('div', { class: 'kb-list' }, kb.map(function (r) { return el('div', { class: 'kb-row' }, [el('span', { class: 'kbd' }, r[0]), el('span', null, r[1])]); })),
          el('h2', { class: 'panel-title' }, 'Accuracy'),
          el('p', { class: 'muted' }, 'Translation uses the Standard Genetic Code (NCBI transl_table=1). Primer Tm uses the SantaLucia (1998) unified nearest-neighbor model with a monovalent-salt correction — no Mg²⁺ or dNTP term. Protein pI and extinction coefficients follow the Bjellqvist pKa set and Gill & von Hippel (1989). Restriction sites come from a built-in table of common enzymes. Sanity-check anything critical against your vendor’s tool.'),
          el('h2', { class: 'panel-title' }, 'Privacy'),
          el('p', { class: 'muted' }, 'There is no server. No sequence you paste ever leaves this tab; workspaces are stored in your browser’s local storage and can be exported to a .json file.')
        ])
      ])
    ]));
    app.appendChild(footer());
  }

  function renderNotFound(what) {
    setTitle('Not found');
    ui.clear(app);
    app.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'tool-header' }, [el('h1', null, 'Not found')]),
      el('p', { class: 'muted' }, what ? ('There is no tool called “' + what + '”.') : 'That page does not exist.'),
      el('a', { class: 'btn', href: '#/' }, 'Back to the index')
    ]));
    app.appendChild(footer());
  }
  function footer() {
    return el('footer', { class: 'footer' }, el('div', { class: 'page' }, [
      el('span', null, SITE),
      el('span', { class: 'sep' }, '·'),
      el('span', null, 'static site, no backend, no tracking'),
      el('span', { class: 'sep' }, '·'),
      el('a', { href: '#/docs' }, 'how it works')
    ]));
  }

  /* ---- router ------------------------------------------------------------ */
  function route() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var parts = hash.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    document.body.classList.toggle('is-canvas', parts[0] === 'workflow');
    if (parts[0] === 'tool' && parts[1]) return renderTool(decodeURIComponent(parts[1]));
    if (parts[0] === 'workflow') { setActiveNav('workflow'); setTitle('Node editor'); return MBT.workflow.mount(app); }
    if (parts[0] === 'docs' || parts[0] === 'about') { return renderDocs(); }
    return renderIndex();
  }
  window.addEventListener('hashchange', route);
  initTheme();
  if (MBT.log) MBT.log.info(SITE + ' ready — ' + MBT.tools.length + ' tools loaded.');
  route();
})(window.MBT);
