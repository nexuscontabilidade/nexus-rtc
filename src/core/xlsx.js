/*
 * Nexus — planilhas .xlsx (Office Open XML) sem dependências: geração e leitura.
 * Geração: zip sem compressão (STORE) + SpreadsheetML com estilos, colunas fixas e listas suspensas.
 * Leitura: zip (STORE ou DEFLATE, via DecompressionStream do navegador) + XML; também lê CSV.
 *
 * Uso:
 *   Nexus.xlsx.build({ sheets: [{ name, cols: [larguras], rows: [[celula, ...]], merges: ['A1:F1'],
 *     freeze: linhas, freezeCols: colunas, colStyles: { indice: 'estilo' },
 *     validacoes: [{ ref: 'C7:C506', lista: 'Listas!$A$2:$A$5' | '"Sim,Não"', erro: 'mensagem' }] }] }) → Blob
 *   celula: valor primitivo ou { v, s: 'estilo' }  (estilos: ver ESTILOS)
 *   percentuais: informe o valor em fração (0,2 = 20%) com estilo 'pct'.
 *   Nexus.xlsx.ler(arrayBuffer) → Promise<{ abas: [{ nome, linhas: [[valor, ...]] }] }>
 *     (células com formato percentual são devolvidas como exibidas: 18% → 18)
 *   Nexus.xlsx.lerCsv(texto) → { abas: [{ nome: 'CSV', linhas }] }
 */
