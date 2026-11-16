// =========================
// PELLET SALES HISTORY (US025)
// =========================

const MANUFACTURER = "GreenPellet Industries";

let range = { from: "", to: "" };
let currentRows = [];

document.addEventListener("DOMContentLoaded", () => {

    fillFilterOptions();

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

    document.getElementById("buyerFilter").addEventListener("change", render);
    document.getElementById("typeFilter").addEventListener("change", render);
    document.getElementById("exportBtn").addEventListener("click", exportCsv);

    render();
});

function deliveredOn(o) {
    return o.deliveredOn || o.expectedDelivery || o.deliveryDate || "";
}

function allSales() {
    return Store.get("pelletOrders")
        .filter(o => o.manufacturer === MANUFACTURER && o.status === "Delivered")
        .sort((a, b) => deliveredOn(b).localeCompare(deliveredOn(a)));
}

function fillFilterOptions() {
    const sales = allSales();
    const options = key => [...new Set(sales.map(o => o[key]).filter(Boolean))].sort()
        .map(v => `<option value="${Store.esc(v)}">${Store.esc(v)}</option>`).join("");
    document.getElementById("buyerFilter").insertAdjacentHTML("beforeend", options("powerPlant"));
    document.getElementById("typeFilter").insertAdjacentHTML("beforeend", options("pelletType"));
}

function render() {
    const buyer = document.getElementById("buyerFilter").value;
    const type = document.getElementById("typeFilter").value;

    currentRows = allSales().filter(o => {
        const d = deliveredOn(o);
        if (buyer && o.powerPlant !== buyer) return false;
        if (type && o.pelletType !== type) return false;
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
        return true;
    });

    const tons = currentRows.reduce((s, o) => s + Number(o.quantity || 0), 0);
    const revenue = currentRows.reduce((s, o) => s + Number(o.total || 0), 0);

    document.getElementById("kpiTons").textContent = tons.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " t";
    document.getElementById("kpiRevenue").textContent = Store.inr(revenue);
    document.getElementById("kpiBuyers").textContent = new Set(currentRows.map(o => o.powerPlant)).size;
    document.getElementById("kpiAvg").textContent = Store.inr(tons ? Math.round(revenue / tons) : 0);

    const rangeText = range.from || range.to
        ? " · " + (range.from ? Store.date(range.from) : "start") + " to " + (range.to ? Store.date(range.to) : "today")
        : "";
    document.getElementById("resultCount").textContent =
        currentRows.length + (currentRows.length === 1 ? " sale" : " sales") + rangeText;

    const table = document.getElementById("salesTable");

    if (!currentRows.length) {
        table.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-chart-line"></i>No delivered pellet orders for the selected filters.</div></td></tr>`;
    } else {
        table.innerHTML = currentRows.map(o => `
            <tr>
                <td class="fw-600">${Store.esc(o.id)}</td>
                <td>${Store.esc(o.powerPlant)}</td>
                <td>${Store.esc(o.pelletType)}</td>
                <td>${Store.esc(o.grade)}</td>
                <td>${Store.esc(o.quantity)} t</td>
                <td>${Store.inr(o.price)}</td>
                <td>${Store.inr(o.total)}</td>
                <td>${Store.date(deliveredOn(o))}</td>
            </tr>
        `).join("");
    }

    renderBreakdown("buyerBreakdown", "powerPlant", "total", v => Store.inr(v));
    renderBreakdown("typeBreakdown", "pelletType", "quantity", v => v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " t");
}

function renderBreakdown(elId, groupKey, valueKey, format) {
    const el = document.getElementById(elId);
    const totals = {};
    currentRows.forEach(o => { totals[o[groupKey]] = (totals[o[groupKey]] || 0) + Number(o[valueKey] || 0); });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
        el.innerHTML = `<p class="text-muted">No data for the selected filters.</p>`;
        return;
    }

    const max = entries[0][1] || 1;
    el.innerHTML = entries.map(([name, value]) => `
        <div>
            <div class="flex between" style="font-size:14px;margin-bottom:6px">
                <span>${Store.esc(name)}</span><strong>${format(value)}</strong>
            </div>
            <div class="progress"><span style="width:${Math.round(value / max * 100)}%"></span></div>
        </div>`).join("");
}

function exportCsv() {
    if (!currentRows.length) {
        showToast("There are no sales to export for the selected filters.", "warning");
        return;
    }

    const rows = [["Order ID", "Power Plant", "Pellet Type", "Grade", "Quantity (t)", "Price per Ton (INR)", "Amount (INR)", "Delivered On"]]
        .concat(currentRows.map(o => [o.id, o.powerPlant, o.pelletType, o.grade, o.quantity, o.price, o.total, deliveredOn(o)]));

    downloadCsv("pellet-sales-" + Store.iso(0) + ".csv", rows);
    showToast("Exported " + currentRows.length + (currentRows.length === 1 ? " sale" : " sales") + " to CSV.", "success", { title: "Export complete" });
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
