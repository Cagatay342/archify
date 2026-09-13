# Faz 4 — AIWorkspace pilotu: iç içe (3 seviye) diyagram paketi (2026-09-13)

Uygulayıcı: Sonnet. Fork `/home/ubuntu/repos/archify` DOKUNULMADI (yalnız CLI). Hedef
`/home/ubuntu/repos/AIWorkspace` dal `main`, commit YOK; başka oturumun commitsiz dosyalarına
(`agent-runners/…`, `scripts/model-bench/…`, `docs/research/…`) dokunulmadı.

## Dönüşüm tablosu kararları

Kökler (kısa dosya adı = bundle id, tip eki yok): `aiworkspace-runtime`←`…runtime.architecture.json`
(entry); `crewai-engine`←`…ic-mimari…`; `orkestrasyon-kosusu`←`…kosusu.workflow.json`;
`model-ve-arac`←`…katmani…`; `bilgi-ve-veri`←`…katmani…`; `arayuz-otomasyon-gozlem`← aynı isimli.

**L0 sadeleştirme 14→12** (Fable review sonrası DÜZELTİLDİ): `providers`→`litellm` ("LiteLLM →
sağlayıcılar"). İlk denemede ikinci çift `codeexec`→`mcpo` idi; bu `aistack-executor-net`
boundary'sini (yalnız `codeexec`'i sarıyordu, mcpo o ağda DEĞİL) tamamen boşaltıp sessizce
siliyordu — yanlış ağ iddiası, DÜZELTİLDİ. Yeni kural (script+README): birleşme hiçbir güven
sınırını kaldıramaz; `applyL0Merges` bunu invariant olarak uyguluyor (boşalan boundary → hata).
Yeni ikinci çift: `obs`→`ui` ("Arayüzler · gözlem"; `ui→arayuz-otomasyon-gozlem` çocuğu
observability'yi zaten ayrıntılandırıyor, obs'un boundary'si yok). `codeexec` KALIR (kanonikteki
gibi ayrı bileşen + `aistack-executor-net`, compose:743/783). `sources` tavanı 3 olduğundan
(`ui`+`obs` ham birleşimi 6) `obs→ui` sources'ı curation edildi: openwebui+admin-panel+grafana.
Kendine-döngü `litellm-providers` silindi; `cli-providers` (cli→litellm) yeniden yönlendirildi
(`fromSide:top`,`toSide:right`, eski ipuçları komşularla 0px çakışıyordu, 3. denemede bulundu).
`meta.views[].focus`'tan kaldırılan id'ler süzüldü.

**Drilldown kenarları**: L0 `engine`→`crewai-engine`, `litellm`→`model-ve-arac`,
`data`→`bilgi-ve-veri`, `ui`→`arayuz-otomasyon-gozlem`; L1 `crewai-engine.core`→
`orkestrasyon-kosusu` (workflow torun). Ownership sidecar yok (bilinçli, bkz. "sonraki iş").

**Manifest özeti**: `max_depth: 3`, entry `aiworkspace-runtime`. Node sayıları:
`aiworkspace-runtime` L0/12, `crewai-engine` L1/12, `model-ve-arac` L1/12, `bilgi-ve-veri` L1/12,
`arayuz-otomasyon-gozlem` L1/11, `orkestrasyon-kosusu` L2 workflow/11. 5 `drilldowns[]` satırı.

## bundle --check / visual-check

`node scripts/diagrams-nested.mjs`: `bundle` yazımı **10/10 check PASS**; `bundle --check` →
**PASS** (10/10); 6 diyagramın hepsi `visual-check` **PASS** (1440×900 + 2048×1320, açık+koyu) —
taşma yok, okunabilirlik eşiği geçildi. Script idempotent; `--check` hiçbir dosya üretmeden
doğrular; iki art arda tam koşu aynı sonucu verdi.

## Chrome kanıtı

Gerçek headless Chrome, CDP, yerel HTTP (`file://` 3-seviye iframe erişimini engeller — fork'un
`drilldown-nested-browser.test.mjs` deseniyle aynı). Script `scratchpad/f4/evidence.mjs` (tek
seferlik). PNG'ler: `AIWorkspace/docs/diagrams/nested/.evidence/` (gitignore'lu, 7 dosya).

