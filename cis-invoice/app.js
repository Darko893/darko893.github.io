// Page behaviour for the CIS invoice maker. Maths lives in cis.js.
(function () {
  'use strict';
  var C = window.CIS;
  var KEY = 'cis-invoice-maker:v1';
  var TIP_URL = ''; // PayPal payment link, set at launch; the tip line stays hidden while empty

  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['name', 'address', 'contact', 'utr', 'cis', 'vatreg', 'vatno', 'cname', 'caddress',
    'vatmode', 'number', 'date', 'terms', 'period', 'site', 'notes'];

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    var p = iso.split('-').map(Number);
    return p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + p[0];
  }

  // ---- storage (a per-device convenience; the page works without it)
  function load() {
    try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save() {
    try {
      if (!$('f-remember').checked) { localStorage.removeItem(KEY); localStorage.setItem(KEY + ':off', '1'); return; }
      localStorage.removeItem(KEY + ':off');
      localStorage.setItem(KEY, JSON.stringify(state()));
    } catch (e) { /* storage blocked: ignore */ }
  }
  function rememberOff() {
    try { return localStorage.getItem(KEY + ':off') === '1'; } catch (e) { return false; }
  }

  // ---- line rows
  var lineSeq = 0;
  function addLine(l, focus) {
    l = l || {};
    var id = 'l' + (++lineSeq);
    var div = document.createElement('div');
    div.className = 'line';
    div.dataset.id = id;
    div.innerHTML =
      '<div class="desc"><label for="' + id + '-d">Description</label><input type="text" id="' + id + '-d" class="ld" placeholder="e.g. Second fix electrics, plot 12"></div>' +
      '<div><label for="' + id + '-k">Type</label><select id="' + id + '-k" class="lk">' +
        '<option value="labour">Labour</option><option value="materials">Materials</option><option value="plant">Plant hire</option></select></div>' +
      '<div><label for="' + id + '-q">Qty</label><input type="text" id="' + id + '-q" class="lq" inputmode="decimal" placeholder="1"></div>' +
      '<div><label for="' + id + '-u">Price (£)</label><input type="text" id="' + id + '-u" class="lu" inputmode="decimal" placeholder="0.00"></div>' +
      '<div class="vat-only"><label for="' + id + '-v">VAT</label><select id="' + id + '-v" class="lv">' +
        '<option value="20">20%</option><option value="5">5%</option><option value="0">0%</option></select></div>' +
      '<div class="lt"><span>Line total: <b class="ltot">£0.00</b></span>' +
        '<button type="button" class="ghost small lx" aria-label="Remove this line">Remove</button></div>';
    div.querySelector('.ld').value = l.desc || '';
    div.querySelector('.lk').value = C.KINDS[l.kind] ? l.kind : 'labour';
    div.querySelector('.lq').value = l.qty == null ? '' : l.qty;
    div.querySelector('.lu').value = l.unit == null ? '' : l.unit;
    div.querySelector('.lv').value = String(C.VAT_RATES.indexOf(Number(l.vat)) >= 0 && l.vat !== '' && l.vat != null ? Number(l.vat) : 20);
    div.querySelector('.lx').addEventListener('click', function () {
      div.remove();
      if (!document.querySelector('#lines .line')) addLine();
      update();
    });
    $('lines').appendChild(div);
    if (focus) div.querySelector('.ld').focus();
  }
  function readLines() {
    return Array.prototype.map.call(document.querySelectorAll('#lines .line'), function (div) {
      return {
        desc: div.querySelector('.ld').value,
        kind: div.querySelector('.lk').value,
        qty: div.querySelector('.lq').value,
        unit: div.querySelector('.lu').value,
        vat: div.querySelector('.lv').value
      };
    });
  }

  function state() {
    var s = {};
    FIELDS.forEach(function (f) { s[f] = $('f-' + f).value; });
    s.lines = readLines();
    return s;
  }
  function apply(s) {
    FIELDS.forEach(function (f) { if (s[f] != null) $('f-' + f).value = s[f]; });
    $('lines').innerHTML = '';
    (s.lines && s.lines.length ? s.lines : [{}]).forEach(function (l) { addLine(l); });
  }

  // ---- building the invoice with DOM nodes (no innerHTML for anything typed)
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function kv(parent, label, value, cls) {
    var d = el('div', cls);
    d.appendChild(el('span', null, label));
    d.appendChild(el('span', null, value));
    parent.appendChild(d);
  }

  function invoiceModel() {
    var s = state();
    var vatReg = s.vatreg === 'yes';
    var vatMode = vatReg ? s.vatmode : 'none';
    var noCis = s.cis === 'none';
    var r = C.calculate({ vatMode: vatMode, cisRate: noCis ? 0 : Number(s.cis), lines: s.lines });
    return { s: s, r: r, vatReg: vatReg, vatMode: vatMode, noCis: noCis };
  }

  function render() {
    var m = invoiceModel(), s = m.s, r = m.r;
    var inv = $('invoice');
    inv.textContent = '';

    var top = el('div', 'top');
    var who = el('div');
    who.appendChild(el('h3', null, m.vatReg ? 'VAT INVOICE' : 'INVOICE'));
    who.appendChild(el('div', null, s.name || 'Your name'));
    if (s.address) who.appendChild(el('div', 'pre', s.address));
    if (s.contact) who.appendChild(el('div', null, s.contact));
    var utr = C.cleanUtr(s.utr);
    if (s.utr) who.appendChild(el('div', null, 'UTR: ' + (utr || s.utr)));
    if (m.vatReg) who.appendChild(el('div', null, 'VAT reg no: ' + (C.cleanVat(s.vatno) || s.vatno || '(add your VAT number)')));
    top.appendChild(who);
    var meta = el('div', 'meta');
    meta.appendChild(el('div', null, 'Invoice no: ' + (s.number || '')));
    meta.appendChild(el('div', null, 'Date: ' + (longDate(s.date) || '')));
    var terms = Number(s.terms);
    if (s.date) meta.appendChild(el('div', null, terms ? 'Due: ' + longDate(addDays(s.date, terms)) : 'Due: on receipt'));
    top.appendChild(meta);
    inv.appendChild(top);

    var parties = el('div', 'parties');
    var to = el('div');
    to.appendChild(el('div', 'lbl', 'Invoice to'));
    to.appendChild(el('div', null, s.cname || 'Customer name'));
    if (s.caddress) to.appendChild(el('div', 'pre', s.caddress));
    parties.appendChild(to);
    if (s.site || s.period) {
      var job = el('div');
      job.appendChild(el('div', 'lbl', 'Job'));
      if (s.site) job.appendChild(el('div', null, s.site));
      if (s.period) job.appendChild(el('div', null, s.period));
      parties.appendChild(job);
    }
    inv.appendChild(parties);

    var tw = el('div', 'tw');
    var t = el('table');
    var hr = el('tr');
    ['Description', 'Type', 'Qty', 'Price', m.vatReg ? 'VAT' : null, 'Amount'].forEach(function (h, i) {
      if (h === null) return;
      var th = el('th', i >= 2 ? 'n' : null, h);
      hr.appendChild(th);
    });
    var thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    var shown = r.lines.filter(function (l) { return l.ok; });
    if (!shown.length) {
      var tr0 = el('tr'); var td0 = el('td', 'empty', 'Add your work and materials on the left.');
      td0.colSpan = m.vatReg ? 6 : 5; tr0.appendChild(td0); tb.appendChild(tr0);
    }
    shown.forEach(function (l) {
      var tr = el('tr');
      tr.appendChild(el('td', null, l.desc || '-'));
      tr.appendChild(el('td', null, l.kind === 'plant' ? 'Plant hire' : C.KINDS[l.kind]));
      tr.appendChild(el('td', 'n', C.fmtQty(l.qty)));
      tr.appendChild(el('td', 'n', C.fmt(l.unit)));
      if (m.vatReg) tr.appendChild(el('td', 'n', l.vat + '%'));
      tr.appendChild(el('td', 'n', C.fmt(l.net)));
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t); inv.appendChild(tw);

    var tot = el('div', 'totals');
    kv(tot, 'Labour', C.fmt(r.labourNet));
    if (r.materialsNet) kv(tot, 'Materials', C.fmt(r.materialsNet));
    if (r.plantNet) kv(tot, 'Plant hire', C.fmt(r.plantNet));
    kv(tot, m.vatReg ? 'Total before VAT' : 'Total', C.fmt(r.net));
    if (m.vatMode === 'standard') {
      r.vatGroups.forEach(function (g) { kv(tot, 'VAT at ' + g.rate + '% on ' + C.fmt(g.net), C.fmt(g.vat)); });
      kv(tot, 'Total including VAT', C.fmt(r.gross));
    }
    if (m.vatMode === 'reverse') {
      r.vatGroups.forEach(function (g) { kv(tot, 'VAT at ' + g.rate + '% on ' + C.fmt(g.net) + ', for the customer to pay to HMRC', C.fmt(g.vat), 'memo'); });
      kv(tot, 'VAT charged on this invoice', C.fmt(0));
    }
    if (r.cisRate > 0) kv(tot, 'Less CIS deduction (' + r.cisRate + '% of labour ' + C.fmt(r.cisBase) + ')', '-' + C.fmt(r.cis));
    kv(tot, 'Amount due', C.fmt(r.due), 'due');
    inv.appendChild(tot);

    if (m.vatMode === 'reverse') inv.appendChild(el('div', 'rc', C.REVERSE_CHARGE_TEXT + '.'));
    var foot = el('div', 'foot');
    if (m.noCis) { /* not a CIS job: say nothing about CIS */ }
    else if (r.cisRate === 0) foot.appendChild(el('p', null, 'Gross payment status: no CIS deduction to be made.'));
    else foot.appendChild(el('p', null, 'CIS: the contractor deducts ' + r.cisRate + '% from the labour of ' + C.fmt(r.cisBase) + ' only (not materials, plant hire or VAT) and pays it to HMRC.'));
    if (s.notes) foot.appendChild(el('p', 'pre', s.notes));
    inv.appendChild(foot);

    $('jump-due').textContent = C.fmt(r.due);

    // messages
    var msgs = $('messages');
    msgs.textContent = '';
    var warn = r.warnings.slice();
    if (m.noCis && m.vatMode === 'reverse') warn.push('The reverse charge only applies when the customer is a CIS contractor. For a homeowner, choose Normal VAT.');
    if (m.vatReg && !C.cleanVat(s.vatno)) warn.unshift('Add your VAT registration number: a VAT invoice must show it.');
    if (s.utr && !utr) warn.push('A UTR is 10 digits. Check the number on your HMRC letters.');
    if (r.cisRate === 30) warn.push('30% is the rate for subcontractors not registered for CIS. Registering with HMRC usually brings it down to 20%.');
    r.errors.forEach(function (t) { msgs.appendChild(el('p', 'msg err', t)); });
    warn.forEach(function (t) { msgs.appendChild(el('p', 'msg warn', t)); });

    // line totals and input highlighting
    var rows = document.querySelectorAll('#lines .line');
    var byN = {};
    r.lines.forEach(function (l) { byN[l.n] = l; });
    Array.prototype.forEach.call(rows, function (div, i) {
      var l = byN[i + 1];
      div.querySelector('.ltot').textContent = l && l.ok ? C.fmt(l.net) : '£0.00';
      div.querySelector('.lq').classList.toggle('bad', !!l && isNaN(l.qty));
      div.querySelector('.lu').classList.toggle('bad', !!l && isNaN(l.unit));
    });
    $('f-utr').classList.toggle('bad', !!s.utr && !utr);
    $('f-vatno').classList.toggle('bad', m.vatReg && !!s.vatno && !C.cleanVat(s.vatno));

    Array.prototype.forEach.call(document.querySelectorAll('.vat-only'), function (e) { e.style.display = m.vatReg ? '' : 'none'; });
    document.title = (s.number ? s.number + ' - ' : '') + 'CIS invoice maker';
    if (!s.number) document.title = 'Free CIS Invoice Maker UK';
  }

  function asText() {
    var m = invoiceModel(), s = m.s, r = m.r;
    var out = [];
    out.push((m.vatReg ? 'VAT invoice ' : 'Invoice ') + (s.number || '') + ' from ' + (s.name || '') + (s.date ? ', ' + longDate(s.date) : ''));
    if (s.cname) out.push('To: ' + s.cname);
    if (s.site || s.period) out.push('Job: ' + [s.site, s.period].filter(Boolean).join(', '));
    r.lines.filter(function (l) { return l.ok; }).forEach(function (l) {
      out.push('- ' + (l.desc || '-') + ' (' + (l.kind === 'plant' ? 'plant hire' : C.KINDS[l.kind].toLowerCase()) + '): ' + C.fmtQty(l.qty) + ' x ' + C.fmt(l.unit) + ' = ' + C.fmt(l.net));
    });
    out.push('Labour ' + C.fmt(r.labourNet) + (r.materialsNet ? ', materials ' + C.fmt(r.materialsNet) : '') + (r.plantNet ? ', plant hire ' + C.fmt(r.plantNet) : ''));
    if (m.vatMode === 'standard') out.push('VAT ' + C.fmt(r.vat) + ', total ' + C.fmt(r.gross));
    if (m.vatMode === 'reverse') out.push(C.REVERSE_CHARGE_TEXT + ' (' + C.fmt(r.vat) + ')');
    if (r.cisRate > 0) out.push('Less CIS ' + r.cisRate + '% of labour: -' + C.fmt(r.cis));
    out.push('Amount due: ' + C.fmt(r.due));
    if (s.utr) out.push('UTR: ' + (C.cleanUtr(s.utr) || s.utr));
    if (s.notes) out.push(s.notes);
    return out.join('\n');
  }

  var timer;
  function update() {
    render();
    clearTimeout(timer);
    timer = setTimeout(save, 300);
  }

  // ---- start up
  if (rememberOff()) $('f-remember').checked = false;
  var saved = load();
  if (saved) apply(saved);
  else apply({ lines: [{}] });
  if (!$('f-date').value) $('f-date').value = todayIso();
  if (!$('f-number').value) $('f-number').value = 'INV-0001';

  document.addEventListener('input', function (e) { if (e.target.closest('.form-col')) update(); });
  document.addEventListener('change', function (e) { if (e.target.closest('.form-col')) update(); });
  $('add-line').addEventListener('click', function () { addLine({ vat: lastVat() }, true); update(); });
  function lastVat() {
    var v = document.querySelectorAll('#lines .lv');
    return v.length ? v[v.length - 1].value : 20;
  }
  $('print').addEventListener('click', function () { render(); window.print(); });
  $('copy').addEventListener('click', function () {
    var text = asText();
    var done = function () { $('copy-status').textContent = 'Copied. Paste it into a text or email.'; };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { $('copy-status').textContent = 'Could not copy. Select the invoice and copy it by hand.'; }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  });
  $('next').addEventListener('click', function () {
    $('f-number').value = C.nextNumber($('f-number').value);
    $('f-date').value = todayIso();
    $('f-period').value = '';
    $('copy-status').textContent = 'Invoice ' + $('f-number').value + ' started. Lines are kept, so change the amounts for this job.';
    update();
  });
  $('clear').addEventListener('click', function () {
    if (!window.confirm('Clear every field, including your saved details?')) return;
    clearTimeout(timer);
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    FIELDS.forEach(function (f) {
      var e = $('f-' + f);
      if (e.tagName === 'SELECT') e.selectedIndex = 0; else e.value = '';
    });
    $('f-terms').value = '30';
    $('f-number').value = 'INV-0001';
    $('f-date').value = todayIso();
    apply({ lines: [{}] });
    $('copy-status').textContent = 'Cleared.';
    render();
  });
  $('f-remember').addEventListener('change', save);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      $('jump').classList.toggle('hide', es[0].isIntersecting);
    }).observe($('invoice-wrap'));
  }
  if (TIP_URL) { $('tip-link').href = TIP_URL; $('tip').style.display = 'block'; }
  render();
  // expose for tests
  window.__cisInvoice = { asText: asText, state: state };
})();
