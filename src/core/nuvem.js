/*
 * Nexus — adaptador do Firebase (Authentication + Cloud Firestore). É a única camada que conhece o SDK do Firebase;
 * auth.js e sync.js falam apenas com esta interface (promessas), o que permite testá-los com um adaptador de memória.
 *
 * Modelo de dados (regras em firestore.rules):
 *   users/{uid}                          perfil: nome, email, perfil ('admin'|'cliente'), modulos (null = todos), bloqueado, ...
 *                                        escrito SÓ por administradores; o próprio usuário apenas lê.
 *   users/{uid}/stores/{rtc|lucro}       cabeçalho do repositório de dados do módulo: { rev, partes, atualizadoEm }
 *   users/{uid}/stores/{id}/partes/{n}   o JSON do repositório, em pedaços (limite de 1 MB por documento): { rev, texto }
 * Cada cliente lê e grava somente em users/{seu uid}. Administrador gerencia perfis e NÃO lê dados de clientes.
 *
 * O SDK é carregado sob demanda do CDN oficial do Google (versão fixa) — funciona também a partir de file://,
 * mas o login do Firebase exige http(s) ou localhost.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var VERSAO_SDK = '13.4.0';
  var BASE_SDK = 'https://www.gstatic.com/firebasejs/' + VERSAO_SDK + '/';
  var TAM_PARTE = 150000;      // caracteres por documento (o limite do Firestore é 1 MiB em bytes; UTF-8 chega a 3 bytes/char)
  var MAX_PARTES = 60;         // ~9 milhões de caracteres por módulo

  var sdk = null, app = null, auth = null, db = null, cfg = null, iniciando = null;

  function erro(code, message) { var e = new Error(message || code); e.code = code; return e; }

  /** Carrega o SDK (CDN) ou usa o injetado (testes em Node) */
  function carregarSdk() {
    if (sdk) return Promise.resolve(sdk);
    var imp = function (arq) { return import(BASE_SDK + arq); };
    return Promise.all([imp('firebase-app.js'), imp('firebase-auth.js'), imp('firebase-firestore.js')]).then(function (m) {
      sdk = { app: m[0], auth: m[1], firestore: m[2] };
      return sdk;
    });
  }

  /** Inicializa o Firebase uma única vez. config: window.NEXUS_FIREBASE */
  function iniciar(config) {
    if (iniciando) return iniciando;
    cfg = config || root.NEXUS_FIREBASE;
    if (!cfg || !cfg.apiKey || !cfg.projectId) return Promise.reject(erro('config', 'Configuração do Firebase ausente (config/firebase-config.js).'));
    iniciando = carregarSdk().then(function (s) {
      var opts = { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId };
      app = s.app.initializeApp(opts);
      auth = s.auth.getAuth(app);
      db = s.firestore.getFirestore(app);
      if (cfg.emulador) {
        s.auth.connectAuthEmulator(auth, 'http://' + cfg.emulador.host + ':' + cfg.emulador.auth, { disableWarnings: true });
        s.firestore.connectFirestoreEmulator(db, cfg.emulador.host, cfg.emulador.firestore);
      }
    }).catch(function (e) { iniciando = null; throw e; });
    return iniciando;
  }

  // ------------------------------------------------------------------ autenticação
  function usuarioFb(u) { return u ? { uid: u.uid, email: u.email || '' } : null; }

  /** Entra com e-mail e senha. lembrar=true mantém a sessão entre aberturas do navegador; senão, só até fechar. */
  function entrar(email, senha, lembrar) {
    var A = sdk.auth;
    return A.setPersistence(auth, lembrar ? A.browserLocalPersistence : A.browserSessionPersistence)
      .then(function () { return A.signInWithEmailAndPassword(auth, email, senha); })
      .then(function (r) { return usuarioFb(r.user); });
  }
  function sair() { return sdk.auth.signOut(auth); }
  function aoMudarAutenticacao(fn) { return sdk.auth.onAuthStateChanged(auth, function (u) { fn(usuarioFb(u)); }); }
  function usuarioAtual() { return usuarioFb(auth && auth.currentUser); }
  function redefinirSenha(email) { return sdk.auth.sendPasswordResetEmail(auth, email); }

  /**
   * Cria a conta de login SEM trocar a sessão do administrador: usa uma instância secundária do app,
   * que é descartada em seguida. Se o e-mail já tem conta (cadastro interrompido antes do perfil), tenta
   * entrar com a senha informada para recuperar o uid.
   */
  function criarConta(email, senha) {
    var A = sdk.auth;
    var sec = sdk.app.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId }, 'nexus-cadastro-' + Date.now());
    var a2 = A.initializeAuth(sec, { persistence: A.inMemoryPersistence });
    if (cfg.emulador) A.connectAuthEmulator(a2, 'http://' + cfg.emulador.host + ':' + cfg.emulador.auth, { disableWarnings: true });
    function fim(v) { return A.signOut(a2).catch(function () {}).then(function () { return sdk.app.deleteApp(sec); }).catch(function () {}).then(function () { return v; }); }
    function falha(e) { return fim().then(function () { throw e; }); }
    return A.createUserWithEmailAndPassword(a2, email, senha).then(function (r) { return fim({ uid: r.user.uid, nova: true }); }, function (e) {
      if (e && e.code === 'auth/email-already-in-use') {
        return A.signInWithEmailAndPassword(a2, email, senha).then(function (r) { return fim({ uid: r.user.uid, nova: false }); }, function () { return falha(e); });
      }
      return falha(e);
    });
  }

  // ------------------------------------------------------------------ perfis (users/{uid})
  function refPerfil(uid) { return sdk.firestore.doc(db, 'users', uid); }
  function comId(snap) { var d = snap.data(); d.id = snap.id; return d; }

  function lerPerfil(uid) {
    return sdk.firestore.getDoc(refPerfil(uid)).then(function (s) { return s.exists() ? comId(s) : null; });
  }
  /** Acompanha o perfil em tempo real (bloqueio e mudança de módulos valem sem novo login). cb(perfil|null) */
  function observarPerfil(uid, cb, aoErro) {
    return sdk.firestore.onSnapshot(refPerfil(uid), function (s) { cb(s.exists() ? comId(s) : null); }, aoErro || function () {});
  }
  function listarPerfis() {
    return sdk.firestore.getDocs(sdk.firestore.collection(db, 'users')).then(function (q) { return q.docs.map(comId); });
  }
  function criarPerfil(uid, dados) { return sdk.firestore.setDoc(refPerfil(uid), dados); }
  function atualizarPerfil(uid, dados) { return sdk.firestore.updateDoc(refPerfil(uid), dados); }
  function excluirPerfil(uid) { return sdk.firestore.deleteDoc(refPerfil(uid)); }

  // ------------------------------------------------------------------ repositórios de dados (users/{uid}/stores/{id})
  function refStore(uid, id) { return sdk.firestore.doc(db, 'users', uid, 'stores', id); }

  function partir(texto) {
    var partes = [];
    for (var i = 0; i < texto.length; i += TAM_PARTE) partes.push(texto.slice(i, i + TAM_PARTE));
    return partes.length ? partes : [''];
  }

  /** Lê o repositório inteiro: { rev, texto } ou null. Confere que todas as partes são da mesma revisão (tenta de novo se uma gravação cruzou a leitura). */
  function lerStore(uid, id, tentativa) {
    var F = sdk.firestore;
    tentativa = tentativa || 0;
    return F.getDoc(refStore(uid, id)).then(function (m) {
      if (!m.exists()) return null;
      var meta = m.data();
      return F.getDocs(F.collection(refStore(uid, id), 'partes')).then(function (q) {
        var ps = q.docs.filter(function (d) { return d.data().rev === meta.rev; });
        if (ps.length !== meta.partes) {
          if (tentativa < 3) return lerStore(uid, id, tentativa + 1);
          throw erro('inconsistente', 'Os dados na nuvem estão incompletos (partes ' + ps.length + '/' + meta.partes + ').');
        }
        ps.sort(function (a, b) { return Number(a.id) - Number(b.id); });
        return { rev: meta.rev, texto: ps.map(function (d) { return d.data().texto; }).join('') };
      });
    });
  }

  /**
   * Grava o repositório de forma atômica e só se a revisão da nuvem ainda for `revBase` (controle de concorrência):
   * dois dispositivos nunca sobrescrevem um ao outro sem aviso. Falha com code 'conflito' se a nuvem mudou.
   */
  function gravarStore(uid, id, revBase, texto) {
    var F = sdk.firestore;
    var partes = partir(texto);
    if (partes.length > MAX_PARTES) return Promise.reject(erro('muito-grande', 'Os dados deste módulo excedem o limite de armazenamento.'));
    var ref = refStore(uid, id);
    return F.runTransaction(db, function (tx) {
      return tx.get(ref).then(function (s) {
        var atual = s.exists() ? s.data() : null;
        var revAtual = atual ? atual.rev : 0;
        if (revAtual !== revBase) throw erro('conflito', 'Os dados foram alterados em outro dispositivo.');
        var nova = revAtual + 1;
        partes.forEach(function (t, i) { tx.set(F.doc(ref, 'partes', String(i)), { rev: nova, texto: t }); });
        for (var i = partes.length; atual && i < atual.partes; i++) tx.delete(F.doc(ref, 'partes', String(i)));
        tx.set(ref, { rev: nova, partes: partes.length, atualizadoEm: F.serverTimestamp() });
        return nova;
      });
    }).then(function (rev) { return { rev: rev }; });
  }

  N.nuvem = {
    iniciar: iniciar, entrar: entrar, sair: sair, aoMudarAutenticacao: aoMudarAutenticacao, usuarioAtual: usuarioAtual, redefinirSenha: redefinirSenha, criarConta: criarConta,
    lerPerfil: lerPerfil, observarPerfil: observarPerfil, listarPerfis: listarPerfis, criarPerfil: criarPerfil, atualizarPerfil: atualizarPerfil, excluirPerfil: excluirPerfil,
    lerStore: lerStore, gravarStore: gravarStore,
    TAM_PARTE: TAM_PARTE, MAX_PARTES: MAX_PARTES, _partir: partir, VERSAO_SDK: VERSAO_SDK,
    /** Testes em Node: usa os pacotes npm do Firebase em vez do CDN */
    _injetarSdk: function (s) { sdk = s; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
