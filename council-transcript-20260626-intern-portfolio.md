# LLM Council Transcript — HR Stajyer Portfolyö Modülü

**Tarih:** 26 Haziran 2026  
**Proje:** İnterner (Electron + PocketBase)  
**Orijinal soru:** HR odaklı, AI destekli stajyer portfolyö modülünün nasıl inşa edileceği

---

## Çerçevelenmiş Soru

İnterner'da MVP tamamlandı: görev atama, mentor değerlendirme, InternScore v2, Stajyerlerim (5 sekme), `intern_portfolios` koleksiyonu, finans ROI girdileri.

**Karar:** Kritik modül olarak HR'ın doğrudan kullanacağı stajyer portfolyö / işe alım karar sistemi nasıl tasarlanmalı?

Kapsam:
- Portfolyö mimarisi ve inşa adımları
- Sunum modları (Executive / Detail / Finance)
- HR persona (Selin — İK uzmanı) ve Muhasebe persona (Adem)
- HR'ın bakacağı parametreler ve grafikler
- Görev sistemi / faz hiyerarşisi
- Stajyer adım adım yolculuk görselleştirmesi
- Başarı yüzdesi ve olasılıklar
- AI desteği (HR için, stajyer için değil)

**Stake:** Yanlış modül önceliği 4-8 hafta kaybettirir; yanlış "başarı olasılığı" hukuki/itibar riski taşır.

---

## Danışman Yanıtları

### The Contrarian
Önce yapılmaması gerekenler: sunum modları, journey animasyonları, çoklu persona ekranları — demo etkisi, karar verdirmez. HR ihtiyacı "güzel portföy" değil **işe alım savunması**. Success probability ürünleştirmeyin (küçük örneklem, yanlış güven). AI önce kanıt özeti + tutarsızlık uyarısı; yaratıcı hikâye değil. Muhasebe persona elle ROI ile kozmetik kalır. Önce: tek karar ekranı — kanıt tablosu, eksik veri bayrakları, tut/geliştir/ayır şablonu.

### The First Principles Thinker
Gerçek karar: "devam / uzat / işe al / sonlandır" — 15 dakikada. Minimum mimari: Hiring thesis, Evidence, Signal, Milestone, Decision record. 3 ekran: Decision Brief, Thesis vs Reality, Trajectory. "Portföy" yanlış çerçeve; ürün **Hire/No-Hire Decision Engine**, portföy kanıt katmanı.

### The Expansionist
Kategori: "işe alım öncesi yetenek kanıtı platformu". Sunum modları = 3 satış kanalı (YK ROI, mentor planı, aday sertifikası). Kohort + anonim sektör normları = network effect. Dönüşüm tahmini + accounting persona = CFO diliyle konuşan İK ürünü. Undervalued: mentor eval birikimi = sıfır maliyetli talent pool; staj programı P&L.

### The Outsider
"Portföy" belirsiz — CV mi, performans dosyası mı? Skor 78 ne demek, kim verdi? Grafiklerde zorluk derecesi yok. Finans ROI formülü şeffaf değilse süs. AI "işe al" derken kaynak? 30 sn: kim, süre, öneri, 1 güçlü + 1 zayıf kanıt. 15 dk: görev geçmişi, skor üretimi, kıyas, red akışı. Eksik: karar sonrası ne olur, stajyer görür mü?

### The Executor
Hafta 1: `portfolioSchema.js`, journey timeline, success probability (kural), persona toggle İK/Muhasebe, mevcut sekmeleri ayır. Hafta 2: görev fazları. Hafta 3: karşılaştırma, export. Hafta 4-5: `portfolioAI.js` IPC, özet + risk bayrakları. Hafta 6: one-pager. Yapma: yeni PB koleksiyonu, 5+ sunum modu, app.js full refactor. İlk adım: schema + timeline.

---

## Peer Review Özeti (Anonim → Açık)

| İnceleme | Güçlü yanıt | Kör nokta |
|----------|-------------|-----------|
| R1 | E (First Principles) — net karar çerçevesi | Teknik detay eksik |
| R2 | B (Contrarian) — risk listesi | Çözüm önerisi az |
| R3 | D (Outsider) — UX/etiket sorunları | Mimari derinliği yok |
| R4 | C (Executor) — haftalık plan | Vizyon dar |
| R5 | A (Expansionist) — pazar konumu | MVP scope creep riski |

**Hepsi kaçırdı:** KVKK / stajyer veri görünürlüğü politikası, mentor bias kalibrasyonu, minimum görev sayısı eşiği skor için.

---

## Chairman Verdict

### Where the Council Agrees
- Ürün merkezi **karar motoru** olmalı; portföy kanıt katmanı.
- Mevcut InternScore + 5 sekme tekrar paketlenmemeli; **Decision Brief** eksik.
- AI ilk fazda: özet + tutarsızlık + eksik veri uyarısı (generative hikâye değil).
- 3 görünüm yeterli: Executive (30 sn), Detail (15 dk), Finance (muhasebe).
- Hafta 1: veri şeması + journey timeline + persona toggle.

### Where the Council Clashes
- **Success probability:** Contrarian "yapma" vs Expansionist "büyük upside" → MVP'de "güven aralığı + düşük örneklem uyarısı" ile sınırlı etiket; tahmin değil.
- **Persona sayısı:** Executor 2 persona toggle vs Contrarian "çok persona erken" → tek ekranda İK/Muhasebe sekmesi, ayrı uygulama değil.

### Blind Spots Caught
- Outsider: skor şeffaflığı ve red sonrası akış.
- Contrarian: mentor skor yığılması (4-5).
- Peer: KVKK ve bias.

### The Recommendation
**Intern Portfolio v3 = Hire Decision Engine.** `intern_portfolios` şemasını genişlet: `hiringThesis`, `evidenceChain[]`, `milestones[]`, `decisionLog`, `aiCache`. Yeni ana görünüm: **Decision Brief** (öneri + 3 kanıt + 1 risk + InternScore bileşen tooltip). Mevcut sekmeler kalır; Özet sekmesi Brief'e dönüşür. AI: haftalık kanıt özeti + "mentor notu ile skor uyumsuz" bayrağı.

### The One Thing to Do First
`renderer/lib/portfolioSchema.js` oluştur; `hiringThesis` + `journeyPhases` alanlarını tanımla ve bir örnek stajyere migrate et — ardından `internScore.js`'e `buildJourneyTimeline()` ekle.
