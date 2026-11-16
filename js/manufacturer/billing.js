// =========================
// BILLING & COMPLAINTS (US026)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const COMPLAINTS_KEY = "manufacturer_complaints";
const INVOICE_KEY = "manufacturer_invoices";
const GST_RATE = 0.05;
const PAYMENT_TERMS_DAYS = 15;

let payingId = null;
let respondingId = null;

/* ---------------- Seed role-private data ---------------- */

function seedComplaints() {
    if (localStorage.getItem(COMPLAINTS_KEY)) return;
    Store.set(COMPLAINTS_KEY, [
        {
            id: "CMP-2002", direction: "received", orderId: "PP-3013", orderType: "pellet", party: "Tata Power Trombay",
            category: "Delivery delay", priority: "Medium", subject: "Confirm split delivery schedule",
            description: "Please confirm whether the 30 tons ordered can be delivered in two lots of 15 tons each, a week apart.",
            attachment: "", status: "Open", responses: [], createdAt: Store.iso(0)
        },
        {
            id: "CMP-2001", direction: "received", orderId: "PP-3008", orderType: "pellet", party: "NTPC Nashik Unit",
            category: "Quality issue", priority: "High", subject: "Moisture higher than listed",
            description: "Our lab test on the PP-3008 consignment shows moisture at 11.2% against the listed 8%. Please review the batch and advise.",
            attachment: "lab-report-pp3008.pdf", status: "Open", responses: [], createdAt: Store.iso(-2)
        },
        {
            id: "CMP-2000", direction: "received", orderId: "PP-3008", orderType: "pellet", party: "NTPC Nashik Unit",
            category: "Documentation", priority: "Low", subject: "Weighbridge slip missing",
            description: "The weighbridge slip was not attached with the delivery challan for PP-3008. Please share a copy.",
            attachment: "", status: "Resolved", createdAt: Store.iso(-3),
            responses: [{ by: MANUFACTURER, text: "Scanned weighbridge slip has been emailed to your stores department.", date: Store.iso(-2) }]
        },
        {
            id: "GRV-1001", direction: "raised", orderId: "PO-B2043", orderType: "purchase", party: "Sunita Jadhav",
            category: "Delivery delay", priority: "Medium", subject: "Bagasse shipment running late",
            description: "The bagasse shipment for PO-B2043 has not reached our plant on the committed date. Please share the vehicle location.",
            attachment: "", status: "In Progress", createdAt: Store.iso(-1),
            responses: [{ by: "Sunita Jadhav", text: "Truck was held up by rain near Sinnar, it will reach within two days.", date: Store.iso(-1) }]
        }
    ]);
}

function complaints() {
    return Store.get(COMPLAINTS_KEY);
}

/* ---------------- Invoices ---------------- */

function invoiceState() {
    try { return JSON.parse(localStorage.getItem(INVOICE_KEY)) || {}; }
    catch (e) { return {}; }
}