1. **3 seviye descend + kök breadcrumb**: `descend('engine')`→ACK→open; child'da
   `descend('core')`→ACK→open. Torun kimliği doğru: `data-bundle-nested=true`, `-depth=2`,
   `role=child`, `bundle-id=orkestrasyon-kosusu`. Kök breadcrumb tek zincir 3 rung —
   "AIWorkspace Runtime Mimarisi › crewai-engine › Orkestratör çekirdeği · Orkestrasyon
   Koşusu…". PNG `01…04`.
2. **Esc ×2**: gerçek CDP `Escape`. 1. basış yalnız torunu kapattı (kök hâlâ open); `back()`
   odağı çocuk iframe içine taşıdığından (bilinen faz2 CDP/odak kısıtı) 2. basıştan önce üst
   pencereye gerçek odak geri verildi; 2. basış kökün çocuğunu kapattı (`iframe[src]` kalktı).
   PNG `05`,`06`.
3. **Z + wheel opt-in dalış**: `Z`→`enabled()===true`, `capable===true`. Gerçek wheel "engine"
   düğümünü scale=3'e (tavan) çıkardı; kameranın settle olayı (`transitioning:false`) doğru
   zamanda gözlendi. İZOLE tekrarda (taze sayfa) aynı teknik güvenilir tetikledi
   (`debug-settle.mjs`); 3 seviye descend + Esc×2 SONRASI aynı dokümanda tetiklenmedi, ön
   koşullar izole başarıyla aynı olsa da. Kök neden kesin izole edilemedi (aday: `dive.js`
   `watchOwnAscend()`'in `diveLock`/`rearmed` kilidi, sentetik-olay zamanlamasında tam
   temizlenmemiş olabilir) — muhtemelen Esc-odak kısıtıyla aynı sınıftan bir CDP/senkron-olay
   artığı, viewer'da kanıtlanmış hata değil (fork'un kendi 7 testinde izole kanıtlı, faz3b
   raporu). **BLOKLAYAN DEĞİL, kayda geçti.** PNG `07` (dürüst durum).

## AIWorkspace'te değişen/eklenen dosyalar

Yeni: `scripts/diagrams-nested.mjs` (idempotent, `--check`); `docs/diagrams/nested/` (6×json+html
+ manifest.json + `.evidence/`, gitignore'lu). Değişen: `docs/diagrams/README.md` ("İç içe
paket"); `docs/diagrams/index.html` (paket kartı); `.gitignore` (nested visual-check + evidence).
Kanonik `docs/diagrams/*.json|*.html` DEĞİŞMEDİ. Fork DEĞİŞMEDİ. Commit YOK.

**BLOKLAYAN'lar**: Yok. (Madde 3'teki zoom-dalış otomasyon notu BLOKLAYAN DEĞİL, kayda geçti.)

## Sonraki iş

- Ownership/locate: sidecar yok; ayrı turda `<id>.ownership.json` + `archify locate --bundle`.
- Kurulu skille taşıma: `~/.claude/skills/archify` (2.16) `drilldown` tanımıyor; fork mainline'a alınınca `ARCHIFY_BIN` skill yoluna çevrilebilir.
- L0 birleşmesi yalnız türetilmiş pakette; kanonik 14 bileşenle KALDI — istenirse taşınabilir.

## Tur 2 (astra `faz4-astra-1-2026-09-13.md`, hüküm DÜZELTMEYLE KABUL — tüm P1/P2 uygulandı)

**P1-1/P1-2 — `--check` artık gerçekten salt-okunur.** Üç ayrı mod: (varsayılan) TAM ÜRETİM —
derive → deliver (spec kanonikten türetilenle bayt-aynıysa VE html zaten varsa atlanır,
idempotent) → `bundle` → `bundle --check` → `visual-check` (varsayılan açık), hepsi
`docs/diagrams/.nested.building/` geçici dizininde üretilir, hepsi geçmeden `nested/`e
DOKUNULMAZ (ilk hatada durur, kısmi paket bırakmaz — P2-2). `--check`: (a) kanonikten bellekte
yeniden türetip `nested/*.json` ile bayt karşılaştırır (bayatlık kapısı — kanonik değişip paket
unutulursa hangi dosyanın bayat olduğunu adıyla söyler), (b) `bundle --check`; temizleme/deliver/
visual-check YOK. `--visual`: yalnız mevcut `nested/*.html` üzerinde `visual-check`, sonra kendi
ürettiği artıkları temizler. Bilinmeyen argüman reddedilir (exit 2); fork `package.json` sürümü
(≥2.17.0-dev.1) ve `bundle` alt komutunun varlığı önkontrol edilir. Doğrulandı: tamperlenmiş bir
`nested/*.json` ile `--check` doğru şekilde FAIL verdi (dosya adıyla), orijinal geri konunca PASS'e
döndü; `--check` sırasında hiçbir dosyanın mtime'ı değişmedi.

