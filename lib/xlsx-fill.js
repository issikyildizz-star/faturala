/*
 * Şablon Excel'i (sablon.xlsx) dış kütüphane olmadan doldurur.
 * Zip okuma: tarayıcının DecompressionStream('deflate-raw') özelliği.
 * Zip yazma: sıkıştırmasız (STORE) — Excel sorunsuz açar.
 * Sadece FATURA_DETAY sayfasının (xl/worksheets/sheet1.xml) satırları değişir;
 * gizli listeler, açılır menüler (veri doğrulama) ve tanımlı adlar olduğu gibi kalır.
 */
(function (g) {
  'use strict';

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // ---------- Zip okuma ----------
  async function readZip(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Şablon dosyası geçerli bir Excel (zip) değil.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entries = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Zip dizini bozuk.');
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = u8.subarray(start, start + compSize);
      let data;
      if (method === 0) data = raw.slice();
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error('Desteklenmeyen sıkıştırma: ' + method);
      entries.push({ name, data });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  // ---------- Zip yazma (STORE) ----------
  function writeZip(entries) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    // DOS tarih/saat: 2026-01-01 00:00
    const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    for (const e of entries) {
      const nameBytes = enc.encode(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 adlar
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameBytes, e.data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, nameBytes.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameBytes);
      offset += 30 + nameBytes.length + size;
    }
    const cdSize = central.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // ---------- Sayfa XML'i ----------
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML'de geçersiz kontrol karakterlerini at
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function strCell(ref, val, style) {
    const s = style != null ? ` s="${style}"` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
  }
  function numCell(ref, val, style) {
    const s = style != null ? ` s="${style}"` : '';
    if (val === null || val === undefined || val === '' || !isFinite(Number(val))) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${Number(val)}</v></c>`;
  }

  const MIN_LAST_ROW = 350; // şablondaki açılır menülerin bittiği satır

  function buildSheetXml(origXml, rows) {
    const start = origXml.indexOf('<sheetData>');
    const end = origXml.indexOf('</sheetData>');
    if (start < 0 || end < 0) throw new Error('Şablonda FATURA_DETAY satırları bulunamadı.');
    const inner = origXml.slice(start + 11, end);
    const m = inner.match(/<row r="1"[\s\S]*?<\/row>/);
    const header = m ? m[0] : '';
    const sp = ' spans="1:7" x14ac:dyDescent="0.25"';
    let out = header;
    rows.forEach((r, i) => {
      const n = i + 2;
      out += `<row r="${n}"${sp}>` +
        strCell('A' + n, r.mal, 4) +
        strCell('B' + n, r.birimAdi) +
        numCell('C' + n, r.birimRef) +
        numCell('D' + n, r.miktar, 5) +
        numCell('E' + n, r.fiyat, 6) +
        numCell('F' + n, r.iskonto ?? 0) +
        strCell('G' + n, String(r.kdv ?? '20'), 3) +
        '</row>';
    });
    const last = Math.max(MIN_LAST_ROW, rows.length + 1);
    for (let n = rows.length + 2; n <= last; n++) {
      out += `<row r="${n}" spans="7:7" x14ac:dyDescent="0.25"><c r="G${n}" s="3"/></row>`;
    }
    let xml = origXml.slice(0, start + 11) + out + origXml.slice(end);
    xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:G${last}"/>`);
    // açık hücre seçimini başa al
    xml = xml.replace(/<selection [^>]*\/>/, '<selection activeCell="A2" sqref="A2"/>');
    if (last > MIN_LAST_ROW) {
      xml = xml.replace(/sqref="([BCG])2:\1350"/g, (_, c) => `sqref="${c}2:${c}${last}"`);
    }
    return xml;
  }

  async function fillTemplate(templateBuffer, rows) {
    const entries = await readZip(templateBuffer);
    const sheet = entries.find((e) => e.name === 'xl/worksheets/sheet1.xml');
    if (!sheet) throw new Error('Şablonda FATURA_DETAY sayfası yok.');
    const xml = new TextDecoder().decode(sheet.data);
    sheet.data = new TextEncoder().encode(buildSheetXml(xml, rows));
    return writeZip(entries);
  }

  g.XlsxFill = { fillTemplate, readZip, buildSheetXml };
})(typeof window !== 'undefined' ? window : globalThis);
