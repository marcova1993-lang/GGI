# 🔥 Cassa Griglia

Applicazione web (utilizzabile da telefono) per la **cassa** e la **cucina** di un
banco gastronomia / sagra. Dato un listino prezzi:

- tasti **+ / −** grandi per aumentare o diminuire la quantità ordinata;
- calcolo automatico del **totale**;
- calcolo del **resto** (digiti o tocchi quanto paga il cliente → vedi quanto restituire,
  con anche una tabella rapida per le banconote da 10/20/50/100/200);
- **buoni restanti** per ogni articolo (le porzioni in magazzino che diminuiscono ad ogni ordine);
- vista **Cucina** con gli ordini in arrivo (da segnare "Pronto") e le scorte rimanenti;
- **sincronizzazione in tempo reale** tra cassa e cucina (più telefoni) tramite Firebase;
- installabile sul telefono come app (icona in home, schermo intero).

## Provala subito (senza configurare nulla)

L'app funziona immediatamente in **modalità locale**: apri `index.html` in un browser.
In questa modalità i dati restano **solo su quel dispositivo** (cassa e cucina non
si sincronizzano). Perfetto per provare l'interfaccia.

Per testare in locale con un piccolo server:

```bash
# dalla cartella del progetto
python3 -m http.server 8000
# poi apri  http://localhost:8000
```

## Attivare la sincronizzazione cassa ↔ cucina (Firebase)

Per far vedere gli stessi dati su più telefoni in tempo reale serve un database
condiviso. Usiamo **Firebase Realtime Database** (piano gratuito sufficiente).

1. Vai su <https://console.firebase.google.com> e **crea un progetto** (gratis).
2. Menu **Build → Realtime Database → Crea database**.
   - Regione: `europe-west1`.
   - Regole: per iniziare scegli **modalità test** (vedi nota sicurezza sotto).
3. Icona ⚙️ **Impostazioni progetto → Le tue app → `</>` (Web)**, registra l'app
   e copia l'oggetto `firebaseConfig`.
4. Incolla quei valori in **`firebase-config.js`** (sostituendo i `"INCOLLA_QUI"`).
5. Ricarica l'app: in alto il pallino diventa verde e in **⚙︎ Impostazioni** vedrai
   "Firebase (tempo reale)".

> **Nota sicurezza:** la "modalità test" lascia il database aperto per ~30 giorni.
> Per un uso oltre la giornata dell'evento, imposta regole più restrittive (vedi
> `database.rules.json`) o un'autenticazione.

## Login Google (log di chi fa le modifiche)

L'app registra **chi** ha fatto ogni azione (ordine, ristorno, annullo, uscita piatto,
modifica listino) con la sua email Google. Per attivarlo:

1. Console Firebase → **Build → Authentication → Inizia**.
2. Scheda **Sign-in method → Aggiungi provider → Google → Abilita → Salva**.
3. Scheda **Settings → Domini autorizzati → Aggiungi dominio** e inserisci il dominio
   dove pubblichi l'app, es. `marcova1993-lang.github.io`
   (`localhost` è già autorizzato per le prove).
4. Ricarica l'app: in alto compare **Accedi** → login con Google. L'email appare nel
   log (scheda ⚙︎ Impostazioni) e accanto a ogni ordinazione.

## Sicurezza: accesso solo con login

Il database è protetto: **solo chi ha fatto il login con Google può leggere/scrivere**
(vedi `database.rules.json`). All'apertura l'app mostra una schermata "Accedi con
Google"; dopo l'accesso si usano normalmente cassa e cucina. Ogni telefono va quindi
loggato una volta (l'accesso resta memorizzato).

Per attivare/mantenere questa protezione:
1. Pubblica le regole di `database.rules.json` in Console Firebase → Realtime Database
   → **Regole** → **Pubblica** (ferma anche le email "regole non sicure").
2. Assicurati che Google sia abilitato e che il dominio del sito sia tra i **Domini
   autorizzati** (vedi sezione sopra).

## Pubblicare online (link accessibile da qualsiasi telefono)

Essendo solo file statici, puoi pubblicarla ovunque. Opzioni semplici:

- **Firebase Hosting** (stesso progetto):
  ```bash
  npm install -g firebase-tools
  firebase login
  firebase init hosting     # cartella pubblica: "." — single-page: No
  firebase deploy
  ```
- Oppure trascina la cartella su **Netlify** / **Vercel** / **GitHub Pages**.

Poi apri il link sul telefono e **"Aggiungi a schermata Home"** per usarla come app.

## Uso quotidiano

- **Cassa:** tocca **+/−** per comporre l'ordine → leggi il **totale** e la **preview
  istantanea del resto** (quanto rendere per le varie banconote) → **Conferma**.
  - Il **+** non ha limite (i buoni sono fisici: possono essere più del previsto).
  - Il **−** può andare in **negativo**: serve per i **ristorni**, e ri-aggiunge quelle
    porzioni ai buoni disponibili (totale negativo = importo da restituire al cliente).
- **Cucina:** conteggio **in avanti** (prenotati X / totale). Per ogni articolo, ogni
  volta che consegni un piatto premi **Uscito ✓**: vedi così *usciti* e *da preparare*
  (prenotati − usciti). In fondo c'è lo **storico** di tutte le ordinazioni (numero
  progressivo, data/ora, e chi l'ha fatta); puoi **annullare** un'ordinazione (le
  porzioni tornano disponibili).
- **⚙︎ Impostazioni:** modifica listino, prezzi e buoni totali; **Log attività** con chi
  ha fatto cosa; a inizio giornata usa **"Azzera vendite"** per ripristinare le scorte.

## File del progetto

| File | Scopo |
|------|-------|
| `index.html` | struttura della pagina (Cassa / Cucina / Impostazioni) |
| `app.css` | stile mobile-first |
| `app.js` | logica dell'interfaccia |
| `store.js` | livello dati: Firebase **o** salvataggio locale |
| `firebase-config.js` | qui incolli la configurazione Firebase |
| `manifest.webmanifest` | installazione come app sul telefono |
