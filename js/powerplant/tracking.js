// =========================
// ACTIVE ORDER TRACKING (US030)
// =========================

const ACTIVE_STATUSES = ["Pending", "Accepted", "In Transit"];
const STEPS = ["Order Placed", "Accepted", "In Transit", "Delivered"];
const STEP_INDEX = { "Pending": 0, "Accepted": 1, "In Transit": 2, "Delivered": 3 };

let statusFilter = "";
let selectedId = null;
let justDelivered = null;

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("statusTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        statusFilter = tab.dataset.status;
        document.querySelectorAll("#statusTabs .tab").forEach(t => t.classList.toggle("active", t === tab));
        renderList();
    });

    document.getElementById("orderList").addEventListener("click", e => {
        const item = e.target.closest(".order-item");
        if (!item) return;
        selectedId = item.dataset.id;
        justDelivered = null;
        renderList();
        renderDetail();
        if (window.innerWidth <= 1100) document.getElementById("detailCard").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("detailCard").addEventListener("click", e => {
        const btn = e.target.closest("[data-action='receipt']");
        if (btn) openReceipt(btn.dataset.id);
    });

    document.getElementById("receiptForm").addEventListener("submit", confirmReceipt);

    const pre = Plant.param("order");
    const active = activeOrders();
    if (pre) {
        if (active.some(o => o.id === pre)) selectedId = pre;
        else showToast(`Order ${pre} is not active — see Purchase History for completed orders`, "info");
    }
    if (!selectedId && active.length) selectedId = active[0].id;

    refresh();
});

function activeOrders() {
    return Plant.orders()
        .filter(o => ACTIVE_STATUSES.includes(o.status))
        .sort((a, b) => (a.expectedDelivery || "").localeCompare(b.expectedDelivery || ""));
}

function isDelayed(o) {
    return (o.status === "Accepted" || o.status === "In Transit") && o.expectedDelivery && o.expectedDelivery < Store.iso(0);
}

function refresh() {
    loadKpis();
    renderList();
    renderDetail();
}

function loadKpis() {
    const list = activeOrders();
    const count = s => list.filter(o => o.status === s).length;
    document.getElementById("kpiPending").textContent = count("Pending");
    document.getElementById("kpiAccepted").textContent = count("Accepted");
    document.getElementById("kpiTransit").textContent = count("In Transit");
    document.getElementById("kpiTons").textContent = Plant.num(list.reduce((s, o) => s + Number(o.quantity || 0), 0)) + " t";
}

