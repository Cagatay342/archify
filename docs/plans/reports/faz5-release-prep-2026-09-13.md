# Faz 5 — release prep raporu (2026-09-13)
Uygulayıcı: Sonnet. Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`. Commit/push/PR/ağ YOK.

## A. "Faz 5 öncesi" boşlukları

**A1 — gerçek torun klavye kanıtı + file:// üç seviye — TAMAMLANDI.**
`archify/test/drilldown-nested-browser.test.mjs`. Önceki "harness sınırı" tespiti YANLIŞ:
`Page.bringToFront`+`Emulation.setFocusEmulationEnabled` tek başına yetmiyordu; eksik parça gerçek
`Input.dispatchMouseEvent` tıklamasıyla torun düğümüne odağı fiilen taşımaktı (3 seviye iframe rect
ofseti toplandı). Yan etki: gerçek tık focus/trace vurgusunu da tetikliyor, Escape önce onu
temizliyor → her seviyede 2 gerçek Escape gerekiyor (doğrulandı, teste gömüldü). Sentetik
`KeyboardEvent` dispatch'i KALDIRILDI, tamamen gerçek CDP. `archify/bin/visual-check.mjs`: geriye
uyumlu opsiyonel `extraArgs` eklendi. Yeni test: `file://` (`--allow-file-access-from-files`) 3
seviye descend. **16/16 PASS.**

**A2 — Z guard/kilit/tercih/export/a11y — TAMAMLANDI, astra tur-2 düzeltmeleriyle.**
`archify/test/drilldown-dive-browser.test.mjs`, 11→16 test: (1) gerçek repeat (CDP repeat
üretmiyor → sentetik `repeat:true`) + SELECT/`[role=textbox]` guard; (2) kilit testi "silence
alone"/"rearm alone" olarak bağımsız izole edildi (ilk yazım `drilldownOpenOrBusy()` kapısını
atlamıştı, düzeltildi; sonra "rearm alone" round-trip flake'i sayfa-içi sentetik `WheelEvent`'e
taşınarak kalıcı düzeltildi); (3) `dive-pref` kanalı bozuk storage'da bile postMessage'dan
ulaşıyor, yanlış session reddediliyor — **T1 düzeltmesi**: `localStorage.setItem/getItem` atamasıyla
arıza enjeksiyonu güvenilir değildi (astra); artık `Object.defineProperty(window,'localStorage',
{get(){throw...}})` çocuk yüklenmeden önce `Page.addScriptToEvaluateOnNewDocument`'le (yalnız
`window!==window.top` iken) kuruluyor VE erişimin gerçekten `SecurityError` fırlattığı assert
ediliyor, kök doküman etkilenmiyor; (4) dwell sırasında export byte-aynı — **T2 düzeltmesi**:
önizleme-aktif assert'i ve export capture artık AYRI CDP çağrıları değil, TEK `h.run()` script
turunda (arada dwell bitemez); (5) `#archify-dive-status` DOM metni doğrulandı (gerçek ekran
okuyucu testi YAPILMADI). **16/16 PASS** — standalone 3× ardışık koşu da dahil (bu turda hedefli
istekle), hepsi 16/16.

**A3 — wheel flake determinizasyonu — GERİ ALINDI, SONRAKİ İŞ.**
İlk yazımda `settle()` CSS-transform polling'den `Archify.view.onChange`'e bağlı
`transitioning:false`-bekleyen Promise'e çevrilmişti; rapor sonradan gözlenen 4-7 alt test FAIL'i
"önceden var, ürün kaynaklı (`clamp()`/pointer-capture)" diye yanlış sınıflamıştı. **Fable'ın 2×2
bisect'i bunu çürüttü**: güncel ürün + Faz5-öncesi test → 26/26; Faz5-öncesi ürün + Faz5 testi →
19/26; `viewer-camera.js` md5-aynı → regresyon test yeniden yazımıydı, ürün değil. Dosya Faz 3a
tur-3'ün (astra KABUL) haline geri alındı, standalone 26/26 ve bu turda 2 kez `--test-concurrency=2`
altında **274/274 (batch05)** doğrulandı. A3'ün "deterministik bekleme" hedefi sonraki iş; dosyaya
bu turda DOKUNULMADI.

