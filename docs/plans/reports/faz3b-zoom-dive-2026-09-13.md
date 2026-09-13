# Faz 3b — Zoom-dalış (opt-in) raporu (2026-09-13)

Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`. Commit yok. `archify.zip`,
`docs/gallery`, `docs/cases`, `viewer/viewer-camera.js` DOKUNULMADI (paralel Faz3a orada
çalışıyordu). İş sonunda `npm run generate:viewer` tekrar koşuldu (kameranın son hali dahil).

## Sözleşme maddeleri 1-6 — hepsi TAMAM
1. **Belirginleştirme (her zaman açık).** Saf CSS: `.diagram-container[data-detail-level="full"]
   .archify-drilldown-mark` (büyür + kalın stroke) ve `#btn-drilldown-descend:not([hidden])`
   vurgusu; `data-detail-level` zaten `viewer-camera.js` `apply()`'ın yazdığı mevcut attribute
   (≥1.75 veya semantic), `html` üstünde yeni attribute yok, kamera dosyasına dokunulmadı.
2. **Toggle.** `Z` (paylaşılan global keydown'a tek satır) + `.diagram-nav`'da `#btn-drilldown-dive`
   (`data-view="dive"`), yalnız `svg.querySelector('[data-drilldown-child]')` doluyken görünür
   (entry manifest VEYA nested subtree — aynı baked attribute); embed'de `dive.js` hiç "capable"
   olmuyor. `localStorage['archify-dive']`, motion-governor'ın `archify-motion` deseniyle aynı
   try/catch, varsayılan off.
3. **Otomatik dalış.** `Archify.view.onChange`: dwell yalnız `transitioning:false`de başlar/
   yeniden-değerlendirilir; kamera-değişti iptali (epsilon 0.004 scale/0.5px) her çağrıda çalışır.
   Koşullar: toggle on, `mode==='manual'`, `scale≥2.5`, reduced-motion/mobil-kapsanmış değil,
   routeProbe/semanticLens/intentTrace/presentation pasif, `diveLock` yok, `drilldown.active()`
   false. Hedef: `logicalViewport()` merkezini `getBBox()` ile kapsayan `[data-drilldown-child]`.
   250ms dwell → `data-dive-preview` + `#archify-dive-status`; `descend()` false dönerse önizleme
   zaten temiz.
4. **Zoom ile çıkış.** `on('minZoomOut', cb)`; iki olay yalnız FARKLI `(source,gestureId)` çiftiyle
   sayılır (600ms pencere), yalnız nested+toggle-on'da `escapeToParent()`; kökte zaten no-op.
5. **Yeniden dalış kilidi.** `MutationObserver` `data-drilldown-open` true→yok geçişinde kilitler;
   farklı `(source,id)`li bir `gesture:'start'` VEYA `pointerdown`/`keydown` ile kalkar (Faz3a
   tur-2 API notu). Kamera scale'i ascend'de zaten değişmiyor (host overlay aç/kapa, kamera sabit).
6. Klavye/Passport/mark yolları değişmedi; `data-dive-preview` export-cleanup strip+assert
   listesine eklendi (2. savunma hattı); export'a yeni attribute EKLENMEDİ.

## Değişen/yeni dosyalar
`viewer/dive.js` (yeni, `Archify.dive` IIFE) + `scripts/generate-viewer.mjs` fragment listesi;
`viewer/template.source.html` (marker, `Z` dalı, `#btn-drilldown-dive`, `#archify-dive-status`,
CSS — `Archify.drilldown` IIFE'sinin kendisi değişmedi); `viewer/export-cleanup.js`;
`archify/renderers/shared/i18n.mjs` (`viewer.nav.dive*`, `viewer.dive.opening`); `viewer/README.md`
(yeni "Drilldown dive contract"); `archify/references/{drilldown-bundles,viewer-runtime}.md`;
`README*.md` (Z kısayolu, `/Z-dive` boşluksuz ek — kelime/satır bütçesi net 0); `CHANGELOG.md`.
`archify/test/generate-viewer.test.mjs` — yeni `dive` fragmanı diğer 13'le aynı desende eklendi
(eklenmeseydi kendi "literal tokens" testi artık DIVE marker'ı arayan gerçek script'le FAIL
veriyordu — bulunup düzeltildi). Yeni test: `archify/test/drilldown-dive-browser.test.mjs` (7 test).

## Yeni testler — gerçek Chrome, Faz 1 deep fixture
(a) toggle off + gerçek wheel scale≥2.5 → dalış yok. (b) `Z` + aynı jest → 250ms `data-dive-preview`
→ `data-drilldown-state="open"` (ACK). (c) dwell içinde gerçek pan → önizleme temizlenir. (d)
reduced-motion emülasyonu → dalış yok, belirginleştirme etkilenmez. (e) nested child'da (aynı
origin — toggle localStorage üzerinden motion-governor gibi paylaşılıyor) 2 farklı gerçek
wheel-out → ebeveyn `back()`; kilit yeniden dalışı engelliyor; gerçek `keydown` + yeniden yaklaşma
→ dalış tekrar olur. (f) gerçek tıklamayla Focus semantic reveal → dalış tetiklenmez. (g) sıradan
diyagramda toggle yok, `Z` no-op.

**Tur 2'de değişti:** aşağıdaki "Tur 2" bölümünde, fixture merkezdeki düğümle değiştirildi ve bu
kırılganlık ortadan kalktı (targeted set 5/5 flake'siz, aşağıda).

## Kabul seti
`check:viewer` exit=0, `check:validators` exit=0. `node test/golden.mjs`: 12 fail, bilinen-kötü
liste ile birebir (Faz3a ile aynı), log `faz3b-golden.log`. Tam koşu 2 partiye bölündü
(`--test-concurrency=2`), `generate:viewer` SONRASI:
- Parti 1 (69 dosya, `faz3b-tests-batch1.log`): **977/975/2 fail/0 skip** — 2 fail bilinen-kötü
  (`architecture-delta`, `gallery`). İlk koşuda `generate-viewer.test.mjs` + dive testinin 2
  alt-testi de flake/fail vermişti; düzeltme sonrası bu (2.) koşuda 273/273 ve 7/7 yeşil.
- Parti 2 (64 dosya, `faz3b-tests-batch2.log`): **621/615/1 fail/5 skip** — fail bilinen-kötü
  (`release-package-gates`, ZIP byte-for-byte). 5 skip ortam-gated (baseline ile aynı).
- **Toplam: 1598 test / 1590 pass / 3 fail (hepsi bilinen-kötü, yeni fail yok) / 5 skip.**

## Elle kanıt
Gerçek Chrome, deep fixture: `capable:true, on:null` → `Z` → `on` → `zoomAt(2.6)` manual mode →
`data-detail-level="full"` → `toggle()` kapatınca `dive:null` ama `detail-level` hâlâ `"full"`
(belirginleştirme toggle'dan tam bağımsız, doğrudan kanıtlandı). Dalış döngüsü/kilit/semantic-muafiyet
7 alt-testte gerçek CDP olaylarıyla ayrıca kanıtlanıyor.

## Tur 2 (astra `docs/plans/reviews/faz3b-astra-1-2026-09-13.md`, hüküm: DÜZELTMEYLE KABUL)

`viewer/viewer-camera.js` DOKUNULMADI. `Archify.drilldown` IIFE'ye yalnız P2-2'nin istediği tek
mesaj-tipi kancası eklendi. Sonunda `npm run generate:viewer` tekrar koşuldu.

**P1-1 Dwell güvenliği** — `viewer/dive.js`:
- (a) Zamanlayıcı dolunca yeniden doğrulama: `startDwell` (`:199-218`) timer callback'i
  `Archify.view.state()`'ten TAZE bir snapshot alıp `eligible(freshState)` VE
  `hitTestNode() === target` ikisini de kontrol etmeden `descend()` çağırmıyor.
- (b) Her `onChange` çağrısında (transitioning:true dahil) uygunluk kaybı anında iptal:
  `onCameraChange` (`:218-227`) `eligible(snapshot)` kaybını HER çağrıda (yalnız settle'da değil)
  kontrol edip `cancelDwell()` çağırıyor.
- (c) `container.addEventListener('pointerleave'/'pointercancel', ...)` + `window.addEventListener
  ('blur', ...)` (`:313-315`) dwell'i anında iptal ediyor.
- (d) `reducedQuery.addEventListener('change', cancelDwellIfIneligible)` (`:317-318`) ve
  `watchBlockingModes()` (`:296-304`, `data-present/-route-picking/-route-active/-lens-active`
  attribute'larını `subtree:true` ile izleyen `MutationObserver`) blocking-mod açılışını/reduced-
  motion değişimini anında yakalıyor. **Not:** `blockingActive()`'tan `Archify.intentTrace.active()`
  ÇIKARILDI (`:113-126`) — gerçek fare ile wheel-zoom sırasında düğümün ÜSTÜNDE durmak Intent
  Trace'in kendi 90ms hover-önizlemesini neredeyse HER ZAMAN aktif yapıyor; bunu "blocking" saymak
  özelliği gerçek fareyle erişilemez kılıyordu (yeni testlerle keşfedildi, kök neden kanıtlandı).

**P1-2 Kilit (belgeler arası jest)** — `viewer/dive.js`:
Zaman-tabanlı, belgeye-yerel sözleşme: `GESTURE_SILENCE_MS=400` (`:25`), `rearmed` (`:69`).
`onGesture` (`:263-270`) kilidi YALNIZ `phase==='start'` VE son jest hareketinden (start/move/end/
cancel hepsi sayılır) ≥400ms geçmişse kaldırıyor — devam eden wheel akışı 150ms'de bir 'move'/'end'
üretip saati sıfırladığından sessizlik şartını sağlamıyor. `pointerdown`/`keydown` (`:320-321`)
kilidi anında kaldırıyor. `watchOwnAscend` (`:271-295`) ascend anında `diveLock=true` VE
`rearmed=false` yapıp saati "şimdi"ye kilitliyor (aynı fiziksel jestin devamı ilk tikte başarısız
olsun diye); `rearmed`, kamera `onChange`'de scale<2.5 görülünce `true` olur (`:225`). `eligible()`
(`:169-186`) artık `!diveLock && rearmed` ikisini de şart koşuyor — eskiden çocuğun kendi
`lastEscapeGestureKey`'ini karşılaştıran, belgeler-arası anlamsız yöntem tamamen kaldırıldı.

**P1-3 Yaprakta çıkış** — `viewer/dive.js`:
`capable` (`:39`, kendi dalış hedefi) ile `escapeCapable` (`:40`, `data-bundle-nested==="true"`)
ayrıldı. İnert erken dönüş artık `!capable && !escapeCapable`'da (`:46-54`); `minZoomOut` aboneliği
`escapeCapable` iken kuruluyor (`:310`), `capable`'dan bağımsız. `render()` düğmeyi `!capable`'da
gizliyor (`:75-82`), toggle durumu (`enabled`/localStorage) her iki durumda da çalışıyor. Toggle
kapanınca `minZoomOutLog=[]` (`:101`) — 600ms geçmiş temizleniyor.

**P2-1 Export** — `viewer/template.source.html:4418-4426`: `svg [data-node-id]…` seçicisi
`.diagram-container [data-node-id]…`'a taşındı (yorum satırıyla neden açıklandı) — `export.js`'in
CSS toplama regex'i (`/(^|,)\s*(svg|:root|…)/`) artık bu kuralı YAKALAMIYOR, export stiline yeni
bayt eklenmiyor. Elle doğrulama: aynı regex'i tarayıcıda taklit eden bağımsız script,
`hostStyle`'ın `dive-preview`/`archify-dive-status` İÇERMEDİĞİNİ doğruladı (`export-browser`/
`export-cleanup-browser` testleri de 5x çalıştırıldı, 0 fail).

**P2-2 Tercih paylaşımı** — `viewer/dive.js` `sendPrefToChild()`/`receivePreference()` (`:83-105`,
`:330`) + `viewer/template.source.html`: `onParentMessage`'a `archify:dive-pref` kancası
(`:7114-7121`, session-gated, `Archify.dive.receivePreference`'a devrediyor) ve `activeChildSession`
getter'ı (`:7249`). Ebeveyn, ACK-open olduğunda (`watchOwnAscend`'in `data-drilldown-state`
izlemesi, `:290-292`) ve her toggle değişiminde (`setEnabled`, `:103`) çocuğa `{enabled,session}`
yolluyor — `file://` paketlerde localStorage paylaşılmadığı için TEK yol bu.

**P2-3 Erişilebilirlik/klavye** — `viewer/template.source.html`: `#archify-dive-status` artık HİÇ
`hidden` almıyor (`:5655`, DOM'da kalıcı `role=status aria-live=polite`), boşken `:empty` kuralı
(`:1436-1441`) görsel izini sıfırlıyor; `positionStatus()` (`dive.js:135-150`) düğümün konteyner-
göreli bbox'ına göre konumlandırıyor (artık sabit sol-üst köşe değil). `Z` dalı `e.repeat` VE
`SELECT`/`role=textbox` korumalı (`:7312-7315`).

**P2-4 Testler** — yeni merkezi fixture `archify/test/fixtures/bundle-dive/{entry,middle,leaf}.json`
(3 diyagram, viewBox 1200×900, her `drilldown` düğümü tam merkezde — `test/helpers/bundle-fixture.mjs`
`fixture:'dive'` parametresiyle). `archify/test/drilldown-dive-browser.test.mjs` baştan yazıldı
(10 test): önceden-kurulan `MutationObserver` (`Page.addScriptToEvaluateOnNewDocument`, DOMContentLoaded'a
ertelendi — "document start"ta `documentElement` henüz yok, kök neden bulunup düzeltildi) `data-dive-
preview` geçişlerini zaman damgalı kaydediyor (sonradan örnekleme yok); bağımsız hit-test
(`anchorStillInsideNode`) yalnız CDP `getBoundingClientRect()` kullanıyor, uygulamanın
`logicalViewport()`'unu kopyalamıyor. Yeni/değişen senaryolar: yaprakta çift zoom-out→ebeveyn
`back()` (capable=false, escapeCapable=true kanıtı); kilit+rearm+400ms sessizlik tam döngüsü;
`pointerleave` iptali (gerçek hover kurulup sonra dışarı taşınarak); reduced-motion hem-önce-hem-
ortada iki ayrı test; semantic ≥2.5 (`reveal(['hub'],{maxScale:2.75})` — küçük viewBox'ta doğal
sığdırma 2.15'i geçemediği için fixture viewBox'ı büyütüldü); sıradan diyagram Z-repeat/SELECT
korumasıyla. Kök neden bulunup düzeltilen 3 test-tuzağı: (1) dwell'in rampa sırasında ZATEN
tamamlanıp inmesi (büyük tek-tık aşımı yerine küçük ~13%'lik adımlar + eşiğe yakın hedef scale);
(2) CDP wheel'in gerçek hover kurmaması (pointerleave testine önce `mouseMoved` eklendi); (3) kilit
testinin TÜM geçmişi (ilk giriş dahil) kontrol etmesi (`window.__diveEvents=[]` reset noktası).

**Sayılar.** Hedefli (coordinator'ın istediği tam set), `generate:viewer` sonrası, 5 tekrar:
`check:viewer` exit=0 (her koşuda). `node --test drilldown-dive-browser.test.mjs drilldown-nested-
browser.test.mjs export-browser.test.mjs export-cleanup-browser.test.mjs generate-viewer.test.mjs`
→ **313/313/0 fail**, 5/5 koşu FLAKE'SİZ (log `faz3b-tests-tur2-targeted.log` özet, ham çıktı bu
oturumun `/tmp` betiklerinde, kalıcı log tutulmadı — istenirse tekrar üretilir).

Tam kabul seti (2 parti, `--test-concurrency=2`, `generate:viewer` SONRASI):
- Parti 1 (`faz3b-tests-tur2-batch1.log`): **980/966/14 fail/0 skip**.
- Parti 2 (`faz3b-tests-tur2-batch2.log`): **621/612/4 fail/5 skip**.
- **Toplam: 1601 test / 1578 pass / 18 fail / 5 skip.**
- `node test/golden.mjs` (`faz3b-golden-tur2.log`): 12 fail, bilinen-kötü liste ile birebir aynı.

**DÜZELTME (18 fail'in dökümü yanlıştı — Fable'ın bulduğu gerçek kök neden).** Önceki turda bu 15
fail'i "benimle ilgisiz, önceden var" diye işaretlemiştim; YANLIŞTI. Gerçek kök neden: **benim
kendi Faz3b/tur-2 değişikliğimdi.** `viewer/dive.js`'in `onGesture()`'ındaki kilit-sessizlik
hesabı `lastGestureActivityTime ? (Date.now()-lastGestureActivityTime) : Infinity` idi — bu
`Infinity` LİTERALİ `npm run generate:viewer` ile `archify/assets/template.html`'e (ve dolayısıyla
üretilen HER diyagram HTML'ine, runtime script inline gömülü olduğu için) harfiyen kopyalandı.
`archify/delta/architecture-delta.mjs:1179` `if (/\b(?:NaN|Infinity)\b/.test(html)) failures.push
('contains non-finite output')` üretilen HTML'in TAMAMINI (yalnız hesaplanan değerleri değil,
gömülü runtime script metnini de) tarıyor → her compare artifact'ı (bu regex'i taşıyan HTML'i
üreten HER şey) reddedildi. `archify/locate/cli.mjs`'nin locate-html.mjs'te benzer bir kontrolü var.
Kanıt: Faz3a sonunda tam set 1539/1531/3 temizdi (yalnız 3 bilinen-kötü); bu literal tur-2'de
eklendi, önceki turlarda YOKTU — "önceden vardı" iddiam, son temiz baseline ile karşılaştırmadan
yapılmış hatalı bir çıkarımdı.

**Düzeltme.** `viewer/dive.js:265` `: Infinity` → `: (GESTURE_SILENCE_MS + 1)` (davranış aynı:
"hiç jest görülmedi" durumu her zaman sessizlik eşiğini geçmiş sayılır, artık sonlu bir sabitle).
`viewer/` altında `\bNaN\b|\bInfinity\b` için tam grep — sıfır eşleşme (yorum satırları dahil,
ilk düzeltmemde AÇIKLAYICI YORUMUN KENDİSİ "Infinity" kelimesini içeriyordu, o da temizlendi —
şablona giren HER metin bu kurala tabi, yalnız kod değil). Koruma:
`archify/test/generate-viewer.test.mjs` yeni test "the generated template never ships a literal
NaN or Infinity token" — committed `archify/assets/template.html`'i `\b(?:NaN|Infinity)\b`'a karşı
tarıyor (274. test, geçiyor).

**Doğrulama.** `node --test test/architecture-delta.test.mjs test/locate-html.test.mjs
test/drilldown-dive-browser.test.mjs` → **38/39 pass, 1 fail** (yalnız orijinal bilinen-kötü
"checked-in Checkout compare artifact…", stale runtime pin — Faz2'den beri bilinen, benimle
ilgisiz), 2x tekrar aynı. Tam kabul seti yeniden (`generate:viewer` sonrası, 2 parti):
- Parti 1 (`faz3b-tests-tur2b-batch1.log`): **981/979/2 fail/0 skip** — ikisi de bilinen-kötü
  (`architecture-delta` checked-in artifact, `gallery`).
- Parti 2 (`faz3b-tests-tur2b-batch2.log`): **621/613/3 fail (raw tally)/5 skip** — 1 bilinen-kötü
  (`release-package-gates`, ZIP byte-for-byte, satır 167); kalan 2 raw-fail AYNI tek olayın
  ebeveyn+alt-test çifti: `viewer-wheel-browser.test.mjs` "zoomAt stays cursor-fixed after a
  resize" / "Camera wheel and pinch gestures…" (satır 3051/3126) — `viewer-camera.js`'e HİÇ
  dokunmadım, izole tekrar koşuda **26/26 temiz** → CPU-baskılı toplu koşuda tek flake, Faz3a'nın
  kendi raporundaki aynı testin aynı deseniyle uyumlu (BLOKLAYAN değil, kaynağa dair değil).
- **Toplam (raw tally): 1602 test / 1592 pass / 5 fail / 5 skip — kavramsal olarak 3 bilinen-kötü
  (architecture-delta, gallery, release-package-gates) + 1 doğrulanmış tek flake (izole 26/26
  temiz); Infinity regresyonu artık YOK. Faz3a'nın 1539/1531/3 temiz baseline'ına dönüş.**

**Ders.** "Önceden vardı" demeden önce SON TEMİZ baseline ile karşılaştır (burada: Faz3a'nın
1539/1531/3'ü) — ben bunu yapmadım, sayıca büyük bir fail kümesini (15) yüzeysel olarak "ilgisiz
dosyaların mtime'ı dünkü" gözlemine dayanarak pre-existing damgaladım, ama asıl kanıt zinciri
(regex kaynağı + hangi fragment'in hangi literal'i taşıdığı) bakılmadan yapılan bir varsayımdı.
Ayrıca: viewer kaynak dosyalarındaki HİÇBİR literal/yorum güvenli değildir — üretilen artifact'a
harfiyen kopyalanır ve archify'ın kendi doğrulayıcıları (non-finite output, byte-identity vb.)
tüm metni tarar, yalnızca çalışma zamanı davranışını değil.

## BLOKLAYAN (tur 2)
Yok — kendi P1/P2 kapsamım için sıfır; yukarıdaki regresyon da bu turda bulunup kapatıldı.
