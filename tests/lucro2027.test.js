/* Testes do cenário 2027 da Lucratividade por Item: CBS e IBS (LC 214/2025) com as regras do RTC Comparativo */
(function () {
  'use strict';
  var test = T.test, ok = T.ok, eq = T.eq, near = T.near;
  var LC = Nexus.lucro, M = LC.motor, I = Nexus.integracao, RTC = Nexus.rtc;

  function itemA100(mod) {
    var it = {
      id: 'a100', codigo: 'A100', descricao: 'Torneira metal', ncm: '84818019', quantidade: 10,
      compra: { valorMercadoria: 1000, descontoCompra: 0, frete: 50, icmsFrete: 6, ipi: 50, seguroOutros: 10, icmsDestacado: 120, daeValor: 80, daeCodigo: '1023', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true },
      trib: { icmsSt: false, aliqIcms: 20, reducaoBcIcms: 0, regimePisCofins: 'NORMAL', dasAliquota: null },
      venda: { modo: 'PRECO_INFORMADO', precoVenda: 180, descontoTipo: 'pct', desconto: 2, comissao: 3, taxaCartao: 2.5, markup: null }
    };
    if (mod) mod(it);
    return it;
  }
  /** Parâmetros de 2027 com as alíquotas fixadas: CBS 8,8% − 0,1 p.p. = 8,7%; IBS 0,05% + 0,05% = 0,1% */
  function p27(regime, mod) {
    var p = M.parametrosPadrao();
    p.regime = regime; p.uf = 'CE'; p.margemAlvo = 20; p.cenario = '2027';
    p.ref2027 = { cbs: 8.7, ibs: 0.1, cbsRef: 8.8, reducao: 0.1, ibsUf: 0.05, ibsMun: 0.05, status: 'estimado' };
    if (mod) mod(p);
    return p;
  }
  function linha(r, id) { return r.cascata.filter(function (x) { return x.id === id; })[0]; }
  function fora(r, id) { return r.fora.filter(function (x) { return x.id === id; })[0]; }

  test('Lucratividade 2027 · alíquotas vêm dos Parâmetros do RTC (referência − 0,1 p.p.; IBS 0,05% + 0,05%)', function () {
    var ref = M.referencia2027();
    var v = RTC.params.valores();
    near(ref.cbs, v.cbsRef2027 - v.cbsReducao2027, 1e-12, 'CBS de 2027');
    near(ref.ibs, v.ibsUf2027 + v.ibsMun2027, 1e-12, 'IBS de 2027');
    near(M.aliquotas2027(p27('REAL'), { cbsIbs: { regime: 'REDUCAO', reducao: 60 } }).cbs, 0.087 * 0.4, 1e-12, 'redução de 60% proporcional (art. 347, § 1º)');
    eq(M.aliquotas2027(p27('REAL'), { cbsIbs: { regime: 'ALIQ_ZERO' } }).cbs + M.aliquotas2027(p27('REAL'), { cbsIbs: { regime: 'ISENTO' } }).ibs, 0, 'alíquota zero e isenção');
  });

  test('Lucratividade 2027 · compra no Lucro Real: CBS e IBS por fora com crédito integral, sem PIS/Cofins e IPI zero (CL 934,00)', function () {
    var c = M.calcularCompra(itemA100(), p27('REAL'));
    near(c.composicao.valorOperacao, 1010, 1e-9, 'valor da operação: mercadoria + seguro (o frete com CT-e é fora da NF)');
    near(c.baseCbsIbs, 890, 1e-9, 'base: 1.010 − 120 de ICMS destacado (art. 12, § 2º, V)');
    near(c.cbsEntrada, 77.43, 1e-9, 'CBS 8,7%'); near(c.ibsEntrada, 0.89, 1e-9, 'IBS 0,1%');
    near(c.composicao.ipi, 0, 1e-12, 'IPI zero em 2027'); ok(/zero/.test(c.motivoIpi), 'motivo do IPI');
    near(c.custoBruto, 1218.32, 1e-9, 'custo bruto com CBS e IBS e sem IPI');
    near(c.creditoIcms, 206, 1e-9, 'ICMS: 120 + 6 do CT-e + 80 do DAE 1023');
    near(c.creditoPisCofins, 0, 1e-12, 'PIS/Cofins extintos'); ok(/2027/.test(c.motivoPisCofins));
    near(c.creditoCbsIbs, 78.32, 1e-9, 'crédito de CBS e IBS (art. 47)');
    near(c.custoLiquido, 934.00, 1e-9, '2026 era 902,60: + 81,40 de PIS/Cofins que não voltam − 50 de IPI');
    var ipiZfm = M.calcularCompra(itemA100(), p27('REAL', function (p) { p.manterIpi2027 = true; }));
    near(ipiZfm.custoLiquido, 984.00, 1e-9, 'IPI mantido (Zona Franca de Manaus) volta ao custo');
  });

  test('Lucratividade 2027 · venda: ICMS com CBS e IBS na base, CBS e IBS por fora e despesas sobre o total', function () {
    var r = M.calcularItem(itemA100(), p27('REAL'));
    var t = 0.20, k = 0.088, aIcms = t * (1 + k) / (1 + t * k);
    near(linha(r, 'icms').aliq, aIcms, 1e-12, 'ICMS = PLD × t(1 + k) ÷ (1 + t·k)');
    var icms = -linha(r, 'icms').valor, cbs = fora(r, 'cbs').valor, ibs = fora(r, 'ibs').valor;
    near(icms, 0.20 * (r.pld + cbs + ibs), 1e-9, 'ICMS = 20% × (PLD + CBS + IBS)');
    near(cbs, 0.087 * (r.pld - icms), 1e-9, 'CBS sobre (PLD − ICMS)');
    near(ibs, 0.001 * (r.pld - icms), 1e-9, 'IBS sobre (PLD − ICMS)');
    near(r.totalCliente, 188.60377, 1e-5, 'cliente paga PLD + CBS + IBS');
    ok(!linha(r, 'pis') && !linha(r, 'cofins') && !linha(r, 'cbs'), 'sem PIS/Cofins; CBS fora das deduções');
    near(r.sigma, aIcms + 0.055 * (1 + k * (1 - aIcms)), 1e-12, 'Σ = ICMS + (comissão + cartão) × (1 + CBS + IBS)');
    near(r.lucroTotal, 349.06038, 1e-4, 'lucro do item em 2027');
    near(r.margem * 100, 19.788, 0.001, 'margem sobre o PLD');
    var dre = M.dre(r);
    near(dre[0].valor, 180, 1e-9, 'receita bruta = preço da mercadoria (CBS e IBS fora: DL 1.598/1977, art. 12, § 4º)');
    ok(!dre.some(function (l) { return /CBS|IBS/.test(l.nome); }), 'CBS e IBS fora da DRE');
    // premissas desligadas: ICMS sem CBS/IBS na base e despesas sobre o PLD
    var s = M.calcularItem(itemA100(), p27('REAL', function (p) { p.ibsCbsNaBaseIcms = false; p.despesasSobreTotal = false; }));
    near(s.sigma, 0.255, 1e-12, 'Σ = 20% + 5,5%');
    near(s.lucroTotal, 380.18, 1e-6);
  });

  test('Lucratividade 2027 · Presumido credita CBS e IBS; Simples não credita e tem tudo no DAS', function () {
    var lp = M.calcularItem(itemA100(), p27('PRESUMIDO', function (p) { p.considerarIrpjCsll = true; }));
    near(lp.creditoCbsIbs, 78.32, 1e-9, 'regime regular: crédito de CBS e IBS também no Presumido');
    near(lp.custoLiquido, 934.00, 1e-9);
    near(linha(lp, 'irpj').aliq, 0.08 * 0.15, 1e-12, 'IRPJ presumido sobre o PLD'); ok(/1\.598/.test(linha(lp, 'irpj').fund), 'CBS e IBS fora da receita bruta');
    var sn = M.calcularItem(itemA100(function (x) { x.trib.dasAliquota = 8.5; }), p27('SIMPLES'));
    near(sn.custoBruto, 1218.32, 1e-9, 'Simples paga CBS e IBS na compra');
    near(sn.creditoCbsIbs + sn.creditoIcms + sn.creditoPisCofins, 0, 1e-12, 'sem créditos (art. 47, § 9º)');
    near(sn.custoLiquido, 1218.32, 1e-9);
    eq(sn.fora.length, 0, 'CBS e IBS da venda dentro do DAS');
    near(sn.sigma, 0.085 + 0.055, 1e-12, 'DAS + comissão + cartão');
  });

  test('Lucratividade 2027 · tratamento do item: alíquota zero, redução de 60% e ICMS-ST', function () {
    var zero = M.calcularItem(itemA100(function (x) { x.cbsIbs = { regime: 'ALIQ_ZERO' }; }), p27('REAL'));
    near(zero.compra.cbsEntrada + zero.compra.ibsEntrada, 0, 1e-12, 'sem CBS e IBS na compra');
    near(zero.tributosFora, 0, 1e-12, 'sem CBS e IBS na venda');
    near(linha(zero, 'icms').aliq, 0.20, 1e-12, 'ICMS sem acréscimo de base (k = 0)');
    var red = M.calcularCompra(itemA100(function (x) { x.cbsIbs = { regime: 'REDUCAO', reducao: 60 }; }), p27('REAL'));
    near(red.cbsEntrada, 890 * 0.087 * 0.4, 1e-9, 'CBS com redução de 60%');
    var st = M.calcularItem(itemA100(function (x) { x.compra.daeCodigo = '1031'; x.trib.icmsSt = true; }), p27('REAL'));
    near(st.creditoIcms, 0, 1e-12, 'ICMS-ST: sem crédito de ICMS');
    ok(!linha(st, 'icms'), 'sem ICMS na venda (linha zerada fica fora da cascata)');
    near(fora(st, 'cbs').valor, 0.087 * st.pld, 1e-9, 'CBS sobre o PLD inteiro');
  });

  test('Lucratividade 2027 · mesmo custo líquido de 2027 no RTC Comparativo (A100 e MS 162)', function () {
    var emp = LC.modelo.novaEmpresa();
    emp.razaoSocial = 'Comercial Teste 2027 Ltda'; emp.cnpj = '11.222.333/0001-81'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = LC.modelo.novaAnalise(emp, 'NF 2027');
    var a = itemA100(); a.id = null; a.sync = null;
    var ms = itemA100(function (x) {
      x.codigo = '2010'; x.descricao = 'MS 162 MOTOSSERRA,61PMM3'; x.ncm = '84678100';
      x.compra = { valorMercadoria: 7461.09, descontoCompra: 0, frete: 453.61, icmsFrete: 0, ipi: 387.98, seguroOutros: 0, icmsDestacado: 316.59, daeValor: 132.84, daeCodigo: '1023', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true };
      x.trib.aliqIcms = 5.6; x.venda.precoVenda = 1189.41;
    });
    [a, ms].forEach(function (x) { var it = LC.modelo.novoItem(an); Object.assign(it, x, { id: it.id }); an.itens.push(it); });
    var lu = { versao: 1, cenario: '2027', empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    var rt = { empresas: [], simulacoes: [], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} };
    eq(I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' }).novos, 2);
    var p = Object.assign(N(emp.params), { regime: 'REAL', uf: 'CE', cenario: '2027', ref2027: M.referencia2027() });
    var esperado = [934.00, 7598.11];
    rt.simulacoes[0].itens.forEach(function (prod, i) {
      var rr = RTC.engine.calcular(rt.empresas[0], prod, {});
      ok(rr.custo27, 'RTC calcula 2027: ' + JSON.stringify(rr.erros));
      var lc = M.calcularItem(an.itens[i], p);
      near(lc.custoLiquido, esperado[i], 0.005, an.itens[i].codigo + ' na Lucratividade');
      near(rr.custo27.liquido, lc.custoLiquido, 0.02, an.itens[i].codigo + ': RTC ' + rr.custo27.liquido + ' × Lucratividade ' + lc.custoLiquido);
    });
    function N(x) { return Nexus.store.merge(M.parametrosPadrao(), x || {}); }
  });

  test('Lucratividade 2027 · planilha: coluna "CBS e IBS do item (2027)" com lista', function () {
    var Imp = LC.importar;
    var cols = Imp.COLUNAS_MODELO.map(function (c) { return c.rotulo + (c.obrig ? ' *' : ''); });
    var col = Imp.COLUNAS_MODELO[20];
    eq(col.id, 'cbsIbsItem'); eq(col.lista.join(','), 'Normal,Redução de 30%,Redução de 60%,Alíquota zero,Isento');
    var csv = cols.join(';') + '\n' +
      'A1;Arroz;10063021;10;100,00;;;;;;12,00;;;;;;;;;;Alíquota zero\n' +
      'B2;Remédio;30049099;5;200,00;;;;;;24,00;;;;;;;;;;Redução de 60%\n' +
      'C3;Torneira;84818019;1;50,00;;;;;;6,00;;;;;;;;;;\n' +
      'D4;Erro;84818019;1;50,00;;;;;;6,00;;;;;;;;;;Talvez\n';
    var r = Imp.processar([Nexus.xlsx.lerCsv(csv).abas[0]], []);
    eq(r.compra.itens.length, 3, 'linha com valor fora da lista bloqueada');
    ok(/CBS e IBS do item/.test(r.compra.erros[0].msg), r.compra.erros[0].msg);
    eq(r.compra.itens[0].cbsIbs.regime, 'ALIQ_ZERO');
    eq(r.compra.itens[1].cbsIbs.regime, 'REDUCAO'); near(r.compra.itens[1].cbsIbs.reducao, 60, 1e-12);
    ok(!r.compra.itens[2].cbsIbs, 'vazio: segue o padrão (Normal)');
    eq(r.compra.comCbsIbs, 2);
  });

  /** Modo 4: preço de hoje (com PIS e Cofins) = 180 */
  function vendaSemPc(mod) {
    return function (it) {
      it.venda = { modo: 'PRECO_SEM_PIS_COFINS', precoAtual: 180, precoVenda: null, descontoTipo: 'pct', desconto: 2, comissao: 3, taxaCartao: 2.5, markup: null };
      if (mod) mod(it);
    };
  }

  test('Lucratividade · preço sem PIS/Cofins: em 2027 sai do preço de hoje o PIS e a Cofins de 2026 (Lucro Real 180,00 → 166,68)', function () {
    var r = M.calcularItem(itemA100(vendaSemPc()), p27('REAL'));
    var f = (0.0165 + 0.076) * (1 - 0.20);
    near(r.pv, 180 * (1 - f), 1e-9, 'PV = preço de hoje × (1 − 9,25% × (1 − ICMS 20%)) = 166,68');
    near(r.descontaminacao.retiradoPreco, 13.32, 1e-9);
    ok(r.descontaminacao.aplicada, 'aplicada no cenário 2027');
    // o valor retirado é exatamente o PIS e a Cofins que o preço de hoje paga em 2026 (Tema 69)
    var p26 = M.parametrosPadrao(); p26.regime = 'REAL'; p26.uf = 'CE'; p26.margemAlvo = 20;
    var hoje = M.calcularItem(itemA100(), p26);
    near(hoje.pv, 180, 1e-12);
    near(-(linha(hoje, 'pis').valor + linha(hoje, 'cofins').valor), r.descontaminacao.retiradoPld, 1e-9, 'PIS + Cofins de 2026 sobre o mesmo PLD');
    near(hoje.pld - r.pld, r.descontaminacao.retiradoPld, 1e-9, 'o PLD cai exatamente o valor retirado');
    ok(r.fora.length === 2 && r.totalCliente > r.pld, 'a CBS e o IBS entram por fora sobre o novo preço');
    // desconto em R$: o PIS e a Cofins saem do PLD (180 − 10) e o desconto fica igual
    var dv = M.calcularItem(itemA100(vendaSemPc(function (it) { it.venda.descontoTipo = 'valor'; it.venda.desconto = 10; })), p27('REAL'));
    near(dv.pv, 180 - 170 * f, 1e-9, 'PV 167,42'); near(dv.pld, 170 - 170 * f, 1e-9);
  });

  test('Lucratividade · preço sem PIS/Cofins: 2026, Presumido, Simples, monofásico, ST e sem preço', function () {
    var p26 = M.parametrosPadrao(); p26.regime = 'REAL'; p26.uf = 'CE';
    var r26 = M.calcularItem(itemA100(vendaSemPc()), p26);
    near(r26.pv, 180, 1e-12, '2026: o preço de hoje vale como está'); ok(!r26.descontaminacao.aplicada);
    near(M.calculadora(itemA100(), p26).fracaoPisCofins, 0.074, 1e-12, 'a tela mostra quanto sairia em 2027');
    near(M.calcularItem(itemA100(vendaSemPc()), p27('PRESUMIDO')).pv, 180 * (1 - 0.0365 * 0.8), 1e-9, 'Presumido: 3,65% × (1 − ICMS) = 174,74');
    near(M.calcularItem(itemA100(vendaSemPc()), p27('SIMPLES', function (p) { p.dasAliquotaEfetiva = 8; })).pv, 180, 1e-12, 'Simples: PIS e Cofins dentro do DAS');
    near(M.calcularItem(itemA100(vendaSemPc(function (it) { it.trib.regimePisCofins = 'MONOFASICO'; })), p27('REAL')).pv, 180, 1e-12, 'monofásico: nada a retirar');
    near(M.calcularItem(itemA100(vendaSemPc(function (it) { it.trib.icmsSt = true; })), p27('REAL')).pv, 180 * (1 - 0.0925), 1e-9, 'ST: sem ICMS na venda, a base é o preço inteiro');
    ok(/preço atual/.test(M.calcularItem(itemA100(vendaSemPc(function (it) { it.venda.precoAtual = null; })), p27('REAL')).erro), 'sem o preço de hoje: pede o preço');
    // integração: o RTC recebe o preço de hoje (2026) e calcula o de 2027 pelas próprias regras
    var emp = LC.modelo.novaEmpresa();
    emp.razaoSocial = 'Comercial Teste Ltda'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = LC.modelo.novaAnalise(emp, 'NF');
    var it = LC.modelo.novoItem(an), base = itemA100(vendaSemPc());
    ['codigo', 'descricao', 'ncm', 'quantidade', 'compra', 'trib', 'venda'].forEach(function (k) { it[k] = base[k]; });
    an.itens.push(it);
    var lu = { versao: 1, empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    var rt = { empresas: [], simulacoes: [], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} };
    I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' });
    near(rt.simulacoes[0].itens[0].venda.precoUnitarioAtual, 180, 1e-9, 'preço de hoje vai para o RTC');
  });

  test('Lucratividade 2027 · cenário 2026 continua igual (A100: lucro 281,04)', function () {
    var p = M.parametrosPadrao(); p.regime = 'REAL'; p.uf = 'CE'; p.margemAlvo = 20;
    var r = M.calcularItem(itemA100(), p);
    near(r.lucroTotal, 281.04, 0.01); eq(r.fora.length, 0); near(r.totalCliente, r.pld, 1e-12, 'sem tributos por fora');
  });
})();
