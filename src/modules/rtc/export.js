/*
 * RTC Comparativo — dados do relatório e exportação em PDF e Excel, em dois modelos:
 *  - completo: memória de cálculo, comparativos, sensibilidade, premissas, fundamentos e parâmetros;
 *  - simplificado: para o empresário — respostas principais, "como chegamos a esses números" e o que muda em 2027.
 * PDF: jsPDF + AutoTable carregados sob demanda (CDN). Excel: gerador .xlsx nativo (sem dependências).
 */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, F = N.fmt, D = N.dom;

  var CDN = {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  };

  function has(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)) && Number(v) > 0; }

  // ------------------------------------------------------------------ dados estruturados
  function linhaCusto(l) {
    return {
      grupo: l.grupo, item: l.item, entrada: l.entrada || '', base: l.base != null ? l.base : null, aliq: l.aliq != null ? l.aliq : null,
      formula: l.formula || '', valor: l.valor, origem: l.origem || '', fund: RTC.legal.curto(l.fund), vig: l.vig || '', obs: l.obs || '',
      destaque: !!l.destaque, info: !!l.info, unitario: l.item === 'Custo líquido unitário'
    };
  }

  function linhasVenda(v) {
    if (!v) return [{ grupo: 'Venda', item: 'Preço não calculado', entrada: '', base: null, aliq: null, formula: 'Informe a margem desejada ou o preço de venda do produto.', valor: null, origem: 'Validação', fund: '', vig: '', obs: '' }];
    if (v.erro) return [{ grupo: 'Venda', item: 'Preço não calculado', entrada: '', base: null, aliq: null, formula: v.erro, valor: null, origem: 'Validação', fund: '', vig: '', obs: '' }];
    var L = [];
    L.push({ grupo: 'Venda', item: 'Custo líquido de aquisição (C)', valor: v.C, formula: 'Resultado do custo de aquisição', origem: 'Calculado', destaque: true });
    v.linhas.forEach(function (l) {
      L.push({
        grupo: l.tipo === 'fora' ? 'Venda — tributos por fora' : l.tipo === 'despesa' ? 'Venda — despesas variáveis' : l.tipo === 'ir' ? 'Venda — IRPJ/CSLL' : l.tipo === 'info' ? 'Informativo' : 'Venda — tributos por dentro',
        item: l.nome, entrada: l.entrada || '', base: l.aliq != null ? l.base : null, aliq: l.aliq, formula: l.formula || '', valor: l.valor,
        origem: l.origem || '', fund: RTC.legal.curto(l.fund), vig: l.vig || '', obs: l.obs || '', info: l.tipo === 'info'
      });
    });
    L.push({ grupo: 'Preço', item: v.meta && v.meta.modo === 'A' ? 'Preço de venda (markup divisor)' : 'Preço de venda informado', valor: v.X, formula: v.formulaNum || v.formula || '', origem: v.meta && v.meta.modo === 'A' ? 'Calculado' : 'Informado', destaque: true });
    L.push({ grupo: 'Preço', item: 'Tributos por fora', valor: v.tributosFora, formula: 'Σ CBS, IBS, IPI, ICMS-ST retido', origem: 'Calculado' });
    L.push({ grupo: 'Preço', item: 'Valor total cobrado do cliente', valor: v.total, formula: 'Valor da mercadoria + tributos por fora', origem: 'Calculado', destaque: true });
    L.push({ grupo: 'Resultado', item: 'Lucro bruto', valor: v.lucroBruto, aliq: v.pct.lucroBruto, formula: 'X − custo − tributos sobre a venda', origem: 'Calculado' });
    L.push({ grupo: 'Resultado', item: 'Margem de contribuição (margem efetiva)', valor: v.margemContrib, aliq: v.pct.margemContrib, formula: '(X − custo − tributos sobre a venda − despesas variáveis) ÷ X', origem: 'Calculado', destaque: true });
    L.push({ grupo: 'Resultado', item: 'IRPJ/CSLL estimados', valor: v.irCs, aliq: v.pct.irCs, formula: v.irDesc, origem: 'Calculado' });
    L.push({ grupo: 'Resultado', item: 'Lucro líquido da operação', valor: v.lucroLiquido, aliq: v.pct.lucroLiquido, formula: 'Margem de contribuição − IRPJ/CSLL', origem: 'Calculado', destaque: true });
    L.push({ grupo: 'Resultado', item: 'Markup multiplicador (não é margem)', valor: null, numero: v.markup, formula: 'X ÷ custo = ' + F.num(v.markup, 4) + ' (acréscimo de ' + F.pct(v.acrescimoCusto) + ' sobre o custo)', origem: 'Calculado' });
    return L.map(function (l) {
      return Object.assign({ entrada: '', base: null, aliq: null, origem: '', fund: '', vig: '', obs: '' }, l);
    });
  }

  function unicos(lista) { return lista.filter(function (x, i) { return x && lista.indexOf(x) === i; }); }

  /** Dados do relatório da OPERAÇÃO (todos os produtos) */
  function dados(A) {
    var emp = A.empresa(), op = A.operacao(), c = A.cons;
    if (!emp || !op || !c || !c.n || !c.custo26) return null;
    var validos = c.itens.filter(function (x) { return x.r.custo26; });
    var r0 = validos[0].r;
    var pv = c.pv || r0.pv;
    var cmp = c.comparativo;
    var agora = new Date().toISOString();
    var TIPOS = { interna: 'Interna', interestadual: 'Interestadual', importacao: 'Importação', outra: 'Outra' };
    var itens = c.itens.map(function (x) { return x.item; });
    var modos = unicos(c.itens.map(function (x) { return x.r.modo; }));
    var basesMargem = unicos(itens.map(function (it) { return it.premissas.baseMargem; }));

    var cab = [
      ['Empresa', emp.razaoSocial || '—'],
      ['CNPJ', emp.cnpj ? F.cnpj(emp.cnpj) : '—'],
      ['Regime tributário', A.regimeRotulo(emp.regime) + (emp.regime === 'SN' && r0.ctx && r0.ctx.sn26 ? ' — ' + RTC.simples.ANEXOS[emp.simples.anexo] + ', RBT12 ' + F.brl(Number(emp.simples.rbt12) || 0) + ', alíquota efetiva ' + F.pct(r0.ctx.sn26.efetiva, 4) : '')],
      ['UF / atividade', (emp.uf || '—') + ' · ' + (emp.atividade === 'industria' ? 'Indústria ou equiparado' : 'Comércio')],
      ['Operação', op.nome],
      ['Produtos', c.n + ' produto(s): ' + itens.map(function (it, i) { return (i + 1) + '. ' + (it.produto.descricao || 'sem descrição') + (it.produto.ncm ? ' (NCM ' + it.produto.ncm + ')' : ''); }).join('; ')],
      ['Origem → empresa → destino', unicos(itens.map(function (it) { return TIPOS[it.operacao.tipo] + ' · ' + (it.operacao.ufOrigem || '—') + ' → ' + (emp.uf || '—') + ' → ' + (it.operacao.ufDestino || '—'); })).join('; ')],
      ['Forma de cálculo', modos.length > 1 ? 'Definida por produto (A: margem → preço; B: preço → margem)' : (modos[0] === 'B' ? 'B — margem efetiva a partir do preço informado' : 'A — preço a partir da margem desejada')],
      ['Parâmetros', 'Base ' + RTC.params.VERSAO_BASE + ' · última atualização ' + F.dateTime(A.ultimaAtualizacaoParams())],
      ['CBS de referência 2027', F.pct(pv.cbsRef2027) + ' — ' + RTC.params.STATUS[c.statusCbs].rotulo.toUpperCase()],
      ['Emitido em', F.dateTime(agora)]
    ];

    var resumo = [];
    var pend = c.itens.filter(function (x) { return x.r.erros.length; });
    if (pend.length) resumo.push('Atenção: ' + pend.length + ' produto(s) com pendências de cadastro (' + pend.map(function (x) { return x.nome; }).join('; ') + '). Os totais consideram apenas os produtos calculados.');
    if (cmp.a1) {
      resumo.push((c.a1.margem != null ? 'Mantida a margem de ' + F.pct(c.a1.margem) : 'Mantidas as margens desejadas de cada produto') + ' (' + (basesMargem.length > 1 ? 'conforme a base de cada produto' : (basesMargem[0] === 'liquida' ? 'após' : 'antes de') + ' IRPJ/CSLL') + '), o valor total cobrado do cliente na operação passa de ' + F.brl(cmp.a1.total.v26) + ' em 2026 para ' + F.brl(cmp.a1.total.v27) + ' em janeiro de 2027 (' + F.signedPct(cmp.a1.total.d.pct) + '). O valor das mercadorias, sem os tributos por fora, passa de ' + F.brl(cmp.a1.preco.v26) + ' para ' + F.brl(cmp.a1.preco.v27) + '.');
    }
    resumo.push('O custo líquido de aquisição da operação passa de ' + F.brl(cmp.custoLiquido.v26) + ' para ' + F.brl(cmp.custoLiquido.v27) + ' (' + F.signedPct(cmp.custoLiquido.d.pct) + '). Os créditos recuperáveis vão de ' + F.brl(cmp.creditos.v26) + ' para ' + F.brl(cmp.creditos.v27) + '.');
    if (cmp.a2) {
      resumo.push('Mantidos os preços de cada produto (preço atual informado ou, na falta dele, o sugerido para 2026), a margem de contribuição da operação passa de ' + F.pct(cmp.a2.margemPct.v26) + ' para ' + F.pct(cmp.a2.margemPct.v27) + ' (' + F.signedPp(cmp.a2.margemPct.dpp) + '), com impacto estimado de ' + F.signedBrl(cmp.a2.lucroLiquido.d.abs) + ' no lucro líquido.');
    }
    resumo.push('A alíquota de referência da CBS para 2027 utilizada (' + F.pct(pv.cbsRef2027) + ') está marcada como ' + RTC.params.STATUS[c.statusCbs].rotulo.toUpperCase() + '. A alíquota oficial depende de Resolução do Senado Federal (LC 214/2025, art. 349). As alíquotas-teste de 2026 não representam carga adicional (art. 348).');

    function tabCmp(an, rot) {
      var t = cmp[an];
      if (!t) return null;
      var linhas = [
        ['Custo bruto de aquisição', cmp.custoBruto.v26, cmp.custoBruto.v27, false],
        ['Tributos recuperáveis', cmp.creditos.v26, cmp.creditos.v27, false],
        ['Custo líquido de aquisição', cmp.custoLiquido.v26, cmp.custoLiquido.v27, false],
        [an === 'a1' ? 'Preço sugerido (mercadorias)' : 'Preço praticado (mercadorias)', t.preco.v26, t.preco.v27, false],
        ['Tributos sobre a venda — por dentro', t.tributosDentro.v26, t.tributosDentro.v27, false],
        ['Tributos sobre a venda — por fora', t.tributosFora.v26, t.tributosFora.v27, false],
        ['Valor total ao cliente', t.total.v26, t.total.v27, false],
        ['Lucro bruto', t.lucroBruto.v26, t.lucroBruto.v27, false],
        ['Margem de contribuição', t.margemContrib.v26, t.margemContrib.v27, false],
        ['Lucro líquido da operação', t.lucroLiquido.v26, t.lucroLiquido.v27, false]
      ];
      var base = an === 'a1' ? c.a1 : c.a2;
      linhas.push(['Margem de contribuição (%)', base.v26.pct.margemContrib, base.v27.pct.margemContrib, true]);
      return { titulo: rot + (c.n > 1 ? ' (operação: ' + c.n + ' produtos)' : ''), linhas: linhas };
    }

    var produtos = c.itens.map(function (x) {
      var it = x.item, r = x.r;
      var a1 = r.a1 && r.a1.v26 && !r.a1.v26.erro && r.a1.v27 && !r.a1.v27.erro ? r.a1 : null;
      var a2 = r.a2 && r.a2.v26 && r.a2.v27 ? r.a2 : null;
      var q = Number(it.produto.quantidade);
      return {
        nome: x.nome, ncm: it.produto.ncm || '', qtd: isFinite(q) && q > 0 ? q : null, un: it.produto.unidade || 'un',
        unit: Number(it.valores.valorUnitario) || null, total: r.custo26 ? r.custo26.produtos : null,
        custo26: r.custo26 ? r.custo26.liquido : null, custo27: r.custo27 ? r.custo27.liquido : null,
        total26: a1 ? a1.v26.total : null, total27: a1 ? a1.v27.total : null,
        margem26: a2 ? a2.v26.pct.margemContrib : null, margem27: a2 ? a2.v27.pct.margemContrib : null,
        pendencias: r.erros.length
      };
    });

    var memorias = [];
    validos.forEach(function (x) {
      var r = x.r;
      var principal = r.modo === 'B' ? r.a2 : r.a1;
      var pre = c.n > 1 ? x.nome + ' — ' : '';
      memorias.push({ id: x.item.id + '-26c', ano: 2026, produto: x.nome, titulo: pre + '2026 — Custo de aquisição', linhas: r.custo26.linhas.map(linhaCusto) });
      memorias.push({ id: x.item.id + '-26v', ano: 2026, produto: x.nome, titulo: pre + '2026 — Formação do preço e resultado', linhas: linhasVenda(principal && principal.v26) });
      memorias.push({ id: x.item.id + '-27c', ano: 2027, produto: x.nome, titulo: pre + 'Janeiro de 2027 — Custo de aquisição', linhas: r.custo27.linhas.map(linhaCusto) });
      memorias.push({ id: x.item.id + '-27v', ano: 2027, produto: x.nome, titulo: pre + 'Janeiro de 2027 — Formação do preço e resultado', linhas: linhasVenda(principal && principal.v27) });
    });

    var idsParams = ['cbsRef2027', 'cbsReducao2027', 'ibsUf2027', 'ibsMun2027', 'cbsTeste2026', 'ibsTeste2026'];
    if (emp.regime === 'LR') idsParams = ['pisLR', 'cofinsLR'].concat(idsParams).concat(['irpj', 'irpjAdicional', 'csll']);
    if (emp.regime === 'LP') idsParams = ['pisLP', 'cofinsLP'].concat(idsParams).concat(['presIrpj', 'presCsll', 'irpj', 'irpjAdicional', 'csll', 'lc224Acrescimo', 'lc224Limite']);
    if (emp.regime === 'SN') idsParams = idsParams.concat(['snSublimite', 'snLimite']);
    idsParams = idsParams.concat(['icmsInter12', 'icmsInter7', 'icmsInter4']);
    var parametros = idsParams.map(function (id) {
      var m = RTC.params.meta(id, A.d.parametros);
      return { nome: m.nome, valor: m.valor, un: m.un, status: m.status, statusRotulo: RTC.params.STATUS[m.status].rotulo, vig: m.vig, fund: RTC.legal.curto(m.fund), nota: m.nota, atualizadoEm: m.atualizadoEm, alterado: m.alterado };
    });
    Object.keys(A.d.aliquotasUF || {}).sort().forEach(function (uf) {
      var u = A.d.aliquotasUF[uf];
      if (u && u.interna != null) parametros.push({ nome: 'ICMS interno ' + uf + (u.fcp ? ' (+ FCP ' + F.pct(u.fcp) + ')' : ''), valor: u.interna, un: '%', status: 'informado', statusRotulo: 'Informado', vig: 'conforme RICMS', fund: u.fonte || 'Legislação estadual', nota: '', atualizadoEm: u.atualizadoEm });
    });

    return {
      empresa: emp, sim: op, op: op, cons: c, emitidoEm: agora,
      titulo: 'Relatório de formação de preço de venda — 2026 × janeiro de 2027',
      cabecalho: cab,
      resumo: resumo,
      produtos: produtos,
      comparativos: [tabCmp('a1', 'Análise 1 — mesma margem'), tabCmp('a2', 'Análise 2 — mesmo preço')].filter(Boolean),
      memorias: memorias,
      sensibilidade: c.sensibilidade || [],
      premissas: c.premissas || [],
      avisos: (c.erros || []).map(function (e) { return 'Erro: ' + e.msg; }).concat((c.avisos || []).map(function (a) { return (a.nivel === 'info' ? 'Nota: ' : 'Atenção: ') + a.msg; })),
      fundamentos: (c.fundamentos || []).map(function (id) { var l = RTC.legal.get(id); return { norma: l.norma, resumo: l.resumo, url: l.url, natureza: l.natureza }; }),
      parametros: parametros,
      aviso: 'Sem integração com base fiscal oficial: os resultados dependem dos dados e parâmetros informados e não substituem a análise da legislação aplicável a cada caso. Alíquotas marcadas como “estimado” ou “a confirmar” não são oficiais.'
    };
  }

  /**
   * Dados do relatório SIMPLIFICADO (empresário): poucas informações, linguagem direta.
   * Gira em torno de três respostas: custo de compra, lucro mantendo o preço e quanto cobrar em 2027
   * para manter o lucro de 2026 (análise "mesmo lucro").
   */
  function dadosSimples(A) {
    var emp = A.empresa(), op = A.operacao(), c = A.cons;
    if (!emp || !op || !c || !c.n || !c.custo26) return null;
    var agora = new Date().toISOString();
    var validos = c.itens.filter(function (x) { return x.r.custo26 && !x.inconsistente; });
    var r0 = (validos[0] || c.itens[0]).r;
    var pv = c.pv || r0.pv;
    var a3 = c.a3 && !c.a3.incompleto && c.a3.v26 && c.a3.v27 && !c.a3.v27.erro ? c.a3 : null;
    var a2 = c.a2 && !c.a2.incompleto && c.a2.v26 && c.a2.v27 ? c.a2 : null;
    var liquida = a3 ? a3.baseMargem === 'liquida' : c.itens.every(function (x) { return x.item.premissas.baseMargem === 'liquida'; });
    function L(v) { return liquida ? v.lucroLiquido : v.margemContrib; }
    var nomeLucro = liquida ? 'Seu lucro (depois do IR e da CSLL)' : 'Seu lucro na venda (antes do IR e da CSLL)';
    var pend = c.itens.filter(function (x) { return x.r.erros.length || x.inconsistente; }).map(function (x) { return x.nome; });
    var c26 = c.custo26, c27 = c.custo27;
    function pctVar(a, b) { return a ? (b - a) / Math.abs(a) * 100 : 0; }

    var mensagens = [];
    mensagens.push('O custo de compra passa de ' + F.brl(c26.liquido) + ' em 2026 para ' + F.brl(c27.liquido) + ' em 2027 (' + F.signedPct(pctVar(c26.liquido, c27.liquido)) + ').');
    if (a2) mensagens.push('Se você mantiver o preço de hoje (' + F.brl(a2.v26.total) + ' cobrados do cliente), o seu lucro passa de ' + F.brl(L(a2.v26)) + ' para ' + F.brl(L(a2.v27)) + ' (' + F.signedBrl(L(a2.v27) - L(a2.v26)) + ').');
    if (a3) mensagens.push('Para continuar lucrando ' + F.brl(a3.lucro26) + ', cobre ' + F.brl(a3.v27.total) + ' do cliente em 2027 (' + F.signedPct(pctVar(a3.v26.total, a3.v27.total)) + ' em relação a hoje).');
    else mensagens.push('Para calcular quanto cobrar em 2027, informe a margem desejada ou o preço de venda atual de todos os produtos.');
    if (pend.length) mensagens.push('Atenção: ' + pend.length + ' produto(s) com cadastro incompleto ficaram fora das contas: ' + pend.join('; ') + '.');

    var impostosDentro = emp.regime === 'SN' ? 'Simples Nacional (DAS) incluído no preço.' : '2026: ICMS, PIS e Cofins · 2027: ICMS (PIS e Cofins deixam de existir).';
    var passos = a3 ? [
      { item: 'Custo de compra', explica: 'O que você paga ao fornecedor, já descontados os impostos que recupera (créditos).', v26: a3.v26.C, v27: a3.v27.C },
      { item: 'Impostos da venda incluídos no preço', explica: impostosDentro, v26: a3.v26.tributosDentro, v27: a3.v27.tributosDentro },
      { item: 'Despesas da venda', explica: 'Comissões, taxa de cartão e outras despesas que acompanham a venda.', v26: a3.v26.despesas, v27: a3.v27.despesas },
      liquida ? { item: 'IR e CSLL', explica: 'Imposto de renda e contribuição social estimados sobre a venda.', v26: a3.v26.irCs, v27: a3.v27.irCs } : null,
      { item: nomeLucro, explica: 'O mesmo valor nos dois anos: é o lucro que você mantém.', v26: L(a3.v26), v27: L(a3.v27), lucro: true },
      { item: '= Valor da mercadoria', explica: 'Soma das linhas acima.', v26: a3.v26.X, v27: a3.v27.X, total: true },
      { item: 'Impostos cobrados à parte na nota', explica: '2027: CBS e IBS destacados por fora (e IPI, quando houver).', v26: a3.v26.tributosFora, v27: a3.v27.tributosFora },
      { item: '= Total cobrado do cliente', explica: 'É o valor da nota de venda.', v26: a3.v26.total, v27: a3.v27.total, total: true }
    ].filter(Boolean) : null;

    // impostos da venda por nome (2026 × 2027), sem os informativos de teste
    var impostos = [];
    if (a3) {
      var porNome = {};
      [['v26', a3.v26], ['v27', a3.v27]].forEach(function (par) {
        (par[1].linhas || []).forEach(function (l) {
          if (l.tipo !== 'dentro' && l.tipo !== 'fora') return;
          var k = l.nome;
          if (!porNome[k]) { porNome[k] = { imposto: l.nome, forma: l.tipo === 'fora' ? 'Cobrado à parte' : 'Incluído no preço', v26: 0, v27: 0 }; impostos.push(porNome[k]); }
          porNome[k][par[0]] += l.valor || 0;
        });
      });
      impostos.forEach(function (x) { x.v26 = Math.round(x.v26 * 100) / 100; x.v27 = Math.round(x.v27 * 100) / 100; });
    }

    var custo = [
      { item: 'Valor pago na compra', explica: 'Mercadoria, frete, seguro e impostos da nota de compra.', v26: c26.bruto, v27: c27.bruto },
      { item: '(−) Impostos que você recupera', explica: 'Créditos de ICMS, PIS/Cofins (2026) ou CBS/IBS (2027), conforme o regime.', v26: -c26.totalCreditos, v27: -c27.totalCreditos },
      { item: '= Custo de compra', explica: 'O que realmente fica de custo para você.', v26: c26.liquido, v27: c27.liquido, total: true }
    ];
    if (c26.totalNaoRecuperaveis || c27.totalNaoRecuperaveis) custo.push({ item: 'Desse custo, impostos que não voltam', explica: 'Ex.: ICMS-ST e IPI sem direito a crédito.', v26: c26.totalNaoRecuperaveis, v27: c27.totalNaoRecuperaveis, info: true });

    var produtos = c.n > 1 ? c.itens.map(function (x) {
      var q = Number(x.item.produto.quantidade) || 0;
      var r = x.r;
      var ok3 = r.a3 && r.a3.v26 && r.a3.v27 && !r.a3.v27.erro && !x.inconsistente;
      return {
        nome: x.item.produto.descricao || x.nome, qtd: q || null, un: x.item.produto.unidade || 'UN',
        custo26: r.custo26 && q ? r.custo26.liquido / q : null, custo27: r.custo27 && q ? r.custo27.liquido / q : null,
        hoje: ok3 && q ? r.a3.v26.total / q : null, cobrar: ok3 && q ? r.a3.v27.total / q : null,
        variacao: ok3 ? pctVar(r.a3.v26.total, r.a3.v27.total) : null,
        pendente: !!(r.erros.length || x.inconsistente)
      };
    }) : [];

    var a27 = r0.ctx && r0.ctx.a27;
    var status = RTC.params.STATUS[c.statusCbs] ? RTC.params.STATUS[c.statusCbs].rotulo.toLowerCase() : c.statusCbs;
    var muda = [];
    if (emp.regime === 'SN') {
      muda.push('Como optante do Simples Nacional, a empresa continua pagando pelo DAS' + (emp.simples && emp.simples.ibsCbsForaDas2027 ? '; em 2027, pela opção feita, a CBS e o IBS são pagos fora do DAS e destacados na nota.' : '; em 2027, a CBS e o IBS substituem o PIS e a Cofins dentro do DAS.'));
    } else {
      muda.push('PIS e Cofins deixam de existir em 2027 e dão lugar à CBS (' + (a27 ? F.pct(a27.cbs * 100) : F.pct(pv.cbsRef2027)) + ' nesta simulação). A alíquota oficial da CBS ainda depende de resolução do Senado: o valor usado é ' + status + '.');
      muda.push('O IBS começa em 2027 com alíquota reduzida (' + (a27 ? F.pct(a27.ibs * 100) : '0,10%') + ').');
      muda.push('CBS e IBS são cobrados à parte: aparecem separados na nota, somados ao valor da mercadoria. Por isso o total cobrado do cliente pode subir mesmo com a mercadoria no mesmo preço.');
    }
    muda.push('O ICMS continua igual em 2027; a troca gradual do ICMS pelo IBS começa em 2029.');
    if (c.itens.some(function (x) { return x.r.custo26 && x.r.custo26.ipi > 0; })) muda.push('O IPI é reduzido a zero em 2027 (exceto produtos com industrialização incentivada na Zona Franca de Manaus).');

    return {
      modelo: 'simplificado', empresa: emp, sim: op, op: op, cons: c, emitidoEm: agora,
      titulo: 'Seu preço em 2027 — relatório simplificado',
      subtitulo: 'Como a Reforma Tributária afeta o custo, o preço e o lucro desta operação',
      identificacao: [
        ['Empresa', (emp.razaoSocial || '—') + (emp.cnpj ? ' · CNPJ ' + F.cnpj(emp.cnpj) : '')],
        ['Operação', op.nome + ' · ' + c.n + ' produto(s)'],
        ['Regime', A.regimeRotulo(emp.regime)],
        ['Emitido em', F.dateTime(agora)]
      ],
      destaques: {
        custo: { v26: c26.liquido, v27: c27.liquido },
        lucroMesmoPreco: a2 ? { v26: L(a2.v26), v27: L(a2.v27), preco: a2.v26.total } : null,
        cobrar: a3 ? { v26: a3.v26.total, v27: a3.v27.total, lucro: a3.lucro26, varPct: pctVar(a3.v26.total, a3.v27.total) } : null
      },
      nomeLucro: nomeLucro,
      mensagens: mensagens, passos: passos, impostos: impostos, custo: custo, produtos: produtos, muda: muda,
      aviso: 'Simulação elaborada pela Nexus Contabilidade com os dados informados. Os valores de 2027 usam alíquotas ainda não oficiais e podem mudar. O relatório completo traz a memória de cálculo com os fundamentos legais.'
    };
  }

  function nomeArquivo(dd, ext) {
    return 'RTC-Comparativo' + (dd.modelo === 'simplificado' ? '-simplificado' : '') + '_' + D.slug(dd.empresa.razaoSocial || 'empresa') + '_' + D.slug(dd.sim.nome) + '_' + dd.emitidoEm.slice(0, 10) + '.' + ext;
  }

  /** Modelo escolhido na tela de relatório (padrão: simplificado para clientes, completo para administradores) */
  function modeloEscolhido(A) {
    var m = A.d.ui.modeloRelatorio;
    if (m === 'simplificado' || m === 'completo') return m;
    return N.auth && N.auth.atual && N.auth.atual() && !N.auth.ehAdmin() ? 'simplificado' : 'completo';
  }

  // ------------------------------------------------------------------ PDF
  var MAPA_PDF = { '−': '-', '≤': '<=', '≥': '>=', '→': '->', '⇒': '=>', 'Σ': 'Soma ', 'Δ': 'Var. ', 'τ': 't', '★': '*', '▲': '', '▼': '', '≈': '~', '✔': '', '✘': '', '‑': '-', ' ': ' ' };
  var WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function pdfSafe(s) {
    if (s == null) return '';
    s = String(s).replace(/[−≤≥→⇒ΣΔτ★▲▼≈✔✘‑ ]/g, function (c) { return MAPA_PDF[c]; });
    return s.replace(/[^\u0000-ÿ]/g, function (c) { return WIN_EXTRA.indexOf(c) >= 0 ? c : '?'; });
  }

  function pdf(A, modelo) {
    modelo = modelo || modeloEscolhido(A);
    var dd = modelo === 'simplificado' ? dadosSimples(A) : dados(A);
    if (!dd) { D.toast('Complete a simulação antes de exportar.', 'erro'); return; }
    D.toast('Gerando PDF ' + (modelo === 'simplificado' ? 'simplificado' : 'completo') + '…');
    D.carregarScript(CDN.jspdf).then(function () { return D.carregarScript(CDN.autotable); }).then(function () {
      if (modelo === 'simplificado') gerarPdfSimples(dd); else gerarPdf(dd);
    }).catch(function () {
      D.dialogo({ titulo: 'Gerador de PDF indisponível', texto: 'Não foi possível carregar a biblioteca de PDF (é necessária conexão com a internet). Você pode usar “Imprimir” e escolher “Salvar como PDF” — o relatório tem layout de impressão próprio.', botoes: [{ rotulo: 'Fechar', valor: null }, { rotulo: 'Imprimir', valor: true, tipo: 'primary' }] }).then(function (v) { if (v) window.print(); });
    });
  }

  function gerarPdf(dd) {
    var jsPDF = root.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 12;
    var LARANJA = [247, 81, 31], PRETO = [19, 18, 17], TINTA = [36, 36, 36], CINZA = [107, 98, 91];

    function cabecalhoPagina() {
      doc.setFillColor.apply(doc, PRETO);
      doc.rect(0, 0, W, 20, 'F');
      doc.setFillColor.apply(doc, LARANJA);
      doc.rect(0, 20, W, 1.2, 'F');
      try { doc.addImage(N.assets.logoPng, 'PNG', M, 4.5, 11 * N.assets.logoRatio, 11); } catch (e) { /* logo opcional */ }
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('RTC Comparativo', W - M, 9.5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(255, 217, 199);
      doc.text(pdfSafe(dd.empresa.razaoSocial + ' · ' + dd.sim.nome), W - M, 14.5, { align: 'right' });
    }
    function rodapes() {
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(227, 220, 214);
        doc.line(M, H - 11, W - M, H - 11);
        doc.setFontSize(6.8);
        doc.setTextColor.apply(doc, CINZA);
        doc.setFont('helvetica', 'normal');
        doc.text(pdfSafe(doc.splitTextToSize(dd.aviso, W - 2 * M - 40)[0] + (doc.splitTextToSize(dd.aviso, W - 2 * M - 40).length > 1 ? '…' : '')), M, H - 7);
        doc.text(pdfSafe('Nexus Contabilidade · emitido em ' + F.dateTime(dd.emitidoEm)), M, H - 4);
        doc.text('Página ' + i + ' de ' + n, W - M, H - 5.5, { align: 'right' });
      }
    }
    var y = 28;
    function garantir(h) { if (y + h > H - 16) { doc.addPage(); cabecalhoPagina(); y = 28; } }
    function secao(t) {
      garantir(16);
      y += 3;
      doc.setFillColor.apply(doc, LARANJA);
      doc.rect(M, y - 3.6, 1.6, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor.apply(doc, TINTA);
      doc.text(pdfSafe(t), M + 4, y);
      y += 4;
    }
    function paragrafo(t, tam) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(tam || 8.6);
      doc.setTextColor.apply(doc, TINTA);
      var linhas = doc.splitTextToSize(pdfSafe(t), W - 2 * M);
      var lh = (tam || 8.6) * 0.3528 * 1.15; // altura de linha em mm
      garantir(linhas.length * lh + 6);
      doc.text(linhas, M, y + 3);
      y += 3 + (linhas.length - 1) * lh + 3.2;
    }
    var baseTabela = {
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.4, textColor: TINTA, lineColor: [227, 220, 214], lineWidth: 0.1, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 246, 243] },
      margin: { left: M, right: M, top: 28, bottom: 16 },
      didDrawPage: function (data) { if (data.pageNumber > 1 || doc.getNumberOfPages() > 1) cabecalhoPagina(); }
    };
    function tabela(opts) {
      doc.autoTable(Object.assign({}, baseTabela, opts, { startY: y + 1 }));
      y = doc.lastAutoTable.finalY + 6;
    }

    cabecalhoPagina();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor.apply(doc, TINTA);
    doc.text(pdfSafe(dd.titulo), M, y);
    y += 5;
    tabela({ theme: 'plain', styles: { fontSize: 8, cellPadding: 1.1, textColor: TINTA }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, textColor: CINZA }, 2: { fontStyle: 'bold', cellWidth: 45, textColor: CINZA } },
      body: (function () { var b = []; for (var i = 0; i < dd.cabecalho.length; i += 2) { var a = dd.cabecalho[i], c = dd.cabecalho[i + 1] || ['', '']; b.push([pdfSafe(a[0]), pdfSafe(a[1]), pdfSafe(c[0]), pdfSafe(c[1])]); } return b; })() });

    secao('Resumo executivo');
    dd.resumo.forEach(function (p) { paragrafo(p); });

    secao('Produtos da operação');
    tabela({
      head: [['Produto', 'Qtd × unitário', 'Valor total', 'Custo líq. 2026', 'Custo líq. 2027', 'Total cliente 2026', 'Total cliente 2027', 'Margem 2026', 'Margem 2027']],
      body: dd.produtos.map(function (p) {
        return [pdfSafe(p.nome + (p.ncm ? ' (NCM ' + p.ncm + ')' : '') + (p.pendencias ? ' — ' + p.pendencias + ' pendência(s)' : '')), pdfSafe(p.qtd != null && p.unit != null ? F.num(p.qtd, p.qtd % 1 ? 4 : 0) + ' ' + p.un + ' x ' + F.unit(p.unit) : '-'),
          pdfSafe(p.total != null ? F.brl(p.total) : '-'), pdfSafe(p.custo26 != null ? F.brl(p.custo26) : '-'), pdfSafe(p.custo27 != null ? F.brl(p.custo27) : '-'),
          pdfSafe(p.total26 != null ? F.brl(p.total26) : '-'), pdfSafe(p.total27 != null ? F.brl(p.total27) : '-'), p.margem26 != null ? F.pct(p.margem26) : '-', p.margem27 != null ? F.pct(p.margem27) : '-'];
      }),
      columnStyles: { 0: { cellWidth: 70 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
    });

    dd.comparativos.forEach(function (c) {
      secao(c.titulo);
      tabela({
        head: [['Indicador', '2026', 'Jan/2027', 'Diferença', 'Variação']],
        body: c.linhas.map(function (l) {
          var pct = l[3];
          return [pdfSafe(l[0]), pct ? F.pct(l[1]) : pdfSafe(F.brl(l[1])), pct ? F.pct(l[2]) : pdfSafe(F.brl(l[2])), pct ? pdfSafe(F.signedPp(l[2] - l[1])) : pdfSafe(F.signedBrl(l[2] - l[1])), pct || !l[1] ? '' : pdfSafe(F.signedPct((l[2] - l[1]) / Math.abs(l[1]) * 100))];
        }),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
    });

    dd.memorias.forEach(function (m) {
      doc.addPage(); cabecalhoPagina(); y = 28;
      secao('Memória de cálculo — ' + m.titulo);
      tabela({
        head: [['Item', 'Entrada', 'Base', 'Alíq.', 'Fórmula', 'Valor', 'Origem', 'Fundamento', 'Vigência', 'Observações']].map(function (r) { return r.map(pdfSafe); }),
        body: m.linhas.map(function (l) {
          return [pdfSafe((l.grupo ? '' : '') + l.item), pdfSafe(l.entrada), l.base != null ? pdfSafe(F.brl(l.base)) : '', l.aliq != null ? pdfSafe(F.pct(l.aliq)) : '', pdfSafe(l.formula),
            l.valor != null ? pdfSafe(l.unitario ? F.unit(l.valor) : (l.info ? '(' + F.brl(l.valor) + ')' : F.brl(l.valor))) : '', pdfSafe(l.origem), pdfSafe(l.fund), pdfSafe(l.vig), pdfSafe(l.obs)];
        }),
        styles: Object.assign({}, baseTabela.styles, { fontSize: 6.3, cellPadding: 1.1 }),
        columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold' }, 1: { cellWidth: 22 }, 2: { cellWidth: 19, halign: 'right' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 46 }, 5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }, 6: { cellWidth: 20 }, 7: { cellWidth: 38 }, 8: { cellWidth: 20 }, 9: { cellWidth: 'auto' } },
        didParseCell: function (data) {
          if (data.section !== 'body') return;
          var l = m.linhas[data.row.index];
          if (l && l.destaque) { data.cell.styles.fillColor = [253, 236, 227]; }
          if (l && l.info) { data.cell.styles.textColor = CINZA; }
        }
      });
    });

    if (dd.sensibilidade.length) {
      secao('Sensibilidade — alíquota de referência da CBS (2027)');
      tabela({
        head: [['CBS de referência', 'Preço 2027 (mesma margem)', 'Total ao cliente 2027', 'Variação vs 2026', 'Margem 2027 (mesmo preço)']],
        body: dd.sensibilidade.map(function (s) { return [F.pct(s.cbsRef) + (s.atual ? ' (atual)' : ''), s.preco27 != null ? pdfSafe(F.brl(s.preco27)) : '-', s.total27 != null ? pdfSafe(F.brl(s.total27)) : '-', s.varTotal != null ? pdfSafe(F.signedPct(s.varTotal)) : '-', s.margem27 != null ? F.pct(s.margem27) : '-']; }),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      });
    }

    secao('Premissas da simulação');
    tabela({ theme: 'plain', styles: { fontSize: 7.6, cellPadding: 1 }, body: dd.premissas.map(function (p, i) { return [String(i + 1), pdfSafe(p)]; }), columnStyles: { 0: { cellWidth: 7, textColor: LARANJA, fontStyle: 'bold' } } });
    if (dd.avisos.length) {
      secao('Avisos e validações');
      tabela({ theme: 'plain', styles: { fontSize: 7.6, cellPadding: 1 }, body: dd.avisos.map(function (p) { return [pdfSafe(p)]; }) });
    }
    secao('Fundamentos legais e fontes utilizados');
    tabela({ head: [['Norma / fonte', 'Natureza', 'Conteúdo']], body: dd.fundamentos.map(function (f) { return [pdfSafe(f.norma), pdfSafe({ norma: 'Norma', jurisprudencia: 'Jurisprudência', administrativo: 'Entendimento administrativo', estimativa: 'Estimativa (não oficial)' }[f.natureza] || ''), pdfSafe(f.resumo)]; }), columnStyles: { 0: { cellWidth: 62, fontStyle: 'bold' }, 1: { cellWidth: 32 } } });
    secao('Parâmetros utilizados');
    tabela({ head: [['Parâmetro', 'Valor', 'Status', 'Vigência', 'Fundamento', 'Atualizado em']], body: dd.parametros.map(function (p) { return [pdfSafe(p.nome), pdfSafe(p.un === 'R$' ? F.brl(p.valor) : p.un === 'p.p.' ? F.num(p.valor) + ' p.p.' : F.pct(p.valor)), pdfSafe(p.statusRotulo), pdfSafe(p.vig), pdfSafe(p.fund), pdfSafe(F.date(p.atualizadoEm))]; }), columnStyles: { 1: { halign: 'right', cellWidth: 26 }, 2: { cellWidth: 22 } } });
    paragrafo(dd.aviso, 7.6);

    rodapes();
    doc.save(nomeArquivo(dd, 'pdf'));
    D.toast('PDF gerado.');
  }

  function gerarPdfSimples(dd) {
    var jsPDF = root.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 14;
    var LARANJA = [247, 81, 31], PRETO = [19, 18, 17], TINTA = [36, 36, 36], CINZA = [107, 98, 91], CREME = [253, 240, 233], AZUL = [57, 135, 229];

    function cabecalhoPagina() {
      doc.setFillColor.apply(doc, PRETO);
      doc.rect(0, 0, W, 20, 'F');
      doc.setFillColor.apply(doc, LARANJA);
      doc.rect(0, 20, W, 1.2, 'F');
      try { doc.addImage(N.assets.logoPng, 'PNG', M, 4.5, 11 * N.assets.logoRatio, 11); } catch (e) { /* logo opcional */ }
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Relatório simplificado', W - M, 9.5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(255, 217, 199);
      doc.text(pdfSafe(dd.empresa.razaoSocial + ' · ' + dd.sim.nome), W - M, 14.5, { align: 'right' });
    }
    function rodapes() {
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(227, 220, 214);
        doc.line(M, H - 12, W - M, H - 12);
        doc.setFontSize(6.8);
        doc.setTextColor.apply(doc, CINZA);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(pdfSafe(dd.aviso), W - 2 * M - 22), M, H - 8.5);
        doc.text('Página ' + i + ' de ' + n, W - M, H - 5, { align: 'right' });
      }
    }
    var y = 30;
    function garantir(h) { if (y + h > H - 18) { doc.addPage(); cabecalhoPagina(); y = 30; } }
    function secao(t) {
      garantir(18);
      y += 3;
      doc.setFillColor.apply(doc, LARANJA);
      doc.rect(M, y - 3.8, 1.6, 5.2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor.apply(doc, TINTA);
      doc.text(pdfSafe(t), M + 4, y);
      y += 4;
    }
    var baseTabela = {
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.8, textColor: TINTA, lineColor: [227, 220, 214], lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' },
      margin: { left: M, right: M, top: 30, bottom: 18 },
      didDrawPage: function (data) { if (data.pageNumber > 1) cabecalhoPagina(); }
    };
    function tabela(opts) {
      doc.autoTable(Object.assign({}, baseTabela, opts, { startY: y + 1 }));
      y = doc.lastAutoTable.finalY + 6;
    }
    function caixa(x, yy, w, h, rotulo, valor, sub, destaque) {
      doc.setFillColor.apply(doc, destaque ? LARANJA : CREME);
      doc.setDrawColor.apply(doc, destaque ? LARANJA : [240, 215, 200]);
      doc.roundedRect(x, yy, w, h, 2.5, 2.5, 'FD');
      doc.setTextColor.apply(doc, destaque ? [255, 255, 255] : CINZA);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(pdfSafe(rotulo), w - 8), x + 4, yy + 6);
      doc.setTextColor.apply(doc, destaque ? [255, 255, 255] : TINTA);
      doc.setFontSize(16);
      doc.text(pdfSafe(valor), x + 4, yy + 17);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor.apply(doc, destaque ? [255, 236, 226] : CINZA);
      doc.text(doc.splitTextToSize(pdfSafe(sub), w - 8), x + 4, yy + 23);
    }

    cabecalhoPagina();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor.apply(doc, TINTA);
    doc.text(pdfSafe(dd.titulo), M, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, CINZA);
    doc.text(pdfSafe(dd.subtitulo), M, y);
    y += 4;
    tabela({ theme: 'plain', styles: { fontSize: 8.4, cellPadding: 0.9, textColor: TINTA }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26, textColor: CINZA } }, body: dd.identificacao.map(function (l) { return [pdfSafe(l[0]), pdfSafe(l[1])]; }) });

    // ---------- respostas principais (3 caixas)
    var d = dd.destaques;
    var gap = 4, w3 = (W - 2 * M - 2 * gap) / 3, hC = 32;
    garantir(hC + 4);
    caixa(M, y, w3, hC, 'Custo de compra em 2027', F.brl(d.custo.v27), 'Hoje: ' + F.brl(d.custo.v26) + ' (' + F.signedPct(d.custo.v26 ? (d.custo.v27 - d.custo.v26) / d.custo.v26 * 100 : 0) + ')');
    caixa(M + w3 + gap, y, w3, hC, 'Lucro em 2027 mantendo o preço de hoje', d.lucroMesmoPreco ? F.brl(d.lucroMesmoPreco.v27) : '-', d.lucroMesmoPreco ? 'Hoje: ' + F.brl(d.lucroMesmoPreco.v26) : 'Informe margem ou preço');
    caixa(M + 2 * (w3 + gap), y, w3, hC, 'Quanto cobrar em 2027 para lucrar o mesmo', d.cobrar ? F.brl(d.cobrar.v27) : '-', d.cobrar ? 'Hoje: ' + F.brl(d.cobrar.v26) + ' (' + F.signedPct(d.cobrar.varPct) + ')' : 'Informe margem ou preço', true);
    y += hC + 7;

    secao('Em resumo');
    dd.mensagens.forEach(function (m) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.4);
      doc.setTextColor.apply(doc, TINTA);
      var linhas = doc.splitTextToSize(pdfSafe(m), W - 2 * M - 6);
      garantir(linhas.length * 4.4 + 2);
      doc.setFillColor.apply(doc, LARANJA);
      doc.circle(M + 1.3, y + 1.6, 0.9, 'F');
      doc.text(linhas, M + 5, y + 2.6);
      y += linhas.length * 4.4 + 1.8;
    });
    y += 2;

    function linhaValor(v) { return v == null ? '-' : pdfSafe(F.brl(v)); }
    if (dd.passos) {
      secao('Como chegamos a esses números');
      tabela({
        head: [['', 'O que é', 'Hoje (2026)', '2027']],
        body: dd.passos.map(function (p) { return [pdfSafe(p.item), pdfSafe(p.explica), linhaValor(p.v26), linhaValor(p.v27)]; }),
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 'auto', textColor: CINZA, fontSize: 7.8 }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
        didParseCell: function (data) {
          if (data.section !== 'body') return;
          var p = dd.passos[data.row.index];
          if (p.total) { data.cell.styles.fillColor = CREME; data.cell.styles.fontStyle = 'bold'; }
          if (p.lucro) { data.cell.styles.textColor = AZUL; data.cell.styles.fontStyle = 'bold'; }
        }
      });
    }
    if (dd.impostos.length) {
      secao('Impostos na venda');
      tabela({
        head: [['Imposto', 'Como é cobrado', 'Hoje (2026)', '2027']],
        body: dd.impostos.map(function (x) { return [pdfSafe(x.imposto), pdfSafe(x.forma), x.v26 ? linhaValor(x.v26) : '-', x.v27 ? linhaValor(x.v27) : '-']; }),
        columnStyles: { 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } }
      });
    }
    secao('Custo de compra');
    tabela({
      head: [['', 'O que é', 'Hoje (2026)', '2027']],
      body: dd.custo.map(function (p) { return [pdfSafe(p.item), pdfSafe(p.explica), linhaValor(p.v26), linhaValor(p.v27)]; }),
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { textColor: CINZA, fontSize: 7.8 }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
      didParseCell: function (data) {
        if (data.section !== 'body') return;
        var p = dd.custo[data.row.index];
        if (p.total) { data.cell.styles.fillColor = CREME; data.cell.styles.fontStyle = 'bold'; }
        if (p.info) data.cell.styles.textColor = CINZA;
      }
    });
    if (dd.produtos.length) {
      secao('Por produto (valores por unidade)');
      tabela({
        head: [['Produto', 'Custo hoje', 'Custo 2027', 'Preço hoje', 'Cobrar em 2027', 'Variação']],
        body: dd.produtos.map(function (p) {
          return [pdfSafe(p.nome + (p.qtd ? ' (' + F.num(p.qtd, p.qtd % 1 ? 4 : 0) + ' ' + p.un + ')' : '') + (p.pendente ? ' - cadastro incompleto' : '')),
            p.custo26 != null ? pdfSafe(F.unit(p.custo26)) : '-', p.custo27 != null ? pdfSafe(F.unit(p.custo27)) : '-',
            p.hoje != null ? pdfSafe(F.unit(p.hoje)) : '-', p.cobrar != null ? pdfSafe(F.unit(p.cobrar)) : '-', p.variacao != null ? pdfSafe(F.signedPct(p.variacao)) : '-'];
        }),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' } }
      });
    }
    secao('O que muda em 2027');
    dd.muda.forEach(function (m) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, TINTA);
      var linhas = doc.splitTextToSize(pdfSafe(m), W - 2 * M - 6);
      garantir(linhas.length * 4.2 + 2);
      doc.setFillColor.apply(doc, LARANJA);
      doc.circle(M + 1.3, y + 1.6, 0.9, 'F');
      doc.text(linhas, M + 5, y + 2.6);
      y += linhas.length * 4.2 + 1.8;
    });

    rodapes();
    doc.save(nomeArquivo(dd, 'pdf'));
    D.toast('PDF simplificado gerado.');
  }

  // ------------------------------------------------------------------ Excel simplificado
  function xlsxSimples(dd) {
    var R = [], mg = [];
    function cheia(v, st, n) { var r = [{ v: v, s: st }]; for (var i = 1; i < (n || 4); i++) r.push({ v: '', s: st }); return r; }
    function linha(cels, merge) { R.push(cels); if (merge) mg.push(merge.replace(/#/g, R.length)); return cels; }
    var t = linha(cheia('Nexus Contabilidade · ' + dd.titulo, 'titulo'), 'A#:D#'); t.__altura = 28;
    linha(cheia(dd.subtitulo, 'subtitulo'), 'A#:D#');
    linha([]);
    dd.identificacao.forEach(function (l) { linha([{ v: l[0], s: 'negrito' }, { v: l[1], s: 'texto' }], 'B#:D#'); });
    linha([]);
    linha(cheia('Respostas principais', 'secao'), 'A#:D#');
    linha(['', 'Hoje (2026)', '2027', 'Variação'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
    var d = dd.destaques;
    function varPct(a, b) { return a ? (b - a) / Math.abs(a) : null; }
    linha([{ v: 'Custo de compra', s: 'negrito' }, { v: d.custo.v26, s: 'moeda' }, { v: d.custo.v27, s: 'moeda' }, { v: varPct(d.custo.v26, d.custo.v27), s: 'pct' }]);
    if (d.lucroMesmoPreco) linha([{ v: 'Lucro mantendo o preço de hoje', s: 'negrito' }, { v: d.lucroMesmoPreco.v26, s: 'moeda' }, { v: d.lucroMesmoPreco.v27, s: 'moeda' }, { v: varPct(d.lucroMesmoPreco.v26, d.lucroMesmoPreco.v27), s: 'pct' }]);
    if (d.cobrar) linha([{ v: 'Quanto cobrar do cliente para lucrar o mesmo', s: 'rotuloTotal' }, { v: d.cobrar.v26, s: 'moedaNegrito' }, { v: d.cobrar.v27, s: 'moedaNegrito' }, { v: d.cobrar.varPct / 100, s: 'pctNegrito' }]);
    linha([]);
    linha(cheia('Em resumo', 'secao'), 'A#:D#');
    dd.mensagens.forEach(function (m) { var l = linha([{ v: m, s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }], 'A#:D#'); l.__altura = 32; });
    function tabelaPassos(titulo, lista) {
      linha([]);
      linha(cheia(titulo, 'secao'), 'A#:D#');
      linha(['', 'O que é', 'Hoje (2026)', '2027'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
      lista.forEach(function (p) {
        var l = linha([{ v: p.item, s: p.total ? 'rotuloTotal' : 'negrito' }, { v: p.explica, s: p.info ? 'nota' : 'texto' }, { v: p.v26, s: p.total ? 'moedaNegrito' : 'moeda' }, { v: p.v27, s: p.total ? 'moedaNegrito' : 'moeda' }]);
        l.__altura = 30;
      });
    }
    if (dd.passos) tabelaPassos('Como chegamos a esses números', dd.passos);
    if (dd.impostos.length) {
      linha([]);
      linha(cheia('Impostos na venda', 'secao'), 'A#:D#');
      linha(['Imposto', 'Como é cobrado', 'Hoje (2026)', '2027'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
      dd.impostos.forEach(function (x) { linha([{ v: x.imposto, s: 'negrito' }, { v: x.forma, s: 'texto' }, { v: x.v26 || null, s: 'moeda' }, { v: x.v27 || null, s: 'moeda' }]); });
    }
    tabelaPassos('Custo de compra', dd.custo);
    linha([]);
    linha(cheia('O que muda em 2027', 'secao'), 'A#:D#');
    dd.muda.forEach(function (m) { var l = linha([{ v: '• ' + m, s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }], 'A#:D#'); l.__altura = 30; });
    linha([]);
    var n = linha([{ v: dd.aviso, s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }], 'A#:D#'); n.__altura = 30;
    var sheets = [{ name: 'Resumo', cols: [40, 62, 18, 18], rows: R, merges: mg, retrato: true }];
    if (dd.produtos.length) {
      var P = [['Produto', 'Quantidade', 'Unidade', 'Custo hoje (un.)', 'Custo 2027 (un.)', 'Preço hoje (un.)', 'Cobrar em 2027 (un.)', 'Variação', 'Observação'].map(function (h) { return { v: h, s: 'cabecalho' }; })];
      dd.produtos.forEach(function (p) {
        P.push([{ v: p.nome, s: 'negrito' }, { v: p.qtd, s: 'num' }, { v: p.un, s: 'texto' }, { v: p.custo26, s: 'moeda' }, { v: p.custo27, s: 'moeda' }, { v: p.hoje, s: 'moeda' }, { v: p.cobrar, s: 'moeda' }, { v: p.variacao != null ? p.variacao / 100 : null, s: 'pct' }, { v: p.pendente ? 'Cadastro incompleto' : '', s: 'texto' }]);
      });
      sheets.push({ name: 'Por produto', cols: [36, 12, 9, 16, 16, 16, 18, 11, 20], rows: P });
    }
    D.baixar(N.xlsx.build({ title: dd.titulo, author: 'Nexus Contabilidade', sheets: sheets }), nomeArquivo(dd, 'xlsx'));
    D.toast('Planilha simplificada gerada.');
  }

  // ------------------------------------------------------------------ Excel
  function xlsx(A, modelo) {
    modelo = modelo || modeloEscolhido(A);
    if (modelo === 'simplificado') {
      var ds = dadosSimples(A);
      if (!ds) { D.toast('Complete a simulação antes de exportar.', 'erro'); return; }
      return xlsxSimples(ds);
    }
    var dd = dados(A);
    if (!dd) { D.toast('Complete a simulação antes de exportar.', 'erro'); return; }
    var sheets = [];

    // Resumo
    var R = [];
    var merges = ['A1:F1', 'A2:F2'];
    R.push([{ v: 'Nexus Contabilidade · RTC Comparativo', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }]);
    R[0].__altura = 28;
    R.push([{ v: dd.titulo, s: 'subtitulo' }, { v: '', s: 'subtitulo' }, { v: '', s: 'subtitulo' }, { v: '', s: 'subtitulo' }, { v: '', s: 'subtitulo' }, { v: '', s: 'subtitulo' }]);
    R.push([]);
    dd.cabecalho.forEach(function (c) { R.push([{ v: c[0], s: 'negrito' }, { v: c[1], s: 'texto' }]); merges.push('B' + R.length + ':F' + R.length); });
    R.push([]);
    R.push([{ v: 'Resumo executivo', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }]);
    merges.push('A' + R.length + ':F' + R.length);
    dd.resumo.forEach(function (p) { var row = [{ v: p, s: 'texto' }]; row.__altura = 46; R.push(row); merges.push('A' + R.length + ':F' + R.length); });
    dd.comparativos.forEach(function (c) {
      R.push([]);
      R.push([{ v: c.titulo, s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }]);
      merges.push('A' + R.length + ':F' + R.length);
      R.push(['Indicador', '2026', 'Jan/2027', 'Diferença', 'Variação'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
      c.linhas.forEach(function (l) {
        var pct = l[3];
        R.push([{ v: l[0], s: 'texto' },
          { v: pct ? l[1] / 100 : l[1], s: pct ? 'pct' : 'moeda' }, { v: pct ? l[2] / 100 : l[2], s: pct ? 'pct' : 'moeda' },
          { v: pct ? (l[2] - l[1]) / 100 : l[2] - l[1], s: pct ? 'pct' : 'moeda' },
          { v: !pct && l[1] ? (l[2] - l[1]) / Math.abs(l[1]) : null, s: 'pct' }]);
      });
    });
    R.push([]);
    var nota = [{ v: dd.aviso, s: 'nota' }];
    nota.__altura = 32;
    R.push(nota);
    merges.push('A' + R.length + ':F' + R.length);
    sheets.push({ name: 'Resumo', cols: [38, 22, 22, 18, 14, 14], rows: R, merges: merges, retrato: true });

    // Produtos
    var PRD = [['Produto', 'NCM', 'Quantidade', 'Unidade', 'Valor unitário', 'Valor total', 'Custo líquido 2026', 'Custo líquido 2027', 'Total ao cliente 2026', 'Total ao cliente 2027', 'Margem 2026', 'Margem 2027', 'Pendências'].map(function (h) { return { v: h, s: 'cabecalho' }; })];
    dd.produtos.forEach(function (p) {
      PRD.push([{ v: p.nome, s: 'negrito' }, { v: p.ncm, s: 'texto' }, { v: p.qtd, s: 'num' }, { v: p.un, s: 'texto' }, { v: p.unit, s: 'moeda' }, { v: p.total, s: 'moeda' },
        { v: p.custo26, s: 'moeda' }, { v: p.custo27, s: 'moeda' }, { v: p.total26, s: 'moeda' }, { v: p.total27, s: 'moeda' },
        { v: p.margem26 != null ? p.margem26 / 100 : null, s: 'pct' }, { v: p.margem27 != null ? p.margem27 / 100 : null, s: 'pct' }, { v: p.pendencias, s: 'num' }]);
    });
    sheets.push({ name: 'Produtos', cols: [40, 12, 12, 8, 14, 16, 18, 18, 18, 18, 12, 12, 11], rows: PRD });

    // Memórias (todos os produtos, por ano)
    [2026, 2027].forEach(function (ano) {
      var rows = [];
      var mg = ['A1:K1'];
      rows.push([{ v: 'Memória de cálculo ' + ano + ' — ' + dd.empresa.razaoSocial + ' · ' + dd.op.nome, s: 'titulo' }].concat(new Array(10).fill({ v: '', s: 'titulo' })));
      rows[0].__altura = 24;
      dd.memorias.filter(function (m) { return m.ano === ano; }).forEach(function (m) {
        rows.push([]);
        rows.push([{ v: m.titulo, s: 'secao' }].concat(new Array(10).fill({ v: '', s: 'secao' })));
        mg.push('A' + rows.length + ':K' + rows.length);
        rows.push(['Grupo', 'Item', 'Entrada', 'Base', 'Alíquota', 'Fórmula', 'Valor', 'Origem', 'Fundamento', 'Vigência', 'Observações'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
        m.linhas.forEach(function (l) {
          var bold = l.destaque;
          rows.push([
            { v: l.grupo || '', s: 'textoCompacto' }, { v: l.item, s: bold ? 'rotuloTotal' : 'negrito' }, { v: l.entrada, s: 'texto' },
            { v: l.base, s: 'moeda' }, { v: l.aliq != null ? l.aliq / 100 : null, s: 'pct' }, { v: l.formula, s: 'texto' },
            { v: l.valor != null ? l.valor : (l.numero != null ? l.numero : null), s: l.valor != null ? (bold ? 'moedaNegrito' : 'moeda') : 'num4' },
            { v: l.origem, s: 'texto' }, { v: l.fund, s: 'texto' }, { v: l.vig, s: 'texto' }, { v: l.obs, s: 'texto' }
          ]);
        });
      });
      sheets.push({ name: 'Memória ' + ano, cols: [20, 34, 22, 15, 10, 46, 16, 22, 40, 22, 48], rows: rows, merges: mg });
    });

    // Sensibilidade
    if (dd.sensibilidade.length) {
      var S = [['CBS de referência', 'Preço 2027 (mesma margem)', 'Total ao cliente 2027', 'Variação vs 2026', 'Margem 2027 (mesmo preço)', 'Observação'].map(function (h) { return { v: h, s: 'cabecalho' }; })];
      dd.sensibilidade.forEach(function (s) {
        S.push([{ v: s.cbsRef / 100, s: 'pct' }, { v: s.preco27, s: 'moeda' }, { v: s.total27, s: 'moeda' }, { v: s.varTotal != null ? s.varTotal / 100 : null, s: 'pct' }, { v: s.margem27 != null ? s.margem27 / 100 : null, s: 'pct' }, { v: s.atual ? 'Parâmetro atual' : '', s: 'destaque' }]);
      });
      sheets.push({ name: 'Sensibilidade CBS', cols: [18, 24, 22, 18, 24, 18], rows: S });
    }

    // Premissas e avisos
    var P = [[{ v: 'Premissas', s: 'secao' }]];
    dd.premissas.forEach(function (p) { P.push([{ v: p, s: 'texto' }]); });
    P.push([]);
    P.push([{ v: 'Avisos e validações', s: 'secao' }]);
    dd.avisos.forEach(function (p) { P.push([{ v: p, s: 'texto' }]); });
    sheets.push({ name: 'Premissas e avisos', cols: [140], rows: P, retrato: true });

    // Base legal
    var B = [['Norma / fonte', 'Natureza', 'Conteúdo', 'Link'].map(function (h) { return { v: h, s: 'cabecalho' }; })];
    dd.fundamentos.forEach(function (f) { B.push([{ v: f.norma, s: 'negrito' }, { v: { norma: 'Norma', jurisprudencia: 'Jurisprudência', administrativo: 'Entendimento administrativo', estimativa: 'Estimativa (não oficial)' }[f.natureza] || '', s: 'texto' }, { v: f.resumo, s: 'texto' }, { v: f.url || '', s: 'texto' }]); });
    sheets.push({ name: 'Base legal', cols: [42, 22, 90, 50], rows: B });

    // Parâmetros
    var PR = [['Parâmetro', 'Valor', 'Unidade', 'Status', 'Vigência', 'Fundamento', 'Atualizado em', 'Nota'].map(function (h) { return { v: h, s: 'cabecalho' }; })];
    dd.parametros.forEach(function (p) {
      PR.push([{ v: p.nome, s: 'negrito' }, { v: p.un === '%' ? p.valor / 100 : p.valor, s: p.un === '%' ? 'pct' : p.un === 'R$' ? 'moeda' : 'num' }, { v: p.un, s: 'texto' }, { v: p.statusRotulo, s: 'texto' }, { v: p.vig, s: 'texto' }, { v: p.fund, s: 'texto' }, { v: F.date(p.atualizadoEm), s: 'texto' }, { v: p.nota || '', s: 'texto' }]);
    });
    sheets.push({ name: 'Parâmetros', cols: [44, 14, 9, 13, 24, 40, 14, 60], rows: PR });

    var blob = N.xlsx.build({ title: dd.titulo, author: 'Nexus Contabilidade', sheets: sheets });
    D.baixar(blob, nomeArquivo(dd, 'xlsx'));
    D.toast('Planilha Excel gerada.');
  }

  RTC.exportar = { dados: dados, dadosSimples: dadosSimples, modeloEscolhido: modeloEscolhido, pdf: pdf, xlsx: xlsx, pdfSafe: pdfSafe };
})(typeof window !== 'undefined' ? window : globalThis);
