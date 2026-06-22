// =====================================================================
//  CONFIGURAZIONE FIREBASE
// ---------------------------------------------------------------------
//  Incolla qui i dati del tuo progetto Firebase per attivare la
//  sincronizzazione in tempo reale tra CASSA e CUCINA (più telefoni).
//
//  Come ottenerli (gratis):
//   1. Vai su https://console.firebase.google.com  e crea un progetto.
//   2. Menu "Build" > "Realtime Database" > "Crea database"
//      (scegli la regione "europe-west1" e modalità "test" per iniziare).
//   3. Icona ingranaggio > "Impostazioni progetto" > sezione "Le tue app"
//      > clicca "</>" (Web) > registra l'app > copia l'oggetto firebaseConfig.
//   4. Incolla i valori qui sotto e SALVA.   (Vedi README.md per i dettagli.)
//
//  Finché i campi restano "INCOLLA_QUI", l'app funziona comunque ma solo
//  su un singolo dispositivo (salvataggio locale, niente sincronizzazione).
// =====================================================================

export const firebaseConfig = {
  apiKey: "INCOLLA_QUI",
  authDomain: "INCOLLA_QUI",
  databaseURL: "INCOLLA_QUI",
  projectId: "INCOLLA_QUI",
  storageBucket: "INCOLLA_QUI",
  messagingSenderId: "INCOLLA_QUI",
  appId: "INCOLLA_QUI"
};

// true quando la configurazione è stata realmente compilata
export const firebaseConfigured =
  !!firebaseConfig.databaseURL &&
  !firebaseConfig.databaseURL.includes("INCOLLA_QUI");
