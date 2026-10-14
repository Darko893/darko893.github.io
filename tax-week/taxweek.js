/* UK tax week / tax month / payroll deadline maths. Plain JS, no dependencies.
   Dates are handled as whole day numbers (days since 1 Jan 1970, UTC) so that
   clock changes and time zones can never shift a date. */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function dn(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function ymd(n) {
    var t = new Date(n * DAY);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function weekday(n) { return ((n % 7) + 11) % 7; } // 0 = Sunday (1 Jan 1970 was a Thursday)
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function iso(n) { var p = ymd(n); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }

  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null;
    var n = dn(y, mo, d), p = ymd(n);
    return (p.m === mo && p.d === d) ? n : null;
  }
  function todayLocal(now) {
    now = now || new Date();
    return dn(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function fmt(n, opts) {
    var p = ymd(n), s = p.d + ' ' + MONTHS[p.m - 1].slice(0, opts && opts.short ? 3 : 99);
    if (!(opts && opts.noYear)) s += ' ' + p.y;
    if (opts && opts.day) s = DAYS[weekday(n)].slice(0, opts.short ? 3 : 99) + ' ' + s;
    return s;
  }

  /* ---------- tax year, week, month ---------- */
  function taxYearOf(n) { var p = ymd(n); return n < dn(p.y, 4, 6) ? p.y - 1 : p.y; }
  function yearStart(Y) { return dn(Y, 4, 6); }
  function yearEnd(Y) { return dn(Y + 1, 4, 5); }
  function yearLabel(Y) { return Y + '/' + pad((Y + 1) % 100); }

  function weekRange(Y, w) {
    var s = yearStart(Y) + 7 * (w - 1);
    return { start: s, end: Math.min(s + 6, yearEnd(Y)) };
  }
  // Tax month n runs from the 6th of calendar month (n+3) to the 5th of the next month.
  function monthRange(Y, n) { return { start: dn(Y, n + 3, 6), end: dn(Y, n + 4, 5) }; }

  function info(n) {
    var Y = taxYearOf(n), start = yearStart(Y);
    var week = Math.floor((n - start) / 7) + 1;
    var p = ymd(n);
    var month = ((p.m - 4 - (p.d < 6 ? 1 : 0)) % 12 + 12) % 12 + 1;
    return {
      date: n, taxYear: Y, label: yearLabel(Y),
      yearStart: start, yearEnd: yearEnd(Y),
      dayOfYear: n - start + 1, daysInYear: yearEnd(Y) - start + 1,
      week: week, weekRange: weekRange(Y, week),
      month: month, monthRange: monthRange(Y, month)
    };
  }
  // Week 53 is the 1 day (or 2 days when the tax year contains 29 February) after week 52.
  function week53(Y) { return weekRange(Y, 53); }

  /* ---------- England & Wales bank holidays ---------- */
  function easterSunday(y) { // anonymous Gregorian algorithm
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return dn(y, month, day);
  }
  function firstMonday(y, m) { var n = dn(y, m, 1); return n + (8 - weekday(n)) % 7; }
  function lastMonday(y, m) { var n = dn(y, m + 1, 1) - 1; return n - (weekday(n) + 6) % 7; }

  // One-off changes made by royal proclamation (moved or extra days).
  var SPECIAL = {
    2020: { drop: ['2020-05-04'], add: ['2020-05-08'] },
    2022: { drop: ['2022-05-30'], add: ['2022-06-02', '2022-06-03', '2022-09-19'] },
    2023: { drop: [], add: ['2023-05-08'] }
  };

  var bhCache = {};
  function bankHolidays(y) {
    if (bhCache[y]) return bhCache[y];
    var list = [];
    var ny = dn(y, 1, 1), wd = weekday(ny);
    list.push(wd === 6 ? ny + 2 : wd === 0 ? ny + 1 : ny);
    var e = easterSunday(y);
    list.push(e - 2, e + 1, firstMonday(y, 5), lastMonday(y, 5), lastMonday(y, 8));
    var xmas = dn(y, 12, 25), xw = weekday(xmas);
    if (xw === 5) list.push(xmas, xmas + 3);          // Fri: Boxing Day moves to Monday
    else if (xw === 6) list.push(xmas + 2, xmas + 3); // Sat: Mon and Tue
    else if (xw === 0) list.push(xmas + 1, xmas + 2); // Sun: Mon and Tue
    else list.push(xmas, xmas + 1);
    var sp = SPECIAL[y];
    if (sp) {
      var drop = sp.drop.map(parseISO);
      list = list.filter(function (x) { return drop.indexOf(x) < 0; }).concat(sp.add.map(parseISO));
    }
    list.sort(function (a, b) { return a - b; });
    bhCache[y] = list;
    return list;
  }
  function isBankHoliday(n) { return bankHolidays(ymd(n).y).indexOf(n) >= 0; }
  function isWorkingDay(n) { var w = weekday(n); return w !== 0 && w !== 6 && !isBankHoliday(n); }
  function onOrBeforeWorkingDay(n) { while (!isWorkingDay(n)) n--; return n; }

  /* ---------- deadlines ---------- */
  // PAYE for tax month n of tax year Y: electronic payment by the 22nd of the month after
  // the tax month ends; cheque by post by the 19th. EPS by the 19th of the same month.
  function monthDeadlines(Y, n) {
    var r = monthRange(Y, n), e = ymd(r.end);
    var nominal = dn(e.y, e.m, 22);
    return {
      taxYear: Y, month: n, start: r.start, end: r.end,
      payeNominal: nominal,
      payeElectronic: onOrBeforeWorkingDay(nominal),
      cheque: onOrBeforeWorkingDay(dn(e.y, e.m, 19)),
      eps: dn(e.y, e.m, 19)
    };
  }
  // Quarterly payers: quarters end 5 July, 5 October, 5 January, 5 April.
  function quarterDeadlines(Y, q) {
    var last = monthDeadlines(Y, q * 3);
    return { taxYear: Y, quarter: q, start: monthRange(Y, q * 3 - 2).start, end: last.end,
      payeNominal: last.payeNominal, payeElectronic: last.payeElectronic, cheque: last.cheque };
  }
  function nextMonthlyPayment(today) {
    var i = info(today), Y = i.taxYear, n = i.month - 1;
    for (var k = 0; k < 3; k++) {
      if (n < 1) { Y--; n = 12; }
      var d = monthDeadlines(Y, n);
      if (d.payeElectronic >= today) return d;
      n++; if (n > 12) { n = 1; Y++; }
    }
    return monthDeadlines(Y, n);
  }
  function nextEps(today) {
    var i = info(today), Y = i.taxYear, n = i.month - 1;
    if (n < 1) { Y--; n = 12; }
    var d = monthDeadlines(Y, n);
    if (d.eps >= today) return d;
    return monthDeadlines(i.taxYear, i.month);
  }
  function nextQuarterly(today) {
    var Y = taxYearOf(today) - 1;
    for (var k = 0; k < 12; k++) {
      var q = (k % 4) + 1, y = Y + Math.floor(k / 4);
      var d = quarterDeadlines(y, q);
      if (d.payeElectronic >= today) return d;
    }
    return null;
  }
  // Year-end deadlines for tax year Y (all fall after 5 April Y+1).
  function yearEndDeadlines(Y) {
    var c1a = dn(Y + 1, 7, 22);
    return [
      { key: 'finalfps', date: dn(Y + 1, 4, 19), what: 'Final FPS or EPS for ' + yearLabel(Y) + ' (final FPS is normally sent on or before the last payday)' },
      { key: 'p60', date: dn(Y + 1, 5, 31), what: 'P60s to employees for ' + yearLabel(Y) },
      { key: 'p11d', date: dn(Y + 1, 7, 6), what: 'P11D and P11D(b) for ' + yearLabel(Y) },
      { key: 'class1a', date: onOrBeforeWorkingDay(c1a), nominal: c1a, what: 'Class 1A NICs for ' + yearLabel(Y) + ' (electronic; 19 July by cheque)' }
    ];
  }

  /* ---------- paydays and week 53 / 54 / 56 ---------- */
  var FREQ = { 7: { name: 'weekly', extra: 53 }, 14: { name: 'fortnightly', extra: 54 }, 28: { name: 'four-weekly', extra: 56 } };
  function paydays(anyPayday, step, Y) {
    var s = yearStart(Y), e = yearEnd(Y);
    var k = Math.ceil((s - anyPayday) / step), first = anyPayday + k * step, out = [];
    for (var n = first; n <= e; n += step) {
      var i = info(n);
      out.push({ date: n, week: i.week, month: i.month, extra: i.week === 53 });
    }
    return {
      list: out, count: out.length, frequency: FREQ[step] ? FREQ[step].name : step + '-day',
      extraLabel: FREQ[step] ? FREQ[step].extra : null,
      hasExtra: out.length > 0 && out[out.length - 1].extra
    };
  }

  function weeklyCalendar(Y) {
    var out = [];
    for (var w = 1; w <= 53; w++) {
      var r = weekRange(Y, w);
      out.push({ week: w, start: r.start, end: r.end, month: info(r.start).month, monthEnd: info(r.end).month });
    }
    return out;
  }
  function monthlyCalendar(Y) {
    var out = [];
    for (var n = 1; n <= 12; n++) {
      var d = monthDeadlines(Y, n);
      d.firstWeek = info(d.start).week;
      d.lastWeek = info(d.end).week;
      out.push(d);
    }
    return out;
  }

  function excelSerial(n) { return n + 25569; }

  // Spreadsheet formulas shown on the page (date in A2). test/formulas.test.js recalculates
  // every one in LibreOffice for every day 2000-2040 and compares it with this file.
  var TY = 'YEAR(A2)-(A2<DATE(YEAR(A2),4,6))';
  var FORMULAS = [
    { key: 'year', name: 'Tax year (e.g. 2026/27)', f: '=(' + TY + ')&"/"&RIGHT(' + TY + '+1,2)' },
    { key: 'yearStart', name: 'Tax year start date', date: true, f: '=DATE(' + TY + ',4,6)' },
    { key: 'week', name: 'Tax week number (1 to 53)', f: '=INT((A2-DATE(' + TY + ',4,6))/7)+1' },
    { key: 'weekStart', name: 'Tax week start date', date: true, f: '=A2-MOD(A2-DATE(' + TY + ',4,6),7)' },
    { key: 'weekEnd', name: 'Tax week end date', date: true, f: '=MIN(A2-MOD(A2-DATE(' + TY + ',4,6),7)+6,DATE(' + TY + '+1,4,5))' },
    { key: 'month', name: 'Tax month number (1 to 12)', f: '=MOD(MONTH(A2)-4-(DAY(A2)<6),12)+1' },
    { key: 'monthStart', name: 'Tax month start date', date: true, f: '=DATE(YEAR(A2),MONTH(A2)-(DAY(A2)<6),6)' },
    { key: 'monthEnd', name: 'Tax month end date', date: true, f: '=DATE(YEAR(A2),MONTH(A2)+(DAY(A2)>5),5)' },
    { key: 'eps', name: 'EPS deadline for that tax month (19th)', date: true, f: '=DATE(YEAR(A2),MONTH(A2)+(DAY(A2)>5),19)' },
    { key: 'paye', name: 'PAYE due (electronic), moved back for weekends and bank holidays', date: true, f: '=WORKDAY(DATE(YEAR(A2),MONTH(A2)+(DAY(A2)>5),23),-1,Holidays)' }
  ];
  // What each formula should return for day n (dates as Excel serial numbers).
  function formulaExpect(n) {
    var i = info(n), d = monthDeadlines(i.taxYear, i.month);
    return {
      year: i.label, yearStart: excelSerial(i.yearStart), week: i.week,
      weekStart: excelSerial(i.weekRange.start), weekEnd: excelSerial(i.weekRange.end),
      month: i.month, monthStart: excelSerial(i.monthRange.start), monthEnd: excelSerial(i.monthRange.end),
      eps: excelSerial(d.eps), paye: excelSerial(d.payeElectronic)
    };
  }

  var api = {
    dn: dn, ymd: ymd, iso: iso, parseISO: parseISO, todayLocal: todayLocal, weekday: weekday,
    fmt: fmt, MONTHS: MONTHS, DAYS: DAYS,
    taxYearOf: taxYearOf, yearStart: yearStart, yearEnd: yearEnd, yearLabel: yearLabel,
    info: info, weekRange: weekRange, monthRange: monthRange, week53: week53,
    easterSunday: easterSunday, bankHolidays: bankHolidays, isBankHoliday: isBankHoliday,
    isWorkingDay: isWorkingDay, onOrBeforeWorkingDay: onOrBeforeWorkingDay,
    monthDeadlines: monthDeadlines, quarterDeadlines: quarterDeadlines,
    nextMonthlyPayment: nextMonthlyPayment, nextEps: nextEps, nextQuarterly: nextQuarterly,
    yearEndDeadlines: yearEndDeadlines, paydays: paydays,
    weeklyCalendar: weeklyCalendar, monthlyCalendar: monthlyCalendar, excelSerial: excelSerial,
    FORMULAS: FORMULAS, formulaExpect: formulaExpect
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaxWeek = api;
})(this);
