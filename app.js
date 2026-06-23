// =====================================================================
//  APP — interfaccia Cassa / Cucina / Impostazioni
// =====================================================================
import { createStore } from "./store.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fr = (n) => "Fr. " + (Number(n) || 0).toFixed(2);

let store = null;
let items = [];
let orders = [];
let logEntries = [];
let eventName = "";
let cart = {};          // { itemId: quantità }  (può essere negativa = ristorno)

// Tagli per la preview istantanea del resto
const DENOMS = [5, 10, 20, 50, 100, 200];

// Mostra a schermo eventuali errori JS (così si vedono senza aprire F12)
function showError(msg) {
  let b = document.getElementById("errBanner");
  if (!b) {
    b = document.createElement("div");
    b.id = "errBanner";
    b.className = "err-banner";
    document.body.appendChild(b);
  }
  b.textContent = "⚠️ " + msg;
  b.style.display = "block";
}
window.addEventListener("error", (e) => showError((e.message || "Errore") + (e.filename ? " — " + e.filename.split("/").pop() + ":" + e.lineno : "")));
window.addEventListener("unhandledrejection", (e) => showError("Promise: " + (e.reason && (e.reason.message || e.reason) || "errore")));

init();
async function init() {
  // 1) Navigazione e pulsanti SUBITO, indipendenti da Firebase
  setupTabs();
  wireButtons();

  // 2) Avvio store (Firebase o locale) — non blocca la navigazione
  store = await createStore();
  if (window.__grigliaFirebaseError)
    showError("Firebase non raggiungibile (" + window.__grigliaFirebaseError + "). Uso il salvataggio locale.");

  setupAuth();
  store.onChange((state) => {
    items = state.items;
    orders = state.orders;
    logEntries = state.log || [];
    eventName = state.event || "";
    try { renderAll(); } catch (err) { showError("Render: " + (err.message || err)); }
    updateConn();
  });
  $("#backendInfo").textContent =
    "Modalità attuale: " + store.backendName +
    (store.backendName.startsWith("Locale")
      ? ". I dati restano solo su questo telefono (Firebase non disponibile)."
      : ". Cassa e cucina sono sincronizzate in tempo reale.");
  updateConn();
}

function wireButtons() {
  $("#resetOrderBtn").onclick = resetOrder;
  $("#confirmOrderBtn").onclick = confirmOrder;
  $("#addItemBtn").onclick = () => store && store.addItem();
  $("#eventNameInput").onchange = (e) => { if (store) store.setEvent(e.target.value.trim()); };
  $("#newEventBtn").onclick = () => {
    if (!store) return;
    const name = prompt("Nome del nuovo evento (es. Maccabei 2026):", eventName || "");
    if (name === null) return;
    if (confirm(`Creare l'evento "${name}"?\n\nVerranno azzerati: vendite, piatti usciti, storico ordinazioni e numerazione (riparte da 1).`))
      store.newEvent(name.trim());
  };
  $("#clearOrdersBtn").onclick = () => {
    if (store && confirm("Eliminare tutto lo storico ordinazioni? (le scorte NON cambiano)")) store.clearOrders();
  };
  $("#clearLogBtn").onclick = () => { if (store && confirm("Svuotare il log attività?")) store.clearLog(); };
}

// ---------- Login Google ----------
function setupAuth() {
  const btn = $("#authBtn");
  const emailEl = $("#userEmail");
  if (!store.canAuth) { btn.style.display = "none"; return; }
  store.onAuth((user) => {
    if (user) {
      emailEl.textContent = user.email || "utente";
      btn.textContent = "Esci";
      btn.onclick = () => store.signOut();
    } else {
      emailEl.textContent = "";
      btn.textContent = "Accedi";
      btn.onclick = () => Promise.resolve(store.signIn())
        .catch(e => showError("Login non riuscito: " + (e && (e.code || e.message) || e)));
    }
  });
}

function updateConn() {
  const el = $("#connStatus");
  const ok = store && store.online;
  el.className = "conn " + (ok ? "online" : "offline");
  el.title = ok ? "Connesso" : "Non connesso";
}

