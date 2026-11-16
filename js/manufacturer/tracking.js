// =========================
// PURCHASE TRACKING (US018)
// =========================

const MANUFACTURER = "GreenPellet Industries";

const STEPS = [
    { status: "Pending", label: "Order Placed" },
    { status: "Accepted", label: "Accepted" },
    { status: "In Transit", label: "In Transit" },
    { status: "Delivered", label: "Delivered" }
];

const SORT_ORDER = ["In Transit", "Accepted", "Pending", "Delivered", "Rejected", "Cancelled"];

let selectedId = null;

document.addEventListener("DOMContentLoaded", () => {

    bindModals();

    const orders = myOrders();
    const requested = new URLSearchParams(location.search).get("order");

    if (requested && orders.some(o => o.id === requested)) {
        selectedId = requested;
    } else {
        if (requested) showToast("Order " + requested + " was not found in your purchase orders.", "warning");
        const first = sortOrders(orders)[0];
        selectedId = first ? first.id : null;
    }

    document.getElementById("orderSearch").addEventListener("input", renderList);

    document.getElementById("orderList").addEventListener("click", e => {
        const item = e.target.closest(".order-item");
        if (!item) return;
        selectedId = item.dataset.id;
        renderList();
        renderDetail();
    });

    document.getElementById("trackDetail").addEventListener("click", e => {
        if (e.target.closest("#confirmReceiptBtn")) openReceipt();
    });

    document.getElementById("receiptForm").addEventListener("submit", e => {
        e.preventDefault();
        confirmReceipt();
    });

    renderAll();
});

function myOrders() {
    return Store.get("purchaseOrders").filter(o => o.manufacturer === MANUFACTURER);
}

function sortOrders(list) {
    return list.slice().sort((a, b) =>
        (SORT_ORDER.indexOf(a.status) - SORT_ORDER.indexOf(b.status)) ||
        String(b.orderDate).localeCompare(String(a.orderDate)));
}

function renderAll() {
    renderKpis();
    renderList();
    renderDetail();
}

function renderKpis() {
    const orders = myOrders();
    const count = s => orders.filter(o => o.status === s).length;
    document.getElementById("kpiPending").textContent = count("Pending");
    document.getElementById("kpiAccepted").textContent = count("Accepted");
    document.getElementById("kpiTransit").textContent = count("In Transit");
    document.getElementById("kpiDelivered").textContent = count("Delivered");
}

function renderList() {
    const search = document.getElementById("orderSearch").value.trim().toLowerCase();
    const list = sortOrders(myOrders()).filter(o =>
        !search || [o.id, o.farmer, o.biomassType].join(" ").toLowerCase().includes(search));

    const el = document.getElementById("orderList");

    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box-open"></i>No orders found</div>`;
        return;
    }

    el.innerHTML = list.map(o => `
        <button type="button" class="order-item${o.id === selectedId ? " active" : ""}" data-id="${Store.esc(o.id)}">
            <span>
                <strong>${Store.esc(o.id)}</strong>
                <small>${Store.esc(o.biomassType)} · ${Store.esc(o.quantity)} t</small>
                <small>${Store.esc(o.farmer)}</small>
            </span>
            <span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span>
        </button>
    `).join("");
}

