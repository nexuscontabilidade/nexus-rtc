/*
 * Nexus — shell da plataforma: login, menu de módulos (#/; #/inicio/<modulo> abre as etapas do módulo), páginas da plataforma (#/usuarios),
 * navegação lateral e roteamento por hash (#/modulo/rota).
 * Novos módulos: Nexus.shell.registrar({ id, nome, descricao, icone, rotas: [{id, nome, icone, passo?, tag?, desc?}], rotaPadrao(), iniciar(), render(rota, el), contexto(rota),
 *   opcionais para o menu inicial: resumo (texto), entrada (rota ao abrir pelo menu), resumoInicio({ painel }) → [{rotulo, valor}],
 *   painelInicio() → HTML extra no painel de etapas, com botões [data-inicio-acao] tratados por acaoInicio(acao, dataset) })
 * Módulo fora do acesso do usuário: aparece em cinza (menu, barra lateral e seletor do topo), sem abrir; ao clicar, avisa que não está liberado.
 * Páginas da plataforma: Nexus.shell.registrarPagina({ id, nome, titulo, icone, perfil?: 'admin', render(el, ctx) })
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var ICONES = {
    rtc: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0L5 7zm14 0-3 7a4 4 0 0 0 6 0l-3-7zM8 21h8"/>',
    lucro: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/><path d="M15 8h5v5"/>',
    empresas: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2"/>',
    operacao: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    custo: '<path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    preco: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
    comparativo: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    relatorio: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    parametros: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    inicio: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    baixo: '<path d="m6 9 6 6 6-6"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    voltar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function icone(nome, cls) {
    return '<svg class="nx-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>';
  }

  var modulos = [];
  var paginas = [];
  var atual = { modulo: null, rota: null };
  var els = {};
  var CHAVE_ULTIMA = 'nexus.shell.ultima';   // por usuário: o sufixo é o uid (nunca compartilhado entre logins)
  function chaveUltima() { var u = N.auth && N.auth.sessao && N.auth.sessao(); return CHAVE_ULTIMA + (u ? '.' + u.id : ''); }
  var esc = function (s) { return N.fmt.esc(s); };

  function lerUltima() { try { return JSON.parse(localStorage.getItem(chaveUltima()) || '{}') || {}; } catch (e) { return {}; } }
  function gravarUltima(modulo, rota) { try { var u = lerUltima(); u[modulo] = rota; localStorage.setItem(chaveUltima(), JSON.stringify(u)); } catch (e) { /* sem armazenamento */ } }

  function registrar(mod) { modulos.push(mod); }
  function registrarPagina(p) { paginas.push(p); }
  function usuarioAtual() { return N.auth ? N.auth.atual() : null; }
  /** Página visível para o usuário conectado (páginas com perfil 'admin' só para administradores) */
  function podeVer(p) { if (!p.perfil) return true; var u = usuarioAtual(); return !!(u && u.perfil === p.perfil); }
  /** Módulo liberado para o usuário conectado (definido em Usuários; sem o núcleo de acesso, todos) */
  function liberado(m) { return !N.auth || !N.auth.acessaModulo || N.auth.acessaModulo(m.id); }
  function visiveis() { return modulos.filter(liberado); }
  function msgBloqueado(m) { return 'O módulo ' + m.nome + ' não está liberado no seu acesso. Fale com a Nexus Contabilidade para liberar.'; }
  /** Atributos do item de módulo bloqueado (cinza): não abre; o clique ou Enter mostra o aviso */
  function attrBloqueado(m) { return ' data-mod-bloq="' + esc(m.id) + '" role="link" aria-disabled="true" tabindex="0" title="' + esc(msgBloqueado(m)) + '"'; }
  function avisarBloqueado(el) {
    var m = modulos.filter(function (x) { return x.id === el.getAttribute('data-mod-bloq'); })[0];
    if (m && N.dom && N.dom.toast) N.dom.toast(msgBloqueado(m), 'erro');
  }

  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var partes = h.split('/').filter(Boolean);
    return { modulo: partes[0] || null, rota: partes[1] || null, extra: partes.slice(2) };
  }

  function navegar(modulo, rota) {
    var alvo = '#/' + modulo + '/' + rota;
    if (location.hash === alvo) render();
    else location.hash = alvo;
  }

  function montar() {
    var app = document.getElementById('app');
    var logado = !!usuarioAtual();
    app.innerHTML =
      '<div class="nx-app">' +
        '<aside class="nx-side" id="nx-side">' +
          '<a class="nx-brand" href="#/" aria-label="Nexus Contabilidade — menu de módulos"><span class="nx-logo" role="img" aria-label="Nexus Contabilidade"></span></a>' +
          '<nav class="nx-plat-nav" id="nx-plat-nav" aria-label="Plataforma">' +
            '<a class="nx-home-link" data-rota="inicio" href="#/">' + icone('inicio') + '<span>Menu de módulos</span></a>' +
            paginas.filter(podeVer).map(function (p) { return '<a class="nx-home-link" data-rota="' + esc(p.id) + '" href="#/' + esc(p.id) + '">' + icone(p.icone || p.id) + '<span>' + esc(p.nome) + '</span></a>'; }).join('') +
          '</nav>' +
          '<div class="nx-side-label">Módulos</div>' +
          '<nav class="nx-nav" id="nx-nav" aria-label="Módulos"></nav>' +
          '<div class="nx-side-foot">' +
            '<div id="nx-side-user"></div>' +
            '<span>Plataforma Nexus</span><span id="nx-persist" role="status" aria-live="polite"></span></div>' +
        '</aside>' +
        '<div class="nx-scrim" id="nx-scrim"></div>' +
        '<div class="nx-main">' +
          '<header class="nx-top">' +
            '<button class="nx-menu-btn" id="nx-menu" type="button" aria-label="Abrir menu">' + icone('menu') + '</button>' +
            '<div class="nx-top-title"><span class="nx-eyebrow" id="nx-eyebrow"></span><h1 id="nx-title"></h1></div>' +
            '<nav class="nx-modswitch" id="nx-modswitch" aria-label="Alternar módulo" hidden></nav>' +
            '<div class="nx-top-slot" id="nx-top-slot"></div>' +
            (logado ? '<button class="nx-btn sm nx-top-sair" type="button" data-sair title="Sair da plataforma">' + icone('sair') + '<span>Sair</span></button>' : '') +
          '</header>' +
          '<div class="nx-context" id="nx-context"></div>' +
          '<main class="nx-content" id="nx-content" tabindex="-1"></main>' +
          '<footer class="nx-footer">Nexus Contabilidade · Os resultados dependem dos dados e parâmetros informados; não substituem a análise da legislação aplicável a cada caso.</footer>' +
        '</div>' +
      '</div>';
    els.nav = document.getElementById('nx-nav');
    els.platNav = document.getElementById('nx-plat-nav');
    els.user = document.getElementById('nx-side-user');
    els.content = document.getElementById('nx-content');
    els.context = document.getElementById('nx-context');
    els.title = document.getElementById('nx-title');
    els.eyebrow = document.getElementById('nx-eyebrow');
    els.topSlot = document.getElementById('nx-top-slot');
    els.modSwitch = document.getElementById('nx-modswitch');
    els.side = document.getElementById('nx-side');
    document.getElementById('nx-menu').addEventListener('click', function () { document.body.classList.toggle('nx-menu-aberto'); });
    document.getElementById('nx-scrim').addEventListener('click', function () { document.body.classList.remove('nx-menu-aberto'); });
    app.addEventListener('click', function (ev) {
      // botões do painel de etapas do módulo (ex.: cenário da simulação): o módulo trata e o painel é redesenhado
      var ini = ev.target.closest('[data-inicio-acao]');
      if (ini && atual.rota === 'inicio') {
        var m = modulos.filter(function (x) { return x.id === ini.getAttribute('data-inicio-mod'); })[0];
        if (m && m.acaoInicio) { ev.preventDefault(); m.acaoInicio(ini.getAttribute('data-inicio-acao'), ini.dataset); renderInicio(homeSel); }
        return;
      }
      var bloq = ev.target.closest('[data-mod-bloq]');
      if (bloq) { ev.preventDefault(); avisarBloqueado(bloq); return; }
      if (!ev.target.closest('[data-sair]')) return;
      var sair = function () { N.auth.sair(); };
      if (N.dom && N.dom.confirmar) N.dom.confirmar('Sair da plataforma?', 'Suas alterações são salvas na nuvem antes de sair; seus dados continuam disponíveis no próximo acesso.', 'Sair').then(function (sim) { if (sim) sair(); });
      else sair();
    });
    app.addEventListener('keydown', function (ev) {
      var bloq = (ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.closest('[data-mod-bloq]');
      if (bloq) { ev.preventDefault(); avisarBloqueado(bloq); }
    });
    renderUsuario();
  }

  /** Bloco do usuário conectado (barra lateral) */
  function renderUsuario() {
    var u = usuarioAtual();
    if (!els.user) return;
    els.user.innerHTML = u ? '<div class="nx-side-user">' +
      '<span class="nx-avatar" aria-hidden="true">' + esc((u.nome || u.email).charAt(0).toUpperCase()) + '</span>' +
      (u.perfil === 'admin' ? '<a class="nx-side-user-id" href="#/usuarios" title="Usuários e acessos">' : '<span class="nx-side-user-id">') +
        '<b>' + esc(u.nome || u.email || 'Usuário') + '</b><small>' + (u.perfil === 'admin' ? 'Administrador' : 'Cliente') + (u.nome && u.email ? ' · ' + esc(u.email) : '') + '</small>' + (u.perfil === 'admin' ? '</a>' : '</span>') +
      '<button class="nx-icon-btn nx-sair" type="button" data-sair title="Sair da plataforma" aria-label="Sair da plataforma">' + icone('sair') + '</button></div>' : '';
  }

  // ------------------------------------------------------------------ menu de módulos (#/ e #/inicio/<modulo>)
  // Dois momentos: sem módulo escolhido, os cartões ocupam a tela; ao clicar num módulo, os cartões viram uma faixa
  // e o painel abaixo mostra o caminho de etapas. A escolha fica no hash, então o "voltar" do navegador fecha o painel.
  var homeSel = null;

  function saudacao() {
    var h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
  function rotaDe(m, id) { return m.rotas.filter(function (r) { return r.id === id; })[0] || null; }
  function entradaDe(m) { return rotaDe(m, m.entrada || (m.rotaPadrao ? m.rotaPadrao() : m.rotas[0].id)) || m.rotas[0]; }
  function rotuloRota(r) { return r.passo ? 'Etapa ' + r.passo : (r.tag || ''); }

  function cartaoModulo(m, sel) {
    var aberto = sel === m.id;
    var ultima = rotaDe(m, lerUltima()[m.id]);
    var stats = !sel && m.resumoInicio ? m.resumoInicio() : [];
    return '<a class="nx-modtile' + (aberto ? ' is-aberto' : '') + '" data-mod="' + esc(m.id) + '" href="' + (aberto ? '#/' : '#/inicio/' + esc(m.id)) + '"' +
        ' aria-expanded="' + aberto + '"' + (aberto ? ' aria-controls="nx-modpanel"' : '') + ' aria-label="' + esc(m.nome + (aberto ? ': fechar as etapas' : ': ver as etapas')) + '">' +
      icone(m.icone || m.id, 'nx-modtile-marca') +
      '<span class="nx-modtile-ico">' + icone(m.icone || m.id) + '</span>' +
      '<span class="nx-modtile-txt"><small>' + esc(m.descricao || '') + '</small><strong>' + esc(m.nome) + '</strong>' +
        (m.resumo ? '<span class="nx-modtile-resumo">' + esc(m.resumo) + '</span>' : '') + '</span>' +
      (stats.length ? '<span class="nx-modtile-stats">' + stats.map(function (x) { return '<span><em>' + esc(x.rotulo) + '</em><b>' + esc(x.valor) + '</b></span>'; }).join('') + '</span>' : '') +
      '<span class="nx-modtile-cta">' +
        (ultima ? '<span class="nx-modtile-ultima">' + icone('voltar') + 'Parou em ' + esc(ultima.nome) + '</span>' : '<span></span>') +
        '<span class="nx-modtile-ver"><span class="nx-modtile-ver-txt">' + (aberto ? 'Fechar etapas' : 'Ver etapas') + '</span><i>' + m.rotas.length + '</i>' + icone('baixo', 'nx-modtile-seta') + '</span>' +
      '</span>' +
    '</a>';
  }

  /** Cartão de módulo fora do acesso: cinza, sem etapas; o clique avisa que não está liberado */
  function cartaoBloqueado(m) {
    return '<div class="nx-modtile is-bloqueado"' + attrBloqueado(m) + '>' +
      icone(m.icone || m.id, 'nx-modtile-marca') +
      '<span class="nx-modtile-ico">' + icone(m.icone || m.id) + '</span>' +
      '<span class="nx-modtile-txt"><small>' + esc(m.descricao || '') + '</small><strong>' + esc(m.nome) + '</strong>' +
        (m.resumo ? '<span class="nx-modtile-resumo">' + esc(m.resumo) + '</span>' : '') + '</span>' +
      '<span class="nx-modtile-cta"><span class="nx-modtile-bloq">' + icone('cadeado') + '<span>Não liberado no seu acesso</span></span></span>' +
    '</div>';
  }

  /** Painel do módulo escolhido: cadastro e etapas numeradas numa trilha; o que vem depois da última etapa fica em "Também neste módulo" */
  function painelModulo(m) {
    var entrada = entradaDe(m);
    var ultima = rotaDe(m, lerUltima()[m.id]);
    var stats = m.resumoInicio ? m.resumoInicio({ painel: true }) : [];
    var fim = -1;
    m.rotas.forEach(function (r, i) { if (r.passo) fim = i; });
    var trilha = fim >= 0 ? m.rotas.slice(0, fim + 1) : m.rotas;
    var extras = fim >= 0 ? m.rotas.slice(fim + 1) : [];
    function etapa(r, i) {
      var aqui = ultima && ultima.id === r.id;
      return '<li class="nx-trilha-item' + (aqui ? ' is-aqui' : '') + '" style="--i:' + i + '">' +
        '<span class="nx-trilha-no' + (r.passo ? '' : ' is-inicio') + '" aria-hidden="true">' + (r.passo ? esc(r.passo) : '') + '</span>' +
        '<a class="nx-etapa" href="#/' + m.id + '/' + r.id + '">' +
          '<span class="nx-etapa-top"><span class="nx-etapa-ico">' + icone(r.icone || r.id) + '</span>' + icone('seta', 'nx-etapa-go') + '</span>' +
          '<em>' + esc(rotuloRota(r)) + '</em><b>' + esc(r.nome) + '</b>' + (r.desc ? '<small>' + esc(r.desc) + '</small>' : '') +
          (aqui ? '<span class="nx-etapa-aqui">Você parou aqui</span>' : '') +
        '</a></li>';
    }
    return '<section class="nx-modpanel" id="nx-modpanel" aria-labelledby="nx-modpanel-tit">' +
      '<header class="nx-modpanel-top">' +
        '<div class="nx-modpanel-tit"><span class="nx-eyebrow">Etapas do módulo</span><h2 id="nx-modpanel-tit">' + esc(m.nome) + '</h2>' +
          (m.resumo ? '<p>' + esc(m.resumo) + '</p>' : '') + '</div>' +
        '<div class="nx-modpanel-acoes">' +
          (ultima && ultima.id !== entrada.id ? '<a class="nx-btn" href="#/' + m.id + '/' + ultima.id + '">' + icone('voltar') + 'Continuar em ' + esc(ultima.nome) + '</a>' : '') +
          '<a class="nx-btn primary" href="#/' + m.id + '/' + entrada.id + '">Abrir módulo' + icone('seta') + '</a>' +
          '<a class="nx-icon-btn nx-modpanel-fechar" href="#/" aria-label="Fechar as etapas" title="Fechar as etapas">' + icone('fechar') + '</a>' +
        '</div>' +
      '</header>' +
      (stats.length ? '<dl class="nx-modpanel-stats">' + stats.map(function (x) { return '<div><dt>' + esc(x.rotulo) + '</dt><dd>' + esc(x.valor) + '</dd></div>'; }).join('') + '</dl>' : '') +
      (m.painelInicio ? '<div class="nx-modpanel-extra">' + m.painelInicio() + '</div>' : '') +
      '<div class="nx-home-label">Caminho do módulo · clique numa etapa para abrir</div>' +
      '<ol class="nx-trilha" style="--n:' + trilha.length + '">' + trilha.map(etapa).join('') + '</ol>' +
      (extras.length ? '<div class="nx-home-label">Também neste módulo</div><div class="nx-extras">' + extras.map(function (r) {
        return '<a class="nx-extra" href="#/' + m.id + '/' + r.id + '"><span class="nx-etapa-ico">' + icone(r.icone || r.id) + '</span>' +
          '<span class="nx-extra-txt"><em>' + esc(rotuloRota(r)) + '</em><b>' + esc(r.nome) + '</b>' + (r.desc ? '<small>' + esc(r.desc) + '</small>' : '') + '</span>' +
          icone('seta', 'nx-etapa-go') + '</a>';
      }).join('') + '</div>' : '') +
    '</section>';
  }

  function renderInicio(sel) {
    var lista = visiveis();
    var mod = sel ? lista.filter(function (m) { return m.id === sel; })[0] || null : null;
    if (sel && !mod) history.replaceState(null, '', '#/');
    var trocou = atual.modulo !== null || atual.rota !== 'inicio';
    var anterior = homeSel;
    homeSel = mod ? mod.id : null;
    atual.modulo = null;
    atual.rota = 'inicio';
    document.body.classList.remove('nx-menu-aberto');
    renderNav();
    els.eyebrow.textContent = 'Plataforma Nexus';
    els.title.textContent = 'Menu de módulos';
    document.title = (mod ? mod.nome + ' · ' : '') + 'Menu de módulos · Plataforma Nexus';
    els.context.innerHTML = '';
    els.topSlot.innerHTML = '';
    var u = usuarioAtual();
    var hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var qtd = lista.length, total = modulos.length;
    var nome = u ? String(u.nome || u.email).split(' ')[0] : '';
    els.content.innerHTML =
      '<div class="nx-home ' + (mod ? 'is-aberto' : 'is-escolha') + '">' +
        '<div class="nx-home-bar">' +
          '<div><h2 class="nx-home-hello">' + saudacao() + (nome ? ', <b>' + esc(nome) + '</b>' : '') + '</h2>' +
          '<p class="nx-home-sub">' + (!qtd ? 'Nenhum módulo liberado para o seu acesso. Fale com a Nexus Contabilidade para liberar.' : mod ? 'Escolha uma etapa de <b>' + esc(mod.nome) + '</b>' + (qtd > 1 ? ' ou troque de módulo.' : '.') : 'Escolha um módulo para ver as etapas disponíveis.') + '</p></div>' +
          '<p class="nx-home-date">' + esc(hoje.charAt(0).toUpperCase() + hoje.slice(1)) + ' · ' + (qtd < total ? qtd + ' de ' + total + ' módulos liberados' : qtd + (qtd === 1 ? ' módulo' : ' módulos')) + '</p>' +
        '</div>' +
        // todos os módulos aparecem; os de fora do acesso ficam em cinza
        (total
          ? '<div class="nx-home-grid" style="--cols:' + Math.min(total, 3) + '">' + modulos.map(function (m) { return liberado(m) ? cartaoModulo(m, homeSel) : cartaoBloqueado(m); }).join('') + '</div>'
          : '<section class="nx-card"><div class="nx-card-head"><div><span class="nx-eyebrow">Acesso</span><h2>Nenhum módulo liberado</h2><p>Fale com a Nexus Contabilidade para liberar os módulos do seu acesso.</p></div></div></section>') +
        (mod ? painelModulo(mod) : '') +
      '</div>';
    if (trocou) { window.scrollTo(0, 0); return; }
    // trocou só o módulo escolhido: mantém o foco no cartão clicado e, no celular, leva o painel à vista
    var alvo = homeSel || anterior;
    var cartao = alvo && els.content.querySelector('[data-mod="' + alvo + '"]');
    if (cartao) cartao.focus({ preventScroll: true });
    var painel = document.getElementById('nx-modpanel');
    if (painel && window.innerWidth < 760) {
      var suave = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      painel.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
  }

  // ------------------------------------------------------------------ páginas da plataforma (#/usuarios)
  function renderPagina(p) {
    var trocou = atual.modulo !== null || atual.rota !== p.id;
    atual.modulo = null;
    atual.rota = p.id;
    document.body.classList.remove('nx-menu-aberto');
    renderNav();
    els.eyebrow.textContent = 'Plataforma Nexus';
    els.title.textContent = p.titulo || p.nome;
    document.title = (p.titulo || p.nome) + ' · Plataforma Nexus';
    els.context.innerHTML = '';
    els.topSlot.innerHTML = '';
    p.render(els.content, { trocou: trocou, aoAlterar: renderUsuario });
    if (trocou) window.scrollTo(0, 0);
  }

  function renderNav() {
    Array.prototype.forEach.call(els.platNav.querySelectorAll('[data-rota]'), function (a) {
      var ativo = atual.modulo === null && atual.rota === a.getAttribute('data-rota');
      a.classList.toggle('is-active', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    els.nav.innerHTML = modulos.map(function (m) {
      if (!liberado(m)) {
        return '<div class="nx-mod is-bloqueado"><span class="nx-mod-link"' + attrBloqueado(m) + '>' + icone(m.icone || m.id, 'nx-mod-ico') +
          '<span><strong>' + esc(m.nome) + '</strong><small>Não liberado no seu acesso</small></span>' + icone('cadeado', 'nx-mod-cadeado') + '</span></div>';
      }
      var ativo = atual.modulo === m.id;
      return '<div class="nx-mod' + (ativo ? ' is-active' : '') + '">' +
        '<a class="nx-mod-link" href="#/' + m.id + '/' + (m.rotaPadrao ? m.rotaPadrao() : m.rotas[0].id) + '">' + icone(m.icone || m.id, 'nx-mod-ico') +
        '<span><strong>' + esc(m.nome) + '</strong><small>' + esc(m.descricao || '') + '</small></span></a>' +
        (ativo ? '<ul class="nx-subnav">' + m.rotas.map(function (r) {
          return '<li><a href="#/' + m.id + '/' + r.id + '"' + (atual.rota === r.id ? ' class="is-active" aria-current="page"' : '') + '>' +
            icone(r.icone || r.id) + '<span>' + (r.passo ? '<em>' + r.passo + '</em>' : '') + esc(r.nome) + '</span></a></li>';
        }).join('') + '</ul>' : '') +
        '</div>';
    }).join('');
    renderSeletor();
  }

  /** Rota em que o módulo reabre pelo seletor: a última visitada, senão a de entrada */
  function rotaRetorno(m) {
    var ultima = lerUltima()[m.id];
    return rotaDe(m, ultima) ? ultima : entradaDe(m).id;
  }

  /** Seletor de módulos no topo (só com 2+ módulos e fora do menu inicial, que já mostra os cartões); os de fora do acesso ficam em cinza */
  function renderSeletor() {
    var mostrar = modulos.length > 1 && visiveis().length > 0 && atual.rota !== 'inicio';
    els.modSwitch.hidden = !mostrar;
    if (!mostrar) { els.modSwitch.innerHTML = ''; return; }
    els.modSwitch.innerHTML = modulos.map(function (m) {
      if (!liberado(m)) {
        return '<span class="nx-modswitch-opt is-bloqueado"' + attrBloqueado(m) + '>' +
          '<span class="nx-modswitch-ico">' + icone('cadeado') + '</span><span class="nx-modswitch-txt">' + esc(m.curto || m.nome) + '</span></span>';
      }
      var ativo = atual.modulo === m.id;
      return '<a class="nx-modswitch-opt' + (ativo ? ' is-active' : '') + '" href="#/' + m.id + '/' + rotaRetorno(m) + '"' + (ativo ? ' aria-current="page"' : '') +
        ' title="' + esc(m.nome + (m.descricao ? ' — ' + m.descricao : '')) + '">' +
        '<span class="nx-modswitch-ico">' + icone(m.icone || m.id) + '</span><span class="nx-modswitch-txt">' + esc(m.curto || m.nome) + '</span></a>';
    }).join('');
  }

  function render() {
    var h = parseHash();
    var mod = modulos.filter(function (m) { return m.id === h.modulo; })[0];
    if (!mod) {
      var pag = paginas.filter(function (p) { return p.id === h.modulo; })[0];
      if (pag && podeVer(pag)) return renderPagina(pag);
      if (pag) { history.replaceState(null, '', '#/'); return renderInicio(); }
      if (h.modulo && h.modulo !== 'inicio') history.replaceState(null, '', '#/');
      return renderInicio(h.modulo === 'inicio' ? h.rota : null);
    }
    if (!liberado(mod)) {
      // endereço direto de um módulo fora do acesso do usuário
      history.replaceState(null, '', '#/');
      renderInicio();
      if (N.dom && N.dom.toast) N.dom.toast(msgBloqueado(mod), 'erro');
      return;
    }
    var rota = mod.rotas.filter(function (r) { return r.id === h.rota; })[0];
    if (!rota) {
      var padrao = mod.rotaPadrao ? mod.rotaPadrao() : mod.rotas[0].id;
      history.replaceState(null, '', '#/' + mod.id + '/' + padrao);
      rota = mod.rotas.filter(function (r) { return r.id === padrao; })[0];
    }
    var trocouRota = atual.rota !== rota.id || atual.modulo !== mod.id;
    atual.modulo = mod.id;
    atual.rota = rota.id;
    gravarUltima(mod.id, rota.id);
    document.body.classList.remove('nx-menu-aberto');
    renderNav();
    els.eyebrow.textContent = mod.nome;
    els.title.textContent = rota.titulo || rota.nome;
    document.title = (rota.titulo || rota.nome) + ' · ' + mod.nome + ' · Nexus';
    // conteúdo primeiro: o módulo calcula o estado que a barra de contexto exibe
    mod.render(rota.id, els.content, { trocouRota: trocouRota, extra: h.extra });
    els.context.innerHTML = mod.contexto ? mod.contexto(rota.id) : '';
    els.topSlot.innerHTML = mod.acoesTopo ? mod.acoesTopo(rota.id) : '';
    if (trocouRota) { window.scrollTo(0, 0); }
  }

  function abrir() {
    montar();
    modulos.forEach(function (m) { if (m.iniciar) m.iniciar({ els: els, navegar: navegar, render: render }); });
    // situação do salvamento na nuvem (barra lateral)
    if (N.sync && N.sync.aoMudarStatus) N.sync.aoMudarStatus(function (st, rotulo) { var el = document.getElementById('nx-persist'); if (el) { el.textContent = rotulo; el.setAttribute('data-estado', st); } });
    window.addEventListener('hashchange', render);
    render();
  }

  /** Exige login (quando o núcleo de acesso estiver carregado) e abre a plataforma */
  function iniciar() {
    if (N.auth) N.auth.exigir(abrir);
    else abrir();
  }

  N.shell = {
    registrar: registrar, registrarPagina: registrarPagina, iniciar: iniciar, navegar: navegar, render: render,
    icone: icone, atual: atual, els: els, modulos: modulos, paginas: paginas, usuario: usuarioAtual
  };
})(typeof window !== 'undefined' ? window : globalThis);
