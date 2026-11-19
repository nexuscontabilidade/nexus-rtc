/*
 * RTC Comparativo — modelos de dados.
 * Empresa → Operações → Produtos (itens). Cada produto tem identificação, origem/destino/CFOP,
 * valores (quantidade × valor unitário), fornecedor, perfil tributário e venda próprios.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};

  function agora() { return new Date().toISOString(); }
  function clone(o) { return N.store.clone(o); }

  function novaEmpresa() {
    return {
      id: N.store.uid('emp'),
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      uf: '',
      municipio: '',
      regime: 'LR',                 // SN | LP | LR
      atividade: 'comercio',        // comercio | industria (estabelecimento industrial ou equiparado)
      contribuinteIcms: true,
      simples: { anexo: 'I', rbt12: null, ibsCbsForaDas2027: false },
      presumido: { receitaAnual: null, aplicarLC224: true },
      real: { lucroAnual: null },
      observacoes: '',
      criadoEm: agora(),
      atualizadoEm: agora()
    };
  }

  /** Produto (item) de uma operação — estrutura calculada pelo motor */
  function novoItem(empresa) {
    var uf = empresa ? empresa.uf : '';
    return {
      id: N.store.uid('item'),
      criadoEm: agora(),
      atualizadoEm: agora(),
      produto: { codigo: '', descricao: '', ncm: '', cest: '', cfopEntrada: '', cfopSaida: '', unidade: 'UN', quantidade: null },
      operacao: { tipo: 'interna', ufOrigem: uf, ufDestino: uf, destinatario: 'contribuinte', importado: false },
      // valor total dos produtos = quantidade × valor unitário (calculado pelo motor)
      valores: { valorUnitario: null, produtos: null, frete: null, freteNaNota: true, icmsFrete: null, seguro: null, despesas: null, desconto: null, ipi: null },
      fornecedor: {
        regime26: 'regular',          // regular | simples
        icmsSimplesPct: null,         // % de crédito de ICMS informado na NF do optante (LC 123, art. 23, § 1º)
        regime27: 'regular',          // regular | simples (IBS/CBS no DAS) | simples_regular (opção art. 41, § 3º)
        cbsSimplesPct: null,          // CBS paga no DAS pelo fornecedor optante (% sobre o valor)
        ibsSimplesPct: null,
        pisCofinsEmbutidoPct: null    // PIS/Cofins embutidos no preço do fornecedor (hipótese 2027)
      },
      perfil: {
        resumo: 'normal',
        regraId: null,
        icms: {
          tratamento: 'tributado',    // tributado | reducao_base | st | isento | diferido | outro
          aliqEntradaAuto: true, aliqEntrada: null, reducaoEntrada: null, valorEntradaInformado: null,
          aliqSaidaAuto: true, aliqSaida: null, reducaoSaida: null, estornoProporcional: true,
          fundamento: ''
        },
        st: { papel: 'substituido', modo: 'calculado', mva: null, ajustarMva: true, aliqInternaAuto: true, aliqInterna: null, valorInformado: null },
        // tipo: nenhum | antecipado (sem encerramento: crédito no regime normal, custo no Simples) | st (ICMS-ST na entrada: custo, encerra a tributação)
        antecipado: { tipo: 'nenhum', modo: 'diferencial', valor: null, mva: null, ajustarMva: true },
        ipi: { aliqEntrada: null, aliqSaida: null, mantido2027: false },
        pisCofins: { tratamento: 'normal', pisManual: null, cofinsManual: null, creditoManual: false, fundamento: '' },
        cbsIbs: { tratamento: 'padrao', reducaoPct: null, aliqCbsManual: null, aliqIbsManual: null, fundamento: '' }
      },
      creditos: { icms: true, ipi: true, pisCofins: true, cbs: true, ibs: true, antecipado: true, outros26: null, outros27: null },
      premissas: {
        excluirStBasePisCofins: false,
        excluirStBaseCbs: false,
        ipiNaBaseIcms: false,
        ibsCbsNaBaseIcms2027: true,
        liminarCbsForaBaseIcms2027: false, // liminar judicial da empresa: CBS fora da base do ICMS da venda (o IBS continua)
        valorProdutos2027: 'mesmo',   // mesmo | sem_pis_cofins | manual
        valorUnitario2027Manual: null,
        baseMargem: 'operacional',    // operacional | liquida
        baseDespesas: 'total',        // total | mercadoria
        manterPreco: 'total'          // total | mercadoria
      },
      venda: {
        modo: 'A',
        margem: null,
        despesas: [
          { descricao: 'Comissão sobre vendas', pct: null },
          { descricao: 'Taxa de cartão / meio de pagamento', pct: null }
        ],
        precoAtual: null,
        basePreco: 'total',          // 'total' (quantidade cadastrada) | 'unitario'
        precoUnitarioAtual: null
      },
      origens: {}
    };
  }

  /** Operação: agrupa os produtos de uma mesma compra/venda simulada */
  function novaOperacao(empresa, nome) {
    return {
      id: N.store.uid('sim'),
      empresaId: empresa ? empresa.id : null,
      nome: nome || 'Nova operação',
      criadoEm: agora(),
      atualizadoEm: agora(),
      itens: [],
      itemAtivoId: null
    };
  }

  function nomeItem(item, idx) {
    var d = item && item.produto && item.produto.descricao ? item.produto.descricao : 'Produto sem descrição';
    return 'Produto ' + (idx + 1) + ' · ' + d;
  }

  /** Converte uma simulação da versão anterior (um único produto, valor total) em operação com um produto. */
  function migrarOperacao(sim) {
    if (Array.isArray(sim.itens)) return sim;
    var base = novoItem();
    var item = { id: N.store.uid('item'), criadoEm: sim.criadoEm || agora(), atualizadoEm: sim.atualizadoEm || agora() };
    ['produto', 'operacao', 'valores', 'fornecedor', 'perfil', 'creditos', 'premissas', 'venda', 'origens'].forEach(function (k) {
      item[k] = sim[k] ? N.store.merge(base[k], clone(sim[k])) : base[k];
    });
    migrarAntecipacao(item);
    var q = Number(item.produto.quantidade);
    var total = Number(item.valores.produtos);
    if (!(q > 0)) { q = 1; item.produto.quantidade = 1; }
    item.valores.valorUnitario = isFinite(total) && total > 0 ? Math.round(total / q * 1e6) / 1e6 : null;
    var man = Number(item.premissas.valorProdutos2027Manual);
    item.premissas.valorUnitario2027Manual = isFinite(man) && man > 0 ? Math.round(man / q * 1e6) / 1e6 : null;
    return { id: sim.id, empresaId: sim.empresaId, nome: sim.nome || 'Operação', criadoEm: sim.criadoEm || agora(), atualizadoEm: sim.atualizadoEm || agora(), itens: [item], itemAtivoId: item.id };
  }

  // ---------------------------------------------------------------- natureza da operação e CFOP
  var NATUREZA = { interna: 'Interna', interestadual: 'Interestadual', importacao: 'Importação', outra: 'Outra' };
  /** Campos que definem a natureza da operação (NF): iguais para todos os produtos */
  var CAMPOS_OPERACAO = ['operacao.tipo', 'operacao.ufOrigem', 'operacao.ufDestino', 'operacao.destinatario'];

  function digitos(s) { return String(s || '').replace(/\D/g, ''); }

  /** Primeiro dígito exigido no CFOP: entrada 1/2/3 (interna/interestadual/importação); saída 5/6 (interna/interestadual) */
  function cfopEsperado(item, emp) {
    var op = item.operacao || {};
    var ufEmp = emp && emp.uf;
    var vendaInter = !!(op.ufDestino && ufEmp && op.ufDestino !== ufEmp);
    return {
      entrada: { interna: '1', interestadual: '2', importacao: '3' }[op.tipo] || null,
      saida: ufEmp ? (vendaInter ? '6' : '5') : null,
      natureza: NATUREZA[op.tipo] || op.tipo,
      vendaInter: vendaInter
    };
  }

  /** Ajusta o primeiro dígito dos CFOPs à natureza (ex.: 2.102 → 1.102 quando a operação passa a ser interna) */
  function ajustarCfops(item, emp) {
    var esp = cfopEsperado(item, emp);
    var n = 0;
    [['cfopEntrada', esp.entrada, '123'], ['cfopSaida', esp.saida, '56']].forEach(function (c) {
      var d = digitos(item.produto[c[0]]);
      if (d.length === 4 && c[1] && c[2].indexOf(d[0]) >= 0 && d[0] !== c[1]) {
        item.produto[c[0]] = String(item.produto[c[0]]).replace(/\d/, c[1]);
        n++;
      }
    });
    return n;
  }

  /**
   * Aplica um campo de natureza da operação a TODOS os produtos, mantendo tipo × UF de origem
   * e os CFOPs coerentes. Retorna quantos CFOPs foram ajustados.
   */
  function aplicarCampoOperacao(op, path, val, emp) {
    var ajustes = 0;
    op.itens.forEach(function (it) {
      N.store.setPath(it, path, val);
      if (path === 'operacao.tipo' && emp && emp.uf) {
        if (val === 'interna') it.operacao.ufOrigem = emp.uf;
        else if (val === 'interestadual' && it.operacao.ufOrigem === emp.uf) it.operacao.ufOrigem = '';
      }
      if (path === 'operacao.ufOrigem' && emp && emp.uf && val) {
        if (it.operacao.tipo === 'interna' && val !== emp.uf) it.operacao.tipo = 'interestadual';
        else if (it.operacao.tipo === 'interestadual' && val === emp.uf) it.operacao.tipo = 'interna';
      }
      ajustes += ajustarCfops(it, emp);
    });
    return ajustes;
  }

  /** Novo produto que herda a natureza da operação (tipo, UFs e destinatário do primeiro produto) */
  function novoItemNaOperacao(op, emp) {
    var it = novoItem(emp);
    if (op && op.itens.length) {
      CAMPOS_OPERACAO.forEach(function (p) { N.store.setPath(it, p, clone(N.store.getPath(op.itens[0], p))); });
    }
    return it;
  }

  /** Divergências de natureza ou de grupo de CFOP entre os produtos de uma operação (referência: produto 1) */
  function inconsistencias(op, emp) {
    var out = [];
    if (!op || op.itens.length < 2) return out;
    var ref = op.itens[0];
    var espRef = cfopEsperado(ref, emp);
    var ROT = { 'operacao.tipo': 'tipo de operação', 'operacao.ufOrigem': 'UF de origem', 'operacao.ufDestino': 'UF de destino', 'operacao.destinatario': 'destinatário da venda' };
    op.itens.forEach(function (it, i) {
      if (i === 0) return;
      CAMPOS_OPERACAO.forEach(function (p) {
        var a = N.store.getPath(ref, p), b = N.store.getPath(it, p);
        if ((a || '') !== (b || '')) {
          out.push({ itemId: it.id, idx: i, campo: p, msg: 'Natureza diferente do produto 1: ' + ROT[p] + ' "' + (p === 'operacao.tipo' ? NATUREZA[b] || b : b || '—') + '" × "' + (p === 'operacao.tipo' ? NATUREZA[a] || a : a || '—') + '". Todos os produtos de uma operação devem ter a mesma natureza — cadastre produtos de outra natureza em outra operação.' });
        }
      });
      var ce = digitos(it.produto.cfopEntrada), ceRef = digitos(ref.produto.cfopEntrada);
      if (ce && ceRef && ce[0] !== ceRef[0]) out.push({ itemId: it.id, idx: i, campo: 'produto.cfopEntrada', msg: 'CFOP de entrada ' + ce + ' de grupo diferente do produto 1 (' + ceRef + ', ' + espRef.natureza.toLowerCase() + ').' });
      var cs = digitos(it.produto.cfopSaida), csRef = digitos(ref.produto.cfopSaida);
      if (cs && csRef && cs[0] !== csRef[0]) out.push({ itemId: it.id, idx: i, campo: 'produto.cfopSaida', msg: 'CFOP de saída ' + cs + ' de grupo diferente do produto 1 (' + csRef + ').' });
    });
    return out;
  }

  /** Natureza da operação em texto (a partir do primeiro produto) */
  function naturezaTexto(op, emp) {
    if (!op || !op.itens.length) return 'Natureza definida no primeiro produto';
    var o = op.itens[0].operacao;
    return (NATUREZA[o.tipo] || o.tipo) + ' · ' + (o.ufOrigem || '—') + ' → ' + ((emp && emp.uf) || '—') + ' → ' + (o.ufDestino || '—');
  }

  /** Tipo de recolhimento do ICMS na entrada (aceita o formato anterior: aplica/encerra) */
  function tipoAntecipacao(ant) {
    if (!ant) return 'nenhum';
    if (ant.tipo) return ant.tipo;
    if (!ant.aplica) return 'nenhum';
    return ant.encerra ? 'st' : 'antecipado';
  }

  /** Converte a antecipação do formato anterior (aplica/encerra) para o atual (tipo). Retorna true se alterou. */
  function migrarAntecipacao(item) {
    var ant = item && item.perfil && item.perfil.antecipado;
    if (!ant || ant.tipo) return false;
    ant.tipo = tipoAntecipacao(ant);
    if (ant.tipo === 'st' && ant.modo === 'diferencial') ant.modo = 'mva';
    if (ant.mva === undefined) ant.mva = null;
    if (ant.ajustarMva === undefined) ant.ajustarMva = true;
    delete ant.aplica;
    delete ant.encerra;
    return true;
  }

  /**
   * Muda a base do preço informado do produto ('total' | 'unitario') sem alterar o preço:
   * total → unitário: preço unitário = preço total ÷ quantidade; unitário → total: preço total = quantidade × unitário.
   */
  function aplicarBasePreco(item, base) {
    var v = item.venda;
    var q = Number(item.produto.quantidade);
    base = base === 'unitario' ? 'unitario' : 'total';
    if (v.basePreco === base) return false;
    function has(x) { return x !== null && x !== undefined && x !== '' && isFinite(Number(x)); }
    if (base === 'unitario' && q > 0 && has(v.precoAtual)) v.precoUnitarioAtual = Math.round(Number(v.precoAtual) / q * 1e6) / 1e6;
    if (base === 'total' && q > 0 && has(v.precoUnitarioAtual)) v.precoAtual = Math.round(Number(v.precoUnitarioAtual) * q * 100) / 100;
    v.basePreco = base;
    return true;
  }

  /** Dados anteriores: produto por unidade sem preço unitário — completa a partir do preço total. Retorna true se alterou. */
  function migrarBasePreco(item) {
    var v = item && item.venda;
    var q = item ? Number(item.produto.quantidade) : 0;
    if (!v || v.basePreco !== 'unitario' || !(q > 0)) return false;
    var semUnit = v.precoUnitarioAtual === null || v.precoUnitarioAtual === undefined || v.precoUnitarioAtual === '';
    if (!semUnit || v.precoAtual === null || v.precoAtual === undefined || v.precoAtual === '' || !isFinite(Number(v.precoAtual))) return false;
    v.precoUnitarioAtual = Math.round(Number(v.precoAtual) / q * 1e6) / 1e6;
    return true;
  }

  /**
   * Preenche a empresa com os dados da Receita Federal (consulta CNPJá) e devolve avisos ao usuário.
   * Preenche: CNPJ, razão social, nome fantasia, UF, município; atividade pelo CNAE principal (divisões 10–33
   * indústria, 45–47 comércio); regime Simples Nacional e anexo quando optante. A Receita não informa se a empresa
   * é do Lucro Presumido ou do Real, nem a RBT12: esses dados continuam com o escritório.
   */
  function aplicarReceita(emp, r) {
    var avisos = [];
    emp.origens = emp.origens || {};
    function set(path, val) { N.store.setPath(emp, path, val); emp.origens[path] = 'receita'; }
    if (r.cnpj) set('cnpj', N.fmt.cnpj(r.cnpj));
    if (r.razaoSocial) set('razaoSocial', r.razaoSocial);
    set('nomeFantasia', r.nomeFantasia || '');
    if (r.endereco && r.endereco.uf) set('uf', r.endereco.uf);
    if (r.endereco && r.endereco.municipio) set('municipio', r.endereco.municipio);
    var divisao = r.cnaePrincipal ? Math.floor(Number(r.cnaePrincipal.id) / 100000) : null;
    var atividade = divisao >= 10 && divisao <= 33 ? 'industria' : (divisao >= 45 && divisao <= 47 ? 'comercio' : null);
    if (atividade) set('atividade', atividade);
    else if (r.cnaePrincipal) avisos.push('Atividade principal (CNAE ' + r.cnaePrincipal.codigo + ' — ' + r.cnaePrincipal.texto + ') não é de comércio nem de indústria: confira a atividade na operação.');
    if (r.simples && r.simples.optante) {
      set('regime', 'SN');
      if (atividade) set('simples.anexo', atividade === 'industria' ? 'II' : 'I');
      if (r.simei && r.simei.optante) avisos.push('Empresa optante pelo SIMEI (MEI): recolhe valores fixos mensais, e a alíquota efetiva dos Anexos do Simples não se aplica. Confira antes de simular.');
      else if (!emp.simples || !emp.simples.rbt12) avisos.push('Optante pelo Simples Nacional: informe a RBT12 para calcular a alíquota efetiva.');
    } else if (emp.regime === 'SN') {
      avisos.push('A Receita indica que a empresa não é optante pelo Simples Nacional: altere o regime para Lucro Presumido ou Lucro Real.');
    } else {
      avisos.push('Não optante pelo Simples Nacional: a Receita não informa se o regime é Lucro Presumido ou Lucro Real. Confirme o regime.');
    }
    if (r.situacao && r.situacao.toLowerCase() !== 'ativa') avisos.push('Situação cadastral na Receita: ' + r.situacao + (r.situacaoData ? ' desde ' + N.fmt.date(r.situacaoData) : '') + '.');
    if (r.matriz === false) avisos.push('O CNPJ informado é de uma filial.');
    emp.receita = r;
    emp.atualizadoEm = agora();
    return { avisos: avisos };
  }

  /** Cópia de um produto com novo identificador (sem o vínculo com o outro módulo: é um produto novo) */
  function duplicarItem(item) {
    var c = clone(item);
    c.id = N.store.uid('item');
    delete c.sync; delete c.origemModulo;
    c.criadoEm = c.atualizadoEm = agora();
    c.produto.descricao = (item.produto.descricao || 'Produto') + ' (cópia)';
    return c;
  }

  /** Exemplo ilustrativo (valores fictícios) para demonstração em reunião */
  function exemplo() {
    var emp = novaEmpresa();
    emp.razaoSocial = 'Comercial Exemplo Ltda (ilustrativo)';
    emp.nomeFantasia = 'Exemplo';
    emp.uf = 'CE';
    emp.regime = 'LR';
    emp.real.lucroAnual = 600000;
    emp.observacoes = 'Empresa fictícia para demonstração. Alíquotas de ICMS informadas manualmente apenas para ilustrar o cálculo.';
    var op = novaOperacao(emp, 'Exemplo — compra de mercadorias para revenda');

    function base(it) {
      it.produto.cfopEntrada = '2102';
      it.produto.cfopSaida = '5102';
      it.operacao.tipo = 'interestadual';
      it.operacao.ufOrigem = 'SP';
      it.operacao.ufDestino = 'CE';
      it.perfil.icms.aliqSaidaAuto = false;
      it.perfil.icms.aliqSaida = 20;
      it.perfil.icms.fundamento = 'Alíquota ilustrativa — confirme no RICMS da UF';
      it.venda.margem = 15;
      it.venda.despesas[0].pct = 3;
      it.venda.despesas[1].pct = 2;
      it.origens = { 'perfil.icms.aliqSaida': 'usuario' };
      return it;
    }
    var a = base(novoItem(emp));
    a.produto.descricao = 'Mercadoria A (exemplo)';
    a.produto.quantidade = 100;
    a.valores.valorUnitario = 100;
    a.valores.frete = 300;
    a.venda.precoAtual = 18000;

    var b = base(novoItem(emp));
    b.produto.descricao = 'Mercadoria B com IPI (exemplo)';
    b.produto.quantidade = 50;
    b.valores.valorUnitario = 80;
    b.valores.ipi = 200;
    b.venda.precoAtual = 6900;

    op.itens = [a, b];
    op.itemAtivoId = a.id;
    return { empresa: emp, simulacao: op };
  }

  RTC.model = {
    novaEmpresa: novaEmpresa,
    novoItem: novoItem,
    novaOperacao: novaOperacao,
    novaSimulacao: novaOperacao,   // compatibilidade
    nomeItem: nomeItem,
    migrarOperacao: migrarOperacao,
    duplicarItem: duplicarItem,
    aplicarBasePreco: aplicarBasePreco,
    migrarBasePreco: migrarBasePreco,
    aplicarReceita: aplicarReceita,
    NATUREZA: NATUREZA,
    tipoAntecipacao: tipoAntecipacao,
    migrarAntecipacao: migrarAntecipacao,
    CAMPOS_OPERACAO: CAMPOS_OPERACAO,
    cfopEsperado: cfopEsperado,
    ajustarCfops: ajustarCfops,
    aplicarCampoOperacao: aplicarCampoOperacao,
    novoItemNaOperacao: novoItemNaOperacao,
    inconsistencias: inconsistencias,
    naturezaTexto: naturezaTexto,
    exemplo: exemplo,
    agora: agora
  };
})(typeof window !== 'undefined' ? window : globalThis);