**P1-3 — Boundary korunumu üyelik eşitliğine sıkılaştırıldı.** `validateMergeBoundaries()` artık
"boşalan boundary" yerine emilen/hedef boundary KÜMELERİNİN TAM EŞİT olmasını istiyor (kısmi kayıp
da yakalanır), her merge'den ÖNCE kanonik spec üzerinden kontrol edilir; eşit değilse hata (DUR).
`n8n→ui` ve `obs→ui` doğrulandı: üçü de kanonikte YALNIZ "Docker host (WSL2) · aistack-*" boundary'sinde
— kümeler eşit, kural GEÇTİ.

**P1-4 — Dış/iç sağlayıcı karışıklığı düzeltildi.** `providers`→`litellm` GERİ ALINDI: `providers`
dış (boundary'siz), `litellm` Docker host kutusunun içinde — birleşim dışarıyı host kutusuna
emip `cli→litellm` OAuth okunu (aslında CLI→sağlayıcı doğrudan) yanlış izlenimle gösteriyordu.
Yeni ikinci çift: `n8n→ui` (ilki `obs→ui` ile birlikte). Sonuç L0 = users, gateway, plane, engine,
cli, github, litellm, providers, data, mcpo, codeexec, ui(+n8n+obs) = 12; `litellm-providers`
(API-key) ve `cli-providers` (abonelik OAuth) okları AYNEN korundu (artık remap yok). `n8n-engine`
→ `ui-engine` oldu; engine'in dört kenarı da zaten dolu olduğundan (top=litellm, bottom=data+mcpo,
left=plane, right=cli) yeni kenarın rotası/label'ı 7 denemede bulundu: `route:'orthogonal-v'`
(tam otomatik kenar seçimi) + `engine-data`nın "SQL · Redis" etiketine `labelDx:-30` (yalnız bu
türetilmiş kopyada, kanonik değişmedi) kalan 3px'lik çakışmayı giderdi.

**P2-1 — Sources curation otomatikleşti.** Elle sabit satırlar yerine `curateSources()`:
[hedef, emilen1, emilen2, …] sırasıyla round-robin, her listenin bir sonraki kanıtı şema tavanına
(3) kadar. `ui`(+n8n+obs) için sonuç: openwebui(877) + n8n-compose(463) + loki(267) — üç ayrı
bileşenin İLK kanıtı, kanonik satırlar kayınca otomatik izler.

**P2-2 — Hata yolları.** İlk hatada durur (deliver/bundle/visual-check hepsi), kısmi paket
`nested/`e asla yazılmaz (geçici dizin + atomik `rename`); `.evidence/` (bu script'in yönetmediği
elle-üretilmiş Chrome kanıtı) her yayımda korunur. Doğrulandı: kasıtlı bir routing hatasıyla
`deliver` başarısız kılındığında `nested/` DEĞİŞMEDİ, geçici dizin temizlendi.

**P2-3 — Belgeler düzeltildi.** `index.html`: "tek dosyalık" → "çok dosyalı"; kart içindeki geçersiz
iç-içe `<a>` kaldırıldı (README bağlantısı karttan ÇIKARILDI, kardeş `<p>`). `README.md`: çıkış
yönü "dıştan içe" (yanlıştı) → "içten dışa" (doğru: en içteki önce kapanır); L1 çocuklar "ilgili
katman detayı (ebeveyn kutusundan geniş bağlam)" olarak anlatıldı.

