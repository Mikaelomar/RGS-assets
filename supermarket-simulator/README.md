# Supermarket Life Simulator 🛒

Ensimmäisen persoonan kauppasimulaattori Androidille ja iPhonelle. Aloitat pienestä kulmakaupasta ja kasvatat sen valtavaksi hypermarketiksi (tasot 1–500). Pelin kaikki tekstit ovat englanniksi.

*English summary at the bottom.*

---

## Mitä pelissä on

- **Oikea kauppa 3D:nä**: katu, autot, jalankulkijat, kauniit talot, päivä- ja yöaika, sade.
- **Itse tehtävä työ**: nosta laatikoita, kanna niitä, täytä hyllyt tuote kerrallaan (pidä ✋ pohjassa täyttääksesi nopeasti), heitä tyhjät laatikot roskiin tai kierrätykseen.
- **130 tuotetta** omilla 3D-malleilla ja etiketeillä (hedelmät, leipä, maito, pakasteet, liha, kala, juomat, pesuaineet, olut, lelut…). Tuoretuotteilla on viimeinen käyttöpäivä.
- **Tilaukset tietokoneelta** (Market): kuorma-auto tuo laatikot lastauspaikalle (myöhemmin lavalla + haarukkavaunu). Myös kalusteet tulevat pahvilaatikossa ja kootaan itse. Joskus toimittaja lähettää väärän tuotteen tai osa tuotteista on rikki – ne hyvitetään.
- **Hinnoittelu**: katso hintalappua ja muuta hintaa. Liian kalliit tuotteet jäävät myymättä, tarjoukset (-10…-50 %) tuovat asiakkaita.
- **Asiakkaat**: ostoslistat, budjetit, korit ja kärryt, kuponit, reagoivat tyhjiin hyllyihin, hintoihin, likaan, jonoihin, rikkinäisiin laitteisiin ja vanhentuneisiin tuotteisiin. Kirjoittavat arvosteluja. Tyytymättömät tulevat valittamaan sinulle (anna lahjakortti, pyydä anteeksi tai käännytä). Myös myymälävarkaita.
- **Kassa**: skannaa tuotteet hihnalta (piippaus), kortti (näppäile summa maksupäätteeseen) tai käteinen (anna oikea vaihtoraha → tippiä), kuitti tulostuu. Tuotepalautukset (hyvitä tai kieltäydy). Itsepalvelukassat.
- **Työntekijät** (tasosta 5): kassat, hyllyttäjät, siivoojat, varastotyöntekijät, vartijat, huoltoteknikot, leipurit, lihamestarit, osastopäälliköt ja myymäläpäällikkö (tilaa automaattisesti). Työvuorot, palkat, energia, tauot taukohuoneessa, pukuhuone, WC, koulutus, ylennys, irtisanominen.
- **Tilat**: varasto + hyllyt, toimisto (kassakaappi), taukohuone (kahvi, välipalat, sohva), pukuhuone, henkilökunnan WC, asiakas-WC, sähkö- ja huoltotila (sulaketaulu, ilmastointi), roska- ja kierrätyshuone (paalain), jäteastia.
- **Siivous**: lattia likaantuu asiakkaiden mukana, läikät, roskat, täydet roskikset, likaiset WC:t ja kylmäkaappien lasit. Moppi 🧹 ja lattianpesukone.
- **Sähkö ja kylmälaitteet**: kaapit kuluttavat sähköä, lämpötilat seurataan, rikkinäinen kaappi lämpenee ja ruoka pilaantuu, sähkökatkot ja ylikuormitus (palautus sulaketaululta).
- **Yllätykset**: juhlapäivät (paljon asiakkaita), helleaalto, pakkanen, putkivuoto, sähkökatko, tuotteen takaisinveto, terveystarkastus, myöhästynyt rekka, sairastunut työntekijä.
- **Talous**: myynti, ostot, palkat, vuokra, sähkö, vesi, vakuutus, korot, viikoittaiset verot, laina, konkurssi. Päivän yhteenveto, historiakaavio, 7 ja 28 päivän tulos sekä varaston arvo.
- **Kasvu**: 12 laajennusta (Corner Shop → Small → Medium → Large Supermarket → Hypermarket → Mega Hypermarket) – rakentaminen maksaa ja kestää muutaman pelitunnin, luvat tuoteryhmille, 20 päivitystä (LED-valot, aurinkopaneelit, generaattori, lastauslaituri…).
- **Julisteet ja mainosbannerit**: 12 erilaista (tasoilla 3–500 avautuvia), parantavat asiakkaiden viihtyvyyttä.
- **Tasot 1–500** palkintoineen ja titteleineen.
- **Päivä ja yö**: avaa kauppa kyltistä kun olet valmis, sulje illalla, tee yötyöt ja päätä päivä 🌙.
- **Tallennus**: automaattitallennus + 3 tallennuspaikkaa.
- **Mainokset (AdMob)**: välimainokset vain luonnollisissa tauoissa (esim. päivän lopussa, ostosten jälkeen, tason noustessa), oletuksena **enintään 10 tunnissa**. Lisäksi vapaaehtoiset palkintomainokset (+raha, +energia, pikatoimitus, päivän bonus).

