# Faz 1 — Bundle N-derinlik Raporu (2026-09-12)

Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`. Commit yok. `viewer/`,
`archify/assets/template.html`, `archify.zip`, `docs/gallery`, `docs/cases`'a dokunulmadı.

## Değişen dosyalar (satır)
- `archify/schemas/bundle.schema.json` (+3/-4): `max_depth` zorunlu `integer 2..8`; `diagrams.maxItems` kaldırıldı; `level` `0..7`.
- `archify/renderers/shared/generated-validators.mjs`: `npm run generate:validators` ile yeniden üretildi.
- `archify/bundle/diagram-bundle.mjs` (+225/-…): `buildTree()` (BFS + gri/siyah renklendirme ile cycle/shared tespiti, tek yerde); `drilldownsFrom(pairs, entryId)` TÜM diyagramları entry-önce/id-sırası ile tarar; `buildBundleManifest` hesaplanan `level`/`max_depth` yazar, build-time'da cycle/shared/orphan/depth-exceeded'i `fail` eder; `validateBundle` check2 BFS'e göre `child-level`/`max-depth`/`depth-exceeded`; check7 `parent` artık herhangi bir diyagram + shared/cycle/orphan notları; check9 `child-mark`→`leaf-mark`; check10 ownership alt-ağacı `child_map` zincirini özyinelemeli geziyor.
- `archify/locate/cli.mjs` (+22/-6): `writeBundleProjection` satırları `level`'a göre (ebeveyn önce) sıralıyor, ebeveyn spec/sidecar'ını `link.parent`'tan çözüyor, `effectiveOwnershipById` ile `inheritParentExcluded`'ı zincirliyor; hata metni "entry link"→"drilldown link".
- `archify/references/drilldown-bundles.md` (+136/-…), `archify/schemas/README.md` (+17/-…), `CHANGELOG.md` (+1): derinlik 2→≤8, 3-seviye örnek, yeni check/hata-kodu listesi, "Not supported" güncel, yeni "parent-child chain" bölümü.
- Testler: `bundle-validate.test.mjs`, `bundle-schema.test.mjs`, `generate-validators.test.mjs` düzeltmeleri; `helpers/bundle-fixture.mjs`'e `stageBundleFixture({deep:true})`.
- Yeni: `test/fixtures/bundle-checkout-deep/` (3 spec kopyası + `payments.json`'da `psp→drilldown:"settlement"` + `settlement.json`); `test/bundle-depth.test.mjs` (477 satır, 19 test); `test/locate-bundle-depth.test.mjs` (223 satır, 2 test).

## Fable review turu (bu fazda işlendi)
1. **FAIL #335** `generate-validators.test.mjs`: örnek manifest'e `max_depth: 2` eklendi (şema gevşetilmedi) → izole **3/3 pass**.
2. **FAIL #1010** `release-package-gates.test.mjs` archive byte-reproducible: düzeltme YOK — bilinen: ZIP yeniden üretimi release fazında (CONTRIBUTING "ZIP freshness": *"Skill runtime, schema, renderer... changes require checking ZIP freshness"*); bu fazda commit/ZIP'e dokunulmuyor.
3. **F1** `validateOwnershipSubset`: eşleşme artık yalnız `component` adına değil, `parentLink.map` ile ayrıştırılıyor — birden çok satır aynı `component` id'sini paylaşıyorsa (farklı diyagramlarda aynı isim) map zorunlu, yoksa `bundle/ownership-not-subset: … is ambiguous … set parent.map`; map verilip hiçbir adayla eşleşmezse `… does not name the spec of any drilldown parent`. 3 yeni birim test (`bundle-depth.test.mjs` #11-13).
4. **F2** `walkOwnershipTree`: `visited` (path-stack, push/pop) eklendi; `child_map` bir atasına işaret ederse `bundle/ownership-cycle: <file>` notu düşüp o dalı kesiyor, sonsuz özyineleme yok. Kasıtlı döngülü sidecar fixture'ıyla test (#14), hang olmadan geçti.
5. `locate/cli.mjs`: "does not match the entry link" → "does not match the drilldown link" (ebeveyn artık her zaman entry değil).
6. Yalnız ilgili dosyalar yeniden koşuldu (tam kabul koşusu Fable'da).

## Yeni/kaldırılan hata kodları
Yeni: `bundle/drilldown-shared`, `bundle/orphan`, `bundle/depth-exceeded`, `bundle/leaf-mark`, `bundle/ownership-cycle`.
Kaldırılan: `bundle/drilldown-nested`, `bundle/child-mark`.

## Astra review turu (2. tur, "DÜZELTMEYLE KABUL" — bu fazda işlendi)
Tam metin: `docs/plans/reviews/faz1-astra-1-2026-09-12.md`. Fable'ın kabul koşusu (`faz1-tests-final.log`) `exit=` görene kadar beklendi; bitince tek kalan fail baseline'da olmayan `release-package-gates.test.mjs` (bilinen ZIP farkı) idi — dosyalara ancak ondan sonra dokunuldu.

1. **P1-a** `validateOwnershipSubset`: eşleştirme artık `(parent, component, child)` üçlüsü — sidecar'ın kendi `map` alanından türetilen `ownId` ile satırın `child`'ı eşleşmiyorsa aday bile sayılmıyor (eski kod yalnız `component` adına bakıyordu, `b.queue→y` varken `y.parent={map:a.json,component:queue}` yanlışlıkla geçebiliyordu). `parent.map` artık `bundleDir`'e göre `path.resolve` ile karşılaştırılıyor (basename değil) → `nested/a.json` ile `a.json` artık ayrışıyor. Kanıt: `bundle-depth.test.mjs` #11-14 (ambiguous/resolves/does-not-name/wrong-parent-triple, sonuncusu astra'nın tam senaryosu).
2. **P1-b** `walkOwnershipTree`: her kenarda artık (a) `component.child_map`'in gösterdiği bileşen adı ile `childSidecar.parent.component` karşılıklı doğrulanıyor, (b) `validateOwnershipSubset(manifest, childSidecar, current, resolved)` HER ÇOCUKTA çağrılıyor (önceden yalnız kök sidecar'da çağrılıyordu, torunlarda hiç çalışmıyordu — astra'nın bellek-içi denemesi bu yüzden yanlış ebeveynle `ok:true 10/10` almıştı). Kanıt: yeni tam-entegrasyon testi "rejects a grandchild ownership sidecar bound to the wrong parent component" → artık `ok:false`.
3. **P1-c** Bozuk/null çocuk sidecar: JSON parse başarılı ama sonuç obje değilse (`null`, `[]`, ilkel) `bundle/ownership-parse` notu düşüp o dalı `continue` ile kesiyor; kök sidecar için de aynı koruma eklendi. TypeError artık yok. Kanıt: "reports a controlled failure instead of crashing on a malformed child sidecar" (`payments.ownership.json` içeriği literal `null`).
4. **P2** `buildTree`: özyinelemeli DFS → açık yığın (stack) ile iteratif DFS; `TREE_DEPTH_HALT=7`'de genişlemeyi durduruyor (yalnız `level`'ı kaydedip kapatıyor, yeni çerçeve açmıyor) → 10.000 düğümlük zincirde RangeError yok, hâlâ `maxObservedLevel>7` (depth-exceeded) doğru raporlanıyor; geçerli 8 seviye (level 0..7) hâlâ kabul ediliyor. `buildTree` artık export edilip doğrudan test ediliyor (dosya render etmeden, saniyeler içinde). Kanıt: 2 yeni test (10k-zincir + 8-seviye pozitif).
5. Byte-aynılık testi (`bundle-depth.test.mjs:52`): `git show HEAD:` ile eski koda karşı kıyas mümkün değildi (bu dalda "eski kod" commit'li değil) → onun yerine 2-seviye fixture'ın `max_depth`, her diyagramın `level`/`diagram_type`/`title`/`node_count`'ı ve `drilldowns[]` satır sırası SABİT JSON olarak alan-alan `deepEqual` ile sabitlendi (yalnız digest'ler hariç, onlar gerekçeyle değişken).
6. `components:[]` yüzünden şemadan zaten düşen yanlış-geçen pozitif test: gerçek `ownership.schema.json`'un `components.minItems:1` kuralına uyan `{id,globs:[]}` ile değiştirildi; "resolves correctly" testi artık `failures` için tam `deepEqual([])` istiyor (önceden yalnız iki alt-metnin yokluğuna bakıyordu).
7. Locate kapsam boşluğu: yeni `test/locate-bundle-depth.test.mjs` testi — **4 seviyeli** (`root→zeta→aaa→omega`), `aaa` id'si kendi atalarından (`root`,`zeta`) ALFABETİK ÖNCE geliyor (id sıralamasına güvenen gizli bir bağımlılık varsa yakalar); ara ebeveyn `zeta`'nın KENDİ `excluded`'ı iki basamak aşağıda `omega`'da kalıtılmış olarak doğrulanıyor; tüm ownership sidecar'lar `archify bundle` ÇALIŞTIRILMADAN ÖNCE diskte, böylece `manifest.ownership` gerçek build'den set ediliyor ve `--check`'in ownership yürüyüşü (P1/P2 dahil) uçtan uca `archify locate --bundle` üzerinden de kapsanıyor.
8. Docs: `drilldown-bundles.md:6` "up to twelve children" → "at most twelve per parent — the node cap applies per diagram, not to the bundle as a whole" (toplam sınır yok, brief'te de zorunlu değildi). Toplam bayt bütçesi uygulanmadı (brief zorunlu kılmıyor).
9. `locate/cli.mjs` hata metni ("entry link"→"drilldown link") bu fazın önceki turunda zaten düzeltilmişti; doğrulandı.

## Test sayıları
- Faz 0 baseline (tam suite, 2 bilinen-kötü dahil): 1578 test / 1571 pass / 2 fail / 5 skip.
- Fable'ın 2. tam kabul koşusu (`faz1-tests-final.log`, bu turun düzeltmelerinden ÖNCEki kod üzerinde): 1504 test / 1498 pass / 1 fail (yalnız `release-package-gates.test.mjs`, bilinen ZIP farkı) / 5 skip.
- Astra turu sonrası hedefli koşu — `check:validators` PASS; `ARCHIFY_CHROME=... node --test test/bundle-*.test.mjs test/locate-bundle*.test.mjs test/generate-validators.test.mjs`:
  **71 test / 71 pass / 0 fail**.
- `bundle-depth.test.mjs`: 14→19 test (P1-a: ambiguous/resolves/does-not-name testleri sıkılaştırıldı +1 yeni "own-diagram-identity" testi, P1-b×1, P1-c×1, P2×2, byte-şekli testi yeniden yazıldı). `locate-bundle-depth.test.mjs`: 1→2 test (4-seviyeli eklendi).
- Self-map (`docs/cases/archify-self --check`): baseline ile AYNI — `bundle/ownership-stale`, checksPassed 9/10.

## Kanıt komutları
```
tail -1 docs/plans/reports/faz1-tests-final.log → exit=1 (yalnız release-package-gates fail, beklenen)
node --test test/bundle-*.test.mjs test/locate-bundle*.test.mjs test/generate-validators.test.mjs
  → tests 71 pass 71 fail 0
