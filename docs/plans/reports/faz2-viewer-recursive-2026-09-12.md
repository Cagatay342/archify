# Faz 2 — Viewer özyinelemeli descend raporu (2026-09-12)

Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`. Commit yok. `archify.zip`,
`docs/gallery`, `docs/cases`, `viewer/viewer-camera.js` dokunulmadı. Faz 1'in commitsiz
değişikliklerine (`archify/bundle/`, `archify/schemas/`, `archify/test/bundle-*.mjs`,
`archify/locate/`) dokunulmadı, yalnız kullanıldı.

## Tasarım maddeleri 1-10 — hepsi TAMAM
1. **Yerel/mutlak derinlik.** `level` (yerel 0/1) korunmuş; `myDepth` (mutlak) yeni. `data-drilldown-level="1"` geri-uyumlu tutuldu, `data-drilldown-open="true"` paralel yazılıyor, `data-drilldown-depth="N"` yalnız hello alan çocukta yazılıyor.
2. **Subtree dağıtımı.** `buildSubtree()` ebeveynin kendi manifestinden (tam veya kendi aldığı subtree) çocuğun alt-ağacını BFS ile çıkarıp `bundle-hello`'ya ekliyor; `readManifest()` önce gömülü script, yoksa alınan subtree; yaprakta boş `diagrams`/`drilldowns`.
3. **Gezinme oturumu.** Her `descend()` `sessionCounter`'ı artırıp `current.session`'a yazıyor; `bundle-ack`/`drilldown-escape`/`drilldown-crumb` bunu geri taşıyor; eşleşmeyen mesaj yok sayılıyor; `back()` kendi kapanış oturumunu yakalayıp `reveal()`'ı buna göre iptal ediyor.
4. **Readiness ACK-only.** `data-drilldown-state`: `descending`→(ACK)`open`→`ascending`→(yok); 170ms zamanlayıcı artık yalnız `descending` fazını temizliyor, `open` yazmıyor (reduced-motion dahil).
5. **İki mesaj alıcısı.** `onMessage` artık `nestedChild()`'a göre dallanmıyor, `event.source`'a göre `onParentMessage`/`onChildMessage`'a ayrılıyor; bir ara viewer aynı anda ikisini de alabiliyor; kök hiçbir zaman torunla doğrudan konuşmuyor.
6. **Kökte tek breadcrumb.** `publishChain()`/`renderChain()`: her viewer kendi rung'ını (`{id,title,componentLabel}`) altına eklediği `chainBelow` ile ebeveynine yollar; yalnız kök çizer (rung tıklaması → `ascendTo`); ara seviyede crumb/silhouette CSS ile gizli, `buildSilhouette` nested'da hiç çalışmıyor.
7. **Esc merdiveni.** `closeInnermost()` (odak kökte iken dahil, yalnız en içteki açık seviyeyi kapatır — tek seviyeyse `back()` ile aynı), `ascendTo(depth)` + `handleAscendRequest` (istek önce çocuğa iletilir, `drilldown-ascend-done`/200ms sonra kendi kapanışına karar verir — en içteki önce kapanır), `back()` sonrası `[data-node-id=componentId]`'e `{preventScroll:true}` ile odak dönüşü (yeni, `viewer/focus.js` vb.'deki mevcut desenle aynı).
8. **Kısıtlar korunur, bir madde gevşetildi.** `data-bundle-nested` artık `.diagram-nav`'ın tamamını değil yalnız route/radar/lens/finder/guide düğmelerini gizliyor; zoom +/-/0 ve `#btn-drilldown-descend` nested'da çalışıyor/görünür (`syncPassport`/`onMarkClick` artık `nestedChild()`'ı kilit olarak kullanmıyor, yalnız kendi `level`'ına bakıyor).
9. **Export değişmedi.** Yeni durum yalnız `html` üstünde (`data-drilldown-open/-depth`); SVG'ye attribute eklenmedi, `export-cleanup.js` dokunulmadı.
10. **Stale.** Ara viewer kendi stale kartını gösterir; `showStale` artık `publishChain()` çağırıyor, kök zinciri ara seviyeyi (bozuk toruna giden rung) gösteriyor.

