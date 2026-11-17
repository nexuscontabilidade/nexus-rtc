/*
 * RTC Comparativo — planilha de compras para o cliente (Excel) e importação de operações e produtos.
 *
 * O modelo é simples, para o cliente preencher com a nota fiscal na mão: nota, UF do fornecedor, produto,
 * quantidade, valor unitário e poucos campos opcionais. A parte tributária (tratamentos de ICMS, ST,
 * PIS/Cofins, IBS/CBS, CFOP) fica com o escritório, no sistema.
 *
 * Uma linha = um produto. Linhas com o mesmo número de nota (e a mesma empresa) formam uma operação.
 * O tipo de operação é deduzido da UF do fornecedor: mesma UF da empresa → interna; outra UF →
 * interestadual; "Exterior" → importação.
 *
 * A importação também aceita colunas avançadas (tipo de operação, CFOP, tratamentos tributários, venda)
 * pelos títulos definidos em COLS — útil para planilhas preenchidas pelo próprio escritório.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};
  var RTC = N.rtc = N.rtc || {};
  var F = N.fmt;

  var UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
  var EXTERIOR = 'Exterior';
  var LINHA_DADOS = 6;         // primeira linha a preencher no modelo (1-based)
  // Códigos de receita do DAE (SEFAZ-CE) informados na planilha → tipo de recolhimento do ICMS na entrada
  var CODIGOS_DAE = {
    '1031': { tipo: 'st', rotulo: 'ICMS-ST', lista: '1031 - ICMS-ST' },                   // custo; encerra a tributação
    '1023': { tipo: 'antecipado', rotulo: 'ICMS antecipado', lista: '1023 - ICMS antecipado' } // crédito no regime normal; custo no Simples
  };
  var LINHAS_VALIDADAS = 1000; // linhas com listas suspensas e validação

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function vazio(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

  // ------------------------------------------------------------------ listas (valor interno, rótulo, sinônimos aceitos)
  var LISTAS = {
    tipo: { titulo: 'Tipo de operação', itens: [['interna', 'Interna'], ['interestadual', 'Interestadual'], ['importacao', 'Importação direta', 'importacao', 'importação'], ['outra', 'Outra operação', 'outra']] },
    destinatario: { titulo: 'Destinatário da venda', itens: [['contribuinte', 'Contribuinte do ICMS', 'contribuinte'], ['nao_contribuinte', 'Consumidor final não contribuinte', 'nao contribuinte', 'consumidor final']] },
    simNao: { titulo: 'Sim / Não', itens: [[true, 'Sim', 's', 'x', '1', 'true', 'yes', 'verdadeiro'], [false, 'Não', 'n', 'nao', '0', 'false', 'no', 'falso', 'nao sei']] },
    forn26: { titulo: 'Fornecedor em 2026', itens: [['regular', 'Regime normal', 'regime normal lp lr industria', 'normal', 'regular', 'lucro real', 'lucro presumido'], ['simples', 'Simples Nacional', 'optante pelo simples nacional', 'simples', 'sn']] },
    forn27: { titulo: 'Fornecedor em 2027', itens: [['regular', 'Regime regular de IBS/CBS', 'regular', 'regime regular', 'regime normal'], ['simples', 'Simples Nacional - IBS/CBS no DAS', 'simples no das', 'simples'], ['simples_regular', 'Simples Nacional - IBS/CBS fora do DAS', 'simples fora do das']] },
    hip2027: { titulo: 'Valor dos produtos em 2027', itens: [['mesmo', 'Mesmo valor', 'mesmo'], ['sem_pis_cofins', 'Sem PIS/Cofins embutidos', 'sem pis cofins'], ['manual', 'Informar valor', 'manual', 'informado']] },
    resumo: { titulo: 'Perfil tributário', itens: RTC.rules.RESUMOS.map(function (r) { return [r[0], r[1]]; }) },
    icms: { titulo: 'Tratamento do ICMS', itens: [['tributado', 'Tributado (normal)', 'tributado', 'normal'], ['reducao_base', 'Redução de base de cálculo', 'reducao de base', 'reducao'], ['st', 'Substituição tributária', 'st', 'icms st'], ['isento', 'Isento / não tributado', 'isento', 'isencao', 'nao tributado'], ['diferido', 'Diferimento', 'diferido'], ['outro', 'Outro (alíquotas manuais)', 'outro']] },
    stPapel: { titulo: 'ICMS-ST: papel da empresa', itens: [['substituido', 'Substituído (compra com ICMS retido)', 'substituido'], ['substituto', 'Substituto (retém na venda)', 'substituto']] },
    antecipacao: { titulo: 'Recolhimento do ICMS na entrada', itens: [['nenhum', 'Não há', 'nao', 'nenhum', 'nenhuma', 'sem antecipacao'], ['antecipado', 'ICMS antecipado', 'antecipado', 'antecipacao'], ['st', 'ICMS-ST na entrada', 'st na entrada', 'icms st', 'st']] },
    pisCofins: { titulo: 'Tratamento de PIS/Cofins', itens: [['normal', 'Tributação normal', 'normal'], ['monofasico', 'Monofásico', 'monofasico'], ['aliquota_zero', 'Alíquota zero', 'zero'], ['isento', 'Isenção', 'isento', 'isencao'], ['suspensao', 'Suspensão'], ['outro', 'Outro (alíquotas manuais)', 'outro']] },
    cbsIbs: { titulo: 'Tratamento de IBS/CBS', itens: [['padrao', 'Alíquota de referência', 'padrao', 'referencia'], ['reducao', 'Redução de alíquota', 'reducao'], ['aliquota_zero', 'Alíquota zero', 'zero'], ['isento', 'Isenção', 'isento', 'isencao'], ['outro', 'Outro (alíquotas manuais)', 'outro']] },
    modo: { titulo: 'Forma de cálculo do preço', itens: [['A', 'A - Margem → preço', 'margem preco', 'margem'], ['B', 'B - Preço → margem', 'preco margem', 'preco']] },
    basePreco: { titulo: 'Calcular o preço por', itens: [['total', 'Quantidade total', 'total', 'quantidade'], ['unitario', 'Por unidade', 'unitario', 'unidade']] },
    baseMargem: { titulo: 'Margem medida', itens: [['operacional', 'Antes de IRPJ/CSLL', 'antes', 'operacional'], ['liquida', 'Após IRPJ/CSLL', 'apos', 'liquida']] },
    baseDespesas: { titulo: 'Base das despesas variáveis', itens: [['total', 'Total cobrado do cliente', 'total'], ['mercadoria', 'Valor da mercadoria', 'mercadoria']] }
  };

  // ------------------------------------------------------------------ colunas reconhecidas na importação
  // r: obrig | cond | opc · tipo: texto | codigo | num | money | unit | pct | sn | lista | uf | ufExt · alt: outros títulos aceitos
  var COLS = [
    // Operação
    { id: 'op', t: 'Nome da operação', alt: ['Nº da nota fiscal', 'Número da nota fiscal', 'Nota fiscal', 'NF'], r: 'obrig', tipo: 'texto', d: 'Linhas com o mesmo nome formam uma única operação.' },
    { id: 'cnpj', t: 'CNPJ da empresa', r: 'opc', tipo: 'codigo', d: 'Empresa já cadastrada. Vazio = empresa selecionada no sistema.' },
    { id: 'ufFornecedor', t: 'UF do fornecedor', alt: ['Estado do fornecedor'], r: 'obrig', tipo: 'ufExt', d: 'Define o tipo de operação: mesma UF da empresa = interna; outra UF = interestadual; Exterior = importação.' },
    { id: 'fornSimples', t: 'Fornecedor é do Simples Nacional?', alt: ['Fornecedor do Simples Nacional'], r: 'opc', tipo: 'sn', d: 'Sim ou Não.' },
    { id: 'tipo', t: 'Tipo de operação (entrada)', r: 'opc', tipo: 'lista', lista: 'tipo', d: 'Avançado: substitui a dedução pela UF do fornecedor.' },
    { id: 'ufOrigem', t: 'UF de origem (fornecedor)', r: 'cond', tipo: 'uf', d: 'Avançado: obrigatória se interestadual.' },
    { id: 'ufDestino', t: 'UF de destino (venda)', r: 'opc', tipo: 'uf', d: 'Padrão: UF da empresa.' },
    { id: 'destinatario', t: 'Destinatário da venda', r: 'opc', tipo: 'lista', lista: 'destinatario', d: 'Padrão: Contribuinte do ICMS.' },
    // Mercadoria
    { id: 'descricao', t: 'Descrição da mercadoria', alt: ['Descrição do produto', 'Produto', 'Descrição'], r: 'obrig', tipo: 'texto', path: 'produto.descricao', d: 'Nome do produto.' },
    { id: 'ncm', t: 'NCM', r: 'opc', tipo: 'codigo', path: 'produto.ncm', d: '8 dígitos.' },
    { id: 'cest', t: 'CEST', r: 'opc', tipo: 'codigo', path: 'produto.cest', d: '7 dígitos.' },
    { id: 'cfopEntrada', t: 'CFOP de entrada', r: 'opc', tipo: 'codigo', path: 'produto.cfopEntrada', d: 'Inicia por 1, 2 ou 3.' },
    { id: 'cfopSaida', t: 'CFOP de saída', r: 'opc', tipo: 'codigo', path: 'produto.cfopSaida', d: 'Inicia por 5 ou 6.' },
    { id: 'importado', t: 'Mercadoria importada (alíquota de 4%)', r: 'opc', tipo: 'sn', path: 'operacao.importado', d: 'Sim ou Não.' },
    // Valores da NF de entrada
    { id: 'quantidade', t: 'Quantidade', r: 'obrig', tipo: 'num', path: 'produto.quantidade', positivo: true, d: 'Maior que zero.' },
    { id: 'unidade', t: 'Unidade', r: 'opc', tipo: 'texto', path: 'produto.unidade', d: 'Padrão: UN.' },
    { id: 'valorUnitario', t: 'Valor unitário (R$)', alt: ['Valor unitário'], r: 'obrig', tipo: 'unit', path: 'valores.valorUnitario', positivo: true, d: 'Valor de 1 unidade.' },
    { id: 'frete', t: 'Frete (R$)', r: 'opc', tipo: 'money', path: 'valores.frete', d: 'Parcela do frete deste produto.' },
    { id: 'freteNaNota', t: 'Frete na própria NF', r: 'opc', tipo: 'sn', path: 'valores.freteNaNota', d: 'Sim ou Não.' },
    { id: 'icmsFrete', t: 'ICMS do CT-e (R$)', alt: ['ICMS do frete (R$)', 'ICMS do frete'], r: 'opc', tipo: 'money', path: 'valores.icmsFrete', d: 'Só com frete fora da NF (CT-e).' },
    { id: 'seguro', t: 'Seguro (R$)', r: 'opc', tipo: 'money', path: 'valores.seguro', d: 'Parcela deste produto.' },
    { id: 'despesas', t: 'Outras despesas acessórias (R$)', r: 'opc', tipo: 'money', path: 'valores.despesas', d: 'Parcela deste produto.' },
    { id: 'desconto', t: 'Descontos incondicionais (R$)', alt: ['Desconto (R$)', 'Desconto'], r: 'opc', tipo: 'money', path: 'valores.desconto', d: 'Destacados na NF.' },
    { id: 'ipi', t: 'IPI destacado na NF (R$)', alt: ['IPI da nota (R$)', 'IPI (R$)', 'IPI'], r: 'opc', tipo: 'money', path: 'valores.ipi', d: 'Valor do IPI.' },
    { id: 'ipiAliq', t: 'Alíquota do IPI (%)', r: 'opc', tipo: 'pct', path: 'perfil.ipi.aliqEntrada', max: 400, d: 'Ex.: 10 = 10%.' },
    // Fornecedor
    { id: 'forn26', t: 'Fornecedor em 2026', r: 'opc', tipo: 'lista', lista: 'forn26', path: 'fornecedor.regime26', d: 'Padrão: Regime normal.' },
    { id: 'icmsSimplesPct', t: 'Crédito de ICMS do Simples (%)', r: 'cond', tipo: 'pct', path: 'fornecedor.icmsSimplesPct', d: '% informado na NF do optante.' },
    { id: 'forn27', t: 'Fornecedor em 2027', r: 'opc', tipo: 'lista', lista: 'forn27', path: 'fornecedor.regime27', d: 'Padrão: Regime regular.' },
    { id: 'cbsSimplesPct', t: 'CBS paga no DAS (%)', r: 'cond', tipo: 'pct', path: 'fornecedor.cbsSimplesPct', d: 'Se IBS/CBS no DAS.' },
    { id: 'ibsSimplesPct', t: 'IBS pago no DAS (%)', r: 'cond', tipo: 'pct', path: 'fornecedor.ibsSimplesPct', d: 'Se IBS/CBS no DAS.' },
    { id: 'hip2027', t: 'Valor dos produtos em 2027', r: 'opc', tipo: 'lista', lista: 'hip2027', path: 'premissas.valorProdutos2027', d: 'Padrão: Mesmo valor.' },
    { id: 'pisCofinsEmbutido', t: 'PIS/Cofins embutidos no preço do fornecedor (%)', r: 'cond', tipo: 'pct', path: 'fornecedor.pisCofinsEmbutidoPct', d: 'Se "Sem PIS/Cofins embutidos".' },
    { id: 'unit2027', t: 'Valor unitário em 2027 (R$)', r: 'cond', tipo: 'unit', path: 'premissas.valorUnitario2027Manual', d: 'Se "Informar valor".' },
    // ICMS
    { id: 'perfil', t: 'Perfil tributário (regra)', r: 'opc', tipo: 'lista', lista: 'resumo', d: 'Aplica a regra cadastrada do perfil.' },
    { id: 'icmsTrat', t: 'Tratamento do ICMS', r: 'opc', tipo: 'lista', lista: 'icms', path: 'perfil.icms.tratamento', d: 'Padrão: Tributado (normal).' },
    { id: 'aliqEntrada', t: 'Alíquota do ICMS na entrada (%)', r: 'opc', tipo: 'pct', d: 'Vazio = automática.' },
    { id: 'reducaoEntrada', t: 'Redução de base na entrada (%)', r: 'opc', tipo: 'pct', path: 'perfil.icms.reducaoEntrada', d: '' },
    { id: 'icmsEntradaValor', t: 'ICMS destacado na NF (R$)', alt: ['ICMS destacado (R$)', 'ICMS destacada (R$)', 'ICMS destacado', 'ICMS destacada', 'Valor do ICMS (R$)'], r: 'opc', tipo: 'money', path: 'perfil.icms.valorEntradaInformado', d: '' },
    { id: 'aliqSaida', t: 'Alíquota do ICMS na saída (%)', r: 'opc', tipo: 'pct', d: 'Vazio = alíquota interna cadastrada.' },
    { id: 'reducaoSaida', t: 'Redução de base na saída (%)', r: 'cond', tipo: 'pct', path: 'perfil.icms.reducaoSaida', d: '' },
    { id: 'icmsFund', t: 'Fundamento estadual do ICMS', r: 'opc', tipo: 'texto', path: 'perfil.icms.fundamento', d: '' },
    { id: 'stPapel', t: 'ICMS-ST: papel da empresa', r: 'cond', tipo: 'lista', lista: 'stPapel', path: 'perfil.st.papel', d: '' },
    { id: 'stMva', t: 'ICMS-ST: MVA original (%)', r: 'cond', tipo: 'pct', path: 'perfil.st.mva', max: 1000, d: '' },
    { id: 'stValor', t: 'ICMS-ST retido na NF (R$)', r: 'cond', tipo: 'money', d: '' },
    { id: 'antTipo', t: 'Recolhimento do ICMS na entrada', r: 'opc', tipo: 'lista', lista: 'antecipacao', path: 'perfil.antecipado.tipo', d: '' },
    { id: 'antValor', t: 'Antecipação: valor pago no DAE (R$)', alt: ['DAE (R$)', 'DAE R$', 'Valor do DAE (R$)', 'Valor do DAE', 'DAE'], r: 'cond', tipo: 'money', d: '' },
    { id: 'codigoDae', t: 'Código do DAE', alt: ['Código DAE', 'Código de receita do DAE', 'Cód. DAE'], r: 'opc', tipo: 'codigo', d: '' },
    { id: 'antMva', t: 'ICMS-ST na entrada: MVA (%)', r: 'cond', tipo: 'pct', path: 'perfil.antecipado.mva', max: 1000, d: '' },
    // PIS/Cofins e IBS/CBS
    { id: 'pcTrat', t: 'Tratamento de PIS/Cofins (2026)', r: 'opc', tipo: 'lista', lista: 'pisCofins', path: 'perfil.pisCofins.tratamento', d: '' },
    { id: 'pisManual', t: 'PIS manual (%)', r: 'cond', tipo: 'pct', path: 'perfil.pisCofins.pisManual', d: '' },
    { id: 'cofinsManual', t: 'Cofins manual (%)', r: 'cond', tipo: 'pct', path: 'perfil.pisCofins.cofinsManual', d: '' },
    { id: 'cbsTrat', t: 'Tratamento de IBS/CBS (2027)', r: 'opc', tipo: 'lista', lista: 'cbsIbs', path: 'perfil.cbsIbs.tratamento', d: '' },
    { id: 'cbsReducao', t: 'Redução de IBS/CBS (%)', r: 'cond', tipo: 'pct', path: 'perfil.cbsIbs.reducaoPct', max: 100.0001, d: '' },
    { id: 'cbsManual', t: 'CBS manual (%)', r: 'cond', tipo: 'pct', path: 'perfil.cbsIbs.aliqCbsManual', d: '' },
    { id: 'ibsManual', t: 'IBS manual (%)', r: 'cond', tipo: 'pct', path: 'perfil.cbsIbs.aliqIbsManual', d: '' },
    // Venda
    { id: 'modo', t: 'Forma de cálculo do preço', r: 'opc', tipo: 'lista', lista: 'modo', path: 'venda.modo', d: '' },
    { id: 'margem', t: 'Margem de lucro desejada (%)', alt: ['Margem de lucro (%)', 'Margem desejada (%)'], r: 'opc', tipo: 'pct', path: 'venda.margem', d: 'Ex.: 20 para 20%.' },
    { id: 'basePreco', t: 'Calcular o preço por', r: 'opc', tipo: 'lista', lista: 'basePreco', d: '' },
    { id: 'precoAtual', t: 'Preço de venda atual (R$)', r: 'cond', tipo: 'unit', d: 'Conforme "Calcular o preço por".' },
    { id: 'precoVendaUnit', t: 'Preço de venda por unidade (R$)', alt: ['Preço de venda unitário (R$)', 'Preço de venda por unidade'], r: 'opc', tipo: 'unit', d: 'Preço de 1 unidade.' },
    { id: 'baseMargem', t: 'Margem medida', r: 'opc', tipo: 'lista', lista: 'baseMargem', path: 'premissas.baseMargem', d: '' },
    { id: 'comissao', t: 'Comissão sobre vendas (%)', r: 'opc', tipo: 'pct', d: '' },
    { id: 'cartao', t: 'Taxa de cartão / meio de pagamento (%)', r: 'opc', tipo: 'pct', d: '' },
    { id: 'outrasDesp', t: 'Outras despesas variáveis (%)', r: 'opc', tipo: 'pct', d: '' },
    { id: 'baseDespesas', t: 'Base das despesas variáveis', r: 'opc', tipo: 'lista', lista: 'baseDespesas', path: 'premissas.baseDespesas', d: '' }
  ];
  var POR_ID = {};
  COLS.forEach(function (c) { POR_ID[c.id] = c; });

  // ------------------------------------------------------------------ modelo do cliente (simples)
  // t: título no modelo · r: obrig | opc · d: dica curta (linha abaixo do título) · ex: valor da linha de exemplo
  var MODELO = [
    { id: 'op', t: 'Nº da nota fiscal', r: 'obrig', w: 16, d: 'Repita o mesmo número nos produtos da mesma nota.', ex: '1234' },
    { id: 'ufFornecedor', t: 'UF do fornecedor', r: 'obrig', w: 13, d: 'Estado de onde veio a mercadoria. Use "Exterior" para importação.', ex: 'SP' },
    { id: 'fornSimples', t: 'Fornecedor é do Simples Nacional?', r: 'opc', w: 17, d: 'Sim ou Não. A nota do Simples traz "optante pelo Simples Nacional".', ex: 'Não' },
    { id: 'descricao', t: 'Descrição do produto', r: 'obrig', w: 34, d: 'Como aparece na nota fiscal.', ex: 'Caneta esferográfica azul' },
    { id: 'ncm', t: 'NCM', r: 'opc', w: 13, d: 'Código de 8 dígitos que aparece na nota.', ex: '9608.10.00' },
    { id: 'quantidade', t: 'Quantidade', r: 'obrig', w: 12, d: 'Quantidade comprada.', ex: 100 },
    { id: 'unidade', t: 'Unidade', r: 'opc', w: 10, d: 'UN, CX, KG… Vazio = UN.', ex: 'UN' },
    { id: 'valorUnitario', t: 'Valor unitário (R$)', r: 'obrig', w: 15, d: 'Valor de 1 unidade na nota.', ex: 2.5, num: true },
    { id: 'frete', t: 'Frete (R$)', r: 'opc', w: 12, d: 'Frete deste produto, se houver.', ex: 15, num: true },
    { id: 'ipi', t: 'IPI da nota (R$)', r: 'opc', w: 12, d: 'Valor do IPI deste produto, se houver.', ex: null, num: true },
    { id: 'desconto', t: 'Desconto (R$)', r: 'opc', w: 12, d: 'Desconto na nota, se houver.', ex: null, num: true },
    { id: 'icmsEntradaValor', t: 'ICMS destacado (R$)', r: 'opc', w: 13, d: 'Valor do ICMS deste produto na nota fiscal.', ex: 17.5, num: true },
    { id: 'antValor', t: 'DAE (R$)', r: 'opc', w: 12, d: 'Valor pago no DAE. Se for o total da nota, informe em uma linha só e repita o código nos outros produtos cobrados.', ex: 32.5, num: true },
    { id: 'codigoDae', t: 'Código do DAE', r: 'opc', w: 18, d: '1031 = ICMS-ST (custo). 1023 = ICMS antecipado (crédito no regime normal). Sem DAE: deixe vazio.', ex: '1023 - ICMS antecipado' },
    { id: 'precoVendaUnit', t: 'Preço de venda por unidade (R$)', r: 'opc', w: 16, d: 'Por quanto você vende 1 unidade hoje.', ex: 4.9, num: true },
    { id: 'margem', t: 'Margem de lucro desejada (%)', r: 'opc', w: 15, d: 'Só o número: 20 para 20%. Se não souber, deixe vazio.', ex: 20, num: true }
  ];

  /** Gera a planilha de compras para o cliente (.xlsx): aba "Produtos" para preencher e aba "Como preencher" */
  function modelo(emp) {
    var n = MODELO.length, ult = N.xlsx.colLetra(n - 1);
    var nomeEmp = emp && (emp.nomeFantasia || emp.razaoSocial);
    function cheia(v, s) { var r = [{ v: v, s: s }]; for (var i = 1; i < n; i++) r.push({ v: '', s: s }); return r; }
    var r1 = cheia('Planilha de compras' + (nomeEmp ? ' — ' + nomeEmp : ''), 'titulo'); r1.__altura = 30;
    var r2 = cheia('Preencha uma linha por produto, a partir da linha ' + LINHA_DADOS + '. Campos com * são obrigatórios; os demais, se não souber, deixe em branco.', 'subtitulo'); r2.__altura = 24;
    var r3 = MODELO.map(function (c) { return { v: c.t + (c.r === 'obrig' ? ' *' : ''), s: c.r === 'obrig' ? 'cabObrig' : 'cabOpc' }; }); r3.__altura = 40;
    var r4 = MODELO.map(function (c) { return { v: c.d, s: 'dica' }; }); r4.__altura = 54;
    var r5 = MODELO.map(function (c, i) {
      var v = i === 0 ? 'Exemplo: ' + c.ex : c.ex;
      return { v: v == null ? '' : v, s: c.num && typeof v === 'number' ? 'exemploNum' : 'exemplo' };
    });
    r5.__altura = 20;
    var colStyles = {};
    MODELO.forEach(function (c, i) {
      if (c.id === 'ncm' || c.id === 'op' || c.id === 'codigoDae') colStyles[i] = 'textoFmt';
      else if (c.id === 'quantidade' || c.id === 'margem') colStyles[i] = 'num';
      else if (c.num) colStyles[i] = 'num';
    });
    var faixa = function (i) { var L = N.xlsx.colLetra(i); return L + LINHA_DADOS + ':' + L + (LINHA_DADOS + LINHAS_VALIDADAS - 1); };
    var validacoes = [];
    MODELO.forEach(function (c, i) {
      if (c.id === 'ufFornecedor') validacoes.push({ ref: faixa(i), lista: '"' + UFS.concat([EXTERIOR]).join(',') + '"', erroTitulo: 'UF inválida', erro: 'Escolha a sigla do Estado na lista (ou "Exterior" para importação).' });
      else if (c.id === 'fornSimples') validacoes.push({ ref: faixa(i), lista: '"Sim,Não"', erroTitulo: 'Responda Sim ou Não', erro: 'Escolha Sim ou Não. Se não souber, deixe em branco.' });
      else if (c.id === 'codigoDae') validacoes.push({ ref: faixa(i), lista: '"' + Object.keys(CODIGOS_DAE).map(function (k) { return CODIGOS_DAE[k].lista; }).join(',') + '"', aviso: true, erroTitulo: 'Código diferente', erro: 'Os códigos usuais são 1031 (ICMS-ST) e 1023 (ICMS antecipado). Confirme o código do DAE.' });
      else if (c.id === 'margem') validacoes.push({ ref: faixa(i), min: 0, max: 99.99, erroTitulo: 'Margem inválida', erro: 'Informe só o número: 20 para 20%.' });
      else if (c.num || c.id === 'quantidade') validacoes.push({ ref: faixa(i), min: 0, max: 1e12, erroTitulo: 'Número inválido', erro: 'Informe só números, sem "R$" (ex.: 1250,90).' });
    });
    var produtos = {
      name: 'Produtos', cols: MODELO.map(function (c) { return c.w; }), colStyles: colStyles,
      rows: [r1, r2, r3, r4, r5], merges: ['A1:' + ult + '1', 'A2:' + ult + '2'], freeze: 3, validacoes: validacoes
    };

    // ---------- aba de instruções curtas
    var ins = [], merges = [];
    function lin(cels, merge) { ins.push(cels); if (merge) merges.push(merge.replace(/#/g, ins.length)); return cels; }
    var t = lin([{ v: 'Como preencher a planilha de compras', s: 'titulo' }, { v: '', s: 'titulo' }, { v: '', s: 'titulo' }], 'A#:C#'); t.__altura = 30;
    lin([{ v: 'Nexus Contabilidade' + (nomeEmp ? ' · ' + nomeEmp : ''), s: 'subtitulo' }, { v: '', s: 'subtitulo' }, { v: '', s: 'subtitulo' }], 'A#:C#');
    lin([]);
    [
      'Use a aba "Produtos". Preencha uma linha para cada produto comprado, a partir da linha ' + LINHA_DADOS + '.',
      'Produtos da mesma nota fiscal: repita o número da nota em cada linha.',
      'Campos com * (título laranja) são obrigatórios. Os de título cinza são opcionais: se não souber, deixe em branco.',
      'Valores em reais: só números, sem "R$" (ex.: 1250,90). Margem: só o número (ex.: 20 para 20%).',
      'DAE: informe o código (1031 = ICMS-ST; 1023 = ICMS antecipado) e o valor pago. Se o DAE for da nota inteira, informe o valor em uma linha só e repita o código nos outros produtos cobrados: o sistema divide o valor entre eles.',
      'A linha de exemplo (em cinza) não é importada — pode apagar ou deixar.',
      'Terminou? Salve o arquivo e envie para a Nexus Contabilidade.'
    ].forEach(function (txt, i) {
      var l = lin([{ v: i + 1, s: 'passo' }, { v: txt, s: 'texto' }, { v: '', s: 'texto' }], 'B#:C#');
      l.__altura = txt.length > 110 ? 36 : 22;
    });
    lin([]);
    lin(['Campo', 'Obrigatório?', 'O que informar'].map(function (h) { return { v: h, s: 'cabecalho' }; }));
    MODELO.forEach(function (c) {
      lin([{ v: c.t, s: 'negrito' }, { v: c.r === 'obrig' ? 'Sim' : 'Não', s: c.r === 'obrig' ? 'marcaObrig' : 'marcaOpc' }, { v: c.d, s: 'texto' }]);
    });
    var instrucoes = { name: 'Como preencher', cols: [34, 14, 70], rows: ins, merges: merges, retrato: true };

    return N.xlsx.build({ title: 'Planilha de compras' + (nomeEmp ? ' — ' + nomeEmp : ''), author: 'Nexus Contabilidade', sheets: [produtos, instrucoes] });
  }

  // ------------------------------------------------------------------ leitura e importação
  var INDICE_TITULOS = {};
  COLS.forEach(function (c) {
    [c.t].concat(c.alt || []).forEach(function (titulo) {
      [titulo, titulo.replace(/\([^)]*\)/g, '')].forEach(function (x) { var k = norm(x); if (k && !INDICE_TITULOS[k]) INDICE_TITULOS[k] = c; });
    });
  });
  function porTitulo(cel) {
    if (vazio(cel) || typeof cel !== 'string') return null;
    var k = norm(cel).replace(/\b(obrigatorio|opcional|condicional)\b/g, '').trim();
    return INDICE_TITULOS[k] || INDICE_TITULOS[norm(cel.replace(/\([^)]*\)/g, ''))] || null;
  }

  // textos de apoio do modelo (marcas e dicas) — linhas só com eles são ignoradas
  var MARCAS = {};
  ['OBRIGATÓRIO', 'CONDICIONAL', 'OPCIONAL'].concat(COLS.map(function (c) { return c.d; })).concat(MODELO.map(function (c) { return c.d; })).forEach(function (t) { if (t) MARCAS[norm(t)] = true; });

  function acharCabecalho(linhas) {
    for (var r = 0; r < Math.min(30, linhas.length); r++) {
      var row = linhas[r] || [], mapa = {}, titulos = {}, hits = 0;
      for (var ci = 0; ci < row.length; ci++) {
        var c = porTitulo(row[ci]);
        if (c && mapa[c.id] == null) { mapa[c.id] = ci; titulos[c.id] = String(row[ci]).replace(/\s*\*\s*$/, '').trim(); hits++; }
      }
      if (hits >= 3 && mapa.descricao != null) return { linha: r, mapa: mapa, titulos: titulos };
    }
    return null;
  }

  function linhaVazia(lin, mapa) { return COLS.every(function (c) { return mapa[c.id] == null || vazio(lin[mapa[c.id]]); }); }
  function linhaDeApoio(lin, mapa) {
    // linha de exemplo do modelo ("Exemplo: …" na primeira coluna) ou linha só com marcas/dicas
    if (mapa.op != null && /^exemplo\b/.test(norm(lin[mapa.op]))) return true;
    var cheias = (lin || []).filter(function (v) { return !vazio(v); });
    return cheias.length > 0 && cheias.every(function (v) { return MARCAS[norm(v)]; });
  }
  function temDados(aba, cab) {
    for (var r = cab.linha + 1; r < aba.linhas.length; r++) {
      var lin = aba.linhas[r] || [];
      if (!linhaVazia(lin, cab.mapa) && !linhaDeApoio(lin, cab.mapa)) return true;
    }
    return false;
  }

  function escolherAba(abas) {
    var ignorar = ['exemplo', 'instrucoes', 'listas', 'como preencher'];
    var cand = abas.map(function (a) { return { aba: a, cab: acharCabecalho(a.linhas || []) }; }).filter(function (x) { return x.cab; });
    var prod = cand.filter(function (x) { return norm(x.aba.nome) === 'produtos'; })[0];
    if (prod && temDados(prod.aba, prod.cab)) return prod;
    var outra = cand.filter(function (x) { return ignorar.indexOf(norm(x.aba.nome)) < 0 && temDados(x.aba, x.cab); })[0];
    return outra || prod || cand.filter(function (x) { return ignorar.indexOf(norm(x.aba.nome)) < 0; })[0] || null;
  }

  function listaDe(c) { return c.tipo === 'lista' ? c.lista : c.tipo === 'sn' ? 'simNao' : null; }

  function converter(c, raw) {
    var s = typeof raw === 'string' ? raw.trim() : raw;
    switch (c.tipo) {
      case 'texto': return { valor: String(s) };
      case 'codigo': {
        var t = typeof s === 'number' ? String(Math.round(s)) : String(s);
        if (typeof s === 'number') {
          if (c.id === 'ncm' && t.length === 7) t = '0' + t;
          if (c.id === 'cest' && t.length === 6) t = '0' + t;
          if (c.id === 'cnpj' && t.length < 14) t = ('00000000000000' + t).slice(-14);
        }
        return { valor: t };
      }
      case 'num': case 'money': case 'unit': case 'pct': {
        var n = typeof s === 'number' ? s : F.parse(String(s));
        if (n == null || typeof n !== 'number' || isNaN(n)) return { erro: 'Número inválido: "' + s + '". Use só números (ex.: 1250,90).' };
        if (n < 0) return { erro: 'Não pode ser negativo.' };
        if (c.positivo && !(n > 0)) return { erro: 'Deve ser maior que zero.' };
        if (c.tipo === 'pct' && n >= (c.max || 100)) return { erro: 'Percentual deve ser menor que ' + F.num(c.max || 100, 0) + '%. Informe 20 para 20%.' };
        return { valor: n };
      }
      case 'uf': case 'ufExt': {
        var u = String(s).trim().toUpperCase();
        if (UFS.indexOf(u) >= 0) return { valor: u };
        if (c.tipo === 'ufExt' && ['exterior', 'ex', 'importacao', 'importado', 'exterior importacao'].indexOf(norm(s)) >= 0) return { valor: 'EX' };
        return { erro: 'UF inválida: "' + s + '". Use a sigla do Estado (ex.: SP)' + (c.tipo === 'ufExt' ? ' ou "Exterior".' : '.') };
      }
      default: {
        var L = LISTAS[listaDe(c)];
        var k = norm(s);
        var achado = L.itens.filter(function (it) { return [String(it[0])].concat(it.slice(1)).some(function (x) { return norm(x) === k; }); })[0];
        if (!achado) return { erro: 'Valor "' + s + '" não reconhecido. Use: ' + L.itens.map(function (x) { return x[1]; }).join(', ') + '.' };
        return { valor: achado[0] };
      }
    }
  }

  var NATUREZA = ['tipo', 'ufOrigem', 'ufDestino', 'destinatario'];

  /** Natureza da operação da linha: tipo informado (avançado) ou deduzido da UF do fornecedor */
  function naturezaDaLinha(v, emp) {
    var tipo = v.tipo, ufOrigem = v.ufOrigem;
    if (!tipo && v.ufFornecedor) {
      if (v.ufFornecedor === 'EX') { tipo = 'importacao'; ufOrigem = ''; }
      else { tipo = v.ufFornecedor === emp.uf ? 'interna' : 'interestadual'; ufOrigem = v.ufFornecedor; }
    } else if (tipo && !ufOrigem && v.ufFornecedor && v.ufFornecedor !== 'EX') ufOrigem = v.ufFornecedor;
    return {
      tipo: tipo,
      ufOrigem: ufOrigem || (tipo === 'interestadual' || tipo === 'importacao' ? '' : emp.uf || ''),
      ufDestino: v.ufDestino || emp.uf || '',
      destinatario: v.destinatario || 'contribuinte'
    };
  }

  /** Processa uma linha preenchida: devolve erros/avisos e, se válida, adiciona o produto ao grupo da operação */
  function processarLinha(lin, n, cab, ctx, grupos, ordem) {
    var mapa = cab.mapa;
    var erros = [], avisos = [], comErro = {};
    function rot(id) {
      if (cab.titulos && cab.titulos[id]) return cab.titulos[id];
      var m = MODELO.filter(function (x) { return x.id === id; })[0];
      return m ? m.t : POR_ID[id].t;
    }
    function erro(id, msg) { erros.push({ linha: n, coluna: id ? rot(id) : '', msg: msg }); if (id) comErro[id] = true; }
    function aviso(id, msg) { avisos.push({ linha: n, coluna: id ? rot(id) : '', msg: msg }); }

    var v = {};
    COLS.forEach(function (c) {
      if (mapa[c.id] == null) return;
      var raw = lin[mapa[c.id]];
      if (vazio(raw)) return;
      var x = converter(c, raw);
      if (x.erro) erro(c.id, x.erro); else v[c.id] = x.valor;
    });

    var emp = null;
    if (v.cnpj) {
      var dig = F.onlyDigits(v.cnpj);
      emp = ctx.empresas.filter(function (e) { return F.onlyDigits(e.cnpj) === dig; })[0] || null;
      if (!emp) erro('cnpj', 'CNPJ ' + v.cnpj + ' não está cadastrado no sistema. Cadastre a empresa ou deixe a coluna vazia para usar a empresa selecionada.');
    } else {
      emp = ctx.empresaAtual || null;
      if (!emp) erro('cnpj', 'Nenhuma empresa selecionada no sistema: selecione a empresa antes de importar.');
    }
    ['op', 'descricao', 'quantidade', 'valorUnitario'].forEach(function (id) { if (v[id] == null && !comErro[id]) erro(id, 'Campo obrigatório.'); });

    var chave = emp && v.op != null ? emp.id + '|' + norm(v.op) : null;
    var g = chave ? grupos[chave] : null;
    var nat = null;
    var colNat = mapa.tipo != null ? 'tipo' : 'ufFornecedor';
    if (g) {
      nat = g.natureza;
      // linhas seguintes da mesma nota: o que vier preenchido tem de coincidir com a primeira linha
      var dTipo = null, dUf = null;
      if (v.tipo != null || v.ufFornecedor != null) {
        var dn = naturezaDaLinha(v, emp);
        dTipo = dn.tipo;
        if (v.ufOrigem != null || v.ufFornecedor != null) dUf = dn.ufOrigem;
      } else if (v.ufOrigem != null) dUf = v.ufOrigem;
      if ((dTipo != null && dTipo !== nat.tipo) || (dUf != null && (dUf || '') !== (nat.ufOrigem || ''))) {
        erro(dTipo != null ? colNat : 'ufOrigem', 'Diferente da primeira linha da nota “' + g.nome + '” (linha ' + g.linhas[0] + '). Produtos da mesma nota têm o mesmo fornecedor e a mesma natureza: use outro número de nota para este produto.');
      }
      ['ufDestino', 'destinatario'].forEach(function (id) {
        if (v[id] != null && v[id] !== nat[id]) erro(id, 'Diferente da primeira linha da nota “' + g.nome + '” (linha ' + g.linhas[0] + '): todos os produtos da operação têm a mesma natureza.');
      });
    } else if (emp) {
      if (v.tipo == null && v.ufFornecedor == null && !comErro.tipo && !comErro.ufFornecedor) erro(colNat, mapa.ufFornecedor != null ? 'Informe a UF do fornecedor (obrigatória na primeira linha de cada nota).' : 'Obrigatório na primeira linha de cada operação.');
      else if (!comErro.tipo && !comErro.ufFornecedor) {
        nat = naturezaDaLinha(v, emp);
        if (nat.tipo === 'interestadual' && !nat.ufOrigem) erro('ufOrigem', 'Obrigatória na operação interestadual.');
        if (nat.tipo === 'interestadual' && nat.ufOrigem && nat.ufOrigem === emp.uf) erro(v.ufOrigem != null ? 'ufOrigem' : colNat, 'Operação interestadual com fornecedor da mesma UF da empresa (' + emp.uf + '): a operação é interna.');
        if (nat.tipo === 'interna' && nat.ufOrigem && emp.uf && nat.ufOrigem !== emp.uf) erro(v.ufOrigem != null ? 'ufOrigem' : colNat, 'Operação interna com fornecedor de outra UF (' + nat.ufOrigem + '): para fornecedor de outro Estado, a operação é interestadual.');
      }
    }
    if (erros.length) return { erros: erros, avisos: avisos };

    // ---------- monta o produto: padrões do sistema + regra do perfil + colunas preenchidas
    var it = RTC.model.novoItem(emp);
    var origens = {};
    function set(path, val) { N.store.setPath(it, path, val); origens[path] = 'usuario'; }
    if (v.perfil) {
      it.perfil.resumo = v.perfil;
      var regra = RTC.rules.porId(RTC.rules.REGRA_DO_RESUMO[v.perfil], ctx.regras);
      if (regra) RTC.rules.aplicar(it, regra);
    }
    it.operacao.tipo = nat.tipo;
    it.operacao.ufOrigem = nat.ufOrigem;
    it.operacao.ufDestino = nat.ufDestino;
    it.operacao.destinatario = nat.destinatario;
    COLS.forEach(function (c) { if (c.path && v[c.id] != null) set(c.path, v[c.id]); });
    if (v.fornSimples === true) { set('fornecedor.regime26', 'simples'); if (v.forn27 == null) set('fornecedor.regime27', 'simples'); }
    if (v.aliqEntrada != null) { set('perfil.icms.aliqEntradaAuto', false); set('perfil.icms.aliqEntrada', v.aliqEntrada); }
    if (v.aliqSaida != null) { set('perfil.icms.aliqSaidaAuto', false); set('perfil.icms.aliqSaida', v.aliqSaida); }
    if (v.stValor != null) { set('perfil.st.modo', 'informado'); set('perfil.st.valorInformado', v.stValor); }
    var dae = v.codigoDae != null ? CODIGOS_DAE[F.onlyDigits(v.codigoDae).slice(0, 4)] : null;
    if (dae && v.antTipo == null) set('perfil.antecipado.tipo', dae.tipo);
    var ant = it.perfil.antecipado;
    if (ant.tipo === 'st' && ant.modo === 'diferencial') ant.modo = 'mva';
    if (v.antValor != null) { set('perfil.antecipado.modo', 'informado'); set('perfil.antecipado.valor', v.antValor); }
    if (v.basePreco) it.venda.basePreco = v.basePreco;
    if (v.precoAtual != null) set(it.venda.basePreco === 'unitario' ? 'venda.precoUnitarioAtual' : 'venda.precoAtual', v.precoAtual);
    if (v.precoVendaUnit != null) { it.venda.basePreco = 'unitario'; set('venda.precoUnitarioAtual', v.precoVendaUnit); }
    // método de preço: informado (avançado) ou deduzido — margem → A; só o preço de venda → B (margem efetiva)
    var temPreco = v.precoAtual != null || v.precoVendaUnit != null;
    if (v.modo == null) it.venda.modo = v.margem == null && temPreco ? 'B' : 'A';
    if (v.comissao != null) it.venda.despesas[0].pct = v.comissao;
    if (v.cartao != null) it.venda.despesas[1].pct = v.cartao;
    if (v.outrasDesp != null) it.venda.despesas.push({ descricao: 'Outras despesas variáveis', pct: v.outrasDesp });
    it.origens = Object.assign(it.origens || {}, origens);

    // ---------- condicionais
    if (v.modo != null && it.venda.modo === 'A' && v.margem == null) erro('margem', 'Obrigatória no método A (margem → preço).');
    if (v.modo != null && it.venda.modo === 'B' && !temPreco) erro('precoAtual', 'Obrigatório no método B (preço → margem).');
    if (v.modo == null && v.margem == null && !temPreco) aviso('margem', 'Sem margem e sem preço de venda: o produto é importado, mas o preço só é calculado depois que a margem for informada no sistema.');
    if (it.premissas.valorProdutos2027 === 'manual' && v.unit2027 == null) erro('unit2027', 'Obrigatório quando o valor dos produtos em 2027 é "Informar valor".');
    if (it.premissas.valorProdutos2027 === 'sem_pis_cofins' && v.pisCofinsEmbutido == null) erro('pisCofinsEmbutido', 'Obrigatório quando a hipótese para 2027 é "Sem PIS/Cofins embutidos".');
    var trat = it.perfil.icms.tratamento;
    if (trat === 'st' && it.perfil.st.papel === 'substituido' && RTC.model.tipoAntecipacao(it.perfil.antecipado) !== 'nenhum') erro('antTipo', 'Mercadoria com ICMS-ST retido pelo fornecedor não tem antecipação a recolher na entrada: use "Não há".');
    if (it.fornecedor.regime26 === 'simples' && v.icmsSimplesPct == null) aviso(mapa.fornSimples != null ? 'fornSimples' : 'icmsSimplesPct', 'Fornecedor do Simples: informe no sistema o % de crédito de ICMS que consta na nota (sem ele, o crédito de ICMS fica zero) e, para 2027, a CBS e o IBS pagos no DAS.');
    if (it.fornecedor.regime27 === 'simples' && (v.cbsSimplesPct == null || v.ibsSimplesPct == null) && mapa.fornSimples == null) aviso('cbsSimplesPct', 'Fornecedor do Simples com IBS/CBS no DAS: informe a CBS e o IBS pagos no DAS (limitam o crédito).');
    if (trat === 'reducao_base' && v.reducaoSaida == null) aviso('reducaoSaida', 'Redução de base sem o percentual da saída.');
    if (trat === 'st' && it.perfil.st.modo !== 'informado' && it.perfil.st.mva == null) aviso('stMva', 'Substituição tributária sem MVA nem ICMS-ST retido informado.');
    if (ant.tipo === 'st' && ant.modo === 'mva' && ant.mva == null && v.codigoDae == null) aviso('antMva', 'ICMS-ST na entrada sem MVA nem valor pago informado.');
    if (v.codigoDae != null && !dae) aviso('codigoDae', 'Código do DAE "' + v.codigoDae + '" não reconhecido (1031 = ICMS-ST; 1023 = ICMS antecipado): defina no sistema o recolhimento do ICMS na entrada.' + (v.antValor != null ? ' O valor do DAE foi guardado.' : ''));
    if (dae && emp.uf && emp.uf !== 'CE') aviso('codigoDae', 'Os códigos 1031 e 1023 são da SEFAZ-CE e a empresa está em ' + emp.uf + ': confira o recolhimento do ICMS na entrada.');
    if (v.antValor != null && v.codigoDae == null && v.antTipo == null) aviso('antValor', 'DAE sem código: informe 1031 (ICMS-ST) ou 1023 (ICMS antecipado), ou defina o recolhimento no sistema. O valor foi guardado.');
    if (it.perfil.pisCofins.tratamento === 'outro' && (v.pisManual == null || v.cofinsManual == null)) aviso('pisManual', 'PIS/Cofins "Outro" sem as alíquotas manuais.');
    if (it.perfil.cbsIbs.tratamento === 'reducao' && v.cbsReducao == null) aviso('cbsReducao', 'IBS/CBS com redução sem o percentual.');
    if (it.perfil.cbsIbs.tratamento === 'outro' && (v.cbsManual == null || v.ibsManual == null)) aviso('cbsManual', 'IBS/CBS "Outro" sem as alíquotas manuais.');
    if (!it.produto.ncm) aviso('ncm', 'NCM não informado: o enquadramento tributário não pode ser confirmado.');
    var esp = RTC.model.cfopEsperado(it, emp);
    [['cfopEntrada', esp.entrada, esp.natureza.toLowerCase()], ['cfopSaida', esp.saida, esp.vendaInter ? 'venda interestadual' : 'venda interna']].forEach(function (x) {
      var d = F.onlyDigits(it.produto[x[0]]);
      if (!d) return;
      if (d.length !== 4) erro(x[0], 'O CFOP deve ter 4 dígitos.');
      else if (x[1] && d[0] !== x[1]) erro(x[0], 'CFOP ' + d + ' fora do grupo da operação (' + x[2] + '): deve iniciar por ' + x[1] + '.');
    });
    if (erros.length) return { erros: erros, avisos: avisos };

    if (!g) {
      g = grupos[chave] = { empId: emp.id, empresaNome: emp.razaoSocial || 'Empresa sem nome', nome: String(v.op).trim(), natureza: nat, itens: [], linhas: [], dae: [], emp: emp };
      ordem.push(g);
    }
    g.itens.push(it);
    g.linhas.push(n);
    g.dae.push({ tipo: dae && v.antTipo == null ? dae.tipo : null, rotulo: dae ? dae.rotulo : '', valor: v.antValor != null ? v.antValor : null, linha: n,
      base: (Number(it.produto.quantidade) || 0) * (Number(it.valores.valorUnitario) || 0) });
    return { erros: [], avisos: avisos };
  }

  function r2(x) { return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }

  /**
   * DAE por nota: quando o valor está em uma única linha e o código se repete em outros produtos da mesma nota,
   * o valor é dividido entre eles proporcionalmente ao valor dos produtos. Valor idêntico repetido em todas as
   * linhas gera aviso (provável total da nota contado várias vezes). Linhas com código e sem valor: calculado pelo sistema.
   */
  function ratearDae(g, out) {
    ['st', 'antecipado'].forEach(function (tipo) {
      var idx = g.dae.map(function (d, i) { return i; }).filter(function (i) { return g.dae[i].tipo === tipo; });
      if (!idx.length) return;
      var rot = g.dae[idx[0]].rotulo;
      var comValor = idx.filter(function (i) { return g.dae[i].valor != null; });
      var semValor = idx.filter(function (i) { return g.dae[i].valor == null; });
      if (comValor.length === 1 && semValor.length) {
        var total = g.dae[comValor[0]].valor;
        var soma = idx.reduce(function (t, i) { return t + g.dae[i].base; }, 0);
        var acum = 0;
        idx.forEach(function (i, k) {
          var val = k === idx.length - 1 ? r2(total - acum) : r2(soma ? total * g.dae[i].base / soma : total / idx.length);
          acum = r2(acum + val);
          var it = g.itens[i];
          it.perfil.antecipado.modo = 'informado';
          it.perfil.antecipado.valor = val;
          it.origens['perfil.antecipado.valor'] = 'usuario';
        });
        out.avisos.push({ linha: g.dae[comValor[0]].linha, coluna: 'DAE (R$)', msg: 'DAE de ' + F.brl(total) + ' (' + rot + ') dividido entre os ' + idx.length + ' produtos da nota com o mesmo código, proporcionalmente ao valor de cada um (linhas ' + idx.map(function (i) { return g.dae[i].linha; }).join(', ') + ').' });
        return;
      }
      if (comValor.length >= 2 && !semValor.length) {
        var vals = comValor.map(function (i) { return g.dae[i].valor; });
        if (vals.every(function (x) { return x === vals[0]; })) {
          out.avisos.push({ linha: g.dae[comValor[0]].linha, coluna: 'DAE (R$)', msg: 'O mesmo valor de DAE (' + F.brl(vals[0]) + ') aparece em ' + vals.length + ' produtos da nota: se for o total da nota, informe-o em uma linha só — do contrário, o valor entra ' + vals.length + ' vezes no custo.' });
        }
      }
      semValor.forEach(function (i) {
        if (comValor.length === 1) return;
        out.avisos.push({ linha: g.dae[i].linha, coluna: 'Código do DAE', msg: tipo === 'st'
          ? 'ICMS-ST (1031) sem valor do DAE: informe no sistema a MVA ou o valor pago.'
          : 'ICMS antecipado (1023) sem valor do DAE: o sistema calcula pelo diferencial de alíquotas.' });
      });
    });
  }

  /**
   * Lê as abas da planilha e devolve a pré-visualização da importação.
   * ctx: { arquivo, empresas, empresaAtual, regras, nomesExistentes(empId) → [nomes] }
   */
  function processar(abas, ctx) {
    var esc = escolherAba(abas || []);
    if (!esc) throw new Error('Não encontrei o cabeçalho da planilha (coluna "Descrição do produto"). Use a planilha de compras baixada no sistema.');
    var m = esc.cab.mapa;
    var faltando = ['op', 'descricao', 'quantidade', 'valorUnitario'].filter(function (id) { return m[id] == null; }).map(function (id) { var x = MODELO.filter(function (c) { return c.id === id; })[0]; return x ? x.t : POR_ID[id].t; });
    if (m.tipo == null && m.ufFornecedor == null) faltando.push('UF do fornecedor');
    if (faltando.length) throw new Error('Colunas obrigatórias ausentes na aba "' + esc.aba.nome + '": ' + faltando.join(', ') + '.');
    var out = { arquivo: ctx.arquivo || 'planilha', aba: esc.aba.nome, operacoes: [], erros: [], avisos: [], linhasComErro: [], linhasLidas: 0 };
    var grupos = {}, ordem = [];
    var linhas = esc.aba.linhas;
    for (var r = esc.cab.linha + 1; r < linhas.length; r++) {
      var lin = linhas[r] || [];
      if (linhaVazia(lin, m) || linhaDeApoio(lin, m)) continue;
      out.linhasLidas++;
      var res = processarLinha(lin, r + 1, esc.cab, ctx, grupos, ordem);
      if (res.erros.length) { out.erros = out.erros.concat(res.erros); out.linhasComErro.push(r + 1); }
      out.avisos = out.avisos.concat(res.avisos);
    }
    if (!out.linhasLidas) throw new Error('Nenhum produto preenchido na aba "' + esc.aba.nome + '" (preencha a partir da linha ' + LINHA_DADOS + ').');
    ordem.forEach(function (g) { ratearDae(g, out); });
    var usados = {};
    out.operacoes = ordem.map(function (g) {
      var existentes = (ctx.nomesExistentes ? ctx.nomesExistentes(g.empId) : []).map(function (x) { return String(x).toLowerCase(); });
      usados[g.empId] = usados[g.empId] || [];
      var nomeBase = /^\d+$/.test(g.nome) ? 'NF ' + g.nome : g.nome;
      var nome = nomeBase, i = 2;
      while (existentes.indexOf(nome.toLowerCase()) >= 0 || usados[g.empId].indexOf(nome.toLowerCase()) >= 0) nome = nomeBase + ' (' + i++ + ')';
      usados[g.empId].push(nome.toLowerCase());
      return { empId: g.empId, empresaNome: g.empresaNome, nome: nomeBase, nomeFinal: nome, natureza: RTC.model.naturezaTexto({ itens: g.itens }, g.emp), itens: g.itens, linhas: g.linhas };
    });
    return out;
  }

  /** Lê o arquivo escolhido (.xlsx ou .csv) → Promise<[abas]> */
  function lerArquivo(f) {
    return new Promise(function (ok, falha) {
      var fr = new FileReader();
      var csv = /\.csv$/i.test(f.name) || f.type === 'text/csv';
      fr.onerror = function () { falha(new Error('Não foi possível ler o arquivo.')); };
      fr.onload = function () {
        if (csv) {
          var txt;
          try { txt = new TextDecoder('utf-8', { fatal: true }).decode(fr.result); }
          catch (e) { txt = new TextDecoder('windows-1252').decode(fr.result); } // CSV salvo pelo Excel em português
          try { ok(N.xlsx.lerCsv(txt).abas); } catch (e2) { falha(e2); }
          return;
        }
        N.xlsx.ler(fr.result).then(function (r) { ok(r.abas); }, falha);
      };
      fr.readAsArrayBuffer(f);
    });
  }

  /** Linha no formato de COLS (títulos completos) a partir de um objeto { id: valor } — usada nos testes */
  function linhaCols(o) { return COLS.map(function (c) { return o[c.id] != null ? o[c.id] : null; }); }
  /** Linha no formato do modelo do cliente a partir de um objeto { id: valor } */
  function linhaModelo(o) { return MODELO.map(function (c) { return o[c.id] != null ? o[c.id] : null; }); }

  RTC.planilha = { COLS: COLS, MODELO: MODELO, CODIGOS_DAE: CODIGOS_DAE, LISTAS: LISTAS, LINHA_DADOS: LINHA_DADOS, modelo: modelo, processar: processar, lerArquivo: lerArquivo, linhaCols: linhaCols, linhaModelo: linhaModelo };
})(typeof window !== 'undefined' ? window : globalThis);
