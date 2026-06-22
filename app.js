// =====================================================================
//  APP — interfaccia Cassa / Cucina / Impostazioni
// =====================================================================
import { createStore } from "./store.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const fr = (n) => "Fr. " + (Number(n) || 0).toFixed(2);

// Stato dell'interfaccia
let store = null;
let items = [];
let orders = [];
let cart = {};       // { itemId: quantità }
let paid = 0;        // importo ricevuto dal cliente

// Tagli usati per il calcolo rapido del resto
const DENOMS = [5, 10, 20, 50, 100, 200];

// ---------------------------------------------------------------------
//  Avvio
// ---------------------------------------------------------------------
init();
async function init() {
  store = await createStore();
  store.onChange((state) => {
    items = state.items;
    orders = state.orders;
    renderAll();
    updateConn();
  });
  setupTabs();
  setupPayment();
  $("#resetOrderBtn").onclick = resetOrder;
  $("#confirmOrderBtn").onclick = confirmOrder;
  $("#addItemBtn").onclick = () => store.addItem();
  $("#resetSoldBtn").onclick = () => {
    if (confirm("Azzerare tutte le vendite e ripristinare le scorte piene?")) store.resetSold();
  };
  $("#clearOrdersBtn").onclick = () => {
    if (confirm("Eliminare tutti gli ordini dalla cucina?")) store.clearOrders();
  };
  $("#backendInfo").textContent =
    "Modalità attuale: " + store.backendName +
    (store.backendName.startsWith("Locale")
      ? ". I dati restano solo su questo telefono. Per condividerli con la cucina configura Firebase (vedi README.md)."
      : ". Cassa e cucina sono sincronizzate in tempo reale.");
  updateConn();
}

function updateConn() {
  const el = $("#connStatus");
  const ok = store && store.online;
  el.className = "conn " + (ok ? "online" : "offline");
  el.title = ok ? "Connesso" : "Non connesso";
}

// ---------------------------------------------------------------------
//  Navigazione a schede
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
//  Render generale
// ---------------------------------------------------------------------
function renderAll() {
  renderCassa();
  renderCucina();
  renderSettings();
}

const remaining = (it) => (it.total || 0) - (it.sold || 0);

// ---------- CASSA ----------
function renderCassa() {
  const list = $("#cassaList");
  list.innerHTML = "";
  items.forEach(it => {
    const rem = remaining(it);
    const inCart = cart[it.id] || 0;
    const canAdd = inCart < rem;
    const remClass = rem <= 0 ? "zero" : (rem <= 5 ? "low" : "");
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-info">
        <div class="item-name">${esc(it.name)}</div>
        <div class="item-meta">${fr(it.price)} · <span class="left ${remClass}">${rem} buoni</span></div>
      </div>
      <button class="qty-btn minus" data-id="${it.id}" data-d="-1" ${inCart <= 0 ? "disabled" : ""}>−</button>
      <div class="qty-val">${inCart}</div>
      <button class="qty-btn plus" data-id="${it.id}" data-d="1" ${canAdd ? "" : "disabled"}>+</button>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll(".qty-btn").forEach(b => {
    b.onclick = () => changeQty(b.dataset.id, Number(b.dataset.d));
  });
  renderTotalsAndChange();
}

function changeQty(id, delta) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const cur = cart[id] || 0;
  let next = cur + delta;
  if (next < 0) next = 0;
  if (next > remaining(it)) next = remaining(it);
  if (next === 0) delete cart[id]; else cart[id] = next;
  renderCassa();
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const it = items.find(i => i.id === id);
    return sum + (it ? it.price * qty : 0);
  }, 0);
}

function renderTotalsAndChange() {
  const total = cartTotal();
  $("#cassaTotal").textContent = fr(total);
  $("#confirmOrderBtn").disabled = total <= 0;

  const change = paid - total;
  const ce = $("#changeAmount");
  ce.textContent = fr(change);
  ce.classList.toggle("neg", change < 0);

  // Tabella resto per i tagli >= totale (utile a colpo d'occhio)
  const ct = $("#changeTable");
  ct.innerHTML = "";
  if (total > 0) {
    DENOMS.filter(d => d >= total).forEach(d => {
      const div = document.createElement("div");
      div.className = "ct";
      div.innerHTML = `<span>${d}.–</span><b>${fr(d - total)}</b>`;
      ct.appendChild(div);
    });
  }
}

