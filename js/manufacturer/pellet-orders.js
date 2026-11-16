// =========================
// PELLET ORDERS RECEIVED (US023)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const TABS = ["All", "Pending", "Accepted", "In Transit", "Delivered", "Rejected"];

let activeTab = "Pending";
let actionId = null;

document.addEventListener("DOMContentLoaded", () => {

    bindModals();

    // open the "All" tab when there is nothing pending
    if (!myOrders().some(o => o.status === "Pending")) activeTab = "All";

    document.getElementById("statusTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        activeTab = tab.dataset.tab;
        render();
    });

    document.getElementById("searchInput").addEventListener("input", renderTable);

    document.addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.dataset.action === "view") viewOrder(id);
        if (btn.dataset.action === "accept") openAccept(id);
        if (btn.dataset.action === "reject") openReject(id);
    });

    document.getElementById("acceptForm").addEventListener("submit", e => {
        e.preventDefault();
        acceptOrder();
    });

    document.getElementById("rejectForm").addEventListener("submit", e => {
        e.preventDefault();
        rejectOrder();
    });

    render();
});

function myOrders() {
    return Store.get("pelletOrders")
        .filter(o => o.manufacturer === MANUFACTURER)
        .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
}

function render() {
    renderTabs();
    renderTable();
}

function renderTabs() {
    const orders = myOrders();
    document.getElementById("statusTabs").innerHTML = TABS.map(t => {
        const count = t === "All" ? orders.length : orders.filter(o => o.status === t).length;
        return `<button type="button" class="tab${t === activeTab ? " active" : ""}" data-tab="${t}">${t}<span class="tab-count">${count}</span></button>`;
    }).join("");
}

