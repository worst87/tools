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
    return {before: integer(v.before, 50, 0, 100000, 'Upstream length'), after: integer(v.after, 50, 0, 100000, 'Downstream length'),
      index: integer(v.hit, 1, 1, 25000, 'Match number') - 1};
  }
  function blank(message) { return {location: message, upstream: '', match: '', downstream: '', region: ''}; }
  function result(seq, hit, p, location) {
    var o = M.extract(seq, hit, p.before, p.after);
    o.location = location + ' · ' + o.upstream.length + ' nt upstream / ' + o.downstream.length + ' nt downstream';
    if (o.upstream.length < p.before || o.downstream.length < p.after) o.location += ' · clipped at sequence boundary';
    return o;
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
  function windowKey(hit, p) { return [hit.chrom, hit.start, hit.end, hit.strand, p.before, p.after].join('/'); }
  function localCompute(v) {
    var p = params(v), data = M.scan(v.seq, v.query, 0, v.both !== false);
    if (!data.seq || !data.query) return blank('Enter a sequence and query.');
    if (!data.count) return blank('No matches.');
    var h = data.hits[p.index];
    if (!h) return blank('Choose a match from 1 to ' + data.hits.length + '.');
    return result(data.seq, h, p, 'Hit ' + (p.index + 1) + ' of ' + data.count + (data.count > data.hits.length ? ' (first ' + data.hits.length + ' available)' : '') +
      ' · bases ' + (h.start + 1) + '–' + h.end + ' (' + h.strand + ')');
  }
  function referenceCompute(v) {
    var p = params(v), selected = queryHit(v, p), h = selected.hit, window = h;
    var left = h.strand === '-' ? p.after : p.before, right = h.strand === '-' ? p.before : p.after;
    var extra = v.reference.extra;
    if (extra && extra.key === windowKey(h, p)) window = extra;
    else if ((h.start - h.offset < left && h.offset > 0) || h.offset + h.seq.length - h.end < right) {
      return blank(selected.name + ' · ' + h.chrom + ':' + (h.start + 1) + '–' + h.end + ' (' + h.strand + '). Use “Fetch interval” for these flank lengths.');
    }
    return result(window.seq, {start: h.start - window.offset, end: h.end - window.offset, strand: h.strand}, p,
      selected.name + ' · ' + assemblies[v.source] + ' ' + h.chrom + ':' + (h.start + 1) + '–' + h.end + ' (' + h.strand + ')');
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
    var start = Math.max(0, h.start - (h.strand === '-' ? p.after : p.before));
    var end = Math.min(size, h.end + (h.strand === '-' ? p.before : p.after));
    var data = await getJson(base + 'getData/sequence?genome=' + v.source + ';chrom=' + encodeURIComponent(h.chrom) + ';start=' + start + ';end=' + end, signal, 500000);
    var seq = String(data.dna || '').toUpperCase(), query = M.parse(v.query, 'the query');
    if (data.genome !== v.source || data.chrom !== h.chrom || data.start !== start || data.end !== end ||
        seq.length !== end - start || seq.slice(h.start - start, h.end - start) !== (h.strand === '-' ? rev(query) : query)) throw Error('The retrieved interval does not match the indexed hit.');
    return Object.assign({}, v.reference, {extra: {key: windowKey(h, p), offset: start, seq: seq}});
  }
  function referenceControls(parent, read, commit) {
    var message = el('div', {role: 'status', class: 'reference-status'}), current = null, previous = '';
    var start = el('button', {class: 'btn btn-sm', type: 'button'}, 'Search reference');
    var more = el('button', {class: 'btn btn-sm', type: 'button'}, 'Fetch interval');
    var group = el('div', {class: 'reference-controls'}, [el('p', null, 'Search sends the query to GGGenome. Fetch interval sends the selected coordinates to UCSC for longer flanks.'), start, more, message]);
    parent.appendChild(group);
    function signature(v) { return JSON.stringify([v.source, v.query, v.both, v.hit, v.before, v.after]); }
    function refresh(v) {
      var key = signature(v);
      if (key !== previous) { if (current) current.abort(); current = null; message.textContent = ''; previous = key; }
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
      {name: 'query', label: 'Query sequence', control: 'text', placeholder: 'Sequence to locate'},
      {name: 'before', label: 'Upstream (nt)', control: 'number', socket: false, row: 'length', default: 50, min: 0, max: 100000, step: 1},
      {name: 'after', label: 'Downstream (nt)', control: 'number', socket: false, row: 'length', default: 50, min: 0, max: 100000, step: 1},
      {name: 'hit', label: 'Match number', control: 'number', socket: false, row: 'hit', default: 1, min: 1, step: 1},
      {name: 'both', label: 'Both strands', control: 'checkbox', row: 'hit', default: true},
      {name: 'reference', control: 'internal', socket: false}
    ],
    outputs: [{name: 'location', label: 'Match location', type: 'text'}, {name: 'upstream', label: 'Upstream · 5′', type: 'text'},
      {name: 'match', label: 'Matched sequence', type: 'text'}, {name: 'downstream', label: 'Downstream · 3′', type: 'text'},
      {name: 'region', label: 'Upstream + match + downstream', type: 'text'}],
    controls: referenceControls,
    compute: function (v) { try { return assemblies[v.source] ? referenceCompute(v) : localCompute(v); } catch (err) { return blank(err.message); } },
    doc: '<p>Choose a match by its 1-based number. Coordinates refer to the forward reference, inclusive at both ends. All sequence outputs read 5′ to 3′ on the matched strand. Flanks shorten at sequence ends. Palindromic queries can match the same locus on both strands.</p><p>Pasted sequences use local IUPAC matching. Human references use GGGenome’s exact-match index, loading up to 200 hits. Longer flanks come from the selected UCSC interval. Reference lookups require internet access.</p>'
  });
})(window.MBT);
