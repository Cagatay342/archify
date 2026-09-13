# Faz 1 brief — bundle N-derinlik (Sonnet)

Repo: /home/ubuntu/repos/archify, dal `feat/nested-drilldown` (base cc1b33a). Önce oku: `docs/plans/nested-drilldown-2026-09-12.md` §2A, §7 (astra eksikleri), `docs/plans/reports/faz0-baseline-2026-09-12.md` (baseline sayıları), `archify/references/drilldown-bundles.md`, `docs/decisions/identity-map-2026-09-09.md` §3 (bundle) ve §"Not supported".

## Amaç
`archify bundle <dir>` iki seviyeyle sınırlı (entry + çocuklar). Çocuğun da çocuğu olabilsin: ağaç, en fazla 8 seviye (`max_depth ≤ 8`). Bu fazda YALNIZ üretim hattı + doğrulayıcı + locate genellemesi + docs + testler. `viewer/` ve `archify/assets/template.html`'e DOKUNMA (Faz 2). Viewer'ın torunlara inememesi bu fazda beklenen davranıştır.

## Değişecek dosyalar (yalnız bunlar + yeni test/fixture dosyaları)
1. `archify/schemas/bundle.schema.json`
   - `max_depth`: `{"type":"integer","minimum":2,"maximum":8}`; zorunlu alanlara ekle (`required`).
   - `diagrams.maxItems` kaldır; `diagrams[].level`: `minimum 0, maximum 7`.
   - Başka alan ekleme. Sonra `cd archify && npm run generate:validators` (generated-validators.mjs yeniden üretilir; `npm run check:validators` geçmeli).