node archify/bin/archify.mjs bundle docs/cases/archify-self --check --json
  → baseline ile AYNI: bundle/ownership-stale, checksPassed 9/10
```

## Açık noktalar
- `release-package-gates.test.mjs` ZIP farkı: "bilinen" — release/ZIP-freshness fazının işi (CONTRIBUTING "ZIP freshness"), aksiyon gerekmez.
- Viewer hâlâ tek seviyeye kilitli (Faz 2 kapsamı) — brief'te beklenen.
- Toplam bayt bütçesi (plan §7'de bahsi geçen) uygulanmadı — brief zorunlu kılmamıştı, astra da "zorunlu madde değil" dedi.
- `docs/decisions/identity-map-2026-09-09.md`, `docs/plans/nested-drilldown-2026-09-12.md` kasıtlı değiştirilmedi (tarihsel kayıt, brief listesinde yok).

## BLOKLAYAN
Yok. Tam kabul koşusunu Fable koşacak (bu turda yalnız hedefli dosyalar koşuldu, talimat gereği).

## Fable kabul koşuları
- Review-1 sonrası (`faz1-tests-final.log`): 1504 test / 1498 pass / 1 fail (yalnız `archify.zip` tazelik, bilinen) / 5 skip.
- Astra tur-2 düzeltmeleri sonrası (`faz1-tests-final2.log`): 1 fail (aynı ZIP tazelik) / 5 skip — yeni regresyon yok.
- Astra tur-2 hükmü (`docs/plans/reviews/faz1-astra-2-2026-09-12.md`): DÜZELTMEYLE KABUL; açık kalan 4 madde sahiplik sidecar'ı sertleştirme (kimlik dosya adından, `parent.map`↔gezilen ebeveyn bağı, şema hatasında dalı kesme, kök `null` sidecar). Karar kullanıcıda: tur-3 mü, "bilinen sınır" olarak Faz 2'ye mi.
