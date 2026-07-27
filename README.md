# Puente Markets — MVP

En privat, mobilanpassad PWA för att följa Polymarket-marknader och testa en virtuell portfölj. Ingen wallet kopplas in och appen kan inte placera riktiga order.

## Det som fungerar nu

- Hämtar aktiva Polymarket-event och filtrerar fram sannolika fotbollsmarknader.
- Visar YES/NO-pris, volym, likviditet och matchstart.
- Läser den offentliga CLOB-orderboken när en marknad öppnas.
- Virtuell portfölj med startsaldo på $10.
- Simulerade köp och försäljningar till aktuellt marknadspris.
- Signalpoäng baserad på marknadslikviditet, volym, prisbalans och prisrörelse.
- Vinst-/förlustvarningar för öppna virtuella positioner.
- Lokal historik i webbläsaren.
- Demoläge om Polymarket inte kan nås.
- PWA-manifest och hemskärmsikon.

## Viktig begränsning

Signalpoängen i MVP:n är **inte en färdig sportprognosmodell**. Den använder marknadsdata, inte ännu lagform, xG, startelvor, skador, hörn- eller spelarstatistik. Nästa fas behöver ett sportdata-API och en separat sannolikhetsmodell.

## Kör lokalt

1. Installera Node.js 18 eller senare.
2. Öppna Terminal/Kommandotolken i projektmappen.
3. Kör:

```bash
npm start
```

4. Öppna `http://localhost:3000`.

Den lokala servern har en enkel API-proxy. Vercel använder filerna i `/api`.

## Publicera gratis på Vercel

1. Skapa ett privat GitHub-repository.
2. Ladda upp alla filer i denna mapp.
3. Logga in på Vercel och välj **Add New → Project**.
4. Importera GitHub-projektet.
5. Framework preset: **Other**. Ingen build command krävs.
6. Tryck **Deploy**.
7. Öppna Vercel-adressen i Safari och välj **Dela → Lägg till på hemskärmen**.

## Nästa utvecklingsfas

1. Supabase-databas så portföljen synkas mellan enheter.
2. Riktiga pushnotiser via Web Push när appen är stängd.
3. Schemalagd marknadsskanning på servern.
4. Sportdata för matcher, lag, spelare, skador, startelvor, xG, hörnor och skott.
5. Kalibrerad sannolikhetsmodell per marknadstyp.
6. Backtesting och tydlig jämförelse mot Polymarkets pris.

## Säkerhet

- Lägg aldrig wallet seed phrase, privat nyckel eller lösenord i koden.
- Appen använder bara offentliga read-only-endpoints.
- Riktiga spel kräver alltid ett separat, manuellt beslut utanför appen.
