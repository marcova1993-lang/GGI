// =====================================================================
//  STORE — livello dati con due backend intercambiabili:
//   • FirebaseStore  → sincronizzazione in tempo reale (più telefoni)
//   • LocalStore     → salvataggio sul singolo dispositivo (fallback)
//  Espone la stessa API in entrambi i casi.
// =====================================================================

import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

// Listino iniziale (usato la prima volta / database vuoto)
export const DEFAULT_ITEMS = [
  { id: "costine",      name: "Costine",      price: 18, total: 100, sold: 0, pos: 0 },
  { id: "collo",        name: "Collo",        price: 16, total: 60,  sold: 0, pos: 1 },
  { id: "luganighette", name: "Luganighette", price: 15, total: 50,  sold: 0, pos: 2 },
  { id: "bratwurst",    name: "Bratwurst",    price: 10, total: 60,  sold: 0, pos: 3 },
  { id: "tomino",       name: "Tomino",       price: 8,  total: 60,  sold: 0, pos: 4 },
  { id: "altro",        name: "Altro",        price: 5,  total: 20,  sold: 0, pos: 5 },
];

const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------------
//  Backend LOCALE (localStorage + BroadcastChannel per le schede aperte)
// ---------------------------------------------------------------------
class LocalStore {
  constructor() {
    this.key = "griglia-data-v1";
    this.backendName = "Locale (questo dispositivo)";
    this.online = true;
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
    localStorage.setItem(this.key, JSON.stringify(data));
    if (this.bc) this.bc.postMessage("changed");
    this.emit();
  }
  _ensureSeed() {
    const d = this._read();
    if (!d.items) {
      this._write({ items: DEFAULT_ITEMS.map(i => ({ ...i })), orders: [], counter: 0 });
    }
  }
  onChange(cb) { this.listeners.push(cb); this.emit(); return () => {}; }
  emit() {
    const d = this._read();
    const state = {
      items: (d.items || []).slice().sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0)),
      orders: (d.orders || []).slice().sort((a, b) => b.createdAt - a.createdAt),
    };
    this.listeners.forEach(cb => cb(state));
  }
  setItem(id, fields) {
    const d = this._read();
    const it = d.items.find(i => i.id === id);
    if (it) Object.assign(it, fields);
    this._write(d);
  }
  addItem() {
    const d = this._read();
    const pos = d.items.reduce((m, i) => Math.max(m, i.pos ?? 0), -1) + 1;
    d.items.push({ id: uid(), name: "Nuovo", price: 0, total: 0, sold: 0, pos });
    this._write(d);
  }
  deleteItem(id) {
    const d = this._read();
    d.items = d.items.filter(i => i.id !== id);
    this._write(d);
  }
  async confirmOrder({ cart, total, paid, change }) {
    const d = this._read();
    for (const [id, qty] of Object.entries(cart)) {
      const it = d.items.find(i => i.id === id);
      if (!it) return { ok: false, error: "Articolo mancante" };
      if ((it.sold || 0) + qty > it.total)
        return { ok: false, error: `Scorta insufficiente: ${it.name}` };
    }
    for (const [id, qty] of Object.entries(cart)) {
      d.items.find(i => i.id === id).sold += qty;
    }
    d.counter = (d.counter || 0) + 1;
    d.orders.push({ id: uid(), num: d.counter, cart, total, paid, change, status: "pending", createdAt: Date.now() });
    this._write(d);
    return { ok: true, num: d.counter };
  }
  setOrderStatus(id, status) {
    const d = this._read();
    const o = d.orders.find(o => o.id === id);
    if (o) o.status = status;
    this._write(d);
  }
  removeOrder(id) {
    const d = this._read();
    d.orders = d.orders.filter(o => o.id !== id);
    this._write(d);
  }
  resetSold() {
    const d = this._read();
    d.items.forEach(i => i.sold = 0);
    this._write(d);
  }
  clearOrders() {
    const d = this._read();
    d.orders = [];
    this._write(d);
  }
}

