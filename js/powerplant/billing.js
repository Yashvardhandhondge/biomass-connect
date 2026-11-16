// =========================
// BILLING & COMPLAINTS (US034)
// =========================

const COMPLAINTS_KEY = "powerplant_complaints";
const PAYMENTS_KEY = "powerplant_payments";
const GST_RATE = 0.05;
const PAYMENT_TERMS_DAYS = 30;
const INVOICED_STATUSES = ["Accepted", "In Transit", "Delivered"];
const OPEN_COMPLAINT = ["Open", "In Review"];

let currentInvoiceId = null;

document.addEventListener("DOMContentLoaded", () => {

    seedComplaints();

    // tabs
    document.getElementById("billingTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (tab) showTab(tab.dataset.tab);
    });
    document.querySelectorAll("[data-goto]").forEach(btn =>
        btn.addEventListener("click", () => showTab(btn.dataset.goto)));
    const hash = location.hash.replace("#", "");
    if (["invoices", "complaint", "history"].includes(hash)) showTab(hash);

    // invoices
    document.getElementById("invoiceSearch").addEventListener("input", renderInvoices);
    document.getElementById("invoiceStatus").addEventListener("change", renderInvoices);
    document.getElementById("invoiceTable").addEventListener("click", onInvoiceAction);
    document.getElementById("invoiceModalDownload").addEventListener("click", () => downloadInvoice(currentInvoiceId));
    document.getElementById("payForm").addEventListener("submit", recordPayment);

    // complaints
    populateOrders();
    Plant.counter("complaintDescription", "descriptionCount");
    const form = document.getElementById("complaintForm");
    form.addEventListener("submit", submitComplaint);
    form.addEventListener("reset", () => setTimeout(() => Validator.reset(form), 0));
    document.getElementById("complaintTable").addEventListener("click", onComplaintAction);

    const preOrder = Plant.param("order");
    if (preOrder && Plant.orders().some(o => o.id === preOrder)) {
        document.getElementById("complaintOrder").value = preOrder;
        showTab("complaint");
    }

    refresh();
});

function refresh() {
    loadKpis();
    renderInvoices();
    renderComplaints();
}

function showTab(name) {
    document.querySelectorAll("#billingTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== "panel-" + name));
}

/* ---------------- Data ---------------- */

function seedComplaints() {
    if (localStorage.getItem(COMPLAINTS_KEY) !== null) return;
    Store.set(COMPLAINTS_KEY, [
        {
            id: "CMP-1002", orderId: "PP-3011", manufacturer: "EcoFuel Pellets Ltd", category: "Delayed delivery",
            subject: "Dispatch delayed by two days",
            description: "The consignment was confirmed for dispatch on the order date but left the factory two days late. Please share the revised arrival time so unloading can be planned.",
            attachment: "", status: "In Review", date: Store.iso(-1), response: "Supplier has acknowledged the delay and shared the vehicle details."
        },
        {
            id: "CMP-1001", orderId: "PP-3008", manufacturer: "GreenPellet Industries", category: "Pellet quality issue",
            subject: "Moisture higher than declared",
            description: "Our lab test of the received batch shows 10.8% moisture against the declared 8%. Requesting a price adjustment for the affected lot.",
            attachment: "lab-report-PP-3008.pdf", status: "Resolved", date: Store.iso(-2), response: "Supplier issued a credit note of ₹12,000 against the affected lot."
        }
    ]);
}

function complaints() {
    return Store.get(COMPLAINTS_KEY).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.id).localeCompare(String(a.id)));
}

