// =========================
// PELLET ORDER TRACKING (US024)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const TRACKED = ["Accepted", "In Transit", "Delivered"];

const STEPS = [
    { status: "Pending", label: "Order Placed" },
    { status: "Accepted", label: "Accepted" },
    { status: "In Transit", label: "Dispatched" },
    { status: "Delivered", label: "Delivered" }
];

let selectedId = null;

document.addEventListener("DOMContentLoaded", () => {

    bindModals();

    const orders = trackedOrders();
    const requested = new URLSearchParams(location.search).get("order");

    if (requested && orders.some(o => o.id === requested)) {
        selectedId = requested;
    } else {
        if (requested) showToast("Order " + requested + " is not ready for tracking yet. Accept it first.", "warning");
        selectedId = orders[0] ? orders[0].id : null;
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
        if (e.target.closest("#dispatchBtn")) openDispatch();
        if (e.target.closest("#deliveredBtn")) markDelivered();
    });

    document.getElementById("dispatchForm").addEventListener("submit", e => {
        e.preventDefault();
        dispatchOrder();
    });

    renderAll();
});

function trackedOrders() {
    return Store.get("pelletOrders")
        .filter(o => o.manufacturer === MANUFACTURER && TRACKED.includes(o.status))
        .sort((a, b) =>
            (TRACKED.indexOf(a.status) - TRACKED.indexOf(b.status)) ||
            String(a.expectedDelivery).localeCompare(String(b.expectedDelivery)));
}

function renderAll() {
    renderKpis();
    renderList();
    renderDetail();
}

function renderKpis() {
    const orders = trackedOrders();
    const today = Store.iso(0);
    const week = Store.iso(7);
    document.getElementById("kpiReady").textContent = orders.filter(o => o.status === "Accepted").length;
    document.getElementById("kpiTransit").textContent = orders.filter(o => o.status === "In Transit").length;
    document.getElementById("kpiDue").textContent = orders.filter(o =>
        o.status !== "Delivered" && o.expectedDelivery >= today && o.expectedDelivery <= week).length;
    document.getElementById("kpiDelivered").textContent = orders.filter(o => o.status === "Delivered").length;
}

function renderList() {
    const search = document.getElementById("orderSearch").value.trim().toLowerCase();
    const list = trackedOrders().filter(o =>
        !search || [o.id, o.powerPlant, o.pelletType].join(" ").toLowerCase().includes(search));

    const el = document.getElementById("orderList");

    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-route"></i>No shipments yet.<br><small>Accept pellet orders to start dispatching.</small></div>`;
        return;
    }

    el.innerHTML = list.map(o => `
        <button type="button" class="order-item${o.id === selectedId ? " active" : ""}" data-id="${Store.esc(o.id)}">
            <span>
                <strong>${Store.esc(o.id)}</strong>
                <small>${Store.esc(o.pelletType)} · ${Store.esc(o.quantity)} t</small>
                <small>${Store.esc(o.powerPlant)}</small>
            </span>
            <span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span>
        </button>
    `).join("");
}