## Ohjaus

| Puhelin | Tietokone |
|---|---|
| Vasen puoli: joystick (kävely) | WASD / nuolet |
| Oikea puoli: vedä katsoaksesi | Hiiri (klikkaa peliä) |
| ✋ = käytä / poimi / aseta (pidä pohjassa = toista) | E tai hiiren vasen |
| ⤵️ = laske laatikko maahan | Q tai hiiren oikea |
| 🏃 = juoksu päälle/pois | Shift |
| 📱 = kaupan hallinta / tilaukset | Tab |
| 🏗️ = siirrä kalusteita | B (R = kierrä) |
| ⚙️ = tauko, tallennus, asetukset | Esc |

## Testiversion asennus Android-puhelimeen

1. Lataa `SupermarketLife-...apk` puhelimeen (tai GitHubin *Actions → Supermarket Life - Android build → Artifacts*).
2. Avaa tiedosto. Jos puhelin kysyy, salli **"Asenna tuntemattomista lähteistä"** selaimelle/tiedostoille.
3. Asenna ja avaa **Supermarket Life**.

> Testiversiossa näkyvät Googlen **testimainokset**. Oikeat mainostulot tulevat vasta, kun omat AdMob-tunnukset on vaihdettu (ks. alla).

## Oma build

Tarvitset: Node.js 22+, Java 21 ja Android SDK (Android Studio).

```bash
cd supermarket-simulator
npm install
npm run dev            # pelaa selaimessa: http://localhost:5173
npm run android:apk    # tekee APK:n -> android/app/build/outputs/apk/debug/app-debug.apk
```

GitHub rakentaa APK:n automaattisesti jokaisesta muutoksesta (`.github/workflows/supermarket-android.yml`).

## Rahan tienaaminen mainoksilla (AdMob)

1. Luo tili: <https://admob.google.com> → **Apps → Add app** (Android, myöhemmin iOS).
2. Luo sovellukselle mainosyksiköt: **Interstitial** ja **Rewarded**.
3. Vaihda tunnukset:
   - `src/data/config.ts` → `ADS.android` / `ADS.ios` (appId, interstitial, rewarded) ja aseta `testing: false`
   - `android/app/src/main/res/values/strings.xml` → `admob_app_id`
   - `ios/App/App/Info.plist` → `GADApplicationIdentifier`
4. AdMobissa: **Privacy & messaging → GDPR-viesti** (pakollinen EU:ssa / Suomessa). Peli näyttää suostumusikkunan automaattisesti.
5. Lisää kehittäjäsivullesi `app-ads.txt` (AdMob näyttää rivin).
6. Mainosten tiheys: `src/data/config.ts`:
   - `interstitialsPerHour: 10` ja `minSecondsBetween: 360` (= max 10 välimainosta tunnissa)
   - `firstAdAfterSeconds`, `countdownSeconds` ("Ad break in 3…")

