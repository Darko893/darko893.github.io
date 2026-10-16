// Heating oil tank sums: litres from a dipstick, days left, order-by date, top-up.
// No DOM here, so the same file runs in the browser and in the tests.
(function (root) {
  'use strict';

  var L_PER_GALLON = 4.54609; // imperial gallon
  var CM_PER_INCH = 2.54;

  // Rough share of a year's oil used in each month (Jan..Dec): 80% heating, spread
  // by typical UK heating degree days (base 15.5C), and 20% hot water, spread by days.
  var HDD = [330, 290, 270, 200, 130, 70, 40, 45, 85, 160, 250, 310];
  var MONTH_DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var HDD_SUM = HDD.reduce(function (a, b) { return a + b; }, 0);
  var WEIGHTS = HDD.map(function (h, i) { return 0.8 * h / HDD_SUM + 0.2 * MONTH_DAYS[i] / 365.25; });

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

  // Share of a horizontal round (or oval) tank filled to depth fraction f of its height.
  function roundFraction(f) {
    f = clamp(f, 0, 1);
    var th = 2 * Math.acos(1 - 2 * f);
    return (th - Math.sin(th)) / (2 * Math.PI);
  }

  // Sort chart points, drop bad ones, add 0 cm = 0 L if missing.
  function cleanPoints(points) {
    var p = (points || []).filter(function (q) { return isFinite(q[0]) && isFinite(q[1]) && q[0] >= 0 && q[1] >= 0; })
      .map(function (q) { return [+q[0], +q[1]]; })
      .sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    p.forEach(function (q) { if (!out.length || q[0] > out[out.length - 1][0]) out.push(q); });
    if (out.length && out[0][0] > 0) out.unshift([0, 0]);
    return out;
  }

  // Parse "cm litres" per line (also "cm,litres", "cm = litres", "cm: litres").
  function parsePoints(text) {
    var pts = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = line.match(/(-?\d+(?:\.\d+)?)\s*(?:cm)?\s*[,;:=\t ]+\s*(-?\d+(?:\.\d+)?)/i);
      if (m) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
    });
    return pts;
  }

  // tank: {shape: 'rect'|'vcyl'|'hcyl'|'chart', capacity (L), height (cm), points [[cm, L]]}
  function tankError(t) {
    if (t.shape === 'chart') {
      var p = cleanPoints(t.points);
      if (p.length < 2) return 'Add at least two lines from your tank’s chart (depth in cm, then litres).';
      for (var i = 1; i < p.length; i++) if (p[i][1] < p[i - 1][1]) return 'The litres in your chart should go up as the depth goes up (check the line for ' + p[i][0] + ' cm).';
      return '';
    }
    if (!(t.capacity > 0)) return 'Enter how many litres the tank holds.';
    if (!(t.height > 0)) return 'Enter the inside height of the tank.';
    return '';
  }

  function capacityOf(t) {
    if (t.shape === 'chart') { var p = cleanPoints(t.points); return p.length ? p[p.length - 1][1] : 0; }
    return t.capacity;
  }
  function heightOf(t) {
    if (t.shape === 'chart') { var p = cleanPoints(t.points); return p.length ? p[p.length - 1][0] : 0; }
    return t.height;
  }

  // Litres in the tank at a dipstick depth (cm).
  function litresAt(t, depth) {
    if (!(depth > 0)) return 0;
    if (t.shape === 'chart') {
      var p = cleanPoints(t.points);
      if (p.length < 2) return 0;
      if (depth >= p[p.length - 1][0]) return p[p.length - 1][1];
      for (var i = 1; i < p.length; i++) {
        if (depth <= p[i][0]) {
          var a = p[i - 1], b = p[i];
          return a[1] + (b[1] - a[1]) * (depth - a[0]) / (b[0] - a[0]);
        }
      }
    }
    var f = clamp(depth / t.height, 0, 1);
    return t.capacity * (t.shape === 'hcyl' ? roundFraction(f) : f);
  }

  // Depth (cm) at which the tank holds the given litres.
  function depthFor(t, litres) {
    var H = heightOf(t), cap = capacityOf(t);
    if (!(litres > 0)) return 0;
    if (litres >= cap) return H;
    var lo = 0, hi = H;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (litresAt(t, mid) < litres) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---- dates: 'YYYY-MM-DD' strings, counted in whole UTC days so clock changes don't matter
  function dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return NaN;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var back = new Date(d);
    if (back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) return NaN;
    return d / 864e5;
  }
  function dayStr(n) {
    var d = new Date(Math.round(n) * 864e5);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function niceDate(n, withYear) {
    var d = new Date(Math.round(n) * 864e5);
    return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
  }
  function monthOf(n) { return new Date(Math.round(n) * 864e5).getUTCMonth(); }

  // Litres a home that uses `annual` litres a year burns on day n.
  function dailyUse(annual, n) {
    var m = monthOf(n);
    return annual * WEIGHTS[m] / MONTH_DAYS[m];
  }
  // Litres used from the start of day a to the start of day b.
  function usedBetween(annual, a, b) {
    var s = 0;
    for (var n = Math.round(a); n < Math.round(b); n++) s += dailyUse(annual, n);
    return s;
  }

  // From a log of readings [{date, litres}] work out a yearly figure that matches the
  // most recent fall in level (deliveries show as rises and are skipped).
  function rateFromReadings(readings) {
    var r = (readings || []).filter(function (x) { return isFinite(dayNum(x.date)) && x.litres >= 0; })
      .map(function (x) { return { n: dayNum(x.date), litres: +x.litres }; })
      .sort(function (a, b) { return a.n - b.n; });
    for (var i = r.length - 1; i > 0; i--) {
      var a = r[i - 1], b = r[i];
      if (b.n <= a.n) continue;
      if (b.litres >= a.litres) continue; // a delivery (or no use) in between
      var used = a.litres - b.litres, days = b.n - a.n;
      var base = usedBetween(1, a.n, b.n);
      return { from: dayStr(a.n), to: dayStr(b.n), days: days, used: used, perDay: used / days,
        annual: used / base, short: days < 7 };
    }
    return null;
  }

  // Main sum. o: {tank, reading: {kind: 'depth'|'percent'|'litres', value}, today: 'YYYY-MM-DD',
  //   annual (L/yr), outlet (cm of oil the pipe can't reach), reservePct, leadDays, fillPct,
  //   price (pence per litre, optional), minOrder (L)}
  function work(o) {
    var t = o.tank, err = tankError(t);
    if (err) return { error: err };
    var cap = capacityOf(t), H = heightOf(t);
    var today = dayNum(o.today);
    if (!isFinite(today)) return { error: 'Enter the date of the reading.' };
    var r = o.reading || {}, v = +r.value;
    if (r.value === '' || r.value === null || r.value === undefined || !isFinite(v) || v < 0) return { error: 'Enter today’s reading.' };
    var litres, warn = [];
    if (r.kind === 'percent') {
      if (v > 100) warn.push('A gauge can’t read more than 100%; using 100%.');
      litres = cap * clamp(v, 0, 100) / 100;
    } else if (r.kind === 'litres') {
      if (v > cap) warn.push('That’s more than the tank holds (' + Math.round(cap) + ' L); using ' + Math.round(cap) + ' L.');
      litres = Math.min(v, cap);
    } else {
      if (v > H) warn.push('The oil can’t be deeper than the tank (' + round1(H) + ' cm); check the inside height. Using a full tank.');
      litres = litresAt(t, Math.min(v, H));
    }
    var depth = r.kind === 'depth' ? Math.min(v, H) : depthFor(t, litres);
    var dead = litresAt(t, Math.min(Math.max(+o.outlet || 0, 0), H));
    var usable = Math.max(0, litres - dead);
    var annual = +o.annual;
    var res = { capacity: cap, height: H, litres: litres, depth: depth, pct: cap ? litres / cap * 100 : 0,
      dead: dead, usable: usable, annual: annual, warn: warn, today: dayStr(today) };

    // order trigger and top-up
    var reserve = cap * clamp(+o.reservePct || 0, 0, 100) / 100;
    var fillTo = cap * clamp(isFinite(+o.fillPct) && o.fillPct !== '' ? +o.fillPct : 90, 0, 100) / 100;
    res.reserve = reserve;
    res.fillTo = fillTo;
    res.order = Math.max(0, Math.floor((fillTo - litres) / 50) * 50);
    res.minOrder = +o.minOrder || 0;
    res.belowMin = res.order > 0 && res.order < res.minOrder;
    res.price = +o.price > 0 ? +o.price : 0;
    res.cost = res.price ? res.order * res.price / 100 : 0;

    if (!(annual > 0)) { res.noUsage = true; return res; }
    // walk forward a day at a time
    var lead = Math.max(0, Math.round(+o.leadDays || 0));
    var left = litres, n = today, reserveDay = null, emptyDay = null, months = [];
    var limit = today + 3 * 366;
    if (left <= reserve) reserveDay = today;
    if (usable <= 0) emptyDay = today;
    while (n < limit && emptyDay === null) {
      var d = new Date(n * 864e5);
      if (d.getUTCDate() === 1 && n !== today) months.push({ date: dayStr(n), litres: left });
      var use = dailyUse(annual, n);
      if (left - use <= dead) { emptyDay = n + (left - dead) / use; break; }
      left -= use;
      n++;
      if (reserveDay === null && left <= reserve) reserveDay = n;
    }
    res.months = months.slice(0, 12);
    res.perDayNow = dailyUse(annual, today);
    if (emptyDay === null) { res.lastsBeyond = true; return res; }
    var emptyWhole = Math.floor(emptyDay);
    res.emptyDay = dayStr(emptyWhole);
    res.daysLeft = emptyDay - today;
    var orderBy = reserveDay === null ? emptyWhole - lead : Math.min(reserveDay, emptyWhole - lead);
    res.orderBy = dayStr(Math.max(today, orderBy));
    res.orderNow = orderBy <= today;
    res.lead = lead;
    return res;
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  // Dipstick chart rows: every `step` cm from 0 to the top.
  function chart(t, step) {
    var H = heightOf(t), rows = [];
    if (!(H > 0) || !(step > 0)) return rows;
    for (var d = 0; d < H - 1e-9; d += step) rows.push([round1(d), litresAt(t, d)]);
    rows.push([round1(H), litresAt(t, H)]);
    return rows;
  }

  var api = { L_PER_GALLON: L_PER_GALLON, CM_PER_INCH: CM_PER_INCH, WEIGHTS: WEIGHTS, roundFraction: roundFraction,
    parsePoints: parsePoints, cleanPoints: cleanPoints, tankError: tankError, capacityOf: capacityOf, heightOf: heightOf,
    litresAt: litresAt, depthFor: depthFor, dayNum: dayNum, dayStr: dayStr, niceDate: niceDate, monthOf: monthOf,
    dailyUse: dailyUse, usedBetween: usedBetween, rateFromReadings: rateFromReadings, work: work, chart: chart, round1: round1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tank = api;
})(this);
