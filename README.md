# Naše kuchyně

Jedna aplikace na recepty, jídelníček a nákupní seznam. Běží v jednom Docker kontejneru na NASu a mají k ní přístup oba (bez účtů, všechno je sdílené).

- **Recepty:** hlavní jídla a dezerty, fotky (automaticky se zmenší na 1200 px), suroviny, postup, poznámky, přepočet porcí.
- **Jídelníček:** stálá šablona 4 týdnů (Po–Pá), týdny se střídají samy, jídla se mění jen ručně. Víkendová jídla jsou seznam 12 jídel, ze kterého se vybírá na sobotu a neděli.
- **Nákup:** suroviny z receptu, týdne nebo víkendu se přidají jedním klepnutím. Stejné suroviny se sečtou (g↔kg, ml↔l) a seřadí podle kategorií obchodu.
- **Číselník surovin:** každá surovina je jen jednou a má svou kategorii. Nové suroviny se zařadí samy (a dá se to změnit). Duplicity jde sloučit v Nastavení.

## Co je na NASu

```
/volume2/docker/kuchyne/
├── compose.yaml
└── data/
    ├── kuchyne.db      ← recepty, jídelníček, nákup, suroviny (SQLite)
    └── fotky/          ← zmenšené fotky
```

Jednou za 30 dní se `data/` zkopíruje do složky `/backup` (na RAID 1) a drží se posledních 6 záloh.

## Nasazení

### 1. Kód na GitHub
1. Na GitHubu založte repozitář `kuchyne` (může být soukromý).
2. Nahrajte do něj obsah této složky a pushněte do větve `main`.
3. GitHub Action **Build image** spustí testy a sestaví image `ghcr.io/<váš-účet>/kuchyne:latest`. Průběh uvidíte v záložce *Actions*.
4. Image je po vytvoření soukromý. Máte dvě možnosti:
   - **Jednodušší:** GitHub → váš profil → *Packages* → `kuchyne` → *Package settings* → *Change visibility* → **Public**. V image nejsou žádná hesla ani data, jen kód aplikace.
   - **Nechat soukromý:** na NASu se jednou přihlaste `docker login ghcr.io` (uživatel = GitHub účet, heslo = Personal access token s právem `read:packages`).

### 2. Spuštění na NASu
1. Na SSD svazku vytvořte složku `docker/kuchyne` a do ní nahrajte `compose.yaml`.
2. V `compose.yaml` přepište `VLASTNIK` na svůj GitHub účet (malými písmeny) a upravte cestu k záloze (složka na RAID 1, musí existovat).
3. Spusťte projekt:
   - **přes UGOS:** Docker → Projekty → Vytvořit → zvolit složku `docker/kuchyne`, nebo
   - **přes SSH:**
     ```bash
     cd /volume2/docker/kuchyne
     docker compose up -d
     ```
4. Aplikace běží na `http://IP-NASu:3100`, přes Tailscale na `http://<tailscale-jméno-nasu>:3100`.
5. V telefonu ji otevřete v prohlížeči a dejte **Přidat na plochu**. Bude se chovat jako aplikace.

> Aplikace nemá přihlašování, proto ji **nevystavujte do internetu** (žádné přesměrování portů). Přístup jen doma a přes Tailscale.

### 3. Aktualizace
Po každém pushi do `main` se sestaví nový image. Na NASu pak stačí:
```bash
cd /volume2/docker/kuchyne
docker compose pull && docker compose up -d
```
(v UGOS: Projekt → Aktualizovat / Znovu sestavit)

### 4. Vypnutí Raspberry Pi
Až nová aplikace poběží (staré recepty zadáte ručně):
```bash
# na RPi – ve složce každé staré appky
cd ~/receptar && docker compose down -v
cd ~/nakupni-seznam && docker compose down -v
sudo shutdown now
```
`-v` smaže i stará data. Pokud si je chcete ještě nechat, vynechte ho.

## Obnova ze zálohy
```bash
cd /volume2/docker/kuchyne
docker compose down
cp -r data data-stara                     # pro jistotu
cp /volume1/…/Zalohy/kuchyne/kuchyne-2026-11-10/kuchyne.db data/
cp -r /volume1/…/Zalohy/kuchyne/kuchyne-2026-11-10/fotky data/
docker compose up -d
```

## Nastavení (proměnné prostředí)
| Proměnná | Výchozí | Význam |
|---|---|---|
| `PORT` | 3000 | port uvnitř kontejneru |
| `DATA_DIR` | /data | databáze a fotky |
| `BACKUP_DIR` | – | kam zálohovat (bez něj se nezálohuje) |
| `BACKUP_EVERY_DAYS` | 30 | jak často |
| `BACKUP_KEEP` | 6 | kolik záloh držet |
| `PHOTO_MAX_PX` | 1200 | delší strana fotky |
| `TZ` | Europe/Prague | časové pásmo (kvůli střídání týdnů) |

## Vývoj na počítači
```bash
cd server && npm install && npm run dev      # API na :3000, data v ../data
cd web && npm install && npm run dev         # frontend na :5173 (proxy na API)
cd server && npm test                        # testy slučování surovin, kategorií, jednotek
```

Struktura: `server/` (Node 22 + Express + SQLite), `web/` (React + Vite), `Dockerfile` sestaví obojí do jednoho image.
