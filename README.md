# İnterner

Stajyer yönetim sistemi — Electron masaüstü uygulaması. Veri katmanı PocketBase (gömülü SQLite) üzerinde çalışır.

## Mimari

```
Renderer (UI) → preload.js (window.api) → main.js (IPC) → PocketBase (REST + Realtime) → SQLite
```

- Tüm veri işlemleri `main.js` içindeki IPC handler'ları üzerinden PocketBase'e gider.
- Şifreler bcrypt ile hashlenir; düz metin şifre saklanmaz.
- Pencereler arası canlı güncelleme PocketBase realtime abonelikleriyle sağlanır.

## Kurulum

1. Bağımlılıkları kur:

```bash
npm install
```

2. PocketBase binary'sini indir (repoya dahil değildir):
   - https://github.com/pocketbase/pocketbase/releases adresinden `pocketbase_*_windows_amd64.zip` indir.
   - `pocketbase.exe` dosyasını proje kökündeki `pocketbase/` klasörüne çıkar.

3. Superuser oluştur ve `pocketbase/config.json` dosyasını yaz:

```powershell
.\pocketbase\pocketbase.exe --dir .\pocketbase\pb_data superuser upsert admin@interner.local <GUCLU_SIFRE>
```

`pocketbase/config.json` içeriği:

```json
{
  "url": "http://127.0.0.1:8090",
  "adminEmail": "admin@interner.local",
  "adminPassword": "<GUCLU_SIFRE>"
}
```

4. Koleksiyon şemalarını oluştur (PocketBase çalışırken):

```bash
npm run pb:serve   # ayrı bir terminalde
npm run pb:setup
```

5. (Opsiyonel) Eski `data/*.json` verilerini taşı:

```bash
npm run pb:migrate
```

## Çalıştırma

```bash
npm start
```

Uygulama, PocketBase çalışmıyorsa kendi child process'i olarak otomatik başlatır ve çıkışta kapatır.

### Veritabanı yönetim paneli

Admin paneli **sadece** şu adreste açılır (sonundaki `/_/` önemli):

```
http://127.0.0.1:8090/_/
```

`http://127.0.0.1:8090` (kök adres) API sunucusudur; tarayıcıda açınca `404 File not found` görmen normaldir, hata değildir.
Giriş bilgileri: `pocketbase/config.json` içindeki `adminEmail` ve `adminPassword`.

## Scriptler

| Script | Açıklama |
|---|---|
| `npm start` | Uygulamayı başlatır (PocketBase otomatik açılır) |
| `npm run pb:serve` | PocketBase sunucusunu elle başlatır |
| `npm run pb:setup` | Koleksiyon şemalarını oluşturur |
| `npm run pb:migrate` | Eski JSON verilerini veritabanına taşır (yedek alır) |
| `node scripts/verify-migration.js <yedek_klasoru>` | Taşıma sonrası veri doğrulaması yapar |
