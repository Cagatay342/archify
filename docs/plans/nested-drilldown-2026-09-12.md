# Archify iç içe drill-down: zoom tetikli, N-derinlik — inceleme + uygulama planı (2026-09-12)

Hedef: bir bileşene zoomladıkça "çatısı kalkıp" içindeki mimari açılsın; bu iç içe, sınırsız derinlikte
ve archify'ın doğal (upstream'e taşınabilir) bir yeteneği olsun. Base: `upstream/feature/identity-map`
(bakımcı tt-a1i'nin taslak PR #367'si, 17 commit, cc1b33a, 2026-09-12). Bu dosya fork dalı
`feat/nested-drilldown` üzerindedir.

## 1. Bulgular (2026-09-12 itibarıyla upstream durumu)

| İş | Yaklaşım | Durum | Bizim hedefe uzaklığı |
|---|---|---|---|
| PR #269 (Puuuuup) | Tek HTML içinde `subarchitecture` (1 seviye, ≤12 node, iç içe YASAK), Passport'tan giriş | Açık, review yok, 78 dosya | Tek seviye; zoom yok |
| Issue #280 / PR #281 (brick-banzhuan) | `href`/`drilldowns[]`/`parentHref` ile kardeş HTML'e **sayfa değişimi** | Açık, review yok | Yerinde açılmıyor, geometri kaybolur |
| PR #367 (bakımcı, `feature/identity-map`) | **Bundle**: dizin + `manifest.json` (id + sha256), **descend-in-place** (iframe, breadcrumb, silhouette, handshake), Passport "Descend" veya node üstündeki mark ile | Draft, bugün güncellendi | En yakın: eksik olan sadece (A) derinlik>2 ve (B) zoom tetiği |

Bakımcının kendi sınırları (`archify/references/drilldown-bundles.md` "Not supported" + karar kaydı
`docs/decisions/identity-map-2026-09-09.md` §7): **"No third level"** (`max_depth: const 2`, check 9
çocuklarda mark yasak), ≤12 çocuk, ≤12 node/diyagram, otomatik çocuk üretimi yok, tek dosya gömme yok.
Bakımcı #280/#281'i kapatmadı ("not closed or approved by this PR").

Viewer'da zoom zaten anlamsal katman: `viewer/viewer-camera.js` `detailLevel()` → `map` (<100%),
`read` (≥100%), `full` (≥175%); scale 1–3 arasına kilitli; `Archify.view.state()` var, değişim
olayı (onChange) yok. Drill-down modülü `viewer/template.source.html` `Archify.drilldown`
(≈6281–6760): `descend()` `nestedChild()` ise `false` döner (derinlik kilidi burada), manifest yalnız
entry HTML'e gömülü (`<script id="archify-bundle-manifest">`), çocuk iframe `postMessage('*')` +
id/sha256 handshake, 1200 ms timeout → stale kartı; Esc/Backspace merdiveni; silhouette 96 px.
Bundle doğrulayıcı `archify/bundle/diagram-bundle.mjs`: manifest üretimi `level: entry?0:1`,
`max_depth: 2` (318), check 2 (424), check 7 `bundle/drilldown-nested` (511), check 9 child-mark (526).

Ortam: Node 22.23.2 (canonical ZIP için gereken major). Dalın kendi self-map'i bu hostta
`bundle --check` ile **`bundle/ownership-stale`** veriyor (sidecar sha'sı manifest'ten farklı;
dalın taslak durumu, ortam sorunu değil) — Faz 0'da kayda geçer, düzeltilmez.

Sonuç: sıfırdan tasarım gereksiz. #367'nin üstüne iki genişletme yeterli:
**(A) N-derinlik** ve **(B) zoom tetikleyici**. Kalanı (manifest, handshake, stale, export
izolasyonu, Esc merdiveni) aynen kullanılır.

## 2. Tasarım kararları

### A. N-derinlik (recursive bundle)
- `components[].drilldown: <id>` alanı değişmez (id, yol değil; bileşen başına tek çocuk).
- `bundle.schema.json`: `max_depth` `const 2` → `integer, minimum 2, maximum 8` (varsayılan 2:
  üretici gerçek derinliği yazar); `diagrams[].level` üst sınırı `max_depth-1`; `diagrams`
  `maxItems 13` → kaldır (her düğüm ≤12 çocuk kuralı check ile).