2. `archify/bundle/diagram-bundle.mjs`
   - `drilldownsFrom`: TÜM diyagramlar için (yalnız entry değil); satır sırası: önce entry'nin bileşen sırası, sonra diğer ebeveynler `id` sırasıyla, her biri kendi bileşen sırasında. `parent` = o diyagramın id'si. Aynı diyagramda aynı bileşen iki drilldown → mevcut `bundle/drilldown-duplicate`.
   - Seviye hesabı: entry'den `drilldowns` üstünden BFS; `level` = derinlik; `max_depth` = (en derin level + 1), en az 2. Erişilemeyen diyagram → `bundle/orphan` (üretimde `fail`, check'te `note`). Aynı çocuğu iki satır hedefliyorsa → `bundle/drilldown-shared`. Döngü → `bundle/drilldown-cycle`. Derinlik > 8 → `bundle/depth-exceeded`.
   - `chooseEntry`: kök = drilldown'ı olan ama hedeflenmeyen tek diyagram (mevcut mantık korunur; ara düğümler hem hedef hem ebeveyn olduğu için otomatik dışlanır).
   - `validateBundle` check 2: entry level 0; her diyagramın `level`'ı BFS ile hesaplanan derinliğe eşit (`bundle/child-level`); `max_depth` hesaplanan değere eşit (`bundle/max-depth`).
   - check 7: `row.parent` entry olmak ZORUNDA DEĞİL; `row.parent` `diagrams[]`'da var ve `row.component` o ebeveynin semantic koleksiyonunda (`bundle/drilldown-parent`, `bundle/drilldown-component`); `bundle/drilldown-nested` notu KALDIRILIR; yerine yukarıdaki shared/cycle/orphan/depth notları.
   - check 9 `child-mark` → `leaf-mark`: YALNIZ drilldown'ı olmayan (yaprak) diyagramların HTML'inde `data-drilldown-child` mark olmamalı (`bundle/leaf-mark`). Ara diyagramlarda mark OLMALI (renderer spec'ten çizer; kontrol etme, sadece yasaklama).
   - `validateOwnershipSubset` (satır ~95-135): `parent.map` artık entry değil, o çocuğun drilldown satırındaki `parent` diyagramının spec dosyası olmalı; ebeveyn sidecar'ı `<parentId>.ownership.json`. Not: sidecar zorunluluğu kuralı ("herhangi bir sidecar varsa entry sidecar'ı şart") aynen kalır.
   - Kod okunabilirliği: helper'lar (`buildTree(manifest)` gibi) tek yerde; hem üretim hem check aynı helper'ı kullansın.
   - Hata kodları ve `supportedFixes` metinleri mevcut üsluba uysun.
3. `archify/locate/cli.mjs` (satır ~325-360 `--bundle` dalı): her `drilldowns` satırı için ebeveyn spec/sidecar = `link.parent` diyagramınınki (entry varsayımını kaldır); ebeveynleri çocuklardan önce işle (level sırası) ki `inheritParentExcluded(parentOwnership, …)` zincirlensin (torun, çocuğun kalıtılmış `excluded`'ını alır). `childReceipts` düz map olarak kalır (`children[<id>]`), viewer değişmez.
4. `archify/references/drilldown-bundles.md`: derinlik (2→≤8, "3–4 seviye tipik"), dizin örneği (bir torun), manifest örneği (`max_depth`, `level 2`), check listesi (yeni kodlar, kaldırılan `drilldown-nested`/`child-mark`), "Not supported": "No third level" satırı çıkar, yerine "Depth above 8" + "no shared children (tree, not DAG)". Locate bölümünde ebeveyn-çocuk zinciri. `archify/schemas/README.md`'de bundle şeması anlatılıyorsa aynı düzeltme.
5. `CHANGELOG.md` (repo kökü) "Unreleased"/en üst bölüme kısa madde (İngilizce, mevcut üslup): additive; 2-seviye bundle'lar için manifest aynı kalır; tree şartı (shared child artık hata) açıkça yazılır.
6. Testler (`archify/test/`):
   - Yeni fixture dizini `test/fixtures/bundle-checkout-deep/`: mevcut 3 spec'in kopyası + `payments.json` içindeki bir bileşene `"drilldown": "settlement"` + yeni `settlement.json` (architecture, ≤12 node, mevcut spec'lerle aynı üslup; validate showcase geçmesi şart değil ama `render` çalışmalı). `helpers/bundle-fixture.mjs`'e `stageBundleFixture({ deep: true })` seçeneği (mevcut çağrılar değişmez).
   - Yeni `bundle-depth.test.mjs`: (a) deep fixture `bundle` üretir, `--check` tüm checkler geçer, manifest `max_depth 3`, settlement `level 2`, drilldowns 3 satır (parent'lar doğru); (b) MEVCUT 3-spec fixture'ın manifest'i bu değişiklikten önceki ile alan-alan aynı (`max_depth 2`, aynı satırlar) — `bundle-manifest.test.mjs` ve `bundle-validate.test.mjs` değişmeden geçmeli, sadece `drilldown-nested`/`child-mark` bekleyen testler yeni kodlara güncellenir; (c) negatifler: manifest'i elle bozup `--check` → `bundle/drilldown-shared`, `bundle/drilldown-cycle`, `bundle/orphan`, `bundle/child-level`, `bundle/max-depth`, `bundle/leaf-mark` (yaprağa sahte mark ekleyerek), `bundle/depth-exceeded` (manifest `max_depth: 9` → şema reddi de kabul).
   - `locate-bundle.test.mjs` desenine göre 3 seviyeli locate testi: torun sidecar'ı `parent: {map: payments.json, component: <id>}`; torun globs çocuğun altkümesi; `--bundle` receipt'inde `children.settlement` var; entry `excluded` torunda da kalıtılmış.
7. Kabul: `cd archify && npm test` → baseline'a göre yeni FAIL yok, yeni testler geçiyor; `npm run check:validators` geçiyor; `node bin/archify.mjs bundle <deep-fixture-kopyası> --check --json` `ok:true`; self-map `docs/cases/archify-self` `--check` sonucu baseline ile aynı (ownership-stale; DÜZELTME).

## Kurallar
- Commit YOK. `viewer/`, `archify/assets/template.html`, `archify.zip`, `docs/gallery`, `docs/cases` DOKUNMA. AIWorkspace repo'suna dokunma.
- Mevcut kod üslubunu koru; değişmeyen koda yorum ekleme. Yeni bağımlılık yok.
- Bir sorun 2 denemede çözülmezse DUR: raporda "BLOKLAYAN" başlığıyla yaz, tahmin etme.
- Rapor: `docs/plans/reports/faz1-bundle-depth-2026-09-12.md` (Türkçe, ≤80 satır): değişen dosyalar + satır sayıları, yeni/kaldırılan hata kodları, test sayıları (before/after), kanıt komutları ve çıktıları (kısa), açık noktalar/BLOKLAYAN. Son mesajında rapor yolu + 5 satır özet.
