// =====================================================================
//  STORE — livello dati con due backend intercambiabili:
//   • FirebaseStore  → sincronizzazione in tempo reale + login Google
//   • LocalStore     → salvataggio sul singolo dispositivo (fallback)
//  Espone la stessa API in entrambi i casi.
// =====================================================================

import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

// Listino iniziale (usato la prima volta / database vuoto)
//   sold = porzioni prenotate (conteggio in avanti)
//   out  = piatti già usciti dalla cucina
export const DEFAULT_ITEMS = [
  { id: "costine",      name: "Costine",      price: 18, total: 100, sold: 0, out: 0, pos: 0 },
  { id: "collo",        name: "Collo",        price: 16, total: 60,  sold: 0, out: 0, pos: 1 },
  { id: "luganighette", name: "Luganighette", price: 15, total: 50,  sold: 0, out: 0, pos: 2 },
  { id: "bratwurst",    name: "Bratwurst",    price: 10, total: 60,  sold: 0, out: 0, pos: 3 },
  { id: "tomino",       name: "Tomino",       price: 8,  total: 60,  sold: 0, out: 0, pos: 4 },
  { id: "altro",        name: "Altro",        price: 5,  total: 20,  sold: 0, out: 0, pos: 5 },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const LOG_CAP = 300;

// ---------------------------------------------------------------------
//  Backend LOCALE (localStorage + BroadcastChannel per le schede aperte)
// ---------------------------------------------------------------------
class LocalStore {
  constructor() {
    this.key = "griglia-data-v2";
    this.backendName = "Locale (questo dispositivo)";
    this.online = true;
    this.canAuth = false;
    this.currentUser = "Locale";
    this.listeners = [];
    this.bc = ("BroadcastChannel" in self) ? new BroadcastChannel("griglia") : null;
    if (this.bc) this.bc.onmessage = () => this.emit();
    window.addEventListener("storage", (e) => { if (e.key === this.key) this.emit(); });
    this._ensureSeed();
  }
  _read() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch { return {}; }
  }
  _write(data) {
    if (data.log && data.log.length > LOG_CAP) data.log = data.log.slice(-LOG_CAP);
    localStorage.setItem(this.key, JSON.stringify(data));
    if (this.bc) this.bc.postMessage("changed");
    this.emit();
  }
  _ensureSeed() {
    const d = this._read();
    if (!d.items) this._write({ items: DEFAULT_ITEMS.map(i => ({ ...i })), orders: [], log: [], counter: 0, event: "" });
  }
  _log(d, action, detail) {
    (d.log = d.log || []).push({ id: uid(), ts: Date.now(), user: this.currentUser, action, detail });
  }
  setCurrentUser(email) { this.currentUser = email || "Locale"; }
  onAuth(cb) { cb(null); }           // niente login in locale
  signIn() {} signOut() {}

  onChange(cb) { this.listeners.push(cb); this.emit(); return () => {}; }
  emit() {
    const d = this._read();
    this.listeners.forEach(cb => cb({
      items:  (d.items || []).slice().sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)),
      orders: (d.orders || []).slice().sort((a, b) => b.createdAt - a.createdAt),
      log:    (d.log || []).slice().sort((a, b) => b.ts - a.ts),
      event:  d.event || "",
    }));
  }
  setEvent(name) { const d = this._read(); d.event = name; this._write(d); }
  newEvent(name) {
    const d = this._read();
    d.event = name;
    d.items.forEach(i => { i.sold = 0; i.out = 0; });
    this._log(d, "nuovo evento", name);
    this._write(d);
  }
  setItem(id, fields) {
    const d = this._read();
    const it = d.items.find(i => i.id === id);
    if (it) { Object.assign(it, fields); this._log(d, "modifica", `${it.name}`); }
    this._write(d);
  }
  addItem() {
    const d = this._read();
    const pos = d.items.reduce((m, i) => Math.max(m, i.pos ?? 0), -1) + 1;
    d.items.push({ id: uid(), name: "Nuovo", price: 0, total: 0, sold: 0, out: 0, pos });
    this._write(d);
  }
  deleteItem(id) {
    const d = this._read();
    const it = d.items.find(i => i.id === id);
    d.items = d.items.filter(i => i.id !== id);
    this._log(d, "elimina articolo", it ? it.name : id);
    this._write(d);
  }
  async confirmOrder({ cart, total }) {
    const d = this._read();
    for (const [id, qty] of Object.entries(cart)) {
      const it = d.items.find(i => i.id === id);
      if (!it) return { ok: false, error: "Articolo mancante" };
      it.sold = Math.max(0, (it.sold || 0) + qty);
    }
    d.counter = (d.counter || 0) + 1;
    const refund = total < 0;
    d.orders.push({ id: uid(), num: d.counter, cart, total, refund, status: "ok",
                    createdAt: Date.now(), user: this.currentUser });
    this._log(d, refund ? "ristorno" : "ordine", `#${d.counter} · ${this._desc(d, cart)}`);
    this._write(d);
    return { ok: true, num: d.counter, refund };
  }
  removeOrder(id) {
    const d = this._read();
    const o = d.orders.find(o => o.id === id);
    if (o) {
      for (const [iid, qty] of Object.entries(o.cart || {})) {
        const it = d.items.find(i => i.id === iid);
        if (it) it.sold = Math.max(0, (it.sold || 0) - qty);
      }
      d.orders = d.orders.filter(x => x.id !== id);
      this._log(d, "annulla ordine", `#${o.num}`);
    }
    this._write(d);
  }
  plateOut(id, delta) {
    const d = this._read();
    const it = d.items.find(i => i.id === id);
    if (it) {
      const out = Math.max(0, (it.out || 0) + delta); // nessun limite massimo
      it.out = out;
      this._log(d, "uscita", `${it.name} (${delta > 0 ? "+" : ""}${delta}) → ${out}`);
    }
    this._write(d);
  }
  resetSold() {
    const d = this._read();
    d.items.forEach(i => { i.sold = 0; i.out = 0; });
    this._log(d, "azzera vendite", "");
    this._write(d);
  }
  clearOrders() {
    const d = this._read();
    d.orders = [];
    this._log(d, "svuota storico", "");
    this._write(d);
  }
  clearLog() { const d = this._read(); d.log = []; this._write(d); }
  _desc(d, cart) {
    return Object.entries(cart).map(([iid, q]) => {
      const it = d.items.find(i => i.id === iid); return `${it ? it.name : iid} ×${q}`;
    }).join(", ");
  }
}

