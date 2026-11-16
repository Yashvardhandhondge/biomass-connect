// =========================
// FARMER — BILLING & COMPLAINTS (US014)
// Invoices are derived from delivered purchase orders.
// Payment status:  localStorage "farmer_invoice_status"  { [orderId]: { status, paidOn, remindedOn } }
// Complaints:      localStorage "farmer_complaints"
// =========================

const PAYMENT_KEY = "farmer_invoice_status";
const COMPLAINT_KEY = "farmer_complaints";
const PAYMENT_TERMS_DAYS = 15;
let updateComplaintCount = () => {};

document.addEventListener("DOMContentLoaded", () => {

    seedData();

    updateComplaintCount = Farmer.counter("complaintDescription", "complaintCount", 500);

    document.getElementById("pageTabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (tab) switchTab(tab.dataset.tab);
    });

    document.getElementById("raiseBtn").addEventListener("click", () => openComplaintForm(""));

    document.getElementById("invoiceSearch").addEventListener("input", renderInvoices);
    document.getElementById("invoiceStatus").addEventListener("change", renderInvoices);
    document.getElementById("invoiceTable").addEventListener("click", onInvoiceAction);
    document.getElementById("invoiceFooter").addEventListener("click", onInvoiceAction);

    document.getElementById("complaintTable").addEventListener("click", onComplaintAction);

    document.getElementById("complaintFile").addEventListener("change", e => {
        const input = e.target;
        if (input.files.length && Validator.validateField(input)) {
            showToast("Attached " + input.files[0].name, "success");
        }
    });

    document.getElementById("complaintReset").addEventListener("click", () => {
        resetComplaintForm();
        showToast("Complaint form cleared", "info");
    });

    document.getElementById("complaintForm").addEventListener("submit", e => {
        e.preventDefault();
        submitComplaint();
    });

    fillOrderSelect();
    renderAll();

    if (Farmer.param("tab") === "complaints") switchTab("complaints");
});

/* ---------- Seed ---------- */

function seedData() {
    if (!Farmer.readJSON(PAYMENT_KEY, null)) {
        Farmer.writeJSON(PAYMENT_KEY, { "PO-B2042": { status: "Paid", paidOn: Store.iso(-1) } });
    }
    if (!Array.isArray(Farmer.readJSON(COMPLAINT_KEY, null))) {
        Farmer.writeJSON(COMPLAINT_KEY, [{
            id: "CMP-1001",
            orderId: "PO-B2042",
            category: "Payment Delay",
            priority: "Medium",
            subject: "Payment for wheat straw delivery not received",
            description: "The order was delivered on time but the payment had not been credited to my bank account after five days.",
            attachment: "",
            date: Store.iso(-3),
            status: "Resolved",
            response: "The buyer has released the payment. It was credited to your account on " + Store.date(Store.iso(-1)) + "."
        }]);
    }
}

function payments() {
    return Farmer.readJSON(PAYMENT_KEY, {}) || {};
}

function complaints() {
    const list = Farmer.readJSON(COMPLAINT_KEY, []);
    return Array.isArray(list) ? list : [];
}

/* ---------- Tabs ---------- */

function switchTab(name) {
    document.querySelectorAll("#pageTabs .tab").forEach(t => {
        const active = t.dataset.tab === name;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active);
    });
    document.getElementById("panel-invoices").classList.toggle("hidden", name !== "invoices");
    document.getElementById("panel-complaints").classList.toggle("hidden", name !== "complaints");
}

function renderAll() {
    renderInvoices();
    renderComplaints();
}

/* ---------- Invoices ---------- */

