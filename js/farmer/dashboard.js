// =========================
// FARMER DASHBOARD
// =========================

const FARMER_NAME = "Ramesh Patil";

document.addEventListener("DOMContentLoaded", () => {

    const listings = Store.get("biomassListings").filter(l => l.farmer === FARMER_NAME);
    const orders = Store.get("purchaseOrders").filter(o => o.farmer === FARMER_NAME);

    loadKpis(listings, orders);
    loadOrders(orders);
    loadStatus(orders);
});

function loadKpis(listings, orders) {
    const delivered = orders.filter(o => o.status === "Delivered");
    const revenue = delivered.reduce((sum, o) => sum + Number(o.total || 0), 0);

    document.getElementById("kpiListings").textContent = listings.filter(l => l.status === "Active").length;
    document.getElementById("kpiOrders").textContent = orders.length;
    document.getElementById("kpiRevenue").textContent = Store.inr(revenue);
    document.getElementById("kpiDelivered").textContent = delivered.length;
}

function loadOrders(orders) {
    const table = document.getElementById("orderTable");

    if (!orders.length) {
        table.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-inbox"></i>No orders yet</div></td></tr>`;
        return;
    }

    table.innerHTML = orders.slice(0, 5).map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.biomassType)}</td>
            <td>${Store.esc(o.quantity)} Tons</td>
            <td>${Store.inr(o.total)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
        </tr>
    `).join("");
}

function loadStatus(orders) {
    const groups = ["Pending", "Accepted", "In Transit", "Delivered"];
    const total = orders.length || 1;

    document.getElementById("statusList").innerHTML = groups.map(label => {
        const count = orders.filter(o => o.status === label).length;
        return `
            <div>
                <div class="status-row">
                    <span class="text-muted">${label}</span>
                    <strong>${count}</strong>
                </div>
                <div class="progress"><span style="width:${Math.round(count / total * 100)}%"></span></div>
            </div>`;
    }).join("");
}
