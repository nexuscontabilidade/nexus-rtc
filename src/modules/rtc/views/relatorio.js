/* RTC Comparativo — tela 5: relatório (modelos completo e simplificado) e exportação em PDF e Excel */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  function memoria(m) {
    var grupoAtual = null;
    var linhas = m.linhas.map(function (l) {
      var cab = '';
      if (l.grupo !== grupoAtual) { grupoAtual = l.grupo; cab = '<tr class="nx-group"><th colspan="10">' + esc(l.grupo) + '</th></tr>'; }
      var valor = l.valor != null ? (l.unitario ? F.unit(l.valor) : (l.info ? '<span class="nx-muted">(' + F.brl(l.valor) + ')</span>' : F.brl(l.valor))) : (l.numero != null ? F.num(l.numero, 4) : '');
      return cab + '<tr' + (l.destaque ? ' class="is-total"' : l.info ? ' class="is-info"' : '') + '>' +
        '<td class="c-item">' + esc(l.item) + '</td><td>' + esc(l.entrada) + '</td>' +
        '<td class="num">' + (l.base != null ? F.brl(l.base) : '') + '</td><td class="num">' + (l.aliq != null ? F.pct(l.aliq) : '') + '</td>' +
        '<td class="c-form">' + esc(l.formula) + '</td><td class="num c-valor">' + valor + '</td>' +
        '<td>' + U.origem(l.origem) + '</td><td class="c-fund">' + esc(l.fund) + '</td><td>' + esc(l.vig) + '</td><td class="c-obs">' + esc(l.obs) + '</td></tr>';
    }).join('');
    return '<section class="nx-report-sec"><h3>' + esc(m.titulo) + '</h3><div class="nx-table-wrap"><table class="nx-table nx-memo"><thead><tr><th>Item</th><th>Valor de entrada</th><th class="num">Base de cálculo</th><th class="num">Alíquota</th><th>Fórmula</th><th class="num">Valor calculado</th><th>Origem</th><th>Fundamento / parâmetro</th><th>Vigência</th><th>Observações (elegibilidade)</th></tr></thead><tbody>' + linhas + '</tbody></table></div></section>';
  }

  function cmpTabela(c) {
    return '<section class="nx-report-sec"><h3>' + esc(c.titulo) + '</h3><div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Indicador</th><th class="num">2026</th><th class="num">Jan/2027</th><th class="num">Diferença</th><th class="num">Variação</th></tr></thead><tbody>' +
      c.linhas.map(function (l) {
        var pct = l[3];
        return '<tr><td>' + esc(l[0]) + '</td><td class="num">' + (pct ? F.pct(l[1]) : F.brl(l[1])) + '</td><td class="num">' + (pct ? F.pct(l[2]) : F.brl(l[2])) + '</td><td class="num">' + (pct ? F.signedPp(l[2] - l[1]) : F.signedBrl(l[2] - l[1])) + '</td><td class="num">' + (pct || !l[1] ? '' : F.signedPct((l[2] - l[1]) / Math.abs(l[1]) * 100)) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  /** Barra de escolha do modelo e exportação */
  function barra(A, modelo) {
    return '<div class="nx-report-bar no-print">' +
      U.segmento({ scope: 'ui', path: 'modeloRelatorio', valor: modelo, rotulo: 'Modelo do relatório', opcoes: [
        ['simplificado', 'Simplificado', 'para o empresário: respostas principais e contas resumidas'],
        ['completo', 'Completo', 'memória de cálculo, comparativos, fundamentos e parâmetros']] }) +
      '<div class="nx-report-actions">' +
        U.botao('Exportar PDF ' + (modelo === 'simplificado' ? 'simplificado' : 'completo'), 'exportar-pdf', { tipo: 'primary' }) +
        U.botao('Exportar Excel ' + (modelo === 'simplificado' ? 'simplificado' : 'completo'), 'exportar-xlsx') +
        U.botao('Imprimir', 'imprimir') + '</div></div>';
  }

  /** Relatório simplificado (mesmo conteúdo do PDF/Excel simplificado) */
  function simplificado(ds) {
    var d = ds.destaques;
    function v(x) { return x == null ? '—' : F.brl(x); }
    function varPct(a, b) { return a ? F.signedPct((b - a) / Math.abs(a) * 100) : ''; }
    function caixa(rot, valor, sub, destaque) {
      return '<div class="nx-simp-box' + (destaque ? ' is-destaque' : '') + '"><span>' + esc(rot) + '</span><b>' + valor + '</b><small>' + sub + '</small></div>';
    }
    function tabela(lista, cabecalho) {
      return '<div class="nx-table-wrap"><table class="nx-table nx-simp-tab"><thead><tr>' + cabecalho.map(function (h, i) { return '<th' + (i >= 2 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        lista.map(function (p) {
          return '<tr class="' + (p.total ? 'is-total' : '') + (p.lucro ? ' is-lucro' : '') + (p.info ? ' is-info' : '') + '"><td><b>' + esc(p.item) + '</b></td><td class="nx-simp-exp">' + esc(p.explica) + '</td><td class="num">' + v(p.v26) + '</td><td class="num"><b>' + v(p.v27) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var cab = '<header class="nx-report-head"><div class="nx-report-brand"><span class="nx-logo" role="img" aria-label="Nexus Contabilidade"></span><div><span class="nx-eyebrow">Relatório simplificado</span><h2>' + esc(ds.titulo) + '</h2><p class="nx-simp-sub">' + esc(ds.subtitulo) + '</p></div></div>' +
      '<dl class="nx-report-meta">' + ds.identificacao.map(function (c) { return '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>'; }).join('') + '</dl></header>';
    var caixas = '<div class="nx-simp-boxes">' +
      caixa('Custo de compra em 2027', F.brl(d.custo.v27), 'Hoje: ' + F.brl(d.custo.v26) + ' (' + varPct(d.custo.v26, d.custo.v27) + ')') +
      caixa('Lucro em 2027 mantendo o preço de hoje', d.lucroMesmoPreco ? F.brl(d.lucroMesmoPreco.v27) : '—', d.lucroMesmoPreco ? 'Hoje: ' + F.brl(d.lucroMesmoPreco.v26) : 'Informe margem ou preço') +
      caixa('Quanto cobrar em 2027 para lucrar o mesmo', d.cobrar ? F.brl(d.cobrar.v27) : '—', d.cobrar ? 'Hoje: ' + F.brl(d.cobrar.v26) + ' (' + F.signedPct(d.cobrar.varPct) + ')' : 'Informe margem ou preço', true) +
      '</div>';
    var resumo = '<section class="nx-report-sec"><h3>Em resumo</h3><ul class="nx-simp-lista">' + ds.mensagens.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></section>';
    var passos = ds.passos ? '<section class="nx-report-sec"><h3>Como chegamos a esses números</h3>' + tabela(ds.passos, ['', 'O que é', 'Hoje (2026)', '2027']) + '</section>' : '';
    var impostos = ds.impostos.length ? '<section class="nx-report-sec"><h3>Impostos na venda</h3><div class="nx-table-wrap"><table class="nx-table nx-simp-tab"><thead><tr><th>Imposto</th><th>Como é cobrado</th><th class="num">Hoje (2026)</th><th class="num">2027</th></tr></thead><tbody>' +
      ds.impostos.map(function (x) { return '<tr><td><b>' + esc(x.imposto) + '</b></td><td>' + esc(x.forma) + '</td><td class="num">' + (x.v26 ? F.brl(x.v26) : '—') + '</td><td class="num"><b>' + (x.v27 ? F.brl(x.v27) : '—') + '</b></td></tr>'; }).join('') + '</tbody></table></div></section>' : '';
    var custo = '<section class="nx-report-sec"><h3>Custo de compra</h3>' + tabela(ds.custo, ['', 'O que é', 'Hoje (2026)', '2027']) + '</section>';
    var produtos = ds.produtos.length ? '<section class="nx-report-sec"><h3>Por produto <small class="nx-muted">(valores por unidade)</small></h3><div class="nx-table-wrap"><table class="nx-table nx-simp-tab compact"><thead><tr><th>Produto</th><th class="num">Custo hoje</th><th class="num">Custo 2027</th><th class="num">Preço hoje</th><th class="num">Cobrar em 2027</th><th class="num">Variação</th></tr></thead><tbody>' +
      ds.produtos.map(function (p) {
        return '<tr><td><b>' + esc(p.nome) + '</b>' + (p.qtd ? ' <small class="nx-obs">' + F.num(p.qtd, p.qtd % 1 ? 4 : 0) + ' ' + esc(p.un) + '</small>' : '') + (p.pendente ? ' <span class="nx-count is-erro">cadastro incompleto</span>' : '') + '</td>' +
          '<td class="num">' + (p.custo26 != null ? F.unit(p.custo26) : '—') + '</td><td class="num">' + (p.custo27 != null ? F.unit(p.custo27) : '—') + '</td>' +
          '<td class="num">' + (p.hoje != null ? F.unit(p.hoje) : '—') + '</td><td class="num"><b>' + (p.cobrar != null ? F.unit(p.cobrar) : '—') + '</b></td><td class="num">' + (p.variacao != null ? F.signedPct(p.variacao) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>' : '';
    var muda = '<section class="nx-report-sec"><h3>O que muda em 2027</h3><ul class="nx-simp-lista">' + ds.muda.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></section>';
    return cab + caixas + resumo + passos + impostos + custo + produtos + muda + '<p class="nx-disclaimer">' + esc(ds.aviso) + '</p>';
  }

  RTC.views.relatorio = {
    render: function (A) {
      var vazio = RTC.views.semEmpresaOuSim(A);
      if (vazio) return vazio;
      var modelo = RTC.exportar.modeloEscolhido(A);
      var cons = A.cons || { erros: [], avisos: [] };
      if (modelo === 'simplificado') {
        var ds = RTC.exportar.dadosSimples(A);
        if (!ds) return U.cartao({ titulo: 'Complete o cadastro dos produtos', corpo: U.alertas(cons.erros, []) + U.botao('Ir para o cadastro da operação', 'ir', { dados: { rota: 'operacao' }, tipo: 'primary' }) });
        return '<article class="nx-report nx-report-simples">' + barra(A, modelo) + simplificado(ds) + '</article>';
      }
      var dd = RTC.exportar.dados(A);
      if (!dd) return U.cartao({ titulo: 'Complete o cadastro dos produtos', corpo: U.alertas(cons.erros, []) + U.botao('Ir para o cadastro da operação', 'ir', { dados: { rota: 'operacao' }, tipo: 'primary' }) });

      var acoes = barra(A, modelo);

      var cab = '<header class="nx-report-head"><div class="nx-report-brand"><span class="nx-logo" role="img" aria-label="Nexus Contabilidade"></span><div><span class="nx-eyebrow">RTC Comparativo</span><h2>' + esc(dd.titulo) + '</h2></div></div>' +
        '<dl class="nx-report-meta">' + dd.cabecalho.map(function (c) { return '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>'; }).join('') + '</dl></header>';

      var resumo = '<section class="nx-report-sec"><h3>Resumo executivo</h3>' + dd.resumo.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>';
      function v(x, fn) { return x != null ? fn(x) : '—'; }
      var produtos = '<section class="nx-report-sec"><h3>Produtos da operação</h3><div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Produto</th><th class="num">Qtd × valor unitário</th><th class="num">Valor total</th><th class="num">Custo líq. 2026</th><th class="num">Custo líq. 2027</th><th class="num">Total ao cliente 2026</th><th class="num">Total ao cliente 2027</th><th class="num">Margem 2026</th><th class="num">Margem 2027</th></tr></thead><tbody>' +
        dd.produtos.map(function (p) {
          return '<tr><td>' + esc(p.nome) + (p.ncm ? ' <small class="nx-obs">NCM ' + esc(p.ncm) + '</small>' : '') + (p.pendencias ? ' <span class="nx-count is-erro">' + p.pendencias + ' pendência(s)</span>' : '') + '</td>' +
            '<td class="num">' + (p.qtd != null && p.unit != null ? F.num(p.qtd, p.qtd % 1 ? 4 : 0) + ' ' + esc(p.un) + ' × ' + F.unit(p.unit) : '—') + '</td>' +
            '<td class="num">' + v(p.total, F.brl) + '</td><td class="num">' + v(p.custo26, F.brl) + '</td><td class="num">' + v(p.custo27, F.brl) + '</td>' +
            '<td class="num">' + v(p.total26, F.brl) + '</td><td class="num">' + v(p.total27, F.brl) + '</td><td class="num">' + v(p.margem26, F.pct) + '</td><td class="num">' + v(p.margem27, F.pct) + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';

      var sens = dd.sensibilidade.length ? '<section class="nx-report-sec"><h3>Sensibilidade — alíquota de referência da CBS (2027)</h3><div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>CBS de referência</th><th class="num">Preço 2027 (mesma margem)</th><th class="num">Total ao cliente 2027</th><th class="num">Variação vs 2026</th><th class="num">Margem 2027 (mesmo preço)</th></tr></thead><tbody>' +
        dd.sensibilidade.map(function (s) { return '<tr' + (s.atual ? ' class="is-total"' : '') + '><td>' + F.pct(s.cbsRef) + (s.atual ? ' (atual)' : '') + '</td><td class="num">' + (s.preco27 != null ? F.brl(s.preco27) : '—') + '</td><td class="num">' + (s.total27 != null ? F.brl(s.total27) : '—') + '</td><td class="num">' + (s.varTotal != null ? F.signedPct(s.varTotal) : '—') + '</td><td class="num">' + (s.margem27 != null ? F.pct(s.margem27) : '—') + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>' : '';

      var prem = '<section class="nx-report-sec"><h3>Premissas</h3><ol class="nx-premissas">' + dd.premissas.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></section>' +
        '<section class="nx-report-sec"><h3>Avisos e validações</h3>' + U.alertas(cons.erros, cons.avisos, { vazio: 'Nenhum aviso.' }) + '</section>';

      var leis = '<section class="nx-report-sec"><h3>Fundamentos legais e fontes</h3><ul class="nx-leis">' + dd.fundamentos.map(function (f) {
        return '<li><div><strong>' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' + esc(f.norma) + '</a>' : esc(f.norma)) + '</strong><span class="nx-nat-lei n-' + esc(f.natureza) + '">' + esc({ norma: 'Norma', jurisprudencia: 'Jurisprudência', administrativo: 'Entendimento administrativo', estimativa: 'Estimativa — não oficial' }[f.natureza] || '') + '</span></div><p>' + esc(f.resumo) + '</p></li>';
      }).join('') + '</ul></section>';

      var params = '<section class="nx-report-sec"><h3>Parâmetros utilizados</h3><p class="nx-note">Última atualização dos parâmetros: <b>' + F.dateTime(A.ultimaAtualizacaoParams()) + '</b> · base ' + RTC.params.VERSAO_BASE + '.</p><div class="nx-table-wrap"><table class="nx-table compact"><thead><tr><th>Parâmetro</th><th class="num">Valor</th><th>Status</th><th>Vigência</th><th>Fundamento</th><th>Atualizado em</th></tr></thead><tbody>' +
        dd.parametros.map(function (p) { return '<tr><td>' + esc(p.nome) + (p.alterado ? ' <small class="nx-muted">(alterado)</small>' : '') + '</td><td class="num">' + (p.un === 'R$' ? F.brl(p.valor) : p.un === 'p.p.' ? F.num(p.valor) + ' p.p.' : F.pct(p.valor)) + '</td><td>' + U.status(p.status) + '</td><td>' + esc(p.vig) + '</td><td>' + esc(p.fund) + '</td><td>' + F.date(p.atualizadoEm) + '</td></tr>'; }).join('') +
        '</tbody></table></div></section>';

      return '<article class="nx-report">' + acoes + cab + resumo +
        produtos + dd.comparativos.map(cmpTabela).join('') +
        dd.memorias.map(memoria).join('') + sens + prem + leis + params +
        '<p class="nx-disclaimer">' + esc(dd.aviso) + '</p></article>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