function setupTabs() {
  $$(".tab").forEach(t => {
    t.onclick = () => {
      $$(".tab").forEach(x => x.classList.remove("active"));
      $$(".view").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      $("#view-" + t.dataset.view).classList.add("active");
    };
  });
}

function renderAll() {
  renderEvent();
  renderCassa();
  renderCucina();
  renderSettings();
  renderLog();
}

function renderEvent() {
  $("#brandEvent").textContent = eventName || "";
  const inp = $("#eventNameInput");
  if (inp && document.activeElement !== inp) inp.value = eventName || "";
}

const available = (it) => (it.total || 0) - (it.sold || 0); // buoni disponibili (può andare sotto zero)

// ---------- CASSA ----------
function renderCassa() {
  const list = $("#cassaList");
  list.innerHTML = "";
  items.forEach(it => {
    const avail = available(it);
    const inCart = cart[it.id] || 0;
    const availClass = avail <= 0 ? "zero" : (avail <= 5 ? "low" : "");
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-info">
        <div class="item-name">${esc(it.name)}</div>
        <div class="item-meta">${fr(it.price)} · <span class="left ${availClass}">${avail} buoni</span></div>
      </div>
      <button class="qty-btn minus" data-id="${it.id}" data-d="-1">−</button>
      <div class="qty-val ${inCart < 0 ? "neg" : ""}">${inCart}</div>
      <button class="qty-btn plus" data-id="${it.id}" data-d="1">+</button>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll(".qty-btn").forEach(b => {
    b.onclick = () => changeQty(b.dataset.id, Number(b.dataset.d));
  });
  renderTotalsAndChange();
}

function changeQty(id, delta) {
  const cur = cart[id] || 0;
  const next = cur + delta;          // nessun limite: può superare le scorte o andare in negativo
  if (next === 0) delete cart[id]; else cart[id] = next;
  renderCassa();
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const it = items.find(i => i.id === id);
    return sum + (it ? it.price * qty : 0);
  }, 0);
}
function cartHasItems() { return Object.values(cart).some(q => q !== 0); }

function renderTotalsAndChange() {
  const total = cartTotal();
  $("#cassaTotal").textContent = fr(total);
  $("#cassaTotal").classList.toggle("neg", total < 0);
  $("#confirmOrderBtn").disabled = !cartHasItems();

  const label = $("#payLabel");
  const preview = $("#changePreview");
  preview.innerHTML = "";
  if (total > 0) {
    label.textContent = "Resto da dare se il cliente paga con:";
    DENOMS.filter(d => d >= total).forEach(d => {
      const div = document.createElement("div");
      div.className = "ct";
      div.innerHTML = `<span>${d}.–</span><b>${fr(d - total)}</b>`;
      preview.appendChild(div);
    });
  } else if (total < 0) {
    label.textContent = "Ristorno — da restituire al cliente:";
    const div = document.createElement("div");
    div.className = "ct refund";
    div.innerHTML = `<span>Totale</span><b>${fr(-total)}</b>`;
    preview.appendChild(div);
  } else {
    label.textContent = "Resto da dare se il cliente paga con:";
  }
}

function resetOrder() {
  cart = {};
  $("#cassaMsg").textContent = "";
  renderCassa();
}

async function confirmOrder() {
  if (!cartHasItems()) return;
  const total = cartTotal();
  const msg = $("#cassaMsg");
  $("#confirmOrderBtn").disabled = true;
  const res = await store.confirmOrder({ cart: { ...cart }, total });
  if (res.ok) {
    msg.className = "msg ok";
    msg.textContent = res.refund
      ? `↩︎ Ristorno #${res.num} registrato · ${fr(-total)} al cliente`
      : `✓ Ordine #${res.num} registrato`;
    cart = {};
    renderCassa();
    setTimeout(() => { if (msg.textContent.includes("#" + res.num)) msg.textContent = ""; }, 4000);
  } else {
    msg.className = "msg err";
    msg.textContent = "✗ " + res.error;
    $("#confirmOrderBtn").disabled = false;
  }
}

