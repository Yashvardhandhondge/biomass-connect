// =========================
// PURCHASE HISTORY (US019)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const CLOSED = ["Delivered", "Rejected", "Cancelled"];

let range = { from: "", to: "" };
let currentRows = [];

document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("filterForm");

    form.addEventListener("submit", e => {
        e.preventDefault();
        if (!Validator.validateForm(form)) return;
        range = {
            from: document.getElementById("fromDate").value,
            to: document.getElementById("toDate").value
        };
        render();
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
        form.reset();
        Validator.reset(form);
        range = { from: "", to: "" };
        render();
    });

    document.getElementById("statusFilter").addEventListener("change", render);
    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("exportBtn").addEventListener("click", exportCsv);

    render();
});

function closedOn(o) {
    if (o.status === "Delivered") return o.deliveredOn || o.expectedDelivery || o.deliveryDate;
    if (o.status === "Cancelled") return o.cancelledOn || "";
    if (o.status === "Rejected") return o.rejectedOn || "";
    return "";
}

function filteredOrders() {
    const status = document.getElementById("statusFilter").value;
    const search = document.getElementById("searchInput").value.trim().toLowerCase();

    return Store.get("purchaseOrders")
        .filter(o => o.manufacturer === MANUFACTURER && CLOSED.includes(o.status))
        .filter(o => {
            if (status && o.status !== status) return false;
            if (range.from && o.orderDate < range.from) return false;
            if (range.to && o.orderDate > range.to) return false;
            if (search && ![o.id, o.farmer, o.biomassType].join(" ").toLowerCase().includes(search)) return false;
            return true;
        })
        .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
}

function render() {
    currentRows = filteredOrders();

    const delivered = currentRows.filter(o => o.status === "Delivered");
    const tons = delivered.reduce((s, o) => s + Number(o.receivedQty || o.quantity || 0), 0);
    const spent = delivered.reduce((s, o) => s + Number(o.total || 0), 0);
    const orderedTons = delivered.reduce((s, o) => s + Number(o.quantity || 0), 0);

    document.getElementById("kpiCompleted").textContent = delivered.length;
    document.getElementById("kpiTons").textContent = tons.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " t";
    document.getElementById("kpiSpent").textContent = Store.inr(spent);
    document.getElementById("kpiAvg").textContent = Store.inr(orderedTons ? Math.round(spent / orderedTons) : 0);

    const rangeText = range.from || range.to
        ? " · " + (range.from ? Store.date(range.from) : "start") + " to " + (range.to ? Store.date(range.to) : "today")
        : "";
    document.getElementById("resultCount").textContent =
        currentRows.length + (currentRows.length === 1 ? " record" : " records") + rangeText;

    const table = document.getElementById("historyTable");

    if (!currentRows.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i>No closed purchase orders for the selected filters.<br><small>Orders appear here once they are delivered, rejected or cancelled.</small></div></td></tr>`;
        return;
    }

    table.innerHTML = currentRows.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.farmer)}</td>
            <td>${Store.esc(o.biomassType)}</td>
            <td>${Store.esc(o.quantity)} t</td>
            <td>${Store.inr(o.price)}</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(closedOn(o))}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
        </tr>
    `).join("");
}

function exportCsv() {
    if (!currentRows.length) {
        showToast("There are no records to export for the selected filters.", "warning");
        return;
    }

    const rows = [["PO ID", "Farmer", "Biomass Type", "Quantity (t)", "Price per Ton (INR)", "Amount (INR)", "Order Date", "Closed On", "Status"]]
        .concat(currentRows.map(o => [o.id, o.farmer, o.biomassType, o.quantity, o.price, o.total, o.orderDate, closedOn(o), o.status]));

    downloadCsv("purchase-history-" + Store.iso(0) + ".csv", rows);
    showToast("Exported " + currentRows.length + (currentRows.length === 1 ? " record" : " records") + " to CSV.", "success", { title: "Export complete" });
}

function downloadCsv(filename, rows) {
    const cell = v => {
        let s = String(v == null ? "" : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
        return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = rows.map(r => r.map(cell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