// ---------------------------------------------------------------------
//  Backend FIREBASE (Realtime Database + Auth Google)
// ---------------------------------------------------------------------
class FirebaseStore {
  constructor(fb) {
    this.fb = fb;
    this.backendName = "Firebase (tempo reale)";
    this.online = false;
    this.canAuth = true;
    this.currentUser = "anonimo";
    this.items = {};
    this.orders = {};
    this.log = {};
    this.meta = {};
    this.listeners = [];
    this.authListeners = [];
  }
  async init() {
    const m = this.fb;
    const snap = await m.get(m.ref(m.db, "items"));
    if (!snap.exists()) {
      const obj = {};
      DEFAULT_ITEMS.forEach(i => { const c = { ...i }; delete c.id; obj[i.id] = c; });
      await m.set(m.ref(m.db, "items"), obj);
    }
    m.onValue(m.ref(m.db, ".info/connected"), s => { this.online = !!s.val(); this.emit(); });
    m.onValue(m.ref(m.db, "items"),  s => { this.items  = s.val() || {}; this.emit(); });
    m.onValue(m.ref(m.db, "orders"), s => { this.orders = s.val() || {}; this.emit(); });
    m.onValue(m.ref(m.db, "log"),    s => { this.log    = s.val() || {}; this.emit(); });
    m.onValue(m.ref(m.db, "meta"),   s => { this.meta   = s.val() || {}; this.emit(); });
    // Login
    m.getRedirectResult(m.auth).catch(e => console.warn("redirect login:", e.code || e));
    m.onAuthStateChanged(m.auth, (user) => {
      this.currentUser = user ? (user.email || user.displayName || "utente") : "anonimo";
      this.authUser = user || null;
      this.authListeners.forEach(cb => cb(user));
    });
  }
  setCurrentUser() {/* gestito da onAuthStateChanged */}
  onAuth(cb) { this.authListeners.push(cb); cb(this.authUser || null); }
  signIn()  { const m = this.fb; return m.signInWithRedirect(m.auth, m.provider); }
  signOut() { const m = this.fb; return m.signOut(m.auth); }

