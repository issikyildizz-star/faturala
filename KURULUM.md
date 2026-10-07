# Faturala — Kurulum (yaklaşık 15 dakika)

Site, irsaliye fotoğraflarını Claude'a okutur ve **Fatura Detay** şablonunuzu doldurup Excel olarak indirir.
Kurulum için bilgisayar bilgisi gerekmez; her şey tarayıcıdan yapılır.

## 1. Anthropic API anahtarı alın
1. https://console.anthropic.com adresine girip hesap açın.
2. **Billing** bölümünden kart ekleyin ve kredi yükleyin (5–10 $ ile başlamak yeterli).
3. **Limits** bölümünden aylık harcama limiti koyun (ör. 10 $). Harcama bu limiti geçmez.
4. **API Keys** → **Create Key**. Çıkan anahtarı (sk-ant-… ile başlar) kopyalayın.
   Bu anahtarı kimseyle paylaşmayın; sadece 3. adımda Vercel'e yapıştıracaksınız.

## 2. Dosyaları GitHub'a koyun
1. https://github.com adresinde ücretsiz hesap açın.
2. Sağ üstte **+** → **New repository**. Ad: `faturala`, **Private** seçin, **Create repository**.
3. Açılan sayfada **uploading an existing file** bağlantısına tıklayın.
4. Zip'ten çıkan klasörün **içindeki** her şeyi (index.html, sablon.xlsx, api, lib, vercel.json, package.json)
   sürükleyip bırakın, **Commit changes**.

## 3. Vercel'de yayınlayın (ücretsiz)
1. https://vercel.com → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → `faturala` deposunu **Import** edin.
3. **Framework Preset**: *Other* kalsın. **Environment Variables** bölümüne şunları ekleyin:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | 1. adımda kopyaladığınız anahtar |
   | `SITE_SIFRESI` | Siteye girerken kullanılacak şifre |

4. **Deploy**. Bir dakika sonra `https://faturala-xxxx.vercel.app` gibi bir adres verilir. Site hazır.

> Kendi alan adınızı (ör. faturala.firmaniz.com) Vercel'de **Settings → Domains** bölümünden bağlayabilirsiniz.

## Kullanım
1. Siteyi açın, **Site şifresi** kutusuna şifreyi yazın (tarayıcı hatırlar).
2. **Fiyata eklenecek tutar** (varsayılan 9,74 TL), **KDV** ve **İskonto** değerlerini kontrol edin.
3. Fotoğrafları sürükleyin ya da seçin. Telefonda doğrudan kamerayla da çekebilirsiniz.
4. Tabloyu kontrol edin. **Sarı satırlar** net okunamayanlardır; küçük resme tıklayıp fotoğrafla karşılaştırın.
   Tüm hücreler düzeltilebilir; satır silinebilir ya da elle eklenebilir.
5. **Excel'i indir** — dosya şablonunuzla birebir aynı yapıdadır (gizli listeler ve açılır menüler dahil).

## Okuma kuralları
- **Mal:** Satırın başında ürün kodu varsa sadece kod alınır (5 hane, 4 hane ya da 13317-1 gibi tireli).
  Kod yoksa ürün adının tamamı yazılır.
- **Fiyat:** Basılı "0 TL" değil, elle yazılan fiyat alınır. Karalanıp düzeltilmişse yenisi alınır ve satır sarı işaretlenir.
- **Birim fiyat** = okunan fiyat + "fiyata eklenecek tutar".

## Ayarlar / değişiklikler
- **Model:** Varsayılan `claude-sonnet-5-5`. Daha güçlü okuma için Vercel'de `CLAUDE_MODEL` = `claude-opus-5-5`
  değişkenini ekleyip yeniden deploy edin (maliyet yaklaşık iki katı).
- **Şablon değişirse:** Yeni dosyayı `sablon.xlsx` adıyla GitHub'a yükleyin (aynı sütun yapısında olmalı).
- **Şifreyi değiştirmek:** Vercel → Settings → Environment Variables → `SITE_SIFRESI` → kaydet → Deployments → Redeploy.

## Maliyet
- Vercel ve GitHub: ücretsiz.
- Claude: fotoğraf başına yaklaşık 0,007 $ (Sonnet). 50 fotoğraflık bir klasör ≈ 0,35 $.
  Harcamayı console.anthropic.com → **Usage** sayfasından takip edebilirsiniz.

## Gizlilik
Fotoğraflar sadece okunmak için Claude'a gönderilir; site fotoğrafları ya da Excel'i sunucuda saklamaz.
Tablo tarayıcıda tutulur; sayfayı yenilerseniz silinir, önce Excel'i indirin.
