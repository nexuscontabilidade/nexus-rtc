/* Testes dos cenários tributários do motor RTC Comparativo */
(function () {
  'use strict';
  var test = T.test, ok = T.ok, eq = T.eq, near = T.near;
  var RTC = Nexus.rtc;
  var E = RTC.engine;

  /** Cenário base: empresa no CE, compra interna, ICMS entrada 12% e saída 18% informados manualmente. */
  function cenario(regime, mod) {
    var emp = RTC.model.novaEmpresa();
    emp.razaoSocial = 'Teste';
    emp.uf = 'CE';
    emp.regime = regime;
    emp.real.lucroAnual = 1000000;
    emp.presumido.receitaAnual = 2000000;
    emp.simples.anexo = 'I';
    emp.simples.rbt12 = 850000;
    var sim = RTC.model.novoItem(emp);
    sim.produto.ncm = '12345678';
    sim.produto.quantidade = 10;
    sim.valores.valorUnitario = 100; // total = 10 × 100 = R$ 1.000,00
    sim.perfil.icms.aliqEntradaAuto = false;
    sim.perfil.icms.aliqEntrada = 12;
    sim.perfil.icms.aliqSaidaAuto = false;
    sim.perfil.icms.aliqSaida = 18;
    sim.premissas.ibsCbsNaBaseIcms2027 = false;
    sim.venda.margem = 20;
    if (mod) mod(emp, sim);
    return { emp: emp, sim: sim };
  }
  function calc(c, opts) { return E.calcular(c.emp, c.sim, opts || {}); }
  function linha(res, id) { return res.linhas.filter(function (l) { return l.id === id; })[0]; }

  // ------------------------------------------------------------ Simples Nacional
  test('Simples: alíquota efetiva Anexo I, RBT12 R$ 850.000 (4ª faixa)', function () {
    var s = RTC.simples.calcular('I', 850000, 2026);
    eq(s.faixa, 4, 'faixa');
    near(s.efetiva, 8.0529412, 1e-6, 'efetiva');
    near(s.efetivaPorTributo.ICMS, 8.0529412 * 0.335, 1e-6, 'ICMS na partilha');
  });
  test('Simples: limites de faixa (R$ 180.000,00 e R$ 180.000,01)', function () {
    eq(RTC.simples.calcular('I', 180000, 2026).faixa, 1);
    near(RTC.simples.calcular('I', 180000, 2026).efetiva, 4, 1e-9);
    eq(RTC.simples.calcular('I', 180000.01, 2026).faixa, 2);
    near(RTC.simples.calcular('I', 180000.01, 2026).efetiva, 4, 1e-6, 'continuidade entre faixas');
  });
  test('Simples: RBT12 acima de R$ 4,8 mi gera erro', function () {
    ok(RTC.simples.calcular('I', 4800001, 2026).erro, 'deveria haver erro');
    var c = cenario('SN', function (e) { e.simples.rbt12 = 5000000; });
    var r = calc(c);
    ok(!r.ok && r.erros.some(function (x) { return /4\.800\.000/.test(x.msg); }), 'erro de limite');
  });
  test('Simples: acima do sublimite → 6ª faixa e ICMS fora do DAS', function () {
    var s = RTC.simples.calcular('I', 3700000, 2026);
    eq(s.faixa, 6);
    ok(s.acimaSublimite);
    near(s.efetiva, 325000 / 3700000 * 100, 1e-6);
    var r = calc(cenario('SN', function (e) { e.simples.rbt12 = 3700000; }));
    ok(r.ctx.icmsRegular, 'ICMS no regime normal');
    ok(r.custo26.cred.icms > 0, 'crédito de ICMS fora do DAS');
  });
  test('Simples: RBT12 zero usa alíquota nominal da 1ª faixa com aviso', function () {
    var s = RTC.simples.calcular('II', 0, 2026);
    eq(s.efetiva, 4.5);
    ok(s.avisos.length > 0);
  });
  test('Simples: segregação de receita monofásica exclui PIS/Cofins do DAS', function () {
    var r = calc(cenario('SN', function (e, s) { s.perfil.pisCofins.tratamento = 'monofasico'; }));
    var das = linha(r.a1.v26, 'das');
    near(das.aliq, 8.0529412 * (1 - 0.155), 1e-6);
  });
  test('Simples: ICMS-ST (substituído) exclui ICMS do DAS', function () {
    var r = calc(cenario('SN', function (e, s) { s.perfil.icms.tratamento = 'st'; s.perfil.st.modo = 'informado'; s.perfil.st.valorInformado = 100; }));
    near(linha(r.a1.v26, 'das').aliq, 8.0529412 * (1 - 0.335), 1e-6);
  });
  test('Simples 2027 com IBS/CBS fora do DAS: DAS reduzido e CBS por fora com crédito', function () {
    var r = calc(cenario('SN', function (e) { e.simples.ibsCbsForaDas2027 = true; }));
    near(linha(r.a1.v27, 'das').aliq, 8.0529412 * (1 - 0.155), 1e-6, 'DAS sem CBS/IBS');
    ok(linha(r.a1.v27, 'cbs').valor > 0, 'CBS por fora');
    ok(r.custo27.cred.cbs > 0, 'crédito de CBS na entrada');
  });
  test('Simples no DAS (2027): CBS do fornecedor regular vira custo (sem crédito)', function () {
    var r = calc(cenario('SN'));
    eq(r.custo27.cred.cbs, 0);
    ok(r.custo27.naoRecuperaveis.some(function (x) { return x.item === 'CBS não creditada'; }));
  });

  // ------------------------------------------------------------ ICMS interestadual
  test('ICMS interestadual (Res. SF 22/1989 e 13/2012)', function () {
    var pv = RTC.params.valores({});
    eq(E.aliqInterestadual('SP', 'CE', false, pv).aliq, 7);
    eq(E.aliqInterestadual('CE', 'SP', false, pv).aliq, 12);
    eq(E.aliqInterestadual('SP', 'RJ', false, pv).aliq, 12);
    eq(E.aliqInterestadual('SP', 'ES', false, pv).aliq, 7);
    eq(E.aliqInterestadual('ES', 'BA', false, pv).aliq, 12);
    eq(E.aliqInterestadual('PR', 'CE', true, pv).aliq, 4);
  });
  test('Venda interestadual a não contribuinte usa alíquota interna do destino (DIFAL)', function () {
    var c = cenario('LR', function (e, s) { s.perfil.icms.aliqSaidaAuto = true; s.operacao.ufDestino = 'PE'; s.operacao.destinatario = 'nao_contribuinte'; });
    var r = E.calcular(c.emp, c.sim, { aliquotasUF: { PE: { interna: 20.5 }, CE: { interna: 20 } } });
    near(r.ctx.icmsSai.aliq, 20.5, 1e-9);
  });

  // ------------------------------------------------------------ Custo de aquisição
  test('Lucro Real 2026: créditos de ICMS e PIS/Cofins (base sem ICMS)', function () {
    var r = calc(cenario('LR'));
    var c = r.custo26;
    near(c.icms, 120); near(c.cred.icms, 120);
    near(c.cred.pis, 14.52); near(c.cred.cofins, 66.88);
    near(c.liquido, 798.60);
  });
  test('Lucro Real 2026: ICMS do CT-e creditado; frete fora da base do crédito de PIS/Cofins', function () {
    var r = calc(cenario('LR', function (e, s) { s.valores.frete = 100; s.valores.freteNaNota = false; s.valores.icmsFrete = 12; }));
    var c = r.custo26;
    near(c.cred.icms, 132, 0.001, 'ICMS da NF (120) + ICMS do CT-e (12)');
    near(c.cred.pis, 0.0165 * (1000 - 120), 0.006, 'base: produtos − ICMS da NF (frete do CT-e fora)');
    near(c.cred.cofins, 0.076 * (1000 - 120), 0.006);
    var naNota = calc(cenario('LR', function (e, s) { s.valores.frete = 100; s.valores.icmsFrete = 12; }));
    near(naNota.custo26.cred.icms - 0.12 * 100, 120, 0.001, 'frete na NF: o campo do CT-e é ignorado');
    near(naNota.custo26.cred.pis, 0.0165 * (1000 - 132), 0.006, 'frete da NF fora da base; sai todo o ICMS destacado, inclusive o do frete');
  });
  test('PIS/Cofins da venda sempre sem ICMS, mesmo com premissa antiga gravada como "não excluir"', function () {
    var r = calc(cenario('LR', function (e, s) { s.premissas.excluirIcmsBasePisCofins = false; }));
    var v = r.a1.v26;
    near(linha(v, 'pis').valor, 0.0165 * (v.X - linha(v, 'icms').valor), 0.011, 'PIS sem ICMS');
    near(linha(v, 'cofins').valor, 0.076 * (v.X - linha(v, 'icms').valor), 0.011, 'Cofins sem ICMS');
    var lp = calc(cenario('LP', function (e, s) { s.premissas.excluirIcmsBasePisCofins = false; })).a1.v26;
    near(linha(lp, 'pis').valor, 0.0065 * (lp.X - linha(lp, 'icms').valor), 0.011, 'Presumido também');
  });
  test('Lucro Presumido 2026: só ICMS recuperável', function () {
    var r = calc(cenario('LP'));
    near(r.custo26.liquido, 880);
    eq(r.custo26.cred.pis, 0);
  });
  test('Simples Nacional 2026: nenhum crédito', function () {
    var r = calc(cenario('SN'));
    near(r.custo26.liquido, 1000);
    eq(r.custo26.totalCreditos, 0);
  });
  test('ICMS-ST nunca é crédito; ICMS próprio do substituído vai ao custo', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.icms.tratamento = 'st'; s.perfil.st.modo = 'informado'; s.perfil.st.valorInformado = 150; }));
    var c = r.custo26;
    eq(c.cred.icms, 0);
    near(c.bruto, 1150);
    near(c.liquido, 1150 - 81.40);
    ok(c.naoRecuperaveis.some(function (x) { return x.item === 'ICMS-ST'; }));
    eq(linha(r.a1.v26, 'icms').valor, 0, 'saída sem débito');
  });
  test('ICMS-ST calculado com MVA ajustada (Conv. ICMS 142/2018)', function () {
    var c = cenario('LR', function (e, s) {
      s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP';
      s.perfil.icms.aliqEntradaAuto = true;
      s.perfil.icms.tratamento = 'st'; s.perfil.st.mva = 40; s.perfil.st.aliqInternaAuto = false; s.perfil.st.aliqInterna = 20;
    });
    var r = calc(c);
    var mvaAj = 1.4 * 0.93 / 0.8 - 1;
    near(r.custo26.st, 1000 * (1 + mvaAj) * 0.20 - 70, 0.01);
  });
  test('ICMS antecipado: regime normal credita após o pagamento (RICMS-CE, art. 61, § 5º)', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.antecipado.tipo = 'antecipado'; s.perfil.antecipado.modo = 'informado'; s.perfil.antecipado.valor = 80; }));
    near(r.custo26.antecipado, 80); near(r.custo26.cred.antecipado, 80);
    near(r.custo26.cred.pis + r.custo26.cred.cofins, (1000 - 120) * 0.0925, 0.011, 'o ICMS antecipado não entra nem sai da base do crédito de PIS/Cofins');
    near(r.custo26.liquido, 798.60, 0.001, 'antecipado não altera o custo líquido do regime normal');
    var l = r.custo26.linhas.filter(function (x) { return x.id === 'antecipado'; })[0];
    ok(l.fund.indexOf('ce_ricms_a61_p5') >= 0, 'fundamento do RICMS-CE');
    ok(r.custo26.cred.icms > 0, 'ICMS próprio continua creditável');
    ok(linha(r.a1.v26, 'icms').valor > 0, 'venda com débito de ICMS (sem encerramento)');
  });
  test('ICMS-ST pago na entrada (encerramento) fica fora da base do crédito de PIS/Cofins', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.antecipado.tipo = 'st'; s.perfil.antecipado.modo = 'informado'; s.perfil.antecipado.valor = 80; }));
    near(r.custo26.cred.pis + r.custo26.cred.cofins, (1000 - 120) * 0.0925, 0.011, 'base sem o ICMS-ST e sem o ICMS destacado');
  });
  test('ICMS antecipado vira custo no Simples Nacional', function () {
    var r = calc(cenario('SN', function (e, s) { s.perfil.antecipado.tipo = 'antecipado'; s.perfil.antecipado.modo = 'informado'; s.perfil.antecipado.valor = 80; }));
    eq(r.custo26.cred.antecipado, 0);
    near(r.custo26.liquido, 1080, 0.001);
    ok(r.custo26.naoRecuperaveis.some(function (x) { return x.item === 'ICMS antecipado'; }));
  });
  test('ICMS-ST na entrada: custo, sem crédito, encerra a tributação (saída sem débito)', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.antecipado.tipo = 'st'; s.perfil.antecipado.modo = 'informado'; s.perfil.antecipado.valor = 150; }));
    eq(r.custo26.cred.antecipado, 0); eq(r.custo26.cred.icms, 0, 'ICMS próprio não creditado');
    near(r.custo26.liquido, 1000 + 150 - 81.40, 0.001);
    eq(linha(r.a1.v26, 'icms').valor, 0, 'sem débito na saída');
    ok(r.custo26.naoRecuperaveis.some(function (x) { return x.item === 'ICMS-ST pago na entrada'; }));
    var sn = calc(cenario('SN', function (e, s) { s.perfil.antecipado.tipo = 'st'; s.perfil.antecipado.modo = 'informado'; s.perfil.antecipado.valor = 150; }));
    near(linha(sn.a1.v26, 'das').aliq, 8.0529412 * (1 - 0.335), 1e-6, 'Simples: ICMS segregado do DAS');
  });
  test('ICMS-ST na entrada calculado pela MVA ajustada; bloqueado se o ST já veio retido na NF', function () {
    var c = cenario('LR', function (e, s) {
      s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP'; s.perfil.icms.aliqEntradaAuto = true;
      s.perfil.antecipado.tipo = 'st'; s.perfil.antecipado.modo = 'mva'; s.perfil.antecipado.mva = 40;
    });
    var r = E.calcular(c.emp, c.sim, { aliquotasUF: { CE: { interna: 20 } } });
    var mvaAj = 1.4 * 0.93 / 0.8 - 1;
    near(r.custo26.antecipado, 1000 * (1 + mvaAj) * 0.20 - 70, 0.01);
    var dup = calc(cenario('LR', function (e, s) { s.perfil.icms.tratamento = 'st'; s.perfil.st.modo = 'informado'; s.perfil.st.valorInformado = 100; s.perfil.antecipado.tipo = 'st'; }));
    ok(dup.erros.some(function (x) { return x.campo === 'perfil.antecipado.tipo'; }), 'dupla contagem bloqueada');
  });
  test('Antecipação no formato anterior é migrada (aplica/encerra → tipo)', function () {
    var it = RTC.model.novoItem();
    it.perfil.antecipado = { aplica: true, modo: 'diferencial', valor: null, encerra: true };
    ok(RTC.model.migrarAntecipacao(it));
    eq(it.perfil.antecipado.tipo, 'st'); eq(it.perfil.antecipado.modo, 'mva');
    eq(RTC.model.tipoAntecipacao({ aplica: true, encerra: false }), 'antecipado');
    eq(RTC.model.tipoAntecipacao({ aplica: false }), 'nenhum');
  });
  test('Fornecedor do Simples: crédito de ICMS limitado ao % da NF', function () {
    var r = calc(cenario('LR', function (e, s) { s.fornecedor.regime26 = 'simples'; s.fornecedor.icmsSimplesPct = 1.25; }));
    near(r.custo26.cred.icms, 12.5);
    near(r.custo26.cred.pis + r.custo26.cred.cofins, 92.5);
    near(r.custo26.liquido, 895);
  });
  test('Redução de base na saída: estorno proporcional do crédito', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.icms.tratamento = 'reducao_base'; s.perfil.icms.reducaoSaida = 40; }));
    near(r.custo26.cred.icms, 72);
    near(linha(r.a1.v26, 'icms').aliq, 10.8, 1e-9);
  });
  test('Saída isenta: sem crédito e sem débito de ICMS', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.icms.tratamento = 'isento'; }));
    eq(r.custo26.cred.icms, 0);
    eq(linha(r.a1.v26, 'icms').valor, 0);
  });
  test('Crédito desabilitado pelo usuário não é deduzido', function () {
    var r = calc(cenario('LR', function (e, s) { s.creditos.icms = false; }));
    eq(r.custo26.cred.icms, 0);
    near(r.custo26.liquido, 1000 - 81.40);
  });
  test('IPI: comércio não credita; indústria credita; zero em 2027', function () {
    var com = calc(cenario('LR', function (e, s) { s.perfil.ipi.aliqEntrada = 10; }));
    near(com.custo26.ipi, 100); eq(com.custo26.cred.ipi, 0);
    near(com.custo26.cred.pis, 0.0165 * (1000 - 120), 0.01, 'IPI não recuperável fora da base do crédito');
    var ind = calc(cenario('LR', function (e, s) { e.atividade = 'industria'; s.perfil.ipi.aliqEntrada = 10; }));
    near(ind.custo26.cred.ipi, 100);
    eq(com.custo27.ipi, 0, 'IPI zero em 2027');
  });

  // ------------------------------------------------------------ CBS/IBS 2027
  test('IPI destacado na NF prevalece sobre a alíquota e entra no custo do comércio', function () {
    var r = calc(cenario('LR', function (e, s) { s.valores.ipi = 50; s.perfil.ipi.aliqEntrada = 10; }));
    near(r.custo26.ipi, 50, 1e-9, 'valor da NF');
    near(r.custo26.bruto, 1050);
    eq(r.custo26.cred.ipi, 0, 'comércio não credita IPI');
    near(r.custo26.cred.pis, 0.0165 * (1000 - 120), 0.011, 'IPI não recuperável fora da base do PIS');
    eq(r.custo27.ipi, 0, 'IPI zero em 2027');
    ok(r.avisos.some(function (a) { return a.campo === 'valores.ipi'; }), 'aviso de divergência entre valor e alíquota');
  });
  test('IPI da NF em 2027 (ZFM): alíquota efetiva aplicada ao novo valor da operação', function () {
    var r = calc(cenario('LR', function (e, s) { e.atividade = 'industria'; s.valores.ipi = 50; s.perfil.ipi.mantido2027 = true; s.premissas.valorProdutos2027 = 'sem_pis_cofins'; s.fornecedor.pisCofinsEmbutidoPct = 10; }));
    near(r.custo27.ipi, 45, 1e-9);
    near(r.custo26.cred.ipi, 50, 1e-9, 'indústria credita');
  });
  test('Fornecedor do Simples: IPI informado é desconsiderado com aviso', function () {
    var r = calc(cenario('LR', function (e, s) { s.fornecedor.regime26 = 'simples'; s.fornecedor.icmsSimplesPct = 1; s.valores.ipi = 50; }));
    eq(r.custo26.ipi, 0);
    ok(r.avisos.some(function (a) { return a.campo === 'valores.ipi' && a.nivel === 'alerta'; }));
  });
  test('CBS 2027 = referência − 0,1 p.p.; redução de 60% proporcional', function () {
    var r = calc(cenario('LR'));
    near(r.ctx.a27.cbs, 0.087, 1e-12); near(r.ctx.a27.ibs, 0.001, 1e-12);
    var r2 = calc(cenario('LR', function (e, s) { s.perfil.cbsIbs.tratamento = 'reducao'; s.perfil.cbsIbs.reducaoPct = 60; }));
    near(r2.ctx.a27.cbs, 0.0348, 1e-12); near(r2.ctx.a27.ibs, 0.0004, 1e-12);
  });
  test('Lucro Real 2027: CBS/IBS por fora e creditados (base sem ICMS)', function () {
    var r = calc(cenario('LR'));
    var c = r.custo27;
    near(c.cbs, 76.56); near(c.ibs, 0.88);
    near(c.bruto, 1077.44); near(c.liquido, 880);
  });
  test('IBS/CBS na base do ICMS em 2027 (premissa): cálculo circular', function () {
    var r = calc(cenario('LR', function (e, s) { s.premissas.ibsCbsNaBaseIcms2027 = true; }));
    var icms = 0.12 * 1088 / (1 + 0.12 * 0.088);
    near(r.custo27.icms, Math.round(icms * 100) / 100);
    var v = r.a1.v27;
    var t = 0.18, k = 0.088;
    near(linha(v, 'icms').valor, v.X * t * (1 + k) / (1 + t * k), 0.011);
  });
  test('Fornecedor do Simples (IBS/CBS no DAS) em 2027: crédito limitado ao valor pago', function () {
    var r = calc(cenario('LR', function (e, s) { s.fornecedor.regime27 = 'simples'; s.fornecedor.cbsSimplesPct = 1.2; s.fornecedor.ibsSimplesPct = 0.02; }));
    eq(r.custo27.cbs, 0);
    near(r.custo27.cred.cbs, 12); near(r.custo27.cred.ibs, 0.2);
  });
  test('Fornecedor do Simples com IBS/CBS fora do DAS: ICMS sem destaque, CBS destacada e creditável', function () {
    var r = calc(cenario('LR', function (e, s) { s.fornecedor.regime27 = 'simples_regular'; s.fornecedor.icmsSimplesPct = 1.25; }));
    eq(r.custo27.icms, 0, 'ICMS no DAS');
    near(r.custo27.cred.icms, 12.5);
    near(r.custo27.cbs, 0.087 * 1000);
    near(r.custo27.cred.cbs, 87);
  });
  test('Alíquota zero de IBS/CBS: sem débito e sem crédito', function () {
    var r = calc(cenario('LR', function (e, s) { s.perfil.cbsIbs.tratamento = 'aliquota_zero'; s.perfil.cbsIbs.fundamento = 'teste'; }));
    eq(r.custo27.cbs, 0); eq(linha(r.a1.v27, 'cbs').valor, 0);
  });
  test('Teste 2026 (CBS 0,9% / IBS 0,1%) não altera preço nem margem', function () {
    var a = calc(cenario('LR'));
    var b = calc(cenario('LR'), { override: { cbsTeste2026: 5, ibsTeste2026: 5 } });
    near(a.a1.v26.X, b.a1.v26.X, 1e-9);
    eq(linha(a.a1.v26, 'cbs_teste').tipo, 'info');
  });

  // ------------------------------------------------------------ Formação de preço
  test('Markup divisor básico: C=100, m=20% → R$ 125,00', function () {
    var M = { C: 100, items: [], regime: 'LP', tau: 0, ano: 2026 };
    near(E.precoPorMargem(M, 20, 'operacional').X, 125, 1e-9);
  });
  test('Denominador ≤ 0 impede o preço', function () {
    var M = { C: 100, items: [{ id: 'x', nome: 'x', tipo: 'dentro', a: 0.5, b: 0, baseA: 1, baseB: 0 }], regime: 'LP', tau: 0, ano: 2026 };
    var r = E.precoPorMargem(M, 50, 'operacional');
    ok(r.erro && r.X === undefined);
    var r2 = calc(cenario('LR', function (e, s) { s.venda.margem = 60; s.venda.despesas[0].pct = 20; }));
    ok(!r2.ok && r2.erros.some(function (x) { return /Denominador/.test(x.msg); }));
  });
  test('Lucro Real 2026: preço e margem de contribuição de 20%', function () {
    var r = calc(cenario('LR'));
    var v = r.a1.v26;
    var A = 0.18 + 0.0165 * 0.82 + 0.076 * 0.82;
    near(v.X, Math.round(798.6 / (1 - 0.2 - A) * 100) / 100, 0.001);
    near(v.pct.margemContrib, 20, 0.01);
    near(linha(v, 'pis').valor, 0.0165 * (v.X - linha(v, 'icms').valor), 0.011, 'PIS sem ICMS na base');
  });
  test('Margem efetiva a partir do preço reproduz a margem (ida e volta)', function () {
    var r = calc(cenario('LP'));
    var back = E.margemPorPreco(r.modelo26, r.a1.v26.X);
    near(back.pct.margemContrib, 20, 0.01);
  });
  test('Margem líquida no Lucro Real: m/(1 − 34%)', function () {
    var r = calc(cenario('LR', function (e, s) { s.premissas.baseMargem = 'liquida'; }));
    near(r.a1.v26.pct.lucroLiquido, 20, 0.02);
    near(r.a1.v26.pct.margemContrib, 20 / 0.66, 0.02);
  });
  test('Margem líquida no Lucro Presumido: IRPJ/CSLL presumidos no divisor', function () {
    var r = calc(cenario('LP', function (e, s) { s.premissas.baseMargem = 'liquida'; }));
    near(r.a1.v26.pct.lucroLiquido, 20, 0.02);
  });
  test('LC 224/2025 e adicional: presunção majorada acima de R$ 5 mi', function () {
    var r = calc(cenario('LP', function (e) { e.presumido.receitaAnual = 10000000; }));
    near(linha(r.a1.v26, 'irpj').a, 0.088 * 0.25, 1e-12);
    near(linha(r.a1.v26, 'csll').a, 0.132 * 0.09, 1e-12);
    var r2 = calc(cenario('LP', function (e) { e.presumido.receitaAnual = 1000000; }));
    near(linha(r2.a1.v26, 'irpj').a, 0.08 * 0.15, 1e-12, 'sem adicional e sem LC 224');
  });
  test('2027: CBS calculada sobre (X − ICMS) e somada por fora ao total', function () {
    var r = calc(cenario('LR'));
    var v = r.a1.v27;
    var icms = linha(v, 'icms').valor;
    near(linha(v, 'cbs').valor, 0.087 * (v.X - icms), 0.011);
    near(v.total, v.X + linha(v, 'cbs').valor + linha(v, 'ibs').valor, 0.001);
    near(v.pct.margemContrib, 20, 0.01);
  });
  test('Despesas sobre o total incluem os tributos por fora', function () {
    var r = calc(cenario('LR', function (e, s) { s.venda.despesas[0].pct = 5; }));
    var v = r.a1.v27;
    near(linha(v, 'dv').valor, 0.05 * v.total, 0.011);
  });
  test('Análise 2: mesmo total ao cliente em 2026 e 2027', function () {
    var r = calc(cenario('LR', function (e, s) { s.venda.precoAtual = 1500; }));
    near(r.a2.v26.X, 1500);
    near(r.a2.v27.total, r.a2.v26.total, 0.011);
    ok(r.comparativo.a2.margemPct.dpp != null);
  });
  test('Sensibilidade: total 2027 cresce com a CBS de referência', function () {
    var r = calc(cenario('LR'));
    eq(r.sensibilidade.length, 5);
    for (var i = 1; i < 5; i++) ok(r.sensibilidade[i].total27 > r.sensibilidade[i - 1].total27, 'monótono');
  });

  // ------------------------------------------------------------ Validações
  test('Validações: valor zero, margem 100% e desconto excessivo', function () {
    ok(calc(cenario('LR', function (e, s) { s.valores.valorUnitario = 0; })).erros.some(function (x) { return x.campo === 'valores.valorUnitario'; }));
    ok(calc(cenario('LR', function (e, s) { s.venda.margem = 100; })).erros.length > 0);
    ok(calc(cenario('LR', function (e, s) { s.valores.desconto = 1000; })).erros.length > 0);
    ok(calc(cenario('LR', function (e, s) { s.venda.margem = null; })).erros.some(function (x) { return x.campo === 'venda.margem'; }));
  });
  test('CFOP incompatível com a natureza bloqueia o cálculo; NCM inválido gera aviso', function () {
    var r = calc(cenario('LR', function (e, s) { s.produto.cfopEntrada = '2102'; s.produto.ncm = '123'; }));
    ok(r.erros.some(function (a) { return a.campo === 'produto.cfopEntrada' && /bloqueado/.test(a.msg); }), 'CFOP 2102 em operação interna');
    ok(!r.custo26, 'sem resultado enquanto o CFOP estiver errado');
    ok(r.avisos.some(function (a) { return /NCM/.test(a.msg); }));
    var r2 = calc(cenario('LR', function (e, s) { s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP'; s.produto.cfopEntrada = '1102'; }));
    ok(r2.erros.some(function (a) { return a.campo === 'produto.cfopEntrada'; }), 'CFOP 1102 em operação interestadual');
    var r3 = calc(cenario('LR', function (e, s) { s.produto.cfopSaida = '6102'; }));
    ok(r3.erros.some(function (a) { return a.campo === 'produto.cfopSaida'; }), 'CFOP 6102 em venda interna');
    var ok4 = calc(cenario('LR', function (e, s) { s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP'; s.produto.cfopEntrada = '2.102'; s.produto.cfopSaida = '5.102'; }));
    ok(ok4.ok, 'CFOPs coerentes calculam normalmente');
  });
  test('Tipo de operação incoerente com a UF do fornecedor é bloqueado', function () {
    var r = calc(cenario('LR', function (e, s) { s.operacao.ufOrigem = 'SP'; }));
    ok(r.erros.some(function (a) { return a.campo === 'operacao.tipo'; }), 'interna com fornecedor de SP');
  });
  test('Natureza única: novo produto herda e alteração vale para todos (CFOPs ajustados)', function () {
    var a = cenario('LR', function (e, s) { s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP'; s.produto.cfopEntrada = '2.102'; s.produto.cfopSaida = '5.102'; });
    var op = RTC.model.novaOperacao(a.emp, 'NF 123');
    op.itens = [a.sim];
    var b = RTC.model.novoItemNaOperacao(op, a.emp);
    eq(b.operacao.tipo, 'interestadual'); eq(b.operacao.ufOrigem, 'SP');
    b.produto.cfopEntrada = '2403';
    op.itens.push(b);
    var n = RTC.model.aplicarCampoOperacao(op, 'operacao.ufOrigem', 'CE', a.emp);
    eq(a.sim.operacao.tipo, 'interna'); eq(b.operacao.tipo, 'interna');
    eq(a.sim.produto.cfopEntrada, '1.102'); eq(b.produto.cfopEntrada, '1403');
    eq(n, 2, 'dois CFOPs ajustados');
    RTC.model.aplicarCampoOperacao(op, 'operacao.tipo', 'interestadual', a.emp);
    eq(a.sim.operacao.ufOrigem, '', 'interestadual exige informar a UF do fornecedor');
    eq(b.produto.cfopEntrada, '2403');
    RTC.model.aplicarCampoOperacao(op, 'operacao.tipo', 'interna', a.emp);
    eq(b.operacao.ufOrigem, 'CE', 'interna: fornecedor na UF da empresa');
  });
  test('Produto com natureza diferente do produto 1 fica bloqueado na operação', function () {
    var a = cenario('LR', function (e, s) { s.operacao.tipo = 'interestadual'; s.operacao.ufOrigem = 'SP'; s.produto.cfopEntrada = '2102'; });
    var b = cenario('LR', function (e, s) { s.produto.cfopEntrada = '1102'; });
    var op = RTC.model.novaOperacao(a.emp, 'NF mista');
    op.itens = [a.sim, b.sim];
    var c = RTC.consolidar(a.emp, op, {});
    ok(c.itens[1].inconsistente, 'produto 2 marcado');
    ok(c.itens[1].r.erros.some(function (x) { return x.campo === 'operacao.tipo'; }), 'erro no tipo de operação');
    ok(c.itens[1].r.erros.some(function (x) { return x.campo === 'produto.cfopEntrada'; }), 'erro no grupo de CFOP');
    ok(c.a1.incompleto, 'fora dos totais');
    near(c.custo26.liquido, c.itens[0].r.custo26.liquido, 0.001, 'totais só com o produto 1');
  });
  test('Alíquota CBS 2027 marcada como estimada até a Resolução do Senado', function () {
    var r = calc(cenario('LR'));
    eq(r.statusCbs, 'estimado');
    ok(r.premissas[0].indexOf('ESTIMADO') >= 0);
  });
  test('Exemplo ilustrativo (2 produtos) calcula sem erros', function () {
    var ex = RTC.model.exemplo();
    eq(ex.simulacao.itens.length, 2);
    var r = E.calcular(ex.empresa, ex.simulacao.itens[0], {});
    ok(r.ok, JSON.stringify(r.erros));
    near(r.custo26.icms, 721, 0.01, 'ICMS interestadual 7% SP→CE sobre 10.300');
    var c = RTC.consolidar(ex.empresa, ex.simulacao, {});
    ok(c.ok, JSON.stringify(c.erros));
    near(c.custo26.produtos, 14000, 0.001, '100 × 100 + 50 × 80');
  });

  // ------------------------------------------------------------ Quantidade × valor unitário e operação com vários produtos
  test('Valor total dos produtos = quantidade × valor unitário (2 casas)', function () {
    var r = calc(cenario('LR', function (e, s) { s.produto.quantidade = 3; s.valores.valorUnitario = 33.3333; }));
    near(r.custo26.produtos, 100, 1e-9, '3 × 33,3333 = 99,9999 → 100,00');
    var l = r.custo26.linhas.filter(function (x) { return x.item === 'Valor bruto dos produtos'; })[0];
    ok(/×/.test(l.entrada) && l.formula === 'Quantidade × valor unitário', 'memória mostra a multiplicação');
  });
  test('Quantidade ausente gera erro no campo quantidade', function () {
    var r = calc(cenario('LR', function (e, s) { s.produto.quantidade = null; }));
    ok(r.erros.some(function (x) { return x.campo === 'produto.quantidade'; }));
  });
  test('Hipótese manual de 2027 pelo valor unitário', function () {
    var r = calc(cenario('LR', function (e, s) { s.premissas.valorProdutos2027 = 'manual'; s.premissas.valorUnitario2027Manual = 90; }));
    near(r.custo27.produtos, 900, 1e-9);
    var r2 = calc(cenario('LR', function (e, s) { s.premissas.valorProdutos2027 = 'manual'; }));
    ok(r2.erros.some(function (x) { return x.campo === 'premissas.valorUnitario2027Manual'; }));
  });
  test('Consolidação soma os produtos da operação', function () {
    var a = cenario('LR');
    var b = cenario('LR', function (e, s) { s.produto.quantidade = 5; s.valores.valorUnitario = 200; });
    var op = RTC.model.novaOperacao(a.emp, 'Teste');
    op.itens = [a.sim, b.sim];
    var c = RTC.consolidar(a.emp, op, {});
    eq(c.n, 2);
    near(c.custo26.liquido, 2 * 798.60, 0.001);
    var r1 = E.calcular(a.emp, a.sim, {}), r2 = E.calcular(a.emp, b.sim, {});
    near(c.a1.v26.X, r1.a1.v26.X + r2.a1.v26.X, 0.001);
    near(c.a1.v27.total, r1.a1.v27.total + r2.a1.v27.total, 0.011);
    near(c.a1.v26.pct.margemContrib, 20, 0.01, 'margem consolidada');
    eq(c.a1.margem, 20);
    eq(c.sensibilidade.length, 5);
    for (var i = 1; i < 5; i++) ok(c.sensibilidade[i].total27 > c.sensibilidade[i - 1].total27, 'sensibilidade monótona');
    ok(c.comparativo.a1 && c.comparativo.a2, 'comparativo consolidado');
  });
  test('Consolidação com produto pendente fica parcial e identifica o produto', function () {
    var a = cenario('LR');
    var b = cenario('LR', function (e, s) { s.valores.valorUnitario = null; s.produto.descricao = 'Sem preço'; });
    var op = RTC.model.novaOperacao(a.emp, 'Teste');
    op.itens = [a.sim, b.sim];
    var c = RTC.consolidar(a.emp, op, {});
    ok(c.a1.incompleto && c.a1.pendentes.length === 1, 'análise 1 incompleta');
    ok(!c.completoCusto && c.custo26.liquido > 0, 'custo parcial');
    ok(c.erros.some(function (x) { return /^Produto 2 · Sem preço:/.test(x.msg); }), 'erro identifica o produto');
  });
  test('Migração: simulação antiga vira operação com um produto (valor unitário = total ÷ quantidade)', function () {
    var emp = cenario('LR').emp;
    var antiga = RTC.model.novoItem(emp);
    delete antiga.valores.valorUnitario;
    delete antiga.premissas.valorUnitario2027Manual;
    antiga.id = 'sim_antiga'; antiga.empresaId = emp.id; antiga.nome = 'Antiga';
    antiga.produto.quantidade = 4; antiga.valores.produtos = 1000;
    antiga.perfil.icms.aliqEntradaAuto = false; antiga.perfil.icms.aliqEntrada = 12;
    antiga.perfil.icms.aliqSaidaAuto = false; antiga.perfil.icms.aliqSaida = 18; antiga.venda.margem = 20;
    var op = RTC.model.migrarOperacao(antiga);
    eq(op.id, 'sim_antiga'); eq(op.itens.length, 1); eq(op.itemAtivoId, op.itens[0].id);
    near(op.itens[0].valores.valorUnitario, 250, 1e-9);
    var r = E.calcular(emp, op.itens[0], {});
    near(r.custo26.produtos, 1000, 1e-9);
  });
  test('XLSX: pacote zip com partes obrigatórias e CRC válido', function () {
    var blob = Nexus.xlsx.build({ title: 't', sheets: [{ name: 'Aba [1]', cols: [10], rows: [[{ v: 'Texto & <xml>', s: 'cabecalho' }, { v: 1234.5, s: 'moeda' }], [{ v: 0.2, s: 'pct' }]] }] });
    ok(blob.size > 1000, 'tamanho');
    eq(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    eq(Nexus.xlsx.colLetra(0), 'A'); eq(Nexus.xlsx.colLetra(25), 'Z'); eq(Nexus.xlsx.colLetra(26), 'AA');
    eq(Nexus.xlsx.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'CRC32 de referência');
  });
  test('Diferença em pontos percentuais sem "−0,00"', function () {
    eq(Nexus.fmt.signedPp(-0.0001), '0,00 p.p.');
    eq(Nexus.fmt.signedPp(2.137), '+2,14 p.p.');
    eq(Nexus.fmt.signedPp(-4.78), '−4,78 p.p.');
    eq(Nexus.fmt.date('2026-10-10'), '10/10/2026', 'data local, sem deslocamento de fuso');
  });
  test('Formatação brasileira', function () {
    eq(Nexus.fmt.brl(1234.56), 'R$ 1.234,56');
    eq(Nexus.fmt.pct(20), '20,00%');
    eq(Nexus.fmt.parse('1.234,56'), 1234.56);
    eq(Nexus.fmt.parse('1.500'), 1500);
    eq(Nexus.fmt.parse('20,5%'), 20.5);
    ok(Nexus.fmt.cnpjValido('11.222.333/0001-81'));
    ok(!Nexus.fmt.cnpjValido('11.222.333/0001-82'));
  });

  // ------------------------------------------------------------ base de cálculo: quantidade total × por unidade
  test('Preço informado por unidade: total = quantidade × preço unitário (método B)', function () {
    var c = cenario('LR', function (e, s) { s.venda.modo = 'B'; s.venda.basePreco = 'unitario'; s.venda.precoUnitarioAtual = 150; s.venda.precoAtual = null; });
    var r = calc(c);
    ok(r.ok || r.a2, 'calcula');
    near(r.a2.v26.X, 1500, 0.001, 'preço total da quantidade (10 × 150)');
    var sem = calc(cenario('LR', function (e, s) { s.venda.modo = 'B'; s.venda.basePreco = 'unitario'; s.venda.precoUnitarioAtual = null; }));
    ok(sem.erros.some(function (x) { return x.campo === 'venda.precoUnitarioAtual'; }), 'erro no campo do preço unitário');
  });
  test('Por unidade: valores em R$ ÷ quantidade, percentuais iguais (preço e custo)', function () {
    var r = calc(cenario('LR'));
    var v = r.a1.v26, u = E.porUnidade(v, 10);
    near(u.X, v.X / 10, 1e-9, 'preço');
    near(u.total, v.total / 10, 1e-9, 'total ao cliente');
    near(u.linhas[0].valor, v.linhas[0].valor / 10, 1e-9, 'tributo');
    eq(u.pct.margemContrib, v.pct.margemContrib, 'margem igual');
    var c = r.custo26, cu = E.custoPorUnidade(c, 10);
    near(cu.liquido, c.liquido / 10, 1e-9, 'custo líquido');
    near(cu.bruto, c.bruto / 10, 1e-9, 'custo bruto');
    ok(!cu.linhas.some(function (l) { return l.item === 'Custo líquido unitário'; }), 'sem a linha de custo unitário');
    var cred = cu.linhas.filter(function (l) { return l.id === 'icms'; })[0];
    eq(cred.aliq, c.linhas.filter(function (l) { return l.id === 'icms'; })[0].aliq, 'alíquota mantida');
  });
  test('Troca da base do preço preserva o preço (total ↔ unidade)', function () {
    var it = RTC.model.novoItem();
    it.produto.quantidade = 50;
    it.venda.precoAtual = 6900;
    RTC.model.aplicarBasePreco(it, 'unitario');
    eq(it.venda.basePreco, 'unitario');
    near(it.venda.precoUnitarioAtual, 138, 1e-9, 'unitário');
    it.venda.precoUnitarioAtual = 140;
    RTC.model.aplicarBasePreco(it, 'total');
    near(it.venda.precoAtual, 7000, 1e-9, 'total');
    var antigo = RTC.model.novoItem();
    antigo.produto.quantidade = 4; antigo.venda.basePreco = 'unitario'; antigo.venda.precoAtual = 100; delete antigo.venda.precoUnitarioAtual;
    ok(RTC.model.migrarBasePreco(antigo), 'migra dado anterior');
    near(antigo.venda.precoUnitarioAtual, 25, 1e-9);
  });
  test('Operação completa: linhas de custo somadas e média por unidade com a mesma unidade', function () {
    var a = cenario('LR');
    var b = cenario('LR', function (e, s) { s.produto.quantidade = 5; s.valores.valorUnitario = 40; });
    var op = RTC.model.novaOperacao(a.emp, 'Op'); op.itens = [a.sim, b.sim];
    var c = RTC.consolidar(a.emp, op, {});
    var ra = c.itens[0].r, rb = c.itens[1].r;
    near(c.custo26.liquido, ra.custo26.liquido + rb.custo26.liquido, 0.011, 'soma');
    var li = c.custo26.linhas.filter(function (l) { return l.id === 'icms' && l.grupo === 'Créditos (tributos recuperáveis)'; })[0];
    near(li.valor, linha(ra.custo26, 'icms').valor + linha(rb.custo26, 'icms').valor, 0.011, 'crédito de ICMS somado');
    eq(c.qtdComum.quantidade, 15, 'quantidade comum');
    near(c.custo26.unitario, c.custo26.liquido / 15, 1e-9, 'custo médio por unidade');
    b.sim.produto.unidade = 'CX';
    eq(RTC.consolidar(a.emp, op, {}).qtdComum, null, 'unidades diferentes: sem média');
  });
  test('Operação com métodos diferentes (A e B): total soma cada produto no seu método', function () {
    var a = cenario('LR');
    var b = cenario('LR', function (e, s) { s.venda.modo = 'B'; s.venda.precoAtual = 2000; });
    var op = RTC.model.novaOperacao(a.emp, 'Op'); op.itens = [a.sim, b.sim];
    var c = RTC.consolidar(a.emp, op, {});
    eq(c.modo, 'misto');
    near(c.principal.v26.X, c.itens[0].r.a1.v26.X + c.itens[1].r.a2.v26.X, 0.011, 'A pelo markup + B pelo preço informado');
  });

  // ------------------------------------------------------------ planilha modelo e importação
  function planilhaCom(objs) {
    var P = RTC.planilha;
    var cab = [[], [], [], P.COLS.map(function (c) { return c.t; }), P.COLS.map(function (c) { return { obrig: 'OBRIGATÓRIO', cond: 'CONDICIONAL', opc: 'OPCIONAL' }[c.r]; }), P.COLS.map(function (c) { return c.d; })];
    return [{ nome: 'Produtos', linhas: cab.concat(objs.map(function (o) { return P.linhaCols(Object.assign({ op: 'NF 1', descricao: 'Produto', quantidade: 10, valorUnitario: 5, margem: 10 }, o)); })) }];
  }
  function ctxImport(emp) { return { arquivo: 't.xlsx', empresas: [emp], empresaAtual: emp, regras: [], nomesExistentes: function () { return []; } }; }
  test('Importação (colunas avançadas): mesmo nome forma uma operação e herda a natureza', function () {
    var emp = cenario('LR').emp;
    var r = RTC.planilha.processar(planilhaCom([
      { tipo: 'Interestadual', ufOrigem: 'SP', cfopEntrada: '2102', cfopSaida: '5102' },
      { cfopEntrada: '2.102', modo: 'B - Preço → margem', margem: null, basePreco: 'Por unidade', precoAtual: 7.5 },
      { op: 'NF 2', tipo: 'Interna', unidade: 'CX' }
    ]), ctxImport(emp));
    eq(r.erros.length, 0, JSON.stringify(r.erros));
    eq(r.operacoes.length, 2, 'operações');
    eq(r.operacoes[0].itens.length, 2, 'produtos da NF 1');
    var p2 = r.operacoes[0].itens[1];
    eq(p2.operacao.tipo, 'interestadual', 'natureza herdada');
    eq(p2.operacao.ufOrigem, 'SP');
    eq(p2.venda.precoUnitarioAtual, 7.5, 'preço por unidade');
    eq(r.operacoes[1].itens[0].operacao.ufOrigem, 'CE', 'interna: UF da empresa');
    eq(r.operacoes[0].linhas.join(','), '7,8', 'linhas de origem');
  });
  test('Importação: erros por linha (natureza, CFOP, obrigatórios, listas, percentuais)', function () {
    var emp = cenario('LR').emp;
    var r = RTC.planilha.processar(planilhaCom([
      { tipo: 'Interestadual', ufOrigem: 'SP' },
      { tipo: 'Interna' },
      { cfopEntrada: '1102' },
      { quantidade: null },
      { op: 'NF 3', tipo: 'Inexistente' },
      { op: 'NF 4', tipo: 'Interna', margem: 150 },
      { op: 'NF 5', tipo: 'Interna', modo: 'B - Preço → margem', margem: null }
    ]), ctxImport(emp));
    eq(r.linhasComErro.join(','), '8,9,10,11,12,13', 'linhas recusadas');
    eq(r.operacoes.length, 1);
    eq(r.operacoes[0].itens.length, 1, 'só a linha válida');
    function tem(linha, txt) { return r.erros.some(function (e) { return e.linha === linha && e.msg.indexOf(txt) >= 0; }); }
    ok(tem(8, 'Diferente da primeira linha'), 'natureza');
    ok(tem(9, 'deve iniciar por 2'), 'CFOP');
    ok(tem(10, 'Campo obrigatório'), 'quantidade');
    ok(tem(11, 'não reconhecido'), 'lista');
    ok(tem(12, 'menor que 100%'), 'percentual');
    ok(tem(13, 'método B'), 'preço no método B');
  });
  test('Planilha do cliente: poucas colunas, obrigatórias indicadas', function () {
    var M = RTC.planilha.MODELO;
    ok(M.length <= 16, 'modelo enxuto (' + M.length + ' colunas)');
    eq(M.filter(function (c) { return c.r === 'obrig'; }).map(function (c) { return c.id; }).join(','), 'op,ufFornecedor,descricao,quantidade,valorUnitario', 'obrigatórias');
    ok(M.every(function (c) { return c.r === 'obrig' || c.r === 'opc'; }), 'obrigatória ou opcional');
    ok(RTC.planilha.modelo({ razaoSocial: 'Cliente Teste', uf: 'CE' }).size > 3000, 'arquivo gerado');
  });
  test('Planilha do cliente: tipo deduzido da UF do fornecedor, exemplo ignorado, margem ou preço', function () {
    var P = RTC.planilha, M = P.MODELO;
    var emp = cenario('LR').emp; // empresa no CE
    var linhas = [['Planilha de compras'], ['Preencha…'],
      M.map(function (c) { return c.t + (c.r === 'obrig' ? ' *' : ''); }),
      M.map(function (c) { return c.d; }),
      M.map(function (c, i) { return i === 0 ? 'Exemplo: ' + c.ex : c.ex; })
    ].concat([
      { op: 1001, ufFornecedor: 'CE', descricao: 'A', quantidade: 10, valorUnitario: 5, margem: 20 },
      { op: '1001', descricao: 'B', quantidade: 4, valorUnitario: 2, precoVendaUnit: 9 },
      { op: '2002', ufFornecedor: 'sp', fornSimples: 'Sim', descricao: 'C', quantidade: 1, valorUnitario: 50 },
      { op: '3003', ufFornecedor: 'Exterior', descricao: 'D', quantidade: 2, valorUnitario: 10, margem: 15 },
      { op: '1001', ufFornecedor: 'SP', descricao: 'E', quantidade: 1, valorUnitario: 1, margem: 10 }
    ].map(P.linhaModelo));
    var r = P.processar([{ nome: 'Produtos', linhas: linhas }], ctxImport(emp));
    eq(r.linhasLidas, 5, 'linha de exemplo ignorada');
    eq(r.operacoes.map(function (o) { return o.nomeFinal + ':' + o.itens.length; }).join(','), 'NF 1001:2,NF 2002:1,NF 3003:1');
    eq(r.linhasComErro.join(','), '10', 'mesma nota com outra UF');
    var a = r.operacoes[0].itens[0], b = r.operacoes[0].itens[1], c = r.operacoes[1].itens[0], d = r.operacoes[2].itens[0];
    eq(a.operacao.tipo, 'interna'); eq(a.venda.modo, 'A');
    eq(b.operacao.tipo, 'interna', 'herda a nota'); eq(b.venda.modo, 'B', 'só preço → margem efetiva'); eq(b.venda.basePreco, 'unitario'); eq(b.venda.precoUnitarioAtual, 9);
    eq(c.operacao.tipo, 'interestadual'); eq(c.operacao.ufOrigem, 'SP'); eq(c.fornecedor.regime26, 'simples');
    ok(r.avisos.some(function (x) { return x.linha === 8 && /Sem margem e sem preço/.test(x.msg); }), 'aviso sem margem/preço (importa assim mesmo)');
    eq(d.operacao.tipo, 'importacao');
    ok(r.erros.some(function (x) { return x.linha === 10 && x.coluna === 'UF do fornecedor'; }), 'erro com o título da coluna do modelo');
  });
  test('CSV: separador detectado e aspas', function () {
    var r = Nexus.xlsx.lerCsv('Nome;Valor\n"A; com ponto e vírgula";"1.234,56"\nB;2\n');
    eq(r.abas[0].linhas[1][0], 'A; com ponto e vírgula');
    eq(r.abas[0].linhas[1][1], '1.234,56');
    eq(r.abas[0].linhas.length, 3);
  });

  test('Planilha do cliente: ICMS destacado, DAE e código (1031 ICMS-ST custo; 1023 antecipado crédito)', function () {
    var P = RTC.planilha, M = P.MODELO;
    var emp = cenario('LR').emp; // empresa no CE, regime normal
    var linhas = [['Planilha de compras'], ['Preencha…'], M.map(function (c) { return c.t + (c.r === 'obrig' ? ' *' : ''); }), M.map(function (c) { return c.d; }), []].concat([
      { op: '10', ufFornecedor: 'CE', descricao: 'A', quantidade: 10, valorUnitario: 10, margem: 20, icmsEntradaValor: 12, antValor: 30, codigoDae: '1031' },
      { op: '10', descricao: 'B', quantidade: 10, valorUnitario: 20, margem: 20, codigoDae: '1031 - ICMS-ST' },
      { op: '20', ufFornecedor: 'CE', descricao: 'C', quantidade: 1, valorUnitario: 50, margem: 10, antValor: 5, codigoDae: 1023 },
      { op: '30', ufFornecedor: 'CE', descricao: 'D', quantidade: 1, valorUnitario: 10, margem: 10, antValor: 8, codigoDae: '1023' },
      { op: '30', descricao: 'E', quantidade: 1, valorUnitario: 10, margem: 10, antValor: 8, codigoDae: '1023' },
      { op: '40', ufFornecedor: 'CE', descricao: 'F', quantidade: 1, valorUnitario: 10, margem: 10, antValor: 3, codigoDae: '9999' }
    ].map(P.linhaModelo));
    var r = P.processar([{ nome: 'Produtos', linhas: linhas }], ctxImport(emp));
    eq(r.erros.length, 0, JSON.stringify(r.erros));
    var a = r.operacoes[0].itens[0], b = r.operacoes[0].itens[1], c = r.operacoes[1].itens[0], f = r.operacoes[3].itens[0];
    eq(a.perfil.icms.valorEntradaInformado, 12, 'ICMS destacado');
    eq(a.perfil.antecipado.tipo, 'st', '1031 = ICMS-ST');
    eq(a.perfil.antecipado.valor, 10, 'rateio proporcional (100 de 300)');
    eq(b.perfil.antecipado.valor, 20, 'rateio proporcional (200 de 300)');
    eq(b.perfil.antecipado.modo, 'informado');
    eq(c.perfil.antecipado.tipo, 'antecipado', '1023 = ICMS antecipado');
    eq(c.perfil.antecipado.valor, 5);
    eq(f.perfil.antecipado.tipo, 'nenhum', 'código desconhecido não define o recolhimento');
    function aviso(re) { return r.avisos.some(function (x) { return re.test(x.msg); }); }
    ok(aviso(/dividido entre os 2 produtos/), 'aviso do rateio');
    ok(aviso(/aparece em 2 produtos/), 'aviso de valor repetido');
    ok(aviso(/não reconhecido/), 'aviso de código desconhecido');
    // efeito no custo: ICMS-ST pago na entrada é custo; ICMS antecipado é crédito no regime normal
    [a, c].forEach(function (it) { it.perfil.icms.aliqEntradaAuto = false; it.perfil.icms.aliqEntrada = 12; it.perfil.icms.aliqSaidaAuto = false; it.perfil.icms.aliqSaida = 18; });
    var ra = E.calcular(emp, a, {}), rc = E.calcular(emp, c, {});
    ok(ra.custo26.naoRecuperaveis.some(function (x) { return /ICMS-ST/.test(x.item) && Math.abs(x.valor - 10) < 0.001; }), 'ICMS-ST de R$ 10,00 no custo');
    near(rc.custo26.cred.antecipado, 5, 0.001, 'ICMS antecipado de R$ 5,00 como crédito');
  });

  // ------------------------------------------------------------ consulta de CNPJ (CNPJá) → cadastro da empresa
  function respostaCnpja(mod) {
    var j = {
      updated: '2026-10-01T10:00:00.000Z', taxId: '11222333000181', alias: 'Loja Teste', founded: '2015-03-02', head: true,
      company: { id: '11222333', name: 'COMERCIO TESTE LTDA', nature: { id: 2062, text: 'Sociedade Empresária Limitada' }, size: { id: 1, acronym: 'ME', text: 'Microempresa' },
        simples: { optant: true, since: '2015-03-02', history: [] }, simei: { optant: false, since: null, history: [] },
        members: [{ person: { name: 'Sócio de Teste', taxId: '***123456**' }, role: { text: 'Sócio-Administrador' } }] },
      statusDate: '2015-03-02', status: { id: 2, text: 'Ativa' },
      address: { municipality: 2304400, street: 'Rua Teste', number: '100', district: 'Centro', city: 'Fortaleza', state: 'CE', details: 'Sala 1', zip: '60000000', country: { id: 76, name: 'Brasil' } },
      mainActivity: { id: 4711302, text: 'Comércio varejista de mercadorias em geral' }, sideActivities: [{ id: 4721102, text: 'Padaria e confeitaria' }]
    };
    if (mod) mod(j);
    return j;
  }
  test('CNPJá: resposta normalizada (sem quadro de sócios) e CNAE formatado', function () {
    var r = Nexus.cnpja.normalizar(respostaCnpja());
    eq(r.cnpj, '11222333000181'); eq(r.razaoSocial, 'COMERCIO TESTE LTDA'); eq(r.nomeFantasia, 'Loja Teste');
    eq(r.endereco.uf, 'CE'); eq(r.endereco.municipio, 'Fortaleza'); eq(r.endereco.cep, '60000000');
    eq(r.cnaePrincipal.codigo, '4711-3/02'); eq(r.situacao, 'Ativa');
    ok(r.simples.optante && !r.simei.optante, 'Simples / SIMEI');
    ok(JSON.stringify(r).indexOf('Sócio de Teste') < 0, 'sócios não são guardados');
  });
  test('CNPJá → empresa: optante do Simples (comércio = Anexo I; indústria = Anexo II); não optante pede o regime', function () {
    var e = RTC.model.novaEmpresa();
    var res = RTC.model.aplicarReceita(e, Nexus.cnpja.normalizar(respostaCnpja()));
    eq(e.razaoSocial, 'COMERCIO TESTE LTDA'); eq(e.nomeFantasia, 'Loja Teste'); eq(e.uf, 'CE'); eq(e.municipio, 'Fortaleza');
    eq(e.cnpj, '11.222.333/0001-81'); eq(e.regime, 'SN'); eq(e.simples.anexo, 'I'); eq(e.atividade, 'comercio');
    eq(e.origens.razaoSocial, 'receita', 'selo de origem');
    ok(res.avisos.some(function (m) { return /RBT12/.test(m); }), 'pede a RBT12');
    var ind = RTC.model.novaEmpresa();
    RTC.model.aplicarReceita(ind, Nexus.cnpja.normalizar(respostaCnpja(function (j) { j.mainActivity = { id: 2539001, text: 'Serviços de usinagem' }; })));
    eq(ind.atividade, 'industria'); eq(ind.simples.anexo, 'II');
    var lr = RTC.model.novaEmpresa(); lr.regime = 'LR';
    var r2 = RTC.model.aplicarReceita(lr, Nexus.cnpja.normalizar(respostaCnpja(function (j) { j.company.simples.optant = false; j.status.text = 'Baixada'; })));
    eq(lr.regime, 'LR', 'não optante: mantém o regime informado');
    ok(r2.avisos.some(function (m) { return /Presumido ou Lucro Real/.test(m); }), 'pede para confirmar o regime');
    ok(r2.avisos.some(function (m) { return /Baixada/.test(m); }), 'avisa a situação cadastral');
  });

  // ------------------------------------------------------------ quanto devo cobrar em 2027 (mesmo lucro em R$)
  test('Quanto cobrar em 2027: mantém, em R$, o lucro de 2026 (margem de contribuição e lucro líquido)', function () {
    [['LR', 'operacional'], ['LR', 'liquida'], ['LP', 'liquida'], ['LP', 'operacional'], ['SN', 'operacional']].forEach(function (cfg) {
      var r = calc(cenario(cfg[0], function (e, s) { s.premissas.baseMargem = cfg[1]; }));
      var a3 = r.a3;
      ok(a3 && a3.v27 && !a3.v27.erro, cfg.join('/') + ': calculado');
      var l27 = cfg[1] === 'liquida' ? a3.v27.lucroLiquido : a3.v27.margemContrib;
      near(l27, a3.lucro26, 0.02, cfg.join('/') + ': mesmo lucro');
    });
  });
  test('Quanto cobrar em 2027: referência é o preço atual informado; operação soma os produtos', function () {
    var c = cenario('LR', function (e, s) { s.venda.precoAtual = 1800; });
    var r = calc(c);
    eq(r.a3.v26.X, 1800, 'lucro de 2026 medido no preço atual');
    near(r.a3.lucro26, r.a2.v26.margemContrib, 0.001);
    var b = cenario('LR', function (e, s) { s.produto.quantidade = 5; });
    var op = RTC.model.novaOperacao(c.emp, 'Op'); op.itens = [c.sim, b.sim];
    var cons = RTC.consolidar(c.emp, op, {});
    near(cons.a3.v27.total, cons.itens[0].r.a3.v27.total + cons.itens[1].r.a3.v27.total, 0.011, 'soma dos produtos');
    near(cons.a3.lucro26, cons.itens[0].r.a3.lucro26 + cons.itens[1].r.a3.lucro26, 0.011);
  });

  // Acessos (login, bloqueio, módulos), persistência e isolamento entre clientes: tests/node/persistencia.test.js
})();