  onChange(cb) { this.listeners.push(cb); this.emit(); return () => {}; }
  emit() {
    const items = Object.entries(this.items).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
    const orders = Object.entries(this.orders).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const log = Object.entries(this.log).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.ts - a.ts);
    this.listeners.forEach(cb => cb({ items, orders, log, event: this.meta.event || "" }));
  }
  setEvent(name) { const m = this.fb; return m.set(m.ref(m.db, "meta/event"), name); }
  async newEvent(name) {
    const m = this.fb;
    const updates = { "meta/event": name };
    Object.keys(this.items).forEach(id => { updates["items/" + id + "/sold"] = 0; updates["items/" + id + "/out"] = 0; });
    await m.update(m.ref(m.db), updates);
    this._pushLog("nuovo evento", name);
  }
  _pushLog(action, detail) {
    const m = this.fb;
    return m.push(m.ref(m.db, "log"), { ts: Date.now(), user: this.currentUser, action, detail });
  }
  setItem(id, fields) {
    const m = this.fb;
    const name = this.items[id]?.name || id;
    return m.update(m.ref(m.db, "items/" + id), fields).then(() => this._pushLog("modifica", name));
  }
  addItem() {
    const m = this.fb;
    const pos = Object.values(this.items).reduce((mx, i) => Math.max(mx, i.pos ?? 0), -1) + 1;
    return m.set(m.ref(m.db, "items/" + uid()), { name: "Nuovo", price: 0, total: 0, sold: 0, out: 0, pos });
  }
  deleteItem(id) {
    const m = this.fb;
    const name = this.items[id]?.name || id;
    return m.remove(m.ref(m.db, "items/" + id)).then(() => this._pushLog("elimina articolo", name));
  }
  async confirmOrder({ cart, total }) {
    const m = this.fb;
    const res = await m.runTransaction(m.ref(m.db, "items"), (cur) => {
      cur = cur || {};
      for (const [id, qty] of Object.entries(cart)) {
        if (!cur[id]) return; // abort: articolo mancante
        cur[id].sold = Math.max(0, (cur[id].sold || 0) + qty);
      }
      return cur;
    });
    if (!res.committed) return { ok: false, error: "Articolo mancante" };
    const counterRes = await m.runTransaction(m.ref(m.db, "meta/counter"), (c) => (c || 0) + 1);
    const num = counterRes.snapshot.val();
    const refund = total < 0;
    await m.set(m.ref(m.db, "orders/" + uid()),
      { num, cart, total, refund, status: "ok", createdAt: Date.now(), user: this.currentUser });
    this._pushLog(refund ? "ristorno" : "ordine", `#${num} · ${this._desc(cart)}`);
    return { ok: true, num, refund };
  }
  async removeOrder(id) {
    const m = this.fb;
    const o = this.orders[id];
    if (!o) return;
    await m.runTransaction(m.ref(m.db, "items"), (cur) => {
      cur = cur || {};
      for (const [iid, qty] of Object.entries(o.cart || {})) {
        if (cur[iid]) cur[iid].sold = Math.max(0, (cur[iid].sold || 0) - qty);
      }
      return cur;
    });
    await m.remove(m.ref(m.db, "orders/" + id));
    this._pushLog("annulla ordine", `#${o.num}`);
  }
  async plateOut(id, delta) {
    const m = this.fb;
    let finalOut = 0, name = this.items[id]?.name || id;
    await m.runTransaction(m.ref(m.db, "items/" + id), (cur) => {
      if (!cur) return cur;
      const out = Math.max(0, (cur.out || 0) + delta); // nessun limite massimo
      cur.out = out; finalOut = out;
      return cur;
    });
    this._pushLog("uscita", `${name} (${delta > 0 ? "+" : ""}${delta}) → ${finalOut}`);
  }
  async resetSold() {
    const m = this.fb;
    const updates = {};
    Object.keys(this.items).forEach(id => { updates[id + "/sold"] = 0; updates[id + "/out"] = 0; });
    await m.update(m.ref(m.db, "items"), updates);
    this._pushLog("azzera vendite", "");
  }
  clearOrders() { const m = this.fb; return m.remove(m.ref(m.db, "orders")).then(() => this._pushLog("svuota storico", "")); }
  clearLog()    { const m = this.fb; return m.remove(m.ref(m.db, "log")); }
  _desc(cart) {
    return Object.entries(cart).map(([iid, q]) => `${this.items[iid]?.name || iid} ×${q}`).join(", ");
  }
}

// ---------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout " + label)), ms)),
  ]);
}

async function buildFirebaseStore() {
  const appMod  = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const dbMod   = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(firebaseConfig);
  const db = dbMod.getDatabase(app);
  const auth = authMod.getAuth(app);
  const provider = new authMod.GoogleAuthProvider();
  const store = new FirebaseStore({
    db, auth, provider,
    ref: dbMod.ref, onValue: dbMod.onValue, set: dbMod.set, update: dbMod.update,
    remove: dbMod.remove, get: dbMod.get, push: dbMod.push, runTransaction: dbMod.runTransaction,
    onAuthStateChanged: authMod.onAuthStateChanged,
    signInWithRedirect: authMod.signInWithRedirect,
    getRedirectResult: authMod.getRedirectResult,
    signOut: authMod.signOut,
  });
  await store.init();
  return store;
}

export async function createStore() {
  if (firebaseConfigured) {
    try {
      // Se Firebase non risponde entro 8s, si passa al salvataggio locale
      return await withTimeout(buildFirebaseStore(), 8000, "Firebase");
    } catch (e) {
      console.error("Firebase non disponibile, uso il salvataggio locale:", e);
      window.__grigliaFirebaseError = String(e && e.message || e);
    }
  }
  return new LocalStore();
}
