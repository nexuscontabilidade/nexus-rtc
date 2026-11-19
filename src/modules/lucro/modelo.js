/*
 * Lucratividade por Item — modelos de dados: Empresa → Análises → Itens.
 * Usados pelo controlador do módulo e pela integração com o RTC Comparativo (src/core/integracao.js).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var LC = N.lucro = N.lucro || {};

  function agora() { return new Date().toISOString(); }

  function novaEmpresa() {
    return { id: N.store.uid('lemp'), razaoSocial: '', nomeFantasia: '', cnpj: '', uf: 'CE', regime: 'REAL', params: LC.motor.parametrosPadrao(), criadoEm: agora() };
  }
  function vendaPadrao() { return { modo: 'PRECO_INFORMADO', markup: null, precoVenda: null, descontoTipo: 'pct', desconto: 0, comissao: 0, taxaCartao: 0 }; }
  function novaAnalise(emp, nome) {
    return { id: N.store.uid('lana'), empresaId: emp.id, nome: nome || 'Análise', regime: null, vendaPadrao: vendaPadrao(), itens: [], criadoEm: agora(), atualizadoEm: agora() };
  }
  function novoItem(an) {
    return {
      id: N.store.uid('litem'), codigo: '', descricao: '', ncm: '', quantidade: 1,
      compra: { valorMercadoria: null, descontoCompra: 0, frete: 0, icmsFrete: 0, ipi: 0, seguroOutros: 0, icmsDestacado: 0, daeValor: 0, daeCodigo: '', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true,
        fornecedorSimples: false, cbsDestacada: null, ibsDestacado: null }, // nota de 2027: CBS e IBS destacados (vazio = dados de 2026)
      trib: null,
      cbsIbs: { regime: 'NORMAL', reducao: null }, // tratamento de CBS e IBS (cenário 2027), na compra e na venda
      venda: N.store.clone((an && an.vendaPadrao) || vendaPadrao())
    };
  }

  // ------------------------------------------------------------------ dados separados por cenário (2026 e 2027)
  /**
   * Campos que cada cenário guarda separado. O cenário ativo fica nos próprios campos do objeto; o outro fica guardado em
   * `porCenario[ano]`. Identificação (código, descrição, NCM, nomes, cadastro da empresa) é comum aos dois cenários.
   */
  var CAMPOS_CENARIO = {
    item: ['quantidade', 'compra', 'venda', 'trib', 'cbsIbs'],
    empresa: ['params'],
    analise: ['regime', 'vendaPadrao']
  };
  function copia(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function ano(c) { return c === '2027' ? '2027' : '2026'; }

  /**
   * Troca o cenário ativo de todos os dados do módulo: guarda os valores do cenário atual e traz os do novo.
   * Sem valores guardados do novo cenário, ele começa com uma cópia do atual; daí em diante, os dois são independentes:
   * o que se altera num cenário não muda o outro. Devolve { de, para, copiados } (copiados = objetos que começaram da cópia).
   */
  function trocarCenario(d, novo) {
    var de = ano(d.cenario), para = ano(novo), out = { de: de, para: para, copiados: 0 };
    if (de === para) return out;
    function trocar(o, campos) {
      var guardado = o.porCenario || (o.porCenario = {});
      var atual = {};
      campos.forEach(function (k) { atual[k] = copia(o[k]); });
      var vem = guardado[para];
      if (vem) campos.forEach(function (k) { if (vem[k] === undefined) delete o[k]; else o[k] = copia(vem[k]); });
      else out.copiados++;
      guardado[de] = atual;
      delete guardado[para]; // o cenário ativo vive nos campos do objeto
    }
    (d.empresas || []).forEach(function (e) { trocar(e, CAMPOS_CENARIO.empresa); });
    (d.analises || []).forEach(function (a) {
      trocar(a, CAMPOS_CENARIO.analise);
      (a.itens || []).forEach(function (it) { trocar(it, CAMPOS_CENARIO.item); });
    });
    d.cenario = para;
    return out;
  }

  /** O objeto como ele é num cenário, sem trocar o ativo (ex.: a integração lê sempre 2026). tipo: item | empresa | analise */
  function noCenario(o, cenario, ativo, tipo) {
    if (!o || ano(cenario) === ano(ativo)) return o;
    var g = o.porCenario && o.porCenario[ano(cenario)];
    if (!g) return o; // nunca aberto nesse cenário: vale o mesmo do ativo
    var v = Object.assign({}, o);
    CAMPOS_CENARIO[tipo].forEach(function (k) { v[k] = g[k]; });
    return v;
  }

  /**
   * Objeto onde gravar os valores de um cenário: o próprio objeto, se o cenário é o ativo; senão, os valores guardados
   * desse cenário (criados, se ainda não existem, com uma cópia dos valores atuais). O cenário ativo não muda.
   */
  function editarNoCenario(o, cenario, ativo, tipo) {
    if (ano(cenario) === ano(ativo)) return o;
    var g = o.porCenario || (o.porCenario = {});
    if (!g[ano(cenario)]) {
      var c = {};
      CAMPOS_CENARIO[tipo].forEach(function (k) { c[k] = copia(o[k]); });
      g[ano(cenario)] = c;
    }
    return g[ano(cenario)];
  }

  LC.modelo = { novaEmpresa: novaEmpresa, vendaPadrao: vendaPadrao, novaAnalise: novaAnalise, novoItem: novoItem,
    CAMPOS_CENARIO: CAMPOS_CENARIO, trocarCenario: trocarCenario, noCenario: noCenario, editarNoCenario: editarNoCenario };
})(typeof window !== 'undefined' ? window : globalThis);
