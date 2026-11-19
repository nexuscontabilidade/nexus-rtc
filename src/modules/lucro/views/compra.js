/* Lucratividade por Item — etapa 2: compra (importação, itens, créditos e custo líquido) */
(function (root) {
  'use strict';
  var N = root.Nexus, LC = N.lucro, M = LC.motor, U = N.rtc.ui, F = N.fmt, esc = F.esc;

  function brl(v) { return F.brl(v || 0); }

  // ------------------------------------------------------------------ sinal de dados de 2026 no cenário 2027
  var TXT_SELO = 'Dados de 2026: a nota deste produto não tem o destaque da CBS e do IBS. Os valores de 2027 foram projetados pelas regras do fisco. Informe a CBS e o IBS da nota de 2027 na ficha do item para um preço mais preciso.';
  var ICO_ALERTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
  /** Produto com os mesmos dados de 2026 (sem CBS e IBS destacados): só no cenário 2027; fornecedor do Simples não recebe o sinal */
  function projetado(c) { return !!c && c.cenario === '2027' && c.dados2027 === 'projetado'; }
  function selo2027(c) { return projetado(c) ? ' <span class="lc-selo-27" role="img" tabindex="0" aria-label="' + esc(TXT_SELO) + '" title="' + esc(TXT_SELO) + '">' + ICO_ALERTA + '</span>' : ''; }
  /** Aviso em uma linha (ficha do item e tela Venda) */
  function aviso2027(c) { return projetado(c) ? '<p class="lc-aviso-27">' + ICO_ALERTA + '<span><b>Dados de 2026.</b> A nota deste produto não tem o destaque da CBS e do IBS: os valores de 2027 foram projetados pelas regras do fisco.</span></p>' : ''; }
  LC.views.projetado2027 = projetado;
  LC.views.selo2027 = selo2027;
  LC.views.aviso2027 = aviso2027;

  /** Tratamento de CBS e IBS do item (cenário 2027): vale para a compra e para a venda, como no RTC */
  LC.views.campoCbsIbs = function (it, ajuda) {
    var cb = it.cbsIbs || {};
    return '<div class="nx-form-grid">' +
      U.selecao({ scope: 'item', id: it.id, path: 'cbsIbs.regime', valor: cb.regime || 'NORMAL', rotulo: 'CBS e IBS do item (2027)', largura: 'md', dica: ajuda,
        opcoes: Object.keys(M.REGIMES_CBS_IBS).map(function (k) { return [k, M.REGIMES_CBS_IBS[k]]; }) }) +
      (cb.regime === 'REDUCAO' ? U.campo({ scope: 'item', id: it.id, path: 'cbsIbs.reducao', tipo: 'pct', valor: cb.reducao, rotulo: 'Redução', largura: 'xs', dica: 'Ex.: 30% ou 60%, conforme o anexo da LC 214/2025 para o NCM.' }) : '') +
      '</div>';
  };

  /** Texto do detalhe dos créditos (aparece ao passar o mouse) */
  function dicaIcms(c) {
    var linhas = c.detalheIcms.map(function (x) { return x[0] + ': ' + F.brl(x[1]); });
    if (c.creditoIcmsPendente) linhas.push('DAE 1023 a apropriar após o pagamento: ' + F.brl(c.creditoIcmsPendente));
    if (c.motivoIcms) linhas.push(c.motivoIcms);
    return linhas.length ? linhas.join('\n') : 'Sem crédito de ICMS.';
  }
  function dicaPisCofins(c) {
    if (c.motivoPisCofins) return c.motivoPisCofins;
    return 'Base: mercadoria − desconto − ICMS destacado na NF = ' + F.brl(c.basePisCofins) + ' (frete, seguro, IPI e DAE fora da base)\nCrédito: base × (PIS + Cofins) = ' + F.brl(c.creditoPisCofins);
  }
  /** 2027: CBS e IBS na nota de compra e o crédito */
  function dicaCbsIbs(c) {
    var l;
    if (c.dados2027 === 'nf') l = ['Nota de 2027: CBS destacada ' + F.brl(c.cbsEntrada) + ' · IBS destacado ' + F.brl(c.ibsEntrada) + ' — por fora, no custo bruto', 'ICMS destacado na nota: ' + F.brl(c.composicao.icmsDestacado)];
    else if (c.dados2027 === 'simples') l = [];
    else l = ['Projetado com os dados de 2026 (a nota não tem o destaque da CBS e do IBS)',
      'Base: valor da operação − ICMS destacado' + (c.composicao.icmsRecalculado2027 ? ' de 2027' : '') + ' = ' + F.brl(c.baseCbsIbs) + ' (sem ICMS e ISS: LC 214/2025, art. 12, § 2º, V)',
      'CBS (' + F.pct(c.aliqCbs * 100) + '): ' + F.brl(c.cbsEntrada) + ' · IBS (' + F.pct(c.aliqIbs * 100) + '): ' + F.brl(c.ibsEntrada) + ' — por fora, no custo bruto'];
    l.push(c.motivoCbsIbs || 'Crédito integral: ' + F.brl(c.creditoCbsIbs) + ' (LC 214/2025, art. 47)');
    if (c.motivoIpi) l.push(c.motivoIpi);
    return l.join('\n');
  }
  /** Crédito de PIS/Cofins (2026) ou de CBS/IBS (2027) */
  function creditoTrib(c) { return c.cenario === '2027' ? c.creditoCbsIbs : c.creditoPisCofins; }
  function dicaTrib(c) { return c.cenario === '2027' ? dicaCbsIbs(c) : dicaPisCofins(c); }
  LC.views.creditoTrib = creditoTrib;
  LC.views.dicaTrib = dicaTrib;

  function chipsAlerta(alertas) {
    if (!alertas.length) return '<span class="nx-count is-ok">OK</span>';
    return alertas.map(function (a) { return '<span class="lc-alerta is-' + esc(a.tipo) + '" title="' + esc(a.msg) + '">' + esc({ 'dae-1023-pendente': '1023 não pago', 'sem-aliquota-venda': 'sem alíquota de venda', 'st-inconsistente': 'ST sem 1031', 'margem-negativa': 'margem negativa', 'das-st': 'DAS com ICMS', 'dae-uf': 'DAE fora do CE', 'dae-codigo': 'DAE sem código' }[a.tipo] || 'alerta') + '</span>'; }).join(' ');
  }

  function tabela(L) {
    var an = L.analise();
    var lista = L.resultados();
    if (!lista.length) return '<p class="nx-muted">Nenhum item cadastrado. Importe a planilha de compra ou cadastre um item.</p>';
    var c27 = L.cenario() === '2027';
    var tot = { cb: 0, ci: 0, cp: 0, pend: 0, cl: 0 };
    // as caixas de seleção só aparecem depois de clicar em "Selecionar produtos"
    var modoSel = !!L.sel().ativo;
    var sel = L.sel().ids;
    var rows = lista.map(function (x) {
      var it = x.item, c = x.r.compra;
      tot.cb += c.custoBruto; tot.ci += c.creditoIcms; tot.cp += creditoTrib(c); tot.pend += c.creditoIcmsPendente; tot.cl += c.custoLiquido;
      var alertasCompra = x.r.alertas.filter(function (a) { return ['dae-1023-pendente', 'dae-uf', 'dae-codigo', 'sem-aliquota-venda', 'st-inconsistente'].indexOf(a.tipo) >= 0; });
      var marcado = !!sel[it.id];
      var cls = (L.d.ui.itemAberto === it.id ? 'is-ativo' : '') + (marcado ? ' is-sel' : '');
      return '<tr' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + '>' +
        (modoSel ? '<td class="c-sel"><input type="checkbox" class="nx-sel-caixa" data-lc-sel="' + esc(it.id) + '"' + (marcado ? ' checked' : '') + ' aria-label="Selecionar ' + esc(it.codigo || it.descricao || 'item') + '"></td>' : '') +
        '<td class="lc-cod"><button type="button" class="nx-link-btn" data-acao="lc-abrir-item" data-id="' + esc(it.id) + '"><strong>' + esc(it.codigo || '—') + '</strong></button>' + selo2027(c) + '</td>' +
        '<td>' + esc(it.descricao || 'Item sem descrição') + (it.origemModulo === 'rtc' ? ' <span class="nx-origem-tag" title="Trazido do módulo RTC Comparativo">do RTC</span>' : '') + (it.ncm ? '<small class="nx-obs">NCM ' + esc(it.ncm) + '</small>' : '') + '</td>' +
        '<td class="num">' + F.num(Number(it.quantidade) || 0, (Number(it.quantidade) || 0) % 1 ? 4 : 0) + '</td>' +
        '<td class="num">' + brl(c.custoBruto) + (c27 && (c.cbsEntrada + c.ibsEntrada) ? '<small class="nx-obs">com CBS/IBS ' + brl(c.cbsEntrada + c.ibsEntrada) + '</small>' : '') + '</td>' +
        '<td class="num lc-dica" title="' + esc(dicaIcms(c)) + '">' + brl(c.creditoIcms) + (c.creditoIcmsPendente ? '<small class="nx-obs lc-pendente">+ ' + brl(c.creditoIcmsPendente) + ' a apropriar</small>' : '') + '</td>' +
        '<td class="num lc-dica" title="' + esc(dicaTrib(c)) + '">' + brl(creditoTrib(c)) + '</td>' +
        '<td class="num"><b>' + brl(c.custoLiquido) + '</b></td>' +
        '<td class="num">' + (c.custoLiquidoUnit != null ? F.unit(c.custoLiquidoUnit) : '—') + '</td>' +
        '<td>' + chipsAlerta(alertasCompra) + '</td>' +
        '<td class="c-acoes">' + U.botao('Editar', 'lc-abrir-item', { dados: { id: it.id }, classe: 'sm' }) + U.botao('Excluir', 'lc-excluir-item', { dados: { id: it.id }, classe: 'sm danger-ghost' }) + '</td></tr>';
    }).join('');
    var total = '<tr class="is-total"><td colspan="' + (modoSel ? 4 : 3) + '">Total · ' + lista.length + ' item(ns)</td><td class="num">' + brl(tot.cb) + '</td><td class="num">' + brl(tot.ci) + (tot.pend ? '<small class="nx-obs lc-pendente">+ ' + brl(tot.pend) + ' a apropriar</small>' : '') + '</td><td class="num">' + brl(tot.cp) + '</td><td class="num">' + brl(tot.cl) + '</td><td colspan="3"></td></tr>';
    var nSel = lista.filter(function (x) { return sel[x.item.id]; }).length;
    var vindos = lista.filter(function (x) { return x.item.origemModulo === 'rtc'; }).length;
    var barra = !modoSel
      ? '<div class="nx-lote is-off">' + U.botao('Selecionar produtos', 'lc-sel-modo', { classe: 'sm', titulo: 'Mostra as caixas para marcar vários itens e excluir de uma vez' }) + '</div>'
      : '<div class="nx-lote">' +
        '<span class="nx-lote-conta">' + (nSel ? '<b>' + nSel + '</b> selecionado(s)' : 'Marque os itens para excluir em lote') + '</span>' +
        U.botao(nSel && nSel === lista.length ? 'Desmarcar todos' : 'Selecionar todos', 'lc-sel-todos', { classe: 'sm' }) +
        (vindos ? U.botao('Selecionar vindos do RTC (' + vindos + ')', 'lc-sel-origem', { classe: 'sm', titulo: 'Marca os itens trazidos do módulo RTC Comparativo' }) : '') +
        U.botao(nSel ? 'Excluir ' + nSel + ' selecionado(s)' : 'Excluir selecionados', 'lc-excluir-lote', { classe: 'sm danger-ghost', desabilitado: !nSel }) +
        U.botao('Cancelar', 'lc-sel-modo', { classe: 'sm', titulo: 'Esconde as caixas de seleção' }) + '</div>';
    return barra + '<div class="nx-table-wrap"><table class="nx-table compact lc-tab-compra"><thead><tr>' + (modoSel ? '<th class="c-sel"><span class="sr">Selecionar</span></th>' : '') + '<th>Código</th><th>Descrição</th><th class="num">Qtd</th><th class="num">Custo bruto<small class="nx-th-dica">o que se paga</small></th><th class="num">Crédito ICMS</th><th class="num">' + (c27 ? 'Crédito CBS/IBS' : 'Crédito PIS/Cofins') + '</th><th class="num">Custo líquido<small class="nx-th-dica">custo real</small></th><th class="num">Por unidade<small class="nx-th-dica">custo líquido</small></th><th>Alertas</th><th></th></tr></thead><tbody>' + rows + total + '</tbody></table></div>' +
      '<p class="nx-note">Passe o mouse sobre os créditos para ver o detalhe.</p>';
  }

  /** Prévia da planilha de atualização para 2027: o que muda em cada produto, antes de gravar */
  function previaAtualizacao(L, imp) {
    var pl = imp.plano;
    function lista(xs, cls, titulo) {
      if (!xs.length) return '';
      return '<div class="nx-import-msgs ' + cls + '"><h4>' + titulo + ' (' + xs.length + ')</h4><ul>' + xs.slice(0, 60).map(function (e) { return '<li>' + (e.linha ? '<b>Linha ' + e.linha + '</b>: ' : '') + esc(e.msg) + '</li>'; }).join('') + (xs.length > 60 ? '<li>… e mais ' + (xs.length - 60) + '.</li>' : '') + '</ul></div>';
    }
    var mudam = pl.linhas.filter(function (l) { return !l.item || l.mudancas.length; }).map(function (l) {
      return { linha: l.linha, msg: (l.item ? (l.item.codigo || l.item.descricao) + ': ' + l.mudancas.join(', ') : (l.novo.codigo || l.novo.descricao) + ': produto novo') };
    });
    var kpis = '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Produtos atualizados', valor: String(pl.atualizados), destaque: true, sub: pl.semMudanca + ' sem mudança · ' + pl.lidas + ' linha(s) lida(s)' }) +
      U.kpi({ rotulo: 'Com CBS e IBS da nota', valor: String(pl.comNota2027), sub: 'perdem o sinal de dados de 2026' }) +
      U.kpi({ rotulo: 'Produtos novos', valor: String(pl.novos), sub: pl.foraDaPlanilha ? pl.foraDaPlanilha + ' da análise fora da planilha (ficam como estão)' : 'linhas sem ID nem código conhecido' }) +
      U.kpi({ rotulo: 'Linhas com erro (bloqueadas)', valor: String(pl.erros.length) }) + '</div>';
    var pode = pl.atualizados || pl.novos;
    return U.cartao({ classe: 'nx-import', id: 'lc-importacao', eyebrow: 'Prévia da atualização para 2027', titulo: esc(imp.arquivo),
      sub: 'Os valores entram só no cenário 2027 da análise "' + esc(L.analise().nome) + '". O cenário 2026 fica como está.',
      acoes: U.botao(pode ? 'Gravar no cenário 2027' : 'Nada a gravar', 'lc-confirmar-importacao', { tipo: 'primary', classe: 'sm', desabilitado: !pode }) + U.botao('Cancelar', 'lc-cancelar-importacao', { classe: 'sm' }),
      corpo: kpis + lista(pl.erros, 'is-erro', 'Erros') + lista(pl.avisos, 'is-alerta', 'Avisos') + lista(mudam, 'is-info', 'O que muda') });
  }

  /** Prévia da importação: linhas válidas, alertas e erros antes de gravar */
  function previa(L) {
    var imp = L.importacao;
    if (!imp) return '';
    if (imp.plano) return previaAtualizacao(L, imp);
    var nItens = imp.compra ? imp.compra.itens.length : 0;
    var erros = (imp.compra ? imp.compra.erros : []).concat(imp.tributacao ? imp.tributacao.erros.map(function (e) { return { linha: e.linha, msg: '[tributação] ' + e.msg }; }) : []);
    function lista(xs, cls, titulo) {
      if (!xs.length) return '';
      return '<div class="nx-import-msgs ' + cls + '"><h4>' + titulo + ' (' + xs.length + ')</h4><ul>' + xs.slice(0, 60).map(function (e) { return '<li>' + (e.linha ? '<b>Linha ' + e.linha + '</b>: ' : '') + esc(e.msg) + '</li>'; }).join('') + (xs.length > 60 ? '<li>… e mais ' + (xs.length - 60) + '.</li>' : '') + '</ul></div>';
    }
    var kpis = '<div class="nx-kpis k4">' +
      U.kpi({ rotulo: 'Itens válidos', valor: String(nItens), destaque: true, sub: imp.compra ? imp.compra.lidas + ' linha(s) lida(s) · aba "' + imp.compra.aba + '"' : 'Sem planilha de itens' }) +
      (imp.compra
        ? U.kpi({ rotulo: 'Com preço de venda', valor: String(imp.compra.comPreco || 0), sub: (imp.compra.comTrib || (imp.tributacao ? imp.aplicacoes.length : 0)) + ' com tributação da venda (ICMS, PIS e Cofins)' })
        : U.kpi({ rotulo: 'Linhas de tributação', valor: String(imp.tributacao.linhas.length), sub: imp.aplicacoes.length + ' casada(s) com itens' })) +
      U.kpi({ rotulo: 'Alertas', valor: String(imp.alertas.length) }) +
      U.kpi({ rotulo: 'Linhas com erro (bloqueadas)', valor: String(erros.length) }) + '</div>';
    var pode = nItens || (!imp.compra && imp.aplicacoes.length);
    return U.cartao({ classe: 'nx-import', id: 'lc-importacao', eyebrow: 'Prévia da importação', titulo: esc(imp.arquivo),
      sub: imp.compra ? 'Os itens válidos serão acrescentados à análise "' + esc(L.analise().nome) + '". Linhas com erro não são gravadas.' : 'A tributação será aplicada aos itens já cadastrados nesta análise, pelo código (ou NCM).',
      acoes: U.botao(imp.compra ? 'Gravar ' + nItens + ' item(ns)' : 'Aplicar tributação', 'lc-confirmar-importacao', { tipo: 'primary', classe: 'sm', desabilitado: !pode }) + U.botao('Cancelar', 'lc-cancelar-importacao', { classe: 'sm' }),
      corpo: kpis + lista(erros, 'is-erro', 'Erros') + lista(imp.alertas, 'is-alerta', 'Alertas') });
  }

  function fichaItem(L) {
    var it = L.d.ui.itemAberto ? L.item(L.d.ui.itemAberto) : null; // sem ficha aberta não cai no item selecionado
    if (!it) return '';
    var p = L.params(L.analise());
    function c(o) { o.scope = 'item'; o.id = it.id; o.valor = N.store.getPath(it, o.path); return U.campo(o); }
    function sel(o) { o.scope = 'item'; o.id = it.id; o.valor = N.store.getPath(it, o.path); return U.selecao(o); }
    function sw(o) { o.scope = 'item'; o.id = it.id; o.marcado = N.store.getPath(it, o.path) !== false; return U.chave(o); }
    var real = p.regime === 'REAL';
    var c27 = p.cenario === '2027';
    var cb = it.cbsIbs || {};
    var dae = Number(it.compra.daeValor) > 0;
    var fornSN = !!it.compra.fornecedorSimples;
    var nota27 = c27 ? '<div class="lc-nf27"><span class="nx-label">Nota fiscal de 2027</span><div class="nx-form-grid">' +
        c({ rotulo: fornSN ? 'CBS paga pelo optante (na nota)' : 'CBS destacada na NF', path: 'compra.cbsDestacada', tipo: 'money', largura: 'sm' }) +
        c({ rotulo: fornSN ? 'IBS pago pelo optante (na nota)' : 'IBS destacado na NF', path: 'compra.ibsDestacado', tipo: 'money', largura: 'sm' }) + '</div>' +
        '<p class="nx-note">' + (fornSN
          ? 'Fornecedor do Simples Nacional: a CBS e o IBS ficam dentro do DAS dele, sem destaque por fora, e o produto não recebe o sinal de dados de 2026. Se a nota informar a CBS e o IBS pagos por ele, digite aqui: viram crédito (LC 214/2025, art. 47, § 9º).'
          : 'Com a nota de 2027, informe a CBS e o IBS destacados nela e use os valores dessa nota nos campos acima (mercadoria, ICMS destacado etc.): o sistema usa o ICMS, a CBS e o IBS da nota, sem projeção. Em branco, os valores de 2027 são projetados a partir dos dados de 2026 e o produto fica marcado com o sinal de alerta.') + '</p></div>' : '';
    return U.cartao({ id: 'lc-ficha-item', classe: 'lc-ficha', eyebrow: 'Item da compra', titulo: esc((it.codigo ? it.codigo + ' — ' : '') + (it.descricao || 'Novo item')),
      acoes: U.botao('Fechar', 'lc-fechar-item', { classe: 'sm' }) + U.botao('Ir para a venda', 'lc-selecionar-item', { dados: { id: it.id, rota: 'venda' }, tipo: 'primary', classe: 'sm' }),
      corpo: '<div class="lc-ficha-grid"><div>' +
        '<div class="nx-form-grid">' +
          c({ rotulo: 'Código', path: 'codigo', largura: 'sm', obrigatorio: true }) +
          c({ rotulo: 'Descrição', path: 'descricao', largura: 'lg', obrigatorio: true }) +
          c({ rotulo: 'NCM', path: 'ncm', largura: 'sm', maxlength: 10, obrigatorio: true }) +
          c({ rotulo: 'Quantidade', path: 'quantidade', tipo: 'num', largura: 'sm', obrigatorio: true }) +
        '</div><p class="nx-note">Valores do total da linha da NF; o sistema divide pela quantidade para chegar ao unitário.</p><div class="nx-form-grid">' +
          c({ rotulo: 'Valor da mercadoria', path: 'compra.valorMercadoria', tipo: 'money', largura: 'sm', obrigatorio: true }) +
          c({ rotulo: 'Desconto incondicional', path: 'compra.descontoCompra', tipo: 'money', largura: 'sm' }) +
          c({ rotulo: 'Frete', path: 'compra.frete', tipo: 'money', largura: 'sm', dica: 'Frete pago pelo comprador (FOB) ou destacado na NF.' }) +
          c({ rotulo: 'ICMS do frete (CT-e)', path: 'compra.icmsFrete', tipo: 'money', largura: 'sm' }) +
          c({ rotulo: 'IPI', path: 'compra.ipi', tipo: 'money', largura: 'sm', dica: c27 ? 'Valor da nota. Em 2027 o IPI é zero (exceto Zona Franca de Manaus): ele sai do custo.' : undefined }) +
          c({ rotulo: 'Seguro e outras despesas', path: 'compra.seguroOutros', tipo: 'money', largura: 'sm' }) +
          c({ rotulo: fornSN ? 'Crédito de ICMS (optante)' : 'ICMS destacado na NF', path: 'compra.icmsDestacado', tipo: 'money', largura: 'sm', dica: fornSN ? 'O optante do Simples não destaca o ICMS: informe o crédito de ICMS indicado na nota (LC 123/2006, art. 23, § 1º).' : undefined }) +
          '<div class="nx-field w-md">' + U.chave({ scope: 'item', id: it.id, path: 'compra.fornecedorSimples', marcado: fornSN, rotulo: 'Fornecedor do Simples Nacional', ajuda: 'Em 2027, a CBS e o IBS do optante ficam dentro do DAS, sem destaque por fora.' }) + '</div>' +
        '</div>' + nota27 + '<div class="nx-form-grid">' +
          c({ rotulo: 'DAE (valor recolhido)', path: 'compra.daeValor', tipo: 'money', largura: 'sm' }) +
          sel({ rotulo: 'Código do DAE', path: 'compra.daeCodigo', largura: 'md', opcoes: [['', 'Sem DAE'], ['1023', '1023 — ICMS Antecipado'], ['1031', '1031 — ICMS-ST (entrada)']], obrigatorio: dae }) +
          (it.compra.daeCodigo === '1023' ? '<div class="nx-field w-md">' + sw({ path: 'compra.daePago', rotulo: 'DAE já pago', ajuda: 'O crédito do 1023 só é apropriado após o pagamento (Decreto 33.327/2019, art. 61, § 5º).' }) + '</div>' : '') +
          (it.compra.daeCodigo === '1031' ? '<div class="nx-field w-md"><p class="nx-note">Item com ICMS-ST: o DAE, o ICMS destacado na NF e o ICMS do frete ficam no custo, sem crédito de ICMS.</p></div>' : '') +
        '</div>' +
        (real && !c27 ? '<div class="nx-form-grid">' +
          sel({ rotulo: 'PIS/Cofins do item', path: 'compra.regimePisCofins', largura: 'md', opcoes: Object.keys(M.REGIMES_PIS_COFINS).map(function (k) { return [k, M.REGIMES_PIS_COFINS[k]]; }) }) +
          '<div class="nx-field w-md">' + sw({ path: 'compra.fornecedorPjBrasil', rotulo: 'Fornecedor PJ no Brasil', ajuda: 'Desmarcado, bloqueia o crédito de PIS/Cofins (art. 3º, § 3º, I).' }) + '</div></div>' : '') +
        (c27 ? LC.views.campoCbsIbs(it, 'Vale para a compra e para a venda. Reduções de 30% e 60%, alíquota zero (ex.: Cesta Básica Nacional) e isenções seguem o NCM e os anexos da LC 214/2025.') : '') +
        '</div><aside class="lc-ficha-res" data-lc-live="compra-resumo" data-lc-id="' + esc(it.id) + '">' + LC.live['compra-resumo'](L, it.id) + '</aside></div>'
    });
  }

  /** Resumo do custo do item (atualiza a cada digitação) */
  LC.live['compra-resumo'] = function (L, id) {
    var it = L.item(id);
    if (!it) return '';
    var c = L.resultado(it).compra;
    function linha(rot, v, cls, dica) { return '<li' + (cls ? ' class="' + cls + '"' : '') + (dica ? ' title="' + esc(dica) + '"' : '') + '><span>' + rot + '</span><b>' + F.brl(v) + '</b></li>'; }
    var c27 = c.cenario === '2027';
    var rotCbs = c.dados2027 === 'nf' ? 'dos quais CBS + IBS da nota de 2027' : c.dados2027 === 'simples' ? 'CBS + IBS dentro do DAS do fornecedor' : 'dos quais CBS + IBS (projetados)';
    return '<h4>Custo do item' + (c27 ? ' em 2027' : '') + '</h4>' + aviso2027(c) + '<ul class="lc-lista-valores">' +
      linha('Custo bruto (CB)', c.custoBruto) +
      (c27 ? '<li class="lc-sub" title="' + esc(dicaCbsIbs(c)) + '"><span>' + rotCbs + '</span><b>' + F.brl(c.cbsEntrada + c.ibsEntrada) + '</b></li>' : '') +
      (c.motivoIpi ? '<li class="lc-sub" title="' + esc(c.motivoIpi) + '"><span>' + (c.composicao.ipi ? 'IPI mantido (ZFM)' : 'IPI da nota fora do custo (zero em 2027)') + '</span><b>' + F.brl(c.composicao.ipiNota) + '</b></li>' : '') +
      linha('(−) Crédito de ICMS', -c.creditoIcms, 'lc-dica', dicaIcms(c)) +
      (c.creditoIcmsPendente ? linha('DAE 1023 a apropriar', c.creditoIcmsPendente, 'lc-pendente') : '') +
      linha(c27 ? '(−) Crédito de CBS e IBS' : '(−) Crédito de PIS/Cofins', -creditoTrib(c), 'lc-dica', dicaTrib(c)) +
      linha('= Custo líquido (CL)', c.custoLiquido, 'is-total') +
      (c.custoLiquidoUnit != null ? '<li><span>CL por unidade</span><b>' + F.unit(c.custoLiquidoUnit) + '</b></li>' : '') +
      '</ul>' + (c.alertas.length ? U.alertas([], c.alertas.map(function (a) { return { msg: a.msg }; })) : '');
  };

  LC.views.compra = {
    render: function (L) {
      var vazio = LC.views.semDados(L, false);
      if (vazio) return vazio;
      var an = L.analise(), p = L.params(an);
      var c27 = p.cenario === '2027';
      var regra = c27
        ? { SIMPLES: 'Nada é recuperado: tudo é custo, inclusive a CBS e o IBS pagos ao fornecedor (LC 123/2006, art. 23; LC 214/2025, art. 47, § 9º).', PRESUMIDO: 'Recupera o ICMS, a CBS e o IBS.', REAL: 'Recupera o ICMS, a CBS e o IBS.' }[p.regime]
        : { SIMPLES: 'Nada é recuperado: tudo é custo (LC 123/2006, art. 23).', PRESUMIDO: 'Só o ICMS é recuperado (LC 87/1996, arts. 19 e 20).', REAL: 'Recupera o ICMS, o PIS e a Cofins.' }[p.regime];
      var comoCalcula = '<p>Custo bruto = mercadoria − desconto + frete + IPI + seguro/outros + DAE' + (c27 ? ' + CBS + IBS' : '') + ' (DL 1.598/1977, art. 13, § 1º; RIR/2018, art. 301, § 1º). O ICMS destacado e o do frete já estão dentro dos valores (cálculo por dentro): aparecem só como crédito.</p>' +
        (c27
          ? '<p><b>2027:</b> a CBS e o IBS vêm por fora na nota, sobre (valor da operação − ICMS destacado), e voltam como crédito no regime regular (LC 214/2025, arts. 12, § 2º, V, e 47).' +
            (p.ibsCbsNaBaseIcms !== false ? ' Com a CBS e o IBS na base do ICMS (Parâmetros), o ICMS da nota é recalculado: a alíquota efetiva da nota (ICMS ÷ valor da operação) passa a incidir também sobre a CBS e o IBS, e o crédito de ICMS sobe.' : '') + ' O IPI é zero (EC 132/2023, ADCT, art. 126, III), salvo Zona Franca de Manaus. PIS e Cofins deixam de existir.</p>'
          : (p.regime === 'REAL' ? '<p>Base do crédito de PIS/Cofins: mercadoria − desconto − ICMS destacado na NF (frete, seguro, IPI e DAE ficam fora).</p>' : '')) +
        '<p>Custo líquido = custo bruto − créditos. É o custo real do item para a empresa.</p>';
      var acoes = U.botao('Importar planilha', 'lc-importar', { classe: 'sm', titulo: 'Uma linha por produto: compra e venda. Aceita .xlsx e .csv. Também lê a planilha de atualização para 2027.' }) + U.botao('Baixar modelo', 'lc-baixar-modelo', { classe: 'sm' }) +
        (L.pode2027() && an.itens.length ? U.botao('Exportar produtos para 2027', 'lc-exportar-2027', { classe: 'sm', titulo: 'Planilha com todos os produtos desta análise, para atualizar a compra com a nota de 2027 e informar a CBS e o IBS destacados' }) : '') +
        U.botao('Cadastrar item', 'lc-novo-item', { tipo: 'primary', classe: 'sm' });
      var itens = U.cartao({ eyebrow: 'Compra · ' + esc(an.nome) + ' · cenário ' + p.cenario, titulo: 'Itens e custo líquido de aquisição',
        sub: 'Regime: <b>' + esc(M.REGIMES[p.regime]) + '</b>. ' + regra,
        acoes: acoes,
        corpo: '<div data-lc-live="compra-tabela">' + tabela(L) + '</div>' +
          U.explica('Como o custo é calculado?', comoCalcula) +
          U.explica('Como importar a planilha?', '<p>Uma linha por produto: os dados da compra (valores do total do item na NF-e) e da venda (preço por unidade, comissão, taxa de cartão e tributação: ICMS, PIS e Cofins). Aceita .xlsx e .csv (separador ";" e decimal ","). Baixe o modelo para ver as colunas.</p>' +
            (L.pode2027() ? '<p><b>Atualização para 2027:</b> <b>Exportar produtos para 2027</b> baixa uma planilha com todos os produtos desta análise e os valores atuais. O cliente atualiza a compra com a nota de 2027 (preço unitário ou total, ICMS etc.) e informa a CBS e o IBS destacados. De volta em <b>Importar planilha</b>, uma prévia mostra o que muda, e os valores entram só no cenário 2027: o cenário 2026 fica como está.</p>' : '')) });
      return '<div class="nx-stack">' + previa(L) + '<div data-lc-live="compra-resposta">' + LC.live['compra-resposta'](L) + '</div>' + fichaItem(L) + itens +
        (an.itens.length ? '<div class="nx-btn-row">' + U.botao('Ir para a venda', 'lc-ir', { dados: { rota: 'venda' }, tipo: 'primary' }) + '</div>' : '') + '</div>';
    }
  };
  LC.live['compra-tabela'] = function (L) { return tabela(L); };
  /** Resposta da tela numa frase: quanto a compra custa de verdade, depois dos créditos */
  LC.live['compra-resposta'] = function (L) {
    var lista = L.resultados();
    if (!lista.length) return '';
    var t = M.totais(lista.map(function (x) { return x.r; }));
    var c27 = L.cenario() === '2027';
    var quais = c27 ? (L.params(L.analise()).regime === 'SIMPLES' ? '' : 'ICMS, CBS e IBS') : ({ SIMPLES: '', PRESUMIDO: 'ICMS', REAL: 'ICMS, PIS e Cofins' }[L.params(L.analise()).regime]);
    var txt = 'O custo real ' + (lista.length === 1 ? 'do item' : 'dos ' + lista.length + ' itens') + ' é <b>' + F.brl(t.custoLiquido) + '</b>' +
      (t.creditos > 0.004 ? ': <b>' + F.brl(t.custoBruto) + '</b> pagos na compra, menos <b>' + F.brl(t.creditos) + '</b> que voltam como crédito' + (quais ? ' (' + quais + ')' : '') + '.' : ', sem créditos a recuperar: tudo o que se paga na compra é custo.');
    var nProj = c27 ? lista.filter(function (x) { return projetado(x.r.compra); }).length : 0;
    return U.resposta(txt, (c27 ? 'Cenário 2027: a CBS e o IBS da nota de compra entram no custo bruto e voltam como crédito; o IPI é zero. ' : '') + 'Custo líquido = custo bruto − créditos.' +
      (nProj ? '<br>' + ICO_ALERTA.replace('<svg ', '<svg class="lc-ico-27" ') + ' ' + (nProj === lista.length ? 'Todos os produtos estão' : nProj + (nProj === 1 ? ' produto está' : ' produtos estão')) + ' com os dados de 2026, sem o destaque da CBS e do IBS: os valores de 2027 são projetados. Informe a nota de 2027 na ficha do item.' : ''));
  };
  LC.views.chipsAlerta = chipsAlerta;
})(typeof window !== 'undefined' ? window : globalThis);
