// Vercel sunucu fonksiyonu: bir irsaliye fotoğrafını Claude'a okutur.
// Ortam değişkenleri (Vercel > Settings > Environment Variables):
//   ANTHROPIC_API_KEY  (zorunlu)  console.anthropic.com'dan alınan anahtar
//   SITE_SIFRESI       (önerilir) boş bırakılırsa site şifresiz çalışır
//   CLAUDE_MODEL       (isteğe bağlı) varsayılan: claude-sonnet-5-5

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

const TALIMAT = `Sen Türkçe e-irsaliye fotoğraflarını okuyan bir veri giriş asistanısın.
Fotoğraf yan, ters ya da eğik çekilmiş olabilir; gerekirse kafanda döndürerek oku.
Fotoğrafta bazen birden fazla kağıt görünür: SADECE en üstteki, tamamı görünen irsaliyeyi oku.

Her ürün/mal satırı için şunları çıkar:

1) MAL
 - Satır, başında bir ürün KODU olan bir "Mal" alanıysa (ör. "13522 780370|470-BORDO|243",
   "6509-2 KSSZC00000006|I30 BORDO|L", "5360 68614|PEMBE PUAN ÜST|XL"):
   SADECE baştaki kodu yaz. Kod genelde 5 hanelidir, bazen 4 hanelidir; "-1", "-2", "-3" gibi
   tire ekiyle bitiyorsa tireyi de al. Örnekler: "13522", "6509-2", "5360", "15296-1".
 - Kod yoksa (ör. "SUMMIT WESTERN PATCH LS T-SHIRT BEYAZ ÖN") ürün adının TAMAMINI,
   basılı haliyle, büyük harf ve Türkçe karakterleri koruyarak yaz. İki satıra taşan adı birleştir.
 - Ürün adının yanına/altına elle eklenmiş kelimeleri (ör. "GRİ", "Polyester") ürün adına katma;
   bunları "not" alanına yaz.

2) MİKTAR: Basılı miktar. Türkçe binlik ayırıcıyı dikkate al: "1.056 Adet" = 1056, "2.484" = 2484.
   Bir miktarın üstü karalanıp yanına yenisi yazılmışsa sonuncuyu al ve emin_degil=true yap.

3) BİRİM: Basılı birim (genelde "Adet").

4) BİRİM FİYAT: Basılı fiyat çoğu zaman "0 TL"dir; onu ALMA. Asıl fiyat mavi/siyah tükenmez kalemle
   ELLE yazılmış rakamdır. Genelde "Birim Fiyat" sütununa ya da miktarın hemen yanına yazılır
   (ör. basılı "171" yanında elle "60" → miktar 171, fiyat 60). "50 TL", "50 TC" gibi ekleri at.
   Ondalıklı olabilir (ör. "7,5" → 7.5). Bir fiyat karalanıp yanına/altına yenisi yazılmışsa
   yeni yazılanı al. Aynı fiyat birden çok satıra parantez/ok ile verilmişse her satıra uygula.
   Elle fiyat hiç yoksa null yaz.
   Okumadan emin değilsen (karalama, belirsiz rakam, 1/7, 2/7, 5/6, 8/9 karışıklığı) emin_degil=true
   yap ve "not" alanında kısaca neden olduğunu yaz.

Ayrıca belgeden şunları al:
 - irsaliye_no (ör. "FSN2026000002845", "EI02026000000378")
 - irsaliye_tarihi (GG.AA.YYYY)
 - evrak_no: kağıdın üzerine elle yazılmış, genelde daire içindeki sıra numarası; yoksa null.

Sonucu MUTLAKA irsaliye_kaydet aracıyla ver. Uydurma; göremediğin bilgiyi null bırak.`;

const ARAC = {
  name: 'irsaliye_kaydet',
  description: 'Okunan irsaliye bilgilerini kaydeder.',
  input_schema: {
    type: 'object',
    properties: {
      irsaliye_no: { type: ['string', 'null'] },
      irsaliye_tarihi: { type: ['string', 'null'], description: 'GG.AA.YYYY' },
      evrak_no: { type: ['integer', 'null'], description: 'Elle yazılmış daire içi sıra no' },
      okunabilir: { type: 'boolean', description: 'Fotoğraf bir irsaliye ve okunabiliyor mu' },
      satirlar: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mal: { type: 'string' },
            miktar: { type: ['number', 'null'] },
            birim: { type: ['string', 'null'] },
            birim_fiyat: { type: ['number', 'null'] },
            emin_degil: { type: 'boolean' },
            not: { type: ['string', 'null'] },
          },
          required: ['mal', 'miktar', 'birim_fiyat', 'emin_degil'],
        },
      },
    },
    required: ['satirlar', 'okunabilir'],
  },
};

function sabitZamanliEsit(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ hata: 'Sadece POST' });
  }

  const sifre = process.env.SITE_SIFRESI || '';
  if (sifre) {
    const gelen = req.headers['x-site-sifresi'] || '';
    if (!sabitZamanliEsit(String(gelen), sifre)) {
      return res.status(401).json({ hata: 'Şifre hatalı.' });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ hata: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { image, mediaType } = body;
  if (!image || typeof image !== 'string') return res.status(400).json({ hata: 'Fotoğraf yok.' });
  if (image.length > 6_000_000) return res.status(413).json({ hata: 'Fotoğraf çok büyük.' });
  const mt = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: TALIMAT,
        tools: [ARAC],
        tool_choice: { type: 'tool', name: 'irsaliye_kaydet' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mt, data: image } },
              { type: 'text', text: 'Bu irsaliyeyi oku ve irsaliye_kaydet aracıyla kaydet.' },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || 'Claude isteği başarısız.';
      const kod = r.status === 429 || r.status === 529 ? 503 : 502;
      return res.status(kod).json({ hata: msg, tekrarDene: kod === 503 });
    }
    const blok = (data.content || []).find((b) => b.type === 'tool_use');
    if (!blok) return res.status(502).json({ hata: 'Claude yapılandırılmış sonuç döndürmedi.' });

    return res.status(200).json({ sonuc: blok.input, kullanim: data.usage });
  } catch (e) {
    return res.status(500).json({ hata: 'Sunucu hatası: ' + (e && e.message ? e.message : e) });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '6mb' } } };