function renderDetail() {
    const box = document.getElementById("trackDetail");
    const o = selectedId ? Store.find("purchaseOrders", selectedId) : null;

    if (!o) {
        box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-truck-fast"></i>Select an order to see its tracking details.<br>
            <a class="btn btn-primary btn-sm mt-2" href="marketplace.html">Browse biomass</a></div>`;
        return;
    }

    const closed = ["Rejected", "Cancelled"].includes(o.status);
    const idx = closed ? 0 : STEPS.findIndex(s => s.status === o.status);

    const stepper = STEPS.map((s, i) => {
        const cls = (i < idx || o.status === "Delivered") ? "done" : (i === idx ? "current" : "");
        return `<div class="step ${cls}">${s.label}</div>`;
    }).join("");

    const timeline = [
        {
            title: "Order placed",
            text: "Sent to " + o.farmer + " on " + Store.date(o.orderDate),
            state: "done"
        },
        {
            title: o.status === "Rejected" ? "Rejected by farmer" : "Accepted by farmer",
            text: o.status === "Rejected" ? (o.rejectReason || "The farmer declined this order")
                : o.status === "Cancelled" ? "Order cancelled on " + Store.date(o.cancelledOn)
                : idx >= 1 ? (o.acceptedOn ? "Accepted on " + Store.date(o.acceptedOn) : "Farmer confirmed the order")
                : "Waiting for the farmer to respond",
            state: closed ? "done" : idx >= 1 ? "done" : "current"
        },
        {
            title: "In transit",
            text: idx >= 2 ? "Vehicle " + (o.vehicleNo || "details pending") + (o.dispatchedOn ? " · dispatched " + Store.date(o.dispatchedOn) : "")
                : "Dispatch pending",
            state: closed ? "" : idx >= 2 ? "done" : idx === 1 ? "current" : ""
        },
        {
            title: "Delivered",
            text: o.status === "Delivered"
                ? "Received on " + Store.date(o.deliveredOn || o.expectedDelivery) + (o.receivedQty ? " · " + o.receivedQty + " t received" : "")
                : "Expected by " + Store.date(o.expectedDelivery || o.deliveryDate),
            state: closed ? "" : o.status === "Delivered" ? "done" : idx === 2 ? "current" : ""
        }
    ].map(t => `<li class="timeline-item ${t.state}"><h4>${t.title}</h4><p>${Store.esc(t.text)}</p></li>`).join("");

    const note = o.status === "Rejected"
        ? `<div class="track-note danger"><i class="fa-solid fa-circle-xmark"></i> This order was rejected by the farmer${o.rejectReason ? ": " + Store.esc(o.rejectReason) : "."}</div>`
        : o.status === "Cancelled"
        ? `<div class="track-note danger"><i class="fa-solid fa-ban"></i> You cancelled this order.</div>`
        : o.status === "In Transit"
        ? `<div class="track-note info"><i class="fa-solid fa-truck"></i> Shipment is on the way. Confirm receipt once the material reaches your plant.</div>`
        : "";

    box.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">${Store.esc(o.id)} · ${Store.esc(o.biomassType)}</div>
                <div class="card-subtitle">From ${Store.esc(o.farmer)}</div>
            </div>
            <span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span>
        </div>
        <div class="card-body">
            ${closed ? "" : `<div class="stepper track-stepper">${stepper}</div>`}
            ${note}
            <div class="track-grid">
                <div>
                    <div class="track-subtitle">Order details</div>
                    <dl class="detail-list">
                        <div><dt>Quantity</dt><dd>${Store.esc(o.quantity)} tons</dd></div>
                        <div><dt>Order value</dt><dd>${Store.inr(o.total)}</dd></div>
                        <div><dt>Order date</dt><dd>${Store.date(o.orderDate)}</dd></div>
                        <div><dt>Requested delivery</dt><dd>${Store.date(o.deliveryDate)}</dd></div>
                        <div><dt>Expected delivery</dt><dd>${Store.date(o.expectedDelivery)}</dd></div>
                        <div><dt>Vehicle no.</dt><dd>${Store.esc(o.vehicleNo || "—")}</dd></div>
                        <div class="span-2"><dt>Delivery address</dt><dd>${Store.esc(o.deliveryAddress || "—")}</dd></div>
                    </dl>
                </div>
                <div>
                    <div class="track-subtitle">Timeline</div>
                    <ul class="timeline">${timeline}</ul>
                </div>
            </div>
        </div>
        <div class="track-actions">
            ${["In Transit", "Delivered"].includes(o.status) ? `<a class="btn btn-secondary" href="billing.html"><i class="fa-solid fa-flag"></i> Report an Issue</a>` : ""}
            ${o.status === "Pending" ? `<a class="btn btn-secondary" href="purchase-orders.html"><i class="fa-solid fa-pen-to-square"></i> Manage Order</a>` : ""}
            ${o.status === "In Transit" ? `<button type="button" class="btn btn-primary" id="confirmReceiptBtn"><i class="fa-solid fa-clipboard-check"></i> Confirm Receipt</button>` : ""}
        </div>`;
}

/* ---------------- Confirm receipt ---------------- */

function openReceipt() {
    const o = Store.find("purchaseOrders", selectedId);
    if (!o || o.status !== "In Transit") {
        showToast("Only in-transit orders can be marked as received.", "warning");
        return;
    }

    const date = document.getElementById("receivedDate");
    const qty = document.getElementById("receivedQty");
    const minDate = o.orderDate || Store.iso(-90);

    date.dataset.rules = "required|date|notFuture|minDate:" + minDate;
    date.min = minDate;
    date.max = Store.iso(0);
    date.value = Store.iso(0);

    qty.dataset.rules = "required|number|positive|max:" + Number(o.quantity) + "|decimals:2";
    qty.dataset.msgMax = "Received quantity cannot exceed the ordered " + o.quantity + " tons";
    qty.value = o.quantity;

    document.getElementById("receiptInfo").textContent =
        o.id + " · " + o.quantity + " tons of " + o.biomassType + " from " + o.farmer + (o.vehicleNo ? " (vehicle " + o.vehicleNo + ")" : "");

    openModal("receiptModal");
}

function confirmReceipt() {
    const form = document.getElementById("receiptForm");
    if (!Validator.validateForm(form)) return;

    const o = Store.find("purchaseOrders", selectedId);
    if (!o || o.status !== "In Transit") {
        closeModal("receiptModal");
        showToast("This order is no longer in transit.", "error");
        renderAll();
        return;
    }

    const receivedQty = Number(document.getElementById("receivedQty").value);

    Store.update("purchaseOrders", o.id, {
        status: "Delivered",
        deliveredOn: document.getElementById("receivedDate").value,
        receivedQty,
        receiptRemarks: document.getElementById("receiptRemarks").value.trim()
    });

    closeModal("receiptModal");
    showToast("Receipt confirmed for " + o.id + ". The order is now marked as delivered.", "success", { title: "Delivery received" });

    if (receivedQty < Number(o.quantity)) {
        const shortBy = Math.round((Number(o.quantity) - receivedQty) * 100) / 100;
        showToast("Short delivery of " + shortBy + " tons recorded. You can raise a grievance from Billing & Complaints.", "warning");
    }

    renderAll();
}

/* ---------------- Modal helpers ---------------- */

function openModal(id) {
    document.getElementById(id).classList.add("open");
}

function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("open");
    const form = modal.querySelector("form");
    if (form) {
        form.reset();
        Validator.reset(form);
    }
}

function bindModals() {
    document.querySelectorAll(".modal-backdrop[id]").forEach(modal => {
        modal.addEventListener("click", e => {
            if (e.target === modal || e.target.closest("[data-close]")) closeModal(modal.id);
        });
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") document.querySelectorAll(".modal-backdrop.open[id]").forEach(m => closeModal(m.id));
    });
}
