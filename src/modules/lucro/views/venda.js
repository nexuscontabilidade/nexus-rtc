/* Lucratividade por Item — etapa 3: venda (tela por item: custo, preço e deduções, cascata, lucro e referências) */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  function faixaTexto(r, p) {
    if (r.faixa === 'negativa') return 'prejuízo';
    if (r.faixa === 'abaixo') return 'abaixo da meta de ' + F.pct(Number(p.margemAlvo));
    return p.margemAlvo != null ? 'acima da meta de ' + F.pct(Number(p.margemAlvo)) : 'lucro';
  }
  LC.views.faixaTexto = faixaTexto;

  /** O que cada modo de formar o preço faz, em uma frase (o modo 4 depende do cenário e do regime) */
  var MODO_TXT = { MARKUP_COM_DESPESAS: 'Preço = custo líquido × markup. As despesas e os tributos só mostram quanto sobra de lucro.', MARKUP_SEM_DESPESAS: 'O markup forma o preço-base e o sistema acrescenta os tributos e as despesas por dentro.', PRECO_INFORMADO: 'Você digita o preço (ou a margem desejada, e o sistema calcula o preço).' };
  function modoTexto(modo, p) {
    if (modo !== 'PRECO_SEM_PIS_COFINS') return MODO_TXT[modo] || '';
    if (p && p.regime === 'SIMPLES') return 'Você digita o preço de hoje. No Simples Nacional, o PIS e a Cofins estão dentro do DAS, que continua em 2027: o preço fica igual.';
    if (p && p.cenario === '2027') return 'Você digita o preço de hoje (com PIS e Cofins) e o sistema retira o PIS e a Cofins embutidos nele. A CBS e o IBS entram por fora.';
    return 'Você digita o preço de hoje (com PIS e Cofins). Em 2026 ele vale como está; no cenário 2027, o sistema retira o PIS e a Cofins embutidos nele.';
  }
  LC.views.modoTexto = modoTexto;
  /** Opções de "Como formar o preço" (tela do item e venda padrão) */
  var MODOS_OPCOES = [['MARKUP_COM_DESPESAS', '1 · Markup com despesas', 'PV = CL × markup'], ['MARKUP_SEM_DESPESAS', '2 · Markup sem despesas', 'despesas acrescidas por dentro'],
    ['PRECO_INFORMADO', '3 · Preço informado', 'você digita o preço'], ['PRECO_SEM_PIS_COFINS', '4 · Preço sem PIS/Cofins', 'retira o PIS e a Cofins do preço de hoje']];

  /** 1. Custo do item, com o detalhe dos créditos ao passar o mouse */
  LC.live['venda-custo'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var c = L.resultado(it).compra;
    var icms = c.detalheIcms.map(function (x) { return x[0] + ': ' + F.brl(x[1]); }).join('\n') || c.motivoIcms || 'Sem crédito de ICMS.';
    var c27 = c.cenario === '2027';
    var pc = LC.views.dicaTrib(c);
    return '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Custo bruto', valor: F.brl(c.custoBruto), sub: c.quantidade + ' un. · ' + (c.quantidade ? F.unit(c.custoBruto / c.quantidade) + ' por unidade' : '') + (c27 && (c.cbsEntrada + c.ibsEntrada) ? ' · com CBS e IBS ' + F.brl(c.cbsEntrada + c.ibsEntrada) : ''), dica: 'Tudo o que se paga na compra' + (c27 ? ', inclusive a CBS e o IBS cobrados por fora' : '') + '.' }) +
      '<div class="lc-dica-kpi" title="' + esc(icms + (c.creditoIcmsPendente ? '\nDAE 1023 a apropriar: ' + F.brl(c.creditoIcmsPendente) : '')) + '">' + U.kpi({ rotulo: 'Crédito de ICMS', valor: F.brl(c.creditoIcms), sub: c.creditoIcmsPendente ? '+ ' + F.brl(c.creditoIcmsPendente) + ' a apropriar (1023 não pago)' : 'passe o mouse para o detalhe' }) + '</div>' +
      '<div class="lc-dica-kpi" title="' + esc(pc) + '">' + U.kpi({ rotulo: c27 ? 'Crédito de CBS e IBS' : 'Crédito de PIS/Cofins', valor: F.brl(LC.views.creditoTrib(c)), sub: 'passe o mouse para o detalhe' }) + '</div>' +
      U.kpi({ rotulo: 'Custo líquido (CL)', valor: c.custoLiquidoUnit != null ? F.unit(c.custoLiquidoUnit) : '—', sub: 'por unidade · linha ' + F.brl(c.custoLiquido), destaque: true, dica: 'Custo bruto menos os créditos: o custo real do item.' }) +
      '</div>';
  };

  /** Resposta da tela numa frase: com este preço, quanto o item dá de lucro (e quanto o cliente paga em 2027) */
  LC.live['venda-resposta'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var r = L.resultado(it), p = L.params(L.analise());
    if (r.erro) return U.resposta('Informe o preço de venda para ver o lucro deste item.', esc(r.erro), 'ruim');
    var nome = esc(it.descricao || it.codigo || 'o item');
    var txt = 'Vendendo ' + nome + ' a <b>' + F.unit(r.pv) + '</b>' + (r.desconto > 0.004 ? ' (' + F.unit(r.pld) + ' com o desconto)' : '') +
      ', o lucro é <b>' + F.unit(r.lucro) + '</b> por unidade: margem de <b>' + F.pct(r.margem * 100) + '</b>, ' + esc(faixaTexto(r, p)) + '.';
    var reg = it.cbsIbs && M.REGIMES_CBS_IBS[it.cbsIbs.regime] ? it.cbsIbs.regime : 'NORMAL';
    var dc = r.descontaminacao;
    var sub = (dc && dc.aplicada && dc.retiradoPreco > 0.004 ? 'Saíram do preço de hoje (' + F.unit(dc.precoAtual) + ') os ' + F.unit(dc.retiradoPreco) + ' de PIS e Cofins embutidos. ' : '') +
      (r.fora && r.fora.length
        ? (r.tributosFora > 0.004 ? 'Com a CBS e o IBS somados ao preço, o cliente paga ' + F.unit(r.totalCliente) + ' por unidade. ' : 'Item sem CBS e IBS (' + M.REGIMES_CBS_IBS[reg].toLowerCase() + '): o cliente paga o preço líquido. ')
        : '') +
      'Na linha (' + F.num(r.quantidade, r.quantidade % 1 ? 4 : 0) + ' un.), o lucro é ' + F.brl(r.lucroTotal) + '.';
    return U.resposta(txt, sub, r.faixa === 'ok' ? 'bom' : 'ruim');
  };

  /** Modo 4: o preço de hoje, o PIS e a Cofins retirados e o preço que fica (em 2026, só o aviso do que sai em 2027) */
  LC.live['venda-descont'] = function (L, id) {
    var it = L.item(id);
    if (!it || it.venda.modo !== 'PRECO_SEM_PIS_COFINS') return '';
    var p = L.params(L.analise()), r = L.resultado(it), dc = r.descontaminacao;
    if (!dc) return '';
    var t = L.calculadora(it, p).trib, ap = M.aliquotasPisCofins(p);
    var reg = t.regimePisCofins || 'NORMAL';
    if (p.regime === 'SIMPLES') return '<p class="nx-note lc-descont-nota">No Simples Nacional não há PIS e Cofins separados para retirar: eles estão dentro do DAS.</p>';
    if (reg !== 'NORMAL') return '<p class="nx-note lc-descont-nota">Item sem PIS e Cofins na venda (' + esc(M.REGIMES_PIS_COFINS[reg].toLowerCase()) + '): não há o que retirar do preço.</p>';
    var f = L.calculadora(it, p).fracaoPisCofins;
    var regra = 'PIS ' + F.pct(ap.pis) + ' + Cofins ' + F.pct(ap.cofins) + ' sobre (preço − ICMS) = ' + F.pct(f * 100) + ' do preço';
    if (!dc.aplicada) {
      var em27 = M.precoPorModo(it.venda, 0, 0, { fracaoPisCofins: f, cenario2027: true }).descontaminacao; // o mesmo cálculo do cenário 2027
      return '<p class="nx-note lc-descont-nota">Em 2026 o PIS e a Cofins continuam: o preço de hoje vale como está. No cenário 2027, o preço cai <b>' + F.unit(em27.retiradoPreco) + '</b> por unidade, para ' + F.unit(dc.precoAtual - em27.retiradoPreco) + ' (' + esc(regra) + ').</p>';
    }
    return '<dl class="lc-descont" aria-label="Preço sem PIS e Cofins">' +
      '<div><dt>Preço de hoje</dt><dd>' + F.unit(dc.precoAtual) + '</dd></div>' +
      '<div><dt>(−) PIS e Cofins embutidos</dt><dd>' + F.unit(dc.retiradoPreco) + '</dd><small>' + esc(regra) + '</small></div>' +
      '<div class="is-total"><dt>= Preço sem PIS e Cofins</dt><dd>' + F.unit(r.pv) + '</dd><small>a CBS e o IBS entram por fora</small></div>' +
      '</dl>';
  };

  /** Observação curta da linha da DRE (a alíquota sobre o PLD); o fundamento vai na dica, para a tabela caber na tela */
  function notaDre(x) {
    if (x.aliq) return F.pct(x.aliq * 100) + ' do PLD';
    return x.nota || '';
  }

  /** 3. DRE do item: por unidade, total da linha e análise vertical sobre a receita bruta */
  LC.live['venda-dre'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var r = L.resultado(it);
    if (r.erro) return '<div class="nx-blocked"><b>Sem resultado</b><p>' + esc(r.erro) + '</p></div>';
    var q = r.quantidade;
    return '<div class="nx-table-wrap"><table class="nx-table lc-dre"><thead><tr><th>DRE do item</th><th class="num">Por unidade</th><th class="num">Total (' + F.num(q, q % 1 ? 4 : 0) + ' un.)</th><th class="num">AV %</th></tr></thead><tbody>' +
      M.dre(r).map(function (x) {
        var cls = 'is-' + x.nivel + (x.nivel === 'final' ? ' is-' + r.faixa : '');
        var nota = notaDre(x);
        return '<tr class="' + cls + '"' + (x.fund ? ' title="' + esc(x.fund) + '"' : '') + '><td>' + esc(x.nome) + (nota ? '<small class="nx-obs">' + esc(nota) + '</small>' : '') + '</td>' +
          '<td class="num">' + F.unit(x.valor) + '</td><td class="num">' + F.brl(x.valor * q) + '</td>' +
          '<td class="num">' + (r.pv ? F.pct(x.valor / r.pv * 100) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + foraDoPreco(r) +
      U.explica('Como ler a DRE?', '<p>Estrutura da DRE: Lei 6.404/1976, art. 187. AV % sobre a receita bruta; a margem do item, acima, é calculada sobre o PLD (receita depois dos descontos incondicionais).</p>' +
        (r.fora && r.fora.length ? '<p>A CBS e o IBS não entram na receita bruta nem reduzem o lucro: a empresa cobra do cliente e repassa, abatendo os créditos da compra (DL 1.598/1977, art. 12, § 4º; LC 214/2025, art. 47).</p>' : ''));
  };

  /** 2027: CBS e IBS cobrados do cliente à parte (por fora) e o total que o cliente paga */
  function foraDoPreco(r) {
    if (!r.fora || !r.fora.length) return '';
    var q = r.quantidade;
    function lin(nome, v, cls, nota) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + nome + (nota ? '<small class="nx-obs">' + esc(nota) + '</small>' : '') + '</td><td class="num">' + F.unit(v) + '</td><td class="num">' + F.brl(v * q) + '</td></tr>'; }
    return '<div class="lc-fora"><h4>Cobrado do cliente à parte <small>CBS e IBS por fora</small></h4>' +
      '<div class="nx-table-wrap"><table class="nx-table compact lc-dre"><thead><tr><th>Total ao cliente</th><th class="num">Por unidade</th><th class="num">Total (' + F.num(q, q % 1 ? 4 : 0) + ' un.)</th></tr></thead><tbody>' +
      lin('Preço líquido (PLD)', r.pld) +
      r.fora.map(function (x) { return lin('(+) ' + esc(x.nome), x.valor, 'is-sub', x.formula); }).join('') +
      lin('= Total pago pelo cliente', r.totalCliente, 'is-total') +
      '</tbody></table></div></div>';
  }

  /** 4. Lucro e margem com cor por faixa */
  LC.live['venda-lucro'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var r = L.resultado(it), p = L.params(L.analise());
    if (r.erro) return '';
    return '<div class="lc-lucro is-' + r.faixa + '">' +
      '<div><small>Lucro do item</small><b>' + F.unit(r.lucro) + '</b><span>por unidade · ' + F.brl(r.lucroTotal) + ' na linha</span></div>' +
      '<div><small>Margem sobre o PLD</small><b>' + F.pct(r.margem * 100) + '</b><span class="lc-faixa-txt is-' + r.faixa + '">' + esc(faixaTexto(r, p)) + '</span></div>' +
      (r.irEstimado ? '<div><small>Depois do IRPJ/CSLL (estimativa)</small><b>' + F.unit(r.lucroAposIr) + '</b><span>por unidade · margem ' + F.pct(r.pld ? r.lucroAposIr / r.pld * 100 : 0) + '</span></div>' : '') +
      '</div>';
  };

  /** 5. Referências fixas: PV mínimo e PV para a margem-alvo (espaço de negociação) */
  LC.live['venda-referencias'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var r = L.resultado(it), p = L.params(L.analise());
    if (r.erro) return '';
    var min = r.pvMinimo, alvo = r.pvAlvo, pv = r.pv;
    var trilha = '';
    if (min != null && alvo != null) {
      var lo = Math.min(min, pv) * 0.92, hi = Math.max(alvo, pv) * 1.06;
      var pos = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); };
      trilha = '<div class="lc-trilha" aria-hidden="true"><span class="lc-trilha-faixa" style="left:' + pos(min) + '%;width:' + (pos(alvo) - pos(min)) + '%"></span>' +
        '<span class="lc-trilha-marca is-min" style="left:' + pos(min) + '%"></span><span class="lc-trilha-marca is-alvo" style="left:' + pos(alvo) + '%"></span>' +
        '<span class="lc-trilha-pv is-' + r.faixa + '" style="left:' + pos(pv) + '%" title="Preço atual"></span></div>';
    }
    return '<dl class="lc-refs">' +
      '<div><dt>Preço mínimo (lucro zero)</dt><dd>' + (min != null ? F.unit(min) : '—') + '</dd><small>' + (r.pvMinimoErro ? esc(r.pvMinimoErro) : 'CL ÷ ((1 − d)(1 − Σ))') + '</small></div>' +
      '<div><dt>Preço atual</dt><dd>' + F.unit(pv) + '</dd><small>PLD ' + F.unit(r.pld) + '</small></div>' +
      '<div><dt>Preço para a meta (' + (p.margemAlvo != null ? F.pct(Number(p.margemAlvo)) : '—') + ')</dt><dd>' + (alvo != null ? F.unit(alvo) : '—') + '</dd><small>' + (r.pvAlvoErro ? esc(r.pvAlvoErro) : 'CL ÷ ((1 − d)(1 − Σ − m))') + '</small></div>' +
      '</dl>' + trilha;
  };

  function tributacao(L, it, p) {
    var t = it.trib || M.tributacaoPadrao(it, p);
    var padrao = !it.trib;
    function c(o) { o.scope = 'item'; o.id = it.id; o.valor = t[o.path.slice(5)]; return U.campo(o); }
    function sel(o) { o.scope = 'item'; o.id = it.id; o.valor = t[o.path.slice(5)]; return U.selecao(o); }
    var corpo;
    if (p.regime === 'SIMPLES') {
      corpo = '<div class="nx-form-grid">' + c({ rotulo: 'Alíquota do DAS do item', path: 'trib.dasAliquota', tipo: 'pct', largura: 'sm', placeholder: p.dasAliquotaEfetiva != null ? F.inputValue(p.dasAliquotaEfetiva, 'pct') : '', dica: 'Vazio = alíquota efetiva da empresa. Item com ST ou antecipado: sem a parcela do ICMS (LC 123/2006, art. 18, § 4º-A, I).' }) +
        '<div class="nx-field w-md">' + U.chave({ scope: 'item', id: it.id, path: 'trib.icmsSt', marcado: !!t.icmsSt, rotulo: 'Item com ICMS-ST' }) + '</div></div>';
    } else {
      corpo = '<div class="nx-form-grid">' +
        '<div class="nx-field w-md">' + U.chave({ scope: 'item', id: it.id, path: 'trib.icmsSt', marcado: !!t.icmsSt, rotulo: 'Item com ICMS-ST', ajuda: 'A ST encerra a tributação: sem ICMS na venda.' }) + '</div>' +
        (t.icmsSt ? '' : c({ rotulo: 'Alíquota do ICMS', path: 'trib.aliqIcms', tipo: 'pct', largura: 'sm' }) + c({ rotulo: 'Redução da base', path: 'trib.reducaoBcIcms', tipo: 'pct', largura: 'sm' })) +
        (p.cenario === '2027' && it.venda.modo !== 'PRECO_SEM_PIS_COFINS' ? '' : sel({ rotulo: p.cenario === '2027' ? 'PIS/Cofins no preço de hoje' : 'PIS/Cofins na venda', path: 'trib.regimePisCofins', largura: 'md',
          dica: p.cenario === '2027' ? 'Usado só para retirar do preço de hoje o PIS e a Cofins embutidos. Em 2027 eles não existem mais.' : undefined,
          opcoes: Object.keys(M.REGIMES_PIS_COFINS).map(function (k) { return [k, M.REGIMES_PIS_COFINS[k]]; }) })) +
        '</div>';
    }
    if (p.cenario === '2027') corpo += LC.views.campoCbsIbs(it, 'Vale para a compra e para a venda. ' + (p.regime === 'SIMPLES' ? 'No Simples, a CBS e o IBS da venda ficam dentro do DAS; o tratamento muda a CBS e o IBS pagos na compra.' : 'Reduções de 30% e 60%, alíquota zero e isenções seguem o NCM e os anexos da LC 214/2025.'));
    return '<div class="lc-trib"><div class="lc-trib-cab"><h4>Tributação de venda do item · ' + p.cenario + '</h4>' + (padrao ? '<span class="lc-alerta is-tributacao-padrao">tributação padrão do regime</span>' : U.botao('Usar tributação padrão', 'lc-usar-padrao-trib', { dados: { id: it.id }, classe: 'sm' })) + '</div>' + corpo +
      '<p class="nx-note">O desconto incondicional fica fora da receita tributável (' + (p.cenario === '2027' ? 'LC 214/2025, art. 12, § 2º; ' : 'Leis 10.637/2002 e 10.833/2003, art. 1º, § 3º, V, "a"; ') + 'LC 87/1996, art. 13, § 1º, II, "a").</p></div>';
  }

  function telaItem(L, it) {
    var p = L.params(L.analise());
    var r = L.resultado(it);
    var v = it.venda;
    function c(o) { o.scope = 'item'; o.id = it.id; if (o.valor === undefined) o.valor = N.store.getPath(it, o.path); return U.campo(o); }
    var pvAtual = r && !r.erro ? r.pv : v.precoVenda;
    var precoHoje = v.modo === 'PRECO_SEM_PIS_COFINS' ? c({ rotulo: 'Preço de hoje', path: 'venda.precoAtual', tipo: 'unit', largura: 'sm', dica: 'O preço que você pratica hoje, com o PIS e a Cofins embutidos. O sistema retira esses tributos no cenário 2027.' }) : '';
    var markup = v.modo === 'MARKUP_COM_DESPESAS' || v.modo === 'MARKUP_SEM_DESPESAS' ? c({ rotulo: 'Markup', path: 'venda.markup', tipo: 'num', largura: 'xs', dica: v.modo === 'MARKUP_COM_DESPESAS' ? 'PV = CL × markup. Despesas e tributos só mostram quanto sobra de lucro.' : 'O markup gera o preço-base e o sistema acrescenta as despesas por dentro (gross-up): PV = CL × M ÷ ((1 − d)(1 − Σ)).' }) : '';
    var margemCampo = '<label class="nx-field w-sm"><span class="nx-label">Margem desejada<span class="nx-tip" tabindex="0" title="Digite a margem e o sistema preenche o preço (PV para a margem). O preço passa a valer como informado.">?</span></span><span class="nx-input-wrap has-suffix"><input class="nx-input is-num" type="text" inputmode="decimal" autocomplete="off" data-lc-margem="' + esc(it.id) + '" value="' + (r && !r.erro && r.margem != null ? esc(F.inputValue(r.margem * 100, 'pct')) : '') + '" aria-label="Margem desejada"><span class="nx-suffix">%</span></span><span class="nx-err" aria-live="polite"></span></label>';
    var preco = U.cartao({ eyebrow: 'Venda do item', titulo: 'Preço e deduções',
      corpo: U.segmento({ compacto: true, scope: 'item', id: it.id, path: 'venda.modo', valor: v.modo, rotulo: 'Como formar o preço', opcoes: MODOS_OPCOES }) +
        '<p class="nx-note lc-modo-nota">' + esc(modoTexto(v.modo, p)) + '</p>' +
        '<div class="nx-form-grid">' + precoHoje + markup +
          c({ rotulo: 'Preço de venda (unitário)', path: 'venda.precoVenda', tipo: 'unit', largura: 'sm', valor: pvAtual, dica: 'Em qualquer modo, o preço fica editável: ao digitar, ele passa a valer como preço informado.' }) +
          margemCampo +
        '</div>' + (v.modo === 'PRECO_SEM_PIS_COFINS' ? '<div data-lc-live="venda-descont" data-lc-id="' + esc(it.id) + '">' + LC.live['venda-descont'](L, it.id) + '</div>' : '') +
        '<div class="nx-form-grid">' +
          U.selecao({ scope: 'item', id: it.id, path: 'venda.descontoTipo', valor: v.descontoTipo || 'pct', rotulo: 'Desconto em', largura: 'xs', opcoes: [['pct', '%'], ['valor', 'R$ por un.']] }) +
          c({ rotulo: 'Desconto incondicional', path: 'venda.desconto', tipo: v.descontoTipo === 'valor' ? 'unit' : 'pct', largura: 'sm' }) +
          c({ rotulo: 'Comissão', path: 'venda.comissao', tipo: 'pct', largura: 'xs' }) +
          c({ rotulo: 'Taxa de cartão', path: 'venda.taxaCartao', tipo: 'pct', largura: 'xs', dica: 'Taxa média. Por bandeira ou parcela em versão futura.' }) +
        '</div>' + tributacao(L, it, p) });
    var id = esc(it.id);
    // DRE primeiro no HTML (é o que se quer ver); em tela larga fica à direita do preço, fixa ao rolar
    var resultado = '<div class="lc-venda-res">' + U.cartao({ classe: 'lc-dre-card', eyebrow: 'Lucratividade do item', titulo: 'Lucro, margem e DRE',
      corpo: '<div data-lc-live="venda-lucro" data-lc-id="' + id + '">' + LC.live['venda-lucro'](L, it.id) + '</div>' +
        '<div data-lc-live="venda-dre" data-lc-id="' + id + '">' + LC.live['venda-dre'](L, it.id) + '</div>' }) + '</div>';
    var edicao = '<div class="lc-venda-ed">' + preco +
      U.cartao({ eyebrow: 'Espaço de negociação', titulo: 'Referências de preço',
        corpo: '<div data-lc-live="venda-referencias" data-lc-id="' + id + '">' + LC.live['venda-referencias'](L, it.id) + '</div>' }) +
      (r && r.alertas && r.alertas.length ? U.cartao({ eyebrow: 'Atenção', titulo: 'Alertas do item', corpo: '<div data-lc-live="venda-alertas" data-lc-id="' + id + '">' + LC.live['venda-alertas'](L, it.id) + '</div>' }) : '') +
      '</div>';
    return '<div data-lc-live="venda-resposta" data-lc-id="' + id + '">' + LC.live['venda-resposta'](L, it.id) + '</div>' +
      '<div data-lc-live="venda-custo" data-lc-id="' + id + '">' + LC.live['venda-custo'](L, it.id) + '</div>' +
      '<div class="lc-venda-grid">' + resultado + edicao + '</div>';
  }
  LC.live['venda-alertas'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    return U.alertas([], L.resultado(it).alertas.map(function (a) { return { msg: a.msg }; }), { vazio: 'Sem alertas.' });
  };

  function vendaPadrao(L) {
    var an = L.analise(), vp = an.vendaPadrao;
    function c(o) { o.scope = 'ana'; o.valor = N.store.getPath(an, o.path); return U.campo(o); }
    return '<details class="nx-card nx-details lc-venda-padrao"><summary><span class="nx-eyebrow">Planilha inteira</span><strong>Venda padrão da análise</strong><small>Escolha o modo, o markup e as despesas uma vez e aplique a todos os itens</small></summary><div class="nx-card-body">' +
      U.segmento({ compacto: true, scope: 'ana', path: 'vendaPadrao.modo', valor: vp.modo, rotulo: 'Como formar o preço', opcoes: MODOS_OPCOES.map(function (o) { return [o[0], o[1], '']; }) }) +
      (vp.modo === 'PRECO_SEM_PIS_COFINS' ? '<p class="nx-note">Cada item usa o próprio preço atual como preço de hoje; o PIS e a Cofins saem no cenário 2027.</p>' : '') +
      '<div class="nx-form-grid">' + (vp.modo === 'MARKUP_COM_DESPESAS' || vp.modo === 'MARKUP_SEM_DESPESAS' ? c({ rotulo: 'Markup', path: 'vendaPadrao.markup', tipo: 'num', largura: 'xs' }) : '') +
        U.selecao({ scope: 'ana', path: 'vendaPadrao.descontoTipo', valor: vp.descontoTipo || 'pct', rotulo: 'Desconto em', largura: 'xs', opcoes: [['pct', '%'], ['valor', 'R$ por un.']] }) +
        c({ rotulo: 'Desconto', path: 'vendaPadrao.desconto', tipo: vp.descontoTipo === 'valor' ? 'unit' : 'pct', largura: 'sm' }) +
        c({ rotulo: 'Comissão', path: 'vendaPadrao.comissao', tipo: 'pct', largura: 'xs' }) + c({ rotulo: 'Taxa de cartão', path: 'vendaPadrao.taxaCartao', tipo: 'pct', largura: 'xs' }) +
      '</div>' + U.botao('Aplicar a todos os itens', 'lc-aplicar-venda', { tipo: 'primary', classe: 'sm' }) + '</div></details>';
  }

  // ------------------------------------------------------------------ filtro do item (busca + situação + lista)
  function normBusca(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  /** Situação do item para o filtro: prejuízo, abaixo da meta, na meta (ou com lucro, sem meta) e sem preço */
  function situacao(x) { return x.r.erro ? 'sem' : x.r.faixa; }
  function filtro(L) { return L.filtroVenda || (L.filtroVenda = { busca: '', faixa: 'todos' }); }

  /** Itens que passam pela busca e, se informada, pela situação */
  function filtrados(L, ignorarFaixa) {
    var f = filtro(L), termo = normBusca(f.busca).trim();
    return L.resultados().filter(function (x) {
      if (!ignorarFaixa && f.faixa !== 'todos' && situacao(x) !== f.faixa) return false;
      return !termo || normBusca([x.item.codigo, x.item.descricao, x.item.ncm].join(' ')).indexOf(termo) >= 0;
    });
  }
  LC.views.vendaFiltrados = filtrados;

  function rotuloItem(x) {
    var r = x.r;
    return (x.item.codigo ? x.item.codigo + ' — ' : '') + (x.item.descricao || 'Item sem descrição') + ' · ' +
      (r.erro ? 'sem preço' : 'margem ' + F.pct(r.margem * 100) + (r.faixa === 'negativa' ? ' (prejuízo)' : r.faixa === 'abaixo' ? ' (abaixo da meta)' : ''));
  }

  /** Parte do filtro redesenhada a cada letra da busca (o campo de busca fica fora, para não perder o foco) */
  function filtroResultado(L) {
    var f = filtro(L), p = L.params(L.analise());
    var atualId = L.item() ? L.item().id : null;
    var base = filtrados(L, true), lista = filtrados(L);
    var meta = p.margemAlvo != null;
    var faixas = [['todos', 'Todos'], ['negativa', 'Prejuízo'], ['abaixo', 'Abaixo da meta'], ['ok', meta ? 'Na meta ou acima' : 'Com lucro'], ['sem', 'Sem preço']]
      .filter(function (o) { return o[0] !== 'abaixo' || meta; });
    var chips = '<div class="lc-filtro-faixas" role="group" aria-label="Filtrar por situação">' + faixas.map(function (o) {
      var n = o[0] === 'todos' ? base.length : base.filter(function (x) { return situacao(x) === o[0]; }).length;
      var on = f.faixa === o[0];
      return '<button type="button" class="lc-ff is-' + o[0] + (on ? ' is-on' : '') + '" data-acao="lc-filtro-faixa" data-faixa="' + o[0] + '" aria-pressed="' + on + '"' + (!n && !on ? ' disabled' : '') + '>' + esc(o[1]) + ' <b>' + n + '</b></button>';
    }).join('') + '</div>';
    var noFiltro = lista.some(function (x) { return x.item.id === atualId; });
    var opcoes = (noFiltro || !atualId ? '' : '<option value="' + esc(atualId) + '" selected>' + esc(rotuloItem(L.resultados().filter(function (x) { return x.item.id === atualId; })[0])) + ' (fora do filtro)</option>') +
      lista.map(function (x) { return '<option value="' + esc(x.item.id) + '"' + (x.item.id === atualId ? ' selected' : '') + '>' + esc(rotuloItem(x)) + '</option>'; }).join('');
    var pos = lista.map(function (x) { return x.item.id; }).indexOf(atualId);
    var ant = pos > 0 ? lista[pos - 1] : null, prox = pos >= 0 && pos < lista.length - 1 ? lista[pos + 1] : (pos < 0 && lista.length ? lista[0] : null);
    function navBtn(x, rot, cls) {
      return '<button type="button" class="nx-btn sm lc-filtro-nav ' + cls + '" data-acao="lc-selecionar-item"' + (x ? ' data-id="' + esc(x.item.id) + '" title="' + esc(rotuloItem(x)) + '"' : ' disabled') + '>' + rot + '</button>';
    }
    return chips +
      '<div class="lc-filtro-sel">' + navBtn(ant, '‹ Anterior', 'is-ant') +
        '<label class="nx-field lc-filtro-lista"><span class="sr">Item</span><span class="nx-input-wrap"><select class="nx-input" data-scope="ui" data-path="itemId" aria-label="Item em análise"' + (opcoes ? '' : ' disabled') + '>' +
          (opcoes || '<option>Nenhum item neste filtro</option>') + '</select></span></label>' +
        navBtn(prox, 'Próximo ›', 'is-prox') + '</div>' +
      '<p class="lc-filtro-conta">' + (lista.length ? (pos >= 0 ? 'Item ' + (pos + 1) + ' de ' + lista.length : lista.length + ' item(ns)') + ' no filtro' : 'Nenhum item no filtro') + ' · ' + L.analise().itens.length + ' na análise</p>';
  }
  LC.views.vendaFiltro = filtroResultado;
  // área viva: margem e situação na lista acompanham a digitação do preço
  LC.live['venda-filtro'] = function (L) { return filtroResultado(L); };

  function cartaoFiltro(L, it) {
    var f = filtro(L);
    return '<section class="nx-card nx-filtro lc-filtro" aria-label="Item em análise"><div class="lc-filtro-grade">' +
        '<label class="nx-field lc-filtro-busca"><span class="nx-label">Item em análise · buscar</span><span class="nx-input-wrap"><input class="nx-input" type="search" autocomplete="off" data-lc-filtro="busca" value="' + esc(f.busca) + '" placeholder="Código, descrição ou NCM — Enter abre o primeiro"></span></label>' +
        '<div id="lc-filtro-res" class="lc-filtro-res" data-lc-live="venda-filtro">' + filtroResultado(L) + '</div></div>' +
      '<div class="lc-filtro-acoes">' + U.botao('Editar a compra', 'lc-abrir-item', { dados: { id: it.id }, classe: 'sm' }) + U.botao('Ver todos os itens', 'lc-ir', { dados: { rota: 'resultado' }, classe: 'sm' }) + '</div></section>';
  }

  LC.views.venda = {
    render: function (L) {
      var vazio = LC.views.semDados(L, true);
      if (vazio) return vazio;
      var an = L.analise();
      var it = L.item() || an.itens[0];
      L.d.ui.itemId = it.id; // filtro e tela mostram o mesmo item
      return '<div class="nx-stack">' + cartaoFiltro(L, it) + telaItem(L, it) + vendaPadrao(L) + '</div>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
