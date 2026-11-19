/*
 * Lucratividade por Item — importação da planilha de itens (.xlsx ou .csv; separador ";", decimal ","), modelo para
 * download e prévia antes de gravar.
 * Modelo: uma linha por item, com a compra (valores do total do item na NF-e) e a venda (preço por unidade, comissão
 * e taxa de cartão). Cabeçalho reconhecido por nome (sem acento, maiúsculas, "(R$)" ou "(%)"); os nomes antigos em
 * snake_case continuam aceitos. A planilha de tributação de venda (aba própria, ligada pelo código ou NCM) é opcional.
 * Planilha de atualização para 2027: exportada com os produtos da análise (valores de 2026 até serem atualizados), o
 * cliente atualiza a compra com a nota de 2027 e informa a CBS e o IBS destacados; reimportada, atualiza só o cenário 2027.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var LC = N.lucro = N.lucro || {};
  var F = N.fmt;

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/r\$|%/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function vazio(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

  // colunas: id interno, rótulo do modelo, outros nomes aceitos no cabeçalho, tipo e obrigatoriedade.
  // `modelo: false` = aceita na importação, mas fica fora do modelo (colunas avançadas).
  var COMPRA = [
    { id: 'codigo', rotulo: 'Código do produto', nomes: ['codigo', 'cod', 'codigo_item', 'cod_item'], tipo: 'texto', obrig: true, desc: 'Código do item no seu cadastro.' },
    { id: 'descricao', rotulo: 'Descrição', nomes: ['descricao', 'produto', 'descricao_produto', 'descricao_item'], tipo: 'texto', obrig: true, desc: 'Nome do produto.' },
    { id: 'ncm', rotulo: 'NCM', nomes: ['ncm'], tipo: 'codigo', obrig: true, desc: 'NCM com 8 dígitos.' },
    { id: 'quantidade', rotulo: 'Quantidade', nomes: ['quantidade', 'qtd', 'qtde'], tipo: 'num', obrig: true, positivo: true, desc: 'Quantidade comprada. Os valores de compra são do total do item na nota.' },
    { id: 'valorMercadoria', rotulo: 'Valor da mercadoria (R$)', nomes: ['valor_mercadoria', 'valor_mercadorias', 'valor_produtos', 'valor_produto'], tipo: 'num', obrig: true, positivo: true, desc: 'Valor total do item na NF-e (quantidade × valor unitário).' },
    { id: 'descontoCompra', rotulo: 'Descontos incondicionais (R$)', nomes: ['desconto_compra', 'desconto', 'descontos'], tipo: 'num', desc: 'Desconto destacado na NF-e, sem condição para valer.' },
    { id: 'frete', rotulo: 'Frete (R$)', nomes: ['frete'], tipo: 'num', desc: 'Frete do item, na NF-e ou rateado do CT-e. Entra no custo.' },
    { id: 'icmsFrete', rotulo: 'ICMS do frete – CT-e (R$)', nomes: ['icms_frete', 'icms_do_frete', 'icms_cte'], tipo: 'num', desc: 'ICMS destacado no CT-e, quando o frete é contratado à parte.' },
    { id: 'ipi', rotulo: 'IPI (R$)', nomes: ['ipi', 'valor_ipi'], tipo: 'num', desc: 'IPI destacado pelo fornecedor.' },
    { id: 'seguroOutros', rotulo: 'Seguro e outras despesas (R$)', nomes: ['seguro_outros', 'seguro', 'outras_despesas'], tipo: 'num', desc: 'Seguro e outras despesas acessórias da nota.' },
    { id: 'icmsDestacado', rotulo: 'ICMS destacado na NF-e (R$)', nomes: ['icms_destacado', 'icms', 'valor_icms'], tipo: 'num', desc: 'ICMS próprio do item destacado na NF-e.' },
    { id: 'daeValor', rotulo: 'DAE – valor (R$)', nomes: ['dae_valor', 'valor_dae', 'dae'], tipo: 'num', desc: 'Valor do DAE do item.' },
    { id: 'daeCodigo', rotulo: 'Código do DAE', nomes: ['dae_codigo', 'codigo_dae', 'cod_dae'], tipo: 'codigo', desc: '1023 (ICMS Antecipado: crédito de ICMS depois do pagamento) ou 1031 (ICMS-ST: custo, sem crédito de ICMS). Obrigatório quando há valor de DAE.' },
    { id: 'daePago', nomes: ['dae_pago', 'pago'], tipo: 'sn', modelo: false, desc: 'S ou N. Sem o pagamento, o crédito do 1023 fica a apropriar. Padrão: S.' },
    { id: 'regimePisCofins', nomes: ['regime_pis_cofins_item', 'regime_pis_cofins'], tipo: 'regime', modelo: false, desc: 'NORMAL, MONOFASICO, ALIQ_ZERO, ISENTO ou SUSPENSO (usado no Lucro Real). Padrão: NORMAL.' },
    { id: 'fornecedorPjBrasil', nomes: ['fornecedor_pj_brasil', 'fornecedor_pj'], tipo: 'sn', modelo: false, desc: 'S ou N (usado no Lucro Real). N bloqueia o crédito de PIS/Cofins. Padrão: S.' }
  ];
  // venda na mesma linha do item; vazio = vale a venda padrão da análise
  var VENDA = [
    { id: 'precoVenda', rotulo: 'Preço de venda por unidade (R$)', nomes: ['preco_venda', 'preco_de_venda', 'preco_venda_unitario', 'preco_de_venda_unitario'], tipo: 'num', positivo: true, desc: 'Preço de 1 unidade. Vazio: o preço é definido na tela Venda.' },
    { id: 'comissao', rotulo: 'Comissão (%)', nomes: ['comissao', 'comissao_venda'], tipo: 'pct', desc: 'Só o número: 3 para 3%. Vazio: vale a venda padrão da análise.' },
    { id: 'taxaCartao', rotulo: 'Taxa de cartão (%)', nomes: ['taxa_cartao', 'taxa_de_cartao', 'cartao'], tipo: 'pct', desc: 'Só o número: 2,5 para 2,5%. Vazio: vale a venda padrão da análise.' },
    // tributação da venda na mesma linha (vazio = tributação padrão: ICMS de Parâmetros; ICMS-ST quando o DAE é 1031)
    { id: 'icmsStVenda', rotulo: 'ICMS-ST na venda', nomes: ['icms_st_venda', 'icms_st'], tipo: 'sn', lista: ['Sim', 'Não'], trib: true, desc: 'Sim: o item está na substituição tributária e sai sem ICMS. Vazio: Não (ou Sim, quando o DAE é 1031).' },
    { id: 'aliqIcmsVenda', rotulo: 'Alíquota do ICMS na venda (%)', nomes: ['aliq_icms_venda', 'aliquota_icms_venda', 'aliq_icms'], tipo: 'pct', trib: true, desc: 'Só o número: 20 para 20%. Vazio: o ICMS interno padrão de Parâmetros.' },
    { id: 'reducaoBcIcmsVenda', rotulo: 'Redução da base do ICMS (%)', nomes: ['reducao_bc_icms', 'reducao_base_icms', 'reducao_bc'], tipo: 'pct', trib: true, desc: 'Percentual de redução da base de cálculo do ICMS na venda. Vazio: sem redução.' },
    { id: 'regimePisCofinsVenda', rotulo: 'PIS/Cofins na venda', nomes: ['regime_pis_cofins_venda', 'pis_cofins_venda'], tipo: 'regime', lista: ['Normal', 'Monofásico', 'Alíquota zero', 'Isento', 'Suspenso'], trib: true, desc: 'Normal, Monofásico, Alíquota zero, Isento ou Suspenso. Vazio: o mesmo da compra (padrão: Normal).' },
    // cenário 2027 (LC 214/2025): tratamento de CBS e IBS do item, na compra e na venda
    { id: 'cbsIbsItem', rotulo: 'CBS e IBS do item (2027)', nomes: ['cbs_ibs_item', 'cbs_ibs', 'tratamento_cbs_ibs'], tipo: 'cbsibs', lista: ['Normal', 'Redução de 30%', 'Redução de 60%', 'Alíquota zero', 'Isento'], reforma: true, desc: 'Cenário 2027 (LC 214/2025): Normal, Redução de 30%, Redução de 60%, Alíquota zero ou Isento, conforme o NCM. Vale para a compra e para a venda. Vazio: Normal.' }
  ];
  // fornecedor e nota de 2027 (faixa própria no fim do modelo): com a CBS e o IBS destacados, o cenário 2027 usa a nota, sem projeção
  var NF27 = [
    { id: 'fornecedorSimples', rotulo: 'Fornecedor do Simples Nacional', nomes: ['fornecedor_simples', 'fornecedor_simples_nacional', 'fornecedor_optante', 'optante_simples'], tipo: 'sn', lista: ['Sim', 'Não'], nf27: true, desc: 'Sim quando o fornecedor é optante do Simples Nacional: em 2027, a CBS e o IBS dele ficam dentro do DAS, sem destaque por fora, e o produto não é marcado como "dados de 2026". O ICMS informado é o crédito indicado na nota (LC 123/2006, art. 23, § 1º). Vazio: Não.' },
    { id: 'cbsDestacada', rotulo: 'CBS destacada na NF-e 2027 (R$)', nomes: ['cbs_destacada', 'cbs_nf', 'valor_cbs', 'cbs'], tipo: 'num', nf27: true, desc: 'CBS destacada na nota de 2027 (total do item). Com a CBS ou o IBS informado, o cenário 2027 usa o ICMS, a CBS e o IBS da nota. Vazio: valores projetados a partir dos dados de 2026, e o produto fica marcado com o sinal de alerta.' },
    { id: 'ibsDestacado', rotulo: 'IBS destacado na NF-e 2027 (R$)', nomes: ['ibs_destacado', 'ibs_nf', 'valor_ibs', 'ibs'], tipo: 'num', nf27: true, desc: 'IBS destacado na nota de 2027 (estadual + municipal, total do item). Fornecedor do Simples: a CBS e o IBS pagos por ele, quando a nota informar (viram crédito: LC 214/2025, art. 47, § 9º).' }
  ];
  var ITEM = COMPRA.concat(VENDA).concat(NF27);
  var TRIB = [
    { id: 'codigo', nomes: ['codigo', 'cod', 'codigo_item'], tipo: 'texto', desc: 'Código do item (o mesmo da planilha de compra).' },
    { id: 'ncm', nomes: ['ncm'], tipo: 'codigo', desc: 'NCM — chave de reserva quando o código não casa.' },
    { id: 'icmsSt', nomes: ['icms_st', 'st'], tipo: 'sn', desc: 'S quando o item está na substituição tributária (sem ICMS na venda).' },
    { id: 'aliqIcms', nomes: ['aliq_icms_venda', 'aliquota_icms_venda', 'aliq_icms'], tipo: 'num', desc: 'Alíquota do ICMS na venda (%).' },
    { id: 'reducaoBcIcms', nomes: ['reducao_bc_icms', 'reducao_base_icms', 'reducao_bc'], tipo: 'num', desc: 'Redução da base de cálculo do ICMS (%).' },
    { id: 'regimePisCofins', nomes: ['regime_pis_cofins_venda', 'regime_pis_cofins'], tipo: 'regime', desc: 'NORMAL, MONOFASICO, ALIQ_ZERO, ISENTO ou SUSPENSO.' },
    { id: 'dasAliquota', nomes: ['das_aliquota_item', 'das_aliquota', 'aliquota_das'], tipo: 'num', desc: 'Simples: alíquota do DAS do item (%). Item com ST ou antecipado: sem a parcela do ICMS.' }
  ];
  var REGIMES_PC = { normal: 'NORMAL', monofasico: 'MONOFASICO', aliq_zero: 'ALIQ_ZERO', aliquota_zero: 'ALIQ_ZERO', zero: 'ALIQ_ZERO', isento: 'ISENTO', isencao: 'ISENTO', suspenso: 'SUSPENSO', suspensao: 'SUSPENSO' };

  function indice(cols) {
    var m = {};
    cols.forEach(function (c) { c.nomes.concat(c.rotulo ? [c.rotulo] : []).forEach(function (x) { m[norm(x)] = c; }); });
    return m;
  }
  // planilha de atualização para 2027 (exportada pelo sistema com os produtos da análise)
  function colDe(id, extra) { return Object.assign({}, COMPRA.concat(NF27).filter(function (c) { return c.id === id; })[0], extra || {}); }
  var ATUAL = [
    { id: 'idControle', rotulo: 'ID de controle (não altere)', nomes: ['id_de_controle', 'id_controle'], tipo: 'texto', grupo: 'produto', desc: 'Liga a linha ao produto cadastrado. Não altere. Linha sem ID (ou com ID desconhecido) é ligada pelo código; sem código igual, vira produto novo.' },
    colDe('codigo', { obrig: false, grupo: 'produto', desc: 'Identifica o produto. Mudanças no código, na descrição e no NCM de produtos já cadastrados não são gravadas (use a ficha do item); servem para cadastrar produtos novos.' }),
    colDe('descricao', { obrig: false, grupo: 'produto', desc: 'Nome do produto.' }),
    colDe('ncm', { obrig: false, grupo: 'produto', desc: 'NCM com 8 dígitos.' }),
    colDe('quantidade', { grupo: 'compra', desc: 'Quantidade da nota.' }),
    { id: 'valorUnitario', rotulo: 'Valor unitário (R$)', nomes: ['valor_unitario', 'preco_unitario', 'valor_unit', 'custo_unitario'], tipo: 'num', grupo: 'compra', desc: 'Preço de compra de 1 unidade. Mude o unitário ou o total: o outro é recalculado. Se mudar os dois e eles não baterem, vale o unitário.' },
    colDe('valorMercadoria', { rotulo: 'Valor total (R$)', nomes: ['valor_total', 'valor_mercadoria', 'valor_total_mercadoria'], obrig: false, grupo: 'compra', desc: 'Quantidade × valor unitário: o total da mercadoria do item na nota.' }),
    colDe('descontoCompra', { grupo: 'compra' }), colDe('frete', { grupo: 'compra' }), colDe('icmsFrete', { grupo: 'compra' }), colDe('ipi', { grupo: 'compra' }),
    colDe('seguroOutros', { grupo: 'compra' }), colDe('icmsDestacado', { grupo: 'compra', desc: 'ICMS próprio destacado na nota de 2027 (com a CBS e o IBS na base, conforme o fisco). Fornecedor do Simples: o crédito de ICMS indicado na nota.' }),
    colDe('daeValor', { grupo: 'compra' }), colDe('daeCodigo', { grupo: 'compra', lista: ['1023', '1031'] }), colDe('fornecedorSimples', { grupo: 'compra' }),
    colDe('cbsDestacada', { grupo: 'iva' }), colDe('ibsDestacado', { grupo: 'iva' })
  ];
  var IDX_ITEM = indice(ITEM), IDX_TRIB = indice(TRIB), IDX_ATUAL = indice(ATUAL);

  /** Localiza a linha de cabeçalho e mapeia colunas (precisa casar ao menos `minimo` colunas exclusivas) */
  function cabecalho(linhas, idx, chaves) {
    for (var r = 0; r < Math.min(15, linhas.length); r++) {
      var row = linhas[r] || [], mapa = {}, hits = 0;
      row.forEach(function (cel, ci) {
        var c = idx[norm(cel)];
        if (c && mapa[c.id] == null) { mapa[c.id] = ci; hits++; }
      });
      if (chaves.every(function (k) { return mapa[k] != null; }) && hits >= 3) return { linha: r, mapa: mapa };
    }
    return null;
  }

  function converter(c, raw) {
    var s = typeof raw === 'string' ? raw.trim() : raw;
    if (c.tipo === 'texto') return { valor: String(s) };
    if (c.tipo === 'codigo') {
      var t = typeof s === 'number' ? String(Math.round(s)) : String(s).trim();
      if (c.id === 'ncm' && /^\d{7}$/.test(t)) t = '0' + t;
      return { valor: t };
    }
    if (c.tipo === 'num') {
      var x = typeof s === 'number' ? s : F.parse(String(s));
      if (x == null || typeof x !== 'number' || isNaN(x)) return { erro: 'número inválido: "' + s + '"' };
      if (x < 0) return { erro: 'não pode ser negativo' };
      if (c.positivo && !(x > 0)) return { erro: 'deve ser maior que zero' };
      return { valor: x };
    }
    if (c.tipo === 'pct') {
      var pc = typeof s === 'number' ? s : F.parse(String(s));
      if (pc == null || typeof pc !== 'number' || isNaN(pc)) return { erro: 'percentual inválido: "' + s + '"' };
      if (pc < 0 || pc >= 100) return { erro: 'use um percentual entre 0 e 100 (3 para 3%)' };
      return { valor: pc };
    }
    if (c.tipo === 'sn') {
      var k = norm(s);
      if (['s', 'sim', 'true', '1', 'x', 'y', 'yes'].indexOf(k) >= 0 || s === true) return { valor: true };
      if (['n', 'nao', 'false', '0', 'no'].indexOf(k) >= 0 || s === false) return { valor: false };
      return { erro: 'use S ou N (recebido "' + s + '")' };
    }
    if (c.tipo === 'cbsibs') {
      var kc = norm(s), mc = kc.match(/(\d+(?:_\d+)?)/);
      if (kc === 'normal' || kc === 'aliquota_de_referencia') return { valor: { regime: 'NORMAL', reducao: null } };
      if (/^(aliq(uota)?_)?zero$/.test(kc)) return { valor: { regime: 'ALIQ_ZERO', reducao: null } };
      if (/^isen(to|cao)$/.test(kc)) return { valor: { regime: 'ISENTO', reducao: null } };
      if (/^reducao/.test(kc) && mc) {
        var rd = Number(mc[1].replace('_', '.'));
        if (rd > 0 && rd < 100) return { valor: { regime: 'REDUCAO', reducao: rd } };
      }
      return { erro: 'use Normal, Redução de 30%, Redução de 60%, Alíquota zero ou Isento (recebido "' + s + '")' };
    }
    if (c.tipo === 'regime') {
      var rg = REGIMES_PC[norm(s)];
      return rg ? { valor: rg } : { erro: 'regime de PIS/Cofins inválido: "' + s + '" (use NORMAL, MONOFASICO, ALIQ_ZERO, ISENTO ou SUSPENSO)' };
    }
    return { valor: s };
  }

  /** Nome da coluna nas mensagens: o rótulo do modelo ou, nas colunas avançadas, o nome técnico */
  function nomeCol(c) { return c.rotulo || c.nomes[0]; }

  function lerLinha(row, cab, cols) {
    var v = {}, erros = [];
    cols.forEach(function (c) {
      var ci = cab.mapa[c.id];
      if (ci == null) return;
      var raw = row[ci];
      if (vazio(raw)) return;
      var x = converter(c, raw);
      if (x.erro) erros.push(nomeCol(c) + ': ' + x.erro); else v[c.id] = x.valor;
    });
    return { v: v, erros: erros };
  }

  function linhaVazia(row) { return !(row || []).some(function (x) { return !vazio(x); }); }

  /** Planilha de compra → itens; linhas com erro ficam fora */
  function lerCompra(aba, cab) {
    var out = { aba: aba.nome, itens: [], erros: [], alertas: [], lidas: 0, comPreco: 0, comTrib: 0, comCbsIbs: 0, comNota2027: 0 };
    for (var r = cab.linha + 1; r < aba.linhas.length; r++) {
      var row = aba.linhas[r] || [];
      if (linhaVazia(row)) continue;
      out.lidas++;
      var n = r + 1;
      var l = lerLinha(row, cab, ITEM);
      var v = l.v, erros = l.erros;
      ['codigo', 'descricao', 'ncm', 'quantidade', 'valorMercadoria'].forEach(function (k) {
        var col = COMPRA.filter(function (c) { return c.id === k; })[0];
        if (v[k] == null && !erros.some(function (e) { return e.indexOf(nomeCol(col)) === 0; })) erros.push(nomeCol(col) + ': obrigatório');
      });
      var cod = v.daeCodigo != null ? String(v.daeCodigo).replace(/\D/g, '') : '';
      if (v.daeCodigo != null && cod !== '1023' && cod !== '1031') erros.push('Código do DAE: aceita só 1023 ou 1031 (recebido "' + v.daeCodigo + '")');
      if ((v.daeValor || 0) > 0 && !cod) erros.push('Código do DAE: obrigatório quando há valor de DAE (1023 ou 1031)');
      if (erros.length) { out.erros.push({ linha: n, msg: erros.join('; ') }); continue; }
      var item = {
        codigo: String(v.codigo).trim(), descricao: String(v.descricao).trim(), ncm: v.ncm, quantidade: v.quantidade,
        compra: {
          valorMercadoria: v.valorMercadoria, descontoCompra: v.descontoCompra || 0, frete: v.frete || 0, icmsFrete: v.icmsFrete || 0,
          ipi: v.ipi || 0, seguroOutros: v.seguroOutros || 0, icmsDestacado: v.icmsDestacado || 0,
          daeValor: v.daeValor || 0, daeCodigo: (v.daeValor || 0) > 0 ? cod : '', daePago: v.daePago !== false,
          regimePisCofins: v.regimePisCofins || 'NORMAL', fornecedorPjBrasil: v.fornecedorPjBrasil !== false,
          fornecedorSimples: v.fornecedorSimples === true, cbsDestacada: v.cbsDestacada != null ? v.cbsDestacada : null, ibsDestacado: v.ibsDestacado != null ? v.ibsDestacado : null
        },
        venda: { precoVenda: v.precoVenda != null ? v.precoVenda : null, comissao: v.comissao != null ? v.comissao : null, taxaCartao: v.taxaCartao != null ? v.taxaCartao : null },
        trib: null,
        linhaOrigem: n
      };
      // tributação da venda informada na linha: o que ficar vazio segue o padrão do regime
      if (v.icmsStVenda != null || v.aliqIcmsVenda != null || v.reducaoBcIcmsVenda != null || v.regimePisCofinsVenda != null) {
        item.trib = {
          icmsSt: v.icmsStVenda != null ? v.icmsStVenda : item.compra.daeCodigo === '1031',
          aliqIcms: v.aliqIcmsVenda != null ? v.aliqIcmsVenda : null,
          reducaoBcIcms: v.reducaoBcIcmsVenda || 0,
          regimePisCofins: v.regimePisCofinsVenda || item.compra.regimePisCofins || 'NORMAL',
          dasAliquota: null
        };
        out.comTrib++;
      }
      if (v.cbsIbsItem) { item.cbsIbs = v.cbsIbsItem; out.comCbsIbs++; }
      if (item.compra.cbsDestacada != null || item.compra.ibsDestacado != null) out.comNota2027++;
      if (item.venda.precoVenda != null) out.comPreco++;
      if (item.compra.daeCodigo === '1023' && !item.compra.daePago) out.alertas.push({ linha: n, msg: 'DAE 1023 não pago: crédito a apropriar após o recolhimento.' });
      out.itens.push(item);
    }
    return out;
  }

  /** Planilha de atualização → linhas com os valores de cada produto (vazio = zero; CBS e IBS vazios = não informados) */
  function lerAtualizacao(aba, cab) {
    var out = { aba: aba.nome, linhas: [], erros: [], lidas: 0 };
    for (var r = cab.linha + 1; r < aba.linhas.length; r++) {
      var row = aba.linhas[r] || [];
      if (linhaVazia(row)) continue;
      out.lidas++;
      var l = lerLinha(row, cab, ATUAL), v = l.v;
      if (v.quantidade == null && !l.erros.some(function (e) { return /^Quantidade/.test(e); })) l.erros.push('Quantidade: obrigatória');
      if (v.valorUnitario == null && v.valorMercadoria == null) l.erros.push('Valor unitário ou valor total: informe um dos dois');
      if (v.idControle == null && v.codigo == null && v.descricao == null) l.erros.push('Sem ID, código ou descrição: não dá para saber qual é o produto');
      var cod = v.daeCodigo != null ? String(v.daeCodigo).replace(/\D/g, '') : '';
      if (v.daeCodigo != null && cod !== '1023' && cod !== '1031') l.erros.push('Código do DAE: aceita só 1023 ou 1031 (recebido "' + v.daeCodigo + '")');
      if ((v.daeValor || 0) > 0 && !cod) l.erros.push('Código do DAE: obrigatório quando há valor de DAE (1023 ou 1031)');
      if (l.erros.length) { out.erros.push({ linha: r + 1, msg: l.erros.join('; ') }); continue; }
      out.linhas.push({
        linha: r + 1, id: v.idControle != null ? String(v.idControle).trim() : '',
        codigo: v.codigo != null ? String(v.codigo).trim() : '', descricao: v.descricao != null ? String(v.descricao).trim() : '', ncm: v.ncm || '',
        quantidade: v.quantidade, unit: v.valorUnitario != null ? v.valorUnitario : null, total: v.valorMercadoria != null ? v.valorMercadoria : null,
        compra: {
          descontoCompra: v.descontoCompra || 0, frete: v.frete || 0, icmsFrete: v.icmsFrete || 0, ipi: v.ipi || 0, seguroOutros: v.seguroOutros || 0,
          icmsDestacado: v.icmsDestacado || 0, daeValor: v.daeValor || 0, daeCodigo: (v.daeValor || 0) > 0 ? cod : '',
          fornecedorSimples: v.fornecedorSimples === true,
          cbsDestacada: v.cbsDestacada != null ? v.cbsDestacada : null, ibsDestacado: v.ibsDestacado != null ? v.ibsDestacado : null
        }
      });
    }
    return out;
  }

  var ROTULOS_MUDANCA = { quantidade: 'quantidade', valorMercadoria: 'preço de compra', descontoCompra: 'desconto', frete: 'frete', icmsFrete: 'ICMS do frete', ipi: 'IPI',
    seguroOutros: 'seguro', icmsDestacado: 'ICMS', daeValor: 'DAE', daeCodigo: 'código do DAE', fornecedorSimples: 'fornecedor do Simples', cbsDestacada: 'CBS', ibsDestacado: 'IBS' };
  function vz(x) { return x == null || x === ''; }
  /** Mesmo valor? CBS e IBS: vazio (não informado) é diferente de zero; nos demais valores, vazio vale zero */
  function igual(k, a, b) {
    if (k === 'fornecedorSimples') return !!a === !!b;
    if (k === 'daeCodigo') return String(a || '') === String(b || '');
    if (k === 'cbsDestacada' || k === 'ibsDestacado') return vz(a) || vz(b) ? vz(a) === vz(b) : Math.abs(Number(a) - Number(b)) < 0.005;
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
  }

  /**
   * Plano da atualização: liga cada linha a um produto da análise (pelo ID; sem ele, pelo código) e calcula a compra de 2027.
   * Base de comparação: os valores de 2027 do produto (os de 2026 enquanto 2027 não tiver os próprios).
   * Unitário × total: vale o que mudou; se os dois mudaram e não batem, vale o unitário (aviso).
   */
  function planejarAtualizacao(atu, itens, ativo) {
    var Mo = LC.modelo, n = function (x) { return Number(x) || 0; };
    var porId = {}, porCod = {}, repetidoCod = {};
    (itens || []).forEach(function (it) {
      porId[it.id] = it;
      var c = String(it.codigo || '').trim().toUpperCase();
      if (c) { if (porCod[c]) repetidoCod[c] = true; porCod[c] = it; }
    });
    var plano = { linhas: [], atualizados: 0, semMudanca: 0, novos: 0, comNota2027: 0, avisos: [], erros: atu.erros.slice(), lidas: atu.lidas, aba: atu.aba };
    var usados = {};
    atu.linhas.forEach(function (l) {
      var cod = l.codigo.toUpperCase();
      var it = (l.id && porId[l.id]) || (cod && !repetidoCod[cod] ? porCod[cod] : null) || null;
      if (it && usados[it.id]) { plano.erros.push({ linha: l.linha, msg: 'Produto repetido na planilha (já atualizado na linha ' + usados[it.id] + ').' }); return; }
      var base = it ? Mo.noCenario(it, '2027', ativo, 'item') : null;
      var q = l.quantidade;
      var bq = base ? n(base.quantidade) : 0, bt = base ? n(base.compra && base.compra.valorMercadoria) : 0, bu = bq > 0 ? bt / bq : null;
      var mudouU = l.unit != null && (bu == null || Math.abs(l.unit - bu) > 0.005);
      var mudouT = l.total != null && (!base || Math.abs(l.total - bt) > 0.005);
      var total;
      if (base && !mudouU && !mudouT) total = Math.abs(q - bq) < 1e-9 ? bt : (bu != null ? bu * q : bt); // só a quantidade pode ter mudado: mantém o unitário
      else if (l.unit != null && l.total != null && mudouU && mudouT && Math.abs(l.unit * q - l.total) > 0.01) {
        total = l.unit * q;
        plano.avisos.push({ linha: l.linha, msg: (l.codigo || l.descricao) + ': valor unitário e total não batem; valeu o unitário (total = ' + (F ? F.brl(total) : total.toFixed(2)) + ').' });
      } else if (l.unit != null && (mudouU || l.total == null)) total = l.unit * q;
      else total = l.total;
      var compra = Object.assign({}, base ? JSON.parse(JSON.stringify(base.compra || {})) : {}, l.compra, { valorMercadoria: total });
      var mudancas = [];
      if (base) {
        if (!igual('quantidade', q, base.quantidade)) mudancas.push('quantidade');
        Object.keys(ROTULOS_MUDANCA).forEach(function (k) { if (k !== 'quantidade' && !igual(k, compra[k], (base.compra || {})[k])) mudancas.push(ROTULOS_MUDANCA[k]); });
      }
      var temNota = compra.cbsDestacada != null || compra.ibsDestacado != null;
      if (temNota && !compra.fornecedorSimples) plano.comNota2027++;
      if (!it) plano.novos++;
      else if (mudancas.length) plano.atualizados++;
      else plano.semMudanca++;
      if (it) usados[it.id] = l.linha;
      plano.linhas.push({ linha: l.linha, item: it, novo: { codigo: l.codigo, descricao: l.descricao, ncm: l.ncm, quantidade: q, compra: compra }, mudancas: mudancas, temNota: temNota });
    });
    plano.foraDaPlanilha = (itens || []).filter(function (it) { return !usados[it.id]; }).length;
    return plano;
  }

  /** Planilha de tributação de venda → linhas por código/NCM */
  function lerTributacao(aba, cab) {
    var out = { aba: aba.nome, linhas: [], erros: [], lidas: 0 };
    for (var r = cab.linha + 1; r < aba.linhas.length; r++) {
      var row = aba.linhas[r] || [];
      if (linhaVazia(row)) continue;
      out.lidas++;
      var l = lerLinha(row, cab, TRIB);
      var v = l.v;
      if (v.codigo == null && v.ncm == null) l.erros.push('codigo ou ncm: obrigatório');
      if (l.erros.length) { out.erros.push({ linha: r + 1, msg: l.erros.join('; ') }); continue; }
      out.linhas.push({
        codigo: v.codigo != null ? String(v.codigo).trim() : '', ncm: v.ncm || '', linha: r + 1,
        trib: { icmsSt: v.icmsSt === true, aliqIcms: v.aliqIcms != null ? v.aliqIcms : null, reducaoBcIcms: v.reducaoBcIcms || 0, regimePisCofins: v.regimePisCofins || 'NORMAL', dasAliquota: v.dasAliquota != null ? v.dasAliquota : null }
      });
    }
    return out;
  }

  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

  /** Linha de tributação do item: pelo código; sem código igual, pelo NCM */
  function acharTributacao(item, linhas) {
    var cod = String(item.codigo || '').trim().toUpperCase();
    var porCod = cod ? linhas.filter(function (l) { return l.codigo && l.codigo.toUpperCase() === cod; })[0] : null;
    if (porCod) return { linha: porCod, por: 'codigo' };
    var ncm = soDigitos(item.ncm);
    var porNcm = ncm ? linhas.filter(function (l) { return soDigitos(l.ncm) === ncm; })[0] : null;
    return porNcm ? { linha: porNcm, por: 'ncm' } : null;
  }

  /**
   * Processa as abas lidas do arquivo. Devolve a prévia: { compra, tributacao, alertas } — cada parte pode faltar.
   * itensExistentes: itens já cadastrados na análise (para aplicar uma planilha de tributação isolada).
   */
  function processar(abas, itensExistentes) {
    // planilha de atualização para 2027 (tem a coluna "ID de controle"): atualiza os produtos, não cria uma compra nova
    var atu = null;
    (abas || []).forEach(function (a) {
      if (atu) return;
      var ca = cabecalho(a.linhas || [], IDX_ATUAL, ['idControle', 'quantidade']);
      if (ca) atu = lerAtualizacao(a, ca);
    });
    if (atu) return { atualizacao: atu, compra: null, tributacao: null, alertas: [], aplicacoes: [] };
    var compra = null, trib = null;
    (abas || []).forEach(function (a) {
      var linhas = a.linhas || [];
      if (!compra) {
        var cc = cabecalho(linhas, IDX_ITEM, ['quantidade', 'valorMercadoria']);
        if (cc) { compra = lerCompra(a, cc); return; }
      }
      if (!trib) {
        var ct = cabecalho(linhas, IDX_TRIB, ['icmsSt']) || cabecalho(linhas, IDX_TRIB, ['aliqIcms']);
        if (ct) trib = lerTributacao(a, ct);
      }
    });
    if (!compra && !trib) throw new Error('Não encontrei as colunas da planilha de itens (Quantidade, Valor da mercadoria…) nem da tributação de venda (icms_st, aliq_icms_venda…). Use o modelo do sistema.');
    var alertas = [];
    var linhasTrib = trib ? trib.linhas : [];
    // casa a tributação com os itens da compra importada ou, sem compra, com os itens já cadastrados
    var alvo = compra ? compra.itens : (itensExistentes || []);
    var aplicacoes = [];
    alvo.forEach(function (it, i) {
      var t = linhasTrib.length ? acharTributacao(it, linhasTrib) : null;
      if (t) aplicacoes.push({ indice: i, trib: t.linha.trib, por: t.por });
      if (compra) {
        // sem aba de tributação, todos usam a tributação padrão (ICMS de Parâmetros; ICMS-ST quando o DAE é 1031)
        if (!t && trib) alertas.push({ linha: it.linhaOrigem, msg: (it.codigo || it.descricao) + ': sem linha na planilha de tributação — usará a tributação padrão do regime.' });
        var tr = it.trib || (t && t.linha.trib);
        if (tr && tr.icmsSt && it.compra.daeCodigo !== '1031') alertas.push({ linha: it.linhaOrigem, msg: (it.codigo || it.descricao) + ': ICMS-ST na venda sem DAE 1031 na compra — confirme se o ICMS-ST veio retido na nota.' });
      }
    });
    return { compra: compra, tributacao: trib, aplicacoes: aplicacoes, alertas: alertas.concat(compra ? compra.alertas : []) };
  }

  /** Colunas do modelo, na ordem: as 13 da compra, as 3 da venda, as 4 da tributação da venda, a de CBS e IBS (2027) e as 3 do fornecedor e da nota de 2027 */
  var COLUNAS_MODELO = COMPRA.filter(function (c) { return c.modelo !== false; }).concat(VENDA).concat(NF27);
  function letra(i) { return String.fromCharCode(65 + i); }

  /**
   * Modelo (.xlsx): aba "Itens" com uma linha por produto (faixa COMPRA e faixa VENDA no topo) e aba "Instruções".
   * Valores em reais com 2 casas; listas de escolha no Código do DAE (1023 ou 1031), no ICMS-ST (Sim/Não) e no
   * PIS/Cofins da venda (Normal, Monofásico, Alíquota zero, Isento, Suspenso).
   */
  function modelo() {
    var cols = COLUNAS_MODELO;
    var nCompra = cols.length - VENDA.length - NF27.length, nNf = cols.length - NF27.length;
    var faixa = cols.map(function (c, i) {
      return { v: i === 0 ? 'COMPRA — valores do total do item na NF-e de entrada' : i === nCompra ? 'VENDA — preço por unidade, despesas e tributação (ICMS, PIS e Cofins; CBS e IBS em 2027)' : i === nNf ? 'FORNECEDOR E NOTA DE 2027 — CBS e IBS destacados' : '', s: 'secao' };
    });
    var cab = cols.map(function (c) { return { v: c.rotulo + (c.obrig ? ' *' : ''), s: 'cabecalho' }; });
    cab.__altura = 32;
    var larguras = cols.map(function (c) { return c.id === 'descricao' ? 34 : Math.max(13, Math.min(24, c.rotulo.length + 3)); });
    var estilos = {};
    cols.forEach(function (c, i) { estilos[i] = c.tipo === 'num' || c.tipo === 'pct' ? 'num' : 'textoFmt'; });
    var iDae = cols.indexOf(COMPRA.filter(function (c) { return c.id === 'daeCodigo'; })[0]);
    var listas = iDae >= 0 ? [{ ref: letra(iDae) + '3:' + letra(iDae) + '1002', lista: '"1023,1031"', erro: 'Use 1023 (ICMS Antecipado) ou 1031 (ICMS-ST).' }] : [];
    cols.forEach(function (c, i) {
      if (c.lista) listas.push({ ref: letra(i) + '3:' + letra(i) + '1002', lista: '"' + c.lista.join(',') + '"', erro: 'Escolha uma opção da lista: ' + c.lista.join(', ') + '.' });
    });
    var ultima = letra(cols.length - 1);

    var ins = [[{ v: 'Lucratividade por Item — planilha de importação', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }]];
    ins.push([{ v: 'Preencha a aba Itens com uma linha por produto. Na COMPRA, informe os valores do total do item na NF-e. Na VENDA, o preço de 1 unidade, os percentuais (só o número: 3 para 3%) e a tributação da venda (ICMS, PIS e Cofins), escolhida nas listas. Use vírgula para os centavos. As colunas com * são obrigatórias.', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }]);
    ins[1].__altura = 46;
    ins.push([]);
    ins.push(['Parte', 'Coluna', 'Obrigatória', 'O que informar'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
    cols.forEach(function (c, i) {
      ins.push([{ v: i < nCompra ? 'Compra' : c.nf27 ? 'Nota de 2027' : c.trib ? 'Tributação da venda' : c.reforma ? 'Reforma (2027)' : 'Venda', s: 'texto' }, { v: c.rotulo, s: 'negrito' }, { v: c.obrig ? 'Sim' : 'Não', s: 'texto' }, { v: c.desc, s: 'texto' }]);
    });
    ins.push([]);
    ins.push([{ v: 'Exemplo de linha (não é importado)', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }, { v: '', s: 'secao' }]);
    ins.push([{ v: 'A100 · Torneira metal · 84818019 · 10 · 1.000,00 · 0,00 · 50,00 · 6,00 · 50,00 · 10,00 · 120,00 · 80,00 · 1023 · 180,00 · 3 · 2,5 · Não · 20 · 0 · Normal · Normal · Não · (vazio) · (vazio)', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }, { v: '', s: 'texto' }]);
    ins.push([]);
    ins.push([{ v: 'Tributação da venda em branco: a alíquota do ICMS vem de Parâmetros (ICMS interno padrão), o PIS/Cofins segue o da compra e o item com DAE 1031 (ICMS-ST) sai sem ICMS. Tudo pode ser ajustado depois, por item, na tela Venda.', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }]);
    ins.push([{ v: 'Colunas avançadas também aceitas: dae_pago (S/N), regime_pis_cofins_item e fornecedor_pj_brasil (S/N), além de uma aba de tributação de venda (codigo, ncm, icms_st, aliq_icms_venda, reducao_bc_icms, regime_pis_cofins_venda, das_aliquota_item).', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }, { v: '', s: 'nota' }]);
    var nIns = ins.length;
    ins[nIns - 1].__altura = 32; ins[nIns - 2].__altura = 32;

    return N.xlsx.build({
      title: 'Lucratividade por Item — modelo de importação', author: 'Nexus Contabilidade',
      sheets: [
        { name: 'Itens', cols: larguras, colStyles: estilos, rows: [faixa, cab], freeze: 2,
          merges: ['A1:' + letra(nCompra - 1) + '1', letra(nCompra) + '1:' + letra(nNf - 1) + '1', letra(nNf) + '1:' + ultima + '1'],
          validacoes: listas },
        { name: 'Instruções', cols: [12, 32, 12, 90], rows: ins,
          merges: ['A1:D1', 'A2:D2', 'A' + (nIns - 4) + ':D' + (nIns - 4), 'A' + (nIns - 3) + ':D' + (nIns - 3), 'A' + (nIns - 1) + ':D' + (nIns - 1), 'A' + nIns + ':D' + nIns] }
      ]
    });
  }

  // ------------------------------------------------------------------ exportação da planilha de atualização para 2027
  /** Linhas da planilha: os valores de 2027 de cada produto (os de 2026, enquanto 2027 não tiver os próprios) */
  function linhasAtualizacao(an, ativo) {
    var Mo = LC.modelo, n = function (x) { return Number(x) || 0; };
    return (an.itens || []).map(function (it0) {
      var it = Mo.noCenario(it0, '2027', ativo, 'item'), c = it.compra || {}, q = n(it.quantidade);
      var vals = { idControle: it0.id, codigo: it0.codigo || '', descricao: it0.descricao || '', ncm: it0.ncm || '', quantidade: q,
        valorUnitario: q > 0 && c.valorMercadoria != null ? n(c.valorMercadoria) / q : null, valorMercadoria: c.valorMercadoria != null ? n(c.valorMercadoria) : null,
        descontoCompra: n(c.descontoCompra), frete: n(c.frete), icmsFrete: n(c.icmsFrete), ipi: n(c.ipi), seguroOutros: n(c.seguroOutros), icmsDestacado: n(c.icmsDestacado),
        daeValor: n(c.daeValor), daeCodigo: n(c.daeValor) > 0 ? String(c.daeCodigo || '') : '', fornecedorSimples: c.fornecedorSimples ? 'Sim' : 'Não',
        cbsDestacada: c.cbsDestacada != null && c.cbsDestacada !== '' ? n(c.cbsDestacada) : null, ibsDestacado: c.ibsDestacado != null && c.ibsDestacado !== '' ? n(c.ibsDestacado) : null };
      return ATUAL.map(function (col) { return vals[col.id]; });
    });
  }

  /** Planilha (.xlsx) para o cliente atualizar a compra com a nota de 2027 e informar a CBS e o IBS destacados */
  function planilhaAtualizacao(an, ativo, empresa) {
    var cols = ATUAL;
    var grupos = { produto: 'PRODUTO — não altere o ID de controle', compra: 'COMPRA — atualize com a nota fiscal de 2027', iva: 'CBS E IBS DESTACADOS NA NOTA DE 2027' };
    var faixa = cols.map(function (c, i) { return { v: i === 0 || cols[i - 1].grupo !== c.grupo ? grupos[c.grupo] : '', s: 'secao' }; });
    var cab = cols.map(function (c) { return { v: c.rotulo, s: c.grupo === 'iva' ? 'cabCond' : 'cabecalho' }; });
    cab.__altura = 32;
    var estilo = function (c) { return c.id === 'quantidade' ? 'num' : c.tipo === 'num' ? 'moeda' : 'textoFmt'; };
    var rows = [faixa, cab].concat(linhasAtualizacao(an, ativo).map(function (vals) {
      return vals.map(function (v, i) { return { v: v == null ? '' : v, s: cols[i].id === 'descricao' ? 'texto' : estilo(cols[i]) }; });
    }));
    var estilos = {};
    cols.forEach(function (c, i) { estilos[i] = c.id === 'descricao' ? 'texto' : estilo(c); });
    var larguras = cols.map(function (c) { return c.id === 'descricao' ? 34 : c.id === 'idControle' ? 22 : Math.max(13, Math.min(22, c.rotulo.length + 2)); });
    var listas = [];
    cols.forEach(function (c, i) {
      var lista = c.id === 'daeCodigo' ? ['1023', '1031'] : c.lista;
      if (lista) listas.push({ ref: letra(i) + '3:' + letra(i) + '1002', lista: '"' + lista.join(',') + '"', erro: 'Escolha uma opção da lista: ' + lista.join(', ') + '.' });
    });
    var merges = [];
    cols.forEach(function (c, i) {
      if (i === 0 || cols[i - 1].grupo !== c.grupo) {
        var fim = i; while (fim + 1 < cols.length && cols[fim + 1].grupo === c.grupo) fim++;
        if (fim > i) merges.push(letra(i) + '1:' + letra(fim) + '1');
      }
    });
    var txt = function (v, s) { return [{ v: v, s: s || 'texto' }, { v: '', s: s || 'texto' }, { v: '', s: s || 'texto' }, { v: '', s: s || 'texto' }]; };
    var ins = [txt('Lucratividade por Item — atualização para 2027', 'titulo')];
    ins.push(txt((empresa && empresa.razaoSocial ? empresa.razaoSocial + ' · ' : '') + 'Análise "' + an.nome + '" · ' + (an.itens || []).length + ' produto(s). A planilha traz os valores atuais de cada produto: os de 2026, até eles serem atualizados para 2027.'));
    ins.push([]);
    [
      '1. Na aba Produtos, atualize a compra de cada produto com a nota fiscal de 2027 (quantidade, preço, frete, IPI, ICMS, DAE).',
      '2. Informe a CBS e o IBS destacados na nota de 2027 (colunas em destaque). Produto sem eles continua com os dados de 2026 e fica marcado com o sinal de alerta no sistema.',
      '3. Preço de compra: mude o valor unitário ou o total; o outro é recalculado. Se mudar os dois e eles não baterem, vale o unitário.',
      '4. Não altere o ID de controle. Código, descrição e NCM servem para identificar o produto: mudanças neles não são gravadas nos produtos já cadastrados.',
      '5. Linhas novas (sem ID) viram produtos novos. Produtos apagados da planilha continuam no sistema como estão.',
      '6. No sistema, em Compra › Importar planilha, escolha este arquivo. Antes de gravar, uma prévia mostra o que muda. Os valores entram só no cenário 2027: o cenário 2026 fica como está.',
      'Fornecedor do Simples Nacional: a CBS e o IBS dele ficam dentro do DAS, sem destaque por fora, e o produto não recebe o sinal. Se a nota informar a CBS e o IBS pagos por ele, digite nas colunas: viram crédito (LC 214/2025, art. 47, § 9º).'
    ].forEach(function (t) { var r = txt(t); r.__altura = 30; ins.push(r); });
    ins.push([]);
    ins.push(['Coluna', 'Parte', 'O que informar', ''].map(function (h) { return { v: h, s: 'cabecalho' }; }));
    cols.forEach(function (c) { ins.push([{ v: c.rotulo, s: 'negrito' }, { v: { produto: 'Produto', compra: 'Compra', iva: 'CBS e IBS (2027)' }[c.grupo], s: 'texto' }, { v: c.desc || '', s: 'texto' }, { v: '', s: 'texto' }]); });
    var mIns = ['A1:D1', 'A2:D2'];
    for (var k = 4; k <= 10; k++) mIns.push('A' + k + ':D' + k);
    for (var j = 13; j < 13 + cols.length; j++) mIns.push('C' + j + ':D' + j);
    return N.xlsx.build({
      title: 'Lucratividade por Item — atualização para 2027', author: 'Nexus Contabilidade',
      sheets: [
        { name: 'Produtos', cols: larguras, colStyles: estilos, rows: rows, freeze: 2, merges: merges, validacoes: listas },
        { name: 'Instruções', cols: [34, 16, 70, 10], rows: ins, merges: mIns }
      ]
    });
  }

  LC.importar = { ATUAL: ATUAL, linhasAtualizacao: linhasAtualizacao, planilhaAtualizacao: planilhaAtualizacao, planejarAtualizacao: planejarAtualizacao,
    COMPRA: COMPRA, VENDA: VENDA, NF27: NF27, TRIB: TRIB, COLUNAS_MODELO: COLUNAS_MODELO, processar: processar, modelo: modelo, acharTributacao: acharTributacao, norm: norm };
})(typeof window !== 'undefined' ? window : globalThis);
