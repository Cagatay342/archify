# Faz 3a — Kamera jestleri (wheel + pinch) raporu (2026-09-13)

Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`. Commit yok. `archify.zip`,
`docs/gallery`, `docs/cases`, Faz2'nin `Archify.drilldown` IIFE'sine dokunulmadı.

**DURUM: BİTTİ, kabul seti temiz.**

## Tasarım maddeleri — hepsi TAMAM
1. **`zoomAt(nextScale, clientX, clientY, {snap})`.** `viewer/viewer-camera.js`: verilen ekran
   noktasını sabit tutarak ölçekliyor; `zoom(next)` artık `zoomAt` + kutunun kendi merkezine
   sarma (davranış aynı, çeyrek adım). Nokta matematiği `container`'ın border/padding'inden
   (ve şimdi `scrollLeft`/`scrollTop`'undan, bkz. Tur 2 P2-1) türetilen statik köşe kullanıyor —
   **düzeltilmiş kök neden** (ilk taslakta yanlış yazılmıştı, astra iki kez işaret etti): ilk
   deneme `svg.offsetLeft`/`offsetTop` kullanmıştı, ama kök `<svg>` elemanı `HTMLElement` değil
   (`offsetLeft` orada tanımsız) → `undefined` aritmetiğe girip `state.x/y` `NaN` oluyordu; bu,
   "`getBoundingClientRect()` transition sırasında bayatlıyor" ile İLGİSİZDİ. Şimdiki `svgOrigin()`
   yalnız transform'suz `container`'ın kendi ölçümünü kullanıyor, transition'ın ANLIK/ara görsel
   durumuna hiç bakmıyor.
2. **Wheel.** `container.addEventListener('wheel', onWheel, {passive:false})`; mobil-kapsanmış
   modda no-op; `factor = exp(-deltaY*0.0015)` (`ctrlKey` → `0.01`, `deltaMode` 1/2 çarpanları
   kodda var); no-op ise `preventDefault` çağrılmıyor + `minZoomOut` olayı yayınlanıyor.
3. **Pinch.** İki `pointerType==='touch'` işaretçisi → sabit `midpoint`/`startDist`/`startScale`;
   `pointermove` mesafe oranıyla `zoomAt`; tek parmak kalkınca biter; ikinci parmak aktif olunca
   sürükleme iptali + `interruptCamera()`. CSS: `.diagram-container { touch-action: pan-x pan-y; }`,
   mobil-kapsanmış modda `auto`'ya geri dönüyor (`template.source.html`, `npm run generate:viewer`
   koşuldu).
4. **`onChange`/`offChange`/`on`/`off`.** `apply()` sonunda `{scale,x,y,mode,detail}` ile abonelere
   haber veriliyor; `minZoomOut` `on('minZoomOut', cb)` ile dinleniyor (Faz 3b tüketecek).
   `data-view-scale` artık kesirli olabiliyor; tek okuyucu (`viewer-chrome-layout.js`) zaten
   `Number()` kullanıyordu, değişiklik gerekmedi.
5. **Docs.** `viewer/README.md` Camera contract genişletildi (zoomAt/wheel/pinch/onChange/snap
   farkı); `archify/references/viewer-runtime.md` Exploration'a bir madde; `README.md`/
   `README_EN.md`/`README_ZH.md` kısayol tablosu "Zoom or reset" satırına `/wheel/pinch` eklendi;
   `CHANGELOG.md` Unreleased/Added.

## Yeni test
`archify/test/viewer-wheel-browser.test.mjs` (bu turdaki ilk hâli 7 alt-test; Tur 2/3'te büyüdü,
**güncel gerçek sayı 25 alt-test + 1 üst-test = 26/26 PASS**, bkz. Tur 2/3 bölümleri — bu turun
kendi "7" sayımı yanlıştı, astra iki kez işaret etti): wheel-up nokta-sabit + scale artışı, scale=1'de
wheel-down sayfa kaydırması, ctrl+wheel, iki parmak pinch (midpoint sabit + `data-view-scale`/transform
görsel doğrulama), 400px+wide-diagram'da wheel no-op, `+` çeyrek adım sabit kalıyor, `onChange`/`offChange`.

## Yol boyunca bulunan ve düzeltilen 2 regresyon (bloklayıcı değildi, kapandı)
- **README kelime/satır bütçesi.** `test/readme-showcase.test.mjs` satır (≤295, ZH zaten sınırdaydı)
  ve kelime (≤2085, EN/TR zaten sınırdaydı) tavanlarına yeni bir satır sığmıyordu. Düzeltme: ayrı
  satır yerine mevcut "Zoom or reset" satırına boşluksuz `/wheel/pinch` eklendi (net kelime/satır
  artışı 0), üç dilde de.
- **Kendi testimin flake'i.** İlk tam-set koşusunda (concurrency=2, CPU baskısı) wheel-up testi
  ±1px toleransını aştı: `settle()` yalnız "6 ardışık eşit frame"e bakıyordu, yoğun yükte bu şart
  0.18s'lik CSS transition bitmeden de sağlanabiliyordu. Düzeltme: `settle()`'a 260ms gerçek-zaman
  tabanı eklendi.

## Kabul seti — final temiz koşu
`check:viewer` exit=0, `check:validators` exit=0. `node test/golden.mjs`: **12 fail**, hepsi
bilinen-kötü liste ile birebir (`examples/*.html` ×10 + `web-app.html` style/script ×2).
`node --test` (araç 10 dk sınırı nedeniyle 2 sıralı partiye bölündü, `--test-concurrency=2` aynen):
- Parti 1 (68 dosya): 937 test / 935 pass / **2 fail** / 0 skip — ikisi de bilinen-kötü
  (`architecture-delta`: checked-in Checkout compare artifact; `gallery`: proof gallery).
- Parti 2 (64 dosya): 602 test / 596 pass / **1 fail** / 5 skip — bilinen-kötü
  (`release-package-gates`: archive byte-for-byte).
- Toplam: 1539 test / 1531 pass / **3 fail** (hepsi bilinen-kötü) / 5 skip.
Loglar: `docs/plans/reports/faz3a-tests-batch1.log`, `-batch2.log`, `-golden.log`.

Ara-koşuda bir kez `route-probe-browser.test.mjs`de "Route observation timed out" flake'i
görüldü (CPU-baskı, `route-probe.js`'e dokunmadım); final koşuda TEKRARLANMADI (9/9 PASS dahil).

## BLOKLAYAN
Yok.

## Değişen/eklenen dosyalar
`viewer/viewer-camera.js`, `viewer/template.source.html` (yalnız CSS `touch-action`),
`archify/assets/template.html` (generate:viewer çıktısı), `viewer/README.md`,
`archify/references/viewer-runtime.md`, `README.md`, `README_EN.md`, `README_ZH.md`,
`CHANGELOG.md`, `archify/test/viewer-wheel-browser.test.mjs` (yeni).

## Tur 2 (astra `docs/plans/reviews/faz3a-astra-1-2026-09-13.md`, hüküm: DÜZELTMEYLE KABUL)

Faz 2 ajanının `template.source.html`'deki `Archify.drilldown` IIFE düzeltmesine dokunulmadı;
o dosyada yalnız CSS (zaten mevcut 2 `touch-action` satırı, değişmedi). İş bitince
`npm run generate:viewer` bir kez daha koşuldu (her iki kaynağın son hali `template.html`'e girdi).

**P1-1 Mobil koruma (`viewer/viewer-camera.js`).** `beginPinch()` (573) ve `updatePinch()` (597)
artık `onWheel`'deki AYNI kontrolü (`window.innerWidth <= 720 && container.hasAttribute('data-wide-diagram')`)
en başta uyguluyor → pinch tamamen no-op (`pinch` hiç kurulmuyor). Test: "pinch does nothing on a
narrow, mobile-contained wide diagram" (400px+wide, PASS).

**P1-2 Pointer sahipliği.** `beginPinch()` (585) artık capture'ı BIRAKMIYOR, tersine iki id'yi de
`setPointerCapture` ile TUTUYOR; `endTouchPointer(event, reason)` (614) hem kaydı temizliyor hem
capture'ı bırakıyor; `pointerup`→`'end'`, `pointercancel`→`'cancel'`, yeni `lostpointercapture`
(689)→`'cancel'` — üçü de aynı fonksiyona akıyor (idempotent: `lostpointercapture` doğal olarak
`pointerup`'ı izlediğinde ikinci çağrı no-op). Pan-start `pointerdown` (659) artık
`event.pointerType==='touch' && touchIds().length>=1` iken drag başlatmıyor → ikinci/üçüncü parmak
asla drag tetiklemiyor; `drag` artık kendi `pointerId`'siyle etiketli (662), `pointermove`/`onPointerEnd`
(556, 667) yalnız o id'yi dinliyor. Testler (hepsi PASS): "a third touch during an active pinch does
not start a drag", "lifting one pinch finger ends the gesture and the remaining finger does not
resume panning", "a cancelled pinch cleans up so a fresh pinch still works afterward" (CDP kısıtı:
`touchCancel` yalnız TÜM aktif dokunuşları birden iptal edebiliyor, tek parmak seçemiyor — testte
belgelendi).

**P1-3 Faz 3b olay sözleşmesi.**
(a) `updatePinch()` (597) artık `zoomAt`'ın döndürdüğü `next`i `previous`la karşılaştırıp
    minimumda pinch-in denemesinde `minZoomOut` yayınlıyor (`source:'pinch', gestureId`). Test:
    "pinching inward at the 1x floor emits minZoomOut with source pinch" PASS.
(b) Yeni `tickWheelGesture()` (624): 150ms içindeki ardışık wheel tikleri aynı `id`yi paylaşıyor
    (`start`/`move`), 150ms sessizlikte `end`; `onWheel` (638) bunu her çağrıda çağırıp
    `minZoomOut` payload'ına `gestureId` ekliyor. Pinch: `beginPinch`/`updatePinch`/`endTouchPointer`
    doğal `start`/`move`/`end`/`cancel` yayınlıyor, hepsi `on('gesture', cb)` üzerinden
    (`eventListeners.gesture` yeni). Testler: "wheel gesture id groups rapid ticks and starts a new
    id after a pause", "pinch gesture emits start, move and end with a stable id" — ikisi de PASS.
(c) `emitChangeSnapshot`/`clearTransitionSettle`/`notifyChange` (143, 152, 162) her `apply()`'da
    ÖNCE `transitioning:true` (hedef state), sonra `svg`'nin `transitionend`'i (yalnız `transform`)
    ya da 200ms fallback ile `transitioning:false` yayınlıyor; yalnız EN SON `apply()`'ın izleyicisi
    kuruluyor (önceki iptal edilir) — animasyon/rapid-tık burstlarında dinleyici sızıntısı yok. Test:
    "onChange reports transitioning:true immediately and transitioning:false once settled" PASS.

**P2-1 svgOrigin + rapor düzeltmesi.** `svgOrigin()` (305) artık `container.scrollLeft`/`scrollTop`'u
çıkarıyor (RTL'nin negatif `scrollLeft`'i aritmetik olarak kendiliğinden doğru çalışıyor, ayrı dal
gerekmedi) — düzeltilmeden önce dar+wide-diagram modda container içeride kaydırılmışken `zoomAt`/`zoom`
(dolayısıyla `+`/`-` düğmeleri) imleci yanlış noktaya kilitliyordu. Test: "svgOrigin accounts for the
container's own internal scroll" PASS (test kendi içinde `scroll-behavior:auto` override'ı gerektirdi
— bu container'da CSS `scroll-behavior:smooth` senkron `scrollLeft` atamasını bile Chrome'da
animasyonlu yapıyor, üretim kodunu değil yalnız testi etkiliyor). **Rapor düzeltmesi:** önceki turda
"getBoundingClientRect() bayatlayıp NaN üretiyordu" cümlesi yanlıştı; gerçek kök neden, artık kaldırılan
eski `svg.offsetLeft` kullanımıydı (SVG kök elemanında `offsetLeft` tanımsız → `NaN`); mevcut `svgOrigin()`
zaten transition'dan bağımsız statik `container` ölçümü kullanıyor, "ara geçiş geometrisi" karışıklığı
riski yoktu.

**P2-2 Testler (hepsi yeni, hepsi PASS).** "deltaMode 1 (line) and 2 (page) scale deltaY by 16x/100x"
(sayısal `Math.exp` beklenen değerle ±0.001 karşılaştırma); ctrl-wheel testi artık sayısal (`Math.exp(50*0.01)`);
"two rapid wheel-up ticks fired before the CSS transition settles stay numerically finite and
point-fixed" (P2-1/zoomAt'ın ardışık-çağrı regresyonunun kalıcı testi); "export SVG bytes are
byte-identical whether or not the camera moved first" (ham `assert.equal`, normalize YOK); "manual
zoom still works under prefers-reduced-motion".

**Hedefli kabul (tam set gerekmedi).** `check:viewer` exit=0. Komut:
`node --test test/viewer-wheel-browser.test.mjs test/viewer-camera-browser.test.mjs test/semantic-camera.test.mjs test/semantic-zoom.test.mjs test/export*.test.mjs test/readme-showcase.test.mjs`
→ **59 test / 59 pass / 0 fail / 0 skip**. `viewer-wheel-browser.test.mjs` tek başına: 19 alt-test +
1 üst = **20/20 PASS** (önceki turun "7" sayımı yanlıştı — brief'in kendi uyarısı doğruydu). Log:
`docs/plans/reports/faz3a-tests-tur2.log`.

**BLOKLAYAN (tur 2).** Yok.

## Tur 3 (astra `docs/plans/reviews/faz3a-astra-2-2026-09-13.md`, hüküm: DÜZELTMEYLE KABUL — dar kapsam)

Faz 3b ajanı `template.source.html`/yeni dive modülü üzerinde çalışıyor; yalnız
`viewer/viewer-camera.js` + kendi testim + `viewer/README.md` dokunuldu. İş bitince
`npm run generate:viewer` bir kez daha koşuldu.

**P1-a `lostpointercapture` drag'i temizlemiyordu — KAPANDI.** `container.addEventListener(
'lostpointercapture', onPointerEnd)` eklendi (680) — `onPointerEnd` (556) zaten `pointerId`
eşleşmesini kontrol ediyor, capture kaybında `drag=null` + `is-panning` kaldırılıyor +
(zaten kaybolmuş) capture'ı bırakma denemesi no-op. Testler: "losing pointer capture mid-drag
stops further panning" (capture kaybından sonra mouse hareketi pan YAPMIYOR + `is-panning` sınıfı
kalkıyor), "a pointerup fired outside the container still ends the drag" — ikisi de PASS.

**P1-b Yanlış `minZoomOut` — KAPANDI.** `beginPinch()` (573) artık `pinch.lastDist` tutuyor;
`updatePinch()` (598) olayı yalnız `closing = dist < pinch.lastDist - 0.5` (ANLIK mesafe bir
önceki örneğe göre azalıyor) VE `next === previous` VE `previous <= 1` iken yayınlıyor — eskiden
kontrol `pinch.startScale`'e göre kümülatif `desired` kullanıyordu, bu yüzden minimumda parmakları
yeniden açmak (`desired` hâlâ <1 iken) ve alakasız üçüncü parmağın hareketi (dist DEĞİŞMEDİĞİ hâlde
her `updatePinch()` çağrısı yeniden değerlendirdiği için) de olay üretiyordu. Yeni testler: "closing
at the floor" (≥1 olay — Chrome tek bir birleşik `touchMove`'u bazen iki ayrı pointermove'a
bölüyor, bu yüzden "tam 1" değil "en az 1" doğru sözleşme), "reopening a pinch after hitting the
floor does not emit additional minZoomOut events" (kapanıştan sonraki sayı SABİT kalıyor), "a third
touch moving during an active pinch does not emit minZoomOut" (sayı SABİT kalıyor) — üçü de PASS,
3 ardışık koşuda flake yok.

**P2 testler (yeni, hepsi PASS).** "zoomAt stays cursor-fixed under RTL (negative scrollLeft)"
(`dir=rtl` + `scrollLeft=-80`, container'ın kendi `scroll-behavior:smooth`'u yine test içinde
`auto`'ya zorlandı — Tur 2'deki aynı gerçek Chrome tuzağı); "zoomAt stays cursor-fixed after a
resize" (`Emulation.setDeviceMetricsOverride` + `resize` event sonrası `svgOrigin()` hâlâ doğru,
statik cache yok).

**Rapor düzeltmesi.** Bu dosyanın başındaki (madde 1) ve Tur 2'deki kök-neden cümlesi düzeltildi:
gerçek sebep `svg.offsetLeft`'in kök `<svg>` üstünde tanımsız olması (`HTMLElement`'e özgü bir
API, SVG kökünde yok) idi, "`getBoundingClientRect()` transition sırasında bayatlıyor" AÇIKLAMASI
İLGİSİZDİ — astra bunu iki kez işaretlemişti, artık her iki yerde de düzeltildi.

**Alt-test sayısı düzeltmesi.** `viewer-wheel-browser.test.mjs`: Tur 2 sonu 19 alt-test + üst test
(20) idi (Tur 2 raporundaki "19+üst=20" doğruydu, yalnız dosyanın en üstündeki ilk "7" sayımı
düzeltilmemiş kalmıştı — şimdi düzeltildi); bu turda 6 yeni alt-test eklendi (capture-loss,
outside-pointerup, RTL, resize, reopen-no-event, third-finger-no-event) →
**güncel: 25 alt-test + 1 üst-test = 26/26 PASS**.

**Hedefli kabul.** `check:viewer` exit=0. Komut:
`node --test test/viewer-wheel-browser.test.mjs test/viewer-camera-browser.test.mjs test/export*.test.mjs`
→ **50 test / 50 pass / 0 fail / 0 skip**. Log: `docs/plans/reports/faz3a-tests-tur3.log`.

**BLOKLAYAN (tur 3).** Yok.
