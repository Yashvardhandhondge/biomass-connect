// =========================
// FARMER — ORDER TRACKING (US012)
// Placed → Accepted → In Transit (dispatched) → Delivered
// =========================

const TRACKABLE = ["Accepted", "In Transit", "Delivered"];
const ACTIVE = ["Accepted", "In Transit"];
let selectedId = null;

document.addEventListener("DOMContentLoaded", () => {

    const id = Farmer.param("id");
    if (id) {
        const o = findOrder(id);
        if (!o) showToast("Order " + id + " was not found", "warning");
        else if (o.status === "Pending") showToast("Order " + id + " is awaiting your response in Orders Received", "info");
        else if (!TRACKABLE.includes(o.status)) showToast("Order " + id + " was " + o.status.toLowerCase() + " and cannot be tracked", "info");
        else {
            selectedId = id;
            if (o.status === "Delivered") document.getElementById("viewFilter").value = "delivered";
        }
    }

    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("viewFilter").addEventListener("change", render);

    document.getElementById("trackList").addEventListener("click", e => {
        const item = e.target.closest(".track-item");
        if (!item) return;
        selectedId = item.dataset.id;
        render();
    });

    document.getElementById("trackDetail").addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "dispatch") openDispatch(btn.dataset.id);
        if (btn.dataset.action === "deliver") markDelivered(btn.dataset.id);
    });

    document.getElementById("dispatchForm").addEventListener("submit", e => {
        e.preventDefault();
        saveDispatch();
    });

    render();
});

/* ---------- Data ---------- */

function findOrder(id) {
    const o = Store.find("purchaseOrders", id);
    return o && o.farmer === FARMER_NAME ? o : null;
}

function trackableOrders() {
    const rank = { "In Transit": 0, "Accepted": 1, "Delivered": 2 };
    return Farmer.orders()
        .filter(o => TRACKABLE.includes(o.status))
        .sort((a, b) => rank[a.status] - rank[b.status] ||
            String(a.expectedDelivery || "").localeCompare(String(b.expectedDelivery || "")));
}

function daysFromToday(isoStr) {
    const d = Validator.parseDate(isoStr || "");
    if (!d) return null;
    const t = Validator.parseDate(Farmer.today());
    return Math.round((d - t) / 86400000);
}

function etaText(o) {
    if (o.status === "Delivered") return "Delivered on " + Store.date(o.deliveredDate || o.expectedDelivery);
    const days = daysFromToday(o.expectedDelivery);
    if (days === null) return "Expected delivery not set";
    if (days > 1) return "Expected in " + days + " days";
    if (days === 1) return "Expected tomorrow";
    if (days === 0) return "Expected today";
    return "Delayed by " + Math.abs(days) + " day" + (days === -1 ? "" : "s");
}

/* ---------- Rendering ---------- */

function render() {
    const view = document.getElementById("viewFilter").value;
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const all = trackableOrders();

    const list = all.filter(o =>
        (view === "all" || (view === "active" ? ACTIVE.includes(o.status) : o.status === "Delivered")) &&
        (!q || [o.id, o.manufacturer, o.biomassType, o.vehicleNo].join(" ").toLowerCase().includes(q)));

    if (!selectedId || !list.some(o => o.id === selectedId)) selectedId = list.length ? list[0].id : null;

    document.getElementById("listCount").textContent = list.length + " order" + (list.length === 1 ? "" : "s");

    document.getElementById("trackList").innerHTML = list.length
        ? list.map(o => `
            <button type="button" class="track-item${o.id === selectedId ? " active" : ""}" data-id="${Store.esc(o.id)}">
                <span class="track-item-top">
                    <strong>${Store.esc(o.id)}</strong>
                    ${Farmer.badge(o.status)}
                </span>
                <span class="track-item-meta">${Store.esc(o.manufacturer)}</span>
                <span class="track-item-meta">${Farmer.tons(o.quantity)} · ${Store.esc(o.biomassType)}</span>
                <small class="${etaText(o).startsWith("Delayed") ? "text-danger" : "text-subtle"}">${etaText(o)}</small>
            </button>`).join("")
        : `<div class="empty-state"><i class="fa-solid fa-truck"></i>${
            all.length ? "No orders match this view." : "No accepted orders yet. Accept orders from Orders Received to track them here."}</div>`;

    renderDetail(selectedId ? findOrder(selectedId) : null);
}