- Manifest üretimi: entry = drilldown hedefi olmayan tek kök; `level` = ağaçtaki derinlik;
  `drilldowns[].parent` artık herhangi bir diyagram olabilir. Check 7: DAG değil **ağaç**
  (her çocuk tek ebeveyn, döngü yok, kökten erişilemeyen diyagram = `bundle/orphan`). Check 9
  "çocuklarda mark yasak" → "**yaprak**larda mark yasak" (`bundle/leaf-mark`). Yeni kod
  `bundle/depth-exceeded`. Eski 2-seviye bundle'lar için üretilen manifest **byte-aynı** kalır
  (regresyon testi).
- Manifest dağıtımı: `file://` altında çocuk kardeş JSON okuyamaz. Entry gömülü manifest normatif
  kalır; ebeveyn `archify:bundle-hello` mesajına çocuğun **alt-ağaç manifestini** ekler
  (`subtree: {diagrams, drilldowns}` yalnız o çocuğun altı). Çocuk bunu bellekte tutar, kendi
  `descend()`'i için kullanır. Diske ikinci kopya yazılmaz.

### B. Viewer: özyinelemeli descend
- `descend()`'deki `nestedChild()` kilidi kalkar; koşul "alt-ağaç manifesti alınmış ve derinlik <
  max_depth". Her seviye aynı `Archify.drilldown` kodunu koşar (iframe içinde iframe).
- Breadcrumb tek yerde, kökte: çocuk `archify:bundle-crumb {chain:[…]}` yollar, kök tam zinciri
  çizer (`Kök › A › B · C`); her rung tıklanınca o seviyeye çıkılır (`ascendTo(level)`).
  Silhouette yalnız bir üst ebeveyn.
- Esc/Backspace: en içteki tüketir, merdiveni bitince üstüne iletir (mevcut forward mantığı
  seviye sayısından bağımsız hale getirilir).
- Handshake güvenliği aynen: `event.source === frame.contentWindow`, id/sha256 regex, timeout.
  Ebeveyn yalnız **doğrudan** çocuğuyla konuşur; torun mesajları çocuk üzerinden zincirlenir.
- Level ≥1 kısıtları (Presentation kapalı, Still) korunur. Export: her seviye kendi SVG'sini
  export eder (değişiklik yok).

### C. Zoom tetikleyici ("dive")
- `viewer-camera.js`: `detailLevel()`'a `dive` eşiği (scale ≥ 2.5) ve `onChange(cb)` aboneliği
  (`apply()` sonrası). Mevcut `map/read/full` sınırları değişmez.
- `Archify.drilldown`: kamera `dive`'a girince viewport merkezini kapsayan **ve** drilldown'ı olan
  düğüm varsa 250 ms dwell (kamera bu sürede değişirse iptal) → `descend(id)`. Ascend: level ≥1'de
  scale minimumda iken ikinci wheel-out/pinch-out → `back()`. Tıklama, Passport "Descend", mark
  ve klavye yolları **değişmez**; zoom sadece üçüncü tetik.
- Kapalı olduğu durumlar: `prefers-reduced-motion`, mobil kontrollü kaydırma modu, Route Probe /
  Lens / Intent Trace aktifken, çocuk handshake'i beklerken. Viewer'da toggle (`Z`), varsayılan AÇIK
  yalnız bundle entry'de; sıradan diyagramda hiç kayıt yapılmaz.
- Export, print, SVG byte'ları, schema/IR **değişmez** — tamamen viewer-only.

## 3. Fazlar (her faz sonunda DUR → Codex astra + Fable review; faz devir notu)

| Faz | İş | Dokunulan dosyalar | Kabul kriteri |
|---|---|---|---|
| 0 | Base sabitleme | `cd archify && npm test` baseline; self-map `--check` durumu kayıt | 1.489 test / 52 skip ile aynı sonuç; ownership-stale kayıtlı |
| 1 | N-derinlik bundle | `archify/schemas/bundle.schema.json`, `archify/bundle/diagram-bundle.mjs`, `archify/references/drilldown-bundles.md`, `archify/test/bundle-*.test.mjs`, yeni 3-seviye fixture (`test/fixtures/bundle-checkout/` + 1 torun) | 2-seviye fixture manifest byte-aynı; 3-seviye `--check` tüm checkler geçer; depth>max, orphan, leaf-mark negatif testleri |
| 2 | Özyinelemeli descend | `viewer/template.source.html` (`Archify.drilldown`), `generate-viewer` çıktısı `archify/assets/template.html`, `archify/test/drilldown-{viewer,browser,keyboard,stale}.test.mjs` | Mevcut 6 Chrome testi aynen geçer; 3. seviyeye in/çık, crumb zinciri, Esc zinciri, torun stale kartı |
| 3 | Zoom tetikleyici | `viewer/viewer-camera.js`, `Archify.drilldown`, i18n metinleri, toggle; camera unit + Chrome testleri | Zoom ile in/çık çalışır; dwell iptali; reduced-motion'da kapalı; export byte-aynı; sıradan diyagramda sıfır listener |
| 4 | AIWorkspace pilotu | AIWorkspace `docs/diagrams/` → bundle dizini; L0'da `engine/litellm/mcpo/data/ui` bileşenlerine `drilldown`; `archify bundle docs/diagrams`; README | Tarayıcıda L0 → L1 → (1 adet elle yazılmış L2) zoom ile; `visual-check` PASS |
| 5 | Upstream (opsiyonel) | #280'e "N-depth + zoom" yorumu; Faz 1+2 ve Faz 3 ayrı draft PR | CONTRIBUTING: şema değişikliği önce issue/karar |