**P2-4 — Zoom-dalış kanıtı TAMAMLANDI.** Kök neden bulundu: `dive.js`'in `watchOwnAscend()`'i bir
ascend'de `diveLock=true;rearmed=false` yazıyor; kilit ancak (a) scale<2.5 görülmüş + en az 400ms
sessizlik + YENİ bir jest, VEYA (b) herhangi bir keydown ile kalkıyor. Tur 1'in denemesi Esc'ten
sonra yeterli sessizlik bırakmadan wheel'e başlıyordu. Düzeltme: Esc#2'den sonra 600ms sessizlik →
`Z` → 600ms daha sessizlik → SONRA wheel jesti. Sonuç: TAM 3-seviye gezinme + Esc×2 SONRASI aynı
kökte `Z`+wheel dalışı İLK turda tetiklendi (`state: open`). PNG `07-zoom-dive-triggered.png`
(önceki "tetiklenmedi" PNG'si değiştirildi). Fork'a istek YOK — sorun otomasyon tekniğindeydi,
viewer kodu baştan doğruydu.

**Tam üretim (Tur 2 sonrası)**: `node scripts/diagrams-nested.mjs` → `bundle` 10/10, `bundle --check`
PASS, 6/6 `visual-check` PASS, yayım ok. `--check` (temiz nested/ üzerinde): bayatlık kapısı PASS,
`bundle --check` PASS. BLOKLAYAN yok.

## Tur 3 (astra `faz4-astra-2-2026-09-13.md`, dar/son — P1/P2-1/P2-3 KAPANDI, kalan 3 madde)

Atomik yayım düzeltildi: `rmSync`+`rename` (atomik değildi, regresyon: rename hatasında eski paket
kaybolup "DEĞİŞTİRİLMEDİ" deniyordu) → `rename(nested→.prev-<ts>)`+`rename(tmp→nested)`, hata
enjeksiyon testiyle (`DIAGRAMS_NESTED_TEST_FAULT_RENAME=1`) doğrulandı: eski paket MD5-bayt-aynı
korundu, sıfır leftover dizin, doğru hata mesajı, exit 1; normal koşu ve `--check` sonrasında da
temiz PASS. Fork sürümü artık her koşuda yazdırılıyor + tam-eşitlik pinlenip farklı sürümde uyarı
veriyor (`2.17.0-dev.1`). `visualCheckDir` ilk FAIL'de durur (hepsini denemek yerine).

## Tur 4 (astra `faz4-astra-3-2026-09-13.md`, son — kapanış koşulları)

Sürüm pini SERT hataya çevrildi (farklıysa durur, `--allow-version-mismatch` ile bilinçli bypass).
Üretici kilidi eklendi (`docs/diagrams/.nested.lock`, O_EXCL, PID+zaman; bayat kilit — ölü PID —
otomatik devralınır); geçici dizin artık koşuya özel (`.nested.building-<pid>-<ts>`). Script
başında `nested/` yok + tek `.nested.prev-*` varsa otomatik kurtarma (log satırıyla); birden
fazlaysa hata + elle-karar komutu. `.evidence/` kopyası artık iki rename ARASINDA (yayım anında,
mümkün olan en geç an) yapılıyor — build süresince eklenen dosyaların kaybolma penceresi kapandı.

Kanıt (üçü de bu turda gerçek koşularla doğrulandı):
- **Hata enjeksiyonu**: `DIAGRAMS_NESTED_TEST_FAULT_RENAME=1` → eski paket MD5-bayt-aynı korundu, sıfır leftover, exit 1.
- **Çift koşu**: gerçek iki eşzamanlı `node` süreci — ilki yayımladı (exit 0), ikincisi ANINDA "başka koşu var (PID …)" ile durdu (exit 1, hiçbir dosyaya dokunmadan); ayrı testte ölü-PID'li bayat kilit otomatik devralındı.
- **Yapay kesinti**: `nested/` → `.nested.prev-9999999999999` olarak taşınıp `nested/` yokken `--check` doğru FAIL verdi (salt-okunur, kendi kendine onarmadı), tam üretim ise `[kurtarma]` log satırıyla otomatik geri yükleyip idempotent şekilde yeniden yayımladı (içerik MD5-aynı).

P2-4: 07-zoom-dive-triggered.png Fable tarafından doğrulandı — astra'nın salt-okunur incelemesi
`.evidence/` içeriğini (untracked/gitignore'lu, git diff kapsamı dışı) kopyasında görmüyor; PNG
çalışma ağacında gerçek ve tekrar-üretilebilir.

Tam üretim + `--check`: temiz `nested/` üzerinde PASS. BLOKLAYAN yok. Kanonik/fork DEĞİŞMEDİ, commit yok.