function renderDetail(o) {
    const el = document.getElementById("trackDetail");

    if (!o) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-route"></i>Select an order to see its tracking details.</div>`;
        return;
    }

    const steps = ["Placed", "Accepted", "In Transit", "Delivered"];
    const idx = { "Accepted": 1, "In Transit": 2, "Delivered": 3 }[o.status];
    const stateOf = i => (i < idx || (i === idx && o.status === "Delivered")) ? "done" : (i === idx ? "current" : "");

    const delayed = o.status !== "Delivered" && daysFromToday(o.expectedDelivery) < 0;

    let action = "";
    if (o.status === "Accepted") {
        action = `<button type="button" class="btn btn-primary" data-action="dispatch" data-id="${Store.esc(o.id)}"><i class="fa-solid fa-truck-fast"></i> Mark as Dispatched</button>`;
    } else if (o.status === "In Transit") {
        action = `<button type="button" class="btn btn-primary" data-action="deliver" data-id="${Store.esc(o.id)}"><i class="fa-solid fa-box-open"></i> Mark as Delivered</button>`;
    }

    const timeline = [
        { title: "Order placed", text: "by " + o.manufacturer, date: o.orderDate },
        { title: "Order accepted", text: "Expected delivery set to " + Store.date(o.expectedDelivery), date: o.acceptedDate },
        { title: "Dispatched · In transit", text: o.vehicleNo ? "Vehicle " + o.vehicleNo + (o.driverName ? " · Driver " + o.driverName : "") : "Awaiting dispatch", date: o.dispatchDate },
        { title: "Delivered", text: o.status === "Delivered" ? "Received at " + (o.deliveryAddress || "buyer location") : etaText(o), date: o.deliveredDate }
    ];

    const details = [
        ["Manufacturer", Store.esc(o.manufacturer)],
        ["Biomass", Store.esc(o.biomassType)],
        ["Quantity", Farmer.tons(o.quantity)],
        ["Order Amount", Store.inr(o.total)],
        ["Order Date", Store.date(o.orderDate)],
        ["Expected Delivery", Store.date(o.expectedDelivery) + (delayed ? ' <span class="badge badge-danger">Delayed</span>' : "")],
        ["Vehicle No.", Store.esc(o.vehicleNo || "—")],
        ["Driver", Store.esc(o.driverName ? o.driverName + (o.driverMobile ? " · " + o.driverMobile : "") : "—")],
        ["Dispatched On", Store.date(o.dispatchDate)],
        ["Delivered On", Store.date(o.deliveredDate)],
        ["Delivery Address", Store.esc(o.deliveryAddress || "—"), true]
    ];

    el.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">Order ${Store.esc(o.id)} ${Farmer.badge(o.status)}</div>
                <div class="card-subtitle">${Farmer.tons(o.quantity)} of ${Store.esc(o.biomassType)} for ${Store.esc(o.manufacturer)}</div>
            </div>
            ${action}
        </div>
        <div class="card-body">
            <div class="stepper">${steps.map((s, i) => `<div class="step ${stateOf(i)}">${s}</div>`).join("")}</div>
            <p class="eta ${delayed ? "text-danger" : "text-muted"}"><i class="fa-regular fa-clock"></i> ${etaText(o)}</p>

            <div class="track-grid">
                <dl class="detail-list">
                    ${details.map(d => `<div${d[2] ? ' class="span-full"' : ""}><dt>${d[0]}</dt><dd>${d[1]}</dd></div>`).join("")}
                </dl>
                <div>
                    <h4 class="timeline-title">Timeline</h4>
                    <ul class="timeline">
                        ${timeline.map((t, i) => `
                            <li class="timeline-item ${stateOf(i)}">
                                <h4>${t.title}</h4>
                                <p>${Store.esc(t.text)}</p>
                                <small>${t.date ? Store.date(t.date) : (i <= idx ? "" : "Pending")}</small>
                            </li>`).join("")}
                    </ul>
                </div>
            </div>
        </div>`;
}

/* ---------- Dispatch ---------- */

function openDispatch(id) {
    const o = findOrder(id);
    if (!o || o.status !== "Accepted") {
        showToast(o ? "Order " + id + " is " + o.status.toLowerCase() + " and cannot be dispatched" : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    const today = Farmer.today();
    const since = o.acceptedDate || o.orderDate || today;

    document.getElementById("dispatchId").value = o.id;
    document.getElementById("dispatchSummary").innerHTML =
        `<strong>${Store.esc(o.id)}</strong> · ${Store.esc(o.manufacturer)}<br>
         <span class="text-muted">${Farmer.tons(o.quantity)} of ${Store.esc(o.biomassType)} · deliver to ${Store.esc(o.deliveryAddress || "buyer")}</span>`;

    Farmer.setRef("dispatchMinDate", since > today ? today : since);
    document.getElementById("dispatchHint").textContent = "Between " + Store.date(since > today ? today : since) + " and today";

    const dispatch = document.getElementById("dispatchDate");
    dispatch.value = today;
    dispatch.dispatchEvent(new Event("change"));   // refresh the expected-date picker bounds

    document.getElementById("dispatchExpected").value =
        o.expectedDelivery && o.expectedDelivery > today ? o.expectedDelivery : Farmer.addDays(today, 2);

    Validator.reset("#dispatchForm");
    Farmer.openModal("dispatchModal");
}

function saveDispatch() {

    if (!Validator.validateForm("#dispatchForm")) return;

    const id = document.getElementById("dispatchId").value;
    const o = findOrder(id);
    if (!o || o.status !== "Accepted") {
        Farmer.closeModal("dispatchModal");
        showToast(o ? "Order " + id + " is already " + o.status.toLowerCase() : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    const vehicle = document.getElementById("vehicleNo").value.toUpperCase().replace(/[\s-]/g, "");
    const expected = document.getElementById("dispatchExpected").value;

    Store.update("purchaseOrders", id, {
        status: "In Transit",
        vehicleNo: vehicle,
        driverName: document.getElementById("driverName").value.trim(),
        driverMobile: document.getElementById("driverMobile").value.trim(),
        dispatchDate: document.getElementById("dispatchDate").value,
        expectedDelivery: expected
    });

    Farmer.closeModal("dispatchModal");
    selectedId = id;
    render();
    showToast("Order " + id + " dispatched in vehicle " + vehicle + ". Expected delivery on " + Store.date(expected) + ".", "success");
}

/* ---------- Deliver ---------- */

async function markDelivered(id) {
    const o = findOrder(id);
    if (!o || o.status !== "In Transit") {
        showToast(o ? "Order " + id + " is " + o.status.toLowerCase() + " and cannot be marked delivered" : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    const ok = await confirmDialog({
        title: "Mark " + id + " as delivered?",
        message: "Confirm that " + Farmer.tons(o.quantity) + " of " + o.biomassType + " has reached " + o.manufacturer +
            ". An invoice will be generated in Billing.",
        confirmText: "Mark Delivered"
    });
    if (!ok) return;

    Store.update("purchaseOrders", id, { status: "Delivered", deliveredDate: Farmer.today() });
    render();
    showToast("Order " + id + " marked as delivered. Invoice is now available in Billing.", "success");
}