## Değişen dosyalar
- `viewer/template.source.html` — `Archify.drilldown` IIFE yukarıdaki 10 madde için yeniden yazıldı; CSS (`data-drilldown-open`, `svg[data-bundle-role]` genelleştirmesi — eskiden yalnız `="entry"`, nested `.diagram-nav` kısmi gizleme, crumb/silhouette nested-gizleme); global keydown (`closeInnermost`, `escapeToParent`).
- `viewer/README.md` — yeni "Drilldown contract" bölümü (diğer modüllerle aynı üslupta).
- `archify/references/drilldown-bundles.md` — "Reader behavior" N-seviye/crumb-zinciri/genelleştirilmiş Esc için yeniden yazıldı; "Not supported"tan tek-seviye kısıtı kaldırıldı.
- `CHANGELOG.md` — Faz1'in "Viewer unchanged, still one level" cümlesi kaldırıldı, yeni "Recursive Viewer descend" maddesi eklendi.
- `archify/test/drilldown-browser.test.mjs` — `'level1'`→`'open'`; nested `.diagram-nav` artık tamamen gizli değil (yalnız finder/route/lens/guide + zoom hâlâ görünür) sözleşmesine güncellendi.
- `archify/test/drilldown-keyboard.test.mjs` — stub'a `closeInnermost`/`escapeToParent` eklendi (`calls.push` metinleri değişmedi, brief'in "isimleri gereksiz değiştirme" talimatına uyuldu).
- Yeni `archify/test/drilldown-nested-browser.test.mjs` — 6 test (aşağıda).

## Yeni testler (`drilldown-nested-browser.test.mjs`) — 6/6 PASS
Gerçek 3-seviyeli `checkout-platform→payments→settlement` (Faz1 deep fixture), yerel HTTP sunucu üzerinden (aynı origin — `file://` üç seviye iç içe iframe'de `contentWindow` erişimini bloke ediyor, tespit edildi ve HTTP'ye geçilerek çözüldü).
1. entry→child→grandchild descend, ACK ile `open`; torun `data-bundle-nested="true"`, `data-drilldown-depth="2"`, `data-bundle-role="child"`; kök crumb "Payment Rail"/"Card Network" içeriyor.
2. Kök 3 rung (2 buton + 1 `aria-current`); orta rung tıklaması → yalnız torun kapanır (`src` kaldırılır), çocuk `active()===true` kalır, crumb "Card Network"ü kaybeder.
3. Torunda odak, Esc×2 → önce torun sonra çocuk kapanır; odak `payments` (girişteki component) node'una döner.
4. Odak kökte (torun açıkken), Esc → yalnız en içteki (torun) kapanır, çocuk açık kalır (`closeInnermost`).
5. Torun spec-sha bozuk → ara viewer (payments) kendi stale kartını gösterir ("settlement" adı geçiyor), kök zinciri yine "Payment Rail" rung'unu gösterir.
6. Kapanmış eski oturumdan (`session:1`) sahte ack, gerçek torun penceresinden kaynaklanan bir `MessageEvent` ile → yok sayılır, güncel oturum bozulmaz.

**Not (BLOKLAYAN DEĞİL, kayda geçti — 2 deneme sınırı bilgi amaçlı, kök neden bulunup çözüldü):** senaryo 3'te gerçek klavye tuşu CDP `Input.dispatchKeyEvent` ile ikinci kattaki (torun) iframe'e güvenilir ulaşmıyor — kanıtlandı: aynı uygulama kod yolu (`escapeToParent()`→`back()`) doğrudan çağrıldığında veya torunun kendi dokümanına sentetik `keydown` gönderildiğinde doğru çalışıyor (`grand.eval("Archify.drilldown.escapeToParent()")` → çocuk `active()` false oldu). Test bu yüzden torunun kendi dokümanına sentetik (uygulamanın `isTrusted` kontrol etmediği) `keydown` gönderiyor; bu bir test-harness kısıtı, viewer koduna dair değil.

