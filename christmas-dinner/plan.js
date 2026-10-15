// Christmas dinner time plan: works back from the time you want to eat.
// No DOM here, so it runs in the browser (window.DinnerPlan) and in node tests.
(function (root) {
  'use strict';

  var HOT = { c: 220, fan: 200, gas: 7 };      // roasting the sides once the turkey is out
  var MAIN = { c: 190, fan: 170, gas: 5 };     // turkey / crown default
  var PREHEAT = 20;                            // minutes to heat an oven from cold
  var REHEAT = 10;                             // minutes to turn an already hot oven up
  var DISH_UP = 5;                             // oven and hob dishes are ready this long before serving
  var CARVE = 15;                              // carve this long before serving
  var CHECK_BEFORE = 30;                       // first thermometer check, minutes before the turkey is due out
  var THAW_H_PER_KG = 12;                      // FSA: around 10 to 12 hours per kg in the fridge (top end used)

  // Default dishes. steps run in order; the last step ends at the dish's finish time.
  // where: 'hob' or 'oven'. Oven steps are at the hot temperature.
  var DISHES = [
    { id: 'potatoes', name: 'Roast potatoes', on: true, steps: [
      { where: 'hob', mins: 10, text: 'Parboil the potatoes (start in cold salted water, 10 min once boiling), drain and rough up' },
      { where: 'oven', mins: 55, text: 'Potatoes into the hot fat to roast; turn them halfway' }], fatFirst: true },
    { id: 'parsnips', name: 'Roast parsnips and carrots', on: true, steps: [{ where: 'oven', mins: 40, text: 'Roast parsnips and carrots in' }] },
    { id: 'pigs', name: 'Pigs in blankets', on: true, steps: [{ where: 'oven', mins: 30, text: 'Pigs in blankets in' }] },
    { id: 'stuffing', name: 'Stuffing', on: true, steps: [{ where: 'oven', mins: 30, text: 'Stuffing in' }] },
    { id: 'yorkshires', name: 'Yorkshire puddings', on: false, steps: [{ where: 'oven', mins: 20, text: 'Yorkshire pudding batter into the smoking-hot tin' }] },
    { id: 'cauli', name: 'Cauliflower cheese', on: false, steps: [{ where: 'oven', mins: 30, text: 'Cauliflower cheese in' }] },
    { id: 'sprouts', name: 'Sprouts', on: true, steps: [{ where: 'hob', mins: 8, text: 'Sprouts on to boil or steam' }] },
    { id: 'greens', name: 'Peas, carrots or other boiled veg', on: false, steps: [{ where: 'hob', mins: 10, text: 'Boiled veg on' }] },
    { id: 'cabbage', name: 'Red cabbage (reheat)', on: false, steps: [{ where: 'hob', mins: 15, text: 'Red cabbage on to reheat gently' }] },
    { id: 'breadsauce', name: 'Bread sauce', on: false, steps: [{ where: 'hob', mins: 20, text: 'Bread sauce: warm the milk with onion and cloves to infuse, then stir in the breadcrumbs' }] },
    { id: 'gravy', name: 'Gravy', on: true, steps: [{ where: 'hob', mins: 15, text: 'Gravy: tip the turkey juices into a pan with stock and thicken' }], ends: 0, afterMain: true },
    { id: 'pudding', name: 'Christmas pudding (steamed)', on: true, steps: [{ where: 'hob', mins: 60, text: 'Christmas pudding on to steam; check the pack, as times vary and microwaving takes only minutes' }], dessert: true }
  ];

  function copyDishes() { return JSON.parse(JSON.stringify(DISHES)); }

  function toKg(weight, unit) {
    var w = Number(weight);
    if (!isFinite(w) || w <= 0) return 0;
    return unit === 'lb' ? w * 0.45359237 : w;
  }
  function roundUp5(m) { return Math.ceil(m / 5 - 1e-9) * 5; }

  // A common UK rule of thumb for an oven-ready turkey or crown at 190C (170C fan, gas 5):
  // 20 minutes per kg, plus 70 minutes under 4 kg or 90 minutes from 4 kg. The label on the bird wins.
  function estimateTurkeyMins(kg) {
    if (!(kg > 0)) return 0;
    return roundUp5(20 * kg + (kg < 4 ? 70 : 90));
  }
  // Fridge thawing: about 10-12 hours per kg (we plan with 12).
  function thawHours(kg) { return kg > 0 ? Math.ceil(kg * THAW_H_PER_KG) : 0; }

  function tempText(t) { return t.c + '\u00b0C (' + t.fan + '\u00b0C fan, gas ' + t.gas + ')'; }

  function clampInt(v, lo, hi, d) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return d;
    return Math.min(hi, Math.max(lo, n));
  }

  // Build the plan. All times are minutes relative to serving (negative = before).
  // opts: { main: 'turkey'|'crown'|'other'|'none', kg, cookMins (optional override), mainName, mainTemp (text, for 'other'),
  //         frozen, rest, ovens (1|2), rings, dessertGap, dishes: [...] }
  function build(opts) {
    var o = opts || {};
    var ev = [];          // { t, text, kind, dish }
    var warn = [];
    var main = o.main || 'turkey';
    var hasMain = main !== 'none';
    var isTurkey = main === 'turkey' || main === 'crown';
    var kg = Number(o.kg) || 0;
    var ovens = o.ovens === 2 ? 2 : 1;
    var rings = clampInt(o.rings, 1, 8, 4);
    var rest = hasMain ? clampInt(o.rest, 15, 120, 45) : 0;
    var dessertGap = clampInt(o.dessertGap, 0, 180, 45);
    var dishes = (o.dishes || copyDishes()).filter(function (d) { return d && d.on; });
    var summary = { main: main, kg: kg };

    function add(t, text, kind, dish) { ev.push({ t: t, text: text, kind: kind || 'step', dish: dish || '' }); }

    // ---- main ----
    var cook = 0, mainIn = null, mainOut = null, mainName = '';
    if (hasMain) {
      var est = isTurkey ? estimateTurkeyMins(kg) : 0;
      var given = Number(o.cookMins);
      cook = given > 0 ? clampInt(given, 5, 24 * 60, est) : est;
      summary.estimate = est;
      summary.fromLabel = given > 0;
      mainName = main === 'turkey' ? 'turkey' : main === 'crown' ? 'turkey crown' : (String(o.mainName || '').trim().toLowerCase() || 'joint');
      if (!(cook > 0)) {
        warn.push(isTurkey ? 'Enter the weight of the ' + mainName + ', or the cooking time from its label.' : 'Enter the cooking time for the ' + mainName + ' (from the label or recipe).');
        hasMain = false;
      }
    }
    var mainTemp = main === 'other' ? (String(o.mainTemp || '').trim() || 'the temperature on the label') : tempText(MAIN);
    if (hasMain) {
      mainOut = -(rest);
      mainIn = mainOut - cook;
      summary.cook = cook; summary.mainIn = mainIn; summary.mainOut = mainOut; summary.rest = rest;
      add(mainIn - PREHEAT, 'Oven on to heat: ' + mainTemp, 'oven');
      add(mainIn, cap(mainName) + ' in the oven (' + fmtDur(cook) + ')', 'main', 'main');
      var checkAt = Math.max(mainOut - CHECK_BEFORE, mainIn + Math.ceil(cook / 2)); // short roasts: halfway
      if (isTurkey) {
        add(checkAt, 'Check the ' + mainName + ': a thermometer in the thickest part of the thigh (not touching bone) should read 75\u00b0C, or the juices run clear with no pink meat and it is steaming hot. Not there yet? Leave it in and check every 15 min: the resting time is your buffer.', 'check', 'main');
      } else {
        add(checkAt, 'Check the ' + mainName + ' is cooking as expected (label or recipe check).', 'check', 'main');
      }
      add(mainOut, cap(mainName) + ' out. Cover loosely with foil (and a clean tea towel) to rest' + (isTurkey ? '; keep the juices for the gravy' : '') + '.', 'main', 'main');
      add(-CARVE, 'Carve the ' + mainName + '.', 'main', 'main');
      if (o.frozen && isTurkey && kg > 0) {
        var h = thawHours(kg);
        var thawAt = Math.floor((mainIn - PREHEAT - h * 60) / 60) * 60; // round down to the hour
        add(thawAt, 'Frozen ' + mainName + ': move it from the freezer to the bottom shelf of the fridge to thaw (about ' + h + ' hours for ' + fmtKg(kg) + '). Check it is fully thawed, with no ice in the cavity, before cooking.', 'thaw', 'main');
        summary.thawAt = thawAt;
      }
    }

    // ---- dishes: lay out each one backwards from its finish ----
    var blocks = []; // { dish, where, start, end, text }
    dishes.forEach(function (d) {
      var steps = (d.steps || []).filter(function (s) { return Number(s.mins) > 0; });
      if (!steps.length) return;
      var end = d.dessert ? dessertGap : (d.ends === 0 ? 0 : -DISH_UP);
      if (d.afterMain && hasMain) end = Math.max(end, mainOut + totalMins(steps));
      for (var i = steps.length - 1; i >= 0; i--) {
        var m = clampInt(steps[i].mins, 1, 600, 10);
        var start = end - m;
        var text = steps[i].text || d.name;
        if (d.id === 'gravy') text = hasMain ? 'Gravy: tip the ' + mainName + ' juices into a pan with stock and thicken' : 'Gravy on: stock and thickener (or granules)';
        blocks.push({ dish: d, where: steps[i].where === 'hob' ? 'hob' : 'oven', start: start, end: end, text: text, mins: m });
        end = start;
      }
    });
    blocks.sort(function (a, b) { return a.start - b.start; });

    // ---- ovens ----
    var ovenBlocks = blocks.filter(function (b) { return b.where === 'oven'; });
    var shared = [];
    var hotFrom = null; // when the oven used for sides is at the hot temperature
    if (ovenBlocks.length) {
      var firstHot = ovenBlocks[0].start;
      if (hasMain && ovens === 1) {
        hotFrom = mainOut + REHEAT;
        add(mainOut, 'Turn the oven up to ' + tempText(HOT) + ' for the trimmings.', 'ovenup');
        ovenBlocks.forEach(function (b) { if (b.start < mainOut) shared.push(b); });
      } else if (hasMain && ovens === 2) {
        hotFrom = firstHot;
        add(firstHot - PREHEAT, 'Second oven on to heat: ' + tempText(HOT) + '.', 'oven');
      } else {
        hotFrom = firstHot;
        add(firstHot - PREHEAT, 'Oven on to heat: ' + tempText(HOT) + '.', 'oven');
      }
      if (shared.length) {
        var names = uniq(shared.map(function (b) { return b.dish.name.toLowerCase(); }));
        var longer = suggestRest(ovenBlocks, rest);
        warn.push('Going in alongside the ' + mainName + ', while the oven is still at its lower heat: ' + joinList(names) + '. They crisp up once you turn the oven up at ' + '{' + mainOut + '}' + '; check them and give them a few more minutes if they need it. To avoid this, ' +
          (longer <= 90 ? 'rest the ' + mainName + ' for longer (' + longer + ' min would do; wrapped in foil and a tea towel it stays hot) or ' : '') + 'use a second oven.');
      }
      // capacity: count oven dishes in at the same time (main counts as one shelf)
      var peak = peakOverlap(ovenBlocks.map(function (b) { return [b.start, b.end]; }).concat(hasMain && ovens === 1 ? [[mainIn, mainOut]] : []));
      if (peak.n > 4) warn.push(peak.n + ' things in the ' + (ovens === 2 ? 'second ' : '') + 'oven at ' + '{' + peak.t + '}' + '. Check they all fit, or share trays (pigs in blankets and stuffing balls can go on one tray).');
    }
    blocks.forEach(function (b) {
      var txt = b.text;
      if (b.where === 'oven') {
        var inShared = shared.indexOf(b) >= 0;
        var warming = !inShared && hotFrom !== null && b.start < hotFrom;
        txt += ' (' + b.mins + ' min' + (inShared ? ', alongside the ' + mainName : warming ? '; the oven is still heating up' : '') + ')';
        if (b.dish.fatFirst) add(b.start - 10, 'Fat or oil into the roasting tin and into the oven to get hot, for the potatoes.', 'prep', b.dish.id);
      } else {
        txt += ' (' + b.mins + ' min)';
      }
      add(b.start, txt, b.where === 'oven' ? 'ovenstep' : 'hob', b.dish.id);
      if (b.dish.dessert) add(b.end, b.dish.name + ' ready: turn out and serve.', 'serve', b.dish.id);
    });

    // ---- hob rings ----
    var hob = blocks.filter(function (b) { return b.where === 'hob' && !b.dish.dessert; }).map(function (b) { return [b.start, b.end]; });
    var pud = blocks.filter(function (b) { return b.where === 'hob' && b.dish.dessert; }).map(function (b) { return [b.start, b.end]; });
    var hp = peakOverlap(hob.concat(pud));
    if (hp.n > rings) warn.push(hp.n + ' pans on the hob at ' + '{' + hp.t + '}' + ' but you have ' + rings + (rings === 1 ? ' ring. ' : ' rings. ') + 'Make something ahead (red cabbage and bread sauce reheat well), microwave the pudding, or steam veg over another pan.');

    if (blocks.length || hasMain) {
      add(-DISH_UP, 'Dish up: everything into warm serving dishes.', 'serve');
      add(0, 'Serve.', 'serve');
    }

    // stable order: by time, then a fixed kind order so "Oven on" comes before "in" at the same minute
    var order = { thaw: 0, oven: 1, prep: 2, check: 3, main: 4, ovenup: 5, ovenstep: 6, hob: 7, step: 8, serve: 9 };
    ev.forEach(function (e, i) { e.i = i; });
    ev.sort(function (a, b) { return a.t - b.t || order[a.kind] - order[b.kind] || a.i - b.i; });
    ev.forEach(function (e) { delete e.i; });

    summary.start = ev.length ? firstNonThaw(ev) : 0;
    return { events: ev, warnings: warn, summary: summary, hotFrom: hotFrom };
  }

  function firstNonThaw(ev) { for (var i = 0; i < ev.length; i++) if (ev[i].kind !== 'thaw') return ev[i].t; return 0; }
  function totalMins(steps) { return steps.reduce(function (s, x) { return s + (Number(x.mins) || 0); }, 0); }
  function suggestRest(ovenBlocks, rest) {
    var need = rest;
    ovenBlocks.forEach(function (b) { need = Math.max(need, -b.start + REHEAT); });
    return roundUp5(need);
  }
  function peakOverlap(ranges) {
    var pts = [];
    ranges.forEach(function (r) { if (r[1] > r[0]) { pts.push([r[0], 1]); pts.push([r[1], -1]); } });
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }); // ends before starts at the same minute
    var n = 0, best = 0, at = 0;
    pts.forEach(function (p) { n += p[1]; if (n > best) { best = n; at = p[0]; } });
    return { n: best, t: at };
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function joinList(a) { if (a.length < 2) return a[0] || ''; return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fmtDur(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r || !h ? r + ' min' : ''); }
  function fmtKg(kg) { return (Math.round(kg * 10) / 10) + ' kg'; }

  // ---- clock times ----
  // serve: { y, mo (1-12), d, h, mi }. Returns a Date in local time for offset minutes.
  function at(serve, offset) { return new Date(serve.y, serve.mo - 1, serve.d, serve.h, serve.mi + offset, 0, 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(date) { return pad(date.getHours()) + ':' + pad(date.getMinutes()); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayLabel(date) { return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()]; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  // "{-45}" placeholders in warnings become clock times
  function fillTimes(text, serve) { return text.replace(/\{(-?\d+)\}/g, function (_, m) { return clock(at(serve, Number(m))); }); }
  function parseServe(dateStr, timeStr) {
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    var tm = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
    if (!dm || !tm) return null;
    var s = { y: +dm[1], mo: +dm[2], d: +dm[3], h: +tm[1], mi: +tm[2] };
    if (s.mo < 1 || s.mo > 12 || s.d < 1 || s.d > 31 || s.h > 23 || s.mi > 59) return null;
    return s;
  }

  // ---- calendar file with an alarm at each step ----
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
  function fold(line) {
    var out = [], s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
    out.push(s);
    return out.join('\r\n');
  }
  function toICS(plan, serve, stamp) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//darko893//christmas-dinner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var now = stamp || new Date();
    var dtstamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    plan.events.forEach(function (e, i) {
      var d = at(serve, e.t), end = at(serve, e.t + 5);
      var title = shortTitle(e.text);
      lines.push('BEGIN:VEVENT', 'UID:dinner-' + icsDate(at(serve, 0)) + '-' + i + '@darko893.github.io', 'DTSTAMP:' + dtstamp,
        'DTSTART:' + icsDate(d), 'DTEND:' + icsDate(end), fold('SUMMARY:' + icsEscape(title)), fold('DESCRIPTION:' + icsEscape(e.text)),
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEscape(title)), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function shortTitle(text) {
    var t = String(text).split(/[.:(]/)[0].trim();
    return t.length > 60 ? t.slice(0, 57) + '...' : t;
  }

  function toText(plan, serve) {
    var out = [], lastDay = null, serveDate = at(serve, 0);
    plan.events.forEach(function (e) {
      var d = at(serve, e.t);
      if (!sameDay(d, serveDate)) { out.push(dayLabel(d) + ' ' + clock(d) + '  ' + e.text); return; }
      if (lastDay !== 'serve') { out.push(''); out.push(dayLabel(serveDate)); lastDay = 'serve'; }
      out.push(clock(d) + '  ' + e.text);
    });
    return out.join('\n').trim();
  }

  var api = {
    DISHES: DISHES, HOT: HOT, MAIN: MAIN, PREHEAT: PREHEAT, REHEAT: REHEAT, DISH_UP: DISH_UP, CARVE: CARVE, CHECK_BEFORE: CHECK_BEFORE,
    copyDishes: copyDishes, toKg: toKg, estimateTurkeyMins: estimateTurkeyMins, thawHours: thawHours, tempText: tempText,
    build: build, at: at, clock: clock, dayLabel: dayLabel, sameDay: sameDay, fillTimes: fillTimes, parseServe: parseServe,
    toICS: toICS, toText: toText, fmtDur: fmtDur, shortTitle: shortTitle, peakOverlap: peakOverlap
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DinnerPlan = api;
})(this);