// ---------- CUCINA ----------
function renderCucina() {
  const list = $("#prepList");
  list.innerHTML = "";
  items.forEach(it => {
    const sold = it.sold || 0;
    const out = it.out || 0;
    const toDo = sold - out;
    const pct = it.total ? Math.min(100, (sold / it.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "prep-row";
    row.innerHTML = `
      <div class="prep-head">
        <span class="prep-name">${esc(it.name)}</span>
        <span class="prep-count">prenotati <b>${sold}</b> / ${it.total}</span>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="prep-out">
        <div class="prep-stats">
          <span class="todo ${toDo > 0 ? "active" : ""}">Da preparare: <b>${Math.max(0, toDo)}</b></span>
          <span class="done">Usciti: <b>${out}</b></span>
        </div>
        <div class="prep-btns">
          <button class="out-btn minus" data-id="${it.id}" data-d="-1" ${out <= 0 ? "disabled" : ""}>−</button>
          <button class="out-btn plus" data-id="${it.id}" data-d="1">Uscito ✓</button>
        </div>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll(".out-btn").forEach(b => {
    b.onclick = () => store.plateOut(b.dataset.id, Number(b.dataset.d));
  });

  // Storico ordinazioni
  const hist = $("#historyList");
  hist.innerHTML = "";
  if (orders.length === 0) {
    hist.innerHTML = `<div class="empty">Nessuna ordinazione ancora.</div>`;
    return;
  }
  orders.forEach(o => hist.appendChild(orderCard(o)));
}

function orderCard(o) {
  const card = document.createElement("div");
  card.className = "order-card" + (o.refund ? " refund" : "");
  const lines = Object.entries(o.cart || {}).map(([id, qty]) => {
    const it = items.find(i => i.id === id);
    return `<div class="oi"><span>${esc(it ? it.name : id)}</span><b>×${qty}</b></div>`;
  }).join("");
  const t = new Date(o.createdAt);
  const when = t.toLocaleDateString("it-CH") + " " +
    String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  card.innerHTML = `
    <div class="order-top">
      <span class="order-id">#${o.num}${o.refund ? ' <span class="tag">RISTORNO</span>' : ""}</span>
      <span class="order-time">${when}</span>
    </div>
    <div class="order-items">${lines}</div>
    <div class="order-foot">
      <span class="order-total">${fr(o.total)}${o.user ? " · " + esc(shortUser(o.user)) : ""}</span>
    </div>`;
  return card;
}

// ---------- IMPOSTAZIONI ----------
function renderSettings() {
  const wrap = $("#settingsList");
  if (document.activeElement && wrap.contains(document.activeElement)) return;
  wrap.innerHTML = "";
  items.forEach(it => {
    const row = document.createElement("div");
    row.className = "setting-row";
    row.innerHTML = `
      <div class="setting-fields">
        <span class="lbl"><span>Articolo</span><span>Prezzo</span><span>Buoni tot.</span></span>
        <input data-f="name"  value="${esc(it.name)}" />
        <input data-f="price" type="number" inputmode="decimal" step="0.5" value="${it.price}" />
        <input data-f="total" type="number" inputmode="numeric" value="${it.total}" />
      </div>
      <button class="del-btn" title="Elimina">🗑</button>`;
    row.querySelectorAll("input").forEach(inp => {
      inp.onchange = () => {
        const f = inp.dataset.f;
        const val = f === "name" ? inp.value : Number(inp.value) || 0;
        store.setItem(it.id, { [f]: val });
      };
    });
    row.querySelector(".del-btn").onclick = () => {
      if (confirm(`Eliminare "${it.name}"?`)) store.deleteItem(it.id);
    };
    wrap.appendChild(row);
  });
}

function renderLog() {
  const wrap = $("#logList");
  if (!wrap) return;
  if (logEntries.length === 0) { wrap.innerHTML = `<div class="empty">Nessuna attività.</div>`; return; }
  wrap.innerHTML = logEntries.slice(0, 60).map(e => {
    const t = new Date(e.ts);
    const when = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
    return `<div class="log-item">
        <span class="log-when">${when}</span>
        <span class="log-act">${esc(e.action)}</span>
        <span class="log-det">${esc(e.detail || "")}</span>
        <span class="log-user">${esc(shortUser(e.user))}</span>
      </div>`;
  }).join("");
}

function shortUser(u) {
  if (!u) return "—";
  return u.includes("@") ? u.split("@")[0] : u;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