## Elle kanıt (Chrome headless, deep fixture)
`data-drilldown-state`: `descending`→`open` (entry), sonra iç viewer'da tekrar `descending`→`open`; torun `data-bundle-nested="true"` + `data-drilldown-depth="2"` + `data-bundle-role="child"`; kök crumb metni "Payment Rail" ve "Card Network" içeriyor; orta rung tıklaması sonrası torun `iframe[src]` kaldırılmış, çocuk `active()===true`.

## Kabul seti (`docs/plans/reports/faz2-tests.log`)
`check:viewer` exit=0, `check:validators` exit=0, `node test/golden.mjs` exit=1 (12 fail, ayrı — aşağıda), büyük `node --test` koşusu: **1524 test / 1515 pass / 4 fail / 5 skip**, exit=1.

**4 fail — hepsi tek kök neden: viewer template değişince checked-in bayt-pinlemeli örnekler bayatladı** (Faz1'in "aynı template ile byte-aynı" daralttığı kabul kriterinin doğal sonucu, bu fazın işi tam olarak template'i değiştirmek):
- `release-package-gates.test.mjs`: "archive build is byte-for-byte reproducible…" — Faz1'den beri bilinen ZIP tazelik (Faz2 öncesi de tek bilinen fail buydu).
- `architecture-delta.test.mjs`: "checked-in Checkout compare artifact is reproducible…" — checked-in `compare` HTML/receipt eski runtime'a pinli.
- `bundle-depth.test.mjs`: "the existing 2-level fixture manifest is byte-for-byte identical to the pre-N-depth reference" — testin kendi yorumu doğruluyor: karşılaştırma `artifact_sha256`'yı kapsıyor, testin "renderer output that this change never touches" varsayımı Faz1 için geçerliydi, Faz2 tam olarak renderer/viewer'ı değiştiriyor.
- `gallery.test.mjs`: "generated proof gallery matches its sources, receipts, and checked-in artifacts" — aynı sebep.

`test/golden.mjs`'nin 12 fail'i de aynı kök neden: `examples/*.html`, `archify/examples/*.html` eski runtime'la üretilmiş. Hiçbiri BLOKLAYAN değil — brief'in "gallery yeniden üretimi Faz 5" izniyle örtüşüyor; düzeltmek checked-in golden/örnek dosyaları yeniden üretmeyi gerektirir (bu fazın dosya listesinde yok, `archify.zip`/`docs/gallery`/`docs/cases`'a dokunma kuralıyla da örtüşüyor).

**5 skip** Faz1 baseline'ıyla aynı (ortam-gated: MCO repo klonu, Node≠22, win32, site entegrasyon kapısı, ayrı bir "real site" bayrağı) — Faz2'den etkilenmedi.

## BLOKLAYAN
Yok.

## Tur 2 (astra P1/P2, 2026-09-13)

Kaynak: `docs/plans/reviews/faz2-astra-1-2026-09-13.md` (hüküm: DÜZELTMEYLE KABUL). Tüm maddeler uygulandı. Satır numaraları güncel `viewer/template.source.html`'e göre.

**P1-a — Session ve durum kapıları.**
- `onChildMessage` (`V:7032`): `bundle-ack`/`drilldown-escape`/`drilldown-crumb`/`drilldown-ascend-done` artık `typeof data.session !== 'number' || data.session !== current.session` ile reddediyor — eski "session sayısal ise karşılaştır, yoksa kabul et" gevşekliği tamamen kalktı.
- `bundle-ack` ayrıca `html.getAttribute('data-drilldown-state') !== 'descending'` ise reddediliyor (`V:7037-7045`) — bu TEK kontrol `ascending`/`stale`/zaten-`open` (yinelenen ACK) hepsini kapsıyor; yinelenen ACK ne `finishHandshake`'i tekrar koşuyor ne `chainBelow`'u sıfırlıyor.
- `drilldown-crumb` yalnız `data-drilldown-state === 'open'` iken kabul ediliyor (`V:7055-7059`).
- `back()` (`V:6885`): `current` artık **hemen** (ascend animasyonu başlamadan) `null`'lanıyor (`closing` yerel değişkeni `reveal()`'ın ihtiyaç duyduğunu taşıyor); bu sayede 170ms'lik `ascending` penceresinde gelen HERHANGİ bir ack/escape/crumb zaten `current` yokluğuyla reddediliyor — ayrı bir durum kontrolüne gerek kalmadan. `reveal()` kendini `current !== null` (yeni bir `descend()` devraldı mı) kontrolüyle iptal ediyor.
- `drilldown-ascend-request` artık `data.session !== helloSession` ise reddediliyor (`V:7018`).