Faz 4 tuzağı: L0 spec'i 14 bileşen, bundle `node-cap` 12. Öneri: cap'i KORU (ürün disiplini),
L0'ı 12'ye sadeleştir (ör. `providers`→`litellm` çocuğuna, `obs`→`ui` çocuğuna taşı). Cap'i
warning'e çevirmek fork'a özgü sapma olur; upstream'e gitmez.

L2+ (dosya/fonksiyon) içerikleri bu planda **elle** yazılır. Graphify'dan otomatik archify spec
üretimi upstream non-goal ("No automatic generation of children") → AIWorkspace tarafında ayrı
script (`scripts/graphify-to-archify.py` gibi), archify'a girmez. Ayrı tur.

## 4. Riskler ve açık sorular (astra'ya sorulacaklar)
1. Base bir **draft**; bakımcı push'ladıkça rebase maliyeti. Alternatif: main'e karşı bağımsız
   implementasyon → #367 ile çakışır, daha kötü. Karar: identity-map üstüne.
2. "No third level" bakımcının **tasarım kararı**; upstream kabul belirsiz. Fork'ta yaşayabilir;
   PR'lar küçük ve additive tutulur ki reddedilse bile rebase kolay olsun.
3. iframe zinciri: her seviye tam viewer (~300 KB HTML) → 5-6 seviyede bellek/açılış; pratik üst
   sınır `max_depth ≤ 8`, öneri belge: "3–4 seviye tipik".
4. Zoom tetik yanlış pozitifi (pan sırasında istemsiz dalış): dwell + merkez + toggle. Eşik 2.5
   sabit mi, kullanıcı ayarı mı? Öneri: sabit.
5. `file://` opaque origin nedeniyle `postMessage('*')` zorunlu; torun→kök mesajları çocuk üzerinden
   zincirlenmeli, kök hiçbir zaman torunla doğrudan konuşmaz.
6. 12-node cap vs L0 14 (Faz 4).

## 5. Faz 0 komutları
```bash
cd ~/repos/archify && git status && git log --oneline -1          # feat/nested-drilldown @ cc1b33a
cd archify && npm ci && npm test 2>&1 | tail -20                  # baseline
node bin/archify.mjs bundle ../docs/cases/archify-self --check --json | head -c 400
```

## 6. Ek: kod haritasından gelen kısıtlar (keşif ajanı, main + identity-map karşılaştırması)
- Viewer üretim hattı: `viewer/*.js` + `viewer/template.source.html` → `scripts/generate-viewer.mjs` →
  `archify/assets/template.html` (tek paylaşılan runtime, 5 renderer). `npm test` ön koşulu
  `check:viewer` (template bayatsa FAIL) ve `check:validators` (şema değişince
  `npm run generate:validators`). Her viewer değişikliğinde ikisi de koşulur.
- Kamera: `zoom()` scale'i 1–3'e kilitler (`Math.min(3, …)`), çeyrek adımlarla; `dive ≥2.5` bu
  aralığın içinde kalır, klamp değişmez. `apply()` tek huni → `onChange` buraya asılır.
- Deep link: dalda `#drill=` yok. Faz 2'de `#drill=<comp>/<comp>/…` eklenirse `focus.js` ve
  `guided-views.js` hash parser'ları tanımadıkları anahtarı **temizliyor** → her ikisine öğretilmeli
  (main: `focus.js:1392`, `guided-views.js:1598`). Öneri: Faz 2'de deep link YOK (kapsam dışı), Faz 5
  adayı.
- Export: `export.js` tek canvas SVG'yi CSS seçiciyle alır; drilldown state `html` attribute'unda
  olduğu için SVG export'u etkilenmez (PR #367 iddiası doğru). Yeni `data-*` SVG üstüne konursa
  `viewer/export-cleanup.js` strip listesi + assert listesi (satır ~103 / ~190) birlikte güncellenir.
