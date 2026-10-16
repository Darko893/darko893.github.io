// Page wiring for the oil tank calculator. The sums are in tank.js.
(function () {
  'use strict';
  var TIP_URL = ''; // payment link for the optional tip; the line stays hidden while empty
  var KEY = 'oiltank.v1';
  var T = window.Tank;
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['f-cap', 'f-capunit', 'f-height', 'f-hunit', 'f-points', 'f-kind', 'f-val', 'f-date', 'f-annual', 'f-src',
    'f-reserve', 'f-lead', 'f-fill', 'f-min', 'f-price', 'f-outlet', 'f-step'];
  var DEFAULTS = {};
  var log = [];

  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(KEY) || 'null');
      localStorage.setItem(KEY, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function shape() { var c = document.querySelector('input[name=shape]:checked'); return c ? c.value : 'hcyl'; }
  function num(id) { var v = $(id).value.trim(); return v === '' ? NaN : parseFloat(v); }
  function inches() { return $('f-hunit').value === 'in'; }
  function gallons() { return $('f-capunit').value === 'gal'; }
  function lenUnit() { return inches() ? 'in' : 'cm'; }
  function toCm(x) { return inches() ? x * T.CM_PER_INCH : x; }
  function fromCm(x) { return inches() ? x / T.CM_PER_INCH : x; }
  function fmt(n) { return Math.round(n).toLocaleString('en-GB'); }
  function L(n) {
    return fmt(n) + ' litres' + (gallons() ? ' (' + fmt(n / T.L_PER_GALLON) + ' gal)' : '');
  }
  function oneDp(x) { return (Math.round(x * 10) / 10).toLocaleString('en-GB'); }

  function tank() {
    var s = shape();
    if (s === 'chart') {
      var pts = T.parsePoints($('f-points').value).map(function (p) {
        return [toCm(p[0]), gallons() ? p[1] * T.L_PER_GALLON : p[1]];
      });
      return { shape: s, points: pts };
    }
    var cap = num('f-cap');
    return { shape: s, capacity: gallons() ? cap * T.L_PER_GALLON : cap, height: toCm(num('f-height')) };
  }

  function readingLitres(t) {
    var kind = $('f-kind').value, v = num('f-val');
    if (!isFinite(v) || v < 0 || T.tankError(t)) return NaN;
    var cap = T.capacityOf(t);
    if (kind === 'percent') return cap * Math.min(v, 100) / 100;
    if (kind === 'litres') return Math.min(gallons() ? v * T.L_PER_GALLON : v, cap);
    return T.litresAt(t, Math.min(toCm(v), T.heightOf(t)));
  }

  function save() {
    var o = { shape: shape(), log: log };
    FIELDS.forEach(function (id) { o[id] = $(id).value; });
    store(false, o);
  }

  function li(k, v, small, cls) {
    var el = document.createElement('li');
    if (cls) el.className = cls;
    var a = document.createElement('span'); a.className = 'k'; a.textContent = k;
    var b = document.createElement('span'); b.className = 'v'; b.textContent = v;
    if (small) { var s = document.createElement('small'); s.textContent = small; b.appendChild(s); }
    el.appendChild(a); el.appendChild(b);
    return el;
  }

  function renderLog() {
    var ul = $('log');
    ul.textContent = '';
    var sorted = log.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    sorted.forEach(function (r) {
      var el = document.createElement('li');
      var s = document.createElement('span');
      s.textContent = T.niceDate(T.dayNum(r.date), true) + ': ' + L(r.litres);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost small'; b.textContent = 'Remove';
      b.setAttribute('aria-label', 'Remove reading for ' + T.niceDate(T.dayNum(r.date), true));
      b.addEventListener('click', function () { log = log.filter(function (x) { return x !== r; }); update(); });
      el.appendChild(s); el.appendChild(b);
      ul.appendChild(el);
    });
  }

  function update() {
    var s = shape();
    $('chartbox').classList.toggle('hidden', s !== 'chart');
    $('dims').classList.toggle('hidden', s === 'chart');
    var kind = $('f-kind').value;
    $('l-val').textContent = kind === 'percent' ? 'Gauge reading (%)' : kind === 'litres' ? (gallons() ? 'Gallons in the tank' : 'Litres in the tank') : 'Depth of oil (' + lenUnit() + ')';
    renderLog();

    var t = tank();
    var rate = $('f-src').value === 'auto' ? T.rateFromReadings(log) : null;
    var annual = rate ? rate.annual : num('f-annual');
    var r = T.work({
      tank: t,
      reading: { kind: kind, value: kind === 'depth' ? toCm(num('f-val')) : kind === 'litres' && gallons() ? num('f-val') * T.L_PER_GALLON : num('f-val') },
      today: $('f-date').value,
      annual: annual,
      outlet: toCm(num('f-outlet') || 0),
      reservePct: num('f-reserve'),
      leadDays: num('f-lead'),
      fillPct: isFinite(num('f-fill')) ? num('f-fill') : 90,
      minOrder: num('f-min'),
      price: num('f-price')
    });

    var msgs = $('msgs'), facts = $('facts');
    msgs.textContent = ''; facts.textContent = '';
    function msg(text) { var el = document.createElement('li'); el.textContent = text; msgs.appendChild(el); }

    if (r.error) {
      msg(r.error);
      $('bigbox').classList.add('hidden');
      $('months-box').classList.add('hidden');
    } else {
      $('bigbox').classList.remove('hidden');
      r.warn.forEach(msg);
      var pct = Math.max(0, Math.min(100, r.pct));
      $('g-fill').style.height = pct + '%';
      $('g-pct').textContent = Math.round(pct) + '%';
      $('headline').textContent = 'About ' + L(r.litres) + ' left';
      $('sub').textContent = Math.round(pct) + '% of a ' + fmt(r.capacity) + ' litre tank' +
        (kind !== 'depth' ? ' · oil about ' + oneDp(fromCm(r.depth)) + ' ' + lenUnit() + ' deep' : '');

      if (rate) {
        facts.appendChild(li('Your usage', oneDp(rate.perDay) + ' litres a day',
          'From your readings ' + T.niceDate(T.dayNum(rate.from)) + ' to ' + T.niceDate(T.dayNum(rate.to)) + ': ' + fmt(rate.used) + ' L in ' + rate.days + ' days. That pace is about ' + fmt(rate.annual) + ' L a year.'));
        if (rate.short) msg('Your two latest readings are less than a week apart, so the rate is rough. A reading every week or two is steadier.');
      } else if ($('f-src').value === 'auto' && log.length > 1) {
        msg('Your readings don’t show a fall in level yet (a delivery in between is skipped), so the litres a year figure is used.');
      }

      if (r.noUsage) {
        msg('Enter how many litres you use a year to see how long it will last.');
        $('months-box').classList.add('hidden');
      } else if (r.lastsBeyond) {
        facts.appendChild(li('Lasts', 'More than three years at this rate', '', 'okay'));
        $('months-box').classList.add('hidden');
      } else {
        var days = Math.floor(r.daysLeft);
        facts.appendChild(li('Runs out', r.usable <= 0 ? 'Now' : 'About ' + T.niceDate(T.dayNum(r.emptyDay), true),
          r.usable <= 0 ? 'The level is at or below the outlet.' : days + ' day' + (days === 1 ? '' : 's') + ' from the reading. Using about ' + oneDp(r.perDayNow) + ' L a day now, more in deep winter.',
          days < 14 ? 'alert' : ''));
        facts.appendChild(li('Order by', r.orderNow ? 'Now' : T.niceDate(T.dayNum(r.orderBy), true),
          r.orderNow ? (r.litres <= r.reserve ? 'It’s already below ' + fmt(r.reserve) + ' L, the level you order at.' : 'Delivery takes ' + r.lead + ' days and it runs out before then.') :
            'When it’s down to about ' + fmt(r.reserve) + ' L (about ' + oneDp(fromCm(T.depthFor(t, r.reserve))) + ' ' + lenUnit() + ' on the dipstick), leaving ' + r.lead + ' days for delivery.',
          r.orderNow ? 'alert' : 'okay'));
        var tb = $('months').tBodies[0];
        tb.textContent = '';
        r.months.forEach(function (m) {
          var tr = document.createElement('tr');
          var a = document.createElement('td'); a.textContent = T.niceDate(T.dayNum(m.date), true);
          var b = document.createElement('td'); b.className = 'n'; b.textContent = fmt(m.litres);
          var c = document.createElement('td'); var bar = document.createElement('span'); bar.className = 'bar';
          bar.style.width = Math.max(0, Math.min(100, m.litres / r.capacity * 100)) + '%';
          c.appendChild(bar);
          tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
          tb.appendChild(tr);
        });
        $('months-box').classList.toggle('hidden', !r.months.length);
      }
      var orderText = r.order > 0 ? fmt(r.order) + ' litres' : 'Nothing yet';
      var orderSmall = r.order > 0 ? 'Fills it to about ' + fmt(r.litres + r.order) + ' L (you said your supplier fills to ' + fmt(r.fillTo) + ' L), rounded down to 50 L.' : 'It’s already near the level your supplier fills to.';
      if (r.belowMin) orderSmall += ' That’s under your minimum order of ' + fmt(r.minOrder) + ' L, so wait a little longer.';
      if (r.cost) orderSmall += ' At ' + oneDp(r.price) + 'p a litre: about £' + fmt(r.cost) + ' (check whether the price includes VAT).';
      facts.appendChild(li('To fill up', orderText, orderSmall));
      if (r.dead > 0.5) facts.appendChild(li('Can’t be used', 'About ' + fmt(r.dead) + ' L', 'The oil below the outlet pipe, which is also where sludge settles.'));
    }

    // dipstick chart
    var dip = $('dip'); dip.textContent = '';
    var err = T.tankError(t);
    if (err) { $('dip-note').textContent = 'Fill in your tank to see its chart.'; }
    else {
      var step = toCm(+$('f-step').value);
      var rows = T.chart(t, step);
      var u = lenUnit();
      $('dip-note').textContent = (s === 'hcyl' ? 'Round or oval tank lying down' : s === 'rect' ? 'Flat-sided tank' : s === 'vcyl' ? 'Round tank standing up' : 'From your chart') +
        ', ' + fmt(T.capacityOf(t)) + ' L, ' + oneDp(fromCm(T.heightOf(t))) + ' ' + u + ' inside height. Depth of oil on the dipstick → litres in the tank.' +
        (r.reserve > 0 ? ' Order when it reads about ' + oneDp(fromCm(T.depthFor(t, r.reserve))) + ' ' + u + ' (' + fmt(r.reserve) + ' L).' : '');
      $('print-title').textContent = 'Dipstick chart: ' + fmt(T.capacityOf(t)) + ' litre tank';
      var per = Math.ceil(rows.length / 3), tbl, body;
      rows.forEach(function (row, i) {
        if (i % per === 0) {
          tbl = document.createElement('table');
          var th = document.createElement('thead');
          th.innerHTML = '<tr><th>' + u + '</th><th class="n">litres</th></tr>';
          tbl.appendChild(th);
          body = document.createElement('tbody'); tbl.appendChild(body);
          dip.appendChild(tbl);
        }
        var tr = document.createElement('tr');
        var a = document.createElement('td'); a.textContent = oneDp(fromCm(row[0]));
        var b = document.createElement('td'); b.className = 'n'; b.textContent = fmt(row[1]);
        tr.appendChild(a); tr.appendChild(b); body.appendChild(tr);
      });
    }
    save();
  }

  function load() {
    FIELDS.forEach(function (id) { DEFAULTS[id] = $(id).value; });
    DEFAULTS['f-date'] = todayStr();
    var o = store(true);
    if (o) {
      FIELDS.forEach(function (id) { if (typeof o[id] === 'string' && id !== 'f-date') $(id).value = o[id]; });
      var r = document.querySelector('input[name=shape][value="' + o.shape + '"]');
      if (r) r.checked = true;
      if (Array.isArray(o.log)) log = o.log.filter(function (x) { return x && isFinite(T.dayNum(x.date)) && isFinite(x.litres); });
    }
    $('f-date').value = todayStr();
  }

  document.addEventListener('input', update);
  document.addEventListener('change', update);
  $('b-log').addEventListener('click', function () {
    var t = tank(), litres = readingLitres(t), d = $('f-date').value;
    if (!isFinite(litres) || !isFinite(T.dayNum(d))) return;
    log = log.filter(function (x) { return x.date !== d; });
    log.push({ date: d, litres: Math.round(litres * 10) / 10 });
    log.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (log.length > 60) log = log.slice(-60);
    update();
    $('b-log').textContent = 'Saved';
    setTimeout(function () { $('b-log').textContent = 'Save to my readings'; }, 1500);
  });
  $('b-reset').addEventListener('click', function () {
    if (log.length && !window.confirm('Clear the form and your saved readings?')) return;
    FIELDS.forEach(function (id) { $(id).value = DEFAULTS[id]; });
    document.querySelector('input[name=shape][value=hcyl]').checked = true;
    log = [];
    update();
  });
  $('b-print').addEventListener('click', function () { window.print(); });
  if (TIP_URL) { $('tip-link').href = TIP_URL; $('tip').style.display = 'block'; }
  load();
  update();
})();
