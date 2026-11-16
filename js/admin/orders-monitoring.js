// =========================
// ADMIN — MONITOR ORDERS & TRANSACTIONS
// Combined view of purchaseOrders (biomass) and pelletOrders.
// =========================

const FLAGS_KEY = "admin_order_flags";

let flaggingId = null;

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("searchInput").addEventListener("input", render);
    ["typeFilter", "statusFilter", "flaggedOnly"].forEach(id => document.getElementById(id).addEventListener("change", render));
    ["fromDate", "toDate"].forEach(id => document.getElementById(id).addEventListener("change", onDateChange));

    document.getElementById("filterForm").addEventListener("submit", e => e.preventDefault());
    document.getElementById("clearFilters").addEventListener("click", clearFilters);
    document.getElementById("exportBtn").addEventListener("click", exportOrders);
    document.getElementById("orderTable").addEventListener("click", onAction);
    document.getElementById("viewFooter").addEventListener("click", onAction);
    document.getElementById("flagForm").addEventListener("submit", flagOrder);

    render();
});

/* ---------- helpers ---------- */

function flags() {
    return Admin.get(FLAGS_KEY);
}

function flagFor(id) {
    return flags().find(f => f.orderId === id) || null;
}

function paymentStatus(o) {
    if (o.status === "Delivered") return "Paid";
    if (o.status === "Accepted" || o.status === "In Transit") return "In Escrow";
    if (o.status === "Pending") return "Unpaid";
    return "Void";
}

function findOrder(id) {
    return Admin.allOrders().find(o => o.id === id) || null;
}

/* ---------- filters ---------- */

// Only valid date fields take part in filtering
function dateRange() {
    const from = document.getElementById("fromDate");
    const to = document.getElementById("toDate");
    const okFrom = Validator.validateField(from);
    const okTo = Validator.validateField(to);
    return { from: okFrom ? from.value : "", to: okTo && okFrom ? to.value : "", valid: okFrom && okTo };
}

function onDateChange() {
    const range = dateRange();
    if (!range.valid) showToast("Fix the highlighted date range to filter by date", "error", { title: "Invalid date range" });
    render();
}

function filtered() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const type = document.getElementById("typeFilter").value;
    const status = document.getElementById("statusFilter").value;
    const flaggedOnly = document.getElementById("flaggedOnly").checked;
    const { from, to } = dateRange();
    const flagged = new Set(flags().map(f => f.orderId));

    return Admin.allOrders().filter(o =>
        (type === "All" || o.type === type) &&
        (status === "All" || o.status === status) &&
        (!flaggedOnly || flagged.has(o.id)) &&
        (!from || o.orderDate >= from) &&
        (!to || o.orderDate <= to) &&
        (!q || [o.id, o.buyer, o.seller, o.product].some(v => String(v || "").toLowerCase().includes(q)))
    );
}

function clearFilters() {
    const form = document.getElementById("filterForm");
    form.reset();
    Validator.reset(form);
    render();
    showToast("Filters cleared", "info");
}

/* ---------- render ---------- */

function render() {
    const list = filtered();
    const flagged = new Set(flags().map(f => f.orderId));
    const billable = list.filter(Admin.isBillable);

    document.getElementById("kpiCount").textContent = list.length;
    document.getElementById("kpiActive").textContent = list.filter(Admin.isActiveOrder).length;
    document.getElementById("kpiValue").textContent = Store.inr(billable.reduce((s, o) => s + o.total, 0));
    document.getElementById("kpiFlagged").textContent = list.filter(o => flagged.has(o.id)).length;
    document.getElementById("resultCount").textContent = list.length + (list.length === 1 ? " order" : " orders");

    const table = document.getElementById("orderTable");
    const totals = document.getElementById("orderTotals");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-inbox"></i>No orders match your filters</div></td></tr>`;
        totals.innerHTML = "";
        return;
    }

    table.innerHTML = list.map(o => {
        const isFlagged = flagged.has(o.id);
        return `
        <tr class="${isFlagged ? "is-flagged" : ""}">
            <td class="fw-600">${isFlagged ? '<i class="fa-solid fa-flag flag-icon" title="Flagged for review"></i> ' : ""}${Store.esc(o.id)}</td>
            <td><span class="badge">${Store.esc(o.type)}</span></td>
            <td>${Store.esc(o.buyer)}</td>
            <td>${Store.esc(o.seller)}</td>
            <td>${Store.esc(o.product)}</td>
            <td>${Store.esc(o.quantity)} t</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
            <td><span class="${Store.badge(paymentStatus(o))}">${paymentStatus(o)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="view" data-id="${Store.esc(o.id)}" title="View order" aria-label="View ${Store.esc(o.id)}"><i class="fa-solid fa-eye"></i></button>
                    ${isFlagged
                        ? `<button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="unflag" data-id="${Store.esc(o.id)}" title="Remove flag" aria-label="Remove flag from ${Store.esc(o.id)}"><i class="fa-regular fa-flag"></i></button>`
                        : `<button class="btn btn-danger btn-sm btn-icon" type="button" data-action="flag" data-id="${Store.esc(o.id)}" title="Flag for review" aria-label="Flag ${Store.esc(o.id)}"><i class="fa-solid fa-flag"></i></button>`}
                </div>
            </td>
        </tr>`;
    }).join("");

    const qty = list.reduce((s, o) => s + o.quantity, 0);
    totals.innerHTML = `
        <tr>
            <td colspan="5">Totals · ${list.length} orders (${billable.length} billable)</td>
            <td>${Number(qty.toFixed(2))} t</td>
            <td>${Store.inr(billable.reduce((s, o) => s + o.total, 0))}</td>
            <td colspan="4" class="text-muted">Rejected and cancelled orders are excluded from value</td>
        </tr>`;
}