- `check-render-output.mjs` `single_svg` tek `<svg>` ister → çocuklar iframe'de kaldığı sürece sorun
  yok; tek-dosya gömme yapılmaz (bakımcı non-goal'ıyla da uyumlu).
- Node kimliği `id="node-<id>"` belge-global; iframe izolasyonu sayesinde çakışma yok (tek dosyaya
  gömmeme kararının ikinci gerekçesi).
- Testler: node:test + gerçek Chrome (CDP, `test/helpers/desktop-browser.mjs`); `*-browser.test.mjs`
  için `ARCHIFY_CHROME` gerekir — Faz 0'da Chrome yolunu doğrula.

## 7. Codex astra görüşü (tur 1, 2026-09-12) — hüküm: DÜZELTMEYLE UYGUN
Tam metin: `docs/plans/reviews/nested-drilldown-astra-1-2026-09-12.md`. İşlenen düzeltmeler:

**Doğrulanmış yanlışlar (plan düzeltildi):**
- Derinlik kilidi 4 yerde: `descend()`, Passport "Descend" izni (`template.source.html:6546`), mark
  tıklaması (`:6781`), listener kurulumu (`:6803-6806`). Faz 2 hepsini kapsar.
- **Viewer'da wheel/pinch zoom YOK** (doğrulandı: `viewer-camera.js` ve `viewer/*.js`'de `wheel`
  sıfır eşleşme); zoom yalnız `+`/`-`/klavye/butondur. "Zoomladıkça dalış" için önce **wheel +
  pinch zoom jesti** eklenmeli → Faz 3'e ön koşul olarak **Faz 3a: kamera jestleri** eklendi
  (imleç-merkezli wheel zoom, iki parmak pinch, mevcut 1–3 klamp ve çeyrek adım korunur).
- `detailLevel()` semantic modda scale'den bağımsız `full` döner; `<1 → map` manuel akışta
  erişilmez. Dive eşiği yalnız manuel (`mode !== 'semantic'`) zoom'da değerlendirilir.
- Viewer HTML ≈ 806 KB (≈300 KB değil); manifest byte-aynılığı yalnız aynı template/renderer
  girdisiyle geçerli (bundle her HTML'i yeniden render eder, `artifact_sha256` değişir) → Faz 1
  kabul kriteri "aynı template ile byte-aynı" olarak daraltıldı.

**Eksikler (fazlara eklendi):**
- Faz 1: `generate:validators` zorunlu; JSON Schema dinamik `maximum: max_depth-1` ifade edemez →
  şemada sabit tavan (`level ≤ 7`), gerçek derinlik tutarlılığı graph check'inde; `node_count>12`
  şemada da reddedilir; ağaç şartı (aynı çocuğu iki bileşen hedefleyemez) mevcut kabul edilen
  bundle'ları daraltır → CHANGELOG'da açıkça belirt; `locate --bundle` ve ownership altküme
  kontrolü 2 seviye varsayıyor (`locate/cli.mjs:344`, `diagram-bundle.mjs:559`) → her doğrudan
  ebeveyn–çocuk kenarına genelleştir (Faz 1 kapsamına alındı).
- Faz 2 (P0): iki yönlü mesaj protokolü — `nestedChild()` dalı yalnız `window.parent`'ı kabul
  ediyor (`:6747-6767`), ara viewer torunun ACK/Esc'ini reddeder → "üst ebeveynden gelen" ve
  "doğrudan çocuktan gelen" iki alıcı yolu; mesajlara gezinme oturum kimliği (eski ACK/timeout/
  crumb/`reveal()` iptali); `level1` 170 ms sonra yazılıyor, hazır sinyali DEĞİL → readiness =
  yalnız ACK; subtree sözleşmesi `{diagrams, drilldowns, selfId, depth, max_depth}` ve
  `drillFor()` `(parent, component, child)` üçlüsüyle eşleşir; manifest sonradan gelen çocukta
  mark/iframe listener'ları tek seferlik (idempotent) aktivasyonla kurulur (`:6801`); Esc bir seferde
  tek geçici durum/seviye kapatır, dönüşte odak ilgili parent node'a; CSS'te `level="1"`
  sabitleri (`:4400`, `:4408`, `:4457`) yerel "çocuğum açık" durumu ile mutlak derinlik ayrılır.
- Faz 2/3: her viewer değişikliğinde `generate:viewer`; export cleanup'a SVG üstüne yeni attribute
  konursa strip+assert; kalıcı drilldown mark'ı korunur.
- Testler: Chrome testleri `ARCHIFY_CHROME` yoksa skip → Faz 0'da Chrome'u sabitle; zorunlu
  senaryolar: 3 seviye in/çık, kardeş geçişi, torun stale, breadcrumb odaklı Esc, export.
- Kaynak: derinlik 8 toplam boyutu sınırlamaz → bundle'a toplam bayt bütçesi (öneri 16 MB) ve
  belgeye "3–4 seviye tipik"; "sınırsız" sözü belgeden çıkarıldı, "No third level" değişikliği
  CHANGELOG/karar notunda açıkça.

**İtiraz — otomatik dalış (dive ≥2.5 + dwell):** astra "okumak için zoom gezinme niyeti değildir"
diyor; önerisi: zoom yalnız hedef düğümdeki "İçini aç" kontrolünü belirginleştirsin, tıklama/Enter
dalsın; otomatik dalış istenirse açık tercih + görünür önizleme + yeni jest. **Karar (kullanıcıya
sunulur):** Kullanıcının asıl isteği zoom'la dalış olduğundan otomatik dalış KALIR ama (a) varsayılan
KAPALI, viewer toggle'ı ile açılır (tercih localStorage'da), (b) dalıştan önce düğüm üstünde 250 ms
görünür "açılıyor" önizlemesi (iptal edilebilir), (c) ascend sonrası yeni kullanıcı jestine kadar
yeniden dalış kilidi (P1 riski), (d) astra'nın "zoom kontrolü belirginleştirir" davranışı
toggle'dan bağımsız her zaman açık. Risk sırası astra ile aynı: P0 protokol/yaşam döngüsü, P0
üretim/doğrulama, P1 istemsiz yeniden dalış, P2 kaynak/upstream.

