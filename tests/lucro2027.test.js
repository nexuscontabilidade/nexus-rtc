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

  test('Lucratividade 2027 · compra no Lucro Real: CBS e IBS por fora com crédito integral, ICMS da nota com CBS e IBS na base, IPI zero (CL 924,79)', function () {
    var c = M.calcularCompra(itemA100(), p27('REAL'));
    near(c.composicao.valorOperacao, 1010, 1e-9, 'valor da operação: mercadoria + seguro (o frete com CT-e é fora da NF)');
    // ICMS da nota: alíquota efetiva 120 ÷ 1.010 sobre (Vop + CBS + IBS) ⇒ ICMS = t·Vop(1 + k) ÷ (1 + t·k)
    var t = 120 / 1010, k = 0.088, icms27 = t * 1010 * (1 + k) / (1 + t * k);
    near(c.composicao.icmsDestacado, icms27, 1e-9, 'ICMS de 2027 = 129,21'); near(c.composicao.icmsNota, 120, 1e-12); ok(c.composicao.icmsRecalculado2027);
    near(icms27, t * (1010 + c.cbsEntrada + c.ibsEntrada), 1e-9, 'ICMS = alíquota × (Vop + CBS + IBS)');
    near(c.baseCbsIbs, 1010 - icms27, 1e-9, 'base da CBS e do IBS sem o ICMS (art. 12, § 2º, V) = 880,79');
    near(c.cbsEntrada, 0.087 * (1010 - icms27), 1e-9, 'CBS 8,7%'); near(c.ibsEntrada, 0.001 * (1010 - icms27), 1e-9, 'IBS 0,1%');
    near(c.composicao.ipi, 0, 1e-12, 'IPI zero em 2027'); ok(/zero/.test(c.motivoIpi), 'motivo do IPI');
    near(c.custoBruto, 1217.5096, 1e-4, 'custo bruto com CBS e IBS e sem IPI');
    near(c.creditoIcms, icms27 + 86, 1e-9, 'ICMS: 129,21 + 6 do CT-e + 80 do DAE 1023');
    near(c.creditoPisCofins, 0, 1e-12, 'PIS/Cofins extintos'); ok(/2027/.test(c.motivoPisCofins));
    near(c.creditoCbsIbs, c.cbsEntrada + c.ibsEntrada, 1e-12, 'crédito de CBS e IBS (art. 47)');
    near(c.custoLiquido, 924.79094, 1e-5, 'CL = 1.054 − ICMS de 2027');
    var ipiZfm = M.calcularCompra(itemA100(), p27('REAL', function (p) { p.manterIpi2027 = true; }));
    near(ipiZfm.custoLiquido, 974.79094, 1e-5, 'IPI mantido (Zona Franca de Manaus) volta ao custo');
    // premissa desligada: o ICMS da nota fica como está (120)
    var sem = M.calcularCompra(itemA100(), p27('REAL', function (p) { p.ibsCbsNaBaseIcms = false; }));
    near(sem.composicao.icmsDestacado, 120, 1e-12); near(sem.baseCbsIbs, 890, 1e-9); near(sem.custoLiquido, 934.00, 1e-9);
    // a liminar é da empresa (venda): não muda o ICMS da nota do fornecedor
    near(M.calcularCompra(itemA100(), p27('REAL', function (p) { p.liminarCbsForaBaseIcms = true; })).custoLiquido, c.custoLiquido, 1e-12);
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
    near(r.lucroTotal, 358.26944, 1e-4, 'lucro do item em 2027');
    near(r.margem * 100, 20.310, 0.001, 'margem sobre o PLD');
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
    near(lp.creditoCbsIbs, 77.5096, 1e-4, 'regime regular: crédito de CBS e IBS também no Presumido');
    near(lp.custoLiquido, 924.79094, 1e-5);
    near(linha(lp, 'irpj').aliq, 0.08 * 0.15, 1e-12, 'IRPJ presumido sobre o PLD'); ok(/1\.598/.test(linha(lp, 'irpj').fund), 'CBS e IBS fora da receita bruta');
    var sn = M.calcularItem(itemA100(function (x) { x.trib.dasAliquota = 8.5; }), p27('SIMPLES'));
    near(sn.custoBruto, 1217.5096, 1e-4, 'Simples paga CBS e IBS na compra');
    near(sn.creditoCbsIbs + sn.creditoIcms + sn.creditoPisCofins, 0, 1e-12, 'sem créditos (art. 47, § 9º)');
    near(sn.custoLiquido, sn.custoBruto, 1e-9);
    eq(sn.fora.length, 0, 'CBS e IBS da venda dentro do DAS');
    near(sn.sigma, 0.085 + 0.055, 1e-12, 'DAS + comissão + cartão');
  });

  test('Lucratividade 2027 · tratamento do item: alíquota zero, redução de 60% e ICMS-ST', function () {
    var zero = M.calcularItem(itemA100(function (x) { x.cbsIbs = { regime: 'ALIQ_ZERO' }; }), p27('REAL'));
    near(zero.compra.cbsEntrada + zero.compra.ibsEntrada, 0, 1e-12, 'sem CBS e IBS na compra');
    near(zero.tributosFora, 0, 1e-12, 'sem CBS e IBS na venda');
    near(linha(zero, 'icms').aliq, 0.20, 1e-12, 'ICMS sem acréscimo de base (k = 0)');
    var red = M.calcularCompra(itemA100(function (x) { x.cbsIbs = { regime: 'REDUCAO', reducao: 60 }; }), p27('REAL'));
    near(red.cbsEntrada, red.baseCbsIbs * 0.087 * 0.4, 1e-9, 'CBS com redução de 60%');
    near(red.baseCbsIbs, 886.29336, 1e-5, 'ICMS da nota com a CBS e o IBS reduzidos na base');
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
    var esperado = [924.79094, 7571.45830]; // 1.054 − 129,21 e 7.914,70 − 343,24 (ICMS da nota com CBS e IBS na base)
    rt.simulacoes[0].itens.forEach(function (prod, i) {
      var rr = RTC.engine.calcular(rt.empresas[0], prod, {});
      ok(rr.custo27, 'RTC calcula 2027: ' + JSON.stringify(rr.erros));
      var lc = M.calcularItem(an.itens[i], p);
      near(lc.custoLiquido, esperado[i], 0.00001, an.itens[i].codigo + ' na Lucratividade');
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

  test('Lucratividade 2027 · liminar: CBS fora da base do ICMS da venda (o IBS continua)', function () {
    var r = M.calcularItem(itemA100(), p27('REAL', function (p) { p.liminarCbsForaBaseIcms = true; }));
    var t = 0.20, i = 0.001, aIcms = t * (1 + i) / (1 + t * i);
    near(linha(r, 'icms').aliq, aIcms, 1e-12, 'ICMS = PLD × t(1 + i) ÷ (1 + t·i)');
    var icms = -linha(r, 'icms').valor, cbs = fora(r, 'cbs').valor, ibs = fora(r, 'ibs').valor;
    near(icms, 0.20 * (r.pld + ibs), 1e-9, 'ICMS = 20% × (PLD + IBS), sem a CBS');
    near(cbs, 0.087 * (r.pld - icms), 1e-9, 'CBS continua sobre (PLD − ICMS)');
    ok(/liminar/.test(linha(r, 'icms').formula) && /liminar/.test(linha(r, 'icms').fund), 'fórmula e fundamento citam a liminar');
    var sem = M.calcularItem(itemA100(), p27('REAL'));
    ok(r.lucroTotal > sem.lucroTotal, 'ICMS menor: lucro maior com a liminar');
    // sem a premissa da SEFAZ, a liminar não muda nada (CBS e IBS já fora da base)
    var desl = M.calcularItem(itemA100(), p27('REAL', function (p) { p.ibsCbsNaBaseIcms = false; p.liminarCbsForaBaseIcms = true; }));
    near(linha(desl, 'icms').aliq, 0.20, 1e-12);
    // o RTC aplica a mesma regra
    var E = RTC.engine, emp = RTC.model.novaEmpresa(); emp.razaoSocial = 'Teste'; emp.regime = 'LR'; emp.uf = 'CE'; emp.real.lucroAnual = 1000000;
    var sim = RTC.model.novoItem(emp);
    sim.produto.ncm = '12345678'; sim.produto.quantidade = 10; sim.valores.valorUnitario = 100;
    sim.perfil.icms.aliqEntradaAuto = false; sim.perfil.icms.aliqEntrada = 12; sim.perfil.icms.aliqSaidaAuto = false; sim.perfil.icms.aliqSaida = 18;
    sim.venda.margem = 20; sim.premissas.liminarCbsForaBaseIcms2027 = true;
    var rr = E.calcular(emp, sim, {});
    var l = rr.a1.v27.linhas.filter(function (x) { return x.id === 'icms'; })[0];
    var ib = rr.a1.v27.linhas.filter(function (x) { return x.id === 'ibs'; })[0];
    near(l.valor, 0.18 * (rr.a1.v27.X + ib.valor), 0.011, 'RTC: ICMS = 18% × (X + IBS)');
    ok(/liminar/.test(l.formula), 'RTC: fórmula cita a liminar');
  });

  test('Lucratividade 2027 · ICMS e ISS fora da base da CBS e do IBS (art. 12, § 2º, V)', function () {
    var r = M.calcularItem(itemA100(), p27('REAL'));
    var icms = -linha(r, 'icms').valor;
    near(fora(r, 'cbs').valor + fora(r, 'ibs').valor, 0.088 * (r.pld - icms), 1e-9, 'venda: (PLD − ICMS) × 8,8%');
    ok(/12, § 2º, V/.test(fora(r, 'cbs').fund), 'fundamento da base');
    ok(/ICMS, ISS/.test(RTC.legal.get('lc214_a12_p2_v').resumo), 'a regra (2026 a 2032) tira o ICMS e o ISS da base');
    var c = M.calcularCompra(itemA100(), p27('REAL'));
    near(c.baseCbsIbs, c.composicao.valorOperacao - c.composicao.icmsDestacado, 1e-9, 'compra: (Vop − ICMS)');
  });

  test('Lucratividade 2027 · nota de 2027: ICMS, CBS e IBS destacados prevalecem sobre a projeção', function () {
    // A100 com a nota de 2027: ICMS 130 (calculado pelo fornecedor), CBS 80 e IBS 1 destacados
    var nf = itemA100(function (x) { x.compra.icmsDestacado = 130; x.compra.cbsDestacada = 80; x.compra.ibsDestacado = 1; });
    var c = M.calcularCompra(nf, p27('REAL'));
    eq(c.dados2027, 'nf', 'dados da nota de 2027');
    near(c.composicao.icmsDestacado, 130, 1e-12, 'ICMS da nota, sem recálculo'); ok(!c.composicao.icmsRecalculado2027);
    near(c.cbsEntrada, 80, 1e-12); near(c.ibsEntrada, 1, 1e-12);
    near(c.custoBruto, 1000 + 50 + 10 + 80 + 81, 1e-9, 'mercadoria + frete + seguro + DAE + CBS e IBS da nota (IPI zero)');
    near(c.creditoIcms, 130 + 6 + 80, 1e-12); near(c.creditoCbsIbs, 81, 1e-12, 'crédito do destacado (art. 47)');
    near(c.custoLiquido, 924, 1e-9);
    var proj = M.calcularCompra(itemA100(), p27('REAL'));
    eq(proj.dados2027, 'projetado', 'sem CBS e IBS destacados: dados de 2026, projetados');
    var soCbs = M.calcularCompra(itemA100(function (x) { x.compra.cbsDestacada = 77; }), p27('REAL'));
    eq(soCbs.dados2027, 'nf'); near(soCbs.ibsEntrada, 0, 1e-12, 'IBS em branco com CBS informada: zero');
    eq(M.calcularCompra(nf, (function () { var p = M.parametrosPadrao(); p.regime = 'REAL'; p.uf = 'CE'; return p; })()).dados2027, null, 'em 2026 não se aplica');
    var sn = M.calcularCompra(nf, p27('SIMPLES'));
    near(sn.creditoCbsIbs + sn.creditoIcms, 0, 1e-12, 'comprador do Simples: sem créditos'); near(sn.custoBruto, 1221, 1e-9);
  });

  test('Lucratividade · fornecedor do Simples Nacional: sem destaque por fora em 2027 e sem o sinal de dados de 2026', function () {
    var sn = function (mod) { return itemA100(function (x) { x.compra.fornecedorSimples = true; x.compra.icmsDestacado = 40; if (mod) mod(x); }); };
    var c = M.calcularCompra(sn(), p27('REAL'));
    eq(c.dados2027, 'simples', 'exceção: não é marcado como dados de 2026');
    near(c.cbsEntrada + c.ibsEntrada, 0, 1e-12, 'CBS e IBS dentro do DAS do fornecedor');
    near(c.composicao.icmsDestacado, 40, 1e-12, 'crédito de ICMS informado pelo optante, sem recálculo');
    near(c.creditoCbsIbs, 0, 1e-12); ok(/47, § 9º/.test(c.motivoCbsIbs), c.motivoCbsIbs);
    near(c.custoLiquido, 1000 + 50 + 10 + 80 - (40 + 6 + 80), 1e-9);
    var pago = M.calcularCompra(sn(function (x) { x.compra.cbsDestacada = 12; x.compra.ibsDestacado = 0.2; }), p27('REAL'));
    near(pago.creditoCbsIbs, 12.2, 1e-12, 'crédito do que o optante pagou no Simples (art. 47, § 9º)');
    near(pago.custoBruto, c.custoBruto, 1e-12, 'esses valores já estão no preço: não somam ao custo bruto');
    // 2026, Lucro Real: o optante não destaca o ICMS, então a base do crédito de PIS/Cofins não o desconta
    var p26 = M.parametrosPadrao(); p26.regime = 'REAL'; p26.uf = 'CE';
    near(M.calcularCompra(sn(), p26).basePisCofins, 1000, 1e-12, 'mercadoria − desconto, sem descontar o ICMS');
  });

  test('Lucratividade 2027 · planilha: fornecedor do Simples e CBS e IBS da nota de 2027', function () {
    var Imp = LC.importar;
    var cols = Imp.COLUNAS_MODELO.map(function (c) { return c.rotulo + (c.obrig ? ' *' : ''); });
    eq(cols.slice(21).join(' | '), 'Fornecedor do Simples Nacional | CBS destacada na NF-e 2027 (R$) | IBS destacado na NF-e 2027 (R$)');
    var csv = cols.join(';') + '\n' +
      'A1;Torneira;84818019;10;1000,00;;;;;;130,00;;;;;;;;;;;Não;80,00;1,00\n' +
      'B2;Cano;39172300;5;200,00;;;;;;8,00;;;;;;;;;;;Sim;;\n' +
      'C3;Parafuso;73181500;100;500,00;;;;;;60,00;;;;;;;;;;;;;\n';
    var r = Imp.processar([Nexus.xlsx.lerCsv(csv).abas[0]], []);
    eq(r.compra.itens.length, 3, JSON.stringify(r.compra.erros));
    var a = r.compra.itens[0].compra, b = r.compra.itens[1].compra, c = r.compra.itens[2].compra;
    near(a.cbsDestacada, 80, 1e-12); near(a.ibsDestacado, 1, 1e-12); eq(a.fornecedorSimples, false);
    eq(b.fornecedorSimples, true); ok(b.cbsDestacada === null && b.ibsDestacado === null);
    ok(c.cbsDestacada === null && !c.fornecedorSimples, 'vazio: dados de 2026');
    eq(r.compra.comNota2027, 1);
  });

  test('Integração · fornecedor do Simples vai para o RTC e volta', function () {
    var emp = LC.modelo.novaEmpresa();
    emp.razaoSocial = 'Comercial Simples Ltda'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = LC.modelo.novaAnalise(emp, 'NF optante');
    var it = LC.modelo.novoItem(an), base = itemA100(function (x) { x.compra.fornecedorSimples = true; x.compra.icmsDestacado = 40.4; x.compra.cbsDestacada = 10.1; });
    ['codigo', 'descricao', 'ncm', 'quantidade', 'compra', 'trib', 'venda'].forEach(function (k) { it[k] = base[k]; });
    an.itens.push(it);
    var lu = { versao: 1, empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    var rt = { empresas: [], simulacoes: [], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} };
    I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' });
    var f = rt.simulacoes[0].itens[0].fornecedor;
    eq(f.regime26, 'simples'); eq(f.regime27, 'simples');
    near(f.icmsSimplesPct, 4, 1e-9, '40,40 ÷ 1.010 = 4% de crédito de ICMS'); near(f.cbsSimplesPct, 1, 1e-9);
    var lu2 = { versao: 1, empresas: [], analises: [], syncExcluidos: [], ui: {} };
    I.sincronizar({ rtc: rt, lucro: lu2, para: 'lucro' });
    var volta = lu2.analises[0].itens[0].compra;
    eq(volta.fornecedorSimples, true); near(volta.icmsDestacado, 40.4, 1e-9, 'crédito de ICMS do optante');
  });

  test('Lucratividade · cada cenário guarda os próprios valores (2026 e 2027 independentes)', function () {
    var Mo = LC.modelo;
    var emp = Mo.novaEmpresa(); emp.razaoSocial = 'Teste'; emp.params.margemAlvo = 20;
    var an = Mo.novaAnalise(emp, 'NF');
    var it = Mo.novoItem(an); it.codigo = 'A1'; it.descricao = 'Torneira'; it.quantidade = 10; it.compra.valorMercadoria = 1000; it.venda.precoVenda = 180;
    an.itens.push(it);
    var d = { versao: 1, cenario: '2026', empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    var r = Mo.trocarCenario(d, '2027');
    eq(d.cenario, '2027'); eq(r.copiados, 3, 'empresa, análise e item começam com uma cópia de 2026');
    near(it.venda.precoVenda, 180, 1e-12, '2027 começa com os valores de 2026');
    // alterações em 2027
    it.venda.precoVenda = 200; it.compra.cbsDestacada = 80; emp.params.margemAlvo = 25; an.regime = 'PRESUMIDO'; it.descricao = 'Torneira metal';
    r = Mo.trocarCenario(d, '2026');
    eq(r.copiados, 0, '2026 já tinha os próprios valores');
    near(it.venda.precoVenda, 180, 1e-12, '2026 intacto: preço'); ok(it.compra.cbsDestacada == null, '2026 intacto: sem a nota de 2027');
    eq(emp.params.margemAlvo, 20, '2026 intacto: parâmetros'); eq(an.regime, null, '2026 intacto: regime da análise');
    eq(it.descricao, 'Torneira metal', 'identificação do produto é comum aos dois cenários');
    // alterações em 2026
    it.venda.precoVenda = 190; it.quantidade = 12;
    Mo.trocarCenario(d, '2027');
    near(it.venda.precoVenda, 200, 1e-12, '2027 intacto: preço'); eq(it.quantidade, 10); near(it.compra.cbsDestacada, 80, 1e-12);
    eq(emp.params.margemAlvo, 25); eq(an.regime, 'PRESUMIDO');
    // leitura de outro cenário sem trocar o ativo
    var v26 = Mo.noCenario(it, '2026', d.cenario, 'item');
    near(v26.venda.precoVenda, 190, 1e-12); eq(v26.quantidade, 12); near(it.venda.precoVenda, 200, 1e-12, 'o ativo não muda');
    ok(Mo.noCenario(it, '2027', d.cenario, 'item') === it, 'cenário ativo: o próprio objeto');
    // item criado em 2027 aparece em 2026 com uma cópia
    var novo = Mo.novoItem(an); novo.codigo = 'B2'; novo.venda.precoVenda = 50; an.itens.push(novo);
    Mo.trocarCenario(d, '2026');
    near(novo.venda.precoVenda, 50, 1e-12);
    eq(Mo.trocarCenario(d, '2026').copiados, 0, 'trocar para o mesmo cenário não faz nada');
    ok(JSON.parse(JSON.stringify(d)).analises[0].itens[0].porCenario['2027'], 'os valores do outro cenário ficam gravados com os dados');
  });

  test('Integração · com a Lucratividade em 2027, o RTC recebe a nota de 2026 e o tratamento de 2027', function () {
    var Mo = LC.modelo;
    var emp = Mo.novaEmpresa(); emp.razaoSocial = 'Comercial Cenários Ltda'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = Mo.novaAnalise(emp, 'NF cenários');
    var it = Mo.novoItem(an), base = itemA100();
    ['codigo', 'descricao', 'ncm', 'quantidade', 'compra', 'trib', 'venda'].forEach(function (k) { it[k] = base[k]; });
    an.itens.push(it);
    var lu = { versao: 1, cenario: '2026', empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    Mo.trocarCenario(lu, '2027');
    it.venda.precoVenda = 166.68; it.cbsIbs = { regime: 'REDUCAO', reducao: 60 }; emp.params.liminarCbsForaBaseIcms = true;
    var rt = { empresas: [], simulacoes: [], parametros: {}, aliquotasUF: {}, syncExcluidos: [], ui: {} };
    I.sincronizar({ rtc: rt, lucro: lu, para: 'rtc' });
    var prod = rt.simulacoes[0].itens[0];
    near(prod.venda.precoUnitarioAtual, 180, 1e-9, 'preço de 2026');
    eq(prod.perfil.cbsIbs.tratamento, 'reducao'); near(prod.perfil.cbsIbs.reducaoPct, 60, 1e-12, 'tratamento de 2027');
    eq(prod.premissas.liminarCbsForaBaseIcms2027, true, 'premissa de 2027');
    near(it.venda.precoVenda, 166.68, 1e-12, 'a cópia não mexe nos dados da Lucratividade');
  });

  test('Lucratividade 2027 · planilha de atualização: exporta os produtos, volta e atualiza só o cenário 2027', function () {
    var Mo = LC.modelo, Imp = LC.importar;
    var emp = Mo.novaEmpresa(); emp.razaoSocial = 'Teste'; emp.uf = 'CE'; emp.regime = 'REAL';
    var an = Mo.novaAnalise(emp, 'NF');
    function add(cod, desc, q, total, icms) { var it = Mo.novoItem(an); it.codigo = cod; it.descricao = desc; it.ncm = '84818019'; it.quantidade = q; it.compra.valorMercadoria = total; it.compra.icmsDestacado = icms; an.itens.push(it); return it; }
    var a = add('A1', 'Torneira', 10, 1000, 120), b = add('B2', 'Cano', 5, 200, 24), c = add('C3', 'Parafuso', 100, 500, 60), d = add('D4', 'Fita', 2, 30, 0);
    var dados = { versao: 1, cenario: '2026', empresas: [emp], analises: [an], syncExcluidos: [], ui: {} };
    var ids = Imp.ATUAL.map(function (x) { return x.id; });
    var iId = ids.indexOf('idControle'), iCod = ids.indexOf('codigo'), iDesc = ids.indexOf('descricao'), iQ = ids.indexOf('quantidade'), iU = ids.indexOf('valorUnitario'),
      iT = ids.indexOf('valorMercadoria'), iIcms = ids.indexOf('icmsDestacado'), iC = ids.indexOf('cbsDestacada'), iI = ids.indexOf('ibsDestacado');
    function csv(linhas) {
      function cel(v) { return v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); }
      return Imp.ATUAL.map(function (x) { return x.rotulo; }).join(';') + '\n' + linhas.map(function (l) { return l.map(cel).join(';'); }).join('\n') + '\n';
    }
    function plano(linhas) {
      var r = Imp.processar([Nexus.xlsx.lerCsv(csv(linhas)).abas[0]], an.itens);
      ok(r.atualizacao && !r.compra, 'reconhecida como planilha de atualização');
      return Imp.planejarAtualizacao(r.atualizacao, an.itens, dados.cenario);
    }
    // exporta (com a análise em 2026): os valores de 2026
    var linhas = Imp.linhasAtualizacao(an, dados.cenario);
    eq(linhas.length, 4); eq(linhas[0][iId], a.id); near(linhas[0][iU], 100, 1e-12); near(linhas[0][iT], 1000, 1e-12); ok(linhas[0][iC] === null, 'CBS em branco');
    // o cliente atualiza com as notas de 2027
    linhas[0][iC] = 80; linhas[0][iI] = 1; linhas[0][iIcms] = 130; linhas[0][iDesc] = 'Outro nome';
    linhas[1][iU] = 44;                    // só o unitário: total = 5 × 44
    linhas[2][iT] = 550;                   // só o total
    linhas[3][iU] = 20; linhas[3][iT] = 50; // os dois, sem bater: vale o unitário (2 × 20)
    var novo = linhas[1].slice(); novo[iId] = ''; novo[iCod] = 'E5'; novo[iDesc] = 'Produto novo'; novo[iQ] = 3; novo[iU] = 10; novo[iT] = null;
    linhas.push(novo);
    var pl = plano(linhas);
    eq(pl.erros.length, 0, JSON.stringify(pl.erros)); eq(pl.atualizados, 4); eq(pl.novos, 1); eq(pl.comNota2027, 1);
    eq(pl.avisos.length, 1); ok(/unitário/.test(pl.avisos[0].msg), 'aviso: valeu o unitário');
    near(pl.linhas[1].novo.compra.valorMercadoria, 220, 1e-9); near(pl.linhas[2].novo.compra.valorMercadoria, 550, 1e-9);
    near(pl.linhas[3].novo.compra.valorMercadoria, 40, 1e-9); near(pl.linhas[4].novo.compra.valorMercadoria, 30, 1e-9, 'produto novo: 3 × 10');
    ok(pl.linhas[0].mudancas.indexOf('CBS') >= 0 && pl.linhas[0].mudancas.indexOf('ICMS') >= 0, pl.linhas[0].mudancas.join(', '));
    // grava como o botão "Gravar no cenário 2027" (com a análise aberta em 2026)
    pl.linhas.forEach(function (l) { if (l.item && l.mudancas.length) { var alvo = Mo.editarNoCenario(l.item, '2027', dados.cenario, 'item'); alvo.quantidade = l.novo.quantidade; alvo.compra = JSON.parse(JSON.stringify(l.novo.compra)); } });
    eq(dados.cenario, '2026', 'o cenário aberto não muda');
    near(a.compra.valorMercadoria, 1000, 1e-12, '2026 intacto'); near(a.compra.icmsDestacado, 120, 1e-12); ok(a.compra.cbsDestacada == null); near(b.compra.valorMercadoria, 200, 1e-12);
    eq(a.descricao, 'Torneira', 'identificação não é alterada pela planilha');
    Mo.trocarCenario(dados, '2027');
    near(a.compra.cbsDestacada, 80, 1e-12); near(a.compra.icmsDestacado, 130, 1e-12); near(b.compra.valorMercadoria, 220, 1e-12); near(d.compra.valorMercadoria, 40, 1e-12);
    eq(M.calcularCompra(a, p27('REAL')).dados2027, 'nf', 'com a CBS e o IBS: sai o sinal de dados de 2026'); eq(M.calcularCompra(b, p27('REAL')).dados2027, 'projetado');
    // nova exportação (agora em 2027) traz os valores já atualizados; sem o ID, a linha é ligada pelo código
    var l2 = Imp.linhasAtualizacao(an, dados.cenario);
    near(l2[0][iC], 80, 1e-12); near(l2[1][iT], 220, 1e-12);
    l2[1][iId] = '';
    var pl2 = plano(l2);
    eq(pl2.atualizados + pl2.novos, 0, 'sem mudanças'); eq(pl2.semMudanca, 4);
    Mo.trocarCenario(dados, '2026');
    near(b.compra.valorMercadoria, 200, 1e-12, '2026 continua intacto');
  });

  test('Lucratividade · cenário 2027 só com acesso ao RTC Comparativo', function () {
    var soLucro = { acessaModulo: function (id) { return id === 'lucro'; } };
    var comRtc = { acessaModulo: function (id) { return id === 'lucro' || id === 'rtc'; } };
    ok(!M.pode2027(soLucro), 'cliente só com a Lucratividade');
    eq(M.cenarioEfetivo('2027', soLucro), '2026', 'sem o RTC, um 2027 gravado volta para 2026');
    ok(M.pode2027(comRtc));
    eq(M.cenarioEfetivo('2027', comRtc), '2027', 'com o RTC (ou administrador), 2027 vale');
    eq(M.cenarioEfetivo('2027', null), '2027', 'sem o núcleo de acesso: liberado');
    eq(M.cenarioEfetivo('2026', comRtc), '2026');
    eq(M.cenarioEfetivo(undefined, comRtc), '2026', 'sem escolha: 2026');
    ok(/RTC Comparativo/.test(M.MSG_SEM_2027), 'aviso cita o módulo exigido');
  });

  test('Lucratividade 2027 · cenário 2026 continua igual (A100: lucro 281,04)', function () {
    var p = M.parametrosPadrao(); p.regime = 'REAL'; p.uf = 'CE'; p.margemAlvo = 20;
    var r = M.calcularItem(itemA100(), p);
    near(r.lucroTotal, 281.04, 0.01); eq(r.fora.length, 0); near(r.totalCliente, r.pld, 1e-12, 'sem tributos por fora');
  });
})();
