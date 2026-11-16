// =========================
// ADMIN — DISPUTE MANAGEMENT (US042)
// =========================

const DISPUTES_KEY = "admin_disputes";

// resolution type → how the refund / penalty amount field behaves
const REFUND_MODE = {
    "Full refund to buyer": "full",
    "Partial refund to buyer": "partial",
    "Penalty on seller": "required",
    "Replacement shipment": "optional",
    "Mutual settlement": "optional",
    "Payment released to seller": "none",
    "Dismissed – no fault found": "none"
};

let activeTab = "All";
let currentId = null;

Validator.addRule("lessThan", (v, p, el, label) =>
    Number(v) < Number(p) ? "" : label + " must be less than the order value of " + Store.inr(p) + " for a partial refund");

document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("#statusTabs .tab").forEach(tab =>
        tab.addEventListener("click", () => { activeTab = tab.dataset.status; render(); }));

    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("categoryFilter").addEventListener("change", render);
    document.getElementById("priorityFilter").addEventListener("change", render);
    document.getElementById("disputeTable").addEventListener("click", onAction);
    document.getElementById("viewFooter").addEventListener("click", onAction);
    document.getElementById("exportBtn").addEventListener("click", exportDisputes);
    document.getElementById("assignForm").addEventListener("submit", assignDispute);
    document.getElementById("resolveForm").addEventListener("submit", resolveDispute);
    document.getElementById("resolutionType").addEventListener("change", updateRefundField);

    render();

    const id = new URLSearchParams(location.search).get("id");
    if (id) {
        if (Store.find(DISPUTES_KEY, id)) viewDispute(id);
        else showToast("Dispute " + id + " was not found", "warning");
    }
});

/* ---------- helpers ---------- */

function disputes() {
    return Admin.get(DISPUTES_KEY);
}

function orderValue(d) {
    const order = Admin.allOrders().find(o => o.id === d.orderId);
    return order ? order.total : Number(d.orderValue) || 0;
}

function priorityBadge(p) {
    return p === "High" ? "badge badge-danger" : p === "Medium" ? "badge badge-warning" : "badge";
}

/* ---------- list ---------- */

function filtered() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const cat = document.getElementById("categoryFilter").value;
    const pri = document.getElementById("priorityFilter").value;

    return disputes().filter(d =>
        (activeTab === "All" || d.status === activeTab) &&
        (cat === "All" || d.category === cat) &&
        (pri === "All" || d.priority === pri) &&
        (!q || [d.id, d.orderId, d.raisedBy, d.against].some(v => String(v || "").toLowerCase().includes(q)))
    );
}