function payments() {
    try {
        const p = JSON.parse(localStorage.getItem(PAYMENTS_KEY));
        return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch (e) {
        return {};
    }
}

function invoices() {
    const paid = payments();
    const today = Store.iso(0);

    return Plant.orders()
        .filter(o => INVOICED_STATUSES.includes(o.status))
        .map(o => {
            const id = "INV-" + o.id;
            const subtotal = Number(o.total) || 0;
            const gst = Plant.round(subtotal * GST_RATE, 2);
            const due = Plant.addDays(o.orderDate, PAYMENT_TERMS_DAYS);
            const payment = paid[id] || null;
            return {
                id, order: o, date: o.orderDate, due, subtotal, gst,
                amount: Plant.round(subtotal + gst, 2),
                payment,
                status: payment ? "Paid" : due < today ? "Overdue" : "Unpaid"
            };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
}

function findInvoice(id) {
    return invoices().find(i => i.id === id) || null;
}

/* ---------------- KPIs ---------------- */

function loadKpis() {
    const list = invoices();
    const paid = list.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);
    const due = list.filter(i => i.status !== "Paid");
    const overdue = due.filter(i => i.status === "Overdue").length;

    document.getElementById("kpiInvoices").textContent = list.length;
    document.getElementById("kpiPaid").textContent = Store.inr(paid);
    document.getElementById("kpiOutstanding").textContent = Store.inr(due.reduce((s, i) => s + i.amount, 0));
    document.getElementById("kpiOverdue").textContent = overdue ? overdue + " overdue" : "";
    document.getElementById("kpiComplaints").textContent = complaints().filter(c => OPEN_COMPLAINT.includes(c.status)).length;
}

/* ---------------- Invoices ---------------- */

function renderInvoices() {
    const q = document.getElementById("invoiceSearch").value.trim().toLowerCase();
    const status = document.getElementById("invoiceStatus").value;
    const list = invoices()
        .filter(i => !status || i.status === status)
        .filter(i => !q || [i.id, i.order.id, i.order.manufacturer].join(" ").toLowerCase().includes(q));

    const table = document.getElementById("invoiceTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(8, "fa-file-invoice", q || status ? "No invoices match your search" : "No invoices yet — invoices appear once a supplier accepts your order");
        return;
    }

    table.innerHTML = list.map(i => {
        const id = Store.esc(i.id);
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td>${Store.esc(i.order.id)}</td>
            <td>${Store.esc(i.order.manufacturer)}</td>
            <td>${Store.date(i.date)}</td>
            <td>${Store.date(i.due)}</td>
            <td>${Store.inr(i.amount)}</td>
            <td><span class="${Store.badge(i.status)}">${i.status}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon" type="button" data-action="view" data-id="${id}" title="View invoice" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-ghost btn-icon" type="button" data-action="download" data-id="${id}" title="Download invoice" aria-label="Download ${id}"><i class="fa-solid fa-download"></i></button>
                    ${i.status !== "Paid" ? `<button class="btn btn-primary btn-sm" type="button" data-action="pay" data-id="${id}">Pay</button>` : ""}
                </div>
            </td>
        </tr>`;
    }).join("");
}

function onInvoiceAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") viewInvoice(id);
    if (btn.dataset.action === "download") downloadInvoice(id);
    if (btn.dataset.action === "pay") openPay(id);
}

function viewInvoice(id) {
    const inv = findInvoice(id);
    if (!inv) {
        showToast("Invoice not found", "error");
        return;
    }
    currentInvoiceId = id;
    const o = inv.order;

    document.getElementById("invoiceModalTitle").textContent = "Invoice " + inv.id;
    document.getElementById("invoiceModalBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Store.badge(inv.status)}">${inv.status}</span></dd></div>
            <div><dt>Order</dt><dd>${Store.esc(o.id)}</dd></div>
            <div><dt>Supplier</dt><dd>${Store.esc(o.manufacturer)}</dd></div>
            <div><dt>Billed To</dt><dd>${Store.esc(Plant.profile().name)}</dd></div>
            <div><dt>Invoice Date</dt><dd>${Store.date(inv.date)}</dd></div>
            <div><dt>Due Date</dt><dd>${Store.date(inv.due)}</dd></div>
            ${inv.payment ? `
            <div><dt>Paid On</dt><dd>${Store.date(inv.payment.date)}</dd></div>
            <div><dt>Payment</dt><dd>${Store.esc(inv.payment.mode)} · ${Store.esc(inv.payment.ref)}</dd></div>` : ""}
        </dl>
        <div class="invoice-lines">
            <table class="table">
                <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                    <tr>
                        <td>${Store.esc(o.pelletType)} (${Store.esc(o.grade)})</td>
                        <td>${Plant.num(o.quantity)} t</td>
                        <td>${Store.inr(o.price)}</td>
                        <td class="text-right">${Store.inr(inv.subtotal)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" class="text-muted">GST @ ${GST_RATE * 100}%</td>
                        <td class="text-right">${Store.inr(inv.gst)}</td>
                    </tr>
                </tbody>
                <tfoot><tr><td colspan="3">Total payable</td><td class="text-right">${Store.inr(inv.amount)}</td></tr></tfoot>
            </table>
        </div>`;
    Plant.openModal("invoiceModal");
}

function downloadInvoice(id) {
    const inv = findInvoice(id);
    if (!inv) {
        showToast("Invoice not found", "error");
        return;
    }
    const o = inv.order;
    const p = Plant.profile();
    const line = "-".repeat(56);

    const text = [
        "BIOMASS CONNECT - TAX INVOICE",
        line,
        "Invoice No   : " + inv.id,
        "Invoice Date : " + Store.date(inv.date),
        "Due Date     : " + Store.date(inv.due),
        "Order        : " + o.id,
        line,
        "Supplier     : " + o.manufacturer,
        "Billed To    : " + p.name + (p.gst ? " (GSTIN " + p.gst + ")" : ""),
        "Ship To      : " + (o.deliveryAddress || ""),
        line,
        "Item         : " + o.pelletType + " (" + o.grade + ")",
        "Quantity     : " + Plant.num(o.quantity) + " t x " + Store.inr(o.price) + " / t",
        "Subtotal     : " + Store.inr(inv.subtotal),
        "GST @ " + (GST_RATE * 100) + "%    : " + Store.inr(inv.gst),
        "TOTAL        : " + Store.inr(inv.amount),
        line,
        "Status       : " + inv.status + (inv.payment ? " on " + Store.date(inv.payment.date) + " via " + inv.payment.mode + " (" + inv.payment.ref + ")" : ""),
        "",
        "This is a system generated invoice."
    ].join("\r\n");

    Plant.downloadText(inv.id + ".txt", text);
    showToast(`Invoice ${inv.id} downloaded`, "success");
}

function openPay(id) {
    const inv = findInvoice(id);
    if (!inv) {
        showToast("Invoice not found", "error");
        return;
    }
    if (inv.status === "Paid") {
        showToast(`Invoice ${id} is already paid`, "info");
        return;
    }

    document.getElementById("payInvoiceId").value = inv.id;
    const ref = document.getElementById("payInvoiceDate");
    ref.value = inv.date;
    ref.dispatchEvent(new Event("change"));

    document.getElementById("payMode").value = "";
    document.getElementById("payDate").value = Store.iso(0);
    document.getElementById("payRef").value = "";
    document.getElementById("payModalTitle").textContent = "Pay Invoice " + inv.id;
    document.getElementById("paySummary").innerHTML = `
        <div>
            <div class="fw-600">${Store.esc(inv.order.manufacturer)}</div>
            <small class="text-muted">Order ${Store.esc(inv.order.id)} · due ${Store.date(inv.due)}</small>
        </div>
        <strong>${Store.inr(inv.amount)}</strong>`;

    Plant.openModal("payModal");
}

function recordPayment(e) {
    e.preventDefault();

    if (!Validator.validateForm("#payForm")) return;

    const id = document.getElementById("payInvoiceId").value;
    const inv = findInvoice(id);
    if (!inv || inv.status === "Paid") {
        Plant.closeModal("payModal");
        showToast("This invoice has already been paid", "info");
        refresh();
        return;
    }

    const ref = document.getElementById("payRef").value.trim().toUpperCase();
    const all = payments();
    if (Object.keys(all).some(k => all[k].ref === ref)) {
        showToast("This transaction reference is already used for another invoice", "error");
        document.getElementById("payRef").focus();
        return;
    }

    all[id] = {
        mode: document.getElementById("payMode").value,
        date: document.getElementById("payDate").value,
        ref,
        amount: inv.amount
    };
    Store.set(PAYMENTS_KEY, all);

    Plant.closeModal("payModal");
    showToast(`Payment of ${Store.inr(inv.amount)} recorded for ${id}`, "success");
    refresh();
}

/* ---------------- Complaints ---------------- */

function populateOrders() {
    const select = document.getElementById("complaintOrder");
    Plant.orders()
        .slice()
        .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""))
        .forEach(o => select.insertAdjacentHTML("beforeend",
            `<option value="${Store.esc(o.id)}">${Store.esc(o.id)} — ${Store.esc(o.pelletType)} · ${Store.esc(o.manufacturer)} (${Store.esc(o.status)})</option>`));
}

function submitComplaint(e) {
    e.preventDefault();

    if (!Validator.validateForm("#complaintForm")) return;

    const orderId = document.getElementById("complaintOrder").value;
    const category = document.getElementById("complaintCategory").value;
    const order = Store.find("pelletOrders", orderId);

    if (!order) {
        showToast("The selected order could not be found", "error");
        return;
    }

    const duplicate = complaints().find(c => c.orderId === orderId && c.category === category && OPEN_COMPLAINT.includes(c.status));
    if (duplicate) {
        showToast(`Complaint ${duplicate.id} for this order and category is still open. Please wait for it to be resolved.`, "warning");
        return;
    }

    const file = document.getElementById("complaintFile").files[0];

    const complaint = Store.add(COMPLAINTS_KEY, {
        orderId,
        manufacturer: order.manufacturer,
        category,
        subject: document.getElementById("complaintSubject").value.trim(),
        description: document.getElementById("complaintDescription").value.trim(),
        attachment: file ? file.name : "",
        status: "Open",
        date: Store.iso(0),
        response: ""
    }, "CMP-");

    showToast(`Grievance ${complaint.id} submitted. ${order.manufacturer} and the admin team have been notified.`, "success");

    const form = document.getElementById("complaintForm");
    form.reset();
    Validator.reset(form);
    refresh();
    showTab("history");
}

function renderComplaints() {
    const list = complaints();
    const table = document.getElementById("complaintTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(7, "fa-headset", "You haven't raised any complaints");
        return;
    }

    table.innerHTML = list.map(c => {
        const id = Store.esc(c.id);
        return `
        <tr>
            <td class="fw-600">${id}</td>
            <td>${Store.esc(c.orderId)}</td>
            <td>${Store.esc(c.category)}</td>
            <td class="subject-cell" title="${Store.esc(c.subject)}">${Store.esc(c.subject)}</td>
            <td>${Store.date(c.date)}</td>
            <td><span class="${Store.badge(c.status)}">${Store.esc(c.status)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon" type="button" data-action="view" data-id="${id}" title="View complaint" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                    ${c.status === "Open" ? `<button class="btn btn-danger btn-icon" type="button" data-action="withdraw" data-id="${id}" title="Withdraw complaint" aria-label="Withdraw ${id}"><i class="fa-solid fa-xmark"></i></button>` : ""}
                </div>
            </td>
        </tr>`;
    }).join("");
}

function onComplaintAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "view") viewComplaint(btn.dataset.id);
    if (btn.dataset.action === "withdraw") withdrawComplaint(btn.dataset.id);
}

