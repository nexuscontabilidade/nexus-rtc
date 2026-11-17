/*
 * Nexus — sincronização dos dados de cada cliente com a nuvem (Firestore), com o navegador como cache local.
 *
 * Princípios:
 *  - Os módulos continuam lendo e gravando de forma síncrona (Nexus.store). Cada alteração vai primeiro para o
 *    cache local DESTE usuário (chave nexus.cache.<uid>.<módulo>) e só depois é enviada à nuvem, em segundo plano.
 *    Sem internet nada se perde: o cache fica marcado como "pendente" e é enviado quando a conexão volta.
 *  - Isolamento: tudo é gravado em users/{uid}/... (a nuvem recusa qualquer outro caminho) e o cache local leva o uid
 *    na chave. Outro login no mesmo navegador não enxerga os dados. Ao sair, o cache é apagado (se já estiver enviado).
 *  - Concorrência: cada repositório tem uma revisão (rev). A gravação só vale se a nuvem ainda estiver na revisão
 *    que o dispositivo conhece; senão há conflito e o usuário escolhe qual versão manter (a descartada vira backup local).
 *  - Migração: dados salvos neste navegador antes da nuvem (chave antiga) são oferecidos ao usuário na primeira entrada.
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var atrasoEnvio = 1500;                  // junta várias digitações num único envio
  var esperas = [4000, 15000, 60000];      // novas tentativas após falha de rede
  var PREF_CACHE = 'nexus.cache.', PREF_BACKUP = 'nexus.backup.', PREF_RECUSA = 'nexus.legado.recusado.';

  var stores = {};            // id -> { api, chaveLegado, baseRev, texto, dirty, timer, enviando, refazer, falhas, status }
  var ativoUid = null;
  var backend = null;         // Nexus.nuvem (ou adaptador de memória nos testes)
  var opcoes = {};
  var ouvintes = [];
  var rotuloOffline = false;

  // ------------------------------------------------------------------ armazenamento local (pode estar bloqueado)
  function lerLS(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLS(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function apagarLS(k) { try { root.localStorage.removeItem(k); } catch (e) { /* idem */ } }
  function chaveCache(id) { return PREF_CACHE + ativoUid + '.' + id; }
  function lerCache(id) { var r = lerLS(chaveCache(id)); try { return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function gravarCache(id, s) { return gravarLS(chaveCache(id), JSON.stringify({ rev: s.baseRev, dirty: !!s.dirty, texto: s.texto, em: Date.now() })); }
  function guardarBackup(id, texto, motivo) {
    if (texto) gravarLS(PREF_BACKUP + ativoUid + '.' + id, JSON.stringify({ motivo: motivo, em: new Date().toISOString(), texto: texto }));
  }

  // ------------------------------------------------------------------ status
  var ROTULOS = {
    ok: 'Salvo na nuvem', pendente: 'Salvando…', offline: 'Sem conexão — alterações guardadas neste navegador',
    erro: 'Não foi possível salvar na nuvem', conflito: 'Conflito de versões — escolha a versão a manter', negado: 'Sem permissão para salvar na nuvem'
  };
  function statusGeral() {
    var ordem = ['conflito', 'negado', 'erro', 'offline', 'pendente'];
    var todos = Object.keys(stores).map(function (k) { return stores[k]; }).filter(function (s) { return s.ligado; });
    for (var i = 0; i < ordem.length; i++) if (todos.some(function (s) { return s.status === ordem[i]; })) return ordem[i];
    return 'ok';
  }
  function avisar() { var st = statusGeral(); ouvintes.forEach(function (fn) { try { fn(st, ROTULOS[st]); } catch (e) { /* ouvinte com erro não derruba a gravação */ } }); }
  function mudar(s, st) { s.status = st; avisar(); }

  // ------------------------------------------------------------------ envio
  function agendar(s, ms) {
    clearTimeout(s.timer);
    s.timer = setTimeout(function () { enviar(s); }, ms);
  }

  function enviar(s) {
    if (!ativoUid || !s.ligado) return Promise.resolve();
    if (s.enviando) { s.refazer = true; return s.promessa; }
    clearTimeout(s.timer);
    s.enviando = true;
    s.promessa = (function laco() {
      s.refazer = false;
      var texto = s.texto, uid = ativoUid;
      return backend.gravarStore(uid, s.id, s.baseRev, texto).then(function (r) {
        if (uid !== ativoUid) return;
        s.baseRev = r.rev;
        s.falhas = 0;
        if (s.texto === texto) {
          s.dirty = false;
          if (s.legadoPendente) { apagarLS(s.chaveLegado); s.legadoPendente = false; }
        } else s.refazer = true;           // houve nova alteração durante o envio
        gravarCache(s.id, s);
        if (s.refazer) return laco();
        mudar(s, 'ok');
      });
    })().catch(function (e) { return tratarFalha(s, e); }).then(function () { s.enviando = false; if (s.refazer && s.dirty && s.status !== 'conflito' && s.status !== 'negado') agendar(s, 0); });
    return s.promessa;
  }

  function tratarFalha(s, e) {
    var code = e && e.code;
    if (code === 'conflito') return resolverConflito(s);
    if (code === 'permission-denied' || code === 'unauthenticated') {
      mudar(s, 'negado');
      if (opcoes.aoNegado) try { opcoes.aoNegado(s.id, e); } catch (x) { /* ignora */ }
      return;
    }
    if (code === 'muito-grande' || code === 'invalid-argument' || code === 'resource-exhausted') { mudar(s, 'erro'); if (opcoes.aoErro) opcoes.aoErro(s.id, e); return; }
    // rede indisponível, serviço fora do ar, etc.: mantém pendente e tenta de novo
    s.falhas = (s.falhas || 0) + 1;
    mudar(s, 'offline');
    agendar(s, esperas[Math.min(s.falhas - 1, esperas.length - 1)]);
  }

  function resolverConflito(s) {
    mudar(s, 'conflito');
    var uid = ativoUid;
    return backend.lerStore(uid, s.id).then(function (remoto) {
      var decidir = opcoes.resolverConflito ? opcoes.resolverConflito(s.id, { local: s.texto, remoto: remoto && remoto.texto }) : Promise.resolve('nuvem');
      return Promise.resolve(decidir).then(function (escolha) {
        if (uid !== ativoUid) return;
        if (escolha === 'local') {
          s.baseRev = remoto ? remoto.rev : 0;      // sobrescreve conscientemente a versão da nuvem
          if (remoto) guardarBackup(s.id, remoto.texto, 'substituida-pela-local');
          return backend.gravarStore(uid, s.id, s.baseRev, s.texto).then(function (r) { s.baseRev = r.rev; s.dirty = false; gravarCache(s.id, s); mudar(s, 'ok'); });
        }
        guardarBackup(s.id, s.texto, 'substituida-pela-nuvem');
        s.baseRev = remoto ? remoto.rev : 0;
        s.texto = remoto ? remoto.texto : s.texto;
        s.dirty = !remoto;
        aplicar(s, s.texto);
        gravarCache(s.id, s);
        mudar(s, remoto ? 'ok' : 'pendente');
        if (opcoes.aoSubstituir) opcoes.aoSubstituir(s.id);
      });
    }).catch(function (e) { s.status = null; return tratarFalha(s, e); });
  }

  function aplicar(s, texto) {
    var obj = null;
    try { obj = texto ? JSON.parse(texto) : null; } catch (e) { guardarBackup(s.id, texto, 'ilegivel'); }
    s.api._carregar(obj);
  }

  // ------------------------------------------------------------------ API para o Store
  function registrar(id, api, chaveLegado) {
    stores[id] = { id: id, api: api, chaveLegado: chaveLegado || null, baseRev: 0, texto: null, dirty: false, status: 'ok', ligado: false };
  }

  function ativo() { return !!ativoUid; }

  /** Chamado pelo Store a cada gravação: guarda no cache local e agenda o envio */
  function alterado(id, texto) {
    var s = stores[id];
    if (!ativoUid || !s || !s.ligado) return false;
    s.texto = texto;
    s.dirty = true;
    gravarCache(id, s);
    if (s.status !== 'conflito') mudar(s, 'pendente');
    agendar(s, atrasoEnvio);
    return true;
  }

  /** Envia agora tudo o que estiver pendente. Resolve true se nada ficou pendente. */
  function enviarTudo() {
    var ps = Object.keys(stores).map(function (k) { return stores[k]; }).filter(function (s) { return s.ligado && s.dirty; }).map(function (s) {
      clearTimeout(s.timer);
      return enviar(s);
    });
    return Promise.all(ps).then(function () { return !pendentes(); });
  }
  function pendentes() { return Object.keys(stores).some(function (k) { return stores[k].ligado && stores[k].dirty; }); }

  /**
   * Liga a sincronização para o usuário `uid` e carrega os dados da nuvem (ou do cache pendente) para os repositórios.
   * opcoes: { backend, permitido(id), confirmarMigracao(ids), resolverConflito(id, info), aoSubstituir(id), aoNegado(id, erro), aoErro(id, erro) }
   */
  function ativar(uid, op) {
    opcoes = op || {};
    backend = opcoes.backend || N.nuvem;
    ativoUid = uid;
    var ids = Object.keys(stores).filter(function (id) { return !opcoes.permitido || opcoes.permitido(id); });
    var legados = [];
    return Promise.all(ids.map(function (id) {
      var s = stores[id];
      s.ligado = false; s.status = 'ok'; s.dirty = false; s.falhas = 0;
      return backend.lerStore(uid, id).then(function (remoto) { return { id: id, remoto: remoto, offline: false }; }, function (e) {
        var cache = lerCache(id);
        // sem rede: só abre se houver cache deste usuário (nunca começa "do zero" e correr o risco de sobrescrever a nuvem)
        if (cache && e && (e.code === 'unavailable' || e.code === 'network' || /network|offline|unavailable/i.test(String(e.message || e.code)))) return { id: id, remoto: undefined, offline: true };
        throw e;
      });
    })).then(function (lidos) {
      var conflitos = [];
      lidos.forEach(function (r) {
        var s = stores[r.id], cache = lerCache(r.id);
        s.ligado = true;
        if (r.offline) { s.baseRev = cache.rev; s.texto = cache.texto; s.dirty = !!cache.dirty; s.status = 'offline'; return; }
        if (r.remoto) {
          if (cache && cache.dirty && cache.rev === r.remoto.rev) { s.baseRev = r.remoto.rev; s.texto = cache.texto; s.dirty = true; }
          else if (cache && cache.dirty && cache.texto !== r.remoto.texto) { conflitos.push({ s: s, remoto: r.remoto, cache: cache }); s.baseRev = r.remoto.rev; s.texto = r.remoto.texto; s.dirty = false; }
          else { s.baseRev = r.remoto.rev; s.texto = r.remoto.texto; s.dirty = false; }
        } else if (cache && cache.dirty) { s.baseRev = 0; s.texto = cache.texto; s.dirty = true; }
        else {
          s.baseRev = 0; s.texto = null; s.dirty = false;
          if (s.chaveLegado && lerLS(s.chaveLegado) && !lerLS(PREF_RECUSA + uid)) legados.push(s);
        }
      });
      // dados do navegador de antes da nuvem: só entram na conta se o usuário permitir
      var migra = legados.length && opcoes.confirmarMigracao ? Promise.resolve(opcoes.confirmarMigracao(legados.map(function (s) { return s.id; }))) : Promise.resolve(false);
      return migra.then(function (sim) {
        if (legados.length && !sim) gravarLS(PREF_RECUSA + uid, '1');
        else legados.forEach(function (s) { s.texto = lerLS(s.chaveLegado); s.dirty = true; s.legadoPendente = true; });
        // conflitos de abertura: o cache local tinha alterações não enviadas e a nuvem avançou em outro dispositivo
        return conflitos.reduce(function (p, c) {
          return p.then(function () {
            var d = opcoes.resolverConflito ? opcoes.resolverConflito(c.s.id, { local: c.cache.texto, remoto: c.remoto.texto }) : 'nuvem';
            return Promise.resolve(d).then(function (esc) {
              if (esc === 'local') { guardarBackup(c.s.id, c.remoto.texto, 'substituida-pela-local'); c.s.texto = c.cache.texto; c.s.dirty = true; }
              else guardarBackup(c.s.id, c.cache.texto, 'substituida-pela-nuvem');
            });
          });
        }, Promise.resolve());
      }).then(function () {
        Object.keys(stores).forEach(function (id) {
          var s = stores[id];
          if (!s.ligado) return;
          aplicar(s, s.texto);
          if (s.texto == null) s.texto = s.api._serializar();
          gravarCache(id, s);
          if (s.dirty) { if (s.status !== 'offline') s.status = 'pendente'; agendar(s, 200); }
        });
        avisar();
      });
    }).catch(function (e) { desligar(); throw e; });
  }

  function desligar() {
    Object.keys(stores).forEach(function (id) { var s = stores[id]; clearTimeout(s.timer); s.ligado = false; });
    ativoUid = null;
  }

  /**
   * Encerra a sincronização (saída do usuário). Tenta enviar o que está pendente; se tudo foi enviado, apaga o cache
   * local do usuário, inclusive backups de conflito (computadores compartilhados). Pendência não enviada fica guardada para o próximo login do mesmo usuário.
   */
  function desativar(op) {
    op = op || {};
    var uid = ativoUid;
    if (!uid) return Promise.resolve({ pendente: false });
    var relogio;
    var limite = new Promise(function (res) { relogio = setTimeout(function () { res(false); }, op.limiteMs || 8000); });
    return Promise.race([enviarTudo(), limite]).then(function () {
      clearTimeout(relogio);
      var pend = pendentes();
      if (!pend && op.limpar !== false) Object.keys(stores).forEach(function (id) { apagarLS(PREF_CACHE + uid + '.' + id); apagarLS(PREF_BACKUP + uid + '.' + id); });
      desligar();
      Object.keys(stores).forEach(function (id) { stores[id].api._descartar(); }); // a memória não guarda dados do usuário que saiu
      return { pendente: pend };
    });
  }

  function rotulo() { return ROTULOS[statusGeral()]; }

  // reenvia ao voltar a conexão, ao voltar para a aba e antes de fechar
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('online', function () { Object.keys(stores).forEach(function (k) { var s = stores[k]; if (s.ligado && s.dirty && s.status === 'offline') agendar(s, 200); }); });
    root.addEventListener('visibilitychange', function () { if (root.document && root.document.visibilityState === 'hidden' && ativoUid) enviarTudo(); });
    root.addEventListener('beforeunload', function (ev) {
      if (ativoUid && pendentes()) { enviarTudo(); ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  N.sync = {
    registrar: registrar, ativo: ativo, alterado: alterado, ativar: ativar, desativar: desativar, enviarTudo: enviarTudo, pendentes: pendentes,
    status: statusGeral, rotulo: rotulo,
    /** Com a nuvem em uso, os repositórios nunca gravam na chave local compartilhada (mesmo depois de sair) */
    exigeNuvem: false, aoMudarStatus: function (fn) { ouvintes.push(fn); },
    ROTULOS: ROTULOS,
    // testes
    _estado: function () { return stores; }, _tempos: function (envio, tentativas) { atrasoEnvio = envio; esperas = tentativas; }, _reset: function () { desligar(); stores = {}; ouvintes = []; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