function renderTable() {
    const search = document.getElementById("searchInput").value.trim().toLowerCase();
    const list = myOrders().filter(o => {
        if (activeTab !== "All" && o.status !== activeTab) return false;
        if (search && ![o.id, o.powerPlant, o.pelletType, o.grade].join(" ").toLowerCase().includes(search)) return false;
        return true;
    });

    const table = document.getElementById("orderTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-inbox"></i>No ${activeTab === "All" ? "" : activeTab.toLowerCase() + " "}orders found</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(o => {
        const id = Store.esc(o.id);
        let actions = `<button class="btn btn-secondary btn-sm btn-icon" data-action="view" data-id="${id}" title="View details" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>`;
        if (o.status === "Pending") {
            actions += `<button class="btn btn-primary btn-sm" data-action="accept" data-id="${id}"><i class="fa-solid fa-check"></i> Accept</button>
                        <button class="btn btn-danger btn-sm" data-action="reject" data-id="${id}"><i class="fa-solid fa-xmark"></i> Reject</button>`;
        } else if (o.status === "Accepted") {
            actions += `<a class="btn btn-secondary btn-sm" href="pellet-tracking.html?order=${encodeURIComponent(o.id)}"><i class="fa-solid fa-truck-ramp-box"></i> Dispatch</a>`;
        } else if (o.status === "In Transit") {
            actions += `<a class="btn btn-secondary btn-sm" href="pellet-tracking.html?order=${encodeURIComponent(o.id)}"><i class="fa-solid fa-route"></i> Track</a>`;
        }
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td>${Store.esc(o.powerPlant)}</td>
            <td class="order-pellet">${Store.esc(o.pelletType)}<small>${Store.esc(o.grade)}</small></td>
            <td>${Store.esc(o.quantity)} t</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(o.deliveryDate)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
            <td><div class="table-actions">${actions}</div></td>
        </tr>`;
    }).join("");
}

/* ---------- View ---------- */

function viewOrder(id) {
    const o = Store.find("pelletOrders", id);
    if (!o) return notFound();

    document.getElementById("viewTitle").textContent = "Order " + o.id;
    document.getElementById("viewBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></dd></div>
            <div><dt>Power plant</dt><dd>${Store.esc(o.powerPlant)}</dd></div>
            <div><dt>Listing</dt><dd>${Store.esc(o.listingId || "—")}</dd></div>
            <div><dt>Pellets</dt><dd>${Store.esc(o.pelletType)} (${Store.esc(o.grade)})</dd></div>
            <div><dt>Quantity</dt><dd>${Store.esc(o.quantity)} tons</dd></div>
            <div><dt>Price / ton</dt><dd>${Store.inr(o.price)}</dd></div>
            <div><dt>Order total</dt><dd>${Store.inr(o.total)}</dd></div>
            <div><dt>Order date</dt><dd>${Store.date(o.orderDate)}</dd></div>
            <div><dt>Requested delivery</dt><dd>${Store.date(o.deliveryDate)}</dd></div>
            <div><dt>Expected delivery</dt><dd>${Store.date(o.expectedDelivery)}</dd></div>
            <div class="span-2"><dt>Delivery address</dt><dd>${Store.esc(o.deliveryAddress || "—")}</dd></div>
            ${o.notes ? `<div class="span-2"><dt>Buyer notes</dt><dd>${Store.esc(o.notes)}</dd></div>` : ""}
            ${o.acceptNote ? `<div class="span-2"><dt>Your note</dt><dd>${Store.esc(o.acceptNote)}</dd></div>` : ""}
            ${o.rejectReason ? `<div class="span-2"><dt>Rejection reason</dt><dd>${Store.esc(o.rejectReason)}</dd></div>` : ""}
        </dl>`;

    document.getElementById("viewFooter").innerHTML =
        (o.status === "Pending"
            ? `<button type="button" class="btn btn-danger" data-action="reject" data-id="${Store.esc(o.id)}">Reject</button>
               <button type="button" class="btn btn-primary" data-action="accept" data-id="${Store.esc(o.id)}">Accept</button>`
            : "") +
        `<button type="button" class="btn btn-secondary" data-close>Close</button>`;

    openModal("viewModal");
}

/* ---------- Accept ---------- */

function openAccept(id) {
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "Pending") return notPending();

    closeModal("viewModal");
    actionId = id;

    const listing = o.listingId ? Store.find("pelletListings", o.listingId) : null;
    let info = o.id + " · " + o.quantity + " t " + o.pelletType + " for " + o.powerPlant + " (" + Store.inr(o.total) + ").";
    if (listing && Number(listing.quantity) < Number(o.quantity)) {
        info += " Note: listing " + listing.id + " currently shows only " + listing.quantity + " t in stock.";
    }
    document.getElementById("acceptInfo").textContent = info;
    document.getElementById("requestedHint").textContent = "Requested by the power plant: " + Store.date(o.deliveryDate);

    // suggest the requested date when it is still achievable
    const date = document.getElementById("expectedDelivery");
    date.value = o.deliveryDate && o.deliveryDate >= Store.iso(0) && o.deliveryDate <= Store.iso(90) ? o.deliveryDate : "";

    openModal("acceptModal");
}

function acceptOrder() {
    const form = document.getElementById("acceptForm");
    if (!Validator.validateForm(form)) return;

    const o = Store.find("pelletOrders", actionId);
    if (!o || o.status !== "Pending") {
        closeModal("acceptModal");
        return notPending();
    }

    const expected = document.getElementById("expectedDelivery").value;
    Store.update("pelletOrders", o.id, {
        status: "Accepted",
        expectedDelivery: expected,
        acceptedOn: Store.iso(0),
        acceptNote: document.getElementById("acceptNote").value.trim()
    });

    closeModal("acceptModal");
    showToast("Order " + o.id + " accepted. " + o.powerPlant + " has been notified of delivery by " + Store.date(expected) + ".", "success", { title: "Order accepted" });
    render();
}

/* ---------- Reject ---------- */

function openReject(id) {
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "Pending") return notPending();

    closeModal("viewModal");
    actionId = id;
    document.getElementById("rejectInfo").textContent =
        o.id + " · " + o.quantity + " t " + o.pelletType + " for " + o.powerPlant + ". The power plant will see the reason you provide.";
    openModal("rejectModal");
}

function rejectOrder() {
    const form = document.getElementById("rejectForm");
    if (!Validator.validateForm(form)) return;

    const o = Store.find("pelletOrders", actionId);
    if (!o || o.status !== "Pending") {
        closeModal("rejectModal");
        return notPending();
    }

    const reason = document.getElementById("rejectReason").value;
    const details = document.getElementById("rejectDetails").value.trim();

    Store.update("pelletOrders", o.id, {
        status: "Rejected",
        rejectReason: reason + " — " + details,
        rejectedOn: Store.iso(0)
    });

    closeModal("rejectModal");
    showToast("Order " + o.id + " from " + o.powerPlant + " has been rejected.", "success", { title: "Order rejected" });
    render();
}

function notPending() {
    showToast("This order is no longer pending.", "warning");
    render();
}

function notFound() {
    showToast("Order not found.", "error");
    render();
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