/* ---------- actions ---------- */

function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") viewOrder(id);
    if (btn.dataset.action === "flag") { Admin.closeModal("viewModal"); openFlag(id); }
    if (btn.dataset.action === "unflag") { Admin.closeModal("viewModal"); unflagOrder(id); }
}

function viewOrder(id) {
    const o = findOrder(id);
    if (!o) return showToast("Order not found", "error");
    const flag = flagFor(id);

    document.getElementById("viewTitle").textContent = o.type + " Order · " + o.id;
    document.getElementById("viewBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Buyer (${Store.esc(o.buyerRole)})</dt><dd>${Store.esc(o.buyer)}</dd></div>
            <div><dt>Seller (${Store.esc(o.sellerRole)})</dt><dd>${Store.esc(o.seller)}</dd></div>
            <div><dt>Product</dt><dd>${Store.esc(o.product)}</dd></div>
            <div><dt>Quantity</dt><dd>${Store.esc(o.quantity)} tons @ ${Store.inr(o.price)}/ton</dd></div>
            <div><dt>Order Value</dt><dd>${Store.inr(o.total)}</dd></div>
            <div><dt>Payment</dt><dd><span class="${Store.badge(paymentStatus(o))}">${paymentStatus(o)}</span></dd></div>
            <div><dt>Order Date</dt><dd>${Store.date(o.orderDate)}</dd></div>
            <div><dt>Expected Delivery</dt><dd>${Store.date(o.deliveryDate)}</dd></div>
            <div><dt>Status</dt><dd><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></dd></div>
            <div><dt>Vehicle No.</dt><dd>${Store.esc(o.vehicleNo || "Not assigned")}</dd></div>
            <div class="full"><dt>Delivery Address</dt><dd>${Store.esc(o.address || "—")}</dd></div>
            ${o.notes ? `<div class="full"><dt>Buyer Notes</dt><dd>${Store.esc(o.notes)}</dd></div>` : ""}
        </dl>
        ${flag ? `
            <div class="note-box mt-2">
                <strong><i class="fa-solid fa-flag"></i> Flagged on ${Store.date(flag.flaggedOn)} · ${Store.esc(flag.category)}</strong>
                <p>${Store.esc(flag.notes)}</p>
                <small class="text-muted">By ${Store.esc(flag.by)}</small>
            </div>` : ""}
    `;

    document.getElementById("viewFooter").innerHTML = `
        <button class="btn btn-secondary" type="button" data-close>Close</button>
        ${flag
            ? `<button class="btn btn-secondary" type="button" data-action="unflag" data-id="${Store.esc(o.id)}"><i class="fa-regular fa-flag"></i> Remove Flag</button>`
            : `<button class="btn btn-danger" type="button" data-action="flag" data-id="${Store.esc(o.id)}"><i class="fa-solid fa-flag"></i> Flag for Review</button>`}
    `;

    Admin.openModal("viewModal");
}

function openFlag(id) {
    const o = findOrder(id);
    if (!o) return showToast("Order not found", "error");
    if (flagFor(id)) return showToast(id + " is already flagged", "warning");

    flaggingId = id;
    const form = document.getElementById("flagForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("flagTitle").textContent = "Flag Order " + o.id;
    document.getElementById("flagIntro").textContent =
        o.buyer + " ← " + o.seller + " · " + o.product + " · " + Store.inr(o.total);
    Admin.openModal("flagModal");
}

function flagOrder(e) {
    e.preventDefault();
    if (!Validator.validateForm("#flagForm")) return;

    const list = flags();
    list.unshift({
        orderId: flaggingId,
        category: document.getElementById("flagCategory").value,
        notes: document.getElementById("flagNotes").value.trim(),
        flaggedOn: Store.iso(0),
        by: Admin.adminName()
    });
    Admin.set(FLAGS_KEY, list);
    Admin.log("Flagged order " + flaggingId + " for review", "Orders");

    Admin.closeModal("flagModal");
    render();
    showToast("Order " + flaggingId + " flagged for review", "success");
}

async function unflagOrder(id) {
    if (!flagFor(id)) return showToast(id + " is not flagged", "warning");

    const ok = await confirmDialog({
        title: "Remove flag from " + id + "?",
        message: "The order will no longer appear in the flagged review list.",
        confirmText: "Remove Flag"
    });
    if (!ok) return;

    Admin.set(FLAGS_KEY, flags().filter(f => f.orderId !== id));
    Admin.log("Removed review flag from order " + id, "Orders");
    render();
    showToast("Flag removed from " + id, "success");
}

/* ---------- export ---------- */

function exportOrders() {
    const range = dateRange();
    if (!range.valid) return showToast("Fix the date range before exporting", "error");

    const list = filtered();
    if (!list.length) return showToast("There are no orders to export for the current filters", "warning");

    const flagged = new Set(flags().map(f => f.orderId));
    Admin.exportCSV("orders-transactions-" + Store.iso(0) + ".csv",
        ["Order ID", "Type", "Buyer", "Seller", "Product", "Quantity (t)", "Price/ton", "Amount", "Order Date", "Expected Delivery", "Status", "Payment", "Flagged"],
        list.map(o => [o.id, o.type, o.buyer, o.seller, o.product, o.quantity, o.price, o.total, o.orderDate, o.deliveryDate, o.status, paymentStatus(o), flagged.has(o.id) ? "Yes" : "No"]));
    Admin.log("Exported orders & transactions (" + list.length + " records)", "Orders");
    showToast(list.length + " orders exported to CSV", "success");
}
