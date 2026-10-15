// Page wiring for the Christmas dinner timer. The timings are in plan.js (window.DinnerPlan).
(function () {
  'use strict';
  var TIP_URL = ''; // payment link for the optional tip; the line stays hidden while empty
  var KEY = 'xmasdinner.v1';
  var P = window.DinnerPlan;
  var $ = function (id) { return document.getElementById(id); };
  var f = {
    date: $('f-date'), time: $('f-time'), main: $('f-main'), weight: $('f-weight'), unit: $('f-unit'), mainName: $('f-mainname'),
    mainTemp: $('f-maintemp'), cook: $('f-cook'), rest: $('f-rest'), frozen: $('f-frozen'), ovens: $('f-ovens'), rings: $('f-rings'),
    gap: $('f-gap'), addName: $('f-addname'), addWhere: $('f-addwhere'), addMins: $('f-addmins')
  };
  var dishes = P.copyDishes();
  var current = null; // { plan, serve }

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
  function num(v, lo, hi, d) {
    var n = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(n)) return d;
    return Math.min(hi, Math.max(lo, n));
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // "3:10", "3h10", "3 h 10 min", "190" -> minutes; '' -> 0; nonsense -> NaN
  function parseCook(s) {
    s = String(s || '').trim().toLowerCase();
    if (!s) return 0;
    var m = /^(\d{1,2})\s*(?::|h|hr|hrs|hours?)\s*(\d{1,2})?\s*(?:m|min|mins|minutes?)?$/.exec(s);
    if (m) { var mm = m[2] ? +m[2] : 0; return mm < 60 ? +m[1] * 60 + mm : NaN; }
    m = /^(\d{1,4})\s*(?:m|min|mins|minutes?)?$/.exec(s);
    if (m) return +m[1];
    return NaN;
  }
  function defaultDate() {
    var now = new Date();
    var y = now.getFullYear();
    if (now.getMonth() === 11 && now.getDate() > 25) y++;
    return y + '-12-25';
  }

  // ---------- storage (works without it) ----------
  function load() {
    try { var raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var o = {};
        Object.keys(f).forEach(function (k) { if (!/^add/.test(k)) o[k] = f[k].type === 'checkbox' ? f[k].checked : f[k].value; });
        o.dishes = dishes;
        window.localStorage.setItem(KEY, JSON.stringify(o));
      } catch (e) { /* storage blocked: the page still works */ }
    }, 250);
  }
  function restore() {
    var o = load();
    if (!o) return;
    Object.keys(f).forEach(function (k) {
      if (!(k in o) || /^add/.test(k)) return;
      if (f[k].type === 'checkbox') f[k].checked = !!o[k]; else f[k].value = o[k];
    });
    if (Array.isArray(o.dishes) && o.dishes.length) dishes = o.dishes.filter(function (d) { return d && Array.isArray(d.steps); });
  }

  // ---------- dish list ----------
  function lastStep(d) { return d.steps[d.steps.length - 1]; }
  function renderDishes() {
    var ul = $('dishes');
    clear(ul);
    dishes.forEach(function (d, i) {
      var st = lastStep(d);
      var cb = el('input', { type: 'checkbox', 'data-i': String(i), 'data-role': 'on' });
      cb.checked = !!d.on;
      var where = d.steps.length > 1 ? 'hob ' + d.steps[0].mins + ' min, then ' + st.where : st.where;
      var lab = el('label', { class: 'check' }, [cb, el('span', null, [d.name, el('span', { class: 'where', text: where === 'oven' ? 'oven' : where })])]);
      var mins = el('input', { type: 'number', inputmode: 'numeric', min: '1', max: '600', value: String(st.mins), 'aria-label': d.name + ': minutes', 'data-i': String(i), 'data-role': 'mins' });
      var li = el('li', { class: d.on ? '' : 'off' }, [lab, mins]);
      if (d.custom) li.appendChild(el('button', { type: 'button', class: 'ghost rm', 'data-i': String(i), 'data-role': 'rm', text: 'Remove ' + d.name }));
      ul.appendChild(li);
    });
    var pud = dishes.filter(function (d) { return d.dessert && d.on; }).length;
    $('pud-row').classList.toggle('hidden', !pud);
  }
  $('dishes').addEventListener('change', function (e) {
    var t = e.target, i = +t.getAttribute('data-i'), d = dishes[i];
    if (!d) return;
    if (t.getAttribute('data-role') === 'on') { d.on = t.checked; t.closest('li').className = d.on ? '' : 'off'; $('pud-row').classList.toggle('hidden', !dishes.some(function (x) { return x.dessert && x.on; })); }
    if (t.getAttribute('data-role') === 'mins') { var v = Math.round(num(t.value, 1, 600, lastStep(d).mins)); lastStep(d).mins = v; t.value = v; }
    update();
  });
  $('dishes').addEventListener('input', function (e) {
    var t = e.target;
    if (t.getAttribute('data-role') !== 'mins') return;
    var d = dishes[+t.getAttribute('data-i')], v = parseFloat(t.value);
    if (d && isFinite(v) && v >= 1 && v <= 600) { lastStep(d).mins = Math.round(v); update(); }
  });
  $('dishes').addEventListener('click', function (e) {
    var t = e.target;
    if (t.getAttribute('data-role') !== 'rm') return;
    dishes.splice(+t.getAttribute('data-i'), 1);
    renderDishes(); update();
  });
  $('b-add').addEventListener('click', function () {
    var name = f.addName.value.trim().slice(0, 40);
    if (!name) { f.addName.focus(); return; }
    var mins = Math.round(num(f.addMins.value, 1, 600, 30));
    var where = f.addWhere.value === 'hob' ? 'hob' : 'oven';
    dishes.push({ id: 'c' + Date.now(), name: name, on: true, custom: true, steps: [{ where: where, mins: mins, text: name + (where === 'oven' ? ' in' : ' on') }] });
    f.addName.value = '';
    renderDishes(); update();
  });
  $('b-reset').addEventListener('click', function () { dishes = P.copyDishes(); renderDishes(); update(); });

  // ---------- form visibility and estimate ----------
  function showFields() {
    var m = f.main.value;
    var turkey = m === 'turkey' || m === 'crown';
    document.querySelectorAll('.w-only').forEach(function (n) { n.classList.toggle('hidden', !turkey); });
    document.querySelectorAll('.o-only').forEach(function (n) { n.classList.toggle('hidden', m !== 'other'); });
    document.querySelectorAll('.m-only').forEach(function (n) { if (!n.classList.contains('w-only') || turkey) n.classList.toggle('hidden', m === 'none'); });
    $('cook-hint').textContent = m === 'other' ? '(needed: e.g. 1:30 or 90)' : '(optional: e.g. 3:10 or 190)';
  }

  // ---------- build and render ----------
  function readOpts() {
    var kg = P.toKg(num(f.weight.value, 0, 50, 0), f.unit.value);
    var cook = parseCook(f.cook.value);
    return {
      main: f.main.value, kg: kg, cookMins: isFinite(cook) ? cook : 0, cookBad: !isFinite(cook) || cook > 1440,
      mainName: f.mainName.value, mainTemp: f.mainTemp.value, frozen: f.frozen.checked,
      rest: +f.rest.value, ovens: +f.ovens.value, rings: Math.round(num(f.rings.value, 1, 8, 4)),
      dessertGap: Math.round(num(f.gap.value, 0, 180, 45)), dishes: dishes
    };
  }

  function update() {
    showFields();
    var o = readOpts();
    var est = $('est');
    var turkey = o.main === 'turkey' || o.main === 'crown';
    if (o.cookBad) est.textContent = 'Type the time as h:mm (3:10) or minutes (190).';
    else if (turkey && o.kg > 0) {
      var e = P.estimateTurkeyMins(o.kg);
      est.textContent = (o.cookMins > 0 ? 'Using the label: ' + P.fmtDur(o.cookMins) + '. ' : '') +
        'Rule-of-thumb estimate for ' + (Math.round(o.kg * 10) / 10) + ' kg: ' + P.fmtDur(e) + ' at ' + P.tempText(P.MAIN) + '.';
    } else est.textContent = '';
    var serve = P.parseServe(f.date.value || defaultDate(), f.time.value);
    if (!serve) { renderEmpty('Pick the day and the time you want to eat.'); save(); return; }
    var plan = P.build(o);
    current = { plan: plan, serve: serve };
    render(plan, serve, o);
    save();
  }

  function renderEmpty(msg) {
    current = null;
    $('summary').textContent = '';
    clear($('msgs'));
    var ul = $('plan'); clear(ul);
    ul.appendChild(el('li', { class: 'empty early', text: msg }));
  }

  function render(plan, serve, o) {
    var sum = $('summary'); clear(sum);
    var s = plan.summary;
    if (!plan.events.length) { renderEmpty('Tick at least one dish, or choose a roast.'); return; }
    var serveAt = P.at(serve, 0);
    var nm = o.main === 'crown' ? 'Turkey crown' : o.main === 'turkey' ? 'Turkey' : (o.mainName.trim() || 'Joint');
    if (s.mainIn != null) {
      sum.appendChild(document.createTextNode(nm.charAt(0).toUpperCase() + nm.slice(1) + ' in at '));
      sum.appendChild(el('b', { text: P.clock(P.at(serve, s.mainIn)) }));
      sum.appendChild(document.createTextNode(', out at '));
      sum.appendChild(el('b', { text: P.clock(P.at(serve, s.mainOut)) }));
      sum.appendChild(document.createTextNode(', eat at '));
    } else {
      sum.appendChild(document.createTextNode('First job at '));
      sum.appendChild(el('b', { text: P.clock(P.at(serve, s.start)) }));
      sum.appendChild(document.createTextNode(', eat at '));
    }
    sum.appendChild(el('b', { text: P.clock(serveAt) }));
    sum.appendChild(document.createTextNode(' on ' + P.dayLabel(serveAt) + '.'));

    var msgs = $('msgs'); clear(msgs);
    var w = plan.warnings.slice();
    if (o.cookBad) w.unshift('The cooking time isn’t clear, so the estimate is used. Type it as h:mm (3:10) or minutes (190).');
    if (s.mainIn != null && P.at(serve, s.mainIn - P.PREHEAT).getDate() !== serveAt.getDate()) w.push('That means switching the oven on the day before. Check the time you want to eat.');
    w.forEach(function (t) { msgs.appendChild(el('li', { text: P.fillTimes(t, serve) })); });

    var ul = $('plan'); clear(ul);
    var lastDay = null;
    plan.events.forEach(function (e, i) {
      var d = P.at(serve, e.t);
      if (!P.sameDay(d, serveAt)) {
        ul.appendChild(el('li', { class: 'early k-' + e.kind, 'data-i': String(i) }, [el('span', { class: 'x' }, [el('b', { text: P.dayLabel(d) + ', ' + P.clock(d) + ': ' }), e.text])]));
        return;
      }
      if (lastDay !== 'serve') { ul.appendChild(el('li', { class: 'day', text: P.dayLabel(serveAt) })); lastDay = 'serve'; }
      ul.appendChild(el('li', { class: 'k-' + e.kind, 'data-i': String(i) }, [el('span', { class: 't', text: P.clock(d) }), el('span', { class: 'x', text: e.text })]));
    });
    markNow();
  }

  // grey out what's past and highlight what's due, when the plan is for today
  function markNow() {
    if (!current) return;
    var now = Date.now();
    var items = $('plan').querySelectorAll('li[data-i]');
    var ev = current.plan.events, nextIdx = -1;
    for (var i = 0; i < ev.length; i++) if (P.at(current.serve, ev[i].t).getTime() > now - 60000) { nextIdx = i; break; }
    items.forEach(function (li) {
      var i = +li.getAttribute('data-i');
      var t = P.at(current.serve, ev[i].t).getTime();
      li.classList.toggle('done', t < now - 60000 && now - t < 36 * 3600e3);
      li.classList.toggle('now', i === nextIdx && t - now < 2 * 3600e3);
    });
  }
  setInterval(markNow, 30000);

  Object.keys(f).forEach(function (k) {
    if (/^add/.test(k)) return;
    f[k].addEventListener('input', update);
    f[k].addEventListener('change', update);
  });

  // ---------- outputs ----------
  $('b-print').addEventListener('click', function () { window.print(); });

  $('b-copy').addEventListener('click', function () {
    if (!current) return;
    var text = 'Christmas dinner time plan\n' + P.toText(current.plan, current.serve);
    var note = $('copy-note');
    function done() { note.textContent = 'Copied. Paste it into a note or the family group chat.'; }
    function fallback() {
      var ta = el('textarea', { 'aria-hidden': 'true' });
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { note.textContent = 'Copy didn’t work here; use Print instead.'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  });

  $('b-ics').addEventListener('click', function () {
    if (!current) return;
    var ics = P.toICS(current.plan, current.serve);
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'christmas-dinner-plan.ics' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    $('copy-note').textContent = 'Calendar file downloaded. Open it to add each step with an alert at its time.';
  });

  // ---------- kitchen mode ----------
  var kTimer = null, wake = null, beep = false, lastBeeped = -1, audio = null;
  function fmtCount(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
  }
  function tick() {
    if (!current) return;
    var now = new Date(), ev = current.plan.events, serve = current.serve;
    $('k-clock').textContent = 'Now ' + P.clock(now) + ' · eat at ' + P.clock(P.at(serve, 0));
    var idx = -1;
    for (var i = 0; i < ev.length; i++) if (P.at(serve, ev[i].t).getTime() > now.getTime() - 60000) { idx = i; break; }
    var then = $('k-then'); clear(then);
    if (idx < 0) { $('k-count').textContent = ''; $('k-next').textContent = 'All done. Enjoy your dinner!'; return; }
    var due = P.at(serve, ev[idx].t);
    var left = due.getTime() - now.getTime();
    $('k-count').textContent = left > 0 ? fmtCount(left) : 'Now';
    // every step due at the same minute shows together
    var last = idx;
    while (last + 1 < ev.length && ev[last + 1].t === ev[idx].t) last++;
    var nx = $('k-next'); clear(nx);
    nx.appendChild(document.createTextNode(P.clock(due)));
    ev.slice(idx, last + 1).forEach(function (e) { nx.appendChild(el('span', { class: 'kstep', text: e.text })); });
    ev.slice(last + 1, last + 5).forEach(function (e) { then.appendChild(el('li', { text: P.clock(P.at(serve, e.t)) + '  ' + e.text })); });
    if (beep && left <= 0 && lastBeeped !== idx) { lastBeeped = idx; playBeep(); }
  }
  function playBeep() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(function (d) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.25, audio.currentTime + d); g.gain.setValueAtTime(0, audio.currentTime + d + 0.2);
        o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.22);
      });
    } catch (e) { /* no audio */ }
  }
  function openKitchen() {
    if (!current) return;
    $('kitchen').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    lastBeeped = -1;
    tick(); kTimer = setInterval(tick, 1000);
    var note = $('k-wake');
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (w) { wake = w; note.textContent = 'The screen will stay on while this is open.'; },
        function () { note.textContent = 'Keep the screen on in your phone’s settings while you cook.'; });
    } else note.textContent = 'Keep the screen on in your phone’s settings while you cook.';
    $('b-kclose').focus();
  }
  function closeKitchen() {
    $('kitchen').classList.add('hidden');
    document.body.style.overflow = '';
    clearInterval(kTimer); kTimer = null;
    markNow();
    if (wake) { try { wake.release(); } catch (e) { /* ignore */ } wake = null; }
    $('b-kitchen').focus();
  }
  $('b-kitchen').addEventListener('click', openKitchen);
  $('b-kclose').addEventListener('click', closeKitchen);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('kitchen').classList.contains('hidden')) closeKitchen(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && kTimer && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; }, function () {});
  });
  $('b-beep').addEventListener('click', function () {
    beep = !beep;
    this.setAttribute('aria-pressed', String(beep));
    this.textContent = 'Beep at each step: ' + (beep ? 'on' : 'off');
    if (beep) playBeep(); // also unlocks audio on phones
  });

  // ---------- start ----------
  if (TIP_URL) { $('tip-link').href = TIP_URL; $('tip').style.display = 'block'; }
  f.date.value = defaultDate();
  restore();
  // a date saved last year (or a typo) falls back to this Christmas
  var sd = P.parseServe(f.date.value, '12:00');
  if (!sd || P.at(sd, 0).getTime() < Date.now() - 2 * 864e5) f.date.value = defaultDate();
  renderDishes();
  update();

  window.__dinner = { parseCook: parseCook, current: function () { return current; } }; // for tests
})();