(function (root) {
  'use strict';
  var N = root.Nexus = root.Nexus || {};

  // ---------------- CRC32 + ZIP (store) ----------------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(arquivos) {
    var enc = new TextEncoder();
    var partes = [], central = [];
    var offset = 0;
    var agora = new Date();
    var dosTime = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    var dosDate = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    arquivos.forEach(function (f) {
      var nome = enc.encode(f.name);
      var dados = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(dados);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true); lh.setUint16(26, nome.length, true); lh.setUint16(28, 0, true);
      partes.push(new Uint8Array(lh.buffer), nome, dados);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true); ch.setUint16(28, nome.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nome);
      offset += 30 + nome.length + dados.length;
    });
    var tamCentral = central.reduce(function (s, c) { return s + c.length; }, 0);
    var fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(4, 0, true); fim.setUint16(6, 0, true);
    fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, offset, true); fim.setUint16(20, 0, true);
    return new Blob(partes.concat(central).concat([new Uint8Array(fim.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------------- estilos ----------------
  // fontes: 0 normal, 1 negrito, 2 título (16, negrito, branco), 3 cabeçalho (branco negrito), 4 cinza itálico, 5 laranja negrito, 6 negrito 12
  var FONTS = [
    '<font><sz val="10"/><color rgb="FF242424"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF242424"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><i/><sz val="9"/><color rgb="FF6B625B"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFF7511F"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="12"/><color rgb="FF242424"/><name val="Calibri"/><family val="2"/></font>',
    '<font><sz val="10"/><color rgb="FFFFD9C7"/><name val="Calibri"/><family val="2"/></font>'
  ];
  // fills: 0 none, 1 gray125, 2 preto, 3 laranja, 4 creme, 5 cinza claro, 6 laranja claro, 7 cinza médio
  var FILLS = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF131211"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF7511F"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFAEDE5"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F0EE"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFDCCB"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE4DFDA"/><bgColor indexed="64"/></patternFill></fill>'
  ];
  // bordas: 0 nenhuma, 1 linha inferior fina, 2 linha superior média laranja
  var BORDERS = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE3DCD6"/></bottom><diagonal/></border>',
    '<border><left/><right/><top style="medium"><color rgb="FFF7511F"/></top><bottom style="thin"><color rgb="FFE3DCD6"/></bottom><diagonal/></border>'
  ];
  // numFmt: 164 moeda, 165 percentual 2 casas, 166 número 2 casas, 167 data
  var NUMFMTS = '<numFmts count="4">' +
    '<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="0.00%"/>' +
    '<numFmt numFmtId="166" formatCode="#,##0.00"/>' +
    '<numFmt numFmtId="167" formatCode="#,##0.0000"/>' +
    '</numFmts>';

  // [numFmtId, fontId, fillId, borderId, wrap, hAlign, vAlign]
  var ESTILOS = {
    texto: [0, 0, 0, 1, true, null, 'top'],
    textoCompacto: [0, 0, 0, 1, false, null, 'top'],
    negrito: [0, 1, 0, 1, true, null, 'top'],
    titulo: [0, 2, 2, 0, false, null, 'center'],
    subtitulo: [0, 7, 2, 0, false, null, 'center'],
    cabecalho: [0, 3, 3, 0, true, 'center', 'center'],
    secao: [0, 6, 4, 2, false, null, 'center'],
    nota: [0, 4, 0, 0, true, null, 'top'],
    destaque: [0, 5, 0, 1, true, null, 'top'],
    moeda: [164, 0, 0, 1, false, 'right', 'top'],
    moedaNegrito: [164, 1, 5, 1, false, 'right', 'top'],
    pct: [165, 0, 0, 1, false, 'right', 'top'],
    pctNegrito: [165, 1, 5, 1, false, 'right', 'top'],
    num: [166, 0, 0, 1, false, 'right', 'top'],
    num4: [167, 0, 0, 1, false, 'right', 'top'],
    rotuloTotal: [0, 1, 5, 1, true, null, 'top'],
    // modelo de importação: cabeçalhos por obrigatoriedade, marcas, dicas e células de texto
    cabObrig: [0, 3, 3, 0, true, 'center', 'center'],
    cabCond: [0, 1, 6, 0, true, 'center', 'center'],
    cabOpc: [0, 1, 7, 0, true, 'center', 'center'],
    marcaObrig: [0, 5, 4, 0, true, 'center', 'center'],
    marcaCond: [0, 1, 6, 0, true, 'center', 'center'],
    marcaOpc: [0, 4, 5, 0, true, 'center', 'center'],
    dica: [0, 4, 0, 1, true, 'left', 'top'],
    textoFmt: [49, 0, 0, 1, false, null, 'top'],
    grupoCab: [0, 3, 2, 0, false, 'center', 'center'],
    exemplo: [0, 4, 4, 1, false, null, 'center'],
    exemploNum: [166, 4, 4, 1, false, 'right', 'center'],
    passo: [0, 5, 0, 0, false, 'center', 'top']
  };
  var NOMES = Object.keys(ESTILOS);
  var INDICE = {};
  NOMES.forEach(function (n, i) { INDICE[n] = i + 1; }); // 0 = padrão

  function stylesXml() {
    var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    NOMES.forEach(function (n) {
      var s = ESTILOS[n];
      var align = '<alignment' + (s[4] ? ' wrapText="1"' : '') + (s[5] ? ' horizontal="' + s[5] + '"' : '') + (s[6] ? ' vertical="' + s[6] + '"' : '') + '/>';
      xfs.push('<xf numFmtId="' + s[0] + '" fontId="' + s[1] + '" fillId="' + s[2] + '" borderId="' + s[3] + '" xfId="0"' +
        (s[0] ? ' applyNumberFormat="1"' : '') + ' applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + align + '</xf>');
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + NUMFMTS +
      '<fonts count="' + FONTS.length + '">' + FONTS.join('') + '</fonts>' +
      '<fills count="' + FILLS.length + '">' + FILLS.join('') + '</fills>' +
      '<borders count="' + BORDERS.length + '">' + BORDERS.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  function escXml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      // remove caracteres de controle inválidos em XML
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function colLetra(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function sheetXml(sh) {
    var rows = sh.rows || [];
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
      '<sheetViews><sheetView workbookViewId="0" showGridLines="' + (sh.grade ? '1' : '0') + '">' + painel(sh) + '</sheetView></sheetViews>',
      '<sheetFormatPr defaultRowHeight="15"/>'];
    if (sh.cols && sh.cols.length) {
      out.push('<cols>' + sh.cols.map(function (w, i) {
        var cs = sh.colStyles && sh.colStyles[i] && INDICE[sh.colStyles[i]];
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"' + (cs ? ' style="' + cs + '"' : '') + '/>';
      }).join('') + '</cols>');
    }
    out.push('<sheetData>');
    rows.forEach(function (row, ri) {
      var r = ri + 1;
      var alt = row && row.__altura ? ' ht="' + row.__altura + '" customHeight="1"' : '';
      var cells = (row || []).map(function (c, ci) {
        if (c == null || c === '') return '';
        var v = c, s = null;
        if (typeof c === 'object' && !Array.isArray(c)) { v = c.v; s = c.s; }
        var ref = colLetra(ci) + r;
        var sAttr = s && INDICE[s] ? ' s="' + INDICE[s] + '"' : '';
        if (v == null || v === '') return sAttr ? '<c r="' + ref + '"' + sAttr + '/>' : '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sAttr + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
      }).join('');
      out.push('<row r="' + r + '"' + alt + '>' + cells + '</row>');
    });
    out.push('</sheetData>');
    if (sh.merges && sh.merges.length) {
      out.push('<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
    }
    if (sh.validacoes && sh.validacoes.length) {
      out.push('<dataValidations count="' + sh.validacoes.length + '">' + sh.validacoes.map(function (v) {
        var msg = v.erro ? ' errorTitle="' + escXml(String(v.erroTitulo || 'Valor inválido').slice(0, 32)) + '" error="' + escXml(String(v.erro).slice(0, 255)) + '"' : '';
        if (v.lista) {
          return '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="' + (v.aviso ? 'warning' : 'stop') + '"' + msg + ' sqref="' + v.ref + '"><formula1>' + escXml(v.lista) + '</formula1></dataValidation>';
        }
        return '<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorStyle="warning"' + msg + ' sqref="' + v.ref + '"><formula1>' + (v.min != null ? v.min : 0) + '</formula1><formula2>' + (v.max != null ? v.max : 1e12) + '</formula2></dataValidation>';
      }).join('') + '</dataValidations>');
    }
    out.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    out.push('<pageSetup paperSize="9" orientation="' + (sh.retrato ? 'portrait' : 'landscape') + '" fitToWidth="1" fitToHeight="0"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  function painel(sh) {
    var r = sh.freeze || 0, c = sh.freezeCols || 0;
    if (!r && !c) return '';
    var ativo = r && c ? 'bottomRight' : r ? 'bottomLeft' : 'topRight';
    return '<pane' + (c ? ' xSplit="' + c + '"' : '') + (r ? ' ySplit="' + r + '"' : '') + ' topLeftCell="' + colLetra(c) + (r + 1) + '" activePane="' + ativo + '" state="frozen"/>';
  }

  function nomeAba(n, usados) {
    var s = String(n || 'Planilha').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31);
    var base = s, i = 2;
    while (usados[s]) { s = base.slice(0, 28) + ' ' + i++; }
    usados[s] = 1;
    return s;
  }

  function build(wb) {
    var usados = {};
    var sheets = wb.sheets.map(function (s) { return Object.assign({}, s, { name: nomeAba(s.name, usados) }); });
    var files = [];
    files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>' });
    files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>' });
    var iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({ name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + escXml(wb.title || 'Relatório') + '</dc:title><dc:creator>' + escXml(wb.author || 'Nexus Contabilidade') + '</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created></cp:coreProperties>' });
    files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheets.map(function (s, i) { return '<sheet name="' + escXml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' });
    files.push({ name: 'xl/styles.xml', data: stylesXml() });
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
    return zip(files);
  }

  // ---------------- leitura (.xlsx e .csv) ----------------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function abrirZip(buf) {
    var b = new Uint8Array(buf);
    if (b.length < 22 || u32(b, 0) !== 0x04034b50) throw new Error('O arquivo não é uma planilha .xlsx válida.');
    var i = b.length - 22;
    while (i >= 0 && u32(b, i) !== 0x06054b50) i--;
    if (i < 0) throw new Error('Planilha .xlsx corrompida (diretório do arquivo não encontrado).');
    var n = u16(b, i + 10), off = u32(b, i + 16);
    var dec = new TextDecoder();
    var entradas = {};
    for (var k = 0; k < n && u32(b, off) === 0x02014b50; k++) {
      var tamN = u16(b, off + 28), extra = u16(b, off + 30), coment = u16(b, off + 32);
      var nome = dec.decode(b.subarray(off + 46, off + 46 + tamN)).replace(/\\/g, '/').replace(/^\//, '');
      entradas[nome.toLowerCase()] = { metodo: u16(b, off + 10), tamC: u32(b, off + 20), local: u32(b, off + 42) };
      off += 46 + tamN + extra + coment;
    }
    return { b: b, entradas: entradas };
  }

  function extrair(z, nome) {
    var e = z.entradas[String(nome).replace(/^\//, '').toLowerCase()];
    if (!e) return Promise.resolve(null);
    var b = z.b, o = e.local;
    var ini = o + 30 + u16(b, o + 26) + u16(b, o + 28);
    var dados = b.subarray(ini, ini + e.tamC);
    if (e.metodo === 0) return Promise.resolve(new TextDecoder().decode(dados));
    if (e.metodo !== 8) return Promise.reject(new Error('Compressão da planilha não suportada.'));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Este navegador não consegue abrir .xlsx compactado. Atualize o navegador ou salve a planilha como CSV (separado por ponto e vírgula).'));
    var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(fluxo).text();
  }

  function xmlDoc(t) {
    var d = new DOMParser().parseFromString(t, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('Conteúdo XML inválido na planilha.');
    return d;
  }
  function tags(no, nome) { return Array.prototype.slice.call(no.getElementsByTagNameNS('*', nome)); }
  function texto(no) { return tags(no, 't').filter(function (t) { return !t.parentNode || t.parentNode.localName !== 'rPh'; }).map(function (t) { return t.textContent; }).join(''); }
  function colIndice(ref) {
    var m = /^([A-Z]+)/i.exec(ref || '');
    if (!m) return -1;
    var s = m[1].toUpperCase(), n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }
  var REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /** Lê um .xlsx (ArrayBuffer) → Promise<{ abas: [{ nome, linhas }] }> */
  function ler(buf) {
    var z;
    try { z = abrirZip(buf); } catch (e) { return Promise.reject(e); }
    return Promise.all([extrair(z, 'xl/workbook.xml'), extrair(z, 'xl/_rels/workbook.xml.rels'), extrair(z, 'xl/sharedStrings.xml'), extrair(z, 'xl/styles.xml')]).then(function (r) {
      if (!r[0]) throw new Error('Planilha sem pasta de trabalho (xl/workbook.xml).');
      var wb = xmlDoc(r[0]);
      var alvos = {};
      if (r[1]) tags(xmlDoc(r[1]), 'Relationship').forEach(function (rel) { alvos[rel.getAttribute('Id')] = rel.getAttribute('Target'); });
      var compartilhadas = r[2] ? tags(xmlDoc(r[2]), 'si').map(texto) : [];
      // estilos com formato percentual (ids embutidos 9 e 10, ou formato personalizado com %)
      var pctXf = [];
      if (r[3]) {
        var st = xmlDoc(r[3]);
        var fmts = {};
        tags(st, 'numFmt').forEach(function (f) { fmts[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
        var cx = tags(st, 'cellXfs')[0];
        if (cx) pctXf = Array.prototype.filter.call(cx.childNodes, function (x) { return x.localName === 'xf'; }).map(function (x) {
          var id = x.getAttribute('numFmtId');
          return id === '9' || id === '10' || /%/.test((fmts[id] || '').replace(/"[^"]*"/g, ''));
        });
      }
      var folhas = tags(wb, 'sheet').map(function (sh) {
        var rid = sh.getAttributeNS(REL_NS, 'id') || sh.getAttribute('r:id');
        var alvo = alvos[rid] || '';
        alvo = alvo.charAt(0) === '/' ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
        return { nome: sh.getAttribute('name'), caminho: alvo };
      });
      return Promise.all(folhas.map(function (f) { return extrair(z, f.caminho); })).then(function (xs) {
        return {
          abas: folhas.map(function (f, i) {
            var linhas = [];
            if (!xs[i]) return { nome: f.nome, linhas: linhas };
            tags(xmlDoc(xs[i]), 'row').forEach(function (row, ri) {
              var rn = parseInt(row.getAttribute('r'), 10) || (ri + 1);
              var linha = [];
              var seq = 0;
              tags(row, 'c').forEach(function (c) {
                var ci = c.getAttribute('r') ? colIndice(c.getAttribute('r')) : seq;
                seq = ci + 1;
                var t = c.getAttribute('t');
                var vNo = tags(c, 'v')[0];
                var v = vNo ? vNo.textContent : null;
                var val;
                if (t === 's') val = v != null ? compartilhadas[+v] : null;
                else if (t === 'inlineStr') val = texto(c);
                else if (t === 'str') val = v;
                else if (t === 'b') val = v === '1';
                else if (t === 'e') val = null;
                else if (v != null && v !== '') {
                  val = parseFloat(v);
                  if (isNaN(val)) val = v;
                  else if (pctXf[+(c.getAttribute('s') || 0)]) val = Math.round(val * 100 * 1e10) / 1e10;
                } else val = null;
                linha[ci] = val;
              });
              linhas[rn - 1] = linha;
            });
            for (var k = 0; k < linhas.length; k++) if (!linhas[k]) linhas[k] = [];
            return { nome: f.nome, linhas: linhas };
          })
        };
      });
    });
  }

  /** Lê CSV (separador ; , ou tabulação, detectado na primeira linha) */
  function lerCsv(txt) {
    txt = String(txt || '').replace(/^\uFEFF/, '');
    var primeira = txt.split(/\r?\n/)[0] || '';
    var sep = [';', '\t', ','].sort(function (a, b) { return primeira.split(b).length - primeira.split(a).length; })[0];
    var linhas = [], linha = [], campo = '', aspas = false;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt[i];
      if (aspas) {
        if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') aspas = false;
        else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && txt[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return { abas: [{ nome: 'CSV', linhas: linhas.map(function (l) { return l.map(function (c) { return c === '' ? null : c; }); }) }] };
  }

  N.xlsx = { build: build, ler: ler, lerCsv: lerCsv, crc32: crc32, colLetra: colLetra, colIndice: colIndice, ESTILOS: Object.keys(ESTILOS) };
})(typeof window !== 'undefined' ? window : globalThis);
