/* RTC Comparativo — tela 4: painel comparativo 2026 × janeiro de 2027 */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  /** Resultado exibido: operação consolidada (padrão) ou um produto específico */
  function fonte(A) {
    var v = A.d.ui.visao || 'consolidado';
    if (v !== 'consolidado') {
      var x = A.resultadoItem(v);
      if (x) return x.r;
    }
    return A.cons || A.res;
  }
  function ehConsolidado(A) { var r = fonte(A); return !!(r && r.consolidado); }

  function analiseAtual(A) {
    var r = fonte(A);
    var ui = A.d.ui.analise === '2' ? '2' : '1';
    var base = ui === '1' ? r.a1 : r.a2;
    var ok = base && base.v26 && base.v27 && !base.v26.erro && !base.v27.erro;
    return { id: ui, base: base, ok: ok };
  }

  function linhaCmp(rot, a, b, opts) {
    opts = opts || {};
    var fmt = opts.pct ? function (v) { return F.pct(v); } : F.brl;
    var dAbs = a != null && b != null ? b - a : null;
    var dPct = !opts.pct && a ? dAbs / Math.abs(a) * 100 : null;
    return '<tr' + (opts.cls ? ' class="' + opts.cls + '"' : '') + '><th scope="row">' + rot + (opts.nota ? '<small>' + esc(opts.nota) + '</small>' : '') + '</th>' +
      '<td class="num">' + (a != null ? fmt(a) : '—') + '</td><td class="num">' + (b != null ? fmt(b) : '—') + '</td>' +
      '<td class="num">' + (dAbs == null ? '—' : opts.pct ? F.signedPp(dAbs) : F.signedBrl(dAbs)) + '</td>' +
      '<td class="num">' + (dPct == null ? '—' : F.signedPct(dPct)) + '</td></tr>';
  }

  function tabela(A, an) {
    var r = fonte(A), c26 = r.custo26, c27 = r.custo27, v26 = an.base.v26, v27 = an.base.v27;
    return '<div class="nx-table-wrap"><table class="nx-table nx-cmp"><thead><tr><th>Indicador</th><th class="num">2026</th><th class="num">Jan/2027</th><th class="num">Diferença<small class="nx-th-dica">p.p. = pontos percentuais</small></th><th class="num">Variação</th></tr></thead>' +
      '<tbody><tr class="nx-group"><th colspan="5">Custo de aquisição</th></tr>' +
      linhaCmp('Custo bruto de aquisição', c26.bruto, c27.bruto) +
      linhaCmp('Tributos recuperáveis (créditos)', c26.totalCreditos, c27.totalCreditos, { nota: '2026: ICMS, IPI, PIS/Cofins · 2027: ICMS, IPI, CBS, IBS' }) +
      linhaCmp('Tributos não recuperáveis no custo', c26.totalNaoRecuperaveis, c27.totalNaoRecuperaveis) +
      linhaCmp('Custo líquido de aquisição', c26.liquido, c27.liquido, { cls: 'is-total' }) +
      '</tbody><tbody><tr class="nx-group"><th colspan="5">Preço e tributos na venda</th></tr>' +
      linhaCmp(an.id === '1' ? 'Preço sugerido (valor da mercadoria)' : 'Preço praticado (valor da mercadoria)', v26.X, v27.X) +
      linhaCmp('Tributos embutidos no preço (por dentro)', v26.tributosDentro, v27.tributosDentro, { nota: 'ICMS, PIS/Cofins ou DAS' }) +
      linhaCmp('Tributos somados ao preço (por fora)', v26.tributosFora, v27.tributosFora, { nota: 'CBS, IBS, IPI, ICMS-ST retido' }) +
      linhaCmp('Valor total cobrado do cliente', v26.total, v27.total, { cls: 'is-total' }) +
      '</tbody><tbody><tr class="nx-group"><th colspan="5">Resultado da operação</th></tr>' +
      linhaCmp('Lucro bruto', v26.lucroBruto, v27.lucroBruto) +
      linhaCmp('Despesas variáveis', v26.despesas, v27.despesas) +
      linhaCmp('Margem de contribuição (R$)', v26.margemContrib, v27.margemContrib) +
      linhaCmp('Margem de contribuição (% do preço)', v26.pct.margemContrib, v27.pct.margemContrib, { pct: true }) +
      linhaCmp('IRPJ/CSLL estimados', v26.irCs, v27.irCs) +
      linhaCmp('Lucro líquido da operação', v26.lucroLiquido, v27.lucroLiquido, { cls: 'is-total' }) +
      linhaCmp('Lucro líquido (% do preço)', v26.pct.lucroLiquido, v27.pct.lucroLiquido, { pct: true }) +
      '</tbody></table></div>';
  }

  function tributosPorPeriodo(an) {
    var ids = [];
    var nomes = {};
    [an.base.v26, an.base.v27].forEach(function (v) { v.linhas.forEach(function (l) { if (l.tipo !== 'despesa' && ids.indexOf(l.id) < 0) { ids.push(l.id); nomes[l.id] = l.nome; } }); });
    function val(v, id) { var l = v.linhas.filter(function (x) { return x.id === id; })[0]; return l ? l : null; }
    return '<div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Tributo</th><th>Como entra no preço</th><th class="num">2026</th><th class="num">Jan/2027</th></tr></thead><tbody>' +
      ids.map(function (id) {
        var a = val(an.base.v26, id), b = val(an.base.v27, id);
        var l = a || b;
        var info = l.tipo === 'info';
        return '<tr' + (info ? ' class="is-info"' : '') + '><td>' + esc(nomes[id]) + '</td><td>' + RTC.views.natureza(l) + '</td>' +
          '<td class="num">' + (a ? (info ? '(' + F.brl(a.valor) + ')' : F.brl(a.valor)) : '—') + '</td><td class="num">' + (b ? (b.tipo === 'info' ? '(' + F.brl(b.valor) + ')' : F.brl(b.valor)) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="nx-note">Valores entre parênteses são informativos (sem ônus): IBS/CBS-teste de 2026 (LC 214/2025, art. 348).</p>';
  }

  function sensibilidade(A) {
    var r = fonte(A);
    if (!r.sensibilidade) return '';
    var rows = r.sensibilidade.map(function (s) {
      return '<tr' + (s.atual ? ' class="is-total"' : '') + '><td>' + F.pct(s.cbsRef) + (s.atual ? ' <small>(parâmetro atual)</small>' : '') + '</td>' +
        '<td class="num">' + (s.preco27 != null ? F.brl(s.preco27) : '—') + '</td><td class="num">' + (s.total27 != null ? F.brl(s.total27) : '—') + '</td>' +
        '<td class="num">' + (s.varTotal != null ? F.signedPct(s.varTotal) : '—') + '</td><td class="num">' + (s.margem27 != null ? F.pct(s.margem27) : '—') + '</td></tr>';
    }).join('');
    return U.cartao({
      eyebrow: 'Sensibilidade', titulo: 'Alíquota de referência da CBS em 2027',
      sub: 'A alíquota oficial depende de Resolução do Senado (LC 214/2025, art. 349). Veja o efeito de ±0,5 e ±1 ponto percentual.',
      corpo: '<div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>CBS de referência</th><th class="num">Preço 2027 (mesma margem)</th><th class="num">Total ao cliente 2027</th><th class="num">Variação vs 2026</th><th class="num">Margem 2027 (mesmo preço)</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    });
  }

  function kpisTopo(A) {
    var r = fonte(A), cmp = r.comparativo;
    var out = '<div class="nx-kpis k4">';
    if (cmp.a1) {
      out += U.kpi({ rotulo: 'Preço sugerido 2026 (total ao cliente)', valor: F.brl(cmp.a1.total.v26), sub: 'Mercadoria ' + F.brl(cmp.a1.preco.v26) });
      out += U.kpi({ rotulo: 'Preço sugerido 2027 (total ao cliente)', valor: F.brl(cmp.a1.total.v27), sub: 'Mercadoria ' + F.brl(cmp.a1.preco.v27) });
      out += U.kpi({ rotulo: 'Impacto no preço (mesma margem)', dica: 'Quanto o total cobrado do cliente precisa mudar para manter a margem.', valor: F.signedPct(cmp.a1.total.d.pct), deltaTexto: F.signedBrl(cmp.a1.total.d.abs) + (r.a1.margem != null ? ' mantida a margem de ' + F.pct(r.a1.margem) : ' mantidas as margens de cada produto'), delta: cmp.a1.total.d.abs, bomQuando: 'desce', destaque: true });
    } else {
      out += U.kpi({ rotulo: 'Mesma margem', valor: '—', sub: 'Informe a margem desejada' });
    }
    if (cmp.a2) {
      out += U.kpi({ rotulo: 'Impacto no lucro (mesmo preço)', valor: F.signedBrl(cmp.a2.lucroLiquido.d.abs), deltaTexto: 'Margem ' + F.pct(cmp.a2.margemPct.v26) + ' → ' + F.pct(cmp.a2.margemPct.v27) + ' (' + F.signedPp(cmp.a2.margemPct.dpp).replace('p.p.', 'pontos percentuais') + ')', delta: cmp.a2.lucroLiquido.d.abs, bomQuando: 'sobe', dica: 'Quanto o lucro líquido muda em R$ se o preço de 2026 for mantido em 2027.' });
    }
    return out + '</div>';
  }

  /** A resposta da tela numa frase: o efeito da reforma no preço (mesma margem) e no lucro (mesmo preço) */
  function resumo(A) {
    var r = fonte(A), cmp = r.comparativo;
    if (!cmp || (!cmp.a1 && !cmp.a2)) return '';
    var partes = [];
    if (cmp.a1) {
      var d = cmp.a1.total.d;
      partes.push('para manter a margem, o total cobrado do cliente ' + (Math.abs(d.abs) < 0.005 ? 'fica igual' : (d.abs > 0 ? 'precisa subir ' : 'pode cair ') + '<b>' + F.signedPct(d.pct).replace(/^[+−]/, '') + '</b> (' + F.brl(Math.abs(d.abs)) + ')'));
    }
    if (cmp.a2) {
      var l = cmp.a2.lucroLiquido.d.abs;
      partes.push('mantendo o preço, o lucro líquido ' + (Math.abs(l) < 0.005 ? 'fica igual' : (l > 0 ? 'aumenta ' : 'diminui ') + '<b>' + F.brl(Math.abs(l)) + '</b>') + ' e a margem de contribuição vai de ' + F.pct(cmp.a2.margemPct.v26) + ' para <b>' + F.pct(cmp.a2.margemPct.v27) + '</b>');
    }
    var txt = 'Em janeiro de 2027, ' + partes.join('; ') + '.';
    return U.resposta(txt.charAt(0).toUpperCase() + txt.slice(1), (r.consolidado ? 'Operação completa (soma dos produtos). ' : '') + 'Os números abaixo detalham as duas análises: 1 · mesma margem e 2 · mesmo preço.');
  }

  function graficos(A, an) {
    return '<div class="nx-cols-2">' +
      U.cartao({ eyebrow: 'Gráfico', titulo: 'Custo, tributos e margem por período', sub: 'Variação de 2027 sobre 2026 indicada ao lado de cada barra. Valores completos na tabela acima.', corpo: '<div class="nx-chart-box" id="ch-barras"></div>' }) +
      U.cartao({ eyebrow: 'Gráfico', titulo: 'Composição do valor cobrado do cliente', sub: 'Percentuais sobre o valor da mercadoria. Tributos por fora somam-se ao total.', corpo: '<div class="nx-chart-box" id="ch-comp"></div>' }) +
      '</div>';
  }

  function desenhar(el, A) {
    var r = fonte(A);
    if (!r || !r.custo26) return;
    var an = analiseAtual(A);
    if (!an.ok) return;
    var v26 = an.base.v26, v27 = an.base.v27;
    var b = el.querySelector('#ch-barras');
    var c = el.querySelector('#ch-comp');
    var P = N.charts.PALETA.periodo;
    if (b) {
      N.charts.barrasAgrupadas(b, {
        titulo: 'Comparativo por período',
        categorias: ['Custo líquido', 'Tributos por dentro', 'Tributos por fora', 'Despesas variáveis', 'Margem de contribuição', 'Total ao cliente'],
        series: [
          { nome: '2026', cor: P.p2026, valores: [r.custo26.liquido, v26.tributosDentro, v26.tributosFora, v26.despesas, v26.margemContrib, v26.total] },
          { nome: 'Jan/2027', cor: P.p2027, valores: [r.custo27.liquido, v27.tributosDentro, v27.tributosFora, v27.despesas, v27.margemContrib, v27.total] }
        ]
      });
    }
    if (c) {
      function barra(rot, v) {
        return {
          rotulo: rot, total: v.total, base: v.X,
          nota: v.margemContrib < 0 ? 'margem negativa: ' + F.brl(v.margemContrib) : '',
          segmentos: [
            { nome: 'Custo líquido', valor: v.C },
            { nome: 'Tributos por dentro', valor: v.tributosDentro },
            { nome: 'Despesas variáveis', valor: v.despesas },
            { nome: 'Margem de contribuição', valor: Math.max(0, v.margemContrib) },
            { nome: 'Tributos por fora', valor: v.tributosFora }
          ]
        };
      }
      N.charts.composicao(c, { titulo: 'Composição do preço', barras: [barra('2026', v26), barra('2027', v27)] });
    }
  }

  /** Barra compacta: o que analisar (operação ou produto) e qual pergunta responder (mesma margem ou mesmo preço) */
  function seletorVisao(A, an) {
    var pergunta = an ? U.segmento({ compacto: true, scope: 'ui', path: 'analise', valor: an.id, rotulo: 'Análise',
      dica: 'Análise 1: quanto cobrar em 2027 para manter a mesma margem de 2026. Análise 2: que margem sobra em 2027 se o preço for o mesmo.',
      opcoes: [['1', '1 · Mesma margem', 'compara os preços necessários'], ['2', '2 · Mesmo preço', 'compara a margem efetiva']] }) : '';
    return RTC.views.barraAnalise([RTC.views.seletorVisao(A), pergunta]);
  }

  function porProduto(A) {
    var c = A.cons;
    if (!ehConsolidado(A) || !c || c.n < 2) return '';
    var rows = c.itens.map(function (x) {
      var r = x.r;
      var a1 = r.a1 && r.a1.v26 && !r.a1.v26.erro && r.a1.v27 && !r.a1.v27.erro ? r.a1 : null;
      var a2 = r.a2 && r.a2.v26 && r.a2.v27 ? r.a2 : null;
      return '<tr><td>' + esc(x.nome) + '</td>' +
        '<td class="num">' + (a1 ? F.brl(a1.v26.total) : '—') + '</td><td class="num">' + (a1 ? F.brl(a1.v27.total) : '—') + '</td><td class="num">' + (a1 ? F.signedPct((a1.v27.total - a1.v26.total) / a1.v26.total * 100) : '—') + '</td>' +
        '<td class="num">' + (a2 ? F.pct(a2.v26.pct.margemContrib) : '—') + '</td><td class="num">' + (a2 ? F.pct(a2.v27.pct.margemContrib) : '—') + '</td><td class="num">' + (a2 ? F.signedPp(a2.v27.pct.margemContrib - a2.v26.pct.margemContrib) : '—') + '</td></tr>';
    }).join('');
    return U.cartao({ eyebrow: 'Operação', titulo: 'Resultado por produto', sub: 'Total ao cliente mantida a margem (análise 1) e margem efetiva mantido o preço (análise 2).', corpo: '<div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Produto</th><th class="num">Total 2026</th><th class="num">Total 2027</th><th class="num">Variação</th><th class="num">Margem 2026</th><th class="num">Margem 2027</th><th class="num">Diferença</th></tr></thead><tbody>' + rows + '</tbody></table></div>' });
  }

  RTC.views.comparativo = {
    render: function (A) {
      var vazio = RTC.views.semEmpresaOuSim(A);
      if (vazio) return vazio;
      var r = fonte(A);
      if (!r || !r.custo26) return '<div class="nx-stack">' + seletorVisao(A) + U.cartao({ titulo: 'Complete o cadastro dos produtos', corpo: U.alertas(r ? r.erros : [], []) + U.botao('Ir para o cadastro da operação', 'ir', { dados: { rota: 'operacao' }, tipo: 'primary' }) }) + '</div>';
      var an = analiseAtual(A);
      var corpo;
      if (!an.ok) {
        var msg = an.base && an.base.incompleto ? 'Análise indisponível para a operação: complete os produtos ' + an.base.pendentes.join('; ') + '.' : (an.id === '1' ? (r.erros.length ? '' : 'Informe a margem desejada no cadastro do produto.') : 'Informe o preço de venda atual ou a margem desejada.');
        corpo = U.cartao({ titulo: 'Análise indisponível', corpo: U.alertas(r.erros, msg ? [{ msg: msg }] : []) });
      } else {
        corpo = U.cartao({
          eyebrow: an.id === '1' ? 'Análise 1 · ' + (r.a1.margem != null ? 'margem de ' + F.pct(r.a1.margem) + ' nos dois períodos' : 'margem de cada produto mantida nos dois períodos') : 'Análise 2 · ' + (r.a2.origemPreco || ''),
          titulo: an.id === '1' ? 'Preço necessário para manter a margem' : 'Margem efetiva mantendo o preço',
          sub: an.id === '2' ? esc(r.a2.criterio || '') : (r.consolidado ? 'Soma dos produtos da operação; margem conforme o cadastro de cada produto.' : 'Margem ' + ((A.resultadoItem(A.d.ui.visao) || {}).item && A.resultadoItem(A.d.ui.visao).item.premissas.baseMargem === 'liquida' ? 'após' : 'antes de') + ' IRPJ/CSLL, sobre o valor da mercadoria.'),
          corpo: tabela(A, an)
        }) + graficos(A, an) +
        U.cartao({ eyebrow: 'Detalhe', titulo: 'Tributos incidentes na venda por período', corpo: tributosPorPeriodo(an) });
      }
      var prem = U.cartao({ eyebrow: 'Premissas', titulo: 'Premissas e avisos' + (r.consolidado ? ' da operação' : ' do produto'), corpo: '<ul class="nx-premissas">' + (r.premissas || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' + U.alertas(r.erros, r.avisos) });
      return '<div class="nx-stack">' + seletorVisao(A, an) + resumo(A) + kpisTopo(A) + corpo + porProduto(A) + sensibilidade(A) + prem + '</div>';
    },
    depois: desenhar
  };
})(typeof window !== 'undefined' ? window : globalThis);