function saveInvoiceState(id, patch) {
    const state = invoiceState();
    state[id] = Object.assign({}, state[id], patch);
    try { localStorage.setItem(INVOICE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function addDays(isoStr, days) {
    const [y, m, d] = String(isoStr).split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

const round2 = n => Math.round(n * 100) / 100;

function buildInvoices() {
    const state = invoiceState();
    const today = Store.iso(0);

    const make = (o, kind) => {
        const id = "INV-" + o.id;
        const s = state[id] || {};
        const issueDate = (kind === "payable" ? (o.acceptedOn || o.orderDate) : (o.dispatchDate || o.deliveredOn || o.orderDate)) || today;
        const dueDate = addDays(issueDate, PAYMENT_TERMS_DAYS);
        const subtotal = Number(o.total || 0);
        const gst = round2(subtotal * GST_RATE);
        return {
            id, kind,
            orderId: o.id,
            party: kind === "payable" ? o.farmer : o.powerPlant,
            item: kind === "payable" ? o.biomassType : o.pelletType + (o.grade ? " (" + o.grade + ")" : ""),
            quantity: o.quantity,
            price: o.price,
            subtotal, gst,
            amount: round2(subtotal + gst),
            issueDate, dueDate,
            address: o.deliveryAddress || "",
            status: s.status === "Paid" ? "Paid" : (dueDate < today ? "Overdue" : "Unpaid"),
            payment: s
        };
    };

    const payable = Store.get("purchaseOrders")
        .filter(o => o.manufacturer === MANUFACTURER && ["Accepted", "In Transit", "Delivered"].includes(o.status))
        .map(o => make(o, "payable"));

    const receivable = Store.get("pelletOrders")
        .filter(o => o.manufacturer === MANUFACTURER && ["In Transit", "Delivered"].includes(o.status))
        .map(o => make(o, "receivable"));

    const rank = { Overdue: 0, Unpaid: 1, Paid: 2 };
    return payable.concat(receivable).sort((a, b) =>
        (rank[a.status] - rank[b.status]) || b.issueDate.localeCompare(a.issueDate));
}

function findInvoice(id) {
    return buildInvoices().find(i => i.id === id) || null;
}

/* ---------------- Init ---------------- */

document.addEventListener("DOMContentLoaded", () => {

    seedComplaints();
    bindModals();
    bindTabs();
    fillOrderOptions();

    ["invoiceSearch"].forEach(id => document.getElementById(id).addEventListener("input", renderInvoices));
    ["invoiceType", "invoiceStatus"].forEach(id => document.getElementById(id).addEventListener("change", renderInvoices));
    document.getElementById("complaintStatus").addEventListener("change", renderComplaints);

    // one click handler for every action button on the page
    document.addEventListener("click", e => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        const actions = {
            viewInvoice, downloadInvoice, openPay, remind, markReceived,
            viewComplaint, openRespond, withdrawGrievance
        };
        if (actions[btn.dataset.action]) actions[btn.dataset.action](id);
    });

    document.getElementById("payForm").addEventListener("submit", e => { e.preventDefault(); recordPayment(); });
    document.getElementById("respondForm").addEventListener("submit", e => { e.preventDefault(); sendResponse(); });

    const gForm = document.getElementById("grievanceForm");
    gForm.addEventListener("submit", e => { e.preventDefault(); submitGrievance(); });
    gForm.addEventListener("reset", () => setTimeout(() => {
        Validator.reset(gForm);
        document.getElementById("gAgainst").value = "";
        updateDescCount();
    }, 0));

    document.getElementById("gOrder").addEventListener("change", updateAgainst);
    document.getElementById("gDescription").addEventListener("input", updateDescCount);

    preselectOrder();
    renderAll();
});

function renderAll() {
    renderKpis();
    renderInvoices();
    renderGrievances();
    renderComplaints();
}

function renderKpis() {
    const invoices = buildInvoices();
    const outstanding = kind => invoices.filter(i => i.kind === kind && i.status !== "Paid").reduce((s, i) => s + i.amount, 0);
    const open = complaints().filter(c => c.direction === "received" && c.status !== "Resolved").length;

    document.getElementById("kpiPayable").textContent = Store.inr(round2(outstanding("payable")));
    document.getElementById("kpiReceivable").textContent = Store.inr(round2(outstanding("receivable")));
    document.getElementById("kpiSettled").textContent = invoices.filter(i => i.status === "Paid").length;
    document.getElementById("kpiComplaints").textContent = open;
    document.getElementById("complaintCount").textContent = open;
}

/* ---------------- Tabs ---------------- */

function bindTabs() {
    document.getElementById("billingTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        showTab(tab.dataset.tab);
        history.replaceState(null, "", location.pathname + location.search + "#" + tab.dataset.tab);
    });

    const hash = location.hash.replace("#", "");
    if (["invoices", "grievances", "complaints"].includes(hash)) showTab(hash);
}

function showTab(name) {
    document.querySelectorAll("#billingTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== name));
}

/* ---------------- Invoice list ---------------- */

function renderInvoices() {
    const search = document.getElementById("invoiceSearch").value.trim().toLowerCase();
    const type = document.getElementById("invoiceType").value;
    const status = document.getElementById("invoiceStatus").value;

    const list = buildInvoices().filter(i => {
        if (type && i.kind !== type) return false;
        if (status && i.status !== status) return false;
        if (search && ![i.id, i.orderId, i.party, i.item].join(" ").toLowerCase().includes(search)) return false;
        return true;
    });

    const table = document.getElementById("invoiceTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-file-invoice"></i>No invoices found.<br><small>Invoices are generated when a farmer accepts your purchase order or when you dispatch a pellet order.</small></div></td></tr>`;
        return;
    }

    const statusBadge = s => `<span class="badge ${s === "Paid" ? "badge-success" : s === "Overdue" ? "badge-danger" : "badge-warning"}">${s}</span>`;

    table.innerHTML = list.map(i => {
        const id = Store.esc(i.id);
        let actions = `
            <button class="btn btn-secondary btn-sm btn-icon" data-action="viewInvoice" data-id="${id}" title="View" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
            <button class="btn btn-secondary btn-sm btn-icon" data-action="downloadInvoice" data-id="${id}" title="Download" aria-label="Download ${id}"><i class="fa-solid fa-download"></i></button>`;
        if (i.status !== "Paid" && i.kind === "payable") {
            actions += `<button class="btn btn-primary btn-sm" data-action="openPay" data-id="${id}"><i class="fa-solid fa-indian-rupee-sign"></i> Pay</button>`;
        }
        if (i.status !== "Paid" && i.kind === "receivable") {
            actions += `
                <button class="btn btn-secondary btn-sm btn-icon" data-action="remind" data-id="${id}" title="Send payment reminder" aria-label="Remind for ${id}"><i class="fa-solid fa-bell"></i></button>
                <button class="btn btn-secondary btn-sm" data-action="markReceived" data-id="${id}"><i class="fa-solid fa-check"></i> Received</button>`;
        }
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td><span class="badge ${i.kind === "payable" ? "" : "badge-info"}">${i.kind === "payable" ? "Payable" : "Receivable"}</span></td>
            <td>${Store.esc(i.orderId)}<span class="cell-sub">${Store.esc(i.item)}</span></td>
            <td>${Store.esc(i.party)}</td>
            <td>${Store.date(i.issueDate)}</td>
            <td>${Store.date(i.dueDate)}</td>
            <td class="fw-600">${Store.inr(i.amount)}</td>
            <td>${statusBadge(i.status)}</td>
            <td><div class="table-actions">${actions}</div></td>
        </tr>`;
    }).join("");
}

function invoiceHtml(i) {
    const from = i.kind === "payable" ? i.party : MANUFACTURER;
    const to = i.kind === "payable" ? MANUFACTURER : i.party;
    return `
        <div class="invoice-head">
            <div><h4>Billed by</h4><p class="fw-600">${Store.esc(from)}</p></div>
            <div><h4>Billed to</h4><p class="fw-600">${Store.esc(to)}</p><p class="text-muted" style="font-size:13px">${Store.esc(i.address)}</p></div>
            <div><h4>Invoice</h4><p>${Store.esc(i.id)}</p><p class="text-muted" style="font-size:13px">Issued ${Store.date(i.issueDate)} · Due ${Store.date(i.dueDate)}</p></div>
        </div>
        <div class="invoice-table table-wrap">
            <table class="table">
                <thead><tr><th>Item</th><th>Order</th><th>Qty</th><th>Rate / Ton</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                    <tr>
                        <td>${Store.esc(i.item)}</td>
                        <td>${Store.esc(i.orderId)}</td>
                        <td>${Store.esc(i.quantity)} t</td>
                        <td>${Store.inr(i.price)}</td>
                        <td class="text-right">${Store.inr(i.subtotal)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="invoice-totals">
            <div><span>Subtotal</span><strong>${Store.inr(i.subtotal)}</strong></div>
            <div><span>GST (5%)</span><strong>${Store.inr(i.gst)}</strong></div>
            <div class="grand"><span>Total</span><span>${Store.inr(i.amount)}</span></div>
        </div>
        <p class="text-muted mt-2" style="font-size:13px">
            Status: <span class="badge ${i.status === "Paid" ? "badge-success" : i.status === "Overdue" ? "badge-danger" : "badge-warning"}">${i.status}</span>
            ${i.status === "Paid" && i.payment.paidOn ? " · Paid on " + Store.date(i.payment.paidOn) + (i.payment.method ? " via " + Store.esc(i.payment.method) : "") + (i.payment.ref ? " (Ref " + Store.esc(i.payment.ref) + ")" : "") : ""}
        </p>`;
}

function viewInvoice(id) {
    const i = findInvoice(id);
    if (!i) return invoiceMissing();

    document.getElementById("invoiceTitle").textContent = (i.kind === "payable" ? "Purchase invoice " : "Sales invoice ") + i.id;
    document.getElementById("invoiceBody").innerHTML = invoiceHtml(i);
    document.getElementById("invoiceFooter").innerHTML = `
        <button type="button" class="btn btn-secondary" data-close>Close</button>
        <button type="button" class="btn btn-secondary" data-action="downloadInvoice" data-id="${Store.esc(i.id)}"><i class="fa-solid fa-download"></i> Download</button>
        ${i.kind === "payable" && i.status !== "Paid" ? `<button type="button" class="btn btn-primary" data-action="openPay" data-id="${Store.esc(i.id)}"><i class="fa-solid fa-indian-rupee-sign"></i> Pay Now</button>` : ""}`;
    openModal("invoiceModal");
}

function downloadInvoice(id) {
    const i = findInvoice(id);
    if (!i) return invoiceMissing();

    const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${Store.esc(i.id)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;color:#1d2a21;margin:40px;}h1{color:#2f7d4f;font-size:22px;margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #e3e9e4;padding:8px 10px;text-align:left;font-size:14px}
th{background:#f4f9f5}.right{text-align:right}.muted{color:#5f6d63;font-size:13px}.grid{display:flex;gap:40px;margin-top:20px}</style></head>
<body><h1>Biomass Connect — Tax Invoice</h1><div class="muted">${Store.esc(i.id)} · Issued ${Store.date(i.issueDate)} · Due ${Store.date(i.dueDate)} · Status: ${i.status}</div>
<div class="grid"><div><strong>Billed by</strong><br>${Store.esc(i.kind === "payable" ? i.party : MANUFACTURER)}</div>
<div><strong>Billed to</strong><br>${Store.esc(i.kind === "payable" ? MANUFACTURER : i.party)}<br><span class="muted">${Store.esc(i.address)}</span></div></div>
<table><tr><th>Item</th><th>Order</th><th>Qty (t)</th><th>Rate / Ton</th><th class="right">Amount</th></tr>
<tr><td>${Store.esc(i.item)}</td><td>${Store.esc(i.orderId)}</td><td>${Store.esc(i.quantity)}</td><td>${Store.inr(i.price)}</td><td class="right">${Store.inr(i.subtotal)}</td></tr>
<tr><td colspan="4" class="right">GST (5%)</td><td class="right">${Store.inr(i.gst)}</td></tr>
<tr><th colspan="4" class="right">Total</th><th class="right">${Store.inr(i.amount)}</th></tr></table>
<p class="muted">This is a system generated invoice from Biomass Connect.</p></body></html>`;

    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = i.id + ".html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    showToast("Invoice " + i.id + " downloaded.", "success");
}

function openPay(id) {
    const i = findInvoice(id);
    if (!i) return invoiceMissing();
    if (i.kind !== "payable" || i.status === "Paid") {
        showToast("This invoice is already settled.", "info");
        return;
    }

    closeModal("invoiceModal");
    payingId = id;

    const date = document.getElementById("payDate");
    date.dataset.rules = "required|date|notFuture|minDate:" + i.issueDate;
    date.dataset.msgMinDate = "Payment date cannot be before the invoice date (" + Store.date(i.issueDate) + ")";
    date.min = i.issueDate;
    date.value = Store.iso(0);

    document.getElementById("payInfo").textContent =
        i.id + " · " + Store.inr(i.amount) + " to " + i.party + " for " + i.quantity + " t " + i.item + ".";
    openModal("payModal");
}

function recordPayment() {
    const form = document.getElementById("payForm");
    if (!Validator.validateForm(form)) return;

    const i = findInvoice(payingId);
    if (!i || i.status === "Paid") {
        closeModal("payModal");
        return invoiceMissing();
    }

    saveInvoiceState(i.id, {
        status: "Paid",
        paidOn: document.getElementById("payDate").value,
        method: document.getElementById("payMethod").value,
        ref: document.getElementById("payRef").value.trim().toUpperCase()
    });

    closeModal("payModal");
    showToast("Payment of " + Store.inr(i.amount) + " recorded for " + i.id + ". " + i.party + " has been notified.", "success", { title: "Payment successful" });
    renderAll();
}

function remind(id) {
    const i = findInvoice(id);
    if (!i) return invoiceMissing();

    if (i.payment.lastReminder === Store.iso(0)) {
        showToast("A payment reminder was already sent to " + i.party + " today.", "info");
        return;
    }

    saveInvoiceState(i.id, { lastReminder: Store.iso(0) });
    showToast("Payment reminder sent to " + i.party + " for " + i.id + " (" + Store.inr(i.amount) + ").", "success");
}

async function markReceived(id) {
    const i = findInvoice(id);
    if (!i) return invoiceMissing();

    const ok = await confirmDialog({
        title: "Mark payment as received?",
        message: "Confirm that " + Store.inr(i.amount) + " from " + i.party + " for " + i.id + " has been credited to your account.",
        confirmText: "Mark received"
    });
    if (!ok) return;

    saveInvoiceState(i.id, { status: "Paid", paidOn: Store.iso(0), method: "Bank credit" });
    showToast("Invoice " + i.id + " marked as paid.", "success");
    renderAll();
}

function invoiceMissing() {
    showToast("This invoice is no longer available.", "error");
    renderAll();
}

/* ---------------- Grievances (raised by manufacturer) ---------------- */

function fillOrderOptions() {
    const pos = Store.get("purchaseOrders").filter(o => o.manufacturer === MANUFACTURER && o.status !== "Cancelled");
    const pellets = Store.get("pelletOrders").filter(o => o.manufacturer === MANUFACTURER && o.status !== "Cancelled");

    const opt = (o, party, item) =>
        `<option value="${Store.esc(o.id)}" data-party="${Store.esc(party)}">${Store.esc(o.id)} · ${Store.esc(item)} · ${Store.esc(party)} (${Store.esc(o.status)})</option>`;

    let html = "";
    if (pos.length) html += `<optgroup label="Biomass purchase orders">${pos.map(o => opt(o, o.farmer, o.biomassType)).join("")}</optgroup>`;
    if (pellets.length) html += `<optgroup label="Pellet orders">${pellets.map(o => opt(o, o.powerPlant, o.pelletType)).join("")}</optgroup>`;
    document.getElementById("gOrder").insertAdjacentHTML("beforeend", html);
}

function preselectOrder() {
    const id = new URLSearchParams(location.search).get("order");
    if (!id) return;
    const select = document.getElementById("gOrder");
    if (![...select.options].some(o => o.value === id)) return;
    select.value = id;
    updateAgainst();
    showTab("grievances");
}

function updateAgainst() {
    const select = document.getElementById("gOrder");
    const opt = select.options[select.selectedIndex];
    document.getElementById("gAgainst").value = opt && opt.value ? opt.dataset.party : "";
}

function updateDescCount() {
    document.getElementById("gDescCount").textContent = document.getElementById("gDescription").value.length;
}

function submitGrievance() {
    const form = document.getElementById("grievanceForm");
    if (!Validator.validateForm(form)) return;

    const orderId = document.getElementById("gOrder").value;
    const category = document.getElementById("gCategory").value;

    const duplicate = complaints().find(c =>
        c.direction === "raised" && c.orderId === orderId && c.category === category && !["Resolved", "Closed"].includes(c.status));
    if (duplicate) {
        showToast("You already have an open " + category.toLowerCase() + " grievance (" + duplicate.id + ") for " + orderId + ".", "warning");
        return;
    }

    const file = document.getElementById("gAttachment").files[0];
    const party = document.getElementById("gAgainst").value;

    const record = Store.add(COMPLAINTS_KEY, {
        direction: "raised",
        orderId,
        orderType: orderId.startsWith("PP-") ? "pellet" : "purchase",
        party,
        category,
        priority: document.getElementById("gPriority").value,
        subject: document.getElementById("gSubject").value.trim(),
        description: document.getElementById("gDescription").value.trim(),
        attachment: file ? file.name : "",
        status: "Open",
        responses: []
    }, "GRV-");

    form.reset();
    showToast("Grievance " + record.id + " submitted. " + party + " and the Biomass Connect team have been notified.", "success", { title: "Grievance raised" });
    renderAll();
}

function renderGrievances() {
    const list = complaints().filter(c => c.direction === "raised")
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const table = document.getElementById("grievanceTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-flag"></i>You have not raised any grievances</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(c => {
        const id = Store.esc(c.id);
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td>${Store.esc(c.orderId)}</td>
            <td>${Store.esc(c.party)}</td>
            <td>${Store.esc(c.category)}</td>
            <td>${Store.esc(c.subject)}</td>
            <td>${Store.date(c.createdAt)}</td>
            <td><span class="${Store.badge(c.status)}">${Store.esc(c.status)}</span></td>
            <td><div class="table-actions">
                <button class="btn btn-secondary btn-sm btn-icon" data-action="viewComplaint" data-id="${id}" title="View" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                ${c.status === "Open" ? `<button class="btn btn-danger btn-sm" data-action="withdrawGrievance" data-id="${id}">Withdraw</button>` : ""}
            </div></td>
        </tr>`;
    }).join("");
}

async function withdrawGrievance(id) {
    const c = Store.find(COMPLAINTS_KEY, id);
    if (!c || c.status !== "Open") {
        showToast("Only open grievances can be withdrawn.", "warning");
        return renderAll();
    }

    const ok = await confirmDialog({
        title: "Withdraw grievance?",
        message: c.id + " (" + c.subject + ") will be closed and " + c.party + " will no longer be asked to respond.",
        confirmText: "Withdraw",
        danger: true
    });
    if (!ok) return;

    Store.update(COMPLAINTS_KEY, id, { status: "Closed", closedOn: Store.iso(0) });
    showToast("Grievance " + id + " withdrawn.", "success");
    renderAll();
}

/* ---------------- Customer complaints (received) ---------------- */

function renderComplaints() {
    const status = document.getElementById("complaintStatus").value;
    const list = complaints()
        .filter(c => c.direction === "received" && (!status || c.status === status))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const table = document.getElementById("complaintTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-face-smile"></i>No customer complaints${status ? " with this status" : ""}</div></td></tr>`;
        return;
    }

    const priorityBadge = p => `<span class="badge ${p === "High" ? "badge-danger" : p === "Medium" ? "badge-warning" : ""}">${Store.esc(p || "—")}</span>`;

    table.innerHTML = list.map(c => {
        const id = Store.esc(c.id);
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td>${Store.esc(c.orderId)}</td>
            <td>${Store.esc(c.party)}</td>
            <td>${Store.esc(c.category)}</td>
            <td>${Store.esc(c.subject)}</td>
            <td>${Store.date(c.createdAt)}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td><span class="${Store.badge(c.status)}">${Store.esc(c.status)}</span></td>
            <td><div class="table-actions">
                <button class="btn btn-secondary btn-sm btn-icon" data-action="viewComplaint" data-id="${id}" title="View" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                ${c.status !== "Resolved" ? `<button class="btn btn-primary btn-sm" data-action="openRespond" data-id="${id}"><i class="fa-solid fa-reply"></i> Respond</button>` : ""}
            </div></td>
        </tr>`;
    }).join("");
}

function complaintSummary(c) {
    return `
        <div class="complaint-quote">
            <strong>${Store.esc(c.subject)}</strong>
            ${Store.esc(c.description)}
        </div>`;
}

function viewComplaint(id) {
    const c = Store.find(COMPLAINTS_KEY, id);
    if (!c) {
        showToast("Complaint not found.", "error");
        return renderAll();
    }

    const responses = (c.responses || []).map(r =>
        `<li><small>${Store.esc(r.by)} · ${Store.date(r.date)}</small>${Store.esc(r.text)}</li>`).join("");

    document.getElementById("complaintTitle").textContent = c.id + " · " + c.category;
    document.getElementById("complaintBody").innerHTML = `
        <dl class="detail-list mb-2">
            <div><dt>${c.direction === "raised" ? "Raised against" : "Raised by"}</dt><dd>${Store.esc(c.party)}</dd></div>
            <div><dt>Order</dt><dd>${Store.esc(c.orderId)}</dd></div>
            <div><dt>Date</dt><dd>${Store.date(c.createdAt)}</dd></div>
            <div><dt>Status</dt><dd><span class="${Store.badge(c.status)}">${Store.esc(c.status)}</span></dd></div>
            <div><dt>Priority</dt><dd>${Store.esc(c.priority || "—")}</dd></div>
            <div><dt>Attachment</dt><dd>${Store.esc(c.attachment || "—")}</dd></div>
        </dl>
        ${complaintSummary(c)}
        ${responses ? `<ul class="response-list">${responses}</ul>` : `<p class="text-muted mt-2" style="font-size:13px">No responses yet.</p>`}`;
    openModal("complaintModal");
}

function openRespond(id) {
    const c = Store.find(COMPLAINTS_KEY, id);
    if (!c || c.status === "Resolved") {
        showToast("This complaint is already resolved.", "info");
        return renderAll();
    }

    respondingId = id;
    document.getElementById("respondTitle").textContent = "Respond to " + c.id;
    document.getElementById("respondInfo").innerHTML =
        `<strong>${Store.esc(c.party)} · ${Store.esc(c.orderId)} — ${Store.esc(c.subject)}</strong>${Store.esc(c.description)}`;
    openModal("respondModal");
}

function sendResponse() {
    const form = document.getElementById("respondForm");
    if (!Validator.validateForm(form)) return;

    const c = Store.find(COMPLAINTS_KEY, respondingId);
    if (!c) {
        closeModal("respondModal");
        showToast("Complaint not found.", "error");
        return renderAll();
    }

    const status = document.getElementById("responseStatus").value;
    const responses = (c.responses || []).concat({
        by: MANUFACTURER,
        text: document.getElementById("responseText").value.trim(),
        date: Store.iso(0)
    });

    Store.update(COMPLAINTS_KEY, c.id, { status, responses, respondedOn: Store.iso(0) });

    closeModal("respondModal");
    showToast("Response sent to " + c.party + ". " + c.id + " is now " + status.toLowerCase() + ".", "success", { title: "Response sent" });
    renderAll();
}

/* ---------------- Modal helpers ---------------- */

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
