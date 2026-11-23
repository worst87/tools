/* Reference searches are user-triggered. Only the selected interval needs a UCSC request. */
(function (MBT) {
  'use strict';
  var M = MBT.motif, el = MBT.ui.el, rev = MBT.bio.reverseComplement;
  var assemblies = {hg38: 'hg38', hs1: 'T2T-CHM13v2.0'};
  var chromSizes = {};
  function integer(value, fallback, low, high, name) {
    var n = value == null ? fallback : value === '' ? NaN : Number(value);
    if (!Number.isInteger(n) || n < low || n > high) throw Error(name + ' must be a whole number from ' + low + ' to ' + high + '.');
    return n;
  }
  function params(v) {
    return {before: integer(v.before, 50, 0, 100000, '5′ flank length'), after: integer(v.after, 50, 0, 100000, '3′ flank length'),
      orientation: v.orientation === 'reference' ? 'reference' : 'query',
      index: integer(v.hit, 1, 1, 25000, 'Match number') - 1};
  }
  function blank(message) { return {location: message, upstream: '', match: '', downstream: '', region: ''}; }
  function bases(start, end) {
    return start < end ? (start + 1) + '–' + end : 'none';
  }
  function hitDetails(hit, p, name, source, query) {
    var reverse = M.flankWindow(hit, p.before, p.after, p.orientation).reverse;
    var lines = [name + ' · Query matched ' + (hit.strand === '-' ? '− (reverse)' : '+ (forward)') + ' strand',
      'Output reads 5′ to 3′ on strand ' + (reverse ? '−' : '+') + ' (' + (p.orientation === 'reference' ? 'forward reference' : 'matched strand') + ').',
      source + bases(hit.start, hit.end) + ' · + coordinates, 1-based inclusive'];
    if (query && query === rev(query)) lines.push('This query is its own reverse complement. Its sequence alone cannot distinguish the strands.');
    return lines;
  }
  function result(window, hit, p, lines) {
    var local = {start: hit.start - window.offset, end: hit.end - window.offset, strand: hit.strand};
    var o = M.extract(window.seq, local, p.before, p.after, p.orientation);
    var reverse = M.flankWindow(hit, p.before, p.after, p.orientation).reverse;
    var left = reverse ? o.downstream.length : o.upstream.length;
    var right = reverse ? o.upstream.length : o.downstream.length;
    var lower = bases(hit.start - left, hit.start), higher = bases(hit.end, hit.end + right);
    function flank(label, side, range, actual, requested) {
      return label + ' · ' + side + ' coordinates · ' + range + ' (' + actual + ' nt' +
        (actual < requested ? ' of ' + requested + ' requested, clipped at sequence boundary' : '') + ')';
    }
    lines.push(flank('5′ flank', reverse ? 'higher' : 'lower', reverse ? higher : lower, o.upstream.length, p.before),
      flank('3′ flank', reverse ? 'lower' : 'higher', reverse ? lower : higher, o.downstream.length, p.after));
    o.location = lines.join('\n');
    return o;
  }
  function renderRegion(box, outputs) {
    box.replaceChildren();
    if (!outputs || !outputs.match) return;
    var mark = el('mark', {class: 'current-hit', title: 'Matched bases in the selected output orientation'}, outputs.match);
    box.append(document.createTextNode(outputs.upstream), mark, document.createTextNode(outputs.downstream));
  }
  function refKey(v) { return (v.source || 'local') + '/' + M.parse(v.query, 'the query'); }
  function queryHit(v, p) {
    var memo = v.reference;
    if (!memo || memo.key !== refKey(v)) throw Error('Search the selected reference to load matches.');
    var list = v.both === false ? memo.hits.filter(function (hit) { return hit.strand === '+'; }) : memo.hits;
    if (!list.length) throw Error(memo.truncated ? 'No matching strand among the loaded hits. Try a longer query.' : 'No exact matches on the selected strand(s).');
    var hit = list[p.index];
    if (!hit) throw Error('Choose a match from 1 to ' + list.length + '.');
    return {hit: hit, name: 'Hit ' + (p.index + 1) + ' of ' + list.length + (memo.truncated ? ' loaded (additional hits omitted)' : '')};
  }
  function localCompute(v) {
    var p = params(v), pastedMinus = v.pastedStrand === '-';
    var seq = pastedMinus ? rev(M.parse(v.seq, 'the sequence')) : v.seq;
    var data = M.scan(seq, v.query, 0, v.both !== false);
    if (!data.seq || !data.query) return blank('Enter a sequence and query.');
    if (!data.count) return blank('No matches on the selected strand(s).');
    var h = data.hits[p.index];
    if (!h) return blank('Choose a match from 1 to ' + data.hits.length + '.');
    var name = 'Hit ' + (p.index + 1) + ' of ' + data.count + (data.count > data.hits.length ? ' (first ' + data.hits.length + ' available)' : '');
    var lines = hitDetails(h, p, name, 'Local fragment · bases ', data.query);
    if (pastedMinus) lines.push('Original − strand paste · bases ' + bases(data.seq.length - h.end, data.seq.length - h.start) + ' counted from its first base.');
    return result({seq: data.seq, offset: 0}, h, p, lines);
  }
  function referenceCompute(v) {
    var p = params(v), selected = queryHit(v, p), h = selected.hit;
    var requested = M.flankWindow(h, p.before, p.after, p.orientation);
    var lines = hitDetails(h, p, selected.name, assemblies[v.source] + ' · ' + h.chrom + ':', M.parse(v.query, 'the query'));
    var window = h, extra = v.reference.extra;
    var start = Math.max(0, requested.start), end = requested.end;
    if (extra && extra.chrom === h.chrom && Number.isSafeInteger(extra.size)) {
      end = Math.min(end, extra.size);
      var sameMatch = extra.seq.slice(h.start - extra.offset, h.end - extra.offset) === h.seq.slice(h.start - h.offset, h.end - h.offset);
      if (sameMatch && extra.offset <= start && extra.offset + extra.seq.length >= end) window = extra;
    } else if (extra && extra.key === [h.chrom, h.start, h.end, h.strand, p.before, p.after].join('/') &&
               (p.orientation === 'query' || h.strand === '+' || p.before === p.after)) {
      // Older workspaces cached one clipped, query-oriented interval under this exact key.
      return result(extra, h, p, lines);
    }
    if (window.offset > start || window.offset + window.seq.length < end) {
      return blank(lines.concat('Choose Fetch interval to retrieve the requested flanks.').join('\n'));
    }
    return result(window, h, p, lines);
  }
  async function getJson(url, signal, cap) {
    var response = await fetch(url, {signal: signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw Error('The reference service returned HTTP ' + response.status + '. Try again later.');
    var reader = response.body.getReader(), buffer = '', bytes = 0, decoder = new TextDecoder();
    while (true) {
      var part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > cap) { await reader.cancel(); throw Error('Too many reference results. Use a longer, more specific query.'); }
      buffer += decoder.decode(part.value, {stream: true});
    }
    return JSON.parse(buffer + decoder.decode());
  }
  async function search(v, signal) {
    var q = M.parse(v.query, 'the query'), db = assemblies[v.source];
    if (!db || !/^[ACGT]{15,500}$/.test(q)) throw Error('Reference search accepts 15–500 unambiguous DNA bases.');
    var data = await getJson('https://gggenome.dbcls.jp/' + db + '/' + q + '.json', signal, 4000000);
    if (data.error !== 'none' || !Array.isArray(data.results) || !String(data.database).includes(db)) throw Error('The index could not complete this search. Try a more specific query.');
    var hits = data.results.slice(0, 200).map(function (r) {
      var start = r.position - 1, end = Number(r.position_end), offset = r.snippet_pos - 1;
      var seq = String(r.snippet).toUpperCase(), chrom = String(r.name).split(/\s+/)[0];
      if (!['+', '-'].includes(r.strand) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(offset) ||
          offset < 0 || start < offset || end !== start + q.length || end > offset + seq.length ||
          seq.slice(start - offset, end - offset) !== (r.strand === '-' ? rev(q) : q)) throw Error('The index returned inconsistent sequence coordinates.');
      return {chrom: chrom, start: start, end: end, strand: r.strand, offset: offset, seq: seq};
    });
    return {key: refKey(v), hits: hits, truncated: data.results.length > hits.length ||
      (data.summary || []).some(function (s) { return s.count_is_approx; })};
  }
  async function extend(v, signal) {
    var p = params(v), h = queryHit(v, p).hit, base = 'https://api.genome.ucsc.edu/';
    if (!chromSizes[v.source]) {
      var index = await getJson(base + 'list/chromosomes?genome=' + v.source, signal, 1000000);
      chromSizes[v.source] = index.chromosomes;
    }
    var size = chromSizes[v.source] && chromSizes[v.source][h.chrom];
    if (!Number.isInteger(size)) throw Error('This contig is unavailable in the UCSC assembly.');
    var bounds = M.flankWindow(h, p.before, p.after, p.orientation);
    var start = Math.max(0, bounds.start), end = Math.min(size, bounds.end);
    var data = await getJson(base + 'getData/sequence?genome=' + v.source + ';chrom=' + encodeURIComponent(h.chrom) + ';start=' + start + ';end=' + end, signal, 500000);
    var seq = String(data.dna || '').toUpperCase(), query = M.parse(v.query, 'the query');
    if (data.genome !== v.source || data.chrom !== h.chrom || data.start !== start || data.end !== end ||
        seq.length !== end - start || seq.slice(h.start - start, h.end - start) !== (h.strand === '-' ? rev(query) : query)) throw Error('The retrieved interval does not match the indexed hit.');
    return Object.assign({}, v.reference, {extra: {chrom: h.chrom, size: size, offset: start, seq: seq}});
  }
  function referenceControls(parent, read, commit) {
    var message = el('div', {role: 'status', class: 'reference-status'}), current = null, previous = '';
    var start = el('button', {class: 'btn btn-sm', type: 'button'}, 'Search reference');
    var more = el('button', {class: 'btn btn-sm', type: 'button'}, 'Fetch interval');
    var help = el('p', {class: 'flank-orientation-help'}); parent.appendChild(help);
    var group = el('div', {class: 'reference-controls'}, [el('p', null, 'Search sends the query to GGGenome. Fetch interval sends the selected coordinates to UCSC for longer flanks.'), start, more, message]);
    parent.appendChild(group);
    function signature(v) { return JSON.stringify([v.source, v.query, v.both, v.hit, v.before, v.after, v.orientation]); }
    function refresh(v) {
      var key = signature(v);
      if (key !== previous) { if (current) current.abort(); current = null; message.textContent = ''; previous = key; }
      var forward = v.orientation === 'reference';
      var guidance = forward ? 'Forward reference (+): the 5′ flank uses lower coordinates and the 3′ flank uses higher coordinates for every hit.'
        : 'Matched strand: for a − hit, the 5′ flank uses higher reference coordinates and the 3′ flank uses lower ones. The output is reverse-complemented.';
      if (!assemblies[v.source]) guidance += v.pastedStrand === '-' ? ' Your paste is read as the − strand of a local fragment. Positions are local to that fragment.' : ' Base 1 is the first base you pasted. Positions are local to this fragment.';
      if (help.textContent !== guidance) help.textContent = guidance;
      group.hidden = !assemblies[v.source]; start.disabled = !!current; more.disabled = true;
      try { queryHit(v, params(v)); more.disabled = !!current; } catch (_) {}
    }
    async function request(fn) {
      if (current) return;
      var v = read(), captured = signature(v), controller = new AbortController();
      current = controller; refresh(v);
      message.textContent = fn === search ? 'Searching the index…' : 'Fetching the interval…';
      var timer = setTimeout(function () { controller.abort(); }, 45000);
      try {
        var memo = await fn(v, controller.signal);
        if (group.isConnected && current === controller && signature(read()) === captured) {
          commit('reference', memo); message.textContent = memo.hits.length ? 'Reference data ready.' : 'Search complete.';
        }
      } catch (error) {
        if (current === controller) message.textContent = error.name === 'AbortError' ? 'Request timed out. Try again.' : error.message;
      } finally { clearTimeout(timer); if (current === controller) { current = null; refresh(read()); } }
    }
    start.onclick = function () { request(search); };
    more.onclick = function () { request(extend); };
    return refresh;
  }
  MBT.registerTool({
    id: 'grab-flanking', name: 'Grab Flanking', category: 'Sequence Tools',
    description: 'Extract the bases on either side of a match in pasted DNA or a human reference genome.',
    inputs: [
      {name: 'source', label: 'Search in', control: 'select', default: 'local', options: [
        {value: 'local', label: 'Pasted sequence'}, {value: 'hg38', label: 'Human · GRCh38 / hg38'}, {value: 'hs1', label: 'Human · T2T-CHM13v2.0 / hs1'}]},
      {name: 'seq', label: 'Source sequence', control: 'textarea', rows: 5, placeholder: 'Paste DNA, RNA or one FASTA record', visibleWhen: function (v) { return !v.source || v.source === 'local'; }},
      {name: 'pastedStrand', label: 'Strand of pasted sequence', control: 'select', default: '+',
        visibleWhen: function (v) { return !v.source || v.source === 'local'; },
        options: [{value: '+', label: 'Use as pasted (local +)'}, {value: '-', label: 'Pasted sequence is the − strand'}]},
      {name: 'query', label: 'Query sequence', control: 'text', placeholder: 'Sequence to locate'},
      {name: 'orientation', label: 'Read flanks on', control: 'select', default: 'query',
        options: [{value: 'query', label: 'Matched query strand'}, {value: 'reference', label: 'Forward reference (+)'}]},
      {name: 'before', label: '5′ flank (nt)', control: 'number', socket: false, row: 'length', default: 50, min: 0, max: 100000, step: 1},
      {name: 'after', label: '3′ flank (nt)', control: 'number', socket: false, row: 'length', default: 50, min: 0, max: 100000, step: 1},
      {name: 'hit', label: 'Match number', control: 'number', socket: false, row: 'hit', default: 1, min: 1, step: 1},
      {name: 'both', label: 'Include reverse (−) hits', control: 'checkbox', row: 'hit', default: true},
      {name: 'reference', control: 'internal', socket: false}
    ],
    outputs: [{name: 'location', label: 'Strands and coordinates', type: 'text'},
      {name: 'region', label: 'Combined sequence · match highlighted', type: 'text', renderText: renderRegion},
      {name: 'upstream', label: '5′ flank · before match in output', type: 'text'},
      {name: 'match', label: 'Matched sequence in output', type: 'text'},
      {name: 'downstream', label: '3′ flank · after match in output', type: 'text'}],
    controls: referenceControls,
    compute: function (v) { try { return assemblies[v.source] ? referenceCompute(v) : localCompute(v); } catch (err) { return blank(err.message); } },
    doc: '<p>Choose a match by its 1-based number. Coordinates refer to the forward reference, inclusive at both ends. All sequence outputs read 5′ to 3′ on the selected output strand. On a reverse hit, Matched query strand takes the 5′ flank from higher reference coordinates. Forward reference (+) takes it from lower coordinates and shows the matched bases as they appear on the reference. Changing modes can change the extracted interval when flank lengths differ. Pasted sequences use local fragment coordinates. Choose an indexed assembly for chromosome coordinates. Flanks shorten at sequence ends. Palindromic queries can match the same locus on both strands.</p><p>Pasted sequences use local IUPAC matching. Human references use GGGenome’s exact-match index, loading up to 200 hits. Longer flanks come from the selected UCSC interval. Reference lookups require internet access.</p>'
  });
})(window.MBT);