> ⚠️ Googlen sääntöjen mukaan välimainos ei saa keskeyttää pelaamista yllättäen. Siksi peli näyttää niitä vain taukokohdissa (päivän lopetus, tilauksen jälkeen, tason nousu, laajennus). Liian tiheät mainokset voivat johtaa AdMob-tilin rajoituksiin – 10/h on jo paljon.

## Julkaisu Google Playhin

1. Google Play Console -tili (kertamaksu 25 $).
2. Vaihda `capacitor.config.ts` + `android/app/build.gradle` → `applicationId` omaksi (esim. `fi.sinunnimi.supermarket`).
3. Tee allekirjoitusavain (säilytä se ja salasanat tarkasti, ilman sitä et voi päivittää peliä!):
   ```bash
   keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias supermarket
   ```
   Luo `android/keystore.properties` (ei mene gitiin):
   ```
   storeFile=../release.jks
   storePassword=SALASANA
   keyAlias=supermarket
   keyPassword=SALASANA
   ```
4. `npm run android:bundle` → `android/app/build/outputs/bundle/release/app-release.aab` → lataa Play Consoleen.
5. Täytä Play Consolessa: tietosuojaseloste (mainokset!), Data safety (Advertising ID), ikäluokitus, kuvakaappaukset.

## iPhone (App Store)

iOS-version kääntäminen vaatii **Macin ja Xcoden** sekä Apple Developer -tilin (99 $/vuosi).

```bash
npm install
npm run ios:open     # build + avaa Xcode
```
Xcodessa: valitse oma *Team* (Signing & Capabilities), vaihda Bundle Identifier, aja puhelimeen tai *Product → Archive* → App Store Connect.

## Projektin rakenne

```
src/
  core/     moottori, syöte (joystick/hiiri), äänet (syntetisoitu), alusta & tallennus
  data/     tuotteet, kalusteet, työntekijät, tasot, päivitykset, asetukset (config.ts)
  gfx/      proseduraaliset tekstuurit, tuote- ja kalustemallit, ihmiset
  world/    katu ja kaupunki, kaupparakennus, taivas ja valaistus
  game/     pelilogiikka: asiakkaat, kassat, työntekijät, tilaukset, siivous, sähkö, tapahtumat…
  ui/       HUD, hallintasovellus, valikot, dialogit
android/ ios/   Capacitor-natiiviprojektit
tests/      Playwright-testiskriptit (kuvakaappaukset ja pelikierrokset)
```

Kaikki grafiikka (tekstuurit, 3D-mallit, ihmiset), musiikki ja äänet luodaan koodissa – peli ei käytä ulkopuolisia kuva- tai äänitiedostoja. Brändit ovat keksittyjä.

---

## English summary

A realistic first-person supermarket simulator (three.js + Capacitor) for Android and iOS. Start alone in a corner shop, stock shelves box by box, order from suppliers (trucks deliver), set prices, open/close the store yourself, serve customers at the checkout (scan, card terminal, cash change), keep it clean, keep coolers powered and repaired, hire and manage staff with shifts and breaks, unlock rooms (warehouse, office, break room, lockers, restrooms, electrical, trash room), expand 12 times into a mega hypermarket and level up to 500. AdMob interstitials at natural breaks (max 10/hour, configurable in `src/data/config.ts`) plus opt-in rewarded ads.

- Dev: `npm install && npm run dev`
- APK: `npm run android:apk` (needs Android SDK) – CI builds it on every push.
- iOS: `npm run ios:open` on a Mac with Xcode.
- Replace the Google **test** AdMob ids before release (config.ts, strings.xml, Info.plist) and set `testing: false`.
