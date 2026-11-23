/* ============================================================================
 * app.js  —  Hash router + page rendering (home, tool, workflow, coding, about).
 * Routes:  #/  ·  #/tool/<id>  ·  #/workflow  ·  #/coding  ·  #/about
 * Tool pages auto-generate their form AND render the tool's documentation.
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
    btn.addEventListener('click', function () { var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', cur); try { localStorage.setItem('mbt-theme', cur); } catch (e) {} });
  }
  function setActiveNav(route) { document.querySelectorAll('.nav-links a').forEach(function (a) { var active = a.getAttribute('data-route') === route; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

  /* ---- home -------------------------------------------------------------- */
  function renderHome() {
    setActiveNav('home');
    var grids = {}, sections = [];
    var search = el('input', { class: 'search-input', type: 'search', placeholder: 'Search tools by name or function', 'aria-label': 'Search the tool directory' });
    MBT.categories.forEach(function (cat) {
      var tools = MBT.toolsByCategory(cat); if (!tools.length) return;
      var grid = el('div', { class: 'card-grid' }, tools.map(toolCard));
      grids[cat] = { grid: grid, title: el('div', { class: 'cat-title' }, cat) };
      sections.push(grids[cat].title, grid);
    });
    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      MBT.categories.forEach(function (cat) { var g = grids[cat]; if (!g) return; var any = false; Array.prototype.forEach.call(g.grid.children, function (card) { var hit = !q || card.dataset.search.indexOf(q) !== -1; card.style.display = hit ? '' : 'none'; if (hit) any = true; }); g.title.style.display = any ? '' : 'none'; g.grid.style.display = any ? '' : 'none'; });
    }
    var empty = el('p', {class: 'directory-empty', hidden: true, role: 'status'}, 'No matching tools. Try a tool name or category.');
    search.addEventListener('input', function () { applyFilter(); empty.hidden = Object.values(grids).some(function (g) { return g.grid.style.display !== 'none'; }); });
    var hero = el('div', { class: 'hero' }, [
      el('div', {class: 'directory-title'}, [el('h1', null, 'Tool directory'), el('p', null, 'Sequence analysis, text cleanup and bench calculations.')]),
      el('div', {class: 'hero-actions'}, [el('a', {class: 'btn btn-primary', href: '#/workflow'}, 'Open workflow')])
    ]);
    var wrap = el('div', { class: 'container view' }, [hero, el('div', { class: 'search-row' }, search), empty].concat(sections));
    ui.clear(app); app.appendChild(wrap); app.appendChild(footer());
  }
  function toolCard(tool) {
    var card = el('a', { class: 'card', href: '#/tool/' + tool.id }, [el('div', { class: 'card-name' }, [el('span', null, tool.name)]), el('div', { class: 'card-desc' }, tool.description || '')]);
    card.dataset.search = (tool.name + ' ' + (tool.description || '') + ' ' + tool.category).toLowerCase();
    return card;
  }

  /* ---- tool page (form + documentation) --------------------------------- */
  function renderTool(id) {
    setActiveNav('home');
    var tool = MBT.getTool(id);
    if (!tool) return renderNotFound();
    if (MBT.log) MBT.log.event('Opened tool: ' + tool.name);
    var header = el('div', { class: 'tool-header' }, [el('div', { class: 'crumb' }, [el('a', { href: '#/' }, 'Tools'), ' / ' + tool.category]), el('h1', null, tool.name), tool.description ? el('p', null, tool.description) : null]);
    var mount = el('div', null);
    var wrap = el('div', { class: 'container view' }, [header, mount, tool.note ? el('div', { class: 'notice', html: tool.note }) : null, buildDocPanel(tool),
      el('p', { class: 'muted', style: 'margin-top:18px;font-size:.85rem' }, [el('a', { href: tool.group === 'code' ? '#/coding' : '#/workflow' }, 'Open ' + (tool.group === 'code' ? 'coding' : 'workflow') + ' canvas')])]);
    ui.clear(app); app.appendChild(wrap);
    ui.renderToolForm(tool, mount);
    app.appendChild(footer());
  }
  function buildDocPanel(tool) {
    if (!tool.doc && !tool.code) return null;
    var kids = [el('h3', { class: 'panel-title' }, 'How it works')];
    if (tool.doc) kids.push(el('div', { class: 'doc-body', html: tool.doc }));
    if (tool.code) kids.push(ui.codeBlock(tool.code));
    kids[0] = el('summary', null, 'How it works'); return el('details', { class: 'panel doc-panel' }, kids);
  }

  /* ---- about ------------------------------------------------------------- */
  function renderAbout() {
    setActiveNav('about');
    var wrap = el('div', { class: 'container view' }, [
      el('div', { class: 'tool-header' }, [el('h1', null, 'About & how it works')]),
      el('div', { class: 'panel', style: 'max-width:760px' }, [
        el('p', null, SITE + ' gathers the small, everyday molecular biology tools you reach for constantly into one tidy, fast, no-login website.'),
        el('h3', { style: 'margin-top:18px' }, 'Two ways to use it'),
        el('p', null, [el('strong', null, '1. Single tools. '), 'Pick any tool from the home page. Type or paste on the left, copy the result on the right using its Copy button, and read the “How it works” notes for the method.']),
        el('p', null, [el('strong', null, '2. Workflow builder. '), 'Open the Workflow tab to chain tools like nodes — pipe one tool’s output into several others, edit any input, multi-select and copy/paste nodes, and save named workspaces.']),
        el('h3', { style: 'margin-top:18px' }, 'Typed connections'),
        el('p', null, ['Every input and output is typed — ', el('span', { class: 'type-tag' }, 'text'), ' for sequences/strings, ', el('span', { class: 'type-tag' }, 'number'), ' for numeric values — so the builder only connects compatible sockets.']),
        el('h3', { style: 'margin-top:18px' }, 'Accuracy'),
        el('p', { class: 'muted' }, 'Translation uses the Standard Genetic Code. Primer Tm uses the SantaLucia (1998) nearest-neighbor model with a salt correction. Always sanity-check critical values against your instrument or vendor tool.')
      ])
    ]);
    ui.clear(app); app.appendChild(wrap); app.appendChild(footer());
  }
  function renderNotFound() { ui.clear(app); app.appendChild(el('div', { class: 'container view' }, [el('h1', null, 'Not found'), el('p', { class: 'muted' }, 'That page doesn’t exist. '), el('a', { class: 'btn', href: '#/' }, 'Back to tools')])); }
  function footer() { return el('footer', { class: 'footer' }, el('div', { class: 'container' }, SITE + '  /  Molecular biology workbench. Pasted sequences are processed locally. Optional genome lookups use GGGenome and UCSC.')); }

  /* ---- router ------------------------------------------------------------ */
  function route() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var parts = hash.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    ['wfAddMenu', 'wfShortcuts'].forEach(function (id) { var panel = document.getElementById(id); if (panel) panel.remove(); });
    if (MBT.log) MBT.log.event('Navigate: ' + (hash || '/'));
    if (parts[0] === 'tool' && parts[1]) return renderTool(parts[1]);
    if (parts[0] === 'workflow') { setActiveNav('workflow'); return MBT.workflow.mount(app, { group: 'bio', label: 'Workflow' }); }
    if (parts[0] === 'coding') { setActiveNav('coding'); return MBT.workflow.mount(app, { group: 'code', storeKey: 'mbt-code-projects', label: 'Coding' }); }
    if (parts[0] === 'about') return renderAbout();
    return renderHome();
  }
  window.addEventListener('hashchange', route);
  initTheme();
  if (MBT.log) MBT.log.info(SITE + ' ready — ' + MBT.tools.length + ' tools loaded.');
  route();
})(window.MBT);