function renderList() {
    const list = activeOrders().filter(o => !statusFilter || o.status === statusFilter);
    const el = document.getElementById("orderList");

    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i>${statusFilter ? "No " + Store.esc(statusFilter.toLowerCase()) + " orders" : "No active orders"}
            <div class="mt-2"><a class="btn btn-secondary btn-sm" href="marketplace.html">Browse marketplace</a></div></div>`;
        return;
    }

    el.innerHTML = list.map(o => `
        <button type="button" class="order-item${o.id === selectedId ? " active" : ""}" data-id="${Store.esc(o.id)}">
            <div class="row">
                <strong>${Store.esc(o.id)}</strong>
                <span class="${isDelayed(o) ? Plant.badge("Delayed") : Store.badge(o.status)}">${isDelayed(o) ? "Delayed" : Store.esc(o.status)}</span>
            </div>
            <small>${Store.esc(o.pelletType)} · ${Plant.num(o.quantity)} t · ${Store.esc(o.manufacturer)}</small>
            <small>Expected ${Store.date(o.expectedDelivery || o.deliveryDate)}</small>
        </button>
    `).join("");
}

function renderDetail() {
    const card = document.getElementById("detailCard");

    if (justDelivered) {
        const o = justDelivered;
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">Order ${Store.esc(o.id)}</div>
                    <div class="card-subtitle">${Store.esc(o.pelletType)} from ${Store.esc(o.manufacturer)}</div>
                </div>
                <span class="${Store.badge("Delivered")}">Delivered</span>
            </div>
            <div class="card-body">
                <div class="stepper mb-3">${STEPS.map(s => `<div class="step done">${s}</div>`).join("")}</div>
                <div class="notice">
                    <i class="fa-solid fa-circle-check"></i>
                    <div>
                        <strong>Receipt confirmed on ${Store.date(o.deliveredOn)}</strong>
                        <p class="text-muted">${Plant.num(o.receivedQty)} t received. Record the measured moisture, ash and calorific value of this batch so the supplier's quality can be tracked.</p>
                        <div class="flex wrap mt-2">
                            <a class="btn btn-primary btn-sm" href="pellet-feedback.html?order=${encodeURIComponent(o.id)}"><i class="fa-solid fa-clipboard-check"></i> Submit Batch Feedback</a>
                            <a class="btn btn-secondary btn-sm" href="history.html">View Purchase History</a>
                        </div>
                    </div>
                </div>
            </div>`;
        return;
    }

    const o = selectedId ? Store.find("pelletOrders", selectedId) : null;

    if (!o || !ACTIVE_STATUSES.includes(o.status)) {
        card.innerHTML = `<div class="empty-state"><i class="fa-solid fa-truck-fast"></i>Select an order to view its tracking details.</div>`;
        return;
    }

    const idx = STEP_INDEX[o.status];
    const stepper = STEPS.map((s, i) => `<div class="step${i <= idx ? " done" : i === idx + 1 ? " current" : ""}">${s}</div>`).join("");

    const days = Plant.daysUntil(o.expectedDelivery || o.deliveryDate);
    const eta = days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? "today" : `${-days} day${days === -1 ? "" : "s"} overdue`;

    card.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">Order ${Store.esc(o.id)}</div>
                <div class="card-subtitle">${Store.esc(o.pelletType)} (${Store.esc(o.grade)}) from ${Store.esc(o.manufacturer)}</div>
            </div>
            <div class="flex">
                ${isDelayed(o) ? `<span class="${Plant.badge("Delayed")}">Delayed</span>` : ""}
                <span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span>
            </div>
        </div>
        <div class="card-body">

            <div class="stepper mb-3">${stepper}</div>

            <div class="detail-section">
                <dl class="detail-list">
                    <div><dt>Quantity</dt><dd>${Plant.num(o.quantity)} tons</dd></div>
                    <div><dt>Order Value</dt><dd>${Store.inr(o.total)}</dd></div>
                    <div><dt>Ordered On</dt><dd>${Store.date(o.orderDate)}</dd></div>
                    <div><dt>Expected Delivery</dt><dd>${Store.date(o.expectedDelivery || o.deliveryDate)} <span class="text-muted">(${eta})</span></dd></div>
                    <div><dt>Vehicle Number</dt><dd>${o.vehicleNo ? Store.esc(o.vehicleNo) : '<span class="text-muted">Not assigned yet</span>'}</dd></div>
                    <div><dt>Supplier</dt><dd>${Store.esc(o.manufacturer)}</dd></div>
                    <div class="span-2"><dt>Delivery Address</dt><dd>${Store.esc(o.deliveryAddress)}</dd></div>
                </dl>
            </div>

            <div class="detail-section">
                <h4>Shipment Timeline</h4>
                <ul class="timeline">${timeline(o, idx)}</ul>
            </div>

            <div class="detail-section">${actions(o)}</div>

        </div>`;
}

function timeline(o, idx) {
    const items = [
        {
            title: "Order placed",
            text: `${Plant.num(o.quantity)} t ordered on ${Store.date(o.orderDate)}`,
            state: "done"
        },
        {
            title: idx >= 1 ? "Accepted by supplier" : "Awaiting supplier confirmation",
            text: idx >= 1 ? `${o.manufacturer} confirmed the order` : `${o.manufacturer} has not responded yet`,
            state: idx >= 1 ? "done" : "current"
        },
        {
            title: idx >= 2 ? "Dispatched" : "Dispatch",
            text: idx >= 2 ? `In transit${o.vehicleNo ? " on vehicle " + o.vehicleNo : ""}` : idx === 1 ? "Supplier is preparing the consignment" : "Pending supplier acceptance",
            state: idx >= 2 ? "done" : idx === 1 ? "current" : ""
        },
        {
            title: "Delivered",
            text: `Expected by ${Store.date(o.expectedDelivery || o.deliveryDate)}`,
            state: idx === 2 ? "current" : ""
        }
    ];

    return items.map(i => `
        <li class="timeline-item${i.state ? " " + i.state : ""}">
            <h4>${Store.esc(i.title)}</h4>
            <p>${Store.esc(i.text)}</p>
        </li>`).join("");
}

function actions(o) {
    if (o.status === "In Transit") {
        return `
            <div class="flex between wrap">
                <p class="text-muted">Pellets arrived at the plant? Confirm receipt to close this delivery.</p>
                <button class="btn btn-primary" type="button" data-action="receipt" data-id="${Store.esc(o.id)}"><i class="fa-solid fa-clipboard-check"></i> Confirm Receipt</button>
            </div>`;
    }
    if (o.status === "Pending") {
        return `
            <div class="notice">
                <i class="fa-solid fa-circle-info"></i>
                <div>Waiting for ${Store.esc(o.manufacturer)} to accept. You can still edit or cancel this order from
                    <a href="purchase-orders.html">Place Pellet Order</a>.</div>
            </div>`;
    }
    return `
        <div class="notice">
            <i class="fa-solid fa-circle-info"></i>
            <div>The supplier has accepted this order. Vehicle and dispatch details will appear here once the consignment leaves the factory.</div>
        </div>`;
}

/* ---------------- Confirm receipt ---------------- */

function openReceipt(id) {
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "In Transit") {
        showToast("Receipt can be confirmed only for orders in transit", "warning");
        refresh();
        return;
    }

    document.getElementById("receiptOrderId").value = o.id;
    const orderDate = document.getElementById("receiptOrderDate");
    orderDate.value = o.orderDate || "";
    orderDate.dispatchEvent(new Event("change"));

    const qty = document.getElementById("receivedQty");
    qty.dataset.rules = `required|number|positive|decimals:2|max:${Number(o.quantity)}`;
    qty.dataset.msgMax = `Quantity received cannot exceed the ordered ${Plant.num(o.quantity)} tons`;
    qty.value = o.quantity;

    document.getElementById("receiptDate").value = Store.iso(0);
    document.getElementById("receiptVehicle").value = o.vehicleNo || "";
    document.getElementById("receiptCondition").value = "";
    document.getElementById("receiptRemarks").value = "";
    document.getElementById("receiptModalTitle").textContent = "Confirm Receipt · " + o.id;
    document.getElementById("receiptSummary").textContent =
        `${Plant.num(o.quantity)} t of ${o.pelletType} from ${o.manufacturer}, ordered on ${Store.date(o.orderDate)}.`;

    Plant.openModal("receiptModal");
}

function confirmReceipt(e) {
    e.preventDefault();

    if (!Validator.validateForm("#receiptForm")) return;

    const id = document.getElementById("receiptOrderId").value;
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "In Transit") {
        Plant.closeModal("receiptModal");
        showToast("This order is no longer in transit", "error");
        refresh();
        return;
    }

    const received = Plant.round(Number(document.getElementById("receivedQty").value), 2);
    const vehicle = document.getElementById("receiptVehicle").value.trim().toUpperCase();

    justDelivered = Store.update("pelletOrders", id, {
        status: "Delivered",
        deliveredOn: document.getElementById("receiptDate").value,
        receivedQty: received,
        receiptVehicle: vehicle,
        receiptCondition: document.getElementById("receiptCondition").value,
        receiptRemarks: document.getElementById("receiptRemarks").value.trim()
    });
    selectedId = null;

    Plant.closeModal("receiptModal");
    showToast(`Receipt confirmed for ${id}. Please submit the pellet batch feedback.`, "success");

    if (received < Number(o.quantity)) {
        showToast(`Short receipt of ${Plant.num(o.quantity - received)} t recorded. You can raise a grievance from Billing & Complaints.`, "warning");
    }

    refresh();
}