// ---------------------------------------------------------------------
//  Backend FIREBASE (Realtime Database)
// ---------------------------------------------------------------------
class FirebaseStore {
  constructor(fb) {
    this.fb = fb; // { db, refs..., methods... }
    this.backendName = "Firebase (tempo reale)";
    this.online = false;
    this.items = {};
    this.orders = {};
    this.listeners = [];
  }
  async init() {
    const m = this.fb;
    // Seed se vuoto
    const snap = await m.get(m.ref(m.db, "items"));
    if (!snap.exists()) {
      const obj = {};
      DEFAULT_ITEMS.forEach(i => { obj[i.id] = { ...i }; delete obj[i.id].id; });
      await m.set(m.ref(m.db, "items"), obj);
    }
    m.onValue(m.ref(m.db, ".info/connected"), s => {
      this.online = !!s.val();
      this.emit();
    });
    m.onValue(m.ref(m.db, "items"), s => { this.items = s.val() || {}; this.emit(); });
    m.onValue(m.ref(m.db, "orders"), s => { this.orders = s.val() || {}; this.emit(); });
  }
  onChange(cb) { this.listeners.push(cb); this.emit(); return () => {}; }
  emit() {
    const items = Object.entries(this.items)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
    const orders = Object.entries(this.orders)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.createdAt - a.createdAt);
    this.listeners.forEach(cb => cb({ items, orders }));
  }
  setItem(id, fields) {
    const m = this.fb;
    return m.update(m.ref(m.db, "items/" + id), fields);
  }
  addItem() {
    const m = this.fb;
    const pos = Object.values(this.items).reduce((mx, i) => Math.max(mx, i.pos ?? 0), -1) + 1;
    return m.set(m.ref(m.db, "items/" + uid()), { name: "Nuovo", price: 0, total: 0, sold: 0, pos });
  }
  deleteItem(id) {
    const m = this.fb;
    return m.remove(m.ref(m.db, "items/" + id));
  }
  async confirmOrder({ cart, total, paid, change }) {
    const m = this.fb;
    // Transazione atomica sulle scorte
    const res = await m.runTransaction(m.ref(m.db, "items"), (cur) => {
      cur = cur || {};
      for (const [id, qty] of Object.entries(cart)) {
        if (!cur[id]) return; // abort
        const newSold = (cur[id].sold || 0) + qty;
        if (newSold > cur[id].total) return; // abort: scorta insufficiente
        cur[id].sold = newSold;
      }
      return cur;
    });
    if (!res.committed) return { ok: false, error: "Scorta insufficiente o articolo mancante" };

    const counterRes = await m.runTransaction(m.ref(m.db, "meta/counter"), (c) => (c || 0) + 1);
    const num = counterRes.snapshot.val();
    await m.set(m.ref(m.db, "orders/" + uid()),
      { num, cart, total, paid, change, status: "pending", createdAt: Date.now() });
    return { ok: true, num };
  }
  setOrderStatus(id, status) {
    const m = this.fb;
    return m.update(m.ref(m.db, "orders/" + id), { status });
  }
  removeOrder(id) {
    const m = this.fb;
    return m.remove(m.ref(m.db, "orders/" + id));
  }
  async resetSold() {
    const m = this.fb;
    const updates = {};
    Object.keys(this.items).forEach(id => updates[id + "/sold"] = 0);
    return m.update(m.ref(m.db, "items"), updates);
  }
  clearOrders() {
    const m = this.fb;
    return m.remove(m.ref(m.db, "orders"));
  }
}

// ---------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------
export async function createStore() {
  if (firebaseConfigured) {
    try {
      const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const dbMod  = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
      const app = appMod.initializeApp(firebaseConfig);
      const db = dbMod.getDatabase(app);
      const store = new FirebaseStore({
        db,
        ref: dbMod.ref, onValue: dbMod.onValue, set: dbMod.set, update: dbMod.update,
        remove: dbMod.remove, get: dbMod.get, runTransaction: dbMod.runTransaction,
      });
      await store.init();
      return store;
    } catch (e) {
      console.error("Firebase non disponibile, uso il salvataggio locale:", e);
    }
  }
  return new LocalStore();
}