## 8. Güncellenmiş faz listesi
0 Base + Chrome/Node sabitleme → 1 N-derinlik bundle + locate/ownership genelleme + validators →
2 Özyinelemeli viewer (protokol/oturum/readiness/Esc/CSS) → 3a wheel+pinch kamera jestleri →
3b zoom-dalış (opt-in) → 4 AIWorkspace pilotu → 5 upstream. Her faz sonu DUR: astra + Fable review.

## 9. Faz 3a referansı: kullanıcının d3 haritası (DEV bağımlılık haritası)
Kullanıcının kendi sayfası `d3.zoom().scaleExtent([0.08, 2.4])` ile wheel/pinch zoom + sürükleyerek pan +
"Sığdır" düğmesi kullanıyor; zoom `viewport` `<g>` transform'una uygulanıyor, kartlar tıklanınca yan
panel açılıyor. Archify viewer'ında bağımlılık YASAK (sıfır-bağımlılık sözleşmesi, CHANGELOG'da
tekrarlanan sınır) → d3 eklenmez, aynı semantik **elle** yazılır (~80-120 satır, `viewer-camera.js`):
- wheel: `deltaY` → çarpan (`Math.exp(-deltaY * 0.002)`), imleç noktası sabit kalacak şekilde
  `state.x/y` düzeltmesi; `ctrlKey` wheel = trackpad pinch (tarayıcı sözleşmesi); iki parmak
  touch pinch = pointer event çifti mesafe oranı.
- Klamp 1–3 aynen; wheel sürekli (çeyrek adım yok), `+`/`-` düğmeleri çeyrek adımda kalır.
- Her değişiklik mevcut `apply()` hunisinden geçer → `onChange` + Reading Depth otomatik çalışır;
  Semantic Camera aktifken kullanıcı wheel'i mevcut "manuel pan/zoom kamerayı bırakır" kuralına uyar.
- "Sığdır" = mevcut `0` kısayolu/reset (zaten var).
- `passive: false` wheel listener yalnız `.diagram-container` üstünde; sayfa kaydırması dışarıda korunur.

## 10. Kullanıcı kararı (2026-09-12) ve yürütme modeli
- Zoom-dalış: **otomatik, opt-in** (viewer toggle, varsayılan kapalı; 250 ms görünür önizleme;
  ascend sonrası yeni jeste kadar yeniden dalış kilidi; zoom her durumda "İçini aç" kontrolünü
  belirginleştirir). Kullanıcı onayladı.
- Yürütme: implementasyon **Claude Sonnet alt-ajanı** (faz başına ayrı görev, yazılı brief);
  Fable organize eder, her faz çıktısını review eder, astra ikinci görüşünü alır. Faz raporları
  `docs/plans/reports/fazN-*.md`. Commit yok (kullanıcı istemedikçe); faz sonunda önerilir.