**P1-b — Settle yaşam döngüsü (repro + düzeltme).**
- `handleAscendRequest` (`V:6934`): gerçek `pendingAscendTimer` id'si saklanıyor, her yeni çağrıda `cancelPendingAscend()` ile `clearTimeout` ediliyor (yalnız referans sıfırlama değil); `back()` ve `descend()` de aynı fonksiyonu çağırıyor (`V:6817`, `V:6890`). Ayrıca `archify:drilldown-ascend-request`/`-done` çiftine `requestId` (ayrı sayaç) eklendi; bir `ascend-done` yalnız `data.requestId === pendingAscendRequestId` ise işleniyor (`V:7061-7066`). `finishClose()` içinde ek savunma: `current && current.session === mySession` (`V:6941`).
- Repro: `back() immediately followed by a redescend is not corrupted by an earlier pending ascend settle (P1-b repro)` testi — düzeltme öncesi (yalnız `pendingAscendSettle = null` yapan eski koda göre) session 2 260ms içinde yanlışlıkla kapanırdı; düzeltmeyle session 2 açık kalıyor.

**P2-a — Subtree/hello doğrulaması.**
- `drillFor` (`V:6577`) artık `(parent === myOwnDiagramId(), component)` ikilisini eşliyor — yalnız component adına bakan eski hâl kalktı; `myOwnDiagramId()` (`V:6573`) `readManifest().entry`.
- `validateSubtreeShape` (`V:6527`, yeni fonksiyon): `diagrams[]` id/file/spec_sha256 formatı, `drilldowns[]` parent/component/child, `max_depth` sayısal, `depth < max_depth`. `onParentMessage`'ın `bundle-hello` dalı (`V:6985`) geçersiz subtree'de ACK göndermiyor (ebeveynin handshake'i timeout'a düşüp kendi stale kartını gösteriyor).
- Derinlik: `belowMaxDepth()` (`V:6662`) — `descend()` (`V:6810`) ve `syncPassport` (Descend düğmesi) artık `myDepth + 1 >= max_depth` iken descend teklif etmiyor/kabul etmiyor.

**P2-b — Readiness/animasyon ayrımı.**
- Yeni `data-drilldown-anim` attribute (`setAnim`, `V:6635`) — yalnız CSS geçiş süresini işaretliyor. `data-drilldown-state` artık ACK'e kadar `descending` olarak SABİT kalıyor; 170ms zamanlayıcı yalnız `data-drilldown-anim`'i temizliyor (`V:6858-6867`). CSS: `html[data-drilldown-anim="descending"/"ascending"] .archify-drilldown-host { transition: opacity 170ms ease; }` (eskiden `data-drilldown-state` üstündeydi).

