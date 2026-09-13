# Faz 0 — Baseline Raporu (2026-09-12)

## Ortam
- Repo `/home/ubuntu/repos/archify`, dal `feat/nested-drilldown`, HEAD `cc1b33a` (doğrulandı). `git status --short`: yalnız `?? docs/plans/` (bu görevin brief/rapor dizini), repo temiz.
- node v22.23.2, npm 10.9.8, Chrome `/usr/bin/google-chrome` (150.0.7871.46, `which google-chrome` ile bulundu; Playwright cache'inde `chromium-1228/1243` da var, kullanılmadı).
- Tespit mantığı: `bin/visual-check.mjs::findChrome({env,platform})` önce `ARCHIFY_CHROME` env'e bakar, yoksa platform varsayılanları + PATH'te `google-chrome(-stable)`/`chromium(-browser)` arar; `test/helpers/desktop-browser.mjs` bu yolu kullanır. Testler için `ARCHIFY_CHROME=/usr/bin/google-chrome` sadece komut ömrü boyunca set edildi.

## Komutlar
`git status/log` doğrulandı → Chrome tespiti → `npm ci` (10 paket, sorunsuz, 2 high-sev audit uyarısı dokunulmadı) → `ARCHIFY_CHROME=... npm test` (log: `docs/plans/reports/faz0-npm-test.log`, ~1274.6 sn) → `node bin/archify.mjs bundle ../docs/cases/archify-self --check --json`.

## npm test sonucu
```
# tests 1578  # pass 1571  # fail 2  # skipped 5  # duration_ms 1274607  exit=1
```

## FAIL (2)
1. `test/motion-governor-browser.test.mjs` (dosya bütünü) — `not ok 64`, `signal: SIGTERM`, `duration_ms: 968667` (~16 dk). İlk 2 alt-test geçti (7.5s, 2s), sonrasında asılıp dış zaman aşımıyla öldürülmüş görünüyor (`error: 'test failed'`, `code: ERR_TEST_FAILURE`, stack/assertion yok).
2. `test/update-notifier.test.mjs:1951` "an empty precheck snapshot cannot start a second concurrent network request": `AssertionError: expected 'update_available', actual 'silent'` (stack: `update-notifier.test.mjs:1976:10`).

Düzeltilmedi (brief gereği salt okunur).

## SKIP (5)
| # | Test | Neden |
|---|---|---|
| 941 | MCO artifacts byte-reproducible | `ARCHIFY_MCO_REPO_ROOT` yok (pinned mco-org/mco klonu gerekli) |
| 998 | archive build rejects non-canonical Node | Sadece Node major≠22'de koşar |
| 1000 | archive build Windows-style paths | Sadece win32'de anlamlı |
| 1137 | custom site builders emit shared site asset | `site-language-continuity.test.mjs`: `ARCHIFY_SITE_INTEGRATION=1` gerekli, set edilmedi |
| 1142 | real Chrome preserves language... | Aynı dosyada `chromePath`, `ARCHIFY_SITE_INTEGRATION=1` VE `ARCHIFY_CHROME` ikisini birden ister; bu turda sadece Chrome set edildi → yine skip |

## bundle --check --json (self-map)
exit=2, beklenen `bundle/ownership-stale` ile eşleşti:
```json
{"ok": false, "command": "bundle", "action": "check",
 "error": "Diagram bundle failed validation: bundle/ownership-stale: ownership sidecar sha256 does not match the manifest.",
 "diagnostics": [{"code": "bundle/invalid", "evidence": {"checksPassed": 9, "checkCount": 10}}]}
```

## Anormallikler
- `motion-governor-browser.test.mjs` ~16 dk sonra SIGTERM ile kesildi — dosya-seviyesi timeout/asılma şüphesi, kök neden bu fazda araştırılmadı.
- `update-notifier.test.mjs:1951` mantık hatası (silent vs update_available) — kök neden araştırılmadı.
- Repo dışında dosya değişmedi, commit yapılmadı, `npm ci` dışında paket kurulmadı, AIWorkspace'e dokunulmadı.

## Fable review eki (2026-09-12)
- SIGTERM dış timeout değil, Fable müdahalesi: çocuk süreç ~16 dk 0% CPU ile CDP navigasyonu beklerken sonlandırıldı (`faz0-intervention.log`). Tek başına 180 s tavanla yeniden koşuldu: exit 124, hiç `ok` yok → **bu hostta deterministik takılma** (`faz0-motion-rerun.log`). Bakımcının PR #367 notundaki "real file reload" sorunuyla aynı bölge; kapsam dışı.
- `update-notifier.test.mjs` tek başına: 87 test, 85 pass, 2 fail (1951 + "last-good notice remains acknowledgeable…") → zamanlamaya duyarlı; skill güncelleme kontrolü, kapsam dışı.
- **Faz 1+ kabul kuralı:** bu iki dosya bilinen-kötü; `npm test` karşılaştırması bunlar hariç 1576 testin tamamı geçmeli, yeni testler dahil. Chrome testleri `ARCHIFY_CHROME=/usr/bin/google-chrome` ile koşulur.
