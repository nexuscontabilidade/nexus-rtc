/* RTC Comparativo — tela 3: formação do preço de venda (markup divisor) e margem efetiva,
   da operação completa ou de um produto, pela quantidade total ou por unidade;
   "Quanto devo cobrar em 2027" (mesmo lucro em R$ de 2026) e detalhamento por linha */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  function formulaNum(v, b) {
    var m = v.meta || {};
    if (m.modo === 'L') {
      return 'Preço = (' + b.m(v.C) + (m.B ? (m.B > 0 ? ' + ' : ' − ') + b.m(Math.abs(m.B)) : '') + ' + ' + b.m(m.alvo) + ') ÷ (1 − ' + F.num(m.A, 4) + ') = ' + b.m(v.C + (m.B || 0) + m.alvo) + ' ÷ ' + F.num(m.den, 6) + ' = ' + b.m(v.X);
    }
    if (m.modo !== 'A') {
      return '(' + b.m(v.X) + ' − ' + b.m(v.C) + ' − ' + b.m(v.tributosDentro) + ' − ' + b.m(v.despesas) + ') ÷ ' + b.m(v.X) + ' = ' + F.pct(v.pct.margemContrib);
    }
    var B = m.B || 0;
    return 'Preço = (' + b.m(v.C) + (B ? (B > 0 ? ' + ' : ' − ') + b.m(Math.abs(B)) : '') + ') ÷ (1 − ' + F.num(m.mEff, 4) + ' − ' + F.num(m.A, 4) + ') = ' + b.m(v.C + B) + ' ÷ ' + F.num(m.den, 6) + ' = ' + b.m(v.X);
  }

  /** Caixa com resumo sempre visível e o cálculo completo atrás da seta */
  function blocoFormula(A, chave, titulo, resumo, corpo) {
    var aberto = U.detalheAberto(A, chave);
    return '<div class="nx-formula-box"><div class="nx-det-cab">' + U.botaoDetalhe(chave, aberto, 'Ver como foi calculado') + '<span class="nx-eyebrow">' + titulo + '</span></div>' +
      '<div class="nx-formula is-num">' + resumo + '</div>' +
      '<div class="nx-det-bloco" data-det="' + esc(chave) + '"' + (aberto ? '' : ' hidden') + '>' + corpo + '</div></div>';
  }

  function markupNota(v) {
    return v.markup != null ? '<p class="nx-note"><b>Markup multiplicador:</b> ' + F.num(v.markup, 4) + ' (preço ÷ custo) — equivale a acréscimo de ' + F.pct(v.acrescimoCusto) + ' sobre o custo. <em>Acréscimo sobre o custo não é margem sobre a venda.</em></p>' : '';
  }

  function divisor(v, b, A, chave) {
    var m = v.meta || {};
    if (m.modo !== 'A') {
      return blocoFormula(A, chave, 'Margem do preço informado (margem efetiva)', 'Margem efetiva: ' + F.pct(v.pct.margemContrib) + ' sobre o preço de ' + b.m(v.X) + ' · ' + esc(b.rotulo),
        '<div class="nx-formula">' + esc(v.formula) + '</div><div class="nx-formula is-num">' + esc(formulaNum(v, b)) + '</div>' + markupNota(v));
    }
    var comps = '<ul class="nx-divisor">' +
      '<li><span>Margem desejada' + (m.mEff !== m.m ? ' ajustada (m ÷ (1 − τ))' : '') + '</span><b>' + F.pct(m.mEff * 100, 4) + '</b></li>' +
      (m.compA || []).filter(function (c) { return Math.abs(c.a) > 1e-9; }).map(function (c) { return '<li><span>' + esc(c.nome) + '</span><b>' + F.pct(c.a * 100, 4) + '</b></li>'; }).join('') +
      '<li class="is-total"><span>Denominador (1 − Σ)</span><b>' + F.num(m.den, 6) + '</b></li></ul>';
    return blocoFormula(A, chave, 'Como o preço foi formado (markup divisor)', 'Preço da mercadoria: ' + b.m(v.X) + ' · ' + esc(b.rotulo),
      '<div class="nx-formula">Preço = custo líquido ÷ (1 − margem − tributos sobre a venda − despesas variáveis)</div>' +
      '<div class="nx-formula is-num">' + esc(formulaNum(v, b)) + '</div>' + comps +
      '<p class="nx-note">Cada tributo aparece como percentual do preço de venda. Ex.: PIS e Cofins incidem sobre (preço − ICMS), então o percentual sobre o preço é a alíquota × (1 − ICMS).</p>' +
      (m.B ? '<p class="nx-note">Σb = ' + b.m(m.B) + ': parcela fixa decorrente de base específica (ex.: exclusão do ICMS-ST da base das contribuições).</p>' : '') +
      markupNota(v));
  }

  function tabelaItens(v, b, A, prefixo) {
    var linhas = v.linhas.map(function (l) {
      var info = l.tipo === 'info';
      return U.linhaComDetalhe(A, {
        chave: prefixo + '|' + (l.id || l.nome), classe: info ? 'is-info' : '',
        nome: '<span class="nx-item">' + esc(l.nome) + '</span> ' + RTC.views.natureza(l),
        celulas: '<td class="num">' + (info ? '<span class="nx-muted">(' + b.m(l.valor) + ')</span>' : b.m(l.valor)) + '</td>',
        detalhe: U.conteudoDetalhe(Object.assign({}, l, { natureza: null }), b.m), colunas: 2
      });
    }).join('');
    return '<div class="nx-table-wrap"><table class="nx-table nx-det-table"><thead><tr><th>Tributo / despesa <small class="nx-th-dica">clique na seta para ver o detalhamento</small></th><th class="num">Valor' + (b.unidade ? ' por unidade' : '') + '</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }

  function dre(v, vTotal, b, comMarkup) {
    function row(rot, val, pct, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + rot + '</td><td class="num">' + b.m(val) + '</td><td class="num">' + (pct != null ? F.pct(pct) : '') + '</td></tr>'; }
    var irRot = v.regime === 'SN' ? '(−) IRPJ/CSLL <small>incluídos no DAS</small>' : '(−) IRPJ/CSLL estimados <small>' + esc(v.irDesc) + '</small>';
    var qtdTxt = F.num(b.q, b.q % 1 ? 4 : 0) + ' ' + esc(b.un);
    var outraBase = '';
    if (b.unidade) {
      outraBase = '<div><span>Quantidade total (' + qtdTxt + '): mercadoria / total ao cliente</span><b>' + F.brl(vTotal.X) + ' / ' + F.brl(vTotal.total) + '</b></div>';
    } else if (b.q > 0) {
      outraBase = '<div><span>' + (b.operacao ? 'Média por unidade' : 'Por unidade') + ': mercadoria / total ao cliente</span><b>' + F.unit(vTotal.X / b.q) + ' / ' + F.unit(vTotal.total / b.q) + '</b></div>';
    }
    var u = b.unidade ? (b.operacao ? ' — média por unidade' : ' por unidade') : '';
    return '<div class="nx-table-wrap"><table class="nx-table nx-dre"><thead><tr><th>Resultado da operação<small class="nx-th-dica">' + esc(b.rotulo) + '</small></th><th class="num">R$</th><th class="num">% do preço</th></tr></thead><tbody>' +
      row('Valor da mercadoria' + u + ' (receita)', v.X, 100, 'is-total') +
      row('(−) Custo líquido de aquisição', -v.C, v.pct.custo) +
      row('(−) Tributos embutidos no preço <small class="nx-inline">por dentro</small>', -v.tributosDentro, v.pct.tributosDentro) +
      row('= Lucro bruto', v.lucroBruto, v.pct.lucroBruto, 'is-sub') +
      row('(−) Despesas variáveis', -v.despesas, v.pct.despesas) +
      row('= Margem de contribuição (margem efetiva)', v.margemContrib, v.pct.margemContrib, 'is-sub') +
      row(irRot, -v.irCs, v.pct.irCs) +
      row('= Lucro líquido da operação', v.lucroLiquido, v.pct.lucroLiquido, 'is-total') +
      '</tbody></table></div>' +
      '<div class="nx-totais">' +
        '<div><span>Valor da mercadoria' + u + '</span><b>' + b.m(v.X) + '</b></div>' +
        '<div><span>(+) Tributos somados ao preço (por fora)</span><b>' + b.m(v.tributosFora) + '</b></div>' +
        '<div class="is-total"><span>Valor total ao cliente' + u + '</span><b>' + b.m(v.total) + '</b></div>' +
        outraBase +
      '</div>' + (comMarkup ? markupNota(v) : '');
  }

  function coluna(v, titulo, sub, classe, A) {
    var b = RTC.views.baseCalculo(A);
    if (!v) return U.cartao({ classe: 'nx-period ' + classe, eyebrow: sub, titulo: titulo, corpo: '<p class="nx-muted">Sem dados.</p>' });
    if (v.erro) return U.cartao({ classe: 'nx-period ' + classe, eyebrow: sub, titulo: titulo, corpo: '<div class="nx-blocked"><b>Preço não calculado</b><p>' + esc(v.erro) + '</p></div>' });
    var vx = b.unidade ? RTC.engine.porUnidade(v, b.q) : v;
    var prefixo = 'preco|' + (b.operacao ? 'op' : 'prod') + '|' + classe;
    var topo = b.operacao
      ? '<p class="nx-soma-op">Soma dos produtos (' + esc(b.rotulo) + '): cada produto forma o preço com o próprio markup divisor (método A) ou a própria margem efetiva (método B). Para ver a fórmula e o denominador do markup, escolha um produto em “Analisar”.</p>'
      : divisor(vx, b, A, prefixo + '|formula');
    return U.cartao({ classe: 'nx-period ' + classe, eyebrow: sub, titulo: titulo + (b.unidade ? (b.operacao ? ' · média por unidade' : ' · por unidade') : ''),
      corpo: topo + tabelaItens(vx, b, A, prefixo + '|item') + dre(vx, v, b, b.operacao && A.d.ui.detalhes === 'mais') });
  }

  function colunas(A) {
    if (RTC.views.visaoOperacao(A)) {
      var c = A.cons;
      var p = c && c.principal;
      if (!c || !c.custo26) return U.alertas(c ? c.erros : [], []);
      if (!p || p.incompleto) return U.alertas([{ msg: 'Preço da operação não calculado: complete ' + ((p && p.pendentes) || []).join('; ') + '.' }], []);
      return '<div class="nx-cols-2">' +
        coluna(p.v26, '2026', 'Regras atuais · ICMS e PIS/Cofins embutidos no preço', 'p26', A) +
        coluna(p.v27, 'Janeiro de 2027', 'Reforma · CBS e IBS somados ao preço', 'p27', A) +
        '</div>';
    }
    var r = A.res;
    if (!r.custo26) return U.alertas(r.erros, []);
    var base = r.modo === 'A' ? r.a1 : r.a2;
    if (r.erros.length && !(base && base.v26)) return U.alertas(r.erros, []);
    var nota = r.modo === 'B' && r.a2 ? '<p class="nx-lead">Preço de 2026: ' + esc(r.a2.origemPreco) + '. Em 2027: ' + esc(r.a2.criterio || '') + '.</p>' : '';
    return nota + '<div class="nx-cols-2">' +
      coluna(base.v26, '2026', 'Regras atuais · ICMS e PIS/Cofins embutidos no preço', 'p26', A) +
      coluna(base.v27, 'Janeiro de 2027', 'Reforma · ICMS embutido, CBS e IBS somados ao preço', 'p27', A) +
      '</div>';
  }

  /** A resposta da tela numa frase: quanto o cliente paga em 2026 e em 2027, e a margem que sobra */
  function resumo(A) {
    var b = RTC.views.baseCalculo(A);
    var v26, v27, modo = null;
    if (b.operacao) {
      var p = A.cons && A.cons.principal;
      if (!A.cons || !A.cons.custo26 || !p || p.incompleto || !p.v26 || !p.v27 || p.v26.erro || p.v27.erro) return '';
      v26 = p.v26; v27 = p.v27;
    } else {
      var r = A.res;
      var base = r && r.custo26 ? (r.modo === 'A' ? r.a1 : r.a2) : null;
      if (!base || !base.v26 || !base.v27 || base.v26.erro || base.v27.erro) return '';
      v26 = base.v26; v27 = base.v27; modo = r.modo;
    }
    if (b.unidade) { v26 = RTC.engine.porUnidade(v26, b.q); v27 = RTC.engine.porUnidade(v27, b.q); }
    var t26 = Math.round(v26.total * 100) / 100, t27 = Math.round(v27.total * 100) / 100;
    var d = Math.round((t27 - t26) * 100) / 100, pct = t26 ? d / t26 * 100 : 0;
    var oque = b.operacao ? (b.unidade ? 'em média, por unidade desta operação (1 ' + esc(b.un) + ')' : 'por esta operação') : (b.unidade ? 'por unidade deste produto (1 ' + esc(b.un) + ')' : 'por este produto');
    var txt = 'Em janeiro de 2027, o cliente paga <b>' + b.m(v27.total) + '</b> ' + oque + ', contra <b>' + b.m(v26.total) + '</b> em 2026' +
      (Math.abs(d) < 0.005 ? ': o mesmo valor.' : ': ' + b.m(Math.abs(d)) + (d > 0 ? ' a mais' : ' a menos') + ' (' + F.signedPct(pct) + ').');
    var sub = 'Margem de contribuição: ' + F.pct(v26.pct.margemContrib) + ' em 2026 e ' + F.pct(v27.pct.margemContrib) + ' em 2027. ' +
      (modo === 'A' ? 'O preço foi calculado para dar a margem desejada. ' : modo === 'B' ? 'O preço foi informado; a margem é o resultado. ' : '') +
      'O total ao cliente inclui os tributos somados ao preço (CBS, IBS, IPI e ICMS-ST).';
    return U.resposta(txt, sub);
  }

  /**
   * "Quanto devo cobrar em 2027?" — preço que mantém, em R$, o lucro de 2026.
   * Fica oculto até o usuário clicar em "Mostrar resultado" (para apresentar ao cliente depois do comparativo).
   */
  function quantoCobrar(A) {
    var b = RTC.views.baseCalculo(A);
    var r = b.operacao ? A.cons : A.res;
    var a3 = r && r.a3;
    var cab = { classe: 'nx-cobrar-card', id: 'nx-cobrar', eyebrow: 'Planejamento de preço · 2027', titulo: 'Quanto devo cobrar em 2027?' };
    if (!r || !r.custo26) return '';
    if (!a3 || a3.incompleto || !a3.v26 || !a3.v27) {
      var falta = a3 && a3.incompleto ? 'Complete os produtos: ' + a3.pendentes.join('; ') + '.' : 'Informe a margem desejada ou o preço de venda atual para calcular.';
      return U.cartao(Object.assign(cab, { corpo: '<p class="nx-muted">' + esc(falta) + '</p>' }));
    }
    if (a3.v27.erro) return U.cartao(Object.assign(cab, { corpo: '<div class="nx-blocked"><b>Não foi possível calcular</b><p>' + esc(a3.v27.erro) + '</p></div>' }));
    if (!A.cobrarVisivel) {
      return U.cartao(Object.assign(cab, {
        classe: 'nx-cobrar-card is-oculto',
        sub: 'O resultado está pronto e oculto. Revele quando for apresentar ao cliente, depois de analisar o comparativo de 2026 e 2027 acima.',
        acoes: U.botao('Mostrar resultado', 'mostrar-cobrar', { tipo: 'primary', classe: 'sm', titulo: 'Exibir o preço que mantém em 2027 o lucro de 2026' }),
        corpo: '<div class="nx-cobrar-oculto" aria-hidden="true"><span class="nx-cobrar-ph"></span><span class="nx-cobrar-ph is-medio"></span><span class="nx-cobrar-ph is-curto"></span></div>'
      }));
    }
    var v26 = b.unidade ? RTC.engine.porUnidade(a3.v26, b.q) : a3.v26;
    var v27 = b.unidade ? RTC.engine.porUnidade(a3.v27, b.q) : a3.v27;
    var liquida = a3.baseMargem === 'liquida';
    var l26 = liquida ? v26.lucroLiquido : v26.margemContrib;
    var l27 = liquida ? v27.lucroLiquido : v27.margemContrib;
    var p26 = liquida ? v26.pct.lucroLiquido : v26.pct.margemContrib;
    var p27 = liquida ? v27.pct.lucroLiquido : v27.pct.margemContrib;
    var dTot = v26.total ? (v27.total - v26.total) / v26.total * 100 : 0;
    var u = b.unidade ? (b.operacao ? ' (média por unidade)' : ' (por unidade)') : '';
    var outra = '';
    if (!b.unidade && b.q > 0) outra = '<p class="nx-note">Por unidade: cobrar <b>' + F.unit(a3.v27.total / b.q) + '</b> (2026: ' + F.unit(a3.v26.total / b.q) + ').</p>';
    else if (b.unidade) outra = '<p class="nx-note">Quantidade total: cobrar <b>' + F.brl(a3.v27.total) + '</b> (2026: ' + F.brl(a3.v26.total) + ').</p>';
    // comparação com a manutenção da margem percentual (análise 1)
    var a1 = r.a1 && !r.a1.incompleto && r.a1.v27 && !r.a1.v27.erro ? r.a1 : null;
    var cmpMargem = a1 ? '<li><span>Para manter a mesma margem percentual de 2026, o total seria</span><b>' + b.m(b.unidade ? a1.v27.total / b.q : a1.v27.total) + '</b></li>' : '';
    var chave = 'cobrar|' + (b.operacao ? 'op' : 'prod');
    var aberto = U.detalheAberto(A, chave);
    var detalhe = '<div class="nx-det-bloco" data-det="' + esc(chave) + '"' + (aberto ? '' : ' hidden') + '>' +
      (b.operacao ? '<p class="nx-note">Soma dos produtos: cada produto mantém, em R$, o próprio lucro de 2026.</p>' : '<div class="nx-formula">Preço = (custo líquido de 2027 + lucro de 2026) ÷ (1 − tributos sobre a venda − despesas variáveis)</div><div class="nx-formula is-num">' + esc(formulaNum(v27, b)) + '</div>') +
      '<ul class="nx-cobrar-lista">' +
        '<li><span>Custo líquido de aquisição</span><b>' + b.m(v26.C) + ' → ' + b.m(v27.C) + '</b></li>' +
        '<li><span>Tributos sobre a venda por dentro</span><b>' + b.m(v26.tributosDentro) + ' → ' + b.m(v27.tributosDentro) + '</b></li>' +
        '<li><span>Tributos por fora (CBS/IBS, IPI)</span><b>' + b.m(v26.tributosFora) + ' → ' + b.m(v27.tributosFora) + '</b></li>' +
        '<li><span>Despesas variáveis</span><b>' + b.m(v26.despesas) + ' → ' + b.m(v27.despesas) + '</b></li>' +
        cmpMargem +
      '</ul></div>';
    return U.cartao(Object.assign(cab, {
      acoes: U.botao('Ocultar', 'ocultar-cobrar', { classe: 'sm', titulo: 'Esconder o resultado novamente' }),
      sub: 'Preço para lucrar em 2027 o mesmo valor, em reais, que em 2026 — já com a CBS/IBS e o custo de aquisição de 2027. Lucro considerado: ' + esc(a3.medida) + '.',
      corpo: '<div class="nx-cobrar">' +
        '<div class="nx-cobrar-hero"><small>Cobrar do cliente em 2027' + u + '</small><b>' + b.m(v27.total) + '</b>' +
          '<span class="nx-cobrar-var ' + (dTot > 0.005 ? 'is-sobe' : dTot < -0.005 ? 'is-desce' : '') + '">' + F.signedPct(dTot) + ' em relação a 2026 (' + b.m(v26.total) + ')</span></div>' +
        '<dl class="nx-cobrar-dl">' +
          '<div><dt>Valor da mercadoria</dt><dd>' + b.m(v27.X) + '</dd></div>' +
          '<div><dt>(+) Tributos por fora</dt><dd>' + b.m(v27.tributosFora) + '</dd></div>' +
          '<div><dt>Lucro em 2026</dt><dd>' + b.m(l26) + ' <small>(' + F.pct(p26) + ' do preço)</small></dd></div>' +
          '<div><dt>Lucro em 2027 com este preço</dt><dd><b>' + b.m(l27) + '</b> <small>(' + F.pct(p27) + ' do preço)</small></dd></div>' +
        '</dl></div>' + outra +
        '<p class="nx-note">Referência de 2026: ' + esc(a3.origemPreco || 'preço de cada produto') + '. O percentual de margem muda porque o preço muda; o lucro em reais é o mesmo.</p>' +
        '<div class="nx-det-cab">' + U.botaoDetalhe(chave, aberto, 'Ver o cálculo') + '<span>Como chegamos a esse preço</span></div>' + detalhe
    }));
  }

  /** Preço e margem por produto (unitário e total) e total da operação */
  function tabelaOperacao(A) {
    var c = A.cons;
    if (!c || c.n < 2 || !RTC.views.visaoOperacao(A)) return '';
    var V = RTC.views;
    function base(r) { return r.modo === 'B' ? r.a2 : r.a1; }
    function pctTot(v26, v27) { return v26.total ? (v27.total - v26.total) / v26.total * 100 : 0; }
    var ver = !!A.cobrarVisivel; // a coluna "Cobrar em 2027" só aparece depois de revelar o resultado
    var rows = c.itens.map(function (x) {
      var b = base(x.r);
      var q = Number(x.item.produto.quantidade) || 0;
      if (x.inconsistente || !b || !b.v26 || !b.v27 || b.v26.erro || b.v27.erro) return '<tr><td class="c-prod">' + esc(x.nome) + '</td><td colspan="' + (ver ? 6 : 5) + '"><span class="nx-count is-erro">' + (x.r.erros.length || 1) + ' pendência(s)</span> <button type="button" class="nx-link-btn" data-acao="ir" data-rota="operacao">corrigir no cadastro</button></td></tr>';
      var a3 = x.r.a3 && x.r.a3.v27 && !x.r.a3.v27.erro ? x.r.a3 : null;
      return '<tr><td class="c-prod"><button type="button" class="nx-link-btn" data-acao="selecionar-produto" data-id="' + esc(x.item.id) + '" title="Analisar só este produto"><strong>' + esc(x.nome) + '</strong></button><small class="nx-obs">' + (x.r.modo === 'B' ? 'Método B · preço informado' : 'Método A · preço pela margem') + (q ? ' · ' + F.num(q, q % 1 ? 4 : 0) + ' ' + esc(x.item.produto.unidade || 'un') : '') + '</small></td>' +
        '<td class="num">' + (q ? V.par(b.v26.X / q, b.v27.X / q, F.unit) : '—') + '</td>' +
        '<td class="num">' + V.par(b.v26.X, b.v27.X, F.brl) + '</td>' +
        '<td class="num">' + V.par(b.v26.total, b.v27.total, F.brl, true) + '</td>' +
        '<td class="num">' + V.variacao(b.v27.total - b.v26.total, pctTot(b.v26, b.v27)) + '</td>' +
        '<td class="num">' + V.par(b.v26.pct.margemContrib, b.v27.pct.margemContrib, function (v) { return F.pct(v); }) + '</td>' +
        (ver ? '<td class="num">' + (a3 ? '<b class="nx-cobrar-cel">' + F.brl(a3.v27.total) + '</b>' : '—') + '</td>' : '') + '</tr>';
    }).join('');
    var p = c.principal && !c.principal.incompleto ? c.principal : null;
    var qc = c.qtdComum;
    var c3 = c.a3 && !c.a3.incompleto && c.a3.v27 ? c.a3 : null;
    var t = p ? '<tr class="is-total"><td class="c-prod">Total da operação' + (qc ? '<small class="nx-obs">' + F.num(qc.quantidade, qc.quantidade % 1 ? 4 : 0) + ' ' + esc(qc.unidade) + '</small>' : '') + '</td>' +
      '<td class="num">' + (qc ? V.par(p.v26.X / qc.quantidade, p.v27.X / qc.quantidade, F.unit) : '') + '</td>' +
      '<td class="num">' + V.par(p.v26.X, p.v27.X, F.brl) + '</td>' +
      '<td class="num">' + V.par(p.v26.total, p.v27.total, F.brl, true) + '</td>' +
      '<td class="num">' + V.variacao(p.v27.total - p.v26.total, pctTot(p.v26, p.v27)) + '</td>' +
      '<td class="num">' + V.par(p.v26.pct.margemContrib, p.v27.pct.margemContrib, function (v) { return F.pct(v); }) + '</td>' +
      (ver ? '<td class="num">' + (c3 ? '<b class="nx-cobrar-cel">' + F.brl(c3.v27.total) + '</b>' : '—') + '</td>' : '') + '</tr>' : '';
    return U.cartao({ eyebrow: 'Operação completa', titulo: 'Preço e margem por produto',
      sub: 'Em cada célula, 2026 em cima e janeiro de 2027 embaixo, em laranja. Cada produto segue o método do seu cadastro (A: margem → preço; B: preço → margem).' + (ver ? ' A última coluna mostra quanto cobrar em 2027 para manter o lucro de 2026.' : '') + ' Clique em um produto para analisá-lo sozinho.',
      corpo: '<div class="nx-table-wrap"><table class="nx-table compact nx-tab-par"><thead><tr><th>Produto</th><th class="num">Preço unitário<small class="nx-th-dica">mercadoria, por unidade</small></th><th class="num">Valor da mercadoria</th><th class="num">Total ao cliente<small class="nx-th-dica">com tributos somados</small></th><th class="num">Variação<small class="nx-th-dica">do total ao cliente</small></th><th class="num">Margem<small class="nx-th-dica">de contribuição</small></th>' + (ver ? '<th class="num">Cobrar em 2027<small class="nx-th-dica">mesmo lucro de 2026</small></th>' : '') + '</tr></thead><tbody>' + rows + t + '</tbody></table></div>' });
  }

  function controlesProduto(A) {
    var s = A.item();
    var un = s.produto.unidade || 'UN';
    var q = Number(s.produto.quantidade) || 0;
    var unidade = s.venda.basePreco === 'unitario';
    var campoPreco = unidade
      ? U.campo({ scope: 'sim', path: 'venda.precoUnitarioAtual', tipo: 'unit', valor: s.venda.precoUnitarioAtual, rotulo: 'Preço de venda informado por unidade', largura: 'md', dica: 'Preço de 1 ' + un + ' (mercadoria, com ICMS e PIS/Cofins embutidos). O total é quantidade × este preço.' })
      : U.campo({ scope: 'sim', path: 'venda.precoAtual', tipo: 'money', valor: s.venda.precoAtual, rotulo: 'Preço de venda informado (quantidade total)', largura: 'md', dica: 'Preço de toda a quantidade cadastrada (' + (q ? F.num(q, q % 1 ? 4 : 0) + ' ' + un : 'quantidade não informada') + ').' });
    return U.cartao({
      eyebrow: 'Parâmetros da venda · ' + esc(s.produto.descricao || 'produto'), titulo: 'Forma de cálculo',
      corpo: U.segmento({ scope: 'sim', path: 'venda.modo', valor: s.venda.modo, rotulo: 'Método', opcoes: [['A', 'A · Sei a margem, quero o preço', 'margem → preço (markup divisor)'], ['B', 'B · Sei o preço, quero a margem', 'preço → margem efetiva do preço informado']] }) +
        '<div class="nx-form-grid">' +
          U.campo({ scope: 'sim', path: 'venda.margem', tipo: 'pct', valor: s.venda.margem, rotulo: 'Margem desejada', largura: 'sm' }) +
          campoPreco +
          U.selecao({ scope: 'sim', path: 'premissas.baseMargem', valor: s.premissas.baseMargem, rotulo: 'Margem medida', largura: 'md', opcoes: [['operacional', 'Antes de IRPJ/CSLL'], ['liquida', 'Após IRPJ/CSLL']] }) +
        '</div>' +
        (A.d.ui.detalhes === 'mais' ? '<p class="nx-note">Por unidade, todos os valores em reais são divididos pela quantidade; os percentuais (margem, tributos, despesas) são os mesmos da quantidade total. Percentuais convertidos em decimais antes do cálculo (20% = 0,20). O denominador deve ser maior que zero; caso contrário, nenhum preço é exibido.</p>' : '')
    });
  }

  RTC.views.preco = {
    render: function (A) {
      var vazio = RTC.views.semEmpresaOuSim(A);
      if (vazio) return vazio;
      var topo = RTC.views.seletorAnalise(A, 'Calcular o preço por');
      var resp = '<div data-live="preco-resumo">' + resumo(A) + '</div>';
      // "Quanto devo cobrar em 2027" vem depois dos comparativos de 2026 × 2027
      var cobrar = '<div data-live="preco-cobrar">' + quantoCobrar(A) + '</div>';
      if (RTC.views.visaoOperacao(A)) {
        return '<div class="nx-stack">' + topo + resp +
          U.explica('Como o preço é formado?', '<p>Formação do preço da operação completa: soma dos produtos, cada um com o seu método, margem e despesas.</p><p>Para alterar margem, método ou preço informado, escolha um produto em “Analisar”.</p>') +
          '<div data-live="preco-operacao">' + tabelaOperacao(A) + '</div><div data-live="preco-colunas">' + colunas(A) + '</div>' + cobrar + '</div>';
      }
      return '<div class="nx-stack">' + topo + resp + controlesProduto(A) + '<div data-live="preco-colunas">' + colunas(A) + '</div>' + cobrar + '</div>';
    },
    live: { 'preco-resumo': resumo, 'preco-colunas': colunas, 'preco-operacao': tabelaOperacao, 'preco-cobrar': quantoCobrar }
  };
})(typeof window !== 'undefined' ? window : globalThis);
