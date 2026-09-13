# Faz 0 brief — baseline (Sonnet)

Repo: /home/ubuntu/repos/archify, dal `feat/nested-drilldown` (HEAD cc1b33a). SALT OKUNUR faz: rapor dosyası dışında hiçbir dosya değiştirme, commit yok, yeni paket kurma yok (yalnız `npm ci` lockfile'dan), sistem paketi kurma yok, /home/ubuntu/repos/AIWorkspace'e dokunma.

Yapılacaklar:
1. `git -C /home/ubuntu/repos/archify status --short && git log --oneline -1` — dal/HEAD doğrula.
2. Chrome tespiti: `archify/test/helpers/desktop-browser.mjs` ve `archify/bin/visual-check.mjs` Chrome'u nasıl buluyor (env adı, varsayılan yollar)? Host'ta aday binary'ler: `which google-chrome chromium chromium-browser`, `ls ~/.cache/ms-playwright/*/chrome-linux/chrome`, `ls /root/.cache/ms-playwright 2>/dev/null`. Bulursan env'i o komut için set et (`ARCHIFY_CHROME=<yol>`), kalıcı değişiklik yapma.
3. `cd /home/ubuntu/repos/archify/archify && npm ci` sonra `npm test` (süre ölç; 20 dk üstü sürerse bekle, `timeout 3000`). Toplam/pass/fail/skip ve skip nedenlerini (hangi dosyalar, neden — Chrome yok mu?) topla. FAIL varsa tam metnini rapora koy, düzeltmeye KALKMA.
4. `node bin/archify.mjs bundle ../docs/cases/archify-self --check --json | head -c 800` — hata kodunu kaydet (beklenen: bundle/ownership-stale).
5. Rapor: `/home/ubuntu/repos/archify/docs/plans/reports/faz0-baseline-2026-09-12.md`, Türkçe, ≤60 satır: ortam (node, chrome yolu/yok), komutlar, sayılar, skip listesi + neden, self-map sonucu, anormallikler. Rapor dışında dosya yazma.
Bitince son mesajında raporun yolunu ve 5 satırlık özetini ver.