function renderDetail() {
    const box = document.getElementById("trackDetail");
    const o = selectedId ? Store.find("pelletOrders", selectedId) : null;

    if (!o || !TRACKED.includes(o.status)) {
        box.innerHTML = `<div class="empty-state"><i class="fa-solid fa-route"></i>Select a shipment to see its details.<br>
            <a class="btn btn-primary btn-sm mt-2" href="pellet-orders.html">View pellet orders</a></div>`;
        return;
    }

    const idx = STEPS.findIndex(s => s.status === o.status);

    const stepper = STEPS.map((s, i) => {
        const cls = (i < idx || o.status === "Delivered") ? "done" : (i === idx ? "current" : "");
        return `<div class="step ${cls}">${s.label}</div>`;
    }).join("");

    const timeline = [
        { title: "Order placed", text: o.powerPlant + " ordered on " + Store.date(o.orderDate), state: "done" },
        { title: "Accepted", text: o.acceptedOn ? "Accepted on " + Store.date(o.acceptedOn) : "Order confirmed", state: "done" },
        {
            title: "Dispatched",
            text: idx >= 2
                ? "Vehicle " + (o.vehicleNo || "—") + (o.dispatchDate ? " · " + Store.date(o.dispatchDate) : "") + (o.driverName ? " · " + o.driverName : "")
                : "Waiting for dispatch",
            state: idx >= 2 ? "done" : "current"
        },
        {
            title: "Delivered",
            text: o.status === "Delivered"
                ? "Delivered on " + Store.date(o.deliveredOn || o.expectedDelivery)
                : "Expected by " + Store.date(o.expectedDelivery),
            state: o.status === "Delivered" ? "done" : idx === 2 ? "current" : ""
        }
    ].map(t => `<li class="timeline-item ${t.state}"><h4>${t.title}</h4><p>${Store.esc(t.text)}</p></li>`).join("");

    const overdue = o.status !== "Delivered" && o.expectedDelivery && o.expectedDelivery < Store.iso(0);
    const note = overdue
        ? `<div class="track-note danger"><i class="fa-solid fa-triangle-exclamation"></i> Expected delivery date (${Store.date(o.expectedDelivery)}) has passed.</div>`
        : o.status === "Accepted"
        ? `<div class="track-note info"><i class="fa-solid fa-circle-info"></i> Enter vehicle and driver details to dispatch this order.</div>`
        : "";

    box.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">${Store.esc(o.id)} · ${Store.esc(o.pelletType)}</div>
                <div class="card-subtitle">To ${Store.esc(o.powerPlant)}</div>
            </div>
            <span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span>
        </div>
        <div class="card-body">
            <div class="stepper track-stepper">${stepper}</div>
            ${note}
            <div class="track-grid">
                <div>
                    <div class="track-subtitle">Shipment details</div>
                    <dl class="detail-list">
                        <div><dt>Quantity</dt><dd>${Store.esc(o.quantity)} tons (${Store.esc(o.grade)})</dd></div>
                        <div><dt>Order value</dt><dd>${Store.inr(o.total)}</dd></div>
                        <div><dt>Order date</dt><dd>${Store.date(o.orderDate)}</dd></div>
                        <div><dt>Expected delivery</dt><dd>${Store.date(o.expectedDelivery)}</dd></div>
                        <div><dt>Vehicle no.</dt><dd>${Store.esc(o.vehicleNo || "—")}</dd></div>
                        <div><dt>Transporter</dt><dd>${Store.esc(o.transporter || "—")}</dd></div>
                        <div><dt>Driver</dt><dd>${Store.esc(o.driverName || "—")}</dd></div>
                        <div><dt>Driver mobile</dt><dd>${Store.esc(o.driverMobile || "—")}</dd></div>
                        <div class="span-2"><dt>Delivery address</dt><dd>${Store.esc(o.deliveryAddress || "—")}</dd></div>
                    </dl>
                </div>
                <div>
                    <div class="track-subtitle">Timeline</div>
                    <ul class="timeline">${timeline}</ul>
                </div>
            </div>
        </div>
        ${o.status === "Delivered" ? "" : `
        <div class="track-actions">
            ${o.status === "Accepted" ? `<button type="button" class="btn btn-primary" id="dispatchBtn"><i class="fa-solid fa-truck-fast"></i> Dispatch Order</button>` : ""}
            ${o.status === "In Transit" ? `<button type="button" class="btn btn-primary" id="deliveredBtn"><i class="fa-solid fa-circle-check"></i> Mark as Delivered</button>` : ""}
        </div>`}`;
}

/* ---------- Dispatch ---------- */

function openDispatch() {
    const o = Store.find("pelletOrders", selectedId);
    if (!o || o.status !== "Accepted") {
        showToast("Only accepted orders can be dispatched.", "warning");
        return renderAll();
    }

    const dispatch = document.getElementById("dispatchDate");
    const minDate = o.acceptedOn || o.orderDate || Store.iso(-30);
    dispatch.dataset.rules = "required|date|notFuture|minDate:" + minDate;
    dispatch.dataset.msgMinDate = "Dispatch date cannot be before the order was accepted (" + Store.date(minDate) + ")";
    dispatch.min = minDate;
    dispatch.value = Store.iso(0);

    const expected = document.getElementById("expectedDate");
    expected.min = Store.iso(1);
    expected.value = o.expectedDelivery && o.expectedDelivery > Store.iso(0) ? o.expectedDelivery : "";

    document.getElementById("dispatchInfo").textContent =
        o.id + " · " + o.quantity + " t " + o.pelletType + " to " + o.powerPlant + ", " + (o.deliveryAddress || "");

    openModal("dispatchModal");
}

function dispatchOrder() {
    const form = document.getElementById("dispatchForm");
    if (!Validator.validateForm(form)) return;

    const o = Store.find("pelletOrders", selectedId);
    if (!o || o.status !== "Accepted") {
        closeModal("dispatchModal");
        showToast("This order can no longer be dispatched.", "error");
        return renderAll();
    }

    const val = id => document.getElementById(id).value.trim();
    const expected = val("expectedDate");

    Store.update("pelletOrders", o.id, {
        status: "In Transit",
        vehicleNo: val("vehicleNo").toUpperCase().replace(/[\s-]/g, ""),
        transporter: val("transporter"),
        driverName: val("driverName"),
        driverMobile: val("driverMobile"),
        dispatchDate: val("dispatchDate"),
        expectedDelivery: expected
    });

    closeModal("dispatchModal");
    showToast(o.id + " dispatched. " + o.powerPlant + " can expect delivery by " + Store.date(expected) + ".", "success", { title: "Order dispatched" });
    renderAll();
}

/* ---------- Delivered ---------- */

async function markDelivered() {
    const o = Store.find("pelletOrders", selectedId);
    if (!o || o.status !== "In Transit") {
        showToast("Only in-transit orders can be marked as delivered.", "warning");
        return renderAll();
    }

    const ok = await confirmDialog({
        title: "Mark as delivered?",
        message: "Confirm that " + o.quantity + " t of " + o.pelletType + " (" + o.id + ") reached " + o.powerPlant + ". An invoice will be raised under Billing.",
        confirmText: "Mark delivered"
    });
    if (!ok) return;

    Store.update("pelletOrders", o.id, { status: "Delivered", deliveredOn: Store.iso(0) });
    showToast(o.id + " marked as delivered. The sale now appears in Pellet Sales History.", "success", { title: "Delivery complete" });
    renderAll();
}

/* ---------- Modal helpers ---------- */

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
