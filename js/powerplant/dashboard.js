// =========================
// POWER PLANT DASHBOARD (US027)
// =========================

const ACTIVE_STATUSES = ["Pending", "Accepted", "In Transit"];

document.addEventListener("DOMContentLoaded", () => {

    const orders = Plant.orders();
    const entries = Plant.consumption();

    loadKpis(orders, entries);
    loadOrders(orders);
    loadCofiring(entries);
});

function loadKpis(orders, entries) {
    const delivered = orders.filter(o => o.status === "Delivered");
    const tons = delivered.reduce((sum, o) => sum + Number(o.receivedQty || o.quantity || 0), 0);
    const active = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    const inTransit = active.filter(o => o.status === "In Transit").length;

    const thisMonth = Plant.monthKey(Store.iso(0));
    const month = Plant.monthly(entries)[thisMonth] || { pellets: 0, ratio: 0 };

    const yearAgo = Store.iso(-365);
    const yearPellets = entries.filter(e => e.date >= yearAgo).reduce((s, e) => s + Number(e.pellets || 0), 0);
    const impact = Plant.impact(yearPellets);

    document.getElementById("kpiPurchased").textContent = Plant.num(tons) + " t";
    document.getElementById("kpiPurchasedNote").textContent = delivered.length + " delivered order" + (delivered.length === 1 ? "" : "s");

    document.getElementById("kpiActive").textContent = active.length;
    document.getElementById("kpiActiveNote").textContent = inTransit + " in transit";

    document.getElementById("kpiCofired").textContent = Plant.num(month.pellets) + " t";
    document.getElementById("kpiCofiredNote").textContent = Plant.num(month.ratio) + "% co-firing ratio";

    document.getElementById("kpiCo2").textContent = Plant.num(impact.co2, 0) + " t";
    document.getElementById("kpiCo2Note").textContent = "≈ " + Plant.num(impact.trees, 0) + " trees / year";
}

function loadOrders(orders) {
    const table = document.getElementById("orderTable");
    const recent = orders.slice().sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "")).slice(0, 5);

    if (!recent.length) {
        table.innerHTML = Plant.emptyRow(7, "fa-inbox", "No pellet orders yet — explore the marketplace to place one");
        return;
    }

    table.innerHTML = recent.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.pelletType)}</td>
            <td>${Plant.num(o.quantity)} t</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.deliveryDate)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
        </tr>
    `).join("");
}

function loadCofiring(entries) {
    const target = Number(Plant.profile().cofiringTarget) || 7;
    const month = Plant.monthly(entries)[Plant.monthKey(Store.iso(0))] || { ratio: 0, entries: 0 };
    const pct = Math.min(100, Math.round(month.ratio / target * 100));
    const onTrack = month.ratio >= target;

    document.getElementById("cofiringRatio").textContent = Plant.num(month.ratio) + "%";
    document.getElementById("cofiringTarget").textContent = "Target " + Plant.num(target) + "%";
    document.getElementById("cofiringBar").style.width = pct + "%";

    const label = month.entries ? (onTrack ? "On Track" : "Below Target") : "No Data";
    document.getElementById("targetBadge").innerHTML = `<span class="${Plant.badge(label)}">${label}</span>`;

    document.getElementById("cofiringHint").textContent = month.entries
        ? `${month.entries} log entr${month.entries === 1 ? "y" : "ies"} this month · ${pct}% of target achieved`
        : "No consumption logged this month yet.";
}
