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

/*export const firebaseConfig = {
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
*/
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAl_pzSbkZd325olz6MJKRnT52rx9f8aYc",
  authDomain: "ggi-prezzi.firebaseapp.com",
  databaseURL: "https://ggi-prezzi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ggi-prezzi",
  storageBucket: "ggi-prezzi.firebasestorage.app",
  messagingSenderId: "257388413946",
  appId: "1:257388413946:web:1c6874ebf1630660ca5a43",
  measurementId: "G-H0YJNLX3MF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
