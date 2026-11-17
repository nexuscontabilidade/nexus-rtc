/* Lucratividade por Item — etapa 5: relatório da análise escolhida, em PDF ou Excel */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  /** Análise escolhida para o relatório (padrão: a análise aberta) */
  function analiseRelatorio(L) {
    var emp = L.empresa();
    if (!emp) return null;
    var ans = L.analisesDa(emp.id);
    var id = L.d.ui.relatorioAnaliseId;
    return ans.filter(function (a) { return a.id === id; })[0] || L.analise() || ans[0] || null;
  }
  /** Opções do relatório para o gerador (LC.relatorio) */
  function opcoes(L) {
    var an = analiseRelatorio(L);
    return an ? { empresa: L.empresa(), analise: an, params: L.params(an), incluirDre: L.d.ui.relatorioDre !== false } : null;
  }
  LC.views.opcoesRelatorio = opcoes;

  LC.views.relatorio = {
    render: function (L) {
      var vazio = LC.views.semDados(L, false);
      if (vazio) return vazio;
      var emp = L.empresa(), an = analiseRelatorio(L);
      var ans = L.analisesDa(emp.id);
      var o = opcoes(L);
      var dd = LC.relatorio.dados(o);
      var s = dd.resumo;
      var escolha = U.cartao({ eyebrow: 'Relatório', titulo: 'Escolha a análise e o formato',
        sub: 'Identificação, resumo, resultado por item e DRE da análise, no cenário escolhido (' + L.cenario() + ').',
        corpo: '<div class="nx-form-grid">' +
            U.selecao({ scope: 'ui', path: 'relatorioAnaliseId', valor: an.id, rotulo: 'Análise', largura: 'lg', opcoes: ans.map(function (a) { return [a.id, a.nome + ' (' + a.itens.length + (a.itens.length === 1 ? ' item' : ' itens') + ')']; }) }) +
            '<div class="nx-field w-md">' + U.chave({ scope: 'ui', path: 'relatorioDre', marcado: L.d.ui.relatorioDre !== false, rotulo: 'Incluir a DRE de cada item', ajuda: 'Desmarque para um relatório mais curto, só com o resumo e a DRE da análise.' }) + '</div>' +
          '</div>' +
          '<div class="nx-btn-row">' + U.botao('Baixar PDF', 'lc-relatorio-pdf', { tipo: 'primary', desabilitado: !an.itens.length }) + U.botao('Baixar Excel', 'lc-relatorio-xlsx', { desabilitado: !an.itens.length }) + '</div>' +
          (an.itens.length ? '' : '<p class="nx-note">A análise escolhida não tem itens.</p>') });
      if (!an.itens.length) return '<div class="nx-stack">' + escolha + '</div>';
      var kpis = '<div class="nx-kpis k4">' +
        U.kpi({ rotulo: 'Faturamento', valor: F.brl(s.faturamento), sub: 'receita após descontos ' + F.brl(s.pld) }) +
        U.kpi({ rotulo: 'Custo líquido de aquisição', valor: F.brl(s.custoLiquido), sub: 'créditos (ICMS e ' + dd.rotuloCredito + ') ' + F.brl(s.creditos) }) +
        U.kpi({ rotulo: 'Lucro total', valor: F.brl(s.lucro), destaque: true, sub: s.comPreco + ' de ' + s.itens + ' item(ns) com preço' }) +
        U.kpi({ rotulo: 'Margem total', valor: s.margem != null ? F.pct(s.margem * 100) : '—', sub: s.porSituacao.negativa + ' com prejuízo · ' + s.porSituacao.abaixo + ' abaixo da meta' }) + '</div>';
      var dre = '<div class="nx-table-wrap"><table class="nx-table lc-dre"><thead><tr><th>DRE da análise</th><th class="num">Total</th><th class="num">AV %</th></tr></thead><tbody>' +
        dd.dre.map(function (l) {
          var fx = l.nivel === 'final' ? (s.lucro < 0 ? ' is-negativa' : ' is-ok') : '';
          return '<tr class="is-' + l.nivel + fx + '"><td>' + esc(l.nome) + '</td><td class="num">' + F.brl(l.total) + '</td><td class="num">' + (l.av != null ? F.pct(l.av * 100) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      var previa = U.cartao({ eyebrow: 'Prévia · ' + esc(an.nome) + ' · cenário ' + dd.cenario, titulo: 'Resumo e DRE da análise', corpo: kpis + dre +
        (dd.cenario === '2027' && s.tributosFora > 0.004 ? '<p class="nx-note">Cenário 2027: a CBS e o IBS cobrados dos clientes por fora somam <b>' + F.brl(s.tributosFora) + '</b>; os clientes pagam <b>' + F.brl(s.totalCliente) + '</b>. Eles não entram no faturamento nem no lucro.</p>' : '') +
        '<p class="nx-note">O PDF sai em A4 paisagem, com a identidade da Nexus; o Excel tem as abas Resumo, Itens' + (L.d.ui.relatorioDre !== false ? ' e DRE por item' : '') + '.</p>' });
      return '<div class="nx-stack">' + escolha + previa + '</div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
