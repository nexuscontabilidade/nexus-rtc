/*
 * Nexus — consulta de CNPJ na API pública da CNPJá (dados da Receita Federal).
 * GET https://open.cnpja.com/office/{cnpj} — sem cadastro, até 5 consultas por minuto por IP; aceita chamadas
 * do navegador (CORS liberado), inclusive com a plataforma aberta direto do arquivo.
 * Documentação: https://cnpja.com/api/open
 *
 * Uso: Nexus.cnpja.consultar('00.000.000/0001-91', { forcar }) → Promise<dados normalizados>
 * Só o CNPJ é enviado à CNPJá. Dos dados devolvidos, guardamos apenas os cadastrais da empresa (sem o quadro de sócios).
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  var URL_BASE = 'https://open.cnpja.com/office/';
  var LIMITE_POR_MINUTO = 5;
  var TEMPO_LIMITE_MS = 15000;
  var CACHE_MS = 10 * 60 * 1000;

  var chamadas = [];   // instantes das consultas do último minuto (controle local do limite)
  var cache = {};      // cnpj → { t, dados }

  function digitos(s) { return String(s || '').replace(/\D/g, ''); }

  /** CNAE 4711302 → "4711-3/02" */
  function formatarCnae(id) {
    var d = ('0000000' + digitos(id)).slice(-7);
    return d.slice(0, 4) + '-' + d.slice(4, 5) + '/' + d.slice(5);
  }

  /** Resposta da CNPJá → objeto da plataforma (somente dados cadastrais da empresa) */
  function normalizar(j) {
    var c = j.company || {}, a = j.address || {};
    function regime(r) { return { optante: !!(r && r.optant), desde: (r && r.since) || null }; }
    return {
      cnpj: digitos(j.taxId),
      razaoSocial: c.name || '',
      nomeFantasia: j.alias || '',
      matriz: j.head !== false,
      abertura: j.founded || null,
      situacao: (j.status && j.status.text) || '',
      situacaoData: j.statusDate || null,
      natureza: (c.nature && c.nature.text) || '',
      porte: (c.size && c.size.text) || '',
      endereco: {
        logradouro: a.street || '', numero: a.number || '', complemento: a.details || '', bairro: a.district || '',
        municipio: a.city || '', uf: a.state || '', cep: digitos(a.zip), municipioIbge: a.municipality || null
      },
      cnaePrincipal: j.mainActivity ? { codigo: formatarCnae(j.mainActivity.id), id: j.mainActivity.id, texto: j.mainActivity.text || '' } : null,
      cnaesSecundarios: (j.sideActivities || []).map(function (x) { return { codigo: formatarCnae(x.id), id: x.id, texto: x.text || '' }; }),
      simples: regime(c.simples),
      simei: regime(c.simei),
      atualizadoEm: j.updated || null,       // data da base da CNPJá
      consultadoEm: new Date().toISOString(),
      fonte: 'CNPJá — API pública (Receita Federal)'
    };
  }

  function segundosParaLiberar() {
    var agora = Date.now();
    chamadas = chamadas.filter(function (t) { return agora - t < 60000; });
    if (chamadas.length < LIMITE_POR_MINUTO) return 0;
    return Math.ceil((60000 - (agora - chamadas[0])) / 1000);
  }

  function erro(msg, codigo) { var e = new Error(msg); e.codigo = codigo; return e; }

  /** Consulta o CNPJ (14 dígitos, com ou sem máscara) */
  function consultar(cnpj, opts) {
    opts = opts || {};
    var d = digitos(cnpj);
    if (d.length !== 14 || (N.fmt && N.fmt.cnpjValido && !N.fmt.cnpjValido(d))) return Promise.reject(erro('Informe um CNPJ válido (14 dígitos).', 'invalido'));
    var c = cache[d];
    if (!opts.forcar && c && Date.now() - c.t < CACHE_MS) return Promise.resolve(c.dados);
    if (typeof fetch === 'undefined') return Promise.reject(erro('Este navegador não permite a consulta on-line.', 'navegador'));
    var espera = segundosParaLiberar();
    if (espera) return Promise.reject(erro('Limite da consulta pública atingido (' + LIMITE_POR_MINUTO + ' por minuto). Tente novamente em ' + espera + ' s.', 'limite'));
    chamadas.push(Date.now());

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TEMPO_LIMITE_MS) : null;
    return fetch(URL_BASE + d, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (r.status === 404) throw erro('CNPJ não encontrado na Receita Federal.', 'nao_encontrado');
        if (r.status === 400) throw erro('CNPJ inválido para a consulta.', 'invalido');
        if (r.status === 429) throw erro('A CNPJá limitou as consultas deste computador (até ' + LIMITE_POR_MINUTO + ' por minuto). Aguarde um minuto e tente novamente.', 'limite');
        if (!r.ok) throw erro('A consulta à CNPJá falhou (HTTP ' + r.status + '). Tente novamente mais tarde.', 'servico');
        return r.json();
      })
      .then(function (j) {
        var dados = normalizar(j);
        cache[d] = { t: Date.now(), dados: dados };
        return dados;
      })
      .catch(function (e) {
        if (e && e.codigo) throw e;
        if (e && e.name === 'AbortError') throw erro('A consulta demorou demais. Verifique a conexão com a internet e tente novamente.', 'tempo');
        throw erro('Não foi possível consultar a CNPJá. Verifique a conexão com a internet.', 'rede');
      })
      .then(function (x) { if (timer) clearTimeout(timer); return x; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  N.cnpja = { consultar: consultar, normalizar: normalizar, formatarCnae: formatarCnae, LIMITE_POR_MINUTO: LIMITE_POR_MINUTO, URL_BASE: URL_BASE };
})(typeof window !== 'undefined' ? window : globalThis);
