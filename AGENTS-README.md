# Cursor Sanal Ekip Kurulumu

## Kurulum (her yeni projeye)

1. Bu reponun `.cursor/` klasörünü ve `.cursorrules` dosyasını projenin root'una kopyala
2. Cursor'u aç → Agents Window: `Cmd+Shift+P` → "Agents Window"
3. Kullanmak istediğin ajanı @ ile çağır

---

## Ajan Çağırma Yöntemleri

### Tek ajan:
```
@product-manager Bu proje bir e-ticaret sitesi. Kullanıcı kayıt ve login feature'ı için PRD yaz.
```

```
@ux-designer PRD.md dosyasını oku, login sayfası için user flow ve wireframe yaz.
```

```
@ui-designer WIREFRAMES.md dosyasını oku, login sayfası için design token ve component spec yaz.
```

### Paralel (Cursor 3.x /multitask):
```
/multitask
@product-manager: Sepete ekle feature için PRD yaz
@ux-designer: Sepete ekle user flow'unu çiz
@backend-engineer: /api/cart endpoint'lerini yaz
```

> ⚠️ Paralel çalıştırırken aynı dosyaya yazan iki ajan olmamasına dikkat et.

---

## Önerilen Çalışma Sırası

```
1. PM       → PRD + görevler
      ↓
2. UX       → User flows + wireframes  
      ↓
3. UI       → Design tokens + component spec
      ↓
4. Frontend + Backend  → (paralel çalışabilir)
      ↓
5. QA       → Testler
```

---

## Worktree ile İzole Çalışma (çakışma önleme)

```bash
# Her büyük feature için ayrı branch + worktree
git worktree add ../feature-auth feature/authentication
git worktree add ../feature-cart feature/cart

# Her worktree'de ayrı ajan çalıştır
# Bitince merge:
git merge feature/authentication
git worktree remove ../feature-auth
```

---

## Stack Notu

Ajan dosyaları stack-agnostic yazılmıştır. Her ajan projenin `package.json` veya `requirements.txt` dosyasını okuyarak hangi framework kullanıldığını anlayıp ona göre kod yazar.

Yeni bir projede başlarken şunu söylemen yeterli:

```
@product-manager Bu proje bir [Next.js / React Native / Django / vs.] projesi. [Ne yapacağını anlat.]
```

---

## Ajanlar

| Dosya | Rol |
|-------|-----|
| `product-manager.md` | PRD, user story, task yönetimi |
| `ux-designer.md` | User flow, wireframe, UX kararları |
| `ui-designer.md` | Design token, component spec, görsel kurallar |
| `frontend-engineer.md` | React/Vue/RN kodu, component implement |
| `backend-engineer.md` | API, DB, business logic |
| `qa-tester.md` | Unit/integration/e2e testler |
