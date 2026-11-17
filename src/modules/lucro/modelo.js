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
      compra: { valorMercadoria: null, descontoCompra: 0, frete: 0, icmsFrete: 0, ipi: 0, seguroOutros: 0, icmsDestacado: 0, daeValor: 0, daeCodigo: '', daePago: true, regimePisCofins: 'NORMAL', fornecedorPjBrasil: true },
      trib: null,
      cbsIbs: { regime: 'NORMAL', reducao: null }, // tratamento de CBS e IBS (cenário 2027), na compra e na venda
      venda: N.store.clone((an && an.vendaPadrao) || vendaPadrao())
    };
  }

  LC.modelo = { novaEmpresa: novaEmpresa, vendaPadrao: vendaPadrao, novaAnalise: novaAnalise, novoItem: novoItem };
})(typeof window !== 'undefined' ? window : globalThis);
