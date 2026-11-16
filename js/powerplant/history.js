// =========================
// PURCHASE HISTORY (US031)
// =========================

const CLOSED_STATUSES = ["Delivered", "Cancelled", "Rejected"];
let filtered = [];

document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("filterForm");
    const suppliers = [...new Set(closedOrders().map(o => o.manufacturer))].sort();
    const select = document.getElementById("supplierFilter");
    suppliers.forEach(s => select.insertAdjacentHTML("beforeend", `<option value="${Store.esc(s)}">${Store.esc(s)}</option>`));

    ["fromDate", "toDate", "supplierFilter", "statusFilter"].forEach(id =>
        document.getElementById(id).addEventListener("change", applyFilters));

    form.addEventListener("submit", e => { e.preventDefault(); applyFilters(); });
    form.addEventListener("reset", () => setTimeout(() => {
        Validator.reset(form);
        applyFilters();
    }, 0));

    document.getElementById("exportBtn").addEventListener("click", exportCsv);

    document.getElementById("historyTable").addEventListener("click", e => {
        const btn = e.target.closest("button[data-view]");
        if (btn) viewOrder(btn.dataset.view);
    });

    applyFilters();
});

function closedOrders() {
    return Plant.orders().filter(o => CLOSED_STATUSES.includes(o.status));
}

function closedOn(o) {
    if (o.status === "Delivered") return o.deliveredOn || o.deliveryDate;
    if (o.status === "Cancelled") return o.cancelledOn || "";
    return o.rejectedOn || o.updatedAt || "";
}

function datesValid(showToast) {
    return Validator.validateForm("#filterForm", { toast: !!showToast, focus: !!showToast });
}

function applyFilters() {
    if (!datesValid(false)) {
        document.getElementById("resultCount").textContent = "Correct the date range to update the results";
        return;
    }

    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const supplier = document.getElementById("supplierFilter").value;
    const status = document.getElementById("statusFilter").value;

    filtered = closedOrders()
        .filter(o => !from || o.orderDate >= from)
        .filter(o => !to || o.orderDate <= to)
        .filter(o => !supplier || o.manufacturer === supplier)
        .filter(o => !status || o.status === status)
        .sort((a, b) => (closedOn(b) || b.orderDate || "").localeCompare(closedOn(a) || a.orderDate || ""));

    loadKpis(filtered);
    renderTable(filtered);

    document.getElementById("resultCount").textContent =
        filtered.length + " order" + (filtered.length === 1 ? "" : "s") + (from || to || supplier || status ? " match the filters" : " in total");
}

function loadKpis(list) {
    const delivered = list.filter(o => o.status === "Delivered");
    const tons = delivered.reduce((s, o) => s + Number(o.receivedQty || o.quantity || 0), 0);
    const ordered = delivered.reduce((s, o) => s + Number(o.quantity || 0), 0);
    const spend = delivered.reduce((s, o) => s + Number(o.total || 0), 0);

    document.getElementById("kpiOrders").textContent = delivered.length;
    document.getElementById("kpiTons").textContent = Plant.num(tons) + " t";
    document.getElementById("kpiSpend").textContent = Store.inr(spend);
    document.getElementById("kpiAvg").textContent = Store.inr(ordered ? Math.round(spend / ordered) : 0);
}

function renderTable(list) {
    const table = document.getElementById("historyTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(10, "fa-clock-rotate-left", "No delivered or closed orders for the selected filters");
        return;
    }

    table.innerHTML = list.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.pelletType)} <span class="text-subtle">· ${Store.esc(o.grade)}</span></td>
            <td>${Plant.num(o.receivedQty || o.quantity)} t</td>
            <td>${Store.inr(o.price)}</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(closedOn(o))}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon" type="button" data-view="${Store.esc(o.id)}" title="View details" aria-label="View ${Store.esc(o.id)}"><i class="fa-solid fa-eye"></i></button>
                    ${o.status === "Delivered" ? `<a class="btn btn-ghost btn-icon" href="pellet-feedback.html?order=${encodeURIComponent(o.id)}" title="Batch feedback" aria-label="Feedback for ${Store.esc(o.id)}"><i class="fa-solid fa-clipboard-check"></i></a>` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

function viewOrder(id) {
    const o = Store.find("pelletOrders", id);
    if (!o) {
        showToast("Order not found", "error");
        return;
    }

    document.getElementById("viewModalTitle").textContent = "Order " + o.id;
    document.getElementById("viewModalBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></dd></div>
            <div><dt>Supplier</dt><dd>${Store.esc(o.manufacturer)}</dd></div>
            <div><dt>Pellet Type</dt><dd>${Store.esc(o.pelletType)} (${Store.esc(o.grade)})</dd></div>
            <div><dt>Price</dt><dd>${Store.inr(o.price)} / ton</dd></div>
            <div><dt>Ordered Quantity</dt><dd>${Plant.num(o.quantity)} tons</dd></div>
            <div><dt>Received Quantity</dt><dd>${o.status === "Delivered" ? Plant.num(o.receivedQty || o.quantity) + " tons" : "—"}</dd></div>
            <div><dt>Order Value</dt><dd>${Store.inr(o.total)}</dd></div>
            <div><dt>Vehicle</dt><dd>${Store.esc(o.receiptVehicle || o.vehicleNo || "—")}</dd></div>
            <div><dt>Ordered On</dt><dd>${Store.date(o.orderDate)}</dd></div>
            <div><dt>Closed On</dt><dd>${Store.date(closedOn(o))}</dd></div>
            <div class="span-2"><dt>Delivery Address</dt><dd>${Store.esc(o.deliveryAddress)}</dd></div>
            <div class="span-2"><dt>Receipt Remarks</dt><dd>${Store.esc([o.receiptCondition, o.receiptRemarks].filter(Boolean).join(" — ") || "—")}</dd></div>
        </dl>`;
    Plant.openModal("viewModal");
}

function exportCsv() {
    if (!datesValid(true)) return;

    if (!filtered.length) {
        showToast("There are no orders to export for the selected filters", "warning");
        return;
    }

    const headers = ["Order ID", "Supplier", "Pellet Type", "Grade", "Ordered Qty (t)", "Received Qty (t)", "Price per Ton (INR)", "Total (INR)", "Order Date", "Closed On", "Status"];
    const rows = filtered.map(o => [
        o.id, o.manufacturer, o.pelletType, o.grade, o.quantity,
        o.status === "Delivered" ? (o.receivedQty || o.quantity) : "",
        o.price, o.total, o.orderDate, closedOn(o), o.status
    ]);

    Plant.downloadCSV("pellet-purchase-history-" + Store.iso(0) + ".csv", headers, rows);
    showToast(`Exported ${filtered.length} order${filtered.length === 1 ? "" : "s"} to CSV`, "success");
}
