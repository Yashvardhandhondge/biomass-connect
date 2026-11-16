// =========================
// FARMER — ORDERS RECEIVED (US011)
// =========================

const ORDER_TABS = ["All", "Pending", "Accepted", "In Transit", "Delivered", "Rejected", "Cancelled"];
let activeTab = "All";
let updateRejectCount = () => {};

document.addEventListener("DOMContentLoaded", () => {

    const tabParam = Farmer.param("status");
    if (ORDER_TABS.includes(tabParam)) activeTab = tabParam;

    updateRejectCount = Farmer.counter("rejectReason", "rejectCount", 300);

    document.getElementById("searchInput").addEventListener("input", render);

    document.getElementById("statusTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        activeTab = tab.dataset.tab;
        render();
    });

    document.getElementById("ordersTable").addEventListener("click", onAction);
    document.getElementById("viewFooter").addEventListener("click", onAction);

    document.getElementById("acceptForm").addEventListener("submit", e => {
        e.preventDefault();
        acceptOrder();
    });

    document.getElementById("rejectForm").addEventListener("submit", e => {
        e.preventDefault();
        rejectOrder();
    });

    render();

    const id = Farmer.param("id");
    if (id) {
        if (findOrder(id)) openView(id);
        else showToast("Order " + id + " was not found", "warning");
    }
});

/* ---------- Data ---------- */

function sortedOrders() {
    // newest first, pending orders on top
    return Farmer.orders().sort((a, b) =>
        (a.status === "Pending" ? 0 : 1) - (b.status === "Pending" ? 0 : 1) ||
        String(b.orderDate).localeCompare(String(a.orderDate)));
}

function findOrder(id) {
    const o = Store.find("purchaseOrders", id);
    return o && o.farmer === FARMER_NAME ? o : null;
}

/* ---------- Rendering ---------- */

