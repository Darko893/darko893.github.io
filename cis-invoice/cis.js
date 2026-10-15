// CIS invoice maths. All money is held as whole pence (integers) so totals never drift.
// Works in the browser (window.CIS) and in Node (module.exports) for the tests.
(function (root) {
  'use strict';

  var KINDS = {
    labour: 'Labour',
    materials: 'Materials',
    plant: 'Plant or equipment hire'
  };
  var VAT_RATES = [20, 5, 0];
  var CIS_RATES = [20, 30, 0];

  // "1,234.5" -> 123450; "" -> 0; junk -> NaN. Accepts a leading £ and spaces.
  function parsePence(s) {
    if (typeof s === 'number') s = String(s);
    s = String(s == null ? '' : s).replace(/[£,\s]/g, '');
    if (s === '') return 0;
    var m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return NaN;
    var frac = (m[3] || '');
    if (frac.length > 2) {
      // round half up on the third decimal place and beyond
      var extra = frac.slice(2);
      frac = frac.slice(0, 2);
      var p = Number(m[2] || '0') * 100 + Number(frac);
      if (extra[0] >= '5') p += 1;
      return m[1] ? -p : p;
    }
    while (frac.length < 2) frac += '0';
    var pence = Number(m[2] || '0') * 100 + Number(frac);
    return m[1] ? -pence : pence;
  }

  // Quantity as thousandths (3 decimal places), e.g. "2.5" -> 2500.
  function parseQty(s) {
    s = String(s == null ? '' : s).replace(/[,\s]/g, '');
    if (s === '') return 1000;
    var m = /^(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[1] === '' && !m[2])) return NaN;
    var frac = (m[2] || '');
    if (frac.length > 3) return NaN;
    while (frac.length < 3) frac += '0';
    return Number(m[1] || '0') * 1000 + Number(frac);
  }

  // round(a * b / d) half up, for non-negative integers (sign handled outside)
  function mulDivRound(a, b, d) {
    var neg = (a < 0) !== (b < 0);
    a = Math.abs(a); b = Math.abs(b);
    var r = Math.floor((a * b * 2 + d) / (2 * d));
    return neg ? -r : r;
  }

  function lineNet(qtyMilli, unitPence) {
    return mulDivRound(qtyMilli, unitPence, 1000);
  }

  function fmt(pence) {
    var neg = pence < 0;
    pence = Math.abs(pence);
    var pounds = Math.floor(pence / 100);
    var p = String(pence % 100);
    if (p.length < 2) p = '0' + p;
    var s = String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-£' : '£') + s + '.' + p;
  }

  function fmtQty(milli) {
    var s = (milli / 1000).toFixed(3).replace(/\.?0+$/, '');
    return s;
  }

  // inv: { vatMode: 'none'|'reverse'|'standard', cisRate: 20|30|0,
  //        lines: [{ desc, kind, qty, unit, vat }] }  (qty and unit as typed strings)
  function calculate(inv) {
    var vatMode = inv.vatMode || 'none';
    var cisRate = Number(inv.cisRate);
    if (CIS_RATES.indexOf(cisRate) < 0) cisRate = 20;
    var out = {
      lines: [], errors: [], warnings: [],
      labourNet: 0, materialsNet: 0, plantNet: 0, net: 0,
      vatGroups: [], vat: 0, vatCharged: 0, vatReverse: 0,
      gross: 0, cisRate: cisRate, cisBase: 0, cis: 0, due: 0,
      vatMode: vatMode
    };
    var byRate = {};
    (inv.lines || []).forEach(function (l, i) {
      var desc = String(l.desc || '').trim();
      var qtyRaw = String(l.qty == null ? '' : l.qty).trim();
      var unitRaw = String(l.unit == null ? '' : l.unit).trim();
      if (!desc && unitRaw === '' && (qtyRaw === '' || qtyRaw === '1')) return; // blank row
      var kind = KINDS[l.kind] ? l.kind : 'labour';
      var qty = parseQty(qtyRaw);
      var unit = parsePence(unitRaw);
      var vat = vatMode === 'none' ? 0 : Number(l.vat);
      if (VAT_RATES.indexOf(vat) < 0) vat = 20;
      var row = { n: i + 1, desc: desc, kind: kind, qty: qty, unit: unit, vat: vat, net: 0, ok: true };
      if (isNaN(qty)) { row.ok = false; out.errors.push('Line ' + (i + 1) + ': quantity should be a number like 1, 2.5 or 37.5'); }
      if (isNaN(unit)) { row.ok = false; out.errors.push('Line ' + (i + 1) + ': price should be an amount like 150 or 12.50'); }
      if (row.ok) {
        row.net = lineNet(qty, unit);
        if (kind === 'labour') out.labourNet += row.net;
        else if (kind === 'materials') out.materialsNet += row.net;
        else out.plantNet += row.net;
        out.net += row.net;
        if (vatMode !== 'none') byRate[vat] = (byRate[vat] || 0) + row.net;
      }
      out.lines.push(row);
    });

    VAT_RATES.forEach(function (r) {
      if (byRate[r] === undefined) return;
      var v = mulDivRound(byRate[r], r, 100);
      out.vatGroups.push({ rate: r, net: byRate[r], vat: v });
      out.vat += v;
    });
    if (vatMode === 'standard') out.vatCharged = out.vat;
    if (vatMode === 'reverse') out.vatReverse = out.vat;
    out.gross = out.net + out.vatCharged;

    // CIS is worked out on labour only: not on materials, plant hire or VAT.
    out.cisBase = Math.max(0, out.labourNet);
    out.cis = mulDivRound(out.cisBase, cisRate, 100); // to the nearest penny, as most contractors do
    out.due = out.gross - out.cis;

    if (vatMode === 'reverse') {
      if (out.vatGroups.length && out.vatGroups.every(function (g) { return g.rate === 0; }))
        out.warnings.push('Every line is zero-rated. The reverse charge only covers standard-rated (20%) and reduced-rated (5%) work, so a normal invoice may be right here.');
      else if (out.vatGroups.some(function (g) { return g.rate === 0 && g.net > 0; }))
        out.warnings.push('Some lines are zero-rated. The reverse charge does not cover zero-rated work; check the invoice with your accountant.');
    }
    if (out.lines.length && out.labourNet === 0 && cisRate > 0)
      out.warnings.push('No labour lines, so there is no CIS deduction. CIS is only taken from the labour part of an invoice.');
    if (out.net < 0) out.errors.push('The invoice total is below zero. Use a credit note for refunds.');
    return out;
  }

  // Next invoice number: keep any prefix and the width of the last number. "INV-0099" -> "INV-0100"
  function nextNumber(s) {
    s = String(s || '');
    var m = /^(.*?)(\d+)(\D*)$/.exec(s);
    if (!m) return s ? s + '-2' : '1';
    var n = String(Number(m[2]) + 1);
    while (n.length < m[2].length) n = '0' + n;
    return m[1] + n + m[3];
  }

  // UK UTR: 10 digits (spaces allowed). Returns cleaned value or null.
  function cleanUtr(s) {
    var d = String(s || '').replace(/\s/g, '');
    if (/^\d{10}$/.test(d)) return d.slice(0, 5) + ' ' + d.slice(5);
    return null;
  }
  // UK VAT number: GB + 9 digits (or 12 for group/branch), spaces allowed.
  function cleanVat(s) {
    var d = String(s || '').toUpperCase().replace(/\s/g, '');
    if (/^(GB)?\d{9}$/.test(d) || /^(GB)?\d{12}$/.test(d)) {
      d = d.replace(/^GB/, '');
      return 'GB ' + d.slice(0, 3) + ' ' + d.slice(3, 7) + ' ' + d.slice(7);
    }
    return null;
  }

  var api = {
    KINDS: KINDS, VAT_RATES: VAT_RATES, CIS_RATES: CIS_RATES,
    parsePence: parsePence, parseQty: parseQty, lineNet: lineNet, fmt: fmt, fmtQty: fmtQty,
    calculate: calculate, nextNumber: nextNumber, cleanUtr: cleanUtr, cleanVat: cleanVat,
    REVERSE_CHARGE_TEXT: 'Reverse charge: customer to pay the VAT to HMRC'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CIS = api;
})(this);
