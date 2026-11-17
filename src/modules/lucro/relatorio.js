/*
 * Lucratividade por Item — relatório de uma análise em PDF e Excel.
 * Conteúdo: identificação (empresa, análise, parâmetros), resumo, resultado por item, DRE consolidada da análise
 * (Lei 6.404/1976, art. 187), DRE de cada item (opcional) e notas com a base legal.
 * dados() é puro (testável); pdf() usa jsPDF + AutoTable carregados sob demanda, como o RTC; planilha() gera o .xlsx.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var LC = N.lucro = N.lucro || {};
  var F = N.fmt;

  var CDN = {
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  };
  var ORDEM_DRE = ['rb', 'deducoes', 'desconto', 'icms', 'pis', 'cofins', 'das', 'rl', 'cmv', 'lb', 'despesas', 'comissao', 'cartao', 'antesIr', 'ir', 'irpj', 'csll', 'll'];
  var SITUACAO = { negativa: 'Prejuízo', abaixo: 'Abaixo da meta', ok: 'Na meta ou acima', sem: 'Sem preço' };

  function situacao(r, p) {
    if (r.erro) return 'sem';
    return r.faixa === 'ok' && p.margemAlvo == null ? 'ok' : r.faixa;
  }

  /** DRE da análise: soma das DREs dos itens com preço (valores da linha = por unidade × quantidade) */
  function dreConsolidada(resultados) {
    var soma = {}, nomes = {}, nivel = {}, temIr = false;
    resultados.forEach(function (r) {
      if (r.erro) return;
      var linhas = LC.motor.dre(r), q = r.quantidade;
      var final = linhas[linhas.length - 1];
      if (linhas.some(function (l) { return l.id === 'antesIr'; })) temIr = true;
      linhas.forEach(function (l) {
        soma[l.id] = (soma[l.id] || 0) + l.valor * q;
        if (!nomes[l.id]) { nomes[l.id] = l.nome; nivel[l.id] = l.nivel; }
      });
      // item sem IRPJ/CSLL: o resultado antes deles é o próprio lucro
      if (!linhas.some(function (l) { return l.id === 'antesIr'; })) soma.__semIr = (soma.__semIr || 0) + final.valor * q;
    });
    if (temIr) soma.antesIr = (soma.antesIr || 0) + (soma.__semIr || 0);
    var rb = soma.rb || 0;
    return ORDEM_DRE.filter(function (id) { return soma[id] !== undefined && (id !== 'antesIr' || temIr); }).map(function (id) {
      var nome = id === 'll' ? (temIr ? '= Lucro líquido da análise' : '= Lucro da análise (antes do IRPJ e da CSLL)') : nomes[id];
      return { id: id, nome: nome, nivel: nivel[id], total: soma[id], av: rb ? soma[id] / rb : null };
    });
  }

  /**
   * Dados do relatório. o: { empresa, analise, params, incluirDre (padrão true), emitidoEm? }
   */
  function dados(o) {
    var M = LC.motor, emp = o.empresa, an = o.analise, p = o.params;
    var c27 = p.cenario === '2027';
    var ref = c27 ? p.ref2027 || M.referencia2027() : null;
    var lista = an.itens.map(function (it) { return { item: it, r: M.calcularItem(it, p) }; });
    var rs = lista.map(function (x) { return x.r; });
    var t = M.totais(rs);
    var porSit = { negativa: 0, abaixo: 0, ok: 0, sem: 0 };
    lista.forEach(function (x) { porSit[situacao(x.r, p)]++; });
    var itens = lista.map(function (x) {
      var it = x.item, r = x.r, c = r.compra || {};
      return {
        codigo: it.codigo || '', descricao: it.descricao || 'Item sem descrição', ncm: it.ncm || '', quantidade: Number(it.quantidade) || 0,
        custoBruto: c.custoBruto, creditoIcms: c.creditoIcms, creditoPisCofins: c.creditoPisCofins, creditoCbsIbs: c.creditoCbsIbs || 0,
        creditoTrib: c27 ? c.creditoCbsIbs || 0 : c.creditoPisCofins, custoLiquido: c.custoLiquido, clUnit: c.custoLiquidoUnit,
        pv: r.erro ? null : r.pv, pld: r.erro ? null : r.pld, totalCliente: r.erro ? null : r.totalCliente, lucroUnit: r.erro ? null : r.lucro, lucroTotal: r.erro ? null : r.lucroTotal,
        margem: r.erro ? null : r.margem, situacao: SITUACAO[situacao(r, p)], faixa: situacao(r, p),
        alertas: (r.alertas || []).map(function (a) { return a.msg; })
      };
    });
    var dreItens = o.incluirDre === false ? [] : lista.filter(function (x) { return !x.r.erro; }).map(function (x) {
      var r = x.r, q = r.quantidade;
      return {
        titulo: (x.item.codigo ? x.item.codigo + ' — ' : '') + (x.item.descricao || 'Item sem descrição') + ' · ' + F.num(q, q % 1 ? 4 : 0) + ' un.',
        linhas: M.dre(r).map(function (l) { return { nome: l.nome, nivel: l.nivel, unit: l.valor, total: l.valor * q, av: r.pv ? l.valor / r.pv : null }; })
      };
    });
    var regime = M.REGIMES[p.regime] || p.regime;
    return {
      emitidoEm: o.emitidoEm || new Date().toISOString(),
      titulo: 'Relatório de lucratividade por item',
      empresa: { razaoSocial: emp.razaoSocial || 'Empresa sem nome', cnpj: emp.cnpj || '', uf: emp.uf || '' },
      analise: { nome: an.nome, atualizadoEm: an.atualizadoEm || null },
      cabecalho: [
        ['Empresa', (emp.razaoSocial || 'Empresa sem nome') + (emp.cnpj ? ' · CNPJ ' + emp.cnpj : '')],
        ['Análise', an.nome + ' · ' + an.itens.length + ' item(ns)'],
        ['Regime', regime + (an.regime && an.regime !== emp.regime ? ' (simulação nesta análise)' : '')],
        ['UF', emp.uf || '—'],
        ['Cenário', c27 ? '2027 — ICMS + CBS e IBS por fora (LC 214/2025)' : '2026 — ICMS + PIS/Cofins (ou DAS)'],
        ['CBS e IBS', c27 ? (p.regime === 'SIMPLES' ? 'dentro do DAS (Simples Nacional)' : 'CBS ' + F.pct(ref.cbs) + (ref.status !== 'oficial' ? ' (estimada)' : '') + ' · IBS ' + F.pct(ref.ibs)) : 'não se aplicam em 2026 (fase de teste, sem ônus)'],
        ['Margem-alvo', p.margemAlvo != null ? F.pct(Number(p.margemAlvo)) : 'não definida'],
        ['ICMS interno padrão', p.aliqIcmsInternaPadrao != null ? F.pct(Number(p.aliqIcmsInternaPadrao)) : 'não informado'],
        ['IRPJ e CSLL', p.considerarIrpjCsll ? (p.regime === 'PRESUMIDO' ? 'presumidos, no preço' : 'estimativa sobre o lucro do item') : 'não considerados']
      ],
      resumo: {
        itens: an.itens.length, comPreco: t.calculados, porSituacao: porSit,
        faturamento: t.faturamento, pld: t.pld, tributos: t.tributos, despesas: t.despesas, tributosFora: t.tributosFora, totalCliente: t.totalCliente,
        custoBruto: t.custoBruto, creditos: t.creditos, custoLiquido: t.custoLiquido, lucro: t.lucro, margem: t.margem,
        lucroAposIr: p.regime === 'REAL' && p.considerarIrpjCsll ? t.lucroAposIr : null
      },
      cenario: c27 ? '2027' : '2026',
      rotuloCredito: c27 ? 'CBS/IBS' : 'PIS/Cofins',
      itens: itens,
      dre: dreConsolidada(rs),
      dreItens: dreItens,
      notas: (c27 ? [
        'Cenário 2027 (LC 214/2025): PIS e Cofins extintos (EC 132/2023, ADCT, art. 126, II); CBS à alíquota de referência menos 0,1 ponto percentual (arts. 347 e 349) e IBS de 0,1% (art. 344), com as alíquotas dos Parâmetros do RTC Comparativo.' + (ref && ref.status !== 'oficial' ? ' A alíquota de referência da CBS ainda não é oficial (Resolução do Senado).' : ''),
        'Custo líquido de aquisição = custo bruto (mercadoria − desconto + frete + IPI + seguro/outros + DAE + CBS + IBS) − créditos de ICMS, CBS e IBS. Compra: CBS e IBS por fora sobre (valor da operação − ICMS destacado), com crédito integral no regime regular (art. 47); no Simples, sem crédito (art. 47, § 9º). IPI zero a partir de 2027 (ADCT, art. 126, III; LC 214/2025, art. 454), salvo ZFM.',
        'Venda: CBS e IBS por fora, sobre o preço sem o ICMS (art. 12, § 2º, V): somados ao preço e pagos pelo cliente, fora da receita bruta e do lucro (DL 1.598/1977, art. 12, § 4º).' + (p.ibsCbsNaBaseIcms !== false ? ' ICMS com CBS e IBS na base, conforme entendimento da SEFAZ-SP e da SEFAZ-MG (tema judicializado).' : '') + (p.despesasSobreTotal !== false ? ' Comissão e cartão sobre o total cobrado do cliente.' : ''),
        'Item com DAE 1031 (ICMS-ST): sem crédito de ICMS e sem ICMS na venda. DAE 1023 (ICMS antecipado): crédito de ICMS depois do pagamento (Decreto 33.327/2019, art. 61, § 5º).'
      ] : [
        'Custo líquido de aquisição = custo bruto (mercadoria − desconto + frete + IPI + seguro/outros + DAE) − créditos de ICMS e de PIS/Cofins do regime.',
        'Crédito de PIS/Cofins (Lucro Real): base = mercadoria − desconto − ICMS destacado na NF (Leis 10.637/2002 e 10.833/2003, art. 3º, § 2º, III, incluído pela Lei 14.592/2023).',
        'Item com DAE 1031 (ICMS-ST): sem crédito de ICMS e sem ICMS na venda. DAE 1023 (ICMS antecipado): crédito de ICMS depois do pagamento (Decreto 33.327/2019, art. 61, § 5º).',
        'PIS e Cofins da venda sobre o preço sem o ICMS (STF, Tema 69 — RE 574.706). Desconto incondicional fora da receita tributável.'
      ]).concat(['Margem = lucro ÷ preço líquido de desconto (PLD). Margem total = soma dos lucros ÷ soma dos PLD. DRE: Lei 6.404/1976, art. 187; AV % sobre a receita bruta.']),
      aviso: 'Os resultados dependem dos dados e parâmetros informados; não substituem a análise da legislação aplicável a cada caso.'
    };
  }

  function nomeArquivo(dd, ext) {
    var slug = N.dom && N.dom.slug ? N.dom.slug : function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); };
    return 'Lucratividade_' + slug(dd.empresa.razaoSocial) + '_' + slug(dd.analise.nome) + '_' + dd.emitidoEm.slice(0, 10) + '.' + ext;
  }
  function pct(v) { return v == null ? '—' : F.pct(v * 100); }

  // ------------------------------------------------------------------ Excel
  function planilha(dd) {
    function cab(cols) { return cols.map(function (h) { return { v: h, s: 'cabecalho' }; }); }
    var R = [[{ v: dd.titulo, s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }]];
    R.push([{ v: 'Emitido em ' + F.dateTime(dd.emitidoEm) + ' · Nexus Contabilidade', s: 'nota' }]);
    R.push([]);
    dd.cabecalho.forEach(function (l) { R.push([{ v: l[0], s: 'negrito' }, { v: l[1], s: 'texto' }]); });
    R.push([]);
    R.push([{ v: 'Resumo da análise', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }]);
    var s = dd.resumo;
    [['Faturamento (preço × quantidade)', s.faturamento, 'moeda'], ['Receita após descontos (PLD)', s.pld, 'moeda'], ['Tributos sobre a venda', s.tributos, 'moeda'],
      ['Despesas de venda (comissão e cartão)', s.despesas, 'moeda'], ['Custo bruto de aquisição', s.custoBruto, 'moeda'], ['Créditos (ICMS e ' + dd.rotuloCredito + ')', s.creditos, 'moeda'],
      ['Custo líquido de aquisição', s.custoLiquido, 'moeda'], ['Lucro total', s.lucro, 'moedaNegrito'], ['Margem total (soma dos lucros ÷ soma dos PLD)', s.margem, 'pct']]
      .concat(dd.cenario === '2027' && s.tributosFora > 0.004 ? [['CBS e IBS cobrados dos clientes (por fora)', s.tributosFora, 'moeda'], ['Total pago pelos clientes', s.totalCliente, 'moeda']] : [])
      .concat(s.lucroAposIr != null ? [['Lucro após IRPJ/CSLL (estimativa)', s.lucroAposIr, 'moeda']] : [])
      .forEach(function (l) { R.push([{ v: l[0], s: 'texto' }, { v: l[1], s: l[2] }]); });
    R.push([{ v: 'Itens', s: 'texto' }, { v: s.itens + ' (' + s.comPreco + ' com preço; ' + s.porSituacao.negativa + ' com prejuízo; ' + s.porSituacao.abaixo + ' abaixo da meta)', s: 'texto' }]);
    R.push([]);
    R.push([{ v: 'DRE da análise (Lei 6.404/1976, art. 187)', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }]);
    R.push(cab(['Linha', 'Total (R$)', 'AV %']));
    dd.dre.forEach(function (l) { var forte = l.nivel === 'total' || l.nivel === 'final'; R.push([{ v: l.nome, s: forte ? 'negrito' : 'texto' }, { v: l.total, s: forte ? 'moedaNegrito' : 'moeda' }, { v: l.av, s: 'pct' }]); });
    R.push([]);
    dd.notas.concat([dd.aviso]).forEach(function (n) { var l = [{ v: n, s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }]; l.__altura = 28; R.push(l); });
    var notasIni = R.length - dd.notas.length;
    var mergesResumo = ['A1:D1'];
    for (var i = notasIni; i <= R.length; i++) mergesResumo.push('A' + i + ':D' + i);

    var c27 = dd.cenario === '2027';
    var I = [cab(['Código', 'Descrição', 'NCM', 'Quantidade', 'Custo bruto', 'Crédito ICMS', 'Crédito ' + dd.rotuloCredito, 'Custo líquido', 'CL unitário', 'Preço de venda (un.)', 'PLD (un.)']
      .concat(c27 ? ['Total ao cliente com CBS e IBS (un.)'] : []).concat(['Lucro (un.)', 'Lucro da linha', 'Margem', 'Situação', 'Alertas']))];
    dd.itens.forEach(function (x) {
      I.push([{ v: x.codigo, s: 'textoFmt' }, { v: x.descricao, s: 'texto' }, { v: x.ncm, s: 'textoFmt' }, { v: x.quantidade, s: 'num' }, { v: x.custoBruto, s: 'moeda' }, { v: x.creditoIcms, s: 'moeda' },
        { v: x.creditoTrib, s: 'moeda' }, { v: x.custoLiquido, s: 'moeda' }, { v: x.clUnit, s: 'moeda' }, { v: x.pv, s: 'moeda' }, { v: x.pld, s: 'moeda' }]
        .concat(c27 ? [{ v: x.totalCliente, s: 'moeda' }] : [])
        .concat([{ v: x.lucroUnit, s: 'moeda' }, { v: x.lucroTotal, s: 'moedaNegrito' }, { v: x.margem, s: 'pct' }, { v: x.situacao, s: 'texto' }, { v: x.alertas.join(' | '), s: 'texto' }]));
    });
    I.push([{ v: 'Total', s: 'negrito' }, { v: dd.itens.length + ' item(ns)', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: s.custoBruto, s: 'moedaNegrito' }, { v: '', s: 'texto' },
      { v: '', s: 'texto' }, { v: s.custoLiquido, s: 'moedaNegrito' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }]
      .concat(c27 ? [{ v: '', s: 'texto' }] : []).concat([{ v: '', s: 'texto' }, { v: s.lucro, s: 'moedaNegrito' }, { v: s.margem, s: 'pct' }]));
    var sheets = [
      { name: 'Resumo', cols: [46, 30, 12, 12], rows: R, merges: mergesResumo, retrato: true },
      { name: 'Itens', cols: [12, 34, 11, 10, 14, 13, 14, 14, 12, 14, 12].concat(c27 ? [16] : []).concat([12, 14, 10, 16, 50]), rows: I, freeze: 1 }
    ];
    if (dd.dreItens.length) {
      var DI = [cab(['Item', 'Linha da DRE', 'Por unidade', 'Total da linha', 'AV %'])];
      dd.dreItens.forEach(function (b) {
        b.linhas.forEach(function (l) {
          var forte = l.nivel === 'total' || l.nivel === 'final';
          DI.push([{ v: b.titulo, s: 'texto' }, { v: l.nome, s: forte ? 'negrito' : 'texto' }, { v: l.unit, s: forte ? 'moedaNegrito' : 'moeda' }, { v: l.total, s: forte ? 'moedaNegrito' : 'moeda' }, { v: l.av, s: 'pct' }]);
        });
      });
      sheets.push({ name: 'DRE por item', cols: [40, 42, 14, 16, 10], rows: DI, freeze: 1 });
    }
    return N.xlsx.build({ title: dd.titulo + ' — ' + dd.analise.nome, author: 'Nexus Contabilidade', sheets: sheets });
  }

  function xlsx(o) {
    var dd = dados(o);
    N.dom.baixar(planilha(dd), nomeArquivo(dd, 'xlsx'));
    N.dom.toast('Planilha gerada: ' + dd.analise.nome + '.');
  }

  // ------------------------------------------------------------------ PDF
  function pdf(o) {
    var dd = dados(o);
    var D = N.dom;
    D.toast('Gerando PDF…');
    D.carregarScript(CDN.jspdf).then(function () { return D.carregarScript(CDN.autotable); }).then(function () { gerarPdf(dd); }).catch(function () {
      D.dialogo({ titulo: 'Gerador de PDF indisponível', texto: 'Não foi possível carregar a biblioteca de PDF (é necessária conexão com a internet). Use "Baixar Excel" ou tente de novo com conexão.', botoes: [{ rotulo: 'Fechar', valor: null }] });
    });
  }

  function gerarPdf(dd) {
    var safe = N.rtc && N.rtc.exportar && N.rtc.exportar.pdfSafe ? N.rtc.exportar.pdfSafe : function (x) { return x == null ? '' : String(x); };
    var doc = new root.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
    var LARANJA = [247, 81, 31], PRETO = [19, 18, 17], TINTA = [36, 36, 36], CINZA = [107, 98, 91];
    var VERDE = [30, 130, 80], AMBAR = [176, 116, 0], VERMELHO = [200, 52, 40];
    var comCabecalho = {};
    function cabecalhoPagina() {
      var pg = doc.internal.getCurrentPageInfo().pageNumber;
      if (comCabecalho[pg]) return; // uma vez por página (o AutoTable chama a cada tabela)
      comCabecalho[pg] = true;
      doc.setFillColor.apply(doc, PRETO); doc.rect(0, 0, W, 20, 'F');
      doc.setFillColor.apply(doc, LARANJA); doc.rect(0, 20, W, 1.2, 'F');
      try { doc.addImage(N.assets.logoPng, 'PNG', M, 4.5, 11 * N.assets.logoRatio, 11); } catch (e) { /* logo opcional */ }
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('Lucratividade por Item', W - M, 9.5, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(255, 217, 199);
      doc.text(safe(dd.empresa.razaoSocial + ' · ' + dd.analise.nome), W - M, 14.5, { align: 'right' });
    }
    var y = 28;
    function garantir(h) { if (y + h > H - 16) { doc.addPage(); cabecalhoPagina(); y = 28; } }
    function secao(t) {
      garantir(16); y += 3;
      doc.setFillColor.apply(doc, LARANJA); doc.rect(M, y - 3.6, 1.6, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor.apply(doc, TINTA);
      doc.text(safe(t), M + 4, y); y += 4;
    }
    var base = {
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.4, textColor: TINTA, lineColor: [227, 220, 214], lineWidth: 0.1, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 246, 243] },
      margin: { left: M, right: M, top: 28, bottom: 16 },
      didDrawPage: function () { cabecalhoPagina(); }
    };
    function tabela(opts) { doc.autoTable(Object.assign({}, base, opts, { startY: y + 1 })); y = doc.lastAutoTable.finalY + 6; }
    function brl(v) { return v == null ? '—' : safe(F.brl(v)); }
    function cor(faixa) { return faixa === 'negativa' ? VERMELHO : faixa === 'abaixo' ? AMBAR : faixa === 'ok' ? VERDE : CINZA; }
    function dreBody(linhas, unit) {
      return linhas.map(function (l) {
        var forte = l.nivel === 'total' || l.nivel === 'final';
        var st = { fontStyle: forte ? 'bold' : 'normal' };
        var nome = (l.nivel === 'sub' ? '    ' : '') + l.nome;
        var row = [{ content: safe(nome), styles: st }];
        if (unit) row.push({ content: brl(l.unit), styles: Object.assign({ halign: 'right' }, st) });
        row.push({ content: brl(l.total), styles: Object.assign({ halign: 'right' }, st) }, { content: safe(pct(l.av)), styles: Object.assign({ halign: 'right' }, st) });
        if (l.nivel === 'final') row.forEach(function (c) { c.styles.fillColor = [255, 236, 226]; });
        return row;
      });
    }

    cabecalhoPagina();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor.apply(doc, TINTA);
    doc.text(safe(dd.titulo), M, y + 2); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor.apply(doc, CINZA);
    doc.text(safe('Emitido em ' + F.dateTime(dd.emitidoEm)), M, y + 1); y += 4;
    tabela({ theme: 'plain', styles: Object.assign({}, base.styles, { fontSize: 8 }), columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 2: { fontStyle: 'bold', cellWidth: 38 } },
      body: (function () { var b = []; for (var i = 0; i < dd.cabecalho.length; i += 2) { var a = dd.cabecalho[i], c = dd.cabecalho[i + 1] || ['', '']; b.push([safe(a[0]), safe(a[1]), safe(c[0]), safe(c[1])]); } return b; })() });

    var s = dd.resumo;
    secao('Resumo da análise');
    tabela({ head: [['Faturamento', 'Receita após descontos (PLD)', 'Custo líquido de aquisição', 'Lucro total', 'Margem total']],
      body: [[brl(s.faturamento), brl(s.pld), brl(s.custoLiquido), { content: brl(s.lucro), styles: { fontStyle: 'bold', textColor: s.lucro < 0 ? VERMELHO : VERDE } }, { content: safe(pct(s.margem)), styles: { fontStyle: 'bold' } }]],
      styles: Object.assign({}, base.styles, { fontSize: 9, halign: 'right' }) });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor.apply(doc, TINTA);
    garantir(8);
    doc.text(safe(s.itens + ' item(ns): ' + s.comPreco + ' com preço · ' + s.porSituacao.negativa + ' com prejuízo · ' + s.porSituacao.abaixo + ' abaixo da meta · ' + s.porSituacao.ok + ' na meta ou acima · ' + s.porSituacao.sem + ' sem preço.' +
      (s.lucroAposIr != null ? ' Lucro após IRPJ/CSLL (estimativa): ' + F.brl(s.lucroAposIr) + '.' : '') +
      (dd.cenario === '2027' && s.tributosFora > 0.004 ? ' CBS e IBS cobrados dos clientes (por fora): ' + F.brl(s.tributosFora) + ' · total pago pelos clientes: ' + F.brl(s.totalCliente) + '.' : '')), M, y + 1);
    y += 6;

    secao('Resultado por item');
    tabela({ head: [['Código', 'Descrição', 'Qtd', 'Custo líquido (un.)', 'Preço (un.)', 'Lucro (un.)', 'Lucro da linha', 'Margem', 'Situação']],
      body: dd.itens.map(function (x) {
        return [safe(x.codigo), safe(x.descricao + (x.ncm ? ' (NCM ' + x.ncm + ')' : '')), safe(F.num(x.quantidade, x.quantidade % 1 ? 4 : 0)), brl(x.clUnit), brl(x.pv), brl(x.lucroUnit),
          { content: brl(x.lucroTotal), styles: { fontStyle: 'bold' } }, safe(pct(x.margem)), { content: safe(x.situacao), styles: { textColor: cor(x.faixa), fontStyle: 'bold' } }];
      }).concat([[{ content: 'Total', styles: { fontStyle: 'bold' } }, '', '', brl(s.custoLiquido), '', '', { content: brl(s.lucro), styles: { fontStyle: 'bold' } }, { content: safe(pct(s.margem)), styles: { fontStyle: 'bold' } }, '']]),
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 14 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', cellWidth: 18 }, 8: { cellWidth: 30 } } });

    secao('DRE da análise (Lei 6.404/1976, art. 187)');
    tabela({ head: [['Linha', 'Total (R$)', 'AV %']], body: dreBody(dd.dre, false), tableWidth: 170, columnStyles: { 0: { cellWidth: 110 } } });

    if (dd.dreItens.length) {
      secao('DRE de cada item');
      dd.dreItens.forEach(function (b) {
        garantir(30);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor.apply(doc, TINTA);
        doc.text(safe(b.titulo), M, y + 2); y += 3;
        tabela({ head: [['Linha', 'Por unidade', 'Total da linha', 'AV %']], body: dreBody(b.linhas, true), tableWidth: 200, columnStyles: { 0: { cellWidth: 110 } } });
      });
    }

    secao('Notas e base legal');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, TINTA);
    dd.notas.forEach(function (n) {
      var linhas = doc.splitTextToSize(safe('• ' + n), W - 2 * M);
      garantir(linhas.length * 3.6 + 2);
      doc.text(linhas, M, y + 2); y += linhas.length * 3.6 + 1.5;
    });

    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(227, 220, 214); doc.line(M, H - 11, W - M, H - 11);
      doc.setFontSize(6.8); doc.setTextColor.apply(doc, CINZA); doc.setFont('helvetica', 'normal');
      doc.text(safe(dd.aviso), M, H - 7);
      doc.text(safe('Nexus Contabilidade · emitido em ' + F.dateTime(dd.emitidoEm)), M, H - 4);
      doc.text('Página ' + i + ' de ' + n, W - M, H - 5.5, { align: 'right' });
    }
    doc.save(nomeArquivo(dd, 'pdf'));
  }

  LC.relatorio = { dados: dados, dreConsolidada: dreConsolidada, planilha: planilha, xlsx: xlsx, pdf: pdf, nomeArquivo: nomeArquivo };
})(typeof window !== 'undefined' ? window : globalThis);