function render() {
    const orders = sortedOrders();
    renderTabs(orders);

    const pending = orders.filter(o => o.status === "Pending").length;
    document.getElementById("pendingNote").textContent = pending
        ? pending + " order" + (pending === 1 ? "" : "s") + " awaiting your response"
        : "No orders awaiting your response";

    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const rows = orders.filter(o =>
        (activeTab === "All" || o.status === activeTab) &&
        (!q || [o.id, o.manufacturer, o.biomassType].join(" ").toLowerCase().includes(q)));

    const table = document.getElementById("ordersTable");

    if (!rows.length) {
        table.innerHTML = Farmer.emptyRow(9, "fa-inbox",
            q ? "No orders match your search." : (activeTab === "All" ? "No orders received yet." : "No " + activeTab.toLowerCase() + " orders."));
        return;
    }

    table.innerHTML = rows.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.biomassType)}</td>
            <td>${Farmer.tons(o.quantity)}</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(o.expectedDelivery || o.deliveryDate)}</td>
            <td>${Farmer.badge(o.status)}</td>
            <td><div class="table-actions">${actionButtons(o, true)}</div></td>
        </tr>`).join("");
}

function renderTabs(orders) {
    document.getElementById("statusTabs").innerHTML = ORDER_TABS.map(t => {
        const count = t === "All" ? orders.length : orders.filter(o => o.status === t).length;
        return `<button type="button" class="tab${t === activeTab ? " active" : ""}" data-tab="${t}" role="tab"
                    aria-selected="${t === activeTab}">${t} <span class="tab-count">${count}</span></button>`;
    }).join("");
}

function actionButtons(o, includeView) {
    const id = Store.esc(o.id);
    let html = includeView
        ? `<button type="button" class="btn btn-secondary btn-sm btn-icon" data-action="view" data-id="${id}" title="View details" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>`
        : "";

    if (o.status === "Pending") {
        html += `<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-id="${id}"><i class="fa-solid fa-check"></i> Accept</button>
                 <button type="button" class="btn btn-danger btn-sm" data-action="reject" data-id="${id}"><i class="fa-solid fa-xmark"></i> Reject</button>`;
    } else if (o.status === "Accepted" || o.status === "In Transit") {
        html += `<a class="btn btn-secondary btn-sm" href="tracking.html?id=${encodeURIComponent(o.id)}"><i class="fa-solid fa-truck-fast"></i> Track</a>`;
    }
    return html;
}

function onAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") openView(id);
    if (btn.dataset.action === "accept") openAccept(id);
    if (btn.dataset.action === "reject") openReject(id);
}

/* ---------- View ---------- */

function stepperHtml(o) {
    if (o.status === "Rejected" || o.status === "Cancelled") {
        return `<div class="order-closed"><i class="fa-solid fa-circle-xmark"></i> This order was ${o.status.toLowerCase()}${o.rejectedDate ? " on " + Store.date(o.rejectedDate) : ""}.</div>`;
    }
    const steps = ["Pending", "Accepted", "In Transit", "Delivered"];
    const labels = ["Placed", "Accepted", "In Transit", "Delivered"];
    const idx = steps.indexOf(o.status);
    const final = o.status === "Delivered";
    return `<div class="stepper">${labels.map((l, i) =>
        `<div class="step${i < idx || (final && i === idx) ? " done" : i === idx ? " current" : ""}">${l}</div>`).join("")}</div>`;
}

function openView(id) {
    const o = findOrder(id);
    if (!o) {
        showToast("Order " + id + " no longer exists", "error");
        render();
        return;
    }

    const rows = [
        ["Manufacturer", o.manufacturer],
        ["Status", null, Farmer.badge(o.status)],
        ["Biomass", o.biomassType],
        ["Listing", o.listingId || "—"],
        ["Quantity", Farmer.tons(o.quantity)],
        ["Price / Ton", Store.inr(o.price)],
        ["Order Amount", Store.inr(o.total)],
        ["Order Date", Store.date(o.orderDate)],
        ["Requested Delivery", Store.date(o.deliveryDate)],
        ["Expected Delivery", Store.date(o.expectedDelivery)],
        ["Vehicle No.", o.vehicleNo || "—"],
        ["Delivery Address", o.deliveryAddress || "—"]
    ];
    if (o.notes) rows.push(["Buyer Notes", o.notes]);
    if (o.farmerNote) rows.push(["Your Note", o.farmerNote]);
    if (o.rejectReason) rows.push(["Rejection Reason", o.rejectReason]);

    document.getElementById("viewTitle").textContent = "Order " + o.id;
    document.getElementById("viewBody").innerHTML =
        stepperHtml(o) +
        `<dl class="detail-list mt-3">${rows.map(r =>
            `<div${r[0] === "Delivery Address" || r[0].includes("Note") || r[0].includes("Reason") ? ' class="span-full"' : ""}>
                <dt>${r[0]}</dt><dd>${r[2] || Store.esc(r[1])}</dd></div>`).join("")}</dl>`;

    document.getElementById("viewFooter").innerHTML =
        `<button type="button" class="btn btn-secondary" data-close>Close</button>` + actionButtons(o, false);

    Farmer.openModal("viewModal");
}

/* ---------- Accept ---------- */

function summaryHtml(o) {
    return `<strong>${Store.esc(o.id)}</strong> · ${Store.esc(o.manufacturer)}<br>
            <span class="text-muted">${Farmer.tons(o.quantity)} of ${Store.esc(o.biomassType)} · ${Store.inr(o.total)}</span>`;
}

function openAccept(id) {
    const o = findOrder(id);
    if (!o || o.status !== "Pending") {
        showToast(o ? "Order " + id + " is already " + o.status.toLowerCase() : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    Farmer.closeModal("viewModal");
    document.getElementById("acceptId").value = o.id;
    document.getElementById("acceptSummary").innerHTML = summaryHtml(o);

    const today = Farmer.today();
    const max = Farmer.addDays(today, 90);
    const requested = o.deliveryDate;
    document.getElementById("acceptDelivery").value =
        requested && requested >= today && requested <= max ? requested : Farmer.addDays(today, 3);
    document.getElementById("acceptHint").textContent = requested
        ? "Buyer requested delivery by " + Store.date(requested) + ". Must be between today and the next 90 days."
        : "Between today and the next 90 days";

    Farmer.openModal("acceptModal");
}

async function acceptOrder() {

    if (!Validator.validateForm("#acceptForm")) return;

    const id = document.getElementById("acceptId").value;
    const o = findOrder(id);
    if (!o || o.status !== "Pending") {
        Farmer.closeModal("acceptModal");
        showToast(o ? "Order " + id + " is already " + o.status.toLowerCase() : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    const listing = o.listingId ? Store.find("biomassListings", o.listingId) : null;
    if (listing && Number(listing.quantity) < Number(o.quantity)) {
        const ok = await confirmDialog({
            title: "Not enough stock listed",
            message: "Listing " + listing.id + " shows only " + Farmer.tons(listing.quantity) + " but this order is for " +
                Farmer.tons(o.quantity) + ". Accept the order anyway?",
            confirmText: "Accept anyway"
        });
        if (!ok) return;
    }

    const expected = document.getElementById("acceptDelivery").value;

    Store.update("purchaseOrders", id, {
        status: "Accepted",
        expectedDelivery: expected,
        farmerNote: document.getElementById("acceptNote").value.trim(),
        acceptedDate: Farmer.today()
    });

    Farmer.closeModal("acceptModal");
    render();
    showToast("Order " + id + " accepted. Expected delivery on " + Store.date(expected) + ".", "success");
}

/* ---------- Reject ---------- */

function openReject(id) {
    const o = findOrder(id);
    if (!o || o.status !== "Pending") {
        showToast(o ? "Order " + id + " is already " + o.status.toLowerCase() : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    Farmer.closeModal("viewModal");
    document.getElementById("rejectId").value = o.id;
    document.getElementById("rejectSummary").innerHTML = summaryHtml(o);
    updateRejectCount();
    Farmer.openModal("rejectModal");
}

async function rejectOrder() {

    if (!Validator.validateForm("#rejectForm")) return;

    const id = document.getElementById("rejectId").value;
    const o = findOrder(id);
    if (!o || o.status !== "Pending") {
        Farmer.closeModal("rejectModal");
        showToast(o ? "Order " + id + " is already " + o.status.toLowerCase() : "Order " + id + " no longer exists", "warning");
        render();
        return;
    }

    const ok = await confirmDialog({
        title: "Reject order " + id + "?",
        message: o.manufacturer + " will be notified that their order for " + Farmer.tons(o.quantity) + " of " +
            o.biomassType + " was rejected. This cannot be undone.",
        confirmText: "Reject Order",
        danger: true
    });
    if (!ok) return;

    const category = document.getElementById("rejectCategory").value;
    const details = document.getElementById("rejectReason").value.trim();

    Store.update("purchaseOrders", id, {
        status: "Rejected",
        rejectCategory: category,
        rejectReason: category + " — " + details,
        rejectedDate: Farmer.today()
    });

    Farmer.closeModal("rejectModal");
    render();
    showToast("Order " + id + " rejected. " + o.manufacturer + " has been notified.", "success");
}
