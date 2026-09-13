# Faz 1 — Tur 3 brief: sahiplik sidecar sertleştirme (dar kapsam)

Uygulayıcı: Sonnet. Yönetici/review: Fable. Repo: `~/repos/archify`, dal `feat/nested-drilldown` (çalışma ağacı commitsiz Faz 1 değişikliklerini içerir; onları KORU).
Kaynak: Codex astra tur-2 açık maddeleri + tur-3 çözüm tasarımı → `docs/plans/reviews/faz1-astra-2-2026-09-12.md`, `docs/plans/reviews/faz1-astra-3-2026-09-12.md`. Bu brief astra tur-3'ün A/B/C bölümlerini uygular; tasarımdan sapacaksan raporda gerekçele.

## Kapsam (yalnız bunlar)
Dosyalar: `archify/bundle/diagram-bundle.mjs`, gerekirse `archify/locate/cli.mjs` (çağrı imzası), `archify/test/bundle-depth.test.mjs` (+ gerekirse `bundle-validate.test.mjs`, `helpers/bundle-fixture.mjs`, yeni fixture), `archify/references/drilldown-bundles.md` (sözleşme cümlesi), `CHANGELOG.md` (mevcut Faz 1 girdisine 1-2 satır).

1. **Kimlik dosyadan** — `validateOwnershipSubset(manifest, sidecar, parentSidecar, bundleDir, {sidecarPath, parentSidecarPath})`: `sidecarPath` zorunlu; kimlik `x.ownership.json → x.json` → `manifest.diagrams[].file` (html→json) eşleşmesinden diagram id. `sidecar.map`, `resolve(dirname(sidecarPath), sidecar.map)` ile beklenen spec yoluna eşit değilse `bundle/ownership-not-subset`. Beyana dayalı (`ownId` from `sidecar.map`) fallback KALKAR. Basename-only karşılaştırma yok.
   Test: geçerli a→x, b→y kenarları; `x.ownership.json` içinde `map:y.json, parent:b` → hedef kodla RET (digest/embed tutarlı tutulmalı ki başka kontrol tetiklenmesin).
2. **Gerçek ebeveyn bağı** — `walkOwnershipTree(current, currentPath)`; çocuğa `{sidecarPath: childOwnPath, parentSidecarPath: currentPath}`. Çocuğun `parent.map` yolu `currentPath`'ten türetilen spec yoluna, `parent.component` yürünülen `component.id`'ye eşit olmalı; manifestte `(gerçek parent id, component, gerçek child id)` üçlüsü bulunmalı. Uyumsuzluk → `bundle/ownership-not-subset` + o dal için `continue`. `child_map` yollarını `dirname(currentPath)` tabanında çöz. `loadSiblingSidecar` yüklediği yolu da döndürsün; kök sidecar'ın kendi `map`'i aynı kuralla doğrulansın.
   Test: manifestte `b.queue→y` varken a'nın `queue.child_map`'inden y'ye yürüt, `y.parent=b` → globlar uyumlu olsa bile RET.
3. **Şema hatası dalı keser** — `validateOwnershipSubset` içinde şema hatası varsa hemen `return failures` (subset hesabına girme). Kökte kaydet+dön; çocukta kaydet+`continue`, özyineleme başlatma.
   Test: çocuk sidecar `components:[null]` → `BundleError` (hedef kod), `TypeError` DEĞİL. Mevcut "ambiguous" testini güncelle: eksik `parent.map` artık şemada durur (`archify/schemas/ownership.schema.json:18`), eski mesajı zorlama.
4. **Kök literal null** — parse `catch` hata kaydedip dönsün; kökte null/nesne/dizi kontrolü şema ve sibling yüklemesinden ÖNCE; `if (!sidecar) return` kalkar → `bundle/ownership-parse`.
   Test: manifestteki başlangıç sidecar'ı `null\n` (SHA ve embed güncel) → `bundle/ownership-parse`.
5. **DFS sözleşmesi (kod değişmez)** — `buildTree` kalır. Test: `a→b→c, a→c` → `buildTree` `c.level===2`, `shared` c içerir; build `bundle/drilldown-shared`. `drilldown-bundles.md`'ye 1 cümle: geçerli ağaçta level = ebeveyn+1; geçersiz grafikte ilk keşif değeri, en kısa yol değil.
6. **Byte-aynılık kanıtı (#7)** — Referansı DEĞİŞİKLİK ÖNCESİ sürümden üret: temiz worktree `/tmp/claude-1000/-home-ubuntu-repos-AIWorkspace/44f257c0-9f19-4bde-8a89-1d84b1b2297d/scratchpad/archify-idmap` (base `cc1b33a`, salt-okunur kullan; oraya dosya yazma). Orada iki seviyeli fixture ile bundle üretip `manifest.json` baytlarını al, `archify/test/fixtures/.../manifest.reference.json` olarak asıl repoya koy (kökeni test dosyasında yorumla: commit, komut). Test: yeni üretimin manifest baytları referansla `Buffer.equals` — digest/boşluk/sıra maskeleme YOK. Aynı fixture/renderer/ortam girdisi şart; ortam bağımlı alan varsa (mutlak yol, zaman) raporda yaz ve dur — maskeleme ekleme.

## Kısıtlar
- Commit/stash/checkout YOK. `viewer/`, `archify/assets/template.html`, `archify.zip`, `docs/gallery`, `docs/cases` DOKUNMA. Şema değişirse `npm run generate:validators`.
- Bir madde 2 denemede kapanmazsa dur, raporda **BLOKLAYAN** yaz, diğer maddelere geç.
- Kabul seti (sonunda koş, logu `docs/plans/reports/faz1-round3-tests.log`):
  `cd ~/repos/archify && npm run check:viewer && npm run check:validators && node test/golden.mjs && ARCHIFY_CHROME=/usr/bin/google-chrome node --test --test-concurrency=2 $(ls test/*.test.mjs | grep -v -E "motion-governor-browser|update-notifier")`
  Beklenen tek fail: `archive build is byte-for-byte reproducible…` (archify.zip tazelik, bilinen). Başka fail = düzelt.
- Rapor: `docs/plans/reports/faz1-round3-2026-09-12.md` — madde madde ne yapıldı (dosya:satır), testler, sapmalar, BLOKLAYAN'lar, kabul seti sayıları.
