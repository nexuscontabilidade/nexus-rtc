/* Testes do módulo Lucratividade por Item (docs/modulo-lucratividade.md, "Testes obrigatórios") */
(function () {
  'use strict';
  var test = T.test, ok = T.ok, eq = T.eq, near = T.near;
  var M = Nexus.lucro.motor;

  /** Item A100 da planilha de exemplo (valores de compra = total da linha; PV unitário de R$ 180 → R$ 1.800 na linha) */
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
  function params(regime) { var p = M.parametrosPadrao(); p.regime = regime; p.uf = 'CE'; p.margemAlvo = 20; return p; }

  // A especificação somava frete e seguro à base de PIS/Cofins (base 934; lucro 286,04; margem 16,22%). Pela regra do
  // escritório (28/10/2026), a base é mercadoria − desconto − ICMS destacado: base 880, crédito 81,40, CL 902,60.
  test('Lucratividade · A100 no Lucro Real, base de PIS/Cofins = mercadoria − ICMS (lucro 281,04; margem 15,93%)', function () {
    var p = params('REAL');
    var r = M.calcularItem(itemA100(), p);
    near(r.custoBruto, 1190, 0.01, 'custo bruto');
    near(r.creditoIcms, 206, 0.01, 'crédito de ICMS');
    near(r.compra.basePisCofins, 880, 0.01, 'base PIS/Cofins da compra: 1.000 − 120 (frete, seguro, IPI e DAE fora)');
    near(r.creditoPisCofins, 81.40, 0.01, 'crédito PIS + Cofins');
    near(r.custoLiquido, 902.60, 0.01, 'custo líquido');
    near(r.pldTotal, 1764, 0.01, 'PLD');
    function cascata(id) { return r.cascata.filter(function (x) { return x.id === id; })[0]; }
    near(-cascata('icms').valor * 10, 352.80, 0.01, 'ICMS da venda');
    near(-(cascata('pis').valor + cascata('cofins').valor) * 10, 130.54, 0.01, 'PIS + Cofins da venda');
    near(-(cascata('comissao').valor + cascata('cartao').valor) * 10, 97.02, 0.01, 'comissão + cartão');
    near(r.lucroTotal, 281.04, 0.01, 'lucro do item');
    near(r.margem * 100, 15.93, 0.006, 'margem sobre o PLD');
    near(r.sigma, 0.329, 1e-9, 'Σ');
    near(r.pvMinimo * 10, 1372.61, 0.01, 'PV mínimo');
    near(r.pvAlvo * 10, 1955.46, 0.01, 'PV para margem de 20%');
    var cl = r.custoLiquidoUnit;
    near(M.precoPorModo({ modo: 'MARKUP_COM_DESPESAS', markup: 1.6 }, cl, r.sigma).pv * 10, 1444.16, 0.01, 'PV modo 1');
    near(M.precoPorModo({ modo: 'MARKUP_SEM_DESPESAS', markup: 1.6, descontoTipo: 'pct', desconto: 2 }, cl, r.sigma).pv * 10, 2196.17, 0.01, 'PV modo 2');
  });

  test('Lucratividade · MS 162 MOTOSSERRA reproduz a planilha do escritório (PIS/Cofins 660,87; custo 7.325,22)', function () {
    var it = {
      id: 'ms162', codigo: '2010', descricao: 'MS 162 MOTOSSERRA,61PMM3', ncm: '84678100', quantidade: 10,
      compra: { valorMercadoria: 7461.09, descontoCompra: 0, frete: 453.61, icmsFrete: 0, ipi: 387.98, seguroOutros: 0, icmsDestacado: 316.59, daeValor: 132.84, daeCodigo: '1023', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true },
      trib: { icmsSt: false, aliqIcms: 5.6, reducaoBcIcms: 0, regimePisCofins: 'NORMAL', dasAliquota: null },
      venda: { modo: 'PRECO_INFORMADO', precoVenda: 1189.41, descontoTipo: 'pct', desconto: 0, comissao: 0, taxaCartao: 0 }
    };
    var r = M.calcularItem(it, params('REAL'));
    near(r.compra.basePisCofins, 7144.50, 0.005, 'base: 7.461,09 − 316,59');
    near(r.creditoPisCofins, 660.87, 0.005, 'PIS 117,88 + Cofins 542,98');
    near(r.custoLiquido, 7325.22375, 1e-6, 'custo de aquisição da planilha');
    near(r.lucro, 286.42138, 1e-5, 'lucratividade a preço cheio');
    it.venda.desconto = 25;
    near(M.calcularItem(it, params('REAL')).lucro, 31.68544, 1e-5, 'lucratividade com 25% de desconto');
  });

  test('Lucratividade · mesmo item no Simples: crédito zero e custo líquido = custo bruto (1.190,00)', function () {
    var r = M.calcularItem(itemA100(), params('SIMPLES'));
    eq(r.creditoIcms, 0); eq(r.creditoPisCofins, 0);
    near(r.custoLiquido, 1190, 0.01);
    near(r.custoLiquido, r.custoBruto, 1e-9);
  });

  test('Lucratividade · mesmo item no Presumido: crédito só de ICMS (206,00) e custo líquido 984,00', function () {
    var r = M.calcularItem(itemA100(), params('PRESUMIDO'));
    near(r.creditoIcms, 206, 0.01); eq(r.creditoPisCofins, 0);
    near(r.custoLiquido, 984, 0.01);
  });

  test('Lucratividade · DAE 1031 nunca gera crédito, em nenhum regime', function () {
    ['SIMPLES', 'PRESUMIDO', 'REAL'].forEach(function (rg) {
      var it = itemA100(function (x) { x.compra.daeCodigo = '1031'; x.compra.daeValor = 72; });
      var c = M.calcularCompra(it, params(rg));
      eq(c.creditoIcmsPendente, 0);
      near(c.custoBruto, 1182, 1e-9, rg + ': DAE no custo');
      if (rg === 'REAL') near(c.basePisCofins, 880, 1e-9, 'DAE fora da base de PIS/Cofins');
    });
  });

  test('Lucratividade · item com ICMS-ST (DAE 1031) não credita o ICMS destacado nem o do frete', function () {
    var com1031 = function (x) { x.compra.daeCodigo = '1031'; x.compra.daeValor = 72; };
    var real = M.calcularCompra(itemA100(com1031), params('REAL'));
    near(real.creditoIcms, 0, 1e-9, 'Real: sem crédito de ICMS (120 destacado + 6 do frete ficam no custo)');
    eq(real.detalheIcms.length, 0);
    ok(/1031/.test(real.motivoIcms), 'motivo exibido no detalhe');
    near(real.basePisCofins, 880, 1e-9, 'base de PIS/Cofins continua sem o ICMS destacado');
    near(real.custoLiquido, 1182 - 880 * 0.0925, 1e-9, 'CL = CB − só PIS/Cofins');
    near(M.calcularCompra(itemA100(com1031), params('PRESUMIDO')).custoLiquido, 1182, 1e-9, 'Presumido: tudo é custo');
    near(M.calcularCompra(itemA100(), params('PRESUMIDO')).creditoIcms, 206, 1e-9, 'sem 1031 o crédito continua (120 + 6 + 80 do 1023)');
  });

  test('Lucratividade · DAE 1023 não pago vai para crédito pendente e gera alerta', function () {
    var r = M.calcularItem(itemA100(function (x) { x.compra.daePago = false; }), params('REAL'));
    near(r.creditoIcmsPendente, 80, 1e-9, 'pendente');
    near(r.creditoIcms, 126, 1e-9, 'só ICMS destacado + frete');
    near(r.compra.basePisCofins, 880, 1e-9, 'o ICMS antecipado não entra nem sai da base de PIS/Cofins');
    ok(r.alertas.some(function (a) { return a.tipo === 'dae-1023-pendente'; }), 'alerta');
  });

  test('Lucratividade · item monofásico no Real: sem crédito de PIS/Cofins na compra e sem PIS/Cofins na venda', function () {
    var it = itemA100(function (x) { x.compra.regimePisCofins = 'MONOFASICO'; x.trib.regimePisCofins = 'MONOFASICO'; });
    var r = M.calcularItem(it, params('REAL'));
    eq(r.creditoPisCofins, 0, 'compra');
    var pc = r.sigmaDetalhe.componentes.filter(function (x) { return x.id === 'pis' || x.id === 'cofins'; });
    ok(pc.length === 2 && pc.every(function (x) { return x.aliq === 0; }), 'venda');
    var semTrib = M.calcularItem(itemA100(function (x) { x.compra.regimePisCofins = 'MONOFASICO'; x.trib = null; }), params('REAL'));
    ok(semTrib.sigmaDetalhe.componentes.filter(function (x) { return x.id === 'pis'; })[0].aliq === 0, 'tributação padrão herda o monofásico da compra');
  });

  test('Lucratividade · Σ + margem-alvo ≥ 100% devolve erro tratado, sem divisão por zero', function () {
    var e = M.precoParaMargem(100, { descontoTipo: 'pct', desconto: 0 }, 0.6, 0.4);
    ok(e.erro && e.pv === undefined, 'erro');
    var r = M.calcularItem(itemA100(function (x) { x.venda.comissao = 60; }), Object.assign(params('REAL'), { margemAlvo: 20 }));
    ok(r.pvAlvo === null && /100%/.test(r.pvAlvoErro), 'PV alvo indisponível com mensagem');
    ok(isFinite(r.lucro), 'resultado continua calculado');
  });

  test('Lucratividade · alterar o PV muda lucro e margem sem recalcular CL nem Σ', function () {
    var calc = M.calculadora(itemA100(), params('REAL'));
    var c0 = M.contagem.compra, s0 = M.contagem.sigma;
    var a = calc.resultado({ modo: 'PRECO_INFORMADO', precoVenda: 180, descontoTipo: 'pct', desconto: 2, comissao: 3, taxaCartao: 2.5 });
    var b = calc.resultado({ modo: 'PRECO_INFORMADO', precoVenda: 220, descontoTipo: 'pct', desconto: 2, comissao: 3, taxaCartao: 2.5 });
    eq(M.contagem.compra, c0, 'CL não recalculado'); eq(M.contagem.sigma, s0, 'Σ não recalculado');
    ok(b.lucro > a.lucro && b.margem > a.margem, 'lucro e margem mudam');
  });

  test('Lucratividade · totais ponderados: margem total = Σ lucros ÷ Σ PLD', function () {
    var p = params('REAL');
    var r1 = M.calcularItem(itemA100(), p);
    var r2 = M.calcularItem(itemA100(function (x) { x.quantidade = 5; x.compra.valorMercadoria = 400; x.compra.icmsDestacado = 48; x.venda.precoVenda = 150; }), p);
    var t = M.totais([r1, r2]);
    near(t.lucro, r1.lucroTotal + r2.lucroTotal, 1e-9);
    near(t.margem, (r1.lucroTotal + r2.lucroTotal) / (r1.pldTotal + r2.pldTotal), 1e-12);
    ok(Math.abs(t.margem - (r1.margem + r2.margem) / 2) > 1e-6, 'não é a média simples das margens');
  });

  test('Lucratividade · cenário desconhecido; desconto em R$ e IRPJ/CSLL presumidos', function () {
    var r = M.calcularItem(itemA100(), Object.assign(params('REAL'), { cenario: '2030' }));
    ok(r.erro && /2030/.test(r.erro), 'cenário sem configuração'); // 2027 tem testes próprios (lucro2027.test.js)
    var p = Object.assign(params('PRESUMIDO'), { considerarIrpjCsll: true });
    var s = M.calcularSigma(p, itemA100().trib, itemA100().venda);
    near(s.componentes.filter(function (x) { return x.id === 'irpj' || x.id === 'csll'; }).reduce(function (a, x) { return a + x.aliq; }, 0), 0.0228, 1e-12, '2,28% do PLD');
    var it = itemA100(function (x) { x.venda.descontoTipo = 'valor'; x.venda.desconto = 3.6; }); // R$ 3,60 por unidade = 2% de R$ 180
    var rv = M.calcularItem(it, params('REAL'));
    near(rv.lucroTotal, 281.04, 0.01, 'desconto em R$ equivalente');
    near(rv.pvMinimo, rv.custoLiquidoUnit / (1 - rv.sigma) + 3.6, 1e-9, 'PV mínimo com desconto fixo em R$ = CL ÷ (1 − Σ) + desconto');
  });

  // ------------------------------------------------------------------ importação (CSV da especificação)
  var I = Nexus.lucro.importar;
  var CSV_COMPRA = 'codigo;descricao;ncm;quantidade;valor_mercadoria;desconto_compra;frete;icms_frete;ipi;seguro_outros;icms_destacado;dae_valor;dae_codigo;dae_pago;regime_pis_cofins_item\n' +
    'A100;Torneira metal;84818019;10;1000,00;0,00;50,00;6,00;50,00;10,00;120,00;80,00;1023;S;NORMAL\n' +
    'B200;Chuveiro eletr.;85161000;5;400,00;0,00;20,00;0,00;0,00;0,00;0,00;72,00;1031;S;NORMAL\n';
  var CSV_TRIB = 'CÓDIGO;NCM;ICMS_ST;Aliq_ICMS_Venda;reducao_bc_icms;regime_pis_cofins_venda;das_aliquota_item\n' +
    'A100;84818019;N;20,00;0,00;NORMAL;\n' +
    'X999;85161000;S;0,00;0,00;NORMAL;\n';
  function abasCsv() { return Array.prototype.slice.call(arguments).map(function (t) { return Nexus.xlsx.lerCsv(t).abas[0]; }); }

  test('Lucratividade · importação lê as duas planilhas, casa por código e, na falta dele, por NCM', function () {
    var r = I.processar(abasCsv(CSV_COMPRA, CSV_TRIB), []);
    eq(r.compra.itens.length, 2);
    eq(r.compra.erros.length, 0);
    eq(r.tributacao.linhas.length, 2);
    var a = r.compra.itens[0];
    eq(a.codigo, 'A100');
    near(a.compra.valorMercadoria, 1000, 1e-9, 'decimal com vírgula');
    eq(a.compra.daeCodigo, '1023');
    eq(a.compra.daePago, true);
    var ap = r.aplicacoes.map(function (x) { return x.indice + ':' + x.por; }).join(',');
    ok(/0:codigo/.test(ap), 'A100 casado pelo código: ' + ap);
    ok(/1:ncm/.test(ap), 'B200 casado pelo NCM (código X999 não existe): ' + ap);
    eq(r.aplicacoes.filter(function (x) { return x.indice === 1; })[0].trib.icmsSt, true);
    var p = params('REAL');
    var it = { codigo: a.codigo, quantidade: a.quantidade, compra: a.compra, trib: r.aplicacoes[0].trib, venda: { modo: 'PRECO_INFORMADO', precoVenda: 180, descontoTipo: 'pct', desconto: 2, comissao: 3, taxaCartao: 2.5 } };
    near(M.calcularItem(it, p).lucroTotal, 281.04, 0.01, 'item importado reproduz o caso A100');
  });

  test('Lucratividade · importação bloqueia código de DAE inválido e linha sem campo obrigatório', function () {
    var csv = 'codigo;descricao;ncm;quantidade;valor_mercadoria;dae_valor;dae_codigo\n' +
      'A1;Item ok;84818019;1;100,00;;\n' +
      'A2;DAE errado;84818019;1;100,00;10,00;1099\n' +
      'A3;;84818019;1;100,00;;\n';
    var r = I.processar(abasCsv(csv), []);
    eq(r.compra.itens.length, 1, 'só a linha válida');
    eq(r.compra.erros.length, 2, 'duas linhas bloqueadas');
    ok(r.compra.erros.some(function (e) { return /1023|1031/.test(e.msg); }), 'mensagem cita os códigos aceitos');
  });

  test('Lucratividade · modelo novo: compra (13 colunas) e venda (3) na mesma linha, com cabeçalho legível', function () {
    var cols = I.COLUNAS_MODELO.map(function (c) { return c.rotulo + (c.obrig ? ' *' : ''); });
    eq(I.COLUNAS_MODELO.length, 24, '13 da compra + 3 da venda + 4 da tributação da venda + CBS e IBS (2027) + fornecedor e nota de 2027');
    eq(cols[0], 'Código do produto *'); eq(cols[12], 'Código do DAE'); eq(cols[13], 'Preço de venda por unidade (R$)'); eq(cols[15], 'Taxa de cartão (%)');
    var csv = 'COMPRA;;;;;;;;;;;;;VENDA;;\n' + cols.join(';') + '\n' +
      'A100;Torneira metal;84818019;10;1.000,00;0,00;50,00;6,00;50,00;10,00;120,00;80,00;1023;180,00;3;2,5\n' +
      'B200;Chuveiro;85161000;5;400,00;;;;;;;72,00;1031;;;\n' +
      'C300;Cano;39172300;2;30,00;;;;;;;;;25,00;150;\n';
    var r = I.processar(abasCsv(csv), []);
    eq(r.compra.itens.length, 2, 'duas linhas válidas');
    eq(r.compra.erros.length, 1, 'comissão de 150% bloqueia a linha');
    ok(/Comissão \(%\)/.test(r.compra.erros[0].msg), 'erro com o nome da coluna do modelo: ' + r.compra.erros[0].msg);
    eq(r.compra.comPreco, 1, 'um item com preço de venda');
    var a = r.compra.itens[0];
    near(a.compra.valorMercadoria, 1000, 1e-9); near(a.compra.icmsFrete, 6, 1e-9); near(a.compra.daeValor, 80, 1e-9); eq(a.compra.daeCodigo, '1023');
    near(a.venda.precoVenda, 180, 1e-9); near(a.venda.comissao, 3, 1e-9); near(a.venda.taxaCartao, 2.5, 1e-9);
    var b = r.compra.itens[1];
    ok(b.venda.precoVenda === null && b.venda.comissao === null, 'venda vazia fica para a venda padrão da análise');
    eq(r.alertas.length, 0, 'sem aba de tributação, nenhum alerta por item');
  });

  test('Lucratividade · planilha com a tributação da venda (ICMS, PIS e Cofins) já preenchida', function () {
    var cols = I.COLUNAS_MODELO.map(function (c) { return c.rotulo + (c.obrig ? ' *' : ''); });
    eq(cols.slice(16, 21).join(' | '), 'ICMS-ST na venda | Alíquota do ICMS na venda (%) | Redução da base do ICMS (%) | PIS/Cofins na venda | CBS e IBS do item (2027)');
    var csv = cols.join(';') + '\n' +
      'A1;Torneira;84818019;10;1000,00;;;;;;120,00;;;180,00;3;2,5;Não;20;0;Normal\n' +
      'B2;Óleo;27101932;20;800,00;;;;;;96,00;64,00;1031;45,00;;;Sim;;;Monofásico\n' +
      'C3;Parafuso;73181500;100;500,00;;;;;;60,00;;;4,00;;;;12;41,67;Alíquota zero\n' +
      'D4;Sem tributação;73181500;1;10,00;;;;;;;;;;;;;;;\n' +
      'E5;Erro;73181500;1;10,00;;;;;;;;;;;;Talvez;;;Normal\n';
    var r = I.processar(abasCsv(csv), []);
    eq(r.compra.itens.length, 4, 'uma linha bloqueada');
    ok(r.compra.erros.length === 1 && /ICMS-ST na venda/.test(r.compra.erros[0].msg), 'Sim/Não validado: ' + JSON.stringify(r.compra.erros));
    eq(r.compra.comTrib, 3);
    var a = r.compra.itens[0].trib, b = r.compra.itens[1].trib, c = r.compra.itens[2].trib;
    eq(a.icmsSt, false); near(a.aliqIcms, 20, 1e-9); eq(a.regimePisCofins, 'NORMAL');
    eq(b.icmsSt, true); eq(b.regimePisCofins, 'MONOFASICO');
    eq(c.icmsSt, false, 'vazio e sem DAE 1031: não é ST'); near(c.aliqIcms, 12, 1e-9); near(c.reducaoBcIcms, 41.67, 1e-9); eq(c.regimePisCofins, 'ALIQ_ZERO');
    eq(r.compra.itens[3].trib, null, 'sem colunas de tributação: padrão do regime');
    // o item importado usa a tributação da planilha no cálculo
    var p = params('REAL');
    var x = r.compra.itens[0];
    var res = M.calcularItem({ quantidade: x.quantidade, compra: x.compra, trib: x.trib, venda: { modo: 'PRECO_INFORMADO', precoVenda: 180, descontoTipo: 'pct', desconto: 0, comissao: 3, taxaCartao: 2.5 } }, p);
    near(res.sigma, 0.20 + 0.0925 * 0.8 + 0.055, 1e-9, 'Σ com o ICMS de 20% da planilha');
  });

  test('Lucratividade · tributação padrão: DAE 1031 sai sem ICMS na venda; sem alíquota de ICMS gera alerta', function () {
    var p = params('REAL'); p.aliqIcmsInternaPadrao = null;
    var st = M.calcularItem(itemA100(function (x) { x.trib = null; x.compra.daeCodigo = '1031'; }), p);
    eq(st.sigmaDetalhe.componentes.filter(function (c) { return c.id === 'icms'; })[0].aliq, 0, 'ICMS-ST: sem ICMS na venda');
    ok(!st.alertas.some(function (a) { return a.tipo === 'sem-aliquota-venda'; }), 'ST não precisa de alíquota');
    var sem = M.calcularItem(itemA100(function (x) { x.trib = null; }), p);
    ok(sem.alertas.some(function (a) { return a.tipo === 'sem-aliquota-venda'; }), 'alerta sem alíquota');
    p.aliqIcmsInternaPadrao = 20;
    var com = M.calcularItem(itemA100(function (x) { x.trib = null; }), p);
    ok(!com.alertas.length || !com.alertas.some(function (a) { return a.tipo === 'sem-aliquota-venda'; }), 'com ICMS padrão, sem alerta');
    near(com.sigma, 0.329, 1e-9, 'tributação padrão com 20% reproduz o Σ do A100');
  });

  test('Lucratividade · DRE do item (Lei 6.404, art. 187) fecha no lucro do item', function () {
    function linha(d, id) { return d.filter(function (x) { return x.id === id; })[0]; }
    var r = M.calcularItem(itemA100(), params('REAL'));
    var d = M.dre(r);
    near(linha(d, 'rb').valor, 180, 1e-9, 'receita bruta = PV');
    near(linha(d, 'desconto').valor, -3.6, 1e-9, 'desconto incondicional');
    near(linha(d, 'deducoes').valor, -(3.6 + 176.4 * (0.20 + 0.0925 * 0.8)), 1e-9, 'deduções = desconto + ICMS + PIS + Cofins');
    near(linha(d, 'rl').valor, 128.0664, 1e-4, 'receita líquida');
    near(linha(d, 'cmv').valor, -90.26, 1e-9, 'CMV = custo líquido de aquisição');
    near(linha(d, 'lb').valor, 37.8064, 1e-4, 'lucro bruto');
    near(linha(d, 'despesas').valor, -(5.292 + 4.41), 1e-9, 'comissão + cartão');
    eq(d[d.length - 1].nivel, 'final');
    near(d[d.length - 1].valor, r.lucro, 1e-9, 'fecha no lucro do item');
    ok(d.filter(function (x) { return x.nivel === 'sub'; }).map(function (x) { return x.id; }).join(',') === 'desconto,icms,pis,cofins,comissao,cartao', 'detalhe das deduções e despesas');
    // Presumido com IRPJ/CSLL presumidos: aparecem abaixo do resultado, não nas deduções
    var pp = Object.assign(params('PRESUMIDO'), { considerarIrpjCsll: true });
    var rp = M.calcularItem(itemA100(), pp), dp = M.dre(rp);
    near(linha(dp, 'antesIr').valor + linha(dp, 'ir').valor, rp.lucro, 1e-9, 'resultado − IRPJ/CSLL = lucro');
    near(linha(dp, 'ir').valor, -rp.pld * 0.0228, 1e-9, '2,28% do PLD');
    near(linha(dp, 'deducoes').valor, -(3.6 + rp.pld * (0.20 + 0.0365 * 0.8)), 1e-9, 'deduções só com desconto, ICMS, PIS e Cofins (IRPJ/CSLL fora)');
  });

  test('Lucratividade · DRE da MS 162 fecha com a planilha do escritório (lucro 286,42 por unidade)', function () {
    var it = {
      id: 'ms162', codigo: '2010', quantidade: 10,
      compra: { valorMercadoria: 7461.09, descontoCompra: 0, frete: 453.61, icmsFrete: 0, ipi: 387.98, seguroOutros: 0, icmsDestacado: 316.59, daeValor: 132.84, daeCodigo: '1023', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true },
      trib: { icmsSt: false, aliqIcms: 5.6, reducaoBcIcms: 0, regimePisCofins: 'NORMAL', dasAliquota: null },
      venda: { modo: 'PRECO_INFORMADO', precoVenda: 1189.41, descontoTipo: 'pct', desconto: 0, comissao: 0, taxaCartao: 0 }
    };
    var d = M.dre(M.calcularItem(it, params('REAL')));
    function v(id) { return d.filter(function (x) { return x.id === id; })[0].valor; }
    near(v('icms'), -66.60696, 1e-5, 'ICMS da venda');
    near(v('pis') + v('cofins'), -(18.52625 + 85.33303), 1e-4, 'PIS e Cofins sobre o preço sem ICMS');
    near(v('cmv'), -732.522375, 1e-6, 'custo de aquisição unitário da planilha');
    near(d[d.length - 1].valor, 286.42138, 1e-4, 'lucratividade a preço cheio');
  });
})();
