/* Testes da integração entre os módulos RTC Comparativo e Lucratividade por Item (src/core/integracao.js) */
(function () {
  'use strict';
  var test = T.test, ok = T.ok, eq = T.eq, near = T.near;
  var I = Nexus.integracao, RTC = Nexus.rtc, LC = Nexus.lucro;

  /** Dados da Lucratividade com a MS 162 da planilha do escritório */
  function dadosLucro() {
    var emp = LC.modelo.novaEmpresa();
    emp.razaoSocial = 'Comercial Teste Ltda'; emp.cnpj = '11.222.333/0001-81'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = LC.modelo.novaAnalise(emp, 'NF 366423');
    var it = LC.modelo.novoItem(an);
    it.codigo = '2010'; it.descricao = 'MS 162 MOTOSSERRA,61PMM3'; it.ncm = '84678100'; it.quantidade = 10;
    it.compra = { valorMercadoria: 7461.09, descontoCompra: 0, frete: 453.61, icmsFrete: 0, ipi: 387.98, seguroOutros: 0, icmsDestacado: 316.59, daeValor: 132.84, daeCodigo: '1023', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true };
    it.trib = { icmsSt: false, aliqIcms: 5.6, reducaoBcIcms: 0, regimePisCofins: 'NORMAL', dasAliquota: null };
    it.venda.precoVenda = 1189.41; it.venda.comissao = 3; it.venda.taxaCartao = 2.5;
    var vazio = LC.modelo.novoItem(an); // item em branco: espera o preenchimento
    an.itens.push(it, vazio);
    return { versao: 1, empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
  }
  function dadosRtc() { return { empresas: [], simulacoes: [], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} }; }
  function opRtc(d) { return d.simulacoes[0]; }

  test('Integração · Lucratividade → RTC: empresa, operação e produto copiados com os valores da nota', function () {
    var lu = dadosLucro(), rt = dadosRtc();
    var rel = I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' });
    eq(rel.novos, 1, 'só o item preenchido');
    eq(rel.empresasCriadas.length, 1); eq(rel.containersCriados, 1); ok(rel.origemAlterada && rel.destinoAlterado);
    var e = rt.empresas[0], op = opRtc(rt), p = op.itens[0];
    eq(e.regime, 'LR'); eq(e.cnpj, '11.222.333/0001-81'); eq(op.nome, 'NF 366423'); eq(op.empresaId, e.id);
    eq(p.produto.codigo, '2010'); eq(p.produto.quantidade, 10); near(p.valores.valorUnitario, 746.109, 1e-9);
    near(p.valores.ipi, 387.98, 1e-9); near(p.valores.frete, 453.61, 1e-9); eq(p.valores.freteNaNota, true);
    near(p.perfil.icms.valorEntradaInformado, 316.59, 1e-9);
    eq(p.perfil.antecipado.tipo, 'antecipado'); near(p.perfil.antecipado.valor, 132.84, 1e-9);
    eq(p.perfil.icms.aliqSaidaAuto, false); near(p.perfil.icms.aliqSaida, 5.6, 1e-9);
    eq(p.venda.modo, 'B'); near(p.venda.precoUnitarioAtual, 1189.41, 1e-9); near(p.venda.despesas[0].pct, 3, 1e-9); near(p.venda.despesas[1].pct, 2.5, 1e-9);
    eq(p.origemModulo, 'lucro'); ok(p.sync && p.sync === lu.analises[0].itens[0].sync, 'mesmo vínculo nos dois módulos');
    // o motor do RTC chega ao mesmo crédito de PIS/Cofins da planilha: (7.461,09 − 316,59) × 9,25%
    var r = RTC.engine.calcular(e, p, {});
    ok(r.custo26, 'RTC calcula o produto copiado: ' + JSON.stringify(r.erros));
    near(r.custo26.cred.pis + r.custo26.cred.cofins, 660.87, 0.01, 'PIS/Cofins da compra no RTC');
    near(r.custo26.cred.icms, 316.59, 0.001, 'ICMS destacado');
  });

  test('Integração · não duplica, não volta o que foi excluído e reaproveita a empresa pelo CNPJ', function () {
    var lu = dadosLucro(), rt = dadosRtc();
    I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' });
    eq(I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' }).novos, 0, 'segunda sincronização não copia de novo');
    eq(I.sincronizar({ rtc: rt, lucro: lu, para: 'lucro' }).novos, 0, 'o produto copiado não volta como novo para a origem');
    // excluído no RTC: não volta
    var op = opRtc(rt);
    I.registrarExclusao(rt, op.itens);
    op.itens = [];
    eq(I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' }).novos, 0, 'excluído no RTC não volta');
    eq(rt.syncExcluidos.length, 1);
    // empresa já cadastrada no outro módulo (mesmo CNPJ, sem pontuação): não cria outra
    var lu2 = dadosLucro(), rt2 = dadosRtc();
    var ex = RTC.model.novaEmpresa(); ex.razaoSocial = 'COMERCIAL TESTE'; ex.cnpj = '11222333000181'; rt2.empresas.push(ex);
    var rel = I.sincronizar({ rtc: rt2, lucro: lu2, para: 'rtc' });
    eq(rel.empresasCriadas.length, 0, 'casou pelo CNPJ'); eq(rt2.empresas.length, 1); eq(opRtc(rt2).empresaId, ex.id);
  });

  test('Integração · RTC → Lucratividade: custo líquido igual nos dois módulos', function () {
    var emp = RTC.model.novaEmpresa();
    emp.razaoSocial = 'Loja Exemplo'; emp.uf = 'CE'; emp.regime = 'LR'; emp.real.lucroAnual = 1000000;
    var op = RTC.model.novaOperacao(emp, 'Compra 10');
    var it = RTC.model.novoItem(emp);
    it.produto.codigo = 'X1'; it.produto.descricao = 'Produto teste'; it.produto.ncm = '12345678'; it.produto.quantidade = 10;
    it.valores.valorUnitario = 100;
    it.perfil.icms.aliqEntradaAuto = false; it.perfil.icms.aliqEntrada = 12;
    it.perfil.icms.aliqSaidaAuto = false; it.perfil.icms.aliqSaida = 18;
    it.venda.margem = 20;
    it.venda.despesas[0].pct = 3;
    op.itens.push(it);
    var rt = { empresas: [emp], simulacoes: [op], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} };
    var lu = { empresas: [], analises: [], syncExcluidos: [], ui: {} };
    var rel = I.sincronizar({ rtc: rt, lucro: lu, para: 'lucro', opcoesRtc: {} });
    eq(rel.novos, 1);
    var e = lu.empresas[0], an = lu.analises[0], x = an.itens[0];
    eq(e.regime, 'REAL'); eq(an.nome, 'Compra 10'); eq(x.codigo, 'X1'); eq(x.origemModulo, 'rtc');
    near(x.compra.valorMercadoria, 1000, 1e-9); near(x.compra.icmsDestacado, 120, 1e-9, 'ICMS calculado pelo motor do RTC');
    near(x.trib.aliqIcms, 18, 1e-9); near(x.venda.comissao, 3, 1e-9);
    var rRtc = RTC.engine.calcular(emp, it, {});
    ok(x.venda.precoVenda > 0, 'preço que o RTC sugere para a margem de 20%');
    near(x.venda.precoVenda * 10, rRtc.a1.v26.X, 0.01);
    var p = LC.motor.parametrosPadrao(); p.regime = 'REAL'; p.uf = 'CE';
    var rLu = LC.motor.calcularItem(x, p);
    near(rLu.custoLiquido, rRtc.custo26.liquido, 0.01, 'custo líquido: Lucratividade = RTC');
  });

  test('Integração · produto duplicado no RTC é um produto novo (sem vínculo)', function () {
    var it = RTC.model.novoItem(); it.sync = 'sync_x'; it.origemModulo = 'lucro';
    var c = RTC.model.duplicarItem(it);
    ok(!c.sync && !c.origemModulo, 'cópia sem vínculo');
  });

  // ------------------------------------------------------------------ relatório da Lucratividade
  test('Relatório · dados da análise: totais, DRE da análise e DRE de cada item', function () {
    var lu = dadosLucro();
    var emp = lu.empresas[0], an = lu.analises[0];
    an.itens = an.itens.slice(0, 1);
    var b = LC.modelo.novoItem(an);
    b.codigo = 'B2'; b.descricao = 'Segundo item'; b.quantidade = 4;
    b.compra.valorMercadoria = 400; b.compra.icmsDestacado = 48;
    b.trib = { icmsSt: false, aliqIcms: 20, reducaoBcIcms: 0, regimePisCofins: 'NORMAL', dasAliquota: null };
    b.venda.precoVenda = 150; b.venda.comissao = 0; b.venda.taxaCartao = 0;
    an.itens.push(b);
    var p = Nexus.store.merge(LC.motor.parametrosPadrao(), emp.params); p.regime = 'REAL'; p.uf = 'CE';
    var dd = LC.relatorio.dados({ empresa: emp, analise: an, params: p, emitidoEm: '2026-11-16T12:00:00.000Z' });
    eq(dd.itens.length, 2); eq(dd.dreItens.length, 2);
    var somaLucro = dd.itens.reduce(function (s, x) { return s + x.lucroTotal; }, 0);
    near(dd.resumo.lucro, somaLucro, 1e-9);
    function linha(id) { return dd.dre.filter(function (l) { return l.id === id; })[0]; }
    near(linha('rb').total, 1189.41 * 10 + 150 * 4, 1e-6, 'receita bruta = Σ preço × quantidade');
    near(linha('ll').total, somaLucro, 1e-6, 'DRE da análise fecha no lucro total');
    near(linha('rl').total + linha('cmv').total, linha('lb').total, 1e-6);
    eq(linha('rb').av, 1);
    ok(/2010/.test(dd.dreItens[0].titulo));
    eq(LC.relatorio.dados({ empresa: emp, analise: an, params: p, incluirDre: false }).dreItens.length, 0, 'sem a DRE de cada item');
    var blob = LC.relatorio.planilha(dd);
    ok(blob && blob.size > 2000, 'Excel gerado');
    ok(/Lucratividade_comercial-teste-ltda_nf-366423_2026-11-16\.pdf/.test(LC.relatorio.nomeArquivo(dd, 'pdf')) || /\.pdf$/.test(LC.relatorio.nomeArquivo(dd, 'pdf')));
    // Presumido com IRPJ/CSLL: resultado antes deles − IRPJ/CSLL = lucro líquido
    var pp = Object.assign({}, p, { regime: 'PRESUMIDO', considerarIrpjCsll: true });
    var dp = LC.relatorio.dados({ empresa: emp, analise: an, params: pp });
    function lp(id) { return dp.dre.filter(function (l) { return l.id === id; })[0]; }
    near(lp('antesIr').total + lp('ir').total, lp('ll').total, 1e-6);
    near(lp('ll').total, dp.resumo.lucro, 1e-6);
  });
})();
