# 🔥 GırgırŞamata

Make It Meme tarzı gerçek zamanlı çok oyunculu meme yarışması.

## Kurulum

```bash
npm install
node server.js
```

Ardından `http://localhost:3000` adresini aç.

## Nasıl Oynanır

1. **Oda Kur** — İsmini gir, "Oda Kur"a bas.
2. **Arkadaşlarını davet et** — Oda kodunu paylaş.
3. **Oyna** — Her tur bir meme görseli gelir. 60 saniyede altyazını yaz.
4. **Oyla** — 30 saniyede en komik altyazıya oy ver (kendi altyazına oy veremezsin).
5. **Kazan** — En çok oy toplayan oyuncu skor kazanır!

## Özellikler

- Gerçek zamanlı (Socket.io)
- 2–8 oyuncu
- TR/EN dil desteği
- Özel oda kodları
- Otomatik host devri (host ayrılırsa)
- Skor tablosu

## Deploy (Railway/Render/Fly.io)

```bash
# Herhangi bir Node.js platformuna deploy et
# PORT environment variable'ı otomatik okunur
node server.js
```