function render() {
    const all = disputes();
    const count = s => all.filter(d => d.status === s).length;

    document.getElementById("kpiOpen").textContent = count("Open");
    document.getElementById("kpiReview").textContent = count("In Review");
    document.getElementById("kpiResolved").textContent = count("Resolved");
    document.getElementById("kpiRefunds").textContent = Store.inr(all.reduce((s, d) => s + (d.resolution ? Number(d.resolution.refund) || 0 : 0), 0));

    document.querySelectorAll("#statusTabs .tab").forEach(tab => {
        const s = tab.dataset.status;
        tab.classList.toggle("active", s === activeTab);
        tab.querySelector(".count").textContent = s === "All" ? all.length : count(s);
    });

    const list = filtered();
    const table = document.getElementById("disputeTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-scale-balanced"></i>No disputes match your filters</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(d => `
        <tr>
            <td class="fw-600">${Store.esc(d.id)}</td>
            <td>
                <div>${Store.esc(d.raisedBy)}</div>
                <small class="text-muted">${Store.esc(d.raisedByRole)}</small>
            </td>
            <td>
                <div>${Store.esc(d.against)}</div>
                <small class="text-muted">${Store.esc(d.againstRole)}</small>
            </td>
            <td>${Store.esc(d.orderId)}</td>
            <td>${Store.esc(d.category)}</td>
            <td><span class="${priorityBadge(d.priority)}">${Store.esc(d.priority)}</span></td>
            <td>${Store.date(d.date)}</td>
            <td><span class="${Store.badge(d.status)}">${Store.esc(d.status)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="view" data-id="${Store.esc(d.id)}" title="View dispute" aria-label="View ${Store.esc(d.id)}"><i class="fa-solid fa-eye"></i></button>
                    ${d.status === "Open" ? `<button class="btn btn-secondary btn-sm" type="button" data-action="assign" data-id="${Store.esc(d.id)}">Assign</button>` : ""}
                    ${d.status !== "Resolved" ? `<button class="btn btn-primary btn-sm" type="button" data-action="resolve" data-id="${Store.esc(d.id)}">Resolve</button>` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") return viewDispute(id);
    Admin.closeModal("viewModal");
    if (btn.dataset.action === "assign") openAssign(id);
    if (btn.dataset.action === "resolve") openResolve(id);
}

/* ---------- view ---------- */

function viewDispute(id) {
    const d = Store.find(DISPUTES_KEY, id);
    if (!d) return showToast("Dispute not found", "error");

    const steps = ["Open", "In Review", "Resolved"];
    const reached = steps.indexOf(d.status);

    document.getElementById("viewTitle").textContent = "Dispute " + d.id;
    document.getElementById("viewBody").innerHTML = `
        <div class="stepper mb-3">
            ${steps.map((s, i) => `<div class="step${i < reached ? " done" : i === reached ? " current" : ""}">${s}</div>`).join("")}
        </div>

        <dl class="detail-list">
            <div><dt>Raised By</dt><dd>${Store.esc(d.raisedBy)} <small class="text-muted">(${Store.esc(d.raisedByRole)})</small></dd></div>
            <div><dt>Against</dt><dd>${Store.esc(d.against)} <small class="text-muted">(${Store.esc(d.againstRole)})</small></dd></div>
            <div><dt>Order</dt><dd>${Store.esc(d.orderId)} · ${Store.inr(orderValue(d))}</dd></div>
            <div><dt>Category</dt><dd>${Store.esc(d.category)}</dd></div>
            <div><dt>Priority</dt><dd><span class="${priorityBadge(d.priority)}">${Store.esc(d.priority)}</span></dd></div>
            <div><dt>Assigned To</dt><dd>${Store.esc(d.assignedTo || "Unassigned")}</dd></div>
        </dl>

        <h4 class="section-title">Complaint</h4>
        <p class="dispute-desc">${Store.esc(d.description)}</p>

        ${d.resolution ? `
            <div class="note-box mt-2">
                <strong>Resolved on ${Store.date(d.resolution.date)} · ${Store.esc(d.resolution.type)}</strong>
                <p>${Store.esc(d.resolution.notes)}</p>
                ${Number(d.resolution.refund) ? `<small class="text-muted">Amount: ${Store.inr(d.resolution.refund)}</small>` : ""}
            </div>` : ""}

        <h4 class="section-title">Activity</h4>
        <ul class="timeline">
            ${(d.history || []).map((h, i, arr) => `
                <li class="timeline-item ${i === arr.length - 1 && d.status !== "Resolved" ? "current" : "done"}">
                    <h4>${Store.esc(h.status)}</h4>
                    <p>${Store.esc(h.note)}</p>
                    <small>${Store.date(h.date)}</small>
                </li>`).join("")}
        </ul>
    `;

    document.getElementById("viewFooter").innerHTML = `
        <button class="btn btn-secondary" type="button" data-close>Close</button>
        ${d.status === "Open" ? `<button class="btn btn-secondary" type="button" data-action="assign" data-id="${Store.esc(d.id)}"><i class="fa-solid fa-user-check"></i> Assign</button>` : ""}
        ${d.status !== "Resolved" ? `<button class="btn btn-primary" type="button" data-action="resolve" data-id="${Store.esc(d.id)}"><i class="fa-solid fa-gavel"></i> Resolve</button>` : ""}
    `;

    Admin.openModal("viewModal");
}

/* ---------- assign ---------- */

function openAssign(id) {
    const d = Store.find(DISPUTES_KEY, id);
    if (!d) return showToast("Dispute not found", "error");
    if (d.status !== "Open") return showToast(d.id + " is already " + d.status.toLowerCase(), "warning");

    currentId = id;
    const form = document.getElementById("assignForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("assignPriority").value = d.priority || "";
    document.getElementById("assignTitle").textContent = "Assign " + d.id;
    document.getElementById("assignIntro").textContent = d.raisedBy + " vs " + d.against + " · " + d.category + " on order " + d.orderId;
    Admin.openModal("assignModal");
}

function assignDispute(e) {
    e.preventDefault();
    if (!Validator.validateForm("#assignForm")) return;

    const d = Store.find(DISPUTES_KEY, currentId);
    if (!d) return showToast("Dispute not found", "error");

    const raw = document.getElementById("assignee").value;
    const assignee = raw === "self" ? Admin.adminName() + " (Admin)" : raw;
    const note = document.getElementById("assignNote").value.trim();
    const history = (d.history || []).concat({
        status: "In Review", date: Store.iso(0),
        note: "Assigned to " + assignee + (note ? " — " + note : "")
    });

    Store.update(DISPUTES_KEY, d.id, {
        status: "In Review",
        assignedTo: assignee,
        priority: document.getElementById("assignPriority").value,
        history
    });
    Admin.log("Assigned dispute " + d.id + " to " + assignee, "Disputes");

    Admin.closeModal("assignModal");
    render();
    showToast(d.id + " assigned to " + assignee + " and marked In Review", "success");
}

/* ---------- resolve ---------- */

function openResolve(id) {
    const d = Store.find(DISPUTES_KEY, id);
    if (!d) return showToast("Dispute not found", "error");
    if (d.status === "Resolved") return showToast(d.id + " is already resolved", "warning");

    currentId = id;
    const form = document.getElementById("resolveForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("resolveTitle").textContent = "Resolve " + d.id;
    document.getElementById("resolveIntro").textContent =
        d.raisedBy + " vs " + d.against + " · order " + d.orderId + " (" + Store.inr(orderValue(d)) + ")";
    updateRefundField();
    Admin.openModal("resolveModal");
}

function updateRefundField() {
    const d = Store.find(DISPUTES_KEY, currentId);
    if (!d) return;

    const value = orderValue(d);
    const input = document.getElementById("refundAmount");
    const hint = document.getElementById("refundHint");
    const label = document.querySelector('label[for="refundAmount"]');
    const mode = REFUND_MODE[document.getElementById("resolutionType").value] || "optional";

    let rules = "number|min:0|max:" + value + "|decimals:2";
    let required = false;

    // clear a value that was auto-filled by "Full refund" when switching away
    if (input.dataset.autofilled) {
        input.value = "";
        delete input.dataset.autofilled;
    }
    input.disabled = false;
    input.readOnly = false;

    switch (mode) {
        case "full":
            rules = "required|number|positive|max:" + value + "|decimals:2";
            input.value = value;
            input.readOnly = true;
            input.dataset.autofilled = "1";
            required = true;
            hint.textContent = "Full order value is refunded to the buyer.";
            break;
        case "partial":
            rules = "required|number|positive|lessThan:" + value + "|decimals:2";
            required = true;
            hint.textContent = "Must be less than the order value of " + Store.inr(value) + ".";
            break;
        case "required":
            rules = "required|number|positive|max:" + value + "|decimals:2";
            required = true;
            hint.textContent = "Penalty deducted from the seller, up to " + Store.inr(value) + ".";
            break;
        case "none":
            input.value = "";
            input.disabled = true;
            hint.textContent = "No amount applies to this resolution.";
            break;
        default:
            hint.textContent = "Optional · up to the order value of " + Store.inr(value) + ".";
    }

    input.dataset.rules = rules;
    input.dataset.msgMax = "Amount cannot exceed the order value of " + Store.inr(value);

    const star = label.querySelector(".req");
    if (required && !star) label.insertAdjacentHTML("beforeend", ' <span class="req">*</span>');
    if (!required && star) star.remove();

    if (input.dataset.touched) Validator.validateField(input);
    else Validator.reset(input.closest(".form-group"));
}

async function resolveDispute(e) {
    e.preventDefault();
    if (!Validator.validateForm("#resolveForm")) return;

    const d = Store.find(DISPUTES_KEY, currentId);
    if (!d) return showToast("Dispute not found", "error");

    const type = document.getElementById("resolutionType").value;
    const refund = Number(document.getElementById("refundAmount").value) || 0;

    const ok = await confirmDialog({
        title: "Resolve " + d.id + "?",
        message: type + (refund ? " of " + Store.inr(refund) : "") + ". Both parties will be notified and the dispute will be closed.",
        confirmText: "Resolve"
    });
    if (!ok) return;

    const history = (d.history || []).concat({ status: "Resolved", date: Store.iso(0), note: type });

    Store.update(DISPUTES_KEY, d.id, {
        status: "Resolved",
        assignedTo: d.assignedTo || Admin.adminName() + " (Admin)",
        resolution: {
            type,
            notes: document.getElementById("resolutionNotes").value.trim(),
            refund,
            date: Store.iso(0),
            by: Admin.adminName()
        },
        history
    });
    Admin.log("Resolved dispute " + d.id + " (" + type + ")", "Disputes");

    Admin.closeModal("resolveModal");
    render();
    showToast(d.id + " resolved: " + type, "success");
}

/* ---------- export ---------- */

function exportDisputes() {
    const list = filtered();
    if (!list.length) return showToast("There are no disputes to export for the current filters", "warning");

    Admin.exportCSV("disputes-" + Store.iso(0) + ".csv",
        ["Dispute ID", "Raised By", "Raised By Role", "Against", "Against Role", "Order ID", "Order Value", "Category", "Priority", "Status", "Raised On", "Assigned To", "Resolution", "Amount"],
        list.map(d => [d.id, d.raisedBy, d.raisedByRole, d.against, d.againstRole, d.orderId, orderValue(d), d.category, d.priority, d.status, d.date, d.assignedTo || "",
            d.resolution ? d.resolution.type : "", d.resolution ? d.resolution.refund : ""]));
    Admin.log("Exported disputes (" + list.length + " records)", "Disputes");
    showToast(list.length + " disputes exported to CSV", "success");
}
