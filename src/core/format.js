/* Nexus — formatação e conversão de números no padrão brasileiro */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var numFmtCache = {};
  function numFmt(casas) {
    if (!numFmtCache[casas]) {
      numFmtCache[casas] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    return numFmtCache[casas];
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** R$ 1.234,56 (espaço comum entre R$ e o número) */
  function brl(v) {
    if (!isNum(v)) return '—';
    if (Math.abs(v) < 0.005) v = 0; // sem "-R$ 0,00"
    return brlFmt.format(v).replace(/ /g, ' ');
  }

  /** v em pontos percentuais: 20 → "20,00%" */
  function pct(v, casas) {
    if (!isNum(v)) return '—';
    var c = casas == null ? 2 : casas;
    if (Math.abs(v) < 0.5 * Math.pow(10, -c)) v = 0; // sem "-0,00%"
    return numFmt(c).format(v) + '%';
  }

  /** v em fração: 0,2 → "20,00%" */
  function pctFrac(v, casas) { return isNum(v) ? pct(v * 100, casas) : '—'; }

  function num(v, casas) {
    if (!isNum(v)) return '—';
    return numFmt(casas == null ? 2 : casas).format(v);
  }

  /** Sinalizado: +1,23% / −1,23% */
  function signedPct(v, casas) {
    if (!isNum(v)) return '—';
    var s = pct(Math.abs(v), casas);
    return (v > 0.00001 ? '+' : v < -0.00001 ? '−' : '') + s;
  }
  /** Diferença em pontos percentuais com sinal, sem "−0,00" */
  function signedPp(v, casas) {
    if (!isNum(v)) return '—';
    var c = casas == null ? 2 : casas;
    if (Math.abs(v) < 0.5 * Math.pow(10, -c)) return numFmt(c).format(0) + ' p.p.';
    return (v > 0 ? '+' : '−') + numFmt(c).format(Math.abs(v)) + ' p.p.';
  }
  function signedBrl(v) {
    if (!isNum(v)) return '—';
    var s = brl(Math.abs(v));
    return (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + s;
  }

  /**
   * Converte texto digitado em número. Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234", "20%".
   * Retorna null quando vazio e NaN quando inválido.
   */
  function parse(str) {
    if (str == null) return null;
    if (typeof str === 'number') return str;
    var s = String(str).trim().replace(/R\$|%|\s| /g, '');
    if (s === '') return null;
    var neg = false;
    if (/^[-−]/.test(s)) { neg = true; s = s.replace(/^[-−]/, ''); }
    if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
    var v = parseFloat(s);
    return neg ? -v : v;
  }

  /** Valor para exibir dentro de um campo editável */
  var numLivre = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  // padrão do escritório: todo valor em reais com 2 casas (R$ 0,00); o cálculo segue com a precisão completa
  var numUnit = numFmt(2);
  /** Valor unitário: R$ 1.234,56; negativo com o sinal antes do R$, como em brl */
  function unit(v) {
    if (!isNum(v)) return '—';
    var s = numUnit.format(Math.abs(v));
    return (v < 0 && /[1-9]/.test(s) ? '-R$ ' : 'R$ ') + s;
  }
  function inputValue(v, tipo) {
    if (v == null || v === '') return '';
    if (tipo === 'money' || tipo === 'pct' || tipo === 'num' || tipo === 'int' || tipo === 'unit') {
      if (typeof v !== 'number' || !isFinite(v)) return '';
      if (tipo === 'int') return String(Math.round(v));
      if (tipo === 'num') return numLivre.format(v);
      if (tipo === 'unit') return numUnit.format(v);
      return numFmt(2).format(v);
    }
    return String(v);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function toDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  }
  function date(iso) {
    if (!iso) return '—';
    var d = toDate(iso);
    if (isNaN(d)) return '—';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function dateTime(iso) {
    if (!iso) return '—';
    var d = toDate(iso);
    if (isNaN(d)) return '—';
    return date(iso) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return s == null ? '' : String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

  function cnpj(s) {
    var d = onlyDigits(s);
    if (d.length !== 14) return s || '';
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  /** Valida dígitos verificadores do CNPJ (numérico). */
  function cnpjValido(s) {
    var d = onlyDigits(s);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    function dv(base) {
      var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var soma = 0;
      for (var i = 0; i < pesos.length; i++) soma += parseInt(base[i], 10) * pesos[i];
      var r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = dv(d.slice(0, 12));
    var d2 = dv(d.slice(0, 12) + d1);
    return d1 === +d[12] && d2 === +d[13];
  }

  N.fmt = {
    brl: brl, unit: unit, pct: pct, pctFrac: pctFrac, num: num, signedPct: signedPct, signedBrl: signedBrl, signedPp: signedPp,
    parse: parse, inputValue: inputValue, date: date, dateTime: dateTime, esc: esc,
    onlyDigits: onlyDigits, cnpj: cnpj, cnpjValido: cnpjValido, isNum: isNum
  };
})(typeof window !== 'undefined' ? window : globalThis);
