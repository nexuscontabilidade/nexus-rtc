/*
 * Nexus — gráficos SVG sem dependências.
 * Especificação: barras ≤ 24px, ponta de dado arredondada (4px) e base reta, grade em linha fina sólida,
 * 2px de respiro entre segmentos, legenda sempre presente (≥ 2 séries), tooltip em hover e foco.
 * Paletas validadas (modo escuro, superfície #1c1a18) com o validador de dataviz.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var PALETA = {
    periodo: { p2026: '#3987e5', p2027: '#e2561f' },
    composicao: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
  };

  var SVGNS = 'http://www.w3.org/2000/svg';
  var tip = null;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'nx-tooltip';
    tip.setAttribute('role', 'status');
    document.body.appendChild(tip);
    return tip;
  }
  function mostrarTip(ev, linhas, alvo) {
    var t = tooltip();
    t.innerHTML = '';
    linhas.forEach(function (l, i) {
      var row = document.createElement('div');
      row.className = i === 0 ? 'nx-tooltip-title' : 'nx-tooltip-row';
      if (l.cor) {
        var k = document.createElement('span');
        k.className = 'nx-tooltip-key';
        k.style.background = l.cor;
        row.appendChild(k);
      }
      var v = document.createElement('strong');
      v.textContent = l.valor || '';
      var lb = document.createElement('span');
      lb.textContent = l.rotulo || '';
      if (i === 0) { row.textContent = l.rotulo; }
      else { row.appendChild(v); row.appendChild(lb); }
      t.appendChild(row);
    });
    t.style.opacity = '1';
    var x, y;
    if (ev && ev.clientX != null && ev.type !== 'focus') { x = ev.clientX; y = ev.clientY; }
    else { var r = alvo.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = Math.min(window.innerWidth - w - 12, Math.max(12, x + 14));
    var top = y - h - 12 < 8 ? y + 18 : y - h - 12;
    t.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }
  function esconderTip() { if (tip) tip.style.opacity = '0'; }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    var t = el('text', { x: x, y: y, class: cls || '', 'text-anchor': anchor || 'start' }, parent);
    t.textContent = s;
    return t;
  }

  /** Barra horizontal com ponta de dado arredondada (r=4) e base reta. */
  function barra(parent, x0, x1, y, h, cor) {
    var r = Math.min(4, Math.abs(x1 - x0) / 2, h / 2);
    var d;
    if (x1 >= x0) {
      d = 'M' + x0 + ',' + y + 'H' + (x1 - r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + x1 + ',' + (y + h) + ' ' + (x1 - r) + ',' + (y + h) + 'H' + x0 + 'Z';
    } else {
      d = 'M' + x0 + ',' + y + 'H' + (x1 + r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + x1 + ',' + (y + h) + ' ' + (x1 + r) + ',' + (y + h) + 'H' + x0 + 'Z';
    }
    return el('path', { d: d, fill: cor, class: 'nx-mark' }, parent);
  }

  /** Texto sobre preenchimento: branco ou tinta escura conforme a luminância (contraste ≥ 4,5:1 quando possível). */
  function tinta(hex) {
    var c = hex.replace('#', '');
    var rgb = [0, 2, 4].map(function (i) {
      var v = parseInt(c.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    var cBranco = 1.05 / (L + 0.05);
    var cTinta = (L + 0.05) / (0.0105 + 0.05);
    return cBranco >= cTinta ? '#ffffff' : '#141210';
  }

  function compacto(v) {
    var a = Math.abs(v);
    var s;
    if (a >= 1e6) s = N.fmt.num(v / 1e6, 1) + ' mi';
    else if (a >= 1e3) s = N.fmt.num(v / 1e3, a >= 1e4 ? 0 : 1) + ' mil';
    else s = N.fmt.num(v, 0);
    return 'R$ ' + s;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / exp;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }

  function legenda(container, itens) {
    var lg = document.createElement('div');
    lg.className = 'nx-legend';
    itens.forEach(function (it) {
      var s = document.createElement('span');
      var sw = document.createElement('i');
      sw.style.background = it.cor;
      s.appendChild(sw);
      s.appendChild(document.createTextNode(it.nome));
      lg.appendChild(s);
    });
    container.appendChild(lg);
  }

  function observar(container, desenhar) {
    desenhar();
    if (container.__ro) container.__ro.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      var ultimo = container.clientWidth;
      container.__ro = new ResizeObserver(function () {
        if (Math.abs(container.clientWidth - ultimo) > 4) { ultimo = container.clientWidth; desenhar(); }
      });
      container.__ro.observe(container);
    }
  }

  /**
   * Barras horizontais agrupadas por categoria (2 séries: 2026 e 2027).
   * cfg: { categorias: [..], series: [{nome, cor, valores: []}], rotuloDelta: true }
   */
  function barrasAgrupadas(container, cfg) {
    function desenhar() {
      container.innerHTML = '';
      legenda(container, cfg.series);
      var W = Math.max(260, container.clientWidth);
      var estreito = W < 560;
      var labelW = estreito ? 0 : Math.min(170, Math.max(110, W * 0.3));
      var catH = estreito ? 18 : 0;
      var padR = 64;
      var barH = 13, gapPar = 2, bandaPad = 16;
      var bandaH = catH + barH * cfg.series.length + gapPar * (cfg.series.length - 1) + bandaPad;
      var H = cfg.categorias.length * bandaH + 30;
      var todos = [];
      cfg.series.forEach(function (s) { s.valores.forEach(function (v) { if (v != null) todos.push(v); }); });
      var max = niceMax(Math.max.apply(null, todos.concat([0])));
      var minV = Math.min.apply(null, todos.concat([0]));
      var min = minV < 0 ? -niceMax(-minV) : 0;
      var x0 = labelW, x1 = W - padR;
      function sx(v) { return x0 + (v - min) / (max - min) * (x1 - x0); }
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'nx-chart', role: 'img', 'aria-label': cfg.titulo || 'Gráfico comparativo' });
      // grade
      var ticks = estreito ? 2 : 4;
      for (var i = 0; i <= ticks; i++) {
        var v = min + (max - min) * i / ticks;
        var gx = sx(v);
        el('line', { x1: gx, x2: gx, y1: 0, y2: H - 22, class: 'nx-grid' }, svg);
        txt(svg, gx, H - 6, compacto(v), 'nx-axis', i === 0 ? 'start' : i === ticks ? 'end' : 'middle');
      }
      el('line', { x1: sx(0), x2: sx(0), y1: 0, y2: H - 22, class: 'nx-baseline' }, svg);
      cfg.categorias.forEach(function (cat, ci) {
        var yBand = ci * bandaH + bandaPad / 2;
        txt(svg, 0, estreito ? yBand + 11 : yBand + (bandaH - bandaPad) / 2 + 4, cat, 'nx-cat');
        cfg.series.forEach(function (s, si) {
          var val = s.valores[ci];
          if (val == null) return;
          var y = yBand + catH + si * (barH + gapPar);
          barra(svg, sx(0), sx(val), y, barH, s.cor);
        });
        // rótulo seletivo: variação 2027 vs 2026 na ponta da barra de 2027
        var a = cfg.series[0].valores[ci], b = cfg.series[1] && cfg.series[1].valores[ci];
        if (cfg.rotuloDelta !== false && a != null && b != null && a !== 0) {
          var dv = (b - a) / Math.abs(a) * 100;
          var yb = yBand + catH + (barH + gapPar) + barH - 2;
          txt(svg, Math.max(sx(b), sx(0)) + 6, yb, N.fmt.signedPct(dv, 1), 'nx-delta');
        }
        var hit = el('rect', { x: 0, y: yBand - bandaPad / 2, width: W, height: bandaH, class: 'nx-hit', tabindex: 0, 'aria-label': cat }, svg);
        function show(ev) {
          var linhas = [{ rotulo: cat }];
          cfg.series.forEach(function (s) { linhas.push({ cor: s.cor, valor: N.fmt.brl(s.valores[ci]), rotulo: s.nome }); });
          if (a != null && b != null) linhas.push({ valor: N.fmt.signedBrl(b - a), rotulo: 'variação' + (a ? ' (' + N.fmt.signedPct((b - a) / Math.abs(a) * 100) + ')' : '') });
          mostrarTip(ev, linhas, hit);
          hit.classList.add('is-hover');
        }
        hit.addEventListener('pointermove', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', function () { esconderTip(); hit.classList.remove('is-hover'); });
        hit.addEventListener('blur', function () { esconderTip(); hit.classList.remove('is-hover'); });
      });
      container.appendChild(svg);
    }
    observar(container, desenhar);
  }

  /**
   * Barras empilhadas horizontais (composição do preço por período).
   * cfg: { barras: [{rotulo, total, segmentos: [{nome, valor}]}], cores: [...] }
   */
  function composicao(container, cfg) {
    function desenhar() {
      container.innerHTML = '';
      var nomes = [];
      cfg.barras.forEach(function (b) { b.segmentos.forEach(function (s) { if (nomes.indexOf(s.nome) < 0) nomes.push(s.nome); }); });
      var cores = {};
      nomes.forEach(function (nm, i) { cores[nm] = (cfg.cores || PALETA.composicao)[i % 5]; });
      legenda(container, nomes.map(function (nm) { return { nome: nm, cor: cores[nm] }; }));
      var W = Math.max(280, container.clientWidth);
      var labelW = 56, padR = 96;
      var barH = 22, gap = 22;
      var H = cfg.barras.length * (barH + gap) + 26;
      var max = 0;
      cfg.barras.forEach(function (b) { var t = 0; b.segmentos.forEach(function (s) { t += Math.max(0, s.valor); }); max = Math.max(max, t); });
      max = niceMax(max);
      var x0 = labelW, x1 = W - padR;
      function sx(v) { return x0 + v / max * (x1 - x0); }
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'nx-chart', role: 'img', 'aria-label': cfg.titulo || 'Composição do preço' });
      var nt = W < 560 ? 2 : 4;
      for (var i = 0; i <= nt; i++) {
        var gx = sx(max * i / nt);
        el('line', { x1: gx, x2: gx, y1: 0, y2: H - 22, class: 'nx-grid' }, svg);
        txt(svg, gx, H - 6, compacto(max * i / nt), 'nx-axis', i === 0 ? 'start' : i === nt ? 'end' : 'middle');
      }
      cfg.barras.forEach(function (b, bi) {
        var y = bi * (barH + gap) + gap / 2;
        txt(svg, 0, y + barH / 2 + 4, b.rotulo, 'nx-cat');
        var acc = 0;
        var segs = b.segmentos.filter(function (s) { return s.valor > 0.004; });
        segs.forEach(function (s, si) {
          var xa = sx(acc), xb = sx(acc + s.valor);
          var ultimo = si === segs.length - 1;
          var w = Math.max(0, xb - xa - (ultimo ? 0 : 2));
          var shape = ultimo ? barra(svg, xa, xa + w, y, barH, cores[s.nome]) : el('rect', { x: xa, y: y, width: w, height: barH, fill: cores[s.nome], class: 'nx-mark' }, svg);
          var pct = b.base ? s.valor / b.base * 100 : null;
          var rot = pct != null ? N.fmt.pct(pct, 1) : '';
          if (rot && w > rot.length * 6.6 + 12) {
            var tt = txt(svg, xa + w / 2, y + barH / 2 + 4, rot, 'nx-inlabel', 'middle');
            tt.setAttribute('fill', tinta(cores[s.nome]));
          }
          var hit = el('rect', { x: xa, y: y - 4, width: Math.max(w, 6), height: barH + 8, class: 'nx-hit', tabindex: 0, 'aria-label': s.nome + ' ' + N.fmt.brl(s.valor) }, svg);
          function show(ev) {
            mostrarTip(ev, [{ rotulo: b.rotulo + ' — ' + s.nome }, { cor: cores[s.nome], valor: N.fmt.brl(s.valor), rotulo: pct != null ? N.fmt.pct(pct) + ' do valor da mercadoria' : '' }], hit);
            shape.classList.add('is-hover');
          }
          hit.addEventListener('pointermove', show);
          hit.addEventListener('focus', show);
          hit.addEventListener('pointerleave', function () { esconderTip(); shape.classList.remove('is-hover'); });
          hit.addEventListener('blur', function () { esconderTip(); shape.classList.remove('is-hover'); });
          acc += s.valor;
        });
        txt(svg, sx(acc) + 8, y + barH / 2 + 4, N.fmt.brl(b.total != null ? b.total : acc), 'nx-total');
        if (b.nota) txt(svg, sx(acc) + 8, y + barH / 2 + 18, b.nota, 'nx-axis');
      });
      container.appendChild(svg);
    }
    observar(container, desenhar);
  }

  N.charts = { PALETA: PALETA, barrasAgrupadas: barrasAgrupadas, composicao: composicao, compacto: compacto };
})(typeof window !== 'undefined' ? window : globalThis);
