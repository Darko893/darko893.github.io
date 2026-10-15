// Page wiring for the fair subs planner. The maths is in subs.js (window.Subs).
(function () {
  'use strict';
  var TIP_URL = ''; // payment link for the optional tip; the line stays hidden while empty
  var KEY = 'fairsubs.v1';
  var S = window.Subs;
  var $ = function (id) { return document.getElementById(id); };
  var f = {
    format: $('f-format'), onPitch: $('f-onpitch'), mins: $('f-mins'), periods: $('f-periods'), every: $('f-every'),
    keeper: $('f-keeper'), max: $('f-max'), games: $('f-games'), gameMins: $('f-gamemins'), mix: $('f-mix'), squad: $('f-squad')
  };
  var state = { absent: {}, keepers: {}, keeperPicks: [], fixedKeeper: '' };
  var lastText = '', lastPlan = null;

  // ---------- storage (works without it) ----------
  function load() {
    try { var raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        window.localStorage.setItem(KEY, JSON.stringify({
          format: f.format.value, onPitch: f.onPitch.value, mins: f.mins.value, periods: f.periods.value, every: f.every.value,
          keeper: f.keeper.value, max: f.max.value, games: f.games.value, gameMins: f.gameMins.value, mix: f.mix.checked,
          squad: f.squad.value, absent: state.absent, keepers: state.keepers, keeperPicks: state.keeperPicks, fixedKeeper: state.fixedKeeper
        }));
      } catch (e) { /* storage blocked: the page still works */ }
    }, 250);
  }

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function num(input, lo, hi, dflt) {
    var v = parseFloat(String(input.value).replace(',', '.'));
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }
  function key(name) { return name.toLowerCase(); }
  function squadNames() { return S.cleanNames(f.squad.value.split('\n')).map(function (p) { return p.name; }); }
  function isFestival() { return f.format.value === 'u7'; }
  function list(names) { return names.length ? names.join(', ') : 'nobody'; }

  // ---------- format presets ----------
  function applyFormat() {
    var p = S.FORMATS[f.format.value];
    if (p) {
      f.onPitch.value = p.onPitch; f.periods.value = String(p.periods); f.every.value = p.subEvery; f.keeper.value = p.keeper;
      if (p.festival) f.gameMins.value = p.mins; else f.mins.value = p.mins;
    }
  }
  function showMode() {
    var fest = isFestival();
    Array.prototype.forEach.call(document.querySelectorAll('.m-only'), function (n) { n.classList.toggle('hidden', fest); });
    Array.prototype.forEach.call(document.querySelectorAll('.f-only'), function (n) { n.classList.toggle('hidden', !fest); });
  }

  // ---------- roster ----------
  function renderRoster(names) {
    var ul = $('roster');
    clear(ul);
    var fest = isFestival(), here = 0;
    names.forEach(function (name, i) {
      var k = key(name), present = !state.absent[k];
      if (present) here++;
      var hereBox = el('input', { type: 'checkbox', 'data-k': k, 'data-role': 'here', id: 'here-' + i });
      hereBox.checked = present;
      var keepBox = el('input', { type: 'checkbox', 'data-k': k, 'data-role': 'keep', id: 'keep-' + i });
      keepBox.checked = !!state.keepers[k];
      var li = el('li', { class: present ? '' : 'out' }, [
        el('span', { class: 'nm', text: name }),
        el('label', { class: 'check', for: 'here-' + i }, [hereBox, 'Here']),
        fest ? el('span') : el('label', { class: 'check', for: 'keep-' + i }, [keepBox, 'Goal'])
      ]);
      ul.appendChild(li);
    });
    $('counts').textContent = names.length ? here + ' of ' + names.length + ' here today' + (fest ? '' : '. Tick "Goal" for players who can go in goal.') : '';
  }

  function presentPlayers(names) {
    return names.filter(function (n) { return !state.absent[key(n)]; }).map(function (n) { return { name: n, keeper: !!state.keepers[key(n)] }; });
  }

  function renderKeeperPicks(players) {
    var box = $('keeper-picks');
    clear(box);
    var mode = f.keeper.value;
    if (isFestival() || mode === 'none' || !players.length) return;
    var pool = players.filter(function (p) { return p.keeper; });
    if (!pool.length) pool = players;
    if (mode === 'fixed') {
      var sel = el('select', { id: 'pick-fixed' });
      players.forEach(function (p) { var o = el('option', { value: p.name, text: p.name }); sel.appendChild(o); });
      var want = players.some(function (p) { return p.name === state.fixedKeeper; }) ? state.fixedKeeper : pool[0].name;
      sel.value = want;
      box.appendChild(el('label', { for: 'pick-fixed', text: 'Keeper' }));
      box.appendChild(sel);
      return;
    }
    var periods = +f.periods.value || 1;
    var wrap = el('div', { class: 'grid2' });
    for (var p = 0; p < periods; p++) {
      var s = el('select', { id: 'pick-' + p, 'data-p': String(p) });
      s.appendChild(el('option', { value: '', text: 'Choose for me' }));
      players.forEach(function (pl) { s.appendChild(el('option', { value: pl.name, text: pl.name })); });
      var cur = state.keeperPicks[p] || '';
      s.value = players.some(function (pl) { return pl.name === cur; }) ? cur : '';
      wrap.appendChild(el('div', null, [el('label', { for: 'pick-' + p, text: 'Keeper, ' + S.periodName(p, periods) }), s]));
    }
    box.appendChild(wrap);
  }

  // ---------- plan ----------
  function render() {
    showMode();
    var names = squadNames();
    renderRoster(names);
    var players = presentPlayers(names);
    if (document.activeElement && /^pick-/.test(document.activeElement.id)) { /* keep the open select */ } else renderKeeperPicks(players);
    var out = $('plan'), msgs = $('msgs');
    clear(out); clear(msgs);
    lastText = ''; lastPlan = null;
    if (!players.length) {
      out.appendChild(el('p', { class: 'empty', text: names.length ? 'Tick who is here today to see the plan.' : 'Type your players in the squad box to see the plan.' }));
      save();
      return;
    }
    if (isFestival()) renderFestival(players, out, msgs); else renderPlan(players, out, msgs);
    save();
  }

  function warn(msgs, items) { items.forEach(function (w) { msgs.appendChild(el('li', { text: w.text })); }); }

  function renderFestival(players, out, msgs) {
    var games = Math.round(num(f.games, 1, 20, 4)), gm = num(f.gameMins, 1, 30, 8);
    var r = S.festival({ players: players, games: games, gameMins: gm, teamSize: 3, mix: f.mix.checked });
    warn(msgs, r.warnings);
    var names = r.players.map(function (p) { return p.name; });
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    out.appendChild(el('p', { class: 'summary' }, [
      el('b', { text: String(names.length) }), ' players, ', el('b', { text: String(r.teamCount) }), r.teamCount === 1 ? ' team, ' : ' teams, ',
      el('b', { text: String(games) }), ' games of ', el('b', { text: S.fmtMins(gm * 60) }), ' min. Everyone plays every game: ',
      el('b', { text: S.fmtMins(gm * 60 * games) }), ' min each.'
    ]));
    var text = ['U7 3v3: ' + names.length + ' players, ' + r.teamCount + ' teams, ' + games + ' games of ' + S.fmtMins(gm * 60) + ' min', ''];
    r.games.forEach(function (teams, g) {
      out.appendChild(el('h3', { text: 'Game ' + (g + 1) }));
      var grid = el('div', { class: 'teams' });
      text.push('Game ' + (g + 1));
      teams.forEach(function (t, i) {
        var who = t.map(function (p) { return names[p]; });
        grid.appendChild(el('div', { class: 'team' }, [el('b', { text: 'Team ' + letters[i % 26] + (t.length < 3 ? ' (' + t.length + ')' : '') }), who.join(', ')]));
        text.push('  Team ' + letters[i % 26] + ': ' + who.join(', '));
      });
      out.appendChild(grid);
    });
    if (r.warnings.length) text.push('', r.warnings.map(function (w) { return w.text; }).join('\n'));
    lastText = text.join('\n');
  }

  function renderPlan(players, out, msgs) {
    var periods = +f.periods.value || 1;
    var mode = f.keeper.value;
    var idx = Object.create(null);
    players.forEach(function (p, i) { idx[p.name] = i; });
    var picks = [];
    for (var p = 0; p < periods; p++) { var nm = state.keeperPicks[p]; picks.push(nm && nm in idx ? idx[nm] : -1); }
    var fixedName = $('pick-fixed') ? $('pick-fixed').value : state.fixedKeeper;
    var r = S.plan({
      players: players, onPitch: Math.round(num(f.onPitch, 1, 11, 5)), keeperMode: mode,
      fixedKeeper: fixedName in idx ? idx[fixedName] : Math.max(0, players.findIndex(function (q) { return q.keeper; })),
      matchMins: num(f.mins, 1, 120, 40), periods: periods, subEvery: num(f.every, 1, 90, 5), maxChanges: +f.max.value || 0, keepers: picks
    });
    lastPlan = r;
    warn(msgs, r.warnings);
    if (!r.slots.length) { out.appendChild(el('p', { class: 'empty', text: 'Set the match length to see the plan.' })); return; }
    var names = r.players.map(function (q) { return q.name; });
    var nm2 = function (arr) { return arr.map(function (i) { return names[i]; }); };
    var each = r.secs.slice().sort(function (a, b) { return a - b; });
    var lo = each[0], hi = each[each.length - 1];
    var share = lo === hi ? S.fmtMins(lo) : S.fmtMins(lo) + ' to ' + S.fmtMins(hi);
    var fmtName = r.onPitch + 'v' + r.onPitch;
    var headline = names.length + ' players, ' + fmtName + ', ' + S.fmtMins(r.matchSec) + ' min: ' + share + ' min each';
    out.appendChild(el('p', { class: 'summary' }, [
      el('b', { text: String(names.length) }), ' players, ' + fmtName + ', ' + S.fmtMins(r.matchSec) + ' min: ',
      el('b', { text: share }), ' min each' + (r.keeperMode === 'fixed' ? ' (keeper ' + S.fmtMins(r.secs[r.slots[0].keeper]) + ')' : '') + '.'
    ]));

    // touchline sheet
    var text = ['Sub sheet: ' + headline];
    var sheet = el('ol', { class: 'sheet', 'aria-label': 'Sub sheet' });
    var first = r.slots[0];
    var bench0 = names.map(function (_, i) { return i; }).filter(function (i) { return first.on.indexOf(i) < 0 && i !== first.keeper; });
    var kickRow = [];
    if (first.keeper !== null) kickRow.push(el('span', { class: 'row' }, [el('span', { class: 'tag gk', text: 'GK' }), names[first.keeper]]));
    kickRow.push(el('span', { class: 'row' }, [el('span', { class: 'tag on', text: 'ON' }), list(nm2(first.on))]));
    if (bench0.length) kickRow.push(el('span', { class: 'row' }, [el('span', { class: 'tag off', text: 'BENCH' }), list(nm2(bench0))]));
    sheet.appendChild(el('li', { class: 'brk' }, [el('span', { class: 't', text: 'Start' }), el('span', null, kickRow)]));
    text.push('', 'Start' + (first.keeper !== null ? ': GK ' + names[first.keeper] : '') + (first.keeper !== null ? '; on ' : ': on ') + list(nm2(first.on)) + (bench0.length ? '; bench ' + list(nm2(bench0)) : ''));

    r.changes.forEach(function (c) {
      var bits = [], tbits = [];
      var label = c.isBreak ? S.breakName(c.period, periods) : S.fmtClock(c.at);
      if (c.keeper) {
        bits.push(el('span', { class: 'row' }, [el('span', { class: 'tag gk', text: 'GK' }), names[c.keeper.to] + ' goes in goal']));
        tbits.push(names[c.keeper.to] + ' in goal');
      }
      var ons = c.on.filter(function (i) { return !c.keeper || i !== c.keeper.to; });
      var offs = c.off;
      if (ons.length) { bits.push(el('span', { class: 'row' }, [el('span', { class: 'tag on', text: 'ON' }), list(nm2(ons))])); tbits.push('on ' + list(nm2(ons))); }
      if (offs.length) { bits.push(el('span', { class: 'row' }, [el('span', { class: 'tag off', text: 'OFF' }), list(nm2(offs))])); tbits.push('off ' + list(nm2(offs))); }
      if (c.keeper && c.keeper.from !== null && c.off.indexOf(c.keeper.from) < 0) {
        bits.push(el('span', { class: 'row small', text: names[c.keeper.from] + ' comes out of goal and stays on' }));
        tbits.push(names[c.keeper.from] + ' out of goal, stays on');
      }
      sheet.appendChild(el('li', { class: c.isBreak ? 'brk' : '' }, [el('span', { class: 't', text: label }), el('span', null, bits)]));
      text.push(label + ': ' + tbits.join('; '));
    });
    out.appendChild(sheet);

    // minutes grid
    out.appendChild(el('h3', { text: 'Minutes by player' }));
    var thead = el('tr', null, [el('th', { text: 'Player' }), el('th', { text: 'Mins' }), el('th', { text: '%' })]);
    r.slots.forEach(function (s, k) {
      thead.appendChild(el('th', { class: k > 0 && s.period !== r.slots[k - 1].period ? 'pb' : '', title: S.periodName(s.period, periods), text: S.fmtClock(s.start) }));
    });
    var tbody = el('tbody');
    text.push('', 'Minutes:');
    names.forEach(function (name, i) {
      var pct = Math.round(100 * r.secs[i] / r.matchSec);
      var tr = el('tr', null, [el('td', { text: name }), el('td', { text: S.fmtMins(r.secs[i]) }), el('td', { text: pct + '%' })]);
      r.slots.forEach(function (s, k) {
        var pb = k > 0 && s.period !== r.slots[k - 1].period ? ' pb' : '';
        if (s.keeper === i) tr.appendChild(el('td', { class: 'gk' + pb, text: 'GK' }));
        else if (s.on.indexOf(i) >= 0) tr.appendChild(el('td', { class: 'on' + pb, text: '●' }));
        else tr.appendChild(el('td', { class: pb.trim(), text: '' }));
      });
      tbody.appendChild(tr);
      text.push('  ' + name + ' ' + S.fmtMins(r.secs[i]) + (r.keeperSecs[i] ? ' (' + S.fmtMins(r.keeperSecs[i]) + ' in goal)' : ''));
    });
    out.appendChild(el('div', { class: 'tablewrap' }, [el('table', null, [el('thead', null, [thead]), tbody])]));
    if (r.warnings.length) text.push('', r.warnings.map(function (w) { return w.text; }).join('\n'));
    lastText = text.join('\n');
  }

  // ---------- events ----------
  var typing = null;
  function onSquadInput() { clearTimeout(typing); typing = setTimeout(render, 120); }
  f.format.addEventListener('change', function () { applyFormat(); render(); });
  ['onPitch', 'mins', 'periods', 'every', 'keeper', 'max', 'games', 'gameMins', 'mix'].forEach(function (k) {
    f[k].addEventListener(f[k].tagName === 'SELECT' || f[k].type === 'checkbox' ? 'change' : 'input', function () {
      if (k === 'periods' || k === 'keeper') renderKeeperPicks(presentPlayers(squadNames()));
      render();
    });
  });
  f.squad.addEventListener('input', onSquadInput);
  $('roster').addEventListener('change', function (e) {
    var t = e.target, k = t.getAttribute('data-k');
    if (!k) return;
    if (t.getAttribute('data-role') === 'here') { if (t.checked) delete state.absent[k]; else state.absent[k] = true; }
    else { if (t.checked) state.keepers[k] = true; else delete state.keepers[k]; }
    renderKeeperPicks(presentPlayers(squadNames()));
    render();
  });
  $('keeper-picks').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'pick-fixed') state.fixedKeeper = t.value;
    else if (t.hasAttribute('data-p')) state.keeperPicks[+t.getAttribute('data-p')] = t.value;
    render();
  });
  $('b-example').addEventListener('click', function () {
    if (f.squad.value.trim() && !window.confirm('Replace the names in the squad box with an example squad?')) return;
    f.squad.value = ['Alfie', 'Bea', 'Charlie', 'Dev', 'Ellie', 'Finn', 'Grace', 'Harry'].join('\n');
    state.absent = {}; state.keepers = {}; state.keeperPicks = []; state.fixedKeeper = '';
    render();
  });
  $('b-shuffle').addEventListener('click', function () {
    var lines = f.squad.value.split('\n').filter(function (l) { return l.trim(); });
    for (var i = lines.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = lines[i]; lines[i] = lines[j]; lines[j] = t; }
    f.squad.value = lines.join('\n');
    render();
  });
  $('b-rotate').addEventListener('click', function () {
    if (!lastPlan || !lastPlan.slots.length) return;
    var s0 = lastPlan.slots[0];
    var starters = {};
    s0.on.concat(s0.keeper === null ? [] : [s0.keeper]).forEach(function (i) { starters[key(lastPlan.players[i].name)] = true; });
    var lines = f.squad.value.split('\n').filter(function (l) { return l.trim(); });
    var cleaned = S.cleanNames(lines).map(function (p) { return key(p.name); });
    var bench = [], start = [];
    lines.forEach(function (l, i) { (starters[cleaned[i]] ? start : bench).push(l); });
    f.squad.value = bench.concat(start).join('\n');
    state.keeperPicks = [];
    render();
    $('copied').textContent = 'Moved today\'s starters to the bottom, so the bench starts next time.';
  });
  $('b-forget').addEventListener('click', function () {
    if (!window.confirm('Remove the squad and settings saved on this device?')) return;
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ }
    f.squad.value = ''; state = { absent: {}, keepers: {}, keeperPicks: [], fixedKeeper: '' };
    render();
    clearTimeout(saveTimer);
    try { window.localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ }
    $('copied').textContent = 'Squad removed from this device.';
  });
  $('b-print').addEventListener('click', function () { window.print(); });
  $('b-copy').addEventListener('click', function () {
    var msg = $('copied');
    if (!lastText) { msg.textContent = 'Nothing to copy yet.'; return; }
    function fallback() {
      var ta = el('textarea');
      ta.value = lastText; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(ta);
      msg.textContent = done ? 'Copied. Paste it into a message or your notes.' : 'Could not copy: select the sheet and copy it by hand.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastText).then(function () { msg.textContent = 'Copied. Paste it into a message or your notes.'; }, fallback);
    } else fallback();
  });

  // ---------- start ----------
  if (TIP_URL) { $('tip-link').href = TIP_URL; $('tip').style.display = 'block'; }
  var saved = load();
  if (saved) {
    ['format', 'onPitch', 'mins', 'periods', 'every', 'keeper', 'max', 'games', 'gameMins', 'squad'].forEach(function (k) {
      if (typeof saved[k] === 'string' && saved[k] !== '') f[k].value = saved[k];
    });
    if (!f.format.value) f.format.value = 'u8';
    f.mix.checked = saved.mix !== false;
    if (saved.absent && typeof saved.absent === 'object') state.absent = saved.absent;
    if (saved.keepers && typeof saved.keepers === 'object') state.keepers = saved.keepers;
    if (Array.isArray(saved.keeperPicks)) state.keeperPicks = saved.keeperPicks.map(String);
    if (typeof saved.fixedKeeper === 'string') state.fixedKeeper = saved.fixedKeeper;
  } else applyFormat();
  render();
})();