function invoices() {
    const pay = payments();
    const today = Farmer.today();

    return Farmer.orders()
        .filter(o => o.status === "Delivered")
        .map(o => {
            const date = o.deliveredDate || o.expectedDelivery || o.deliveryDate || o.orderDate;
            const due = Farmer.addDays(date, PAYMENT_TERMS_DAYS);
            const record = pay[o.id] || {};
            let status = record.status === "Paid" ? "Paid" : "Pending";
            if (status === "Pending" && due < today) status = "Overdue";
            return {
                no: "INV-" + String(o.id).replace(/^PO-/, ""),
                order: o,
                date, due, status,
                paidOn: record.paidOn || "",
                remindedOn: record.remindedOn || ""
            };
        })
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function findInvoice(no) {
    return invoices().find(i => i.no === no) || null;
}

function renderInvoices() {
    const all = invoices();
    renderKpis(all);

    const q = document.getElementById("invoiceSearch").value.trim().toLowerCase();
    const status = document.getElementById("invoiceStatus").value;
    const rows = all.filter(i =>
        (!status || i.status === status) &&
        (!q || [i.no, i.order.id, i.order.manufacturer].join(" ").toLowerCase().includes(q)));

    const table = document.getElementById("invoiceTable");

    if (!rows.length) {
        table.innerHTML = Farmer.emptyRow(8, "fa-file-invoice",
            all.length ? "No invoices match your filters." : "No invoices yet. Invoices appear once an order is delivered.");
        return;
    }

    table.innerHTML = rows.map(i => `
        <tr>
            <td class="fw-600">${Store.esc(i.no)}</td>
            <td>${Store.esc(i.order.id)}</td>
            <td>${Store.esc(i.order.manufacturer)}</td>
            <td>${Store.date(i.date)}</td>
            <td>${Store.date(i.due)}</td>
            <td>${Store.inr(i.order.total)}</td>
            <td>${Farmer.badge(i.status)}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn btn-secondary btn-sm btn-icon" data-action="view" data-no="${Store.esc(i.no)}" title="View invoice" aria-label="View ${Store.esc(i.no)}"><i class="fa-solid fa-eye"></i></button>
                    <button type="button" class="btn btn-secondary btn-sm btn-icon" data-action="download" data-no="${Store.esc(i.no)}" title="Download invoice" aria-label="Download ${Store.esc(i.no)}"><i class="fa-solid fa-download"></i></button>
                    ${i.status !== "Paid" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="remind" data-no="${Store.esc(i.no)}"><i class="fa-regular fa-bell"></i> Remind</button>` : ""}
                </div>
            </td>
        </tr>`).join("");
}

function renderKpis(all) {
    const sum = list => list.reduce((s, i) => s + Number(i.order.total || 0), 0);
    document.getElementById("kpiInvoiced").textContent = Store.inr(sum(all));
    document.getElementById("kpiPaid").textContent = Store.inr(sum(all.filter(i => i.status === "Paid")));
    document.getElementById("kpiPending").textContent = Store.inr(sum(all.filter(i => i.status !== "Paid")));
    document.getElementById("kpiComplaints").textContent =
        complaints().filter(c => c.status === "Open" || c.status === "In Review").length;
}

function onInvoiceAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const inv = findInvoice(btn.dataset.no);
    if (!inv) {
        showToast("Invoice " + btn.dataset.no + " is no longer available", "error");
        renderInvoices();
        return;
    }
    if (btn.dataset.action === "view") viewInvoice(inv);
    if (btn.dataset.action === "download") downloadInvoice(inv);
    if (btn.dataset.action === "remind") sendReminder(inv);
    if (btn.dataset.action === "complain") {
        Farmer.closeModal("invoiceModal");
        openComplaintForm(inv.order.id);
    }
}

function viewInvoice(inv) {
    const o = inv.order;
    const profile = Farmer.readJSON("bc_profile_farmer", {}) || {};
    const seller = [profile.village, profile.district, profile.state].filter(Boolean).join(", ");

    document.getElementById("invoiceTitle").textContent = "Invoice " + inv.no;
    document.getElementById("invoiceBody").innerHTML = `
        <div class="invoice-head">
            <div>
                <div class="text-subtle">Billed by</div>
                <strong>${Store.esc(profile.name || FARMER_NAME)}</strong>
                <div class="text-muted">${Store.esc(seller || "Farmer")}</div>
            </div>
            <div>
                <div class="text-subtle">Billed to</div>
                <strong>${Store.esc(o.manufacturer)}</strong>
                <div class="text-muted">${Store.esc(o.deliveryAddress || "")}</div>
            </div>
        </div>
        <dl class="detail-list mt-2">
            <div><dt>Invoice Date</dt><dd>${Store.date(inv.date)}</dd></div>
            <div><dt>Due Date</dt><dd>${Store.date(inv.due)}</dd></div>
            <div><dt>Order</dt><dd>${Store.esc(o.id)}</dd></div>
            <div><dt>Status</dt><dd>${Farmer.badge(inv.status)}${inv.paidOn ? ' <span class="text-subtle">on ' + Store.date(inv.paidOn) + "</span>" : ""}</dd></div>
        </dl>
        <div class="table-wrap mt-2">
            <table class="table invoice-lines">
                <thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                    <tr>
                        <td>${Store.esc(o.biomassType)}</td>
                        <td>${Farmer.tons(o.quantity)}</td>
                        <td>${Store.inr(o.price)} / ton</td>
                        <td class="text-right">${Store.inr(o.total)}</td>
                    </tr>
                    <tr class="invoice-total">
                        <td colspan="3">Total payable</td>
                        <td class="text-right">${Store.inr(o.total)}</td>
                    </tr>
                </tbody>
            </table>
        </div>`;

    document.getElementById("invoiceFooter").innerHTML = `
        <button type="button" class="btn btn-ghost" data-action="complain" data-no="${Store.esc(inv.no)}"><i class="fa-solid fa-headset"></i> Report an Issue</button>
        <button type="button" class="btn btn-secondary" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-action="download" data-no="${Store.esc(inv.no)}"><i class="fa-solid fa-download"></i> Download</button>`;

    Farmer.openModal("invoiceModal");
}

function downloadInvoice(inv) {
    const o = inv.order;
    const profile = Farmer.readJSON("bc_profile_farmer", {}) || {};
    const line = "-".repeat(48);
    const text = [
        "BIOMASS CONNECT - INVOICE",
        line,
        "Invoice No   : " + inv.no,
        "Invoice Date : " + Store.date(inv.date),
        "Due Date     : " + Store.date(inv.due),
        "Status       : " + inv.status + (inv.paidOn ? " (" + Store.date(inv.paidOn) + ")" : ""),
        line,
        "Billed by    : " + (profile.name || FARMER_NAME),
        "               " + [profile.village, profile.district, profile.state].filter(Boolean).join(", "),
        "Billed to    : " + o.manufacturer,
        "               " + (o.deliveryAddress || ""),
        line,
        "Order ID     : " + o.id,
        "Item         : " + o.biomassType,
        "Quantity     : " + Farmer.tons(o.quantity),
        "Rate         : INR " + Number(o.price).toLocaleString("en-IN") + " per ton",
        "Total        : INR " + Number(o.total).toLocaleString("en-IN"),
        line,
        "Generated on " + Store.date(Farmer.today()) + " via Biomass Connect"
    ].join("\r\n");

    Farmer.download(inv.no + ".txt", text, "text/plain;charset=utf-8");
    showToast("Invoice " + inv.no + " downloaded", "success");
}

function sendReminder(inv) {
    if (inv.status === "Paid") {
        showToast("Invoice " + inv.no + " is already paid", "info");
        return;
    }
    if (inv.remindedOn === Farmer.today()) {
        showToast("A reminder for " + inv.no + " was already sent today", "warning");
        return;
    }
    const pay = payments();
    pay[inv.order.id] = Object.assign({ status: "Pending" }, pay[inv.order.id], { remindedOn: Farmer.today() });
    Farmer.writeJSON(PAYMENT_KEY, pay);
    renderInvoices();
    showToast("Payment reminder for " + inv.no + " sent to " + inv.order.manufacturer, "success");
}

/* ---------- Complaints ---------- */

function fillOrderSelect(selected) {
    const select = document.getElementById("complaintOrder");
    const orders = Farmer.orders().sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
    select.innerHTML = '<option value="">' + (orders.length ? "Select order" : "No orders available") + "</option>" +
        orders.map(o => `<option value="${Store.esc(o.id)}">${Store.esc(o.id)} · ${Store.esc(o.biomassType)} · ${Store.esc(o.manufacturer)}</option>`).join("");
    if (selected) select.value = selected;
}

function openComplaintForm(orderId) {
    switchTab("complaints");
    if (orderId) {
        document.getElementById("complaintOrder").value = orderId;
        Validator.validateField(document.getElementById("complaintOrder"));
    }
    const target = orderId ? document.getElementById("complaintCategory") : document.getElementById("complaintOrder");
    target.focus({ preventScroll: true });
    document.getElementById("complaintForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetComplaintForm() {
    const form = document.getElementById("complaintForm");
    form.reset();
    Validator.reset(form);
    updateComplaintCount();
}

function nextComplaintId(list) {
    const nums = list.map(c => parseInt(String(c.id).replace("CMP-", ""), 10)).filter(n => !isNaN(n));
    return "CMP-" + (nums.length ? Math.max(...nums) + 1 : 1001);
}

function submitComplaint() {

    if (!Validator.validateForm("#complaintForm")) return;

    const orderId = document.getElementById("complaintOrder").value;
    const category = document.getElementById("complaintCategory").value;

    if (!Store.find("purchaseOrders", orderId)) {
        showToast("The selected order no longer exists. Please choose another order.", "error");
        fillOrderSelect();
        return;
    }

    const list = complaints();
    const duplicate = list.find(c => c.orderId === orderId && c.category === category && (c.status === "Open" || c.status === "In Review"));
    if (duplicate) {
        showToast("You already have an open " + category.toLowerCase() + " complaint (" + duplicate.id + ") for " + orderId + ".", "warning",
            { title: "Duplicate complaint" });
        return;
    }

    const file = document.getElementById("complaintFile");
    const record = {
        id: nextComplaintId(list),
        orderId,
        category,
        priority: document.getElementById("complaintPriority").value,
        subject: document.getElementById("complaintSubject").value.trim(),
        description: document.getElementById("complaintDescription").value.trim(),
        attachment: file.files.length ? file.files[0].name : "",
        date: Farmer.today(),
        status: "Open",
        response: ""
    };

    list.unshift(record);
    if (!Farmer.writeJSON(COMPLAINT_KEY, list)) {
        showToast("Could not save the complaint. Please try again.", "error");
        return;
    }

    resetComplaintForm();
    renderAll();
    showToast("Complaint " + record.id + " submitted. Our support team will respond within 48 hours.", "success");
}

function renderComplaints() {
    const list = complaints();
    document.getElementById("complaintCountLabel").textContent = list.length + " complaint" + (list.length === 1 ? "" : "s");
    document.getElementById("kpiComplaints").textContent = list.filter(c => c.status === "Open" || c.status === "In Review").length;

    const table = document.getElementById("complaintTable");
    if (!list.length) {
        table.innerHTML = Farmer.emptyRow(8, "fa-headset", "You have not raised any complaints.");
        return;
    }

    table.innerHTML = list.map(c => `
        <tr>
            <td class="fw-600">${Store.esc(c.id)}</td>
            <td>${Store.esc(c.orderId)}</td>
            <td>${Store.esc(c.category)}</td>
            <td class="cell-subject" title="${Store.esc(c.subject)}">${Store.esc(c.subject)}</td>
            <td>${Store.esc(c.priority || "—")}</td>
            <td>${Store.date(c.date)}</td>
            <td>${Farmer.badge(c.status)}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn btn-secondary btn-sm btn-icon" data-action="view" data-id="${Store.esc(c.id)}" title="View complaint" aria-label="View ${Store.esc(c.id)}"><i class="fa-solid fa-eye"></i></button>
                    ${c.status === "Open" ? `<button type="button" class="btn btn-danger btn-sm" data-action="withdraw" data-id="${Store.esc(c.id)}">Withdraw</button>` : ""}
                </div>
            </td>
        </tr>`).join("");
}

function onComplaintAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const c = complaints().find(x => x.id === btn.dataset.id);
    if (!c) {
        showToast("Complaint " + btn.dataset.id + " no longer exists", "error");
        renderComplaints();
        return;
    }
    if (btn.dataset.action === "view") viewComplaint(c);
    if (btn.dataset.action === "withdraw") withdrawComplaint(c);
}

function viewComplaint(c) {
    document.getElementById("complaintTitle").textContent = "Complaint " + c.id;
    document.getElementById("complaintBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Order</dt><dd>${Store.esc(c.orderId)}</dd></div>
            <div><dt>Status</dt><dd>${Farmer.badge(c.status)}</dd></div>
            <div><dt>Category</dt><dd>${Store.esc(c.category)}</dd></div>
            <div><dt>Priority</dt><dd>${Store.esc(c.priority || "—")}</dd></div>
            <div><dt>Raised On</dt><dd>${Store.date(c.date)}</dd></div>
            <div><dt>Attachment</dt><dd>${Store.esc(c.attachment || "None")}</dd></div>
            <div class="span-full"><dt>Subject</dt><dd>${Store.esc(c.subject)}</dd></div>
            <div class="span-full"><dt>Description</dt><dd class="pre-wrap">${Store.esc(c.description)}</dd></div>
            ${c.response ? `<div class="span-full"><dt>Support Response</dt><dd class="pre-wrap">${Store.esc(c.response)}</dd></div>` : ""}
        </dl>`;
    Farmer.openModal("complaintModal");
}

async function withdrawComplaint(c) {
    if (c.status !== "Open") {
        showToast("Only open complaints can be withdrawn", "warning");
        return;
    }
    const ok = await confirmDialog({
        title: "Withdraw complaint " + c.id + "?",
        message: "The support team will stop working on \"" + c.subject + "\". This cannot be undone.",
        confirmText: "Withdraw",
        danger: true
    });
    if (!ok) return;

    const list = complaints().map(x => x.id === c.id ? Object.assign({}, x, { status: "Withdrawn", withdrawnOn: Farmer.today() }) : x);
    Farmer.writeJSON(COMPLAINT_KEY, list);
    renderAll();
    showToast("Complaint " + c.id + " withdrawn", "success");
}