**P2-c — Testler.** `archify/test/drilldown-nested-browser.test.mjs`'e 5 yeni test eklendi (toplam 11), + 2 test adı/yorumu güçlendirildi:
1. `a session-less ack and a duplicate already-open ack are both rejected without disturbing the descent` — yeni.
2. `back() immediately followed by a redescend is not corrupted by an earlier pending ascend settle (P1-b repro)` — yeni.
3. `a root rung click ascends two levels at once, closing the innermost level first` — yeni, 15ms örnekleme ile en-içteki-önce sırası assert ediliyor.
4. `switching from one sibling child to another shows the correct breadcrumb` — yeni (kardeş geçişi: `payments`↔`queue`/ledger-flow).
5. `closing a stale grandchild attempt returns the intermediate level to normal without disturbing the root crumb for its still-open child` — yeni (stale + Esc).
6. "Escape inside the grandchild…" testinin adı/yorumu güçlendirildi: sentetik `keydown`'un yalnız handler'ı sınadığı, gerçek OS odak yönlendirmesini KANITLAMADIĞI açıkça yazıldı; CDP `Input.dispatchKeyEvent` iç+dış `<iframe>` elemanlarına `.focus()` verilerek İKİNCİ KEZ denendi (astra'nın istediği gibi) — yine torun seviyesine ulaşmadı, kanıtlandı (`node` odaklanıyor ama tuş kök dokümanda kalıyor); bu bir CDP/harness kısıtı, viewer kodu değil.
7. "Escape focused at the root…" testi artık `document.body` yerine kökün GERÇEK `[aria-current="page"]` breadcrumb rung'una `focus()` verip gerçek CDP tuşu gönderiyor (adı: `Escape with real focus on the root breadcrumb rung...`).

Ayrıca `archify/test/bundle-message-origin-browser.test.mjs`'de bir mevcut senaryo (`messagesToEntry([...ack...], 'child')`, satır ~311) yeni zorunlu-session kuralına uyacak şekilde güncellendi: zaten `open` iken gelen (artık `session:1` taşıyan) bir ack'in `stale`'e DEĞİL, `assertLive`'a (değişmeden) yol açtığı doğrulanıyor — yinelenen-ACK bağışıklığı, geç-mismatch tespitinin yerini bilinçli olarak alıyor.

**Docs.** `viewer/README.md` "Drilldown contract" ve `archify/references/drilldown-bundles.md` "Reader behavior" zorunlu session, `requestId`, `data-drilldown-state`/`-anim` ayrımı, `(parent,component)` üçlü eşleşmesi, `max_depth` tavanı ve `current`'ın `back()` başında hemen null'lanması için güncellendi.

**Sayılar.**
- Hedefli: `check:viewer` exit=0; `ARCHIFY_CHROME=... node --test test/drilldown-*.test.mjs test/bundle-message-origin-browser.test.mjs` → **28/28 pass**.
- Tam kabul seti (`docs/plans/reports/faz2-tests-r2.log`): **1529 test / 1521 pass / 3 fail / 5 skip**, exit=1.
  - 3 fail — hepsi tur-1'deki AYNI kök neden (viewer template değişince checked-in bayt-pinli örnekler bayatladı): `architecture-delta.test.mjs` (checked-in compare artifact), `gallery.test.mjs`, `release-package-gates.test.mjs` (ZIP, Faz1'den beri bilinen). Tur-1'deki 4. fail (`bundle-depth.test.mjs`'in byte-identity referansı) bu turda YOK — o dosya (`archify/bundle/diagram-bundle.mjs`, Faz1'e ait, benim dokunmadığım) bu oturum sırasında paralel/bağımsız olarak güncellenmiş ve testin adı da değişmiş ("bundle-logic byte-identical…, artifact digests are renderer-dependent and verified from disk"); bu Faz2 kapsamımın dışında, yalnız gözlem olarak not edildi.
  - `node test/golden.mjs`: hâlâ 12 fail, aynı sebep, değişmedi.
  - 5 skip tur-1 ile aynı (ortam-gated).

**BLOKLAYAN (tur 2).** Yok.

## Tur 3 (astra tur-2 görüşü, 2026-09-13, dar kapsam)

Kaynak: `docs/plans/reviews/faz2-astra-2-2026-09-13.md` (hüküm: DÜZELTMEYLE KABUL). 4 madde, hepsi uygulandı.

**1. P1-b içten-dışa sıra (bağımsız 200ms fallback'ler sırayı garantilemiyordu).**
`viewer/template.source.html:6301` yeni sabit `ASCEND_SETTLE_STEP_MS = 250`; `:6975` `handleAscendRequest` artık `var settleTimeoutMs = ASCEND_SETTLE_STEP_MS * (chainBelow.length + 1);` ile HER seviyede kendi altındaki açık seviye sayısına göre ölçekli fallback kullanıyor (kökte 1 hop altı varsa 500ms, ara seviyede 0 hop altı varsa 250ms) — sabit 200ms her yerde artık yok. Mesaj-tabanlı yol (ascend-done) değişmedi, hâlâ önceliklidir; ölçekli timeout yalnız mesaj kaybolursa devreye giren güvenlik ağı. `viewer/README.md` "Ascend-to-depth" ve `drilldown-bundles.md` "Reader behavior" güncellendi.

**2. P2-a `drillFor()` üçlü eşleşme eksikti (`row.child === childId` yoktu).**
`V:6585` `drillFor(componentId, childId)` artık `(parent, component, child)` üçünü birden eşliyor; `V:6827` `descend()` çağrıyı `drillFor(componentId, childId)` olarak güncelledi. Eşleşmezse mevcut `missing-row` stale dalı çalışıyor (kod değişmedi, yalnız `row` artık daha sıkı bulunuyor). Docs güncellendi.

**3. Sıra testi kanıt açığı + yapay yavaşlık testi.**
`archify/test/drilldown-nested-browser.test.mjs`: "a root rung click ascends two levels at once…" testi YENİDEN YAZILDI — eski hâli `child.contentWindow.document.getElementById(...)` ile torunu arıyordu; çocuğun `src`'si kalkınca bu sorgu de "yok" dönüyordu, yani ters kapanışı yakalayamazdı. Yeni hâl her iki seviyenin KENDİ `data-drilldown-state` geçişini (stabil element referanslarına bağlı `MutationObserver`, zaman damgalı) izliyor, `payments`'ın `ascending`'e geçiş anının `root`'unkinden ÖNCE/AYNI ANDA olduğunu assert ediyor. Yeni ikinci test `a slow grandchild ascend reply does not make the root close the child before the child closes the grandchild`: torunun (settlement) `archify:drilldown-ascend-done` cevabı `window.postMessage` sarmalanarak 300ms geciktiriliyor (payments'ın kendi 250ms fallback'inden daha yavaş) — payments kendi fallback'iyle ~250ms'de kapanıyor, kök payments'ın hızlı `ascend-done`'ıyla ~254ms'de kapanıyor (kendi 500ms fallback'ini beklemeden); sıra + kökün mesaj-yoluyla kapandığı (< 400ms, kendi 500ms fallback'i değil) assert ediliyor.

**4. Session'sız ACK yalnız `open`da sınanıyordu.**
Yeni test `during a pending handshake, a session-less ack and a wrong-session ack are rejected before the real ack opens it`: `descend()` çağrısı hemen ardından (senkron, gerçek çocuğun network round-trip'i henüz mümkün değilken) session'sız ve yanlış-session'lı (999) sahte ack'ler `window.dispatchEvent` ile gönderiliyor, durumun `descending`de sabit kaldığı doğrulanıyor, sonra gerçek çocuğun kendi doğru ack'inin normal şekilde `open`'a geçtiği doğrulanıyor.

Ayrıca 5. yeni test eklendi (madde 2'nin canlı kanıtı): `a drilldown row whose declared child does not match the node's own annotation is rejected as a missing row, never loading the wrong file` — entry'nin gömülü manifestindeki `payments` satırının `child`'ı diskte gerçekten var olan `ledger-flow`'a değiştiriliyor (`openHarness`'a eklenen `beforeOpen(dir)` kancasıyla, navigasyondan önce); düzeltme öncesi bu senaryo `ledger-flow.html`'i yanlışlıkla yüklerdi, düzeltme sonrası `stale` + `frame.src===null` doğrulanıyor.

Toplam: `drilldown-nested-browser.test.mjs` 11→14 test — sıra testi yeniden yazıldı (sayıca yerinde), 3 yeni test eklendi (yavaş-torun-cevabı, pending-handshake session kapıları, edge-mismatch).

**Hedefli kabul (bu tur, tam set gerekmedi).**
`cd archify && npm run check:viewer` exit=0. `ARCHIFY_CHROME=/usr/bin/google-chrome node --test test/drilldown-*.test.mjs test/bundle-message-origin-browser.test.mjs` → **31 test / 31 pass / 0 fail / 0 skip**.

**Klavye/file:// kanıtı:** değiştirilmedi, raporda "Faz 5 öncesi" (P2-c) olarak kalıyor — bu tur dokunulmadı, coordinator talimatı gereği.

**BLOKLAYAN (tur 3).** Yok.

## Tur 4 (astra tur-3 görüşü, 2026-09-13, tek madde — son)

Kaynak: `docs/plans/reviews/faz2-astra-3-2026-09-13.md` (hüküm: DÜZELTMEYLE KABUL; P2-a/P2-b KAPANDI, yalnız P1-b açıktı). `viewer/viewer-camera.js` ve CSS (touch-action, Faz 3a'nın paralel işi) DOKUNULMADI — yalnız `Archify.drilldown` IIFE + docs + test.

**P1-b — fallback artık `chainBelow`'a değil manifestteki azami kalan derinliğe dayanıyor.** Kök neden: torun handshake'i sürerken (henüz crumb gelmemiş) `chainBelow` her iki seviyede de boş kalıyor, eski formül `ASCEND_SETTLE_STEP_MS*(chainBelow.length+1)` bu yüzden HER İKİ seviyede de aynı (minimum) süreyi veriyordu — içten-dışa sıra garantisi bozuluyordu. `viewer/template.source.html:6977-6981`: `handleAscendRequest` artık `var maxDepthForTimeout = readManifest().max_depth (yoksa 2); var settleTimeoutMs = ASCEND_SETTLE_STEP_MS * Math.max(1, maxDepthForTimeout - myDepth);` kullanıyor — `chainBelow` bilinmese/boş olsa bile dıştaki kat her zaman içtekinden en az bir adım (250ms) uzun bekliyor, çünkü `maxDepth - myDepth` yalnız STATİK manifest verisine dayanıyor. `viewer/README.md` "Ascend-to-depth" ve `archify/references/drilldown-bundles.md` "Reader behavior" cümleleri güncellendi.

**Testler:** `archify/test/drilldown-nested-browser.test.mjs`'e yeni test `ascend order stays innermost-first when the grandchild handshake is still pending and chainBelow is empty at every level` — torunun (settlement) ACK'i VE ascend-done'ı tamamen yutuluyor (payments'ın kendi handshake'i `descending`de sabit kalıyor, `chainBelow` iki seviyede de hep boş), kök rung ile toplu ascend tetikleniyor; `MutationObserver` ile her iki seviyenin `ascending`'e geçiş zaman damgası kaydediliyor: payments kesinlikle root'tan ÖNCE kapanıyor, payments'ın zamanlaması kendi ~500ms fallback'ine (`250*max(1,3-1)`, "birim düzeyinde" formül doğrulaması) yakın çıkıyor, root ise kendi ~750ms fallback'ini beklemeden payments'ın hızlı ascend-done'ıyla hemen ardından kapanıyor. Ayrıca tur-3'ün "yavaş torun cevabı" testi yeni formüle göre güncellendi (eşikler 250/500'den 500/750'ye taşındı) — bu süreçte gecikme enjeksiyon tekniğinin (`setTimeout` ile üst-realm'den yeniden postMessage) mesajın `event.source`'unu bozup viewer tarafından haklı olarak reddedildiği gözlemlendi (uygulama hatası değil, test tekniği kısıtı); test bunu yansıtacak şekilde yeniden yorumlandı, davranış (sıra korunuyor) doğrulanmaya devam ediyor.

**Hedefli kabul:** `check:viewer` exit=0 (Faz 3a'nın camera fragmanlarıyla birlikte yeniden üretildi — yalnız derleme, kaynağa dokunulmadı). `ARCHIFY_CHROME=/usr/bin/google-chrome node --test test/drilldown-*.test.mjs test/bundle-message-origin-browser.test.mjs test/viewer-wheel-browser.test.mjs` → **52 test / 52 pass / 0 fail** (bir önceki koşuda `viewer-wheel-browser.test.mjs`'de 3 alt-test paralel Chrome yüküyle bir kez geçici olarak flake etti, izole + tekrar koşuda 20/20 ve 52/52 temiz — drilldown değişikliğiyle ilgisiz, kaynak dokunulmadı).

**BLOKLAYAN (tur 4).** Yok. Klavye/file:// kanıtı hâlâ "Faz 5 öncesi" — bu tur dokunulmadı.
