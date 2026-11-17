/*
 * Nexus — acesso à plataforma com Firebase Authentication + Cloud Firestore.
 *
 * Segurança (aplicada no SERVIDOR, não no navegador):
 *  - Login e senha: Firebase Auth (senhas com hash forte no Google; limite de tentativas; redefinição por e-mail).
 *  - Perfil (administrador × cliente), módulos liberados e bloqueio: documento users/{uid}, que só administradores
 *    escrevem (firestore.rules). Bloquear um cliente corta o acesso aos dados dele de imediato: a nuvem passa a
 *    recusar leituras e gravações, e uma sessão aberta é encerrada em segundos.
 *  - Dados de cada cliente: users/{uid}/..., legíveis apenas pelo próprio dono (ver sync.js e firestore.rules).
 * O navegador só guarda a sessão do Firebase e o cache dos dados do usuário conectado.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var CHAVE_AVISO = 'nexus.aviso';
  var CHAVE_PERFIL = 'nexus.perfil.';          // cache do perfil (abertura sem internet)
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var MSG_BLOQUEIO = 'Seu acesso está bloqueado. Entre em contato com a Nexus Contabilidade para regularizar.';
  var MSG_SEM_PERFIL = 'Esta conta não tem acesso à plataforma. Entre em contato com a Nexus Contabilidade.';
  var MSG_REDE = 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  var MSG_REDEFINIR = 'Se o e-mail estiver cadastrado, você receberá o link para criar uma nova senha.';

  var estado = { usuario: null, parar: null, aberto: false };

  function normEmail(u) { return String(u || '').trim().toLowerCase(); }
  function ler(st, k) { try { return JSON.parse(root[st].getItem(k) || 'null'); } catch (e) { return null; } }
  function gravar(st, k, v) { try { root[st].setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function apagar(st, k) { try { root[st].removeItem(k); } catch (e) { /* idem */ } }

  /** Mensagem amigável para um erro do Firebase (sem revelar se o e-mail existe) */
  function msgErro(e) {
    var c = (e && e.code) || '';
    if (/invalid-credential|user-not-found|wrong-password|invalid-email|missing-password/.test(c)) return 'E-mail ou senha incorretos.';
    if (/too-many-requests/.test(c)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    if (/network|unavailable/.test(c)) return MSG_REDE;
    if (/user-disabled/.test(c)) return MSG_BLOQUEIO;
    if (/email-already-in-use/.test(c)) return 'Já existe uma conta com este e-mail.';
    if (/weak-password/.test(c)) return 'A senha é fraca demais.';
    if (/permission-denied/.test(c)) return 'Sem permissão para esta operação.';
    return 'Não foi possível concluir (' + (c || (e && e.message) || 'erro desconhecido') + ').';
  }

  /** Módulos liberados (ids). null = todos (administrador ou acesso sem escolha de módulos) */
  function modulosDe(p) { return !p || p.perfil === 'admin' || !Array.isArray(p.modulos) ? null : p.modulos.slice(); }
  function publico(p, email) {
    return p ? { id: p.id, nome: p.nome || '', email: p.email || email || '', perfil: p.perfil === 'admin' ? 'admin' : 'cliente', bloqueado: !!p.bloqueado, motivoBloqueio: p.motivoBloqueio || '',
      bloqueadoEm: p.bloqueadoEm || null, criadoEm: p.criadoEm || null, atualizadoEm: p.atualizadoEm || null, modulos: modulosDe(p) } : null;
  }

  /** Política mínima de senha */
  function validarSenha(s) {
    s = String(s || '');
    if (s.length < 8) return 'A senha precisa ter no mínimo 8 caracteres.';
    if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
    return '';
  }

  // ------------------------------------------------------------------ sessão
  function atual() { return estado.usuario ? JSON.parse(JSON.stringify(estado.usuario)) : null; }
  function sessao() { return estado.usuario ? { id: estado.usuario.id, email: estado.usuario.email } : null; }
  function ehAdmin() { return !!(estado.usuario && estado.usuario.perfil === 'admin'); }
  /** O usuário conectado pode abrir o módulo? (administrador e acessos sem escolha de módulos: todos) */
  function acessaModulo(id) { var a = estado.usuario; return !!a && (!a.modulos || a.modulos.indexOf(id) >= 0); }

  function exigirAdmin() {
    return ehAdmin() ? null : { ok: false, msg: 'Somente administradores podem gerenciar acessos.', erros: { geral: 'Somente administradores podem gerenciar acessos.' } };
  }

  /** Encerra a sessão: envia o que estiver pendente, apaga o cache local do usuário e volta ao login */
  function sair(aviso) {
    if (aviso) gravar('sessionStorage', CHAVE_AVISO, aviso);
    var eu = estado.usuario; if (eu) apagar('localStorage', CHAVE_PERFIL + eu.id);   // sem sessão não há uso offline do perfil
    var fim = function () { try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) { /* file:// antigo */ } location.reload(); };
    var sync = N.sync && N.sync.ativo() ? N.sync.desativar({ limpar: true }) : Promise.resolve();
    return sync.catch(function () {}).then(function () { return N.nuvem.sair(); }).catch(function () {}).then(fim);
  }
  /** Saída imposta pelo servidor (bloqueio, acesso removido): não espera o envio, que seria recusado */
  function expulsar(msg) {
    gravar('sessionStorage', CHAVE_AVISO, msg);
    if (estado.usuario) apagar('localStorage', CHAVE_PERFIL + estado.usuario.id);
    if (N.sync && N.sync.ativo()) N.sync.desativar({ limpar: true, limiteMs: 1 });
    Promise.resolve(N.nuvem.sair()).catch(function () {}).then(function () { location.reload(); });
  }

  // ------------------------------------------------------------------ login
  /** Resolve { ok } ou { ok:false, msg }. O restante (perfil, dados) é feito pelo observador em exigir(). */
  function entrar(email, senha, lembrar) {
    email = normEmail(email);
    if (!EMAIL_RE.test(email) || !senha) return Promise.resolve({ ok: false, msg: 'E-mail ou senha incorretos.' });
    return N.nuvem.entrar(email, senha, !!lembrar).then(function () { return { ok: true }; }, function (e) { return { ok: false, msg: msgErro(e) }; });
  }

  /** Envia o e-mail de redefinição; a resposta é a mesma exista ou não o e-mail (não revela cadastros) */
  function redefinirSenha(email) {
    email = normEmail(email);
    if (!EMAIL_RE.test(email)) return Promise.resolve({ ok: false, msg: 'Informe um e-mail válido.' });
    return N.nuvem.redefinirSenha(email).then(function () { return { ok: true, msg: MSG_REDEFINIR }; }, function (e) {
      if (/network|too-many/.test((e && e.code) || '')) return { ok: false, msg: msgErro(e) };
      return { ok: true, msg: MSG_REDEFINIR };
    });
  }

  function opcoesSync(uid) {
    return {
      backend: N.nuvem,
      permitido: function (id) { return acessaModulo(id); },
      confirmarMigracao: function () {
        return N.dom.confirmar('Importar dados deste navegador?', 'Encontramos dados salvos neste navegador de antes da nuvem. Deseja importá-los para a sua conta? Eles passarão a ser guardados com segurança na nuvem e acompanharão você em qualquer computador. Se este navegador é de outra pessoa, escolha Cancelar.', 'Importar para minha conta');
      },
      resolverConflito: function () {
        return N.dom.dialogo({ titulo: 'Seus dados mudaram em outro dispositivo',
          texto: 'Há alterações neste navegador que ainda não foram enviadas, mas a versão na nuvem é mais nova. Qual versão deseja manter? A versão descartada fica guardada como backup neste navegador até você sair da plataforma.',
          botoes: [{ rotulo: 'Manter a da nuvem', valor: 'nuvem', tipo: 'primary' }, { rotulo: 'Manter a deste navegador', valor: 'local', tipo: 'danger' }] }).then(function (v) { return v === 'local' ? 'local' : 'nuvem'; });
      },
      aoSubstituir: function () { location.reload(); },   // recarrega para todas as telas refletirem a versão da nuvem
      aoNegado: function () {
        // a nuvem recusou a gravação: confirma se o acesso foi bloqueado ou removido
        N.nuvem.lerPerfil(uid).then(function (p) { if (!p || p.bloqueado) expulsar(p ? MSG_BLOQUEIO : MSG_SEM_PERFIL); }, function () {});
      }
    };
  }

  /** Mudanças de perfil feitas pelo administrador valem sem novo login */
  function observar(uid) {
    var primeiro = true;
    estado.parar = N.nuvem.observarPerfil(uid, function (p) {
      if (!p || p.bloqueado) { expulsar(p ? MSG_BLOQUEIO : MSG_SEM_PERFIL); return; }
      var antes = estado.usuario;
      p.id = uid;
      var novo = publico(p, antes && antes.email);
      estado.usuario = novo;
      gravar('localStorage', CHAVE_PERFIL + uid, p);
      if (!primeiro && antes && (antes.perfil !== novo.perfil || JSON.stringify(antes.modulos) !== JSON.stringify(novo.modulos))) {
        if (N.dom && N.dom.toast) N.dom.toast('Seu acesso foi atualizado pela Nexus Contabilidade. Recarregando…');
        setTimeout(function () { location.reload(); }, 1500);
      }
      primeiro = false;
    }, function () { /* sem rede: segue com o último perfil conhecido */ });
  }

  /** Valida a conta (perfil existente e não bloqueado) e carrega os dados do usuário. Resolve { ok } ou { ok:false, msg }. */
  function iniciarSessao(u) {
    return N.nuvem.lerPerfil(u.uid).catch(function (e) {
      // sem internet na abertura: usa o último perfil conhecido (as regras do servidor continuam valendo ao sincronizar)
      var c = ler('localStorage', CHAVE_PERFIL + u.uid);
      if (c && /network|unavailable/.test((e && e.code) || (e && e.message) || '')) return c;
      throw e;
    }).then(function (p) {
      if (!p) return { ok: false, msg: MSG_SEM_PERFIL };
      if (p.bloqueado) return { ok: false, msg: MSG_BLOQUEIO };
      p.id = u.uid;
      estado.usuario = publico(p, u.email);
      gravar('localStorage', CHAVE_PERFIL + u.uid, p);
      N.sync.exigeNuvem = true;
      return N.sync.ativar(u.uid, opcoesSync(u.uid)).then(function () { observar(u.uid); return { ok: true }; });
    }).catch(function (e) {
      estado.usuario = null;
      return { ok: false, msg: /network|unavailable/.test((e && e.code) || '') ? MSG_REDE : 'Não foi possível carregar seus dados da nuvem. Tente novamente em instantes.', erro: e };
    });
  }

  // ------------------------------------------------------------------ telas (login e mensagens)
  var OLHO = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  var OLHO_OFF = '<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
  function svg(p, cls) { return '<svg class="nx-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }

  /** Botão mostrar/ocultar para um campo de senha */
  function botaoOlho(rotulo) { return '<button type="button" class="nx-login-eye" data-olho aria-label="Mostrar ' + (rotulo || 'senha') + '" aria-pressed="false">' + svg(OLHO) + '</button>'; }
  function ligarOlhos(raiz) {
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-olho]'), function (eye) {
      var input = eye.parentNode.querySelector('input');
      var rot = (eye.getAttribute('aria-label') || '').replace(/^(Mostrar|Ocultar) /, '');
      eye.addEventListener('click', function () {
        var mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(mostrar));
        eye.setAttribute('aria-label', (mostrar ? 'Ocultar ' : 'Mostrar ') + rot);
        eye.innerHTML = svg(mostrar ? OLHO_OFF : OLHO);
        input.focus();
      });
    });
  }

  function telaMensagem(titulo, texto, botao, acao) {
    var app = document.getElementById('app');
    document.body.classList.add('nx-login-page');
    app.innerHTML = '<div class="nx-login"><section class="nx-login-panel" style="grid-column:1/-1"><div class="nx-login-card" role="status">' +
      '<span class="nx-logo nx-login-logo-sm" role="img" aria-label="Nexus Contabilidade"></span><h2>' + titulo + '</h2><p class="nx-login-sub">' + texto + '</p>' +
      (botao ? '<button class="nx-btn primary nx-login-btn" id="nx-msg-btn" type="button">' + botao + '</button>' : '') + '</div></section></div>';
    if (botao) document.getElementById('nx-msg-btn').addEventListener('click', acao);
  }

  function telaLogin(aviso) {
    var app = document.getElementById('app');
    document.title = 'Entrar · Plataforma Nexus Contabilidade';
    document.body.classList.add('nx-login-page');
    app.innerHTML =
      '<div class="nx-login">' +
        '<section class="nx-login-brand">' +
          '<span class="nx-logo nx-login-logo" role="img" aria-label="Nexus Contabilidade"></span>' +
          '<div class="nx-login-pitch">' +
            '<span class="nx-eyebrow">Plataforma Nexus</span>' +
            '<h1>Gestão tributária e contábil em um só lugar.</h1>' +
            '<p>Acesse os módulos da plataforma: simulações, comparativos e relatórios com base legal citada em cada cálculo.</p>' +
          '</div>' +
          '<ul class="nx-login-feats">' +
            '<li><b>RTC Comparativo</b><span>Preço de venda 2026 × janeiro de 2027</span></li>' +
            '<li><b>Memória de cálculo</b><span>Exportação em PDF e Excel</span></li>' +
            '<li><b>Seus dados na nuvem</b><span>Salvos com segurança, só você acessa</span></li>' +
          '</ul>' +
        '</section>' +
        '<section class="nx-login-panel">' +
          '<form class="nx-login-card" id="nx-login-form" novalidate>' +
            '<span class="nx-logo nx-login-logo-sm" role="img" aria-label="Nexus Contabilidade"></span>' +
            '<span class="nx-eyebrow">Acesso restrito</span>' +
            '<h2>Entrar na plataforma</h2>' +
            '<p class="nx-login-sub">Use o e-mail e a senha cadastrados.</p>' +
            '<label class="nx-field"><span class="nx-label">E-mail</span>' +
              '<span class="nx-input-wrap"><input class="nx-input" id="nx-login-user" name="username" type="email" autocomplete="username" inputmode="email" required placeholder="seu@email.com" autocapitalize="off" spellcheck="false"></span></label>' +
            '<label class="nx-field"><span class="nx-label">Senha</span>' +
              '<span class="nx-input-wrap"><input class="nx-input" id="nx-login-pass" name="password" type="password" autocomplete="current-password" required placeholder="••••••••">' + botaoOlho('senha') + '</span>' +
              '<small class="nx-login-caps" id="nx-login-caps" hidden>Caps Lock ativado</small></label>' +
            '<label class="nx-switch compact"><input type="checkbox" id="nx-login-lembrar"><span class="nx-switch-track"></span><span class="nx-switch-text">Manter conectado neste navegador<small>Não use em computadores compartilhados.</small></span></label>' +
            '<p class="nx-login-erro" id="nx-login-erro" role="alert" aria-live="assertive"></p>' +
            '<button class="nx-btn primary nx-login-btn" id="nx-login-btn" type="submit">Entrar</button>' +
            '<button class="nx-btn nx-login-esqueci" id="nx-login-esqueci" type="button">Esqueci minha senha</button>' +
            '<p class="nx-login-foot">Nexus Contabilidade · acesso apenas para usuários autorizados. O acesso é criado pela Nexus Contabilidade.</p>' +
          '</form>' +
        '</section>' +
      '</div>';

    var form = document.getElementById('nx-login-form');
    var user = document.getElementById('nx-login-user');
    var pass = document.getElementById('nx-login-pass');
    var erro = document.getElementById('nx-login-erro');
    var btn = document.getElementById('nx-login-btn');
    var caps = document.getElementById('nx-login-caps');
    if (aviso) erro.textContent = aviso;

    ligarOlhos(form);
    pass.addEventListener('keyup', function (ev) { caps.hidden = !(ev.getModifierState && ev.getModifierState('CapsLock')); });
    [user, pass].forEach(function (el) { el.addEventListener('input', function () { erro.textContent = ''; form.classList.remove('is-erro'); }); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!user.value.trim() || !pass.value) {
        erro.textContent = 'Informe o e-mail e a senha.';
        (user.value.trim() ? pass : user).focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Verificando…';
      // em caso de sucesso, o observador de autenticação (exigir) abre a plataforma; aqui só tratamos a falha
      entrar(user.value, pass.value, document.getElementById('nx-login-lembrar').checked).then(function (r) {
        if (r.ok) return;
        btn.disabled = false;
        btn.textContent = 'Entrar';
        erro.textContent = r.msg;
        form.classList.remove('is-erro'); void form.offsetWidth; form.classList.add('is-erro');
        pass.value = '';
        pass.focus();
      });
    });
    document.getElementById('nx-login-esqueci').addEventListener('click', function () {
      N.dom.dialogo({ titulo: 'Redefinir senha', texto: 'Informe o e-mail do seu acesso. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha.',
        campos: [{ rotulo: 'E-mail', valor: user.value.trim(), placeholder: 'seu@email.com' }],
        botoes: [{ rotulo: 'Cancelar', valor: null }, { rotulo: 'Enviar link', valor: true, tipo: 'primary' }] }).then(function (v) {
        if (!v) return;
        redefinirSenha(v[0]).then(function (r) { N.dom.toast(r.msg, r.ok ? 'ok' : 'erro'); });
      });
    });
    user.focus();
  }

  /**
   * Conecta ao Firebase, exibe o login quando não há sessão e chama `continuar(sessao)` quando o usuário
   * está autenticado, com perfil válido e os dados carregados.
   */
  function exigir(continuar) {
    telaMensagem('Conectando…', 'Estabelecendo conexão segura com a Nexus.');
    N.nuvem.iniciar().then(function () {
      var avisoPendente = ler('sessionStorage', CHAVE_AVISO);
      apagar('sessionStorage', CHAVE_AVISO);
      var abrindo = false;
      N.nuvem.aoMudarAutenticacao(function (u) {
        if (!u) {
          if (estado.aberto) { location.reload(); return; }
          abrindo = false;
          var aviso = avisoPendente; avisoPendente = null;
          telaLogin(aviso || '');
          return;
        }
        if (estado.aberto || abrindo) return;
        abrindo = true;
        telaMensagem('Entrando…', 'Carregando seus dados com segurança.');
        iniciarSessao(u).then(function (r) {
          if (r.ok) {
            estado.aberto = true;
            document.body.classList.remove('nx-login-page');
            continuar(sessao());
          } else {
            // o aviso aparece no login que o observador mostra assim que a saída termina (u = null)
            avisoPendente = r.msg;
            N.nuvem.sair().catch(function () { abrindo = false; telaLogin(avisoPendente); avisoPendente = null; });
          }
        });
      });
    }, function (e) {
      telaMensagem('Sem conexão com o servidor', 'Não foi possível carregar o serviço de login (' + ((e && (e.code || e.message)) || 'erro') + '). Verifique a internet e tente novamente.', 'Tentar novamente', function () { location.reload(); });
    });
  }

  // ------------------------------------------------------------------ gestão de acessos (somente administradores)
  // A autorização real é das regras do Firestore; as verificações abaixo dão mensagens claras e evitam atos que travariam o escritório.

  /** Todos os perfis cadastrados */
  function listar() {
    var neg = exigirAdmin();
    if (neg) return Promise.reject(new Error(neg.msg));
    return N.nuvem.listarPerfis().then(function (ps) {
      return ps.map(function (p) { return publico(p); }).sort(function (a, b) { return (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'); });
    });
  }
  function admins(lista) { return lista.filter(function (u) { return u.perfil === 'admin' && !u.bloqueado; }); }

  /**
   * Inclui ou altera um acesso. dados: { id?, nome, email, perfil, senha, confirmacao, modulos? }.
   * Novo: cria a conta de login (Firebase Auth) e o perfil. Alteração: nome, perfil e módulos (o e-mail é o login e não muda;
   * a senha é redefinida pelo próprio usuário por e-mail — ver redefinirSenha).
   */
  function salvarUsuario(dados) {
    var neg = exigirAdmin();
    if (neg) return Promise.resolve(neg);
    var erros = {};
    var novo = !dados.id;
    var nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
    var email = normEmail(dados.email);
    var perfil = dados.perfil === 'admin' ? 'admin' : 'cliente';
    var modulos = null;
    if (perfil !== 'admin' && Array.isArray(dados.modulos)) {
      modulos = dados.modulos.filter(function (x, i, a) { return typeof x === 'string' && x && a.indexOf(x) === i; });
      if (!modulos.length) erros.modulos = 'Escolha ao menos um módulo.';
    }
    if (nome.length < 2) erros.nome = 'Informe o nome do usuário.';
    if (novo && !EMAIL_RE.test(email)) erros.email = 'Informe um e-mail válido.';
    if (novo) {
      var msg = validarSenha(dados.senha);
      if (msg) erros.senha = !dados.senha ? 'Informe a senha.' : msg;
      else if (dados.senha !== dados.confirmacao) erros.confirmacao = 'As senhas não conferem.';
    }
    if (Object.keys(erros).length) return Promise.resolve({ ok: false, erros: erros });

    var agora = new Date().toISOString();
    var eu = atual();
    return listar().then(function (lista) {
      if (!novo) {
        var u = lista.filter(function (x) { return x.id === dados.id; })[0];
        if (!u) return { ok: false, erros: { geral: 'Usuário não encontrado.' } };
        if (u.perfil === 'admin' && perfil !== 'admin' && admins(lista).length <= 1) return { ok: false, erros: { geral: 'É preciso manter ao menos um administrador ativo.' } };
        if (eu && u.id === eu.id && perfil !== 'admin') return { ok: false, erros: { geral: 'Você não pode retirar o seu próprio perfil de administrador.' } };
        return N.nuvem.atualizarPerfil(u.id, { nome: nome, perfil: perfil, modulos: modulos, atualizadoEm: agora }).then(function () {
          return { ok: true, novo: false, usuario: publico({ id: u.id, nome: nome, email: u.email, perfil: perfil, modulos: modulos, bloqueado: u.bloqueado }) };
        });
      }
      if (lista.some(function (x) { return normEmail(x.email) === email; })) return { ok: false, erros: { email: 'Já existe um usuário com este e-mail.' } };
      return N.nuvem.criarConta(email, dados.senha).then(function (c) {
        var perfilDoc = { nome: nome, email: email, perfil: perfil, modulos: modulos, bloqueado: false, criadoEm: agora, atualizadoEm: agora };
        return N.nuvem.criarPerfil(c.uid, perfilDoc).then(function () {
          perfilDoc.id = c.uid;
          return { ok: true, novo: true, usuario: publico(perfilDoc) };
        });
      }, function (e) {
        var c = (e && e.code) || '';
        if (/email-already-in-use/.test(c)) return { ok: false, erros: { email: 'Este e-mail já tem uma conta de login com outra senha. Use a senha atual dela ou apague a conta no console do Firebase.' } };
        if (/weak-password/.test(c)) return { ok: false, erros: { senha: 'A senha é fraca demais.' } };
        if (/invalid-email/.test(c)) return { ok: false, erros: { email: 'Informe um e-mail válido.' } };
        return { ok: false, erros: { geral: msgErro(e) } };
      });
    }).catch(function (e) { return { ok: false, erros: { geral: msgErro(e) } }; });
  }

  /** Bloqueia ou desbloqueia o acesso (ex.: fatura em aberto). Vale na hora: a nuvem recusa os dados do cliente bloqueado. */
  function definirBloqueio(id, bloquear, motivo) {
    var neg = exigirAdmin();
    if (neg) return Promise.resolve(neg);
    var eu = atual();
    if (bloquear && eu && eu.id === id) return Promise.resolve({ ok: false, msg: 'Você não pode bloquear o próprio acesso.' });
    return listar().then(function (lista) {
      var u = lista.filter(function (x) { return x.id === id; })[0];
      if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
      if (bloquear && u.perfil === 'admin' && admins(lista).length <= 1) return { ok: false, msg: 'É preciso manter ao menos um administrador ativo.' };
      var agora = new Date().toISOString();
      return N.nuvem.atualizarPerfil(id, { bloqueado: !!bloquear, motivoBloqueio: bloquear ? String(motivo || '').trim() : '', bloqueadoEm: bloquear ? agora : null, atualizadoEm: agora }).then(function () { return { ok: true }; });
    }).catch(function (e) { return { ok: false, msg: msgErro(e) }; });
  }

  /** Remove o perfil: a conta deixa de ter acesso à plataforma e aos dados (a conta de login pode ser apagada no console do Firebase) */
  function excluirUsuario(id) {
    var neg = exigirAdmin();
    if (neg) return Promise.resolve(neg);
    var eu = atual();
    if (eu && eu.id === id) return Promise.resolve({ ok: false, msg: 'Você não pode excluir o próprio usuário.' });
    return listar().then(function (lista) {
      var u = lista.filter(function (x) { return x.id === id; })[0];
      if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
      if (u.perfil === 'admin' && admins(lista).length <= 1) return { ok: false, msg: 'É preciso manter ao menos um administrador ativo.' };
      return N.nuvem.excluirPerfil(id).then(function () { return { ok: true }; });
    }).catch(function (e) { return { ok: false, msg: msgErro(e) }; });
  }

  N.auth = {
    exigir: exigir, entrar: entrar, sessao: sessao, atual: atual, ehAdmin: ehAdmin, acessaModulo: acessaModulo, sair: sair,
    listar: listar, salvarUsuario: salvarUsuario, excluirUsuario: excluirUsuario, definirBloqueio: definirBloqueio, validarSenha: validarSenha,
    redefinirSenha: redefinirSenha, botaoOlho: botaoOlho, ligarOlhos: ligarOlhos, MSG_BLOQUEIO: MSG_BLOQUEIO,
    // testes
    _iniciarSessao: iniciarSessao,
    _encerrar: function () { if (estado.parar) estado.parar(); estado.parar = null; estado.usuario = null; estado.aberto = false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
