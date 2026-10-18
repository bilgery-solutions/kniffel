# Kniffel.

Ein modernes, mobiloptimiertes Kniffel-Spiel – ohne Anmeldung, Werbung, Framework oder Backend. Entwickelt als Teil der BILGERY-Spielesammlung, im Stil von [Sudoku](https://github.com/bilgery-solutions/sudoku) und [Kreuzworträtsel](https://github.com/bilgery-solutions/kreuzwortraetsel).

## Spielen

1. Unter **https://bilgery-solutions.github.io/kniffel/** starten (nach Aktivierung von GitHub Pages).
2. Zwischen einer und acht Personen eintragen; alle spielen abwechselnd auf einem Gerät.
3. **Würfelmodus wählen:**
   - **Digital:** Bis zu dreimal in der App würfeln und Würfel durch Antippen behalten.
   - **Eigene Würfel:** Mit fünf echten Würfeln am Tisch bis zu dreimal werfen. Anschließend die fünf endgültigen Augenzahlen in der App eintragen; die App errechnet die Punkte automatisch. Ein Würfel lässt sich jederzeit durch Antippen korrigieren, und **Alle löschen** setzt die Eingabe zurück.
4. Eine der 13 Kategorien wählen und die Punkte durch **Eintragen** bestätigen. Einträge können zurückgenommen werden, solange die nächste Person noch keine Würfelwerte eingegeben bzw. noch nicht digital gewürfelt hat.
5. Nach 13 Zügen pro Person gewinnt der höchste Punktestand.

### Regeln

- Sechs obere Kategorien (Einser–Sechser): jeweilige Augenzahl addieren.
- **+35 Bonus**, wenn der obere Block mindestens 63 Punkte erreicht.
- Dreierpasch / Viererpasch: gesamte Augensumme bei mindestens drei bzw. vier gleichen Würfeln.
- Full House (genau 3+2): 25 Punkte; kleine Straße: 30; große Straße: 40; Kniffel (5 gleiche): 50; Chance: Augensumme.
- **Zusatz-Kniffel:** Nach einem in der Kniffel-Kategorie eingetragenen 50-Punkte-Kniffel zählt jeder weitere Kniffel +50 Punkte. Ein noch freies Feld darf mit seiner Höchstpunktzahl belegt werden. Diese Umsetzung orientiert sich an der [aktuellen Schmidt-Spiele-Anleitung](https://www.schmidtspiele.de/files/Produkte/4/49203%20-%20Kniffel%C2%AE/49203_Kniffel_DE.pdf), nicht an der abweichenden Meisterschaftsregel.
- Ein ungültiger Kategorieeintrag ergibt 0 Punkte; ein 5er-Kniffel ist ohne Bonus-/Jokerregel **kein** Full House.

## Features

- Zwei Spielmodi: digitales Würfeln oder automatische Punktewertung mit eigenen physischen Würfeln
- Pass-and-play für 1–8 Personen auf demselben Smartphone/Tablet
- Vorschau aller möglichen Punkte und Extra-Kniffel vor dem Eintragen
- Punktezettel mit automatischen Summen, Bonus-Fortschritt, Spielerwechsel
- Rückgängig-Funktion für den zuletzt eingetragenen Zug, solange noch niemand neu gewürfelt hat
- Automatische lokale Speicherung der Partie; Fortsetzen nach Schließen/Neuladen
- Spielerstatistik mit Siegzahl, Spielen, Punktemittelwert und letzten Ergebnissen
- Ohne Cookies, Tracking, externe Bibliotheken oder Server-Kommunikation
- Offline-fähig nach dem ersten Laden (Service Worker)

## GitHub Pages

Im Repository **Settings → Pages → Deploy from a branch → main → / (root)** auswählen. Das Spiel verwendet relative Links und funktioniert sowohl lokal als auch unter dem GitHub-Pages-Unterpfad `/kniffel/`.

## Entwicklung und Tests

HTML, CSS und JavaScript ohne Build-Schritt. Lokal `python3 -m http.server 8080` im Repository ausführen und `http://localhost:8080` öffnen.

Punkteberechnungen lassen sich ohne Browser prüfen: `node tests/rules.test.cjs`.

Die Spielstände liegen ausschließlich im `localStorage` des jeweiligen Browsers. Es gibt kein geräteübergreifendes Synchronisieren und kein Online-Multiplayer.