function setupPayment() {
  $("#quickPay").querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      const amt = Number(b.dataset.amount);
      paid = amt;
      $("#paidInput").value = amt;
      markQuick(amt);
      renderTotalsAndChange();
    };
  });
  $("#paidInput").oninput = (e) => {
    paid = Number(e.target.value) || 0;
    markQuick(paid);
    renderTotalsAndChange();
  };
}
function markQuick(amt) {
  $("#quickPay").querySelectorAll("button").forEach(b =>
    b.classList.toggle("sel", Number(b.dataset.amount) === amt));
}

function resetOrder() {
  cart = {};
  paid = 0;
  $("#paidInput").value = "";
  markQuick(null);
  $("#cassaMsg").textContent = "";
  renderCassa();
}

async function confirmOrder() {
  const total = cartTotal();
  if (total <= 0) return;
  const msg = $("#cassaMsg");
  $("#confirmOrderBtn").disabled = true;
  const res = await store.confirmOrder({
    cart: { ...cart }, total, paid, change: Math.max(0, paid - total),
  });
  if (res.ok) {
    msg.className = "msg ok";
    msg.textContent = `✓ Ordine #${res.num} inviato in cucina` +
      (paid > total ? ` · Resto ${fr(paid - total)}` : "");
    cart = {}; paid = 0;
    $("#paidInput").value = ""; markQuick(null);
    renderCassa();
    setTimeout(() => { if (msg.textContent.startsWith("✓")) msg.textContent = ""; }, 4000);
  } else {
    msg.className = "msg err";
    msg.textContent = "✗ " + res.error;
    $("#confirmOrderBtn").disabled = false;
  }
}

// ---------- CUCINA ----------
function renderCucina() {
  // Panoramica scorte
  const ov = $("#stockOverview");
  ov.innerHTML = "";
  items.forEach(it => {
    const rem = remaining(it);
    const pct = it.total ? Math.max(0, (rem / it.total) * 100) : 0;
    const cls = rem <= 0 ? "zero" : (rem <= 5 ? "low" : "");
    const row = document.createElement("div");
    row.className = "stock-row";
    row.innerHTML = `
      <div class="stock-head">
        <span>${esc(it.name)}</span>
        <span class="rem ${cls}">${rem} / ${it.total}</span>
      </div>
      <div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>`;
    ov.appendChild(row);
  });

  // Ordini
  const list = $("#ordersList");
  const pending = orders.filter(o => o.status !== "done");
  const done = orders.filter(o => o.status === "done");
  list.innerHTML = "";
  if (pending.length === 0 && done.length === 0) {
    list.innerHTML = `<div class="empty">Nessun ordine ancora.</div>`;
    return;
  }
  [...pending, ...done].forEach(o => list.appendChild(orderCard(o)));
}

function orderCard(o) {
  const card = document.createElement("div");
  card.className = "order-card" + (o.status === "done" ? " done" : "");
  const lines = Object.entries(o.cart || {}).map(([id, qty]) => {
    const it = items.find(i => i.id === id);
    const name = it ? it.name : id;
    return `<div class="oi"><span>${esc(name)}</span><b>×${qty}</b></div>`;
  }).join("");
  const t = new Date(o.createdAt);
  const hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  card.innerHTML = `
    <div class="order-top">
      <span class="order-id">#${o.num}</span>
      <span class="order-time">${hh}</span>
    </div>
    <div class="order-items">${lines}</div>
    <div class="order-foot">
      <span class="order-total">${fr(o.total)}</span>
      ${o.status === "done"
        ? `<button class="btn btn-grey" data-act="undo" style="flex:0 0 auto;padding:8px 14px">↺</button>`
        : `<button class="btn btn-green" data-act="done" style="flex:0 0 auto;padding:10px 18px">Pronto ✓</button>`}
      <button class="btn btn-red" data-act="del" style="flex:0 0 auto;padding:8px 12px">🗑</button>
    </div>`;
  card.querySelectorAll("[data-act]").forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.act;
      if (a === "done") store.setOrderStatus(o.id, "done");
      else if (a === "undo") store.setOrderStatus(o.id, "pending");
      else if (a === "del") store.removeOrder(o.id);
    };
  });
  return card;
}

// ---------- IMPOSTAZIONI ----------
function renderSettings() {
  const wrap = $("#settingsList");
  // Evita di ricreare i campi mentre l'utente sta scrivendo
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

// ---------------------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