**A4 — nested chrome CSS sıkıştırma — TAMAMLANDI.**
`viewer/template.source.html`, `html[data-bundle-nested="true"]` altına 4 salt-CSS kural: `.header
padding-right:0` (gizli toolbar için ayrılan ~472px geri kazanıldı, en büyük kazanım), `body
padding-inline:0.85rem` (shorthand DEĞİL — ilk deneme `padding-block`'u da ezip `data-nav-
stage-rail`'de dikey boşluğu BÜYÜTTÜ, bellek ölçümüyle yakalanıp düzeltildi), `.header-row
margin-bottom:0.25rem`, `.diagram-container padding:0.5rem`. Davranış değişmedi. Kanıt: 3 seviye
önce/sonra ekran görüntüsü + metrik (`faz5-evidence/`) — `headerPaddingRight` 472px→0, konteyner
genişliği 892→929px, dikey boşluk regrese etmedi. 16/16 PASS.

## B. Üretilmiş dosyalar — TAMAMLANDI (2 BLOKLAYAN istisnayla)
Sıra: `render:examples` (×2 — `../examples` VE varsayılan `archify/examples`, script sadece
ilkini kapsıyor) → `build:gallery` → `compare architecture` (checkout-delta,
`architecture-delta.test.mjs` komutuyla) → `archify-self` bundle (BLOKLAYAN) → `mco-runtime`
(BLOKLAYAN) → `build:readme-showcase` (`ffmpeg` yoktu, kuruldu) → `build-zip.sh` (Node 22.23.2,
`archify/examples/` güncellemesi sonrası 2. kez inşa).

`git status --short` **67 satır** (57 `M` + 10 `??`; `??` çoğu A'nın yeni test/fixture dosyaları
+ `docs/plans/` + `viewer/dive.js`, üretilmiş değil). be5fd7c'nin 31 dosyalık kümesiyle fark:
be5fd7c'de olup burada eksik = `mco-runtime.*`/`mco-showcase` (BLOKLAYAN). `archify-self`
be5fd7c'de yoktu, brief ayrıca istedi — denendi, BLOKLAYAN.

**BLOKLAYAN 1 — `archify-self` bundle.** `archify bundle docs/cases/archify-self` →
`repository-evidence/origin-mismatch`: diyagramlar `meta.repository=tt-a1i/archify` bekliyor, fork
`origin`'i `Cagatay342/archify` (upstream remote var ama kontrol yalnız `origin`'e bakıyor, `bundle`
`--repo-root` almıyor). Git remote değiştirmek (yasak) veya `meta.repository`'yi "düzeltmek"
(yanlış olur) kullanılmadı. Dokunulmadı, bayat kaldı.

**BLOKLAYAN 2 — `mco-runtime.*` + `mco-showcase`.** Aynı mekanizma: kanıt `mco-org/mco@9f1a1cf`'e
karşı doğrulanıyor, yerel checkout yok, ağ/clone yasak. Dokunulmadı, bayat.

1-2 ikisi de bu fork ortamına özgü (git remote/dış repo yokluğu). **Bakımcının kendi ortamında
(gerçek `mco` checkout'u, `origin=tt-a1i/archify`) yeniden üretilmesi GEREKİR — bu, bu turda
DOĞRULANMADI** (astra review: "sorunsuz üretilir" henüz kanıtlanmış sonuç değil, iddia edilmemeli).
`commit-plan.md` commit 6'dan açıkça hariç tutuldu, oraya sorumlu/kanıt gereksinimi not düşüldü.

Log: `faz5-npm-test-gates.log` + `faz5-npm-test2-gates.log` (check:viewer/brand-marks/validators/
release-identity+golden, ikisinde de 5/5).

## C. Upstream hazırlığı — TAMAMLANDI, astra tur-2 düzeltmeleriyle
`docs/plans/upstream/`: `pr1-recursive-bundles.md`, `pr2-opt-in-camera-and-dive.md`,
`issue-280-comment.md`, `commit-plan.md`. Astra'nın kapanış incelemesi (`docs/plans/reviews/
faz5-astra-1-2026-09-13.md`) sonrası düzeltildi: (1) PR1 — "önceden kabul edilen hiçbir paket
reddedilmez" iddiası daraltıldı (shared-child/orphan kuralları her derinlikte sıkılaştı, tek
referans manifest tüm eski girdileri kanıtlamaz); hata kodları düzeltildi (`bundle/max-depth` =
manifest derinlik uyuşmazlığı, `bundle/depth-exceeded` = 8 seviye sınırı, `CHANGELOG.md`'nin
gerçek metniyle çapraz doğrulandı, `bundle/drilldown-cycle` eklendi); "tests pass unchanged" →
değişen 9 mevcut test dosyası adıyla listelendi; PR şablonu alanları eklendi (etki sınıfı, gerçek
sonuçlar/istisnalar, görsel kanıt yolları, üretilmiş dosya istisnaları). (2) PR2 + #280 yorumu —
"opt-in wheel/pinch" YANLIŞ ifadesi düzeltildi (dinleyiciler koşulsuz ekleniyor, yalnız dive
opt-in); "davranış değişmez" iddiası kamera (yeni wheel listener'ın scroll'u ele alışı) ve
sürekli-açık mark belirginleştirmenin artık kolayca tetiklenmesi açıkça listelenerek daraltıldı.
(3) `commit-plan.md` — iki PR head'i için ortak dosyalarda (`template.source.html`,
`viewer-camera.js`, `i18n.mjs`, READMEler, `CHANGELOG.md`) hunk-split ZORUNLU hale getirildi, her
commit'in hangi hunk'ı (fonksiyon/CSS blok adıyla) aldığı yazıldı; kamera commit'ine template
yeniden üretimi eklendi (atlanmıştı); `visual-check.mjs extraArgs`, `generate-viewer.mjs`'nin dive
marker'ı, `generate-viewer.test.mjs` guard'ı plana eklendi; geri alınan `settle()` iddiası
SİLİNDİ; README/CHANGELOG satırları gerçek `git diff` okunarak ilgili commit'lere atandı (artık
"ilgisiz" değil). Sıra astra'nın önerdiği: bundle→recursive viewer+nested CSS→PR1 üretim→
kamera→dive→PR2 üretim, iki ayrı "chore" commit'i (4 ve 7). Hiçbiri açılmadı; İngilizce,
CONTRIBUTING/REVIEWING tonuna uygun.

## D. Tam npm test — 2. (temiz) tur, Fable müdahalesi sonrası
6 partide tüm `test/*.test.mjs` (133 dosya, 2 bilinen-kötü hariç, `--test-concurrency=2`,
run-tests.mjs'in gerçek çağrısı) + `release-package-gates.test.mjs` ayrıca. Loglar
`faz5-npm-test2-batch0{0..5}.log` + `-gates.log` + `-release-package-gates.log` +
`-route-{journey,probe}-isolated.log`. **Toplam: 1609 test, 1602 pass, 2 fail, 5 skip.**
batch00 205/205, batch02 556/556, batch05 274/274 (`viewer-wheel-browser.test.mjs` dahil) —
üçü de temiz. batch01 227/227 — **2 ayrı ardışık `--test-concurrency=2` koşusunda** (kendi A2
dosyam artık dahil, "rearm alone" flake'i kalıcı düzeltildi, aşağıda). batch03 200/203, 3 skip
(önceden var). batch04 140/144, **2 fail** = `route-journey.test.mjs` ("controlled clocks
preserve elapsed dwell, fresh steps, stale generations and pulse cleanup") +
`route-probe-browser.test.mjs` ("Route Probe preserves directed paths, Journey and export
contracts") — dokunmadığım dosyalar, izole koşuda ikisi de **PASS** (6/6, 9/9;
`faz5-npm-test2-route-{journey,probe}-isolated.log`) → ağır-yük flake'i, regresyon değil.
`release-package-gates.test.mjs` 21/23, 2 skip, 0 fail (zip tazelik PASS). Gates 5/5 PASS.

## BLOKLAYAN (özet, güncel)
1. `docs/cases/archify-self` — fork `origin` upstream'le eşleşmiyor, `bundle` `--repo-root`
   almıyor; bakımcı ortamında yeniden üretilir (`commit-plan.md`).
2. `docs/cases/mco-runtime.*` + `experiments/mco-showcase` — dış repo yerelde yok, ağ yasak;
   bakımcı ortamında yeniden üretilir (`commit-plan.md`).

Eski BLOKLAYAN 3 (`viewer-wheel-browser.test.mjs`) **KALDIRILDI** — Fable'ın 2×2 bisect'i bunun
A3'teki test yeniden yazımımdan kaynaklandığını kanıtladı, ürün değil; dosya geri alındı, A3
sonraki iş. Eski BLOKLAYAN 4 (`drilldown-dive-browser.test.mjs` "rearm alone") **KAPANDI**: gerçek
CDP `Input.dispatchMouseEvent`/`h.wheel()` round-trip'lerinin ardışık gecikmesi yerine, tüm
wheel-dispatch dizisi TEK bir `h.run()` script turunda sayfa-içi sentetik `WheelEvent` (`container.
dispatchEvent(new WheelEvent(...))`, `viewer-camera.js`'in gerçek `onWheel` dinleyicisinden geçiyor)
+ `requestAnimationFrame` ile kuruldu — 250/400ms pencereleri artık yalnız tarayıcı-içi rAF
zamanlamasına bağlı, Node↔Chrome CDP gecikmesine değil. Kanıt: 5× standalone PASS + 2× ardışık
`--test-concurrency=2` tam-parti PASS (227/227, 227/227).

**Sonuç (astra düzeltmesi — "fail 0" YANLIŞ, düzeltildi): bilinen-kötü 2 host dosyası hariç toplam
1609 test, 1602 pass, 2 fail, 5 skip; fail sayısı SIFIR DEĞİL.** İki fail (`route-journey`,
`route-probe-browser`) izole koşuda PASS + Fable'ın bağımsız teyidiyle (dosyalar/`route-*.js`
değişmedi, önceki tam koşularda hiç fail etmediler, yalnız bu turun eşzamanlı yükünde fail ettiler)
yük-duyarlı zamanlama testi olarak değerlendiriliyor — ama "dokunulmadı + izole PASS" TEK BAŞINA
regresyon olmadığının kesin kanıtı değildir (astra); kesin sonuç için bu iki dosya ayrı bir turda
kök nedenine kadar izlenmeli. gates 5/5, golden, zip-tazelik hepsi PASS.

## Fable müdahalesi (13.09 ~20:00) — A3 / eski BLOKLAYAN 3 düzeltmesi
`viewer-wheel-browser.test.mjs` tek başına 6-7/26 FAIL veriyordu; rapor bunu "önceden var, ürün kaynaklı (clamp/pointer-capture)" diye sınıflamıştı. 2×2 bisect (scratchpad): güncel ürün + Faz 5 ÖNCESİ test → **26/26**; Faz 5 öncesi ürün + Faz 5 testi → **19/26**; `viewer/viewer-camera.js` iki kopyada md5-aynı. Yani regresyon A3'teki test yeniden yazımıdır (`settle()` → onChange bekleme), ürün değil. Karar: test dosyası Faz 3a tur-3'te astra KABUL almış haline geri alındı (yedek: scratchpad `viewer-wheel-browser.faz5-rewrite.test.mjs.bak`); A3 "deterministik bekleme" hedefi **sonraki iş** (yük altı flake bilinen durum olarak kalır). BLOKLAYAN 3 KAPANDI (test hatasıydı). Ders (2. kez): "önceden vardı" demeden önce son temiz baseline ile 2×2 çapraz koşu.

## Fable teyidi (13.09 ~20:50) — kalan 2 fail
`route-journey.test.mjs` ve `route-probe-browser.test.mjs`: dosyalar ve `viewer/route-*.js` base'e göre değişmedi; Faz 1/2/3a/3b tam koşu loglarında hiç fail etmediler; bu turda yalnız eşzamanlı yük altında (astra codex + Chrome partileri aynı anda) fail ettiler. Fable tek tek koştu: 6/6 ve 9/9 PASS. Sınıflandırma: yük-duyarlı zamanlama testi, regresyon değil; "sonraki iş" listesinde (Faz 3a determinizm ile aynı kalem).
