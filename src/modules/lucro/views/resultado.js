/* Lucratividade por Item — etapa 4: resultado da planilha (preço editável por linha, lucro, margem e totais ponderados) */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  /** Célula calculada de uma linha (id = itemId|campo), atualizada a cada digitação do preço */
  LC.live['res-cel'] = function (L, chave) {
    var p = String(chave).split('|');
    var it = L.item(p[0]);
    if (!it) return '';
    var r = L.resultado(it);
    var campo = p[1];
    if (campo === 'alertas') return LC.views.chipsAlerta(r.alertas);
    if (r.erro) return campo === 'lucroTotal' ? '<span class="nx-muted" title="' + esc(r.erro) + '">sem preço</span>' : '—';
    switch (campo) {
      case 'pld': return F.unit(r.pld) + (r.fora && r.fora.length ? '<small class="nx-obs" title="Preço líquido + CBS + IBS (por fora)">cliente paga ' + F.unit(r.totalCliente) + '</small>' : '');
      case 'lucro': return F.unit(r.lucro);
      case 'lucroTotal': return '<b>' + F.brl(r.lucroTotal) + '</b><small class="nx-obs">' + F.unit(r.lucro) + ' por unidade</small>';
      case 'faixaPreco': return '<span class="lc-faixa-preco"><span title="Preço mínimo: lucro zero">mín. ' + (r.pvMinimo != null ? F.unit(r.pvMinimo) : '—') + '</span><span title="' + esc(r.pvAlvoErro || 'Preço para atingir a margem-alvo') + '">meta ' + (r.pvAlvo != null ? F.unit(r.pvAlvo) : '—') + '</span></span>';
      case 'margem': return '<span class="lc-faixa-pill is-' + r.faixa + '" title="' + esc(LC.views.faixaTexto(r, L.params(L.analise()))) + '">' + F.pct(r.margem * 100) + '</span>';
      case 'pvMin': return r.pvMinimo != null ? F.unit(r.pvMinimo) : '—';
      case 'pvAlvo': return r.pvAlvo != null ? F.unit(r.pvAlvo) : '<span class="nx-muted" title="' + esc(r.pvAlvoErro || '') + '">—</span>';
    }
    return '';
  };

  LC.live['res-total'] = function (L, campo) {
    var t = M.totais(L.resultados().map(function (x) { return x.r; }));
    var p = L.params(L.analise());
    var alvo = p.margemAlvo != null ? Number(p.margemAlvo) / 100 : null;
    if (campo === 'pld') return F.brl(t.pld) + (t.tributosFora > 0.004 ? '<small class="nx-obs">cliente paga ' + F.brl(t.totalCliente) + '</small>' : '');
    if (campo === 'lucro') return F.brl(t.lucro);
    if (campo === 'margem') {
      if (t.margem == null) return '—';
      var fx = t.lucro < 0 ? 'negativa' : alvo != null && t.margem < alvo ? 'abaixo' : 'ok';
      return '<span class="lc-faixa-pill is-' + fx + '">' + F.pct(t.margem * 100) + '</span>';
    }
    return '';
  };

  LC.live['res-kpis'] = function (L) {
    var lista = L.resultados();
    var t = M.totais(lista.map(function (x) { return x.r; }));
    var p = L.params(L.analise());
    var neg = lista.filter(function (x) { return !x.r.erro && x.r.lucro < 0; }).length;
    var abaixo = lista.filter(function (x) { return !x.r.erro && x.r.faixa === 'abaixo'; }).length;
    var semPreco = lista.filter(function (x) { return x.r.erro; }).length;
    return '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Faturamento (preço × quantidade)', valor: F.brl(t.faturamento), sub: 'PLD ' + F.brl(t.pld) + (t.tributosFora > 0.004 ? ' · cliente paga ' + F.brl(t.totalCliente) + ' com CBS e IBS' : ''), dica: 'PLD = preço líquido de desconto.' + (t.tributosFora > 0.004 ? ' A CBS e o IBS são cobrados à parte e não entram no faturamento.' : '') }) +
      U.kpi({ rotulo: 'Lucro total', valor: F.brl(t.lucro), sub: p.regime === 'REAL' && p.considerarIrpjCsll ? 'após IRPJ/CSLL (estimativa): ' + F.brl(t.lucroAposIr) : 'custo líquido ' + F.brl(t.custoLiquido), destaque: true }) +
      U.kpi({ rotulo: 'Margem total (Σ lucros ÷ Σ PLD)', valor: t.margem != null ? F.pct(t.margem * 100) : '—', sub: 'meta ' + (p.margemAlvo != null ? F.pct(Number(p.margemAlvo)) : '—') }) +
      U.kpi({ rotulo: 'Itens que pedem atenção', valor: String(neg + abaixo + semPreco), sub: neg + ' com prejuízo · ' + abaixo + ' abaixo da meta' + (semPreco ? ' · ' + semPreco + ' sem preço' : '') }) +
      '</div>';
  };

  /** Resposta da tela numa frase: lucro e margem da análise e quantos itens pedem atenção */
  LC.live['res-resposta'] = function (L) {
    var lista = L.resultados();
    var t = M.totais(lista.map(function (x) { return x.r; }));
    if (!t.calculados) return U.resposta('Informe o preço de venda dos itens para ver o lucro da análise.', '', 'ruim');
    var p = L.params(L.analise());
    var alvo = p.margemAlvo != null ? Number(p.margemAlvo) / 100 : null;
    var neg = lista.filter(function (x) { return !x.r.erro && x.r.lucro < 0; });
    var abaixo = lista.filter(function (x) { return !x.r.erro && x.r.faixa === 'abaixo'; });
    var semPreco = lista.filter(function (x) { return x.r.erro; }).length;
    function nomes(xs) { return xs.slice(0, 3).map(function (x) { return x.item.codigo || x.item.descricao || 'item'; }).join(', ') + (xs.length > 3 ? ' e mais ' + (xs.length - 3) : ''); }
    var txt = 'Vendendo ' + (t.calculados === 1 ? 'o item' : 'os ' + t.calculados + ' itens') + ' pelos preços abaixo, o lucro é <b>' + F.brl(t.lucro) + '</b>, margem de <b>' + F.pct(t.margem * 100) + '</b>' +
      (alvo != null ? (t.margem < alvo ? ', abaixo da meta de ' + F.pct(alvo * 100) : ', na meta de ' + F.pct(alvo * 100) + ' ou acima') : '') + '.';
    var partes = [];
    if (neg.length) partes.push(neg.length + ' com prejuízo (' + esc(nomes(neg)) + ')');
    if (abaixo.length) partes.push(abaixo.length + ' abaixo da meta (' + esc(nomes(abaixo)) + ')');
    if (semPreco) partes.push(semPreco + ' sem preço');
    var sub = (partes.length ? 'Pedem atenção: ' + partes.join('; ') + '. ' : 'Todos os itens estão na meta. ') + (t.tributosFora > 0.004 ? 'Com a CBS e o IBS somados aos preços, os clientes pagam ' + F.brl(t.totalCliente) + '.' : '');
    return U.resposta(txt, sub, t.lucro < 0 || (alvo != null && t.margem < alvo) ? 'ruim' : 'bom');
  };

  function tabela(L) {
    var lista = L.resultados();
    var rows = lista.map(function (x) {
      var it = x.item, r = x.r, id = esc(it.id);
      function cel(campo, cls) { return '<td class="num' + (cls ? ' ' + cls : '') + '" data-lc-live="res-cel" data-lc-id="' + id + '|' + campo + '">' + LC.live['res-cel'](L, it.id + '|' + campo) + '</td>'; }
      var pv = !r.erro ? r.pv : it.venda.precoVenda;
      return '<tr><td><button type="button" class="nx-link-btn" data-acao="lc-selecionar-item" data-id="' + id + '" data-rota="venda" title="Abrir a tela do item"><strong>' + esc(it.codigo || '—') + '</strong></button><small class="nx-obs">' + esc(it.descricao || 'Item sem descrição') + '</small></td>' +
        '<td class="num">' + F.num(Number(it.quantidade) || 0, (Number(it.quantidade) || 0) % 1 ? 4 : 0) + '</td>' +
        '<td class="num">' + (r.custoLiquidoUnit != null ? F.unit(r.custoLiquidoUnit) : '—') + '</td>' +
        '<td class="num lc-celula-pv"><span class="nx-input-wrap has-prefix"><span class="nx-prefix">R$</span><input class="nx-input is-num" type="text" inputmode="decimal" autocomplete="off" data-scope="item" data-id="' + id + '" data-path="venda.precoVenda" data-type="unit" value="' + esc(pv != null ? F.inputValue(pv, 'unit') : '') + '" aria-label="Preço de venda de ' + esc(it.codigo || it.descricao || 'item') + '"></span>' +
          (it.venda.modo !== 'PRECO_INFORMADO' ? '<small class="nx-obs">' + ({ MARKUP_COM_DESPESAS: 'markup 1', MARKUP_SEM_DESPESAS: 'markup 2', PRECO_SEM_PIS_COFINS: 'sem PIS/Cofins' }[it.venda.modo] || '') + '</small>' : '') + '</td>' +
        cel('pld') + cel('lucroTotal') + cel('margem') + cel('faixaPreco') +
        '<td data-lc-live="res-cel" data-lc-id="' + id + '|alertas">' + LC.live['res-cel'](L, it.id + '|alertas') + '</td></tr>';
    }).join('');
    var tot = '<tr class="is-total"><td colspan="4">Total · ' + lista.length + ' item(ns)</td>' +
      '<td class="num" data-lc-live="res-total" data-lc-id="pld">' + LC.live['res-total'](L, 'pld') + '</td>' +
      '<td class="num" data-lc-live="res-total" data-lc-id="lucro">' + LC.live['res-total'](L, 'lucro') + '</td>' +
      '<td class="num" data-lc-live="res-total" data-lc-id="margem">' + LC.live['res-total'](L, 'margem') + '</td><td colspan="2"></td></tr>';
    return '<div class="nx-table-wrap"><table class="nx-table compact lc-tab-resultado"><thead><tr><th>Item</th><th class="num">Qtd</th><th class="num">Custo unit.<small class="nx-th-dica">custo líquido</small></th><th class="num">Preço de venda<small class="nx-th-dica">editável</small></th><th class="num">Preço líquido<small class="nx-th-dica">PLD, por unidade</small></th><th class="num">Lucro da linha</th><th class="num">Margem</th><th class="num">Faixa de preço<small class="nx-th-dica">mínimo e meta</small></th><th>Alertas</th></tr></thead><tbody>' + rows + tot + '</tbody></table></div>';
  }

  LC.views.resultado = {
    render: function (L) {
      var vazio = LC.views.semDados(L, true);
      if (vazio) return vazio;
      var an = L.analise(), p = L.params(an);
      return '<div class="nx-stack">' +
        '<div data-lc-live="res-resposta">' + LC.live['res-resposta'](L) + '</div>' +
        '<div data-lc-live="res-kpis">' + LC.live['res-kpis'](L) + '</div>' +
        U.cartao({ eyebrow: 'Resultado · ' + esc(an.nome) + ' · ' + esc(M.REGIMES[p.regime]) + ' · cenário ' + p.cenario, titulo: 'Lucro e margem por item',
          sub: 'Mude o preço de venda numa linha: lucro, margem e totais mudam na hora. Cores: vermelho = prejuízo; amarelo = abaixo da meta; verde = na meta ou acima.',
          acoes: U.botao('Tela do item', 'lc-ir', { dados: { rota: 'venda' }, classe: 'sm' }) + U.botao('Cadastrar item', 'lc-novo-item', { classe: 'sm' }),
          corpo: tabela(L) + U.explica('Como os números são calculados?',
            '<p>Preço líquido (PLD) = preço de venda − desconto incondicional. Lucro = PLD − tributos embutidos − comissão e cartão − custo líquido. Margem = lucro ÷ PLD.</p>' +
            '<p>Margem total = Σ lucros ÷ Σ PLD (ponderada pelo faturamento), não a média das margens. Preço mínimo: lucro zero. Preço da meta: dá exatamente a margem-alvo.</p>' +
            (p.cenario === '2027' ? '<p>Cenário 2027: a CBS e o IBS são somados ao preço e pagos pelo cliente (por fora). Eles não entram no faturamento nem reduzem o lucro.</p>' : '') +
            '<p>Fora do escopo desta versão: rateio de despesas fixas por item (ponto de equilíbrio) e apuração mensal de IRPJ/CSLL do Lucro Real, que depende do resultado do período e não do item isolado.</p>') }) +
        '</div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
