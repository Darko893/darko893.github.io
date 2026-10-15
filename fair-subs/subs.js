// Fair substitution planning for grassroots football. Time is held in whole seconds.
// Works in the browser (window.Subs) and in Node (module.exports) for the tests.
(function (root) {
  'use strict';

  // FA "Know Your Format" (February 2026), formats from the 2026-27 season.
  var FORMATS = {
    u7: { label: 'U7 (3v3)', onPitch: 3, mins: 8, periods: 1, subEvery: 8, keeper: 'none', festival: true },
    u8: { label: 'U8 and U9 (5v5)', onPitch: 5, mins: 40, periods: 2, subEvery: 5, keeper: 'rotate' },
    u10: { label: 'U10 and U11 (7v7)', onPitch: 7, mins: 50, periods: 2, subEvery: 5, keeper: 'rotate' },
    u12: { label: 'U12 and U13 (9v9)', onPitch: 9, mins: 60, periods: 2, subEvery: 10, keeper: 'rotate' },
    u14: { label: 'U14 and over (11v11)', onPitch: 11, mins: 70, periods: 2, subEvery: 10, keeper: 'fixed' }
  };

  var MIN_SLOT = 60;

  // Split the match into periods (halves, quarters...) and each period into sub windows.
  function buildSlots(matchSec, periods, subEverySec) {
    var slots = [];
    periods = Math.max(1, Math.floor(periods) || 1);
    subEverySec = Math.max(MIN_SLOT, Math.round(subEverySec) || matchSec);
    for (var p = 0; p < periods; p++) {
      var start = Math.round(p * matchSec / periods), end = Math.round((p + 1) * matchSec / periods);
      var s = start;
      while (s < end) {
        var e = Math.min(s + subEverySec, end);
        // a leftover scrap (under a minute, or under a third of a window) joins the window before it
        if (end - e > 0 && end - e < Math.max(MIN_SLOT, subEverySec / 3)) e = end;
        slots.push({ start: s, end: e, period: p });
        s = e;
      }
    }
    return slots;
  }

  function cleanNames(list) {
    var out = [], seen = {};
    (list || []).forEach(function (p) {
      var name = String(p && p.name != null ? p.name : p).replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name) return;
      var key = name.toLowerCase(), n = 2, base = name;
      while (seen[key]) { name = base + ' (' + n++ + ')'; key = name.toLowerCase(); }
      seen[key] = true;
      out.push({ name: name, keeper: !!(p && p.keeper) });
    });
    return out;
  }

  // opts: players [{name, keeper}], onPitch (incl. keeper), keeperMode 'none'|'fixed'|'rotate',
  // fixedKeeper (index), matchMins, periods, subEvery (mins), maxChanges (0 = any number)
  function plan(opts) {
    var players = cleanNames(opts.players);
    var n = players.length;
    var matchSec = Math.round((+opts.matchMins || 0) * 60);
    var onPitch = Math.max(1, Math.floor(+opts.onPitch || 0));
    var mode = opts.keeperMode === 'fixed' || opts.keeperMode === 'rotate' ? opts.keeperMode : 'none';
    var maxChanges = Math.max(0, Math.floor(+opts.maxChanges || 0)) || Infinity;
    var warnings = [];
    var result = { players: players, slots: [], secs: [], keeperSecs: [], changes: [], warnings: warnings, onPitch: onPitch, matchSec: matchSec, keeperMode: mode };
    if (!n || matchSec <= 0) return result;
    if (mode !== 'none' && onPitch < 2) mode = result.keeperMode = 'none';

    var slots = buildSlots(matchSec, opts.periods, (+opts.subEvery || 0) * 60);
    var secs, keeperSecs = [], keeperTurns = [], i;
    for (i = 0; i < n; i++) { keeperSecs.push(0); keeperTurns.push(0); }

    var fixedKeeper = Math.floor(+opts.fixedKeeper || 0);
    if (mode === 'fixed' && !(fixedKeeper >= 0 && fixedKeeper < n)) fixedKeeper = 0;
    var keeperPool = [];
    for (i = 0; i < n; i++) if (players[i].keeper) keeperPool.push(i);
    if (mode === 'rotate' && !keeperPool.length) for (i = 0; i < n; i++) keeperPool.push(i);

    // Keepers are fixed before kick-off so the planner can hold back outfield minutes for them.
    var periods = Math.max(1, Math.floor(+opts.periods) || 1);
    var keeperOf = [], periodSecs = [];
    for (i = 0; i < periods; i++) periodSecs.push(0);
    slots.forEach(function (s) { periodSecs[s.period] += s.end - s.start; });
    var chosen = opts.keepers || [];
    function picked(p) { var w = Math.floor(chosen[p]); return w >= 0 && w < n ? w : -1; }
    for (var p = 0; p < periods; p++) {
      keeperOf.push(mode === 'fixed' ? fixedKeeper : null);
      if (mode === 'rotate' && picked(p) >= 0) { keeperOf[p] = picked(p); keeperTurns[keeperOf[p]]++; keeperSecs[keeperOf[p]] += periodSecs[p]; }
    }
    for (p = 0; p < periods; p++) {
      if (mode !== 'rotate' || picked(p) >= 0) continue;
      var k = keeperPool.slice().sort(function (a, b) {
        return keeperTurns[a] - keeperTurns[b] || keeperSecs[a] - keeperSecs[b] || a - b;
      })[0];
      keeperTurns[k]++; keeperSecs[k] += periodSecs[p];
      keeperOf[p] = k;
    }
    var plannedKeeper = keeperSecs.slice();

    // One greedy pass: at each sub point bring on whoever has played least (keeper time still to
    // come counts as played) for whoever has played most. variant 0 keeps the squad order for
    // ties, so the first players listed start; other variants are only used if they are fairer.
    function greedy(rot, dir) {
      var out = [], secs = [], since = [], owed = plannedKeeper.slice(), i;
      for (i = 0; i < n; i++) { secs.push(0); since.push(0); }
      function load(p) { return secs[p] + owed[p]; }
      function rank(p) { return (p - rot + n) % n; }

      var on = [], keeper = null, prevKeeper = null;
      function byBench(a, b) { return load(a) - load(b) || dir * (since[a] - since[b]) || rank(a) - rank(b); } // fewest minutes, longest wait
      function byPitch(a, b) { return load(b) - load(a) || dir * (since[a] - since[b]) || rank(a) - rank(b); } // most minutes, longest on

      slots.forEach(function (slot, k) {
        var isBreak = k === 0 || slot.period !== slots[k - 1].period;
        prevKeeper = keeper;
        keeper = keeperOf[slot.period];
        if (prevKeeper !== null && prevKeeper !== keeper) since[prevKeeper] = slot.start; // old keeper starts on the bench
        var spots = Math.min(onPitch - (keeper === null ? 0 : 1), n - (keeper === null ? 0 : 1));
        var pool = [];
        for (i = 0; i < n; i++) if (i !== keeper) pool.push(i);

        var next = on.filter(function (p) { return p !== keeper; });
        var bench = pool.filter(function (p) { return next.indexOf(p) < 0; });
        var moves = 0;
        if (k === 0) { bench.sort(byBench); next = bench.slice(0, spots); bench = bench.slice(spots); }
        else {
          bench.sort(byBench);
          while (next.length < spots) { next.push(bench.shift()); moves++; }
          var limit = isBreak ? Infinity : maxChanges;
          while (moves < limit && bench.length && next.length) {
            bench.sort(byBench); next.sort(byPitch);
            if (!(load(bench[0]) < load(next[0]))) break;
            var inP = bench.shift(), outP = next.shift();
            since[outP] = slot.start; bench.push(outP);
            next.push(inP); moves++;
          }
        }
        next.forEach(function (p) { if (on.indexOf(p) < 0) since[p] = slot.start; });

        var len = slot.end - slot.start;
        next.forEach(function (p) { secs[p] += len; });
        if (keeper !== null) { secs[keeper] += len; owed[keeper] -= len; }
        on = next.slice();
        out.push({ start: slot.start, end: slot.end, period: slot.period, keeper: keeper, on: sortIdx(next) });
      });

      repair(out, n, maxChanges);
      return out;
    }

    function score(sl) {
      var t = minutesOf(sl, n).secs, lo = Infinity, hi = -Infinity;
      t.forEach(function (x, p) { if (!(mode === 'fixed' && p === fixedKeeper)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } });
      return { spread: n > 1 && hi >= lo ? hi - lo : 0, changes: changeCount(sl) };
    }
    var maxLen = 0;
    slots.forEach(function (s) { maxLen = Math.max(maxLen, s.end - s.start); });
    var best = null;
    for (var v = 0; v < 2 * n && v < 40; v++) {
      var cand = greedy(Math.floor(v / 2), v % 2 ? -1 : 1), sc = score(cand);
      if (!best || sc.spread < best.sc.spread || (sc.spread === best.sc.spread && sc.changes < best.sc.changes && v < 2)) best = { slots: cand, sc: sc, limit: maxChanges };
      if ((best.sc.spread === 0 && v >= 1) || (best.sc.spread <= maxLen && v >= 3)) break; // within one window is as fair as windows allow
    }
    if (best.sc.spread > maxLen) best = polish(best, score, maxLen);
    result.slots = best.slots;

    var totals = minutesOf(result.slots, n);
    secs = totals.secs;
    result.secs = secs;
    result.keeperSecs = totals.keeperSecs;
    result.changes = changesOf(result.slots);

    // warnings
    var outfield = onPitch - (mode === 'none' ? 0 : 1);
    if (n < onPitch) warnings.push({ code: 'short', text: 'Only ' + n + ' players for ' + onPitch + ' places, so everyone plays the whole match.' });
    var min = Math.min.apply(null, secs), max = Math.max.apply(null, secs);
    if (n > onPitch && min < matchSec / 2 - 0.5) {
      warnings.push({ code: 'under50', text: 'Some players get under half the match (' + fmtMins(min) + ' of ' + fmtMins(matchSec) + ' min). The FA recommends at least 50% each from U8 up; a smaller matchday squad or a second team would help.' });
    }
    if (mode === 'fixed' && n > onPitch && secs[fixedKeeper] - min > 0) {
      warnings.push({ code: 'fixedkeeper', text: players[fixedKeeper].name + ' is in goal all match, so plays ' + fmtMins(secs[fixedKeeper]) + ' min while the others share the rest. Choose "Swap each period" to share goalkeeping.' });
    }
    if (mode === 'rotate' && players.some(function (p) { return p.keeper; }) && keeperPool.length < periods && !(opts.keepers || []).some(function (x) { return x >= 0; })) {
      warnings.push({ code: 'fewkeepers', text: 'Fewer keepers ticked than periods, so someone goes in goal more than once.' });
    }
    var exclude = mode === 'fixed' ? fixedKeeper : -1;
    var omin = Infinity, omax = -Infinity;
    secs.forEach(function (s, p) { if (p !== exclude) { omin = Math.min(omin, s); omax = Math.max(omax, s); } });
    result.spread = n > 1 ? omax - omin : 0;
    result.maxSlot = maxLen;
    if (n > onPitch && outfield > 0 && result.spread > maxLen) {
      warnings.push({ code: 'uneven', text: 'Minutes differ by ' + fmtMins(result.spread) + ' min between players. ' + (maxChanges !== Infinity ? 'Allowing more changes at a time would even them out.' : 'Shorter sub windows would even them out.') });
    }
    return result;
  }

  function minutesOf(slots, n) {
    var secs = [], keeperSecs = [], i;
    for (i = 0; i < n; i++) { secs.push(0); keeperSecs.push(0); }
    slots.forEach(function (s) {
      var len = s.end - s.start;
      s.on.forEach(function (p) { secs[p] += len; });
      if (s.keeper !== null) { secs[s.keeper] += len; keeperSecs[s.keeper] += len; }
    });
    return { secs: secs, keeperSecs: keeperSecs };
  }

  function onPitchAt(slot) { return slot.keeper === null ? slot.on : slot.on.concat([slot.keeper]); }

  // Who comes on and goes off at each sub point (keeper included); keeper swaps noted separately.
  function changesOf(slots) {
    var out = [];
    for (var k = 1; k < slots.length; k++) {
      var before = onPitchAt(slots[k - 1]), after = onPitchAt(slots[k]);
      var comingOn = after.filter(function (p) { return before.indexOf(p) < 0; });
      var goingOff = before.filter(function (p) { return after.indexOf(p) < 0; });
      var keeper = slots[k].keeper !== slots[k - 1].keeper ? { from: slots[k - 1].keeper, to: slots[k].keeper } : null;
      if (comingOn.length || goingOff.length || keeper) {
        out.push({ at: slots[k].start, period: slots[k].period, isBreak: slots[k].period !== slots[k - 1].period, on: sortIdx(comingOn), off: sortIdx(goingOff), keeper: keeper });
      }
    }
    return out;
  }

  function movesAt(slots, k) { // players coming on at the start of slot k
    if (k <= 0 || k >= slots.length) return 0;
    var before = onPitchAt(slots[k - 1]);
    return onPitchAt(slots[k]).filter(function (p) { return before.indexOf(p) < 0; }).length;
  }
  function changeCount(slots) {
    var c = 0;
    for (var k = 1; k < slots.length; k++) c += movesAt(slots, k);
    return c;
  }

  // The greedy pass can leave two players more than one sub window apart (most often when
  // keepers change each quarter). Swap single windows from the most-played to the least-played
  // player until no swap narrows the gap, choosing the swap that adds the fewest changes.
  function repair(slots, n, maxChanges) {
    for (var guard = 0; guard < 500; guard++) {
      var secs = minutesOf(slots, n).secs, best = null;
      for (var k = 0; k < slots.length; k++) {
        var s = slots[k], len = s.end - s.start;
        for (var a = 0; a < s.on.length; a++) {
          var hi = s.on[a];
          for (var lo = 0; lo < n; lo++) {
            if (lo === s.keeper || s.on.indexOf(lo) >= 0 || !(secs[hi] - secs[lo] > len)) continue;
            var old = s.on, was = movesAt(slots, k) + movesAt(slots, k + 1);
            s.on = sortIdx(old.filter(function (p) { return p !== hi; }).concat([lo]));
            var okLimit = [k, k + 1].every(function (j) {
              return j <= 0 || j >= slots.length || slots[j].period !== slots[j - 1].period || movesAt(slots, j) <= maxChanges;
            });
            var cost = okLimit ? movesAt(slots, k) + movesAt(slots, k + 1) - was : Infinity; // change in total subs
            s.on = old;
            var gain = secs[hi] - secs[lo];
            if (cost < Infinity && (!best || cost < best.cost || (cost === best.cost && gain > best.gain))) best = { k: k, hi: hi, lo: lo, cost: cost, gain: gain };
          }
        }
      }
      if (!best) return;
      var t = slots[best.k];
      t.on = sortIdx(t.on.filter(function (p) { return p !== best.hi; }).concat([best.lo]));
    }
  }

  // Last resort when a limit on changes per sub point leaves the plan uneven: a short random
  // walk (fixed seed, so the same squad always gets the same plan) of single-window swaps that
  // never break the limit, keeping the fairest plan seen.
  function polish(best, score, maxLen) {
    var n = 0;
    best.slots.forEach(function (s) { s.on.concat(s.keeper === null ? [] : [s.keeper]).forEach(function (p) { n = Math.max(n, p + 1); }); });
    var cur = best.slots.map(function (s) { return { start: s.start, end: s.end, period: s.period, keeper: s.keeper, on: s.on.slice() }; });
    var curSc = best.sc, seed = 12345;
    function rnd(m) { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % m; }
    var steps = Math.min(6000, Math.floor(400000 / (cur.length * Math.max(1, n))));
    for (var it = 0; it < steps && best.sc.spread > maxLen; it++) {
      var k = rnd(cur.length), s = cur[k];
      var bench = [];
      for (var p = 0; p < n; p++) if (p !== s.keeper && s.on.indexOf(p) < 0) bench.push(p);
      if (!bench.length || !s.on.length) continue;
      var out = s.on[rnd(s.on.length)], inn = bench[rnd(bench.length)], old = s.on;
      s.on = sortIdx(old.filter(function (x) { return x !== out; }).concat([inn]));
      var ok = [k, k + 1].every(function (j) { return j <= 0 || j >= cur.length || cur[j].period !== cur[j - 1].period || movesAt(cur, j) <= best.limit; });
      var sc = ok ? score(cur) : null;
      if (sc && (sc.spread < curSc.spread || (sc.spread === curSc.spread && sc.changes <= curSc.changes + 1))) {
        curSc = sc;
        if (sc.spread < best.sc.spread || (sc.spread === best.sc.spread && sc.changes < best.sc.changes)) {
          best = { slots: cur.map(function (x) { return { start: x.start, end: x.end, period: x.period, keeper: x.keeper, on: x.on.slice() }; }), sc: sc, limit: best.limit };
        }
      } else s.on = old;
    }
    return best;
  }

  function sortIdx(a) { return a.slice().sort(function (x, y) { return x - y; }); }

  // U7 3v3: no subs during a game; split everyone into teams of up to 3 for each game.
  // With mix on, team-mates change from game to game; everyone plays every game.
  function festival(opts) {
    var players = cleanNames(opts.players);
    var n = players.length, size = Math.max(1, Math.floor(+opts.teamSize || 3));
    var games = Math.max(1, Math.min(20, Math.floor(+opts.games || 1)));
    var T = Math.ceil(n / size);
    var out = { players: players, games: [], teamCount: T, warnings: [] };
    if (!n) return out;
    // Team sizes as even as possible (10 -> 3, 3, 2, 2). Places in short teams go round in turn,
    // and each player joins the team where they have played with the fewest of its members before.
    var sizes = [];
    for (var t = 0; t < T; t++) sizes.push(Math.floor(n / T) + (t < n % T ? 1 : 0));
    var met = [], wasShort = [];
    for (var a = 0; a < n; a++) { met.push([]); wasShort.push(0); for (var b2 = 0; b2 < n; b2++) met[a].push(0); }
    for (var g = 0; g < games; g++) {
      if (opts.mix === false && g > 0) { out.games.push(out.games[0]); continue; }
      var teams = [];
      for (t = 0; t < T; t++) teams.push([]);
      // the players who have been in a short team least take this game's short-team places
      var order = [], shortPlaces = 0;
      for (t = 0; t < T; t++) if (sizes[t] < size) shortPlaces += sizes[t];
      for (var q = 0; q < n; q++) order.push((q + g) % n);
      var isShort = {}, chosen = [];
      while (chosen.length < shortPlaces) {
        var pick = -1, pickCost = Infinity;
        order.forEach(function (x) {
          if (isShort[x]) return;
          var c = wasShort[x] * 1000;
          chosen.forEach(function (y) { c += met[x][y] * met[x][y]; });
          if (c < pickCost) { pickCost = c; pick = x; }
        });
        isShort[pick] = true; chosen.push(pick);
      }
      for (q = 0; q < n; q++) {
        var p = order[q], best = -1, bestCost = Infinity;
        for (t = 0; t < T; t++) {
          if (teams[t].length >= sizes[t] || (sizes[t] < size) !== !!isShort[p]) continue;
          var cost = 0;
          teams[t].forEach(function (m) { cost += met[p][m] * met[p][m] * 100; });
          cost -= (sizes[t] - teams[t].length); // otherwise spread players across teams
          if (cost < bestCost) { bestCost = cost; best = t; }
        }
        teams[best].push(p);
      }
      // then swap pairs of players between teams while that cuts repeated team-mates
      var teamOf = [];
      teams.forEach(function (tm, ti) { tm.forEach(function (x) { teamOf[x] = ti; }); });
      var costIn = function (x, ti, skip) { var c = 0; teams[ti].forEach(function (m) { if (m !== x && m !== skip) c += met[x][m] * met[x][m]; }); return c; };
      for (var pass = 0, improved = true; improved && pass < 50; pass++) {
        improved = false;
        for (var x = 0; x < n; x++) for (var y = x + 1; y < n; y++) {
          var tx = teamOf[x], ty = teamOf[y];
          if (tx === ty || ((sizes[tx] < size) !== (sizes[ty] < size) && wasShort[x] !== wasShort[y])) continue;
          var now = costIn(x, tx) + costIn(y, ty), then = costIn(x, ty, y) + costIn(y, tx, x);
          if (then < now) {
            teams[tx][teams[tx].indexOf(x)] = y; teams[ty][teams[ty].indexOf(y)] = x;
            teamOf[x] = ty; teamOf[y] = tx; improved = true;
          }
        }
      }
      teams.forEach(function (tm, ti) {
        tm.forEach(function (x) { if (sizes[ti] < size) wasShort[x]++; tm.forEach(function (y) { if (x !== y) met[x][y]++; }); });
      });
      out.games.push(teams.map(sortIdx));
    }
    var small = out.games[0].filter(function (t) { return t.length < size; }).length;
    if (small && n > size) out.warnings.push({ code: 'small', text: small + (small === 1 ? ' team has ' : ' teams have ') + 'fewer than ' + size + ' players and will play a player down (England Football suggests this rather than sitting children out).' });
    if (n < size) out.warnings.push({ code: 'tiny', text: 'Fewer than ' + size + ' players: one short-handed team.' });
    var mins = (+opts.gameMins || 0) * games;
    if (mins > 60) out.warnings.push({ code: 'over60', text: 'That is ' + mins + ' minutes of games each. England Football says U7s should play no more than 60 minutes of football in a day, and recommends 30 to 40.' });
    return out;
  }

  // 1500 -> "25", 750 -> "12.5", 1510 -> "25:10"
  function fmtMins(sec) {
    sec = Math.round(sec);
    if (sec % 60 === 0) return String(sec / 60);
    if (sec % 30 === 0) return (sec / 60).toFixed(1);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  // clock time in the match, "12:30"
  function fmtClock(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function periodName(p, periods) {
    if (periods === 2) return p === 0 ? '1st half' : '2nd half';
    if (periods === 4) return 'Q' + (p + 1);
    if (periods === 3) return ['1st third', '2nd third', '3rd third'][p];
    return 'Period ' + (p + 1);
  }
  function breakName(p, periods) {
    if (periods === 2) return 'Half-time';
    if (periods === 4) return p === 2 ? 'Half-time' : 'Start of Q' + (p + 1);
    return 'Start of ' + periodName(p, periods).toLowerCase();
  }

  var api = { FORMATS: FORMATS, buildSlots: buildSlots, plan: plan, festival: festival, cleanNames: cleanNames, fmtMins: fmtMins, fmtClock: fmtClock, periodName: periodName, breakName: breakName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Subs = api;
})(this);
