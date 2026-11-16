// =========================
// FARMER — ORDER HISTORY (US013)
// Closed orders (Delivered / Rejected / Cancelled) with date-range filter + CSV export
// =========================

const CLOSED_STATUSES = ["Delivered", "Rejected", "Cancelled"];
let currentRows = [];

document.addEventListener("DOMContentLoaded", () => {

    const from = document.getElementById("fromDate");
    const to = document.getElementById("toDate");

    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("statusFilter").addEventListener("change", render);

    // re-filter as soon as the date range is valid
    [from, to].forEach(el => el.addEventListener("change", () => {
        const ok = Validator.validateField(from) & Validator.validateField(to);
        if (ok) render();
    }));

    document.getElementById("filterForm").addEventListener("submit", e => {
        e.preventDefault();
        if (!Validator.validateForm("#filterForm")) return;
        render();
        const range = rangeText();
        showToast("Showing " + currentRows.length + " order" + (currentRows.length === 1 ? "" : "s") + (range ? " " + range : ""), "info");
    });

    document.getElementById("clearBtn").addEventListener("click", () => {
        document.getElementById("filterForm").reset();
        Validator.reset("#filterForm");
        // refresh picker bounds now that the linked dates are empty
        from.dispatchEvent(new Event("change"));
        to.dispatchEvent(new Event("change"));
        Validator.reset("#filterForm");
        render();
        showToast("Filters cleared", "info");
    });

    document.getElementById("exportBtn").addEventListener("click", exportCsv);

    render();
});

/* ---------- Data ---------- */

function closedOn(o) {
    return o.deliveredDate || o.rejectedDate || o.cancelledDate ||
        (o.status === "Delivered" ? (o.expectedDelivery || o.deliveryDate) : o.orderDate) || "";
}

function rangeText() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    if (from && to) return "from " + Store.date(from) + " to " + Store.date(to);
    if (from) return "from " + Store.date(from);
    if (to) return "up to " + Store.date(to);
    return "";
}

function filteredOrders() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;

    return Farmer.orders()
        .filter(o => CLOSED_STATUSES.includes(o.status))
        .filter(o =>
            (!status || o.status === status) &&
            (!from || o.orderDate >= from) &&
            (!to || o.orderDate <= to) &&
            (!q || [o.id, o.manufacturer, o.biomassType].join(" ").toLowerCase().includes(q)))
        .sort((a, b) => String(closedOn(b)).localeCompare(String(closedOn(a))));
}

/* ---------- Rendering ---------- */

function render() {
    currentRows = filteredOrders();
    renderKpis(currentRows);

    const range = rangeText();
    document.getElementById("resultCount").textContent =
        currentRows.length + " order" + (currentRows.length === 1 ? "" : "s") + (range ? " · " + range : "");

    const table = document.getElementById("historyTable");

    if (!currentRows.length) {
        const anyClosed = Farmer.orders().some(o => CLOSED_STATUSES.includes(o.status));
        table.innerHTML = Farmer.emptyRow(9, "fa-clock-rotate-left",
            anyClosed ? "No orders match the selected filters." : "No completed orders yet. Delivered and rejected orders will appear here.");
        return;
    }

    table.innerHTML = currentRows.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.biomassType)}</td>
            <td>${Farmer.tons(o.quantity)}</td>
            <td>${Store.inr(o.price)}</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(closedOn(o))}</td>
            <td>${Farmer.badge(o.status)}${o.rejectReason ? `<div class="text-subtle cell-sub" title="${Store.esc(o.rejectReason)}">${Store.esc(o.rejectCategory || "See reason")}</div>` : ""}</td>
        </tr>`).join("");
}

function renderKpis(rows) {
    const delivered = rows.filter(o => o.status === "Delivered");
    const tons = delivered.reduce((s, o) => s + Number(o.quantity || 0), 0);
    const revenue = delivered.reduce((s, o) => s + Number(o.total || 0), 0);

    document.getElementById("kpiOrders").textContent = rows.length;
    document.getElementById("kpiTons").textContent = tons.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    document.getElementById("kpiRevenue").textContent = Store.inr(revenue);
    document.getElementById("kpiAvg").textContent = tons ? Store.inr(Math.round(revenue / tons)) : "₹0";
}

/* ---------- Export ---------- */

function exportCsv() {

    if (!Validator.validateForm("#filterForm")) return;

    render();

    if (!currentRows.length) {
        showToast("There are no orders to export for the selected filters", "warning");
        return;
    }

    const rows = [["Order ID", "Manufacturer", "Biomass", "Quantity (Tons)", "Price per Ton (INR)", "Amount (INR)", "Order Date", "Closed On", "Status", "Reason"]]
        .concat(currentRows.map(o => [
            o.id, o.manufacturer, o.biomassType, o.quantity, o.price, o.total,
            o.orderDate, closedOn(o), o.status, o.rejectReason || ""
        ]));

    const filename = "order-history-" + Farmer.today() + ".csv";
    Farmer.download(filename, "﻿" + Farmer.toCsv(rows), "text/csv;charset=utf-8");
    showToast("Exported " + currentRows.length + " order" + (currentRows.length === 1 ? "" : "s") + " to " + filename, "success");
}
