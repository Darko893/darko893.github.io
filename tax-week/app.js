/* Page behaviour for the tax week calculator. Needs taxweek.js. */
(function () {
  'use strict';
  var T = window.TaxWeek;
  var $ = function (id) { return document.getElementById(id); };
  var FIRST_YEAR = 2024, LAST_YEAR = 2029; // payroll calendar range (2024/25 to 2029/30)

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  var long = function (n) { return T.fmt(n, { day: true }); };
  var short = function (n) { return T.fmt(n, { short: true }); };
  function range(r) {
    if (r.start === r.end) return short(r.start);
    var a = T.ymd(r.start), b = T.ymd(r.end);
    return T.fmt(r.start, { short: true, noYear: a.y === b.y }) + ' to ' + short(r.end);
  }
  function daysAway(n, today) {
    var d = n - today;
    return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 0 ? 'in ' + d + ' days' : (-d) + ' days ago';
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  var today = T.todayLocal();

  /* ---------- today ---------- */
  function statsHtml(i) {
    return '<div class="stat"><span>Tax week</span><b>' + i.week + '</b><small>' + range(i.weekRange) + '</small></div>' +
      '<div class="stat"><span>Tax month</span><b>' + i.month + '</b><small>' + range(i.monthRange) + '</small></div>' +
      '<div class="stat"><span>Tax year</span><b>' + i.label + '</b><small>' + range({ start: i.yearStart, end: i.yearEnd }) + '</small></div>';
  }
  function extraHtml(i) {
    var left = i.yearEnd - i.date;
    var s = 'Day ' + i.dayOfYear + ' of ' + i.daysInYear + ' in the tax year. ';
    s += left === 0 ? 'This is the last day of the tax year. ' : plural(left, 'day') + ' until the tax year ends on ' + long(i.yearEnd) + '. ';
    if (i.week === 53) s += '<br><strong>This is week 53</strong>, the leftover ' + (i.weekRange.end > i.weekRange.start ? 'days' : 'day') + ' at the end of the tax year. A weekly payday on this date is a week 53 payment (week 54 if fortnightly, week 56 if four-weekly). ';
    return s;
  }
  function renderToday() {
    var i = T.info(today);
    $('today-date').textContent = long(today);
    $('today-stats').innerHTML = statsHtml(i);
    $('today-extra').innerHTML = extraHtml(i);
    document.title = 'Tax Week Calculator UK: What Tax Week Is It Today? (' + i.label + ')';
  }

  /* ---------- check a date ---------- */
  function renderCheck(n) {
    var out = $('check-result');
    if (n === null) { out.innerHTML = '<p class="err">Enter a full date, for example 14/10/2026.</p>'; return; }
    var i = T.info(n), d = T.monthDeadlines(i.taxYear, i.month);
    var holiday = T.isBankHoliday(n) ? ' (an England and Wales bank holiday)' : '';
    out.innerHTML = '<p class="today-date">' + long(n) + holiday + '</p>' +
      '<div class="big">' + statsHtml(i) + '</div>' +
      '<p>' + extraHtml(i) + '</p>' +
      '<p>PAYE for tax month ' + i.month + ' is due ' + paidBy(d) + '. EPS for that month: by ' + long(d.eps) + '.</p>';
  }
  function paidBy(d) {
    var s = 'by <strong>' + long(d.payeElectronic) + '</strong> electronically';
    if (d.payeElectronic !== d.payeNominal) s += ' <span class="moved">(moved back from ' + long(d.payeNominal) + (T.isBankHoliday(d.payeNominal) ? ', a bank holiday' : '') + ')</span>';
    return s + ', or by ' + long(d.cheque) + ' by cheque';
  }
  function reason(n) {
    var w = T.weekday(n);
    return w === 0 || w === 6 ? 'a ' + T.DAYS[w] : 'a bank holiday';
  }
  function readHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return T.parseISO(h);
  }
  function setDate(n, push) {
    $('date').value = T.iso(n);
    renderCheck(n);
    if (push && history.replaceState) history.replaceState(null, '', '#' + T.iso(n));
  }

  /* ---------- deadlines ---------- */
  function renderDeadlines() {
    var items = [];
    var m = T.nextMonthlyPayment(today);
    items.push({ date: m.payeElectronic, html: 'PAYE and NICs for tax month ' + m.month + ' (' + range(m) + '), monthly payers, electronic' +
      (m.payeElectronic !== m.payeNominal ? ' <span class="moved">(the 22nd is ' + reason(m.payeNominal) + ', so it moves back)</span>' : '') });
    var e = T.nextEps(today);
    items.push({ date: e.eps, html: 'EPS for tax month ' + e.month + ' (' + range(e) + ')' });
    var q = T.nextQuarterly(today);
    if (q) items.push({ date: q.payeElectronic, html: 'PAYE for quarter ' + q.quarter + ' (' + range(q) + '), quarterly payers, electronic' +
      (q.payeElectronic !== q.payeNominal ? ' <span class="moved">(moved from the 22nd)</span>' : '') });
    var Y = T.taxYearOf(today);
    T.yearEndDeadlines(Y - 1).concat(T.yearEndDeadlines(Y)).forEach(function (x) {
      if (x.date >= today && x.date - today <= 200) items.push({ date: x.date, html: esc(x.what) });
    });
    items.sort(function (a, b) { return a.date - b.date; });
    $('deadline-list').innerHTML = items.map(function (x) {
      return '<li><span>' + x.html + '</span><span><span class="when">' + long(x.date) + '</span> <span class="left">' + daysAway(x.date, today) + '</span></span></li>';
    }).join('');
  }

  /* ---------- week 53 checker ---------- */
  function yearOptions(sel, from, to, selected) {
    var h = '';
    for (var y = from; y <= to; y++) h += '<option value="' + y + '"' + (y === selected ? ' selected' : '') + '>' + T.yearLabel(y) + '</option>';
    sel.innerHTML = h;
  }
  function renderPaydays() {
    var n = T.parseISO($('pd').value), step = +$('freq').value, Y = +$('pdyear').value, out = $('pd-result');
    if (n === null) { out.innerHTML = '<p class="err">Enter one of your paydays (any year).</p>'; return; }
    var r = T.paydays(n, step, Y), w53 = T.week53(Y);
    var s = '<p>Paying ' + r.frequency + ' on ' + T.DAYS[T.weekday(n)] + 's' + (step > 7 ? ' (in step with ' + short(n) + ')' : '') +
      ', tax year ' + T.yearLabel(Y) + ' has <strong>' + r.count + ' paydays</strong>.</p>';
    if (r.hasExtra) {
      var last = r.list[r.list.length - 1];
      s += '<p class="note"><strong>Yes, there is an extra payday:</strong> ' + long(last.date) + ' falls in tax week 53, so it is reported as <strong>week ' + r.extraLabel + '</strong>. ' +
        'Tax on it is worked out on a non-cumulative basis (week ' + (step / 7) + ' free pay). Warn employees that this can leave a small underpayment.</p>';
    } else {
      s += '<p>No week ' + r.extraLabel + ' this year. Week 53 is ' + range(w53) + ', and no payday falls on ' + (w53.end > w53.start ? 'those days' : 'that day') + '.</p>';
    }
    s += '<details><summary>List all ' + r.count + ' paydays</summary><div class="tablewrap"><table><thead><tr><th>#</th><th>Payday</th><th>Tax week</th><th>Tax month</th></tr></thead><tbody>' +
      r.list.map(function (p, k) {
        return '<tr' + (p.extra ? ' class="w53"' : '') + '><td>' + (k + 1) + '</td><td>' + long(p.date) + '</td><td>' + (p.extra ? '53 (report as ' + r.extraLabel + ')' : p.week) + '</td><td>' + p.month + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
    out.innerHTML = s;
  }

  /* ---------- payroll calendar ---------- */
  var view = 'month';
  var dayDate = function (n) { return T.fmt(n, { day: true, short: true, noYear: true }); };
  // Each row has cells for the screen and cells for the CSV download.
  function calendarRows(Y) {
    if (view === 'month') {
      return {
        head: ['Month', 'Period', 'PAYE due', 'EPS by', 'Cheque by', 'Tax weeks'],
        csvHead: ['Tax month', 'From', 'To', 'PAYE due (electronic)', 'EPS by', 'Cheque by', 'Tax weeks'],
        rows: T.monthlyCalendar(Y).map(function (d) {
          var moved = d.payeElectronic !== d.payeNominal, weeks = d.firstWeek + ' to ' + d.lastWeek;
          return {
            hl: today >= d.start && today <= d.end,
            show: [d.month, T.fmt(d.start, { short: true, noYear: true }) + ' to ' + T.fmt(d.end, { short: true, noYear: true }), (moved ? '<span class="moved">' : '') + dayDate(d.payeElectronic) + (moved ? '</span>' : ''), dayDate(d.eps), dayDate(d.cheque), weeks],
            csv: [d.month, T.iso(d.start), T.iso(d.end), T.iso(d.payeElectronic), T.iso(d.eps), T.iso(d.cheque), weeks]
          };
        })
      };
    }
    return {
      head: ['Week', 'From', 'To', 'Tax month'],
      csvHead: ['Tax week', 'From', 'To', 'Tax month'],
      rows: T.weeklyCalendar(Y).map(function (w) {
        var m = w.month === w.monthEnd ? w.month : w.month + ' / ' + w.monthEnd;
        return {
          hl: today >= w.start && today <= w.end, w53: w.week === 53,
          show: [w.week, T.fmt(w.start, { day: true, short: true }), T.fmt(w.end, { day: true, short: true }), m],
          csv: [w.week, T.iso(w.start), T.iso(w.end), m]
        };
      })
    };
  }
  function renderCalendar() {
    var Y = +$('calyear').value, c = calendarRows(Y);
    var w53 = T.week53(Y);
    $('cal-caption').innerHTML = 'Tax year ' + T.yearLabel(Y) + ': ' + range({ start: T.yearStart(Y), end: T.yearEnd(Y) }) + '. Week 53 is ' +
      range(w53) + ' (' + (w53.end > w53.start ? T.DAYS[T.weekday(w53.start)] + ' and ' : '') + T.DAYS[T.weekday(w53.end)] + '): weekly payrolls paying on ' +
      (w53.end > w53.start ? 'either of those days' : 'a ' + T.DAYS[T.weekday(w53.end)]) + ' have 53 paydays.' +
      (view === 'month' ? ' PAYE due dates are for electronic payment; dates in orange were moved back from the 22nd.' : '');
    var h = '<thead><tr>' + c.head.map(function (x) { return '<th scope="col">' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    c.rows.forEach(function (r) {
      h += '<tr class="' + (r.hl ? 'hl' : '') + (r.w53 ? ' w53' : '') + '">' + r.show.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>';
    });
    $('cal-table').innerHTML = h + '</tbody>';
  }
  function setView(v) {
    view = v;
    $('view-month').setAttribute('aria-pressed', v === 'month');
    $('view-week').setAttribute('aria-pressed', v === 'week');
    renderCalendar();
  }
  function downloadCsv() {
    var Y = +$('calyear').value, c = calendarRows(Y);
    var lines = [c.csvHead.join(',')].concat(c.rows.map(function (r) {
      return r.csv.map(function (v) { return /^\d{4}-\d\d-\d\d$/.test(v) ? v : '"' + String(v) + '"'; }).join(',');
    }));
    var blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tax-' + (view === 'month' ? 'months' : 'weeks') + '-' + T.yearLabel(Y).replace('/', '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- formulas ---------- */
  function copyText(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copy this:', text); }
      ta.remove();
    }
  }
  function renderFormulas() {
    $('formula-list').innerHTML = T.FORMULAS.map(function (f, k) {
      return '<div class="f"><strong>' + esc(f.name) + '</strong><code id="f-' + f.key + '">' + esc(f.f) + '</code>' +
        '<button type="button" class="ghost" data-k="' + k + '">Copy</button></div>';
    }).join('');
    $('formula-list').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-k]');
      if (b) copyText(T.FORMULAS[+b.getAttribute('data-k')].f, b);
    });
  }
  function bankHolidayText() {
    var out = [];
    for (var y = 2024; y <= 2031; y++) T.bankHolidays(y).forEach(function (n) { out.push(T.iso(n)); });
    return out.join('\n');
  }

  /* ---------- wire up ---------- */
  renderToday();
  renderDeadlines();
  var thisYear = T.taxYearOf(today);
  var calDefault = Math.min(LAST_YEAR, Math.max(FIRST_YEAR, thisYear));
  yearOptions($('calyear'), FIRST_YEAR, LAST_YEAR, calDefault);
  yearOptions($('pdyear'), FIRST_YEAR, LAST_YEAR, calDefault);
  renderCalendar();
  renderFormulas();

  setDate(readHash() !== null ? readHash() : today, false);
  $('date').addEventListener('change', function () {
    var n = T.parseISO(this.value);
    if (n === null) renderCheck(null); else setDate(n, true);
  });
  window.addEventListener('hashchange', function () { var n = readHash(); if (n !== null) setDate(n, false); });
  $('share').addEventListener('click', function () {
    var n = T.parseISO($('date').value);
    if (n === null) return;
    copyText(location.href.split('#')[0] + '#' + T.iso(n), this);
  });

  $('pd').value = T.iso(T.yearStart(calDefault) + (5 - T.weekday(T.yearStart(calDefault)) + 7) % 7); // first Friday
  ['pd', 'freq', 'pdyear'].forEach(function (id) { $(id).addEventListener('change', renderPaydays); $(id).addEventListener('input', renderPaydays); });
  renderPaydays();

  $('calyear').addEventListener('change', renderCalendar);
  $('view-month').addEventListener('click', function () { setView('month'); });
  $('view-week').addEventListener('click', function () { setView('week'); });
  $('csv').addEventListener('click', downloadCsv);
  $('print').addEventListener('click', function () { window.print(); });
  $('copy-bh').addEventListener('click', function () { copyText(bankHolidayText(), this); });
})();