function viewComplaint(id) {
    const c = Store.find(COMPLAINTS_KEY, id);
    if (!c) {
        showToast("Complaint not found", "error");
        return;
    }

    document.getElementById("complaintModalTitle").textContent = "Complaint " + c.id;
    document.getElementById("complaintModalBody").innerHTML = `
        <dl class="detail-list mb-2">
            <div><dt>Status</dt><dd><span class="${Store.badge(c.status)}">${Store.esc(c.status)}</span></dd></div>
            <div><dt>Raised On</dt><dd>${Store.date(c.date)}</dd></div>
            <div><dt>Order</dt><dd>${Store.esc(c.orderId)}</dd></div>
            <div><dt>Supplier</dt><dd>${Store.esc(c.manufacturer || "—")}</dd></div>
            <div><dt>Category</dt><dd>${Store.esc(c.category)}</dd></div>
            <div><dt>Attachment</dt><dd>${c.attachment ? Store.esc(c.attachment) : "—"}</dd></div>
            <div class="span-2"><dt>Subject</dt><dd>${Store.esc(c.subject)}</dd></div>
        </dl>
        <p class="form-label">Description</p>
        <div class="complaint-text">${Store.esc(c.description)}</div>
        ${c.response ? `<p class="form-label mt-2">Response</p><div class="complaint-text">${Store.esc(c.response)}</div>` : ""}`;
    Plant.openModal("complaintModal");
}

async function withdrawComplaint(id) {
    const c = Store.find(COMPLAINTS_KEY, id);
    if (!c || c.status !== "Open") {
        showToast("Only open complaints can be withdrawn", "warning");
        renderComplaints();
        return;
    }

    const ok = await confirmDialog({
        title: "Withdraw complaint " + c.id + "?",
        message: `"${c.subject}" will be closed and no further action will be taken.`,
        confirmText: "Withdraw",
        danger: true
    });
    if (!ok) return;

    Store.update(COMPLAINTS_KEY, id, { status: "Withdrawn" });
    showToast(`Complaint ${id} withdrawn`, "success");
    refresh();
}
