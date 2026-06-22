// =====================================================================
//  CONFIGURAZIONE FIREBASE
// ---------------------------------------------------------------------
//  Qui sotto ci sono i dati del progetto Firebase usati per la
//  sincronizzazione in tempo reale tra CASSA e CUCINA (più telefoni).
//
//  NB: la libreria Firebase viene caricata automaticamente da store.js
//  (dal CDN gstatic), quindi qui serve SOLO l'oggetto di configurazione,
//  niente "import" né inizializzazione.
//
//  Per cambiare progetto: Console Firebase > ⚙️ Impostazioni progetto >
//  "Le tue app" > copia i valori e incollali qui sotto.
// =====================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAl_pzSbkZd325olz6MJKRnT52rx9f8aYc",
  authDomain: "ggi-prezzi.firebaseapp.com",
  databaseURL: "https://ggi-prezzi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ggi-prezzi",
  storageBucket: "ggi-prezzi.firebasestorage.app",
  messagingSenderId: "257388413946",
  appId: "1:257388413946:web:1c6874ebf1630660ca5a43",
  measurementId: "G-H0YJNLX3MF"
};

// true quando la configurazione è stata realmente compilata
export const firebaseConfigured =
  !!firebaseConfig.databaseURL &&
  !firebaseConfig.databaseURL.includes("INCOLLA_QUI");
