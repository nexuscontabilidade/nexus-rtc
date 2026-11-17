/* RTC Comparativo — tela: cadastro de empresas (com cálculo da alíquota efetiva do Simples Nacional) */
(function (root) {
  'use strict';
  var N = root.Nexus, RTC = N.rtc, U = RTC.ui, F = N.fmt, esc = F.esc;

  var TRIBUTOS = ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CBS', 'IBS', 'CPP', 'IPI', 'ICMS'];

  function itemLista(A, e) {
    var ativo = A.d.ui.empresaEditando === e.id;
    var sn = e.regime === 'SN' ? RTC.simples.calcular(e.simples.anexo, e.simples.rbt12, 2026) : null;
    var nOps = A.opsDaEmpresa(e.id).length;
    return '<li class="nx-emp' + (ativo ? ' is-active' : '') + '">' +
      '<div class="nx-emp-main">' +
      '<strong>' + esc(e.razaoSocial || 'Empresa sem nome') + '</strong>' +
      '<span>' + (e.cnpj ? esc(F.cnpj(e.cnpj)) + ' · ' : '') + (e.uf || 'UF —') + ' · ' + esc(A.regimeRotulo(e.regime)) +
      (sn && !sn.erro ? ' · efetiva ' + F.pct(sn.efetiva) : '') + '</span>' +
      '<small>' + nOps + ' operação(ões)</small></div>' +
      '<div class="nx-emp-acoes">' +
        U.botao(ativo ? 'Em edição' : 'Editar', 'editar-empresa', { dados: { id: e.id }, classe: 'sm', desabilitado: ativo, titulo: 'Abrir a ficha de cadastro' }) +
        U.botao('Operações', 'usar-empresa', { dados: { id: e.id }, classe: 'sm', titulo: 'Abrir as operações desta empresa' }) +
        U.botao('Excluir', 'excluir-empresa', { dados: { id: e.id }, classe: 'sm danger', titulo: 'Excluir o cadastro desta empresa' }) +
      '</div></li>';
  }

  function lista(A) {
    var d = A.d;
    if (!d.empresas.length) return '<p class="nx-muted">Nenhuma empresa cadastrada.</p>';
    return '<ul class="nx-emp-list">' + d.empresas.map(function (e) { return itemLista(A, e); }).join('') + '</ul>';
  }

  function blocoSimples(A, e) {
    var s26 = RTC.simples.calcular(e.simples.anexo, e.simples.rbt12, 2026);
    if (s26.erro) return U.alertas([{ msg: s26.erro }], []);
    var s27 = RTC.simples.calcular(e.simples.anexo, e.simples.rbt12, 2027);
    var linhas = TRIBUTOS.filter(function (t) { return s26.partilha[t] != null || s27.partilha[t] != null; }).map(function (t) {
      var p26 = s26.partilha[t], p27 = s27.partilha[t];
      return '<tr><th scope="row">' + t + '</th>' +
        '<td class="num">' + (p26 != null ? F.pct(p26) : '—') + '</td><td class="num">' + (p26 != null ? F.pct(s26.efetiva * p26 / 100, 4) : '—') + '</td>' +
        '<td class="num">' + (p27 != null ? F.pct(p27) : '—') + '</td><td class="num">' + (p27 != null ? F.pct(s27.efetiva * p27 / 100, 4) : '—') + '</td></tr>';
    }).join('');
    return '<div class="nx-sn">' +
      '<div class="nx-formula-box"><span class="nx-eyebrow">LC 123/2006, art. 18, § 1º-A</span>' +
      '<div class="nx-formula">Alíquota efetiva = (RBT12 × Alíq. nominal − Parcela a deduzir) ÷ RBT12</div>' +
      '<div class="nx-formula is-num">' + esc(s26.formula) + '</div></div>' +
      '<div class="nx-kpis k4">' +
        U.kpi({ rotulo: 'Faixa', valor: s26.faixa + 'ª', sub: F.brl(s26.limiteInf) + ' a ' + F.brl(s26.limiteSup) }) +
        U.kpi({ rotulo: 'Alíquota nominal', valor: F.pct(s26.nominal), sub: RTC.simples.ANEXOS[e.simples.anexo] }) +
        U.kpi({ rotulo: 'Parcela a deduzir', valor: F.brl(s26.pd) }) +
        U.kpi({ rotulo: 'Alíquota efetiva', valor: F.pct(s26.efetiva), sub: '2027 (tabela a confirmar): ' + F.pct(s27.efetiva), destaque: true }) +
      '</div>' +
      '<div class="nx-table-wrap"><table class="nx-table compact"><caption>Repartição do DAS por tributo (percentual da partilha e alíquota efetiva correspondente)</caption>' +
      '<thead><tr><th>Tributo</th><th class="num">Partilha 2026</th><th class="num">Efetiva 2026</th><th class="num">Partilha 2027 ' + U.status('a_confirmar') + '</th><th class="num">Efetiva 2027</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>' +
      U.alertas([], s26.avisos.concat(s27.avisos.filter(function (a) { return s26.avisos.indexOf(a) < 0; })).map(function (m) { return { msg: m, nivel: 'info' }; })) +
      '<p class="nx-fonte">Fundamento: ' + U.fundamentos(['lc123_a18_p1a', 'lc123_anexos', 'lc123_anexos_2027']) + '</p>' +
      '</div>';
  }

  function avisoCnpj(e) {
    if (!e || !e.cnpj) return '';
    return F.cnpjValido(e.cnpj) ? '<span class="nx-ok-text">CNPJ válido.</span>' : '<span class="nx-warn-text">CNPJ com dígito verificador inválido.</span>';
  }

  /** Dados oficiais da Receita Federal (consulta CNPJá), quando a empresa foi buscada pelo CNPJ */
  function cartaoReceita(e) {
    var r = e.receita;
    if (!r) return '';
    var en = r.endereco || {};
    var cep = en.cep && en.cep.length === 8 ? en.cep.slice(0, 5) + '-' + en.cep.slice(5) : (en.cep || '');
    var endereco = [en.logradouro, en.numero, en.complemento].filter(Boolean).join(', ') + (en.bairro ? ' — ' + en.bairro : '') + ' · ' + [en.municipio, en.uf].filter(Boolean).join('/') + (cep ? ' · CEP ' + cep : '');
    var ativa = (r.situacao || '').toLowerCase() === 'ativa';
    function item(rot, val) { return '<div><dt>' + rot + '</dt><dd>' + val + '</dd></div>'; }
    function regime(x) { return x && x.optante ? '<b class="nx-ok-text">Optante</b>' + (x.desde ? ' desde ' + F.date(x.desde) : '') : 'Não optante'; }
    var regimeNota = r.simples && r.simples.optante ? '' : '<p class="nx-note">A Receita não informa se a empresa é do Lucro Presumido ou do Lucro Real: o regime é confirmado pelo escritório.</p>';
    return U.cartao({
      classe: 'nx-receita', eyebrow: 'Receita Federal · consulta CNPJá', titulo: 'Dados cadastrais oficiais',
      sub: 'Base da CNPJá atualizada em ' + (r.atualizadoEm ? F.date(r.atualizadoEm) : '—') + ' · consultado em ' + F.dateTime(r.consultadoEm) + '. Campos preenchidos com esses dados têm o selo “Receita”.',
      corpo: '<dl class="nx-receita-dl">' +
        item('Situação cadastral', '<span class="nx-count ' + (ativa ? 'is-ok' : 'is-erro') + '">' + esc(r.situacao || '—') + '</span>' + (r.situacaoData ? ' desde ' + F.date(r.situacaoData) : '')) +
        item('Estabelecimento', r.matriz === false ? 'Filial' : 'Matriz') +
        item('Abertura', r.abertura ? F.date(r.abertura) : '—') +
        item('Natureza jurídica', esc(r.natureza || '—')) +
        item('Porte', esc(r.porte || '—')) +
        item('Simples Nacional', regime(r.simples)) +
        item('SIMEI (MEI)', regime(r.simei)) +
        item('CNAE principal', r.cnaePrincipal ? '<b>' + esc(r.cnaePrincipal.codigo) + '</b> ' + esc(r.cnaePrincipal.texto) : '—') +
        (r.cnaesSecundarios && r.cnaesSecundarios.length ? item('CNAEs secundários', r.cnaesSecundarios.slice(0, 6).map(function (x) { return esc(x.codigo) + ' ' + esc(x.texto); }).join('<br>') + (r.cnaesSecundarios.length > 6 ? '<br>… e mais ' + (r.cnaesSecundarios.length - 6) : '')) : '') +
        item('Endereço', esc(endereco)) +
        '</dl>' + regimeNota +
        '<p class="nx-fonte">Fonte: <a href="https://cnpja.com/api/open" target="_blank" rel="noopener">CNPJá — API pública</a> (dados públicos da Receita Federal). O quadro de sócios não é guardado.</p>'
    });
  }

  /** Empresa cuja ficha está aberta: rascunho de nova empresa ou empresa em edição */
  function alvo(A) {
    if (A.d.ui.rascunhoEmpresa) return A.d.ui.rascunhoEmpresa;
    return A.d.ui.empresaEditando ? A.empresa(A.d.ui.empresaEditando) : null;
  }

  function editor(A) {
    var e = alvo(A);
    if (!e) {
      return U.cartao({
        classe: 'nx-ficha-fechada', eyebrow: 'Ficha de cadastro', titulo: 'Cadastre ou edite uma empresa',
        corpo: '<p class="nx-muted">A ficha de identificação é liberada ao clicar em <b>Nova empresa</b>. Para alterar uma empresa existente, use <b>Editar</b> na lista.</p>' +
          '<div class="nx-btn-row">' + U.botao('Nova empresa', 'nova-empresa', { tipo: 'primary' }) + '</div>'
      });
    }
    var novo = !!A.d.ui.rascunhoEmpresa;
    var id = e.id;
    var orig = e.origens || {};
    function c(o) { o.scope = 'emp'; o.id = id; o.origem = orig[o.path]; return U.campo(o); }
    function s(o) { o.scope = 'emp'; o.id = id; o.origem = orig[o.path]; return U.selecao(o); }
    var cnpjAviso = '<span data-live="cnpj-aviso">' + avisoCnpj(e) + '</span>';

    var regimeCard = '';
    if (e.regime === 'SN') {
      regimeCard = U.cartao({
        eyebrow: 'Simples Nacional', titulo: 'Dados para a alíquota efetiva',
        sub: 'Informe o anexo e a receita bruta acumulada nos 12 meses anteriores ao período de apuração (RBT12).',
        corpo: '<div class="nx-form-grid">' +
          s({ rotulo: 'Anexo', path: 'simples.anexo', valor: e.simples.anexo, opcoes: [['I', 'Anexo I — Comércio'], ['II', 'Anexo II — Indústria']], largura: 'md' }) +
          c({ rotulo: 'RBT12 — receita bruta 12 meses', path: 'simples.rbt12', tipo: 'money', valor: e.simples.rbt12, largura: 'md', obrigatorio: true, dica: 'Receita bruta acumulada nos 12 meses anteriores ao do período de apuração (LC 123, art. 18, § 1º).' }) +
          '</div>' +
          '<div data-live="simples">' + blocoSimples(A, e) + '</div>' +
          U.chave({ scope: 'emp', id: id, path: 'simples.ibsCbsForaDas2027', marcado: e.simples.ibsCbsForaDas2027, rotulo: 'Em 2027, recolher IBS/CBS fora do DAS (regime regular)', ajuda: 'Opção do art. 41, § 3º, da LC 214/2025: CBS/IBS saem do DAS, são destacados por fora e geram crédito na entrada e para o cliente.' })
      });
    } else if (e.regime === 'LP') {
      regimeCard = U.cartao({
        eyebrow: 'Lucro Presumido', titulo: 'IRPJ e CSLL sobre a receita presumida',
        corpo: '<div class="nx-form-grid">' +
          c({ rotulo: 'Receita bruta anual estimada', path: 'presumido.receitaAnual', tipo: 'money', valor: e.presumido.receitaAnual, largura: 'md', ajuda: 'Define o adicional de IRPJ (lucro presumido acima de R$ 240 mil/ano) e o acréscimo da LC 224/2025 (receita acima de R$ 5 mi/ano).' }) +
          '</div>' +
          U.chave({ scope: 'emp', id: id, path: 'presumido.aplicarLC224', marcado: e.presumido.aplicarLC224 !== false, rotulo: 'Aplicar o acréscimo de 10% na presunção (LC 224/2025, art. 4º)', ajuda: 'Desative se a empresa tiver decisão judicial afastando a regra (tema questionado na ADI 7936).' })
      });
    } else {
      regimeCard = U.cartao({
        eyebrow: 'Lucro Real', titulo: 'IRPJ e CSLL sobre o resultado',
        corpo: '<div class="nx-form-grid">' +
          c({ rotulo: 'Lucro anual estimado', path: 'real.lucroAnual', tipo: 'money', valor: e.real.lucroAnual, largura: 'md', ajuda: 'Acima de R$ 240.000,00/ano aplica-se o adicional de 10% do IRPJ (alíquota marginal de 34% com a CSLL).' }) +
          '</div>'
      });
    }

    var ops = novo ? [] : A.opsDaEmpresa(id);
    var opsHtml = ops.length ? '<ul class="nx-sim-list">' + ops.map(function (op) {
      var nomes = op.itens.map(function (it) { return it.produto.descricao || 'sem descrição'; }).join(', ');
      return '<li><div><strong>' + esc(op.nome) + '</strong><span>' + op.itens.length + ' produto(s)' + (nomes ? ': ' + esc(nomes) : '') + ' · atualizada em ' + F.dateTime(op.atualizadoEm) + '</span></div>' +
        '<div class="nx-emp-acoes">' + U.botao('Abrir', 'abrir-operacao', { dados: { id: op.id }, classe: 'sm' }) + U.botao('Excluir', 'excluir-operacao', { dados: { id: op.id }, classe: 'sm danger-ghost' }) + '</div></li>';
    }).join('') + '</ul>' : '<p class="nx-muted">Nenhuma operação para esta empresa.</p>';

    var acoesTopo = novo
      ? U.botao('Cancelar', 'cancelar-empresa', { classe: 'sm' }) + U.botao('Salvar empresa', 'salvar-empresa', { tipo: 'primary', classe: 'sm' })
      : U.botao('Concluir edição', 'concluir-empresa', { tipo: 'primary', classe: 'sm' }) + U.botao('Excluir empresa', 'excluir-empresa', { dados: { id: id }, classe: 'sm danger' });
    var rodape = '<div class="nx-ficha-rodape">' + (novo
      ? '<p>Preencha ao menos a razão social e a UF. A empresa só é gravada ao clicar em <b>Salvar empresa</b>.</p><div class="nx-card-actions">' + U.botao('Cancelar', 'cancelar-empresa') + U.botao('Salvar empresa', 'salvar-empresa', { tipo: 'primary' }) + '</div>'
      : '<p>As alterações são salvas automaticamente.</p><div class="nx-card-actions">' + U.botao('Excluir empresa', 'excluir-empresa', { dados: { id: id }, classe: 'danger' }) + U.botao('Concluir edição', 'concluir-empresa', { tipo: 'primary' }) + '</div>') + '</div>';

    return '<div class="nx-stack">' +
      U.cartao({
        eyebrow: novo ? 'Nova empresa · ficha de identificação' : 'Editando · ficha de identificação', titulo: '<span data-live="ficha-titulo">' + esc(e.razaoSocial || (novo ? 'Nova empresa' : 'Empresa sem nome')) + '</span>',
        acoes: acoesTopo,
        corpo: '<div class="nx-form-grid">' +
          c({ rotulo: 'Razão social', path: 'razaoSocial', valor: e.razaoSocial, largura: 'lg', obrigatorio: true }) +
          c({ rotulo: 'Nome fantasia', path: 'nomeFantasia', valor: e.nomeFantasia, largura: 'md' }) +
          c({ rotulo: 'CNPJ', path: 'cnpj', valor: e.cnpj, largura: 'md', maxlength: 18, placeholder: '00.000.000/0000-00', ajuda: cnpjAviso }) +
          '<div class="nx-field w-sm nx-field-actions">' + U.botao(A.consultandoCnpj ? 'Consultando…' : (e.receita ? 'Atualizar da Receita' : 'Buscar na Receita'), 'buscar-cnpj', { tipo: 'primary', classe: 'sm', desabilitado: !!A.consultandoCnpj, dados: e.receita ? { forcar: '1' } : {}, titulo: 'Consulta pública na CNPJá (dados da Receita Federal): preenche razão social, nome fantasia, UF, município e, se optante, o Simples Nacional. Até ' + N.cnpja.LIMITE_POR_MINUTO + ' consultas por minuto.' }) + '</div>' +
          s({ rotulo: 'UF', path: 'uf', valor: e.uf, opcoes: U.UF_OPCOES, largura: 'sm', obrigatorio: true }) +
          c({ rotulo: 'Município', path: 'municipio', valor: e.municipio, largura: 'md' }) +
          '</div>'
      }) +
      cartaoReceita(e) +
      U.cartao({
        eyebrow: 'Enquadramento', titulo: 'Regime tributário e atividade',
        corpo: U.segmento({ scope: 'emp', id: id, path: 'regime', valor: e.regime, origem: orig.regime, rotulo: 'Regime tributário', opcoes: [['SN', 'Simples Nacional', 'LC 123/2006'], ['LP', 'Lucro Presumido', 'PIS/Cofins cumulativos'], ['LR', 'Lucro Real', 'PIS/Cofins não cumulativos']] }) +
          U.segmento({ scope: 'emp', id: id, path: 'atividade', valor: e.atividade, origem: orig.atividade, rotulo: 'Atividade na operação', opcoes: [['comercio', 'Comércio', 'Revenda de mercadorias'], ['industria', 'Indústria ou equiparado', 'Contribuinte do IPI']] }) +
          U.chave({ scope: 'emp', id: id, path: 'contribuinteIcms', marcado: e.contribuinteIcms !== false, rotulo: 'Contribuinte do ICMS', ajuda: 'Desmarque apenas se a empresa não tiver inscrição estadual.' })
      }) +
      regimeCard +
      U.cartao({ eyebrow: 'Notas', titulo: 'Observações', corpo: c({ path: 'observacoes', tipo: 'textarea', valor: e.observacoes, largura: 'full', placeholder: 'Informações relevantes: benefícios fiscais, regimes especiais, decisões judiciais…' }) }) +
      (novo ? '' : U.cartao({ eyebrow: 'Operações', titulo: 'Operações desta empresa', acoes: U.botao('Abrir operações', 'usar-empresa', { dados: { id: id }, classe: 'sm' }), corpo: opsHtml })) +
      rodape +
      '</div>';
  }

  RTC.views.empresas = {
    render: function (A) {
      var d = A.d;
      if (!d.empresas.length && !d.ui.rascunhoEmpresa) {
        return U.vazio('Cadastre a primeira empresa', 'O RTC Comparativo calcula os impactos da Reforma Tributária por empresa. Comece cadastrando o cliente com seu regime tributário — ou carregue um exemplo ilustrativo.',
          U.botao('Nova empresa', 'nova-empresa', { tipo: 'primary' }) + U.botao('Carregar exemplo ilustrativo', 'carregar-exemplo'));
      }
      return '<div class="nx-split">' +
        '<div class="nx-split-side">' + U.cartao({ titulo: 'Empresas', sub: d.empresas.length + ' cadastrada(s)', acoes: U.botao('Nova empresa', 'nova-empresa', { tipo: 'primary', classe: 'sm' }), corpo: '<div data-live="lista-empresas">' + lista(A) + '</div>' }) + '</div>' +
        '<div class="nx-split-main">' + editor(A) + '</div>' +
        '</div>';
    },
    live: {
      'lista-empresas': function (A) { return lista(A); },
      'cnpj-aviso': function (A) { return avisoCnpj(alvo(A)); },
      'ficha-titulo': function (A) { var e = alvo(A); return esc(e && e.razaoSocial ? e.razaoSocial : 'Nova empresa'); },
      'simples': function (A) { var e = alvo(A); return e && e.regime === 'SN' ? blocoSimples(A, e) : ''; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
