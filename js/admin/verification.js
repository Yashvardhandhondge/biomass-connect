// =========================
// ADMIN — REGISTRATION VERIFICATION
// Shared by farmer-verification (US039), powerplant-verification (US040)
// and manufacturer-verification (US041).
// The page sets <body data-verify-role="farmer|manufacturer|powerplant">.
// =========================

const VERIFY_KEY = "admin_verifications";

const VERIFY_CONFIG = {
    farmer: {
        label: "Farmer",
        idLabel: "Aadhaar No.",
        idValue: v => v.details.aadhaar,
        fields: [
            ["Aadhaar Number", v => v.details.aadhaar],
            ["Land Holding", v => v.details.landArea + " acres"],
            ["Primary Crops", v => v.details.crops],
            ["Village / Taluka", v => v.location],
            ["District", v => v.district],
            ["State", v => v.state]
        ],
        checks: [
            "Aadhaar details are legible and match the applicant name",
            "Land record (7/12 extract) is in the applicant's name",
            "Bank passbook name matches the Aadhaar card"
        ]
    },
    manufacturer: {
        label: "Manufacturer",
        idLabel: "GSTIN",
        idValue: v => v.details.gstin,
        fields: [
            ["GSTIN", v => v.details.gstin],
            ["PAN", v => v.details.pan],
            ["Production Capacity", v => v.details.capacity + " tons/day"],
            ["Factory Location", v => v.location],
            ["District", v => v.district],
            ["State", v => v.state]
        ],
        checks: [
            "GSTIN and PAN belong to the same legal entity",
            "Factory licence is valid and covers pellet manufacturing",
            "Pollution consent (CTO) is current and not expired"
        ]
    },
    powerplant: {
        label: "Power Plant",
        idLabel: "GSTIN",
        idValue: v => v.details.gstin,
        fields: [
            ["GSTIN", v => v.details.gstin],
            ["Installed Capacity", v => Number(v.details.capacity).toLocaleString("en-IN") + " MW"],
            ["Co-firing Target", v => v.details.target + "%"],
            ["Plant Location", v => v.location],
            ["District", v => v.district],
            ["State", v => v.state]
        ],
        checks: [
            "GST certificate matches the registered plant entity",
            "Environmental clearance covers biomass co-firing",
            "SPCB consent to operate is valid for the current period"
        ]
    }
};

const ROLE = document.body.dataset.verifyRole || "farmer";
const CFG = VERIFY_CONFIG[ROLE];

let activeTab = "Pending";
let reviewingId = null;

document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("idColumn").textContent = CFG.idLabel;

    document.querySelectorAll("#statusTabs .tab").forEach(tab =>
        tab.addEventListener("click", () => {
            activeTab = tab.dataset.status;
            renderTable();
        }));

    document.getElementById("searchInput").addEventListener("input", renderTable);
    document.getElementById("verifyTable").addEventListener("click", e => {
        const btn = e.target.closest("[data-review]");
        if (btn) openReview(btn.dataset.review);
    });
    document.getElementById("reviewModal").addEventListener("click", onReviewClick);
    document.getElementById("rejectForm").addEventListener("submit", rejectApplication);

    renderTable();

    // deep link from the dashboard queue: ?id=VER-1001
    const id = new URLSearchParams(location.search).get("id");
    if (id) {
        const v = Store.find(VERIFY_KEY, id);
        if (v && v.role === ROLE) openReview(id);
        else showToast("Verification request " + id + " was not found", "warning");
    }
});

/* ---------- list ---------- */

function applications() {
    return Admin.get(VERIFY_KEY).filter(v => v.role === ROLE);
}

function renderTable() {
    const all = applications();
    const count = s => all.filter(v => v.status === s).length;

    document.getElementById("kpiPending").textContent = count("Pending");
    document.getElementById("kpiApproved").textContent = count("Approved");
    document.getElementById("kpiRejected").textContent = count("Rejected");
    document.getElementById("kpiTotal").textContent = all.length;

    document.querySelectorAll("#statusTabs .tab").forEach(tab => {
        const s = tab.dataset.status;
        tab.classList.toggle("active", s === activeTab);
        tab.querySelector(".count").textContent = s === "All" ? all.length : count(s);
    });

    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    const list = all
        .filter(v => activeTab === "All" || v.status === activeTab)
        .filter(v => !q || [v.name, v.email, v.mobile, v.id, v.district, v.location, CFG.idValue(v)]
            .some(x => String(x || "").toLowerCase().includes(q)))
        .sort((a, b) => activeTab === "Pending"
            ? a.submitted.localeCompare(b.submitted)
            : b.submitted.localeCompare(a.submitted));

    const table = document.getElementById("verifyTable");

    if (!list.length) {
        const msg = q ? "No applications match your search" :
            activeTab === "Pending" ? "No pending " + CFG.label.toLowerCase() + " registrations — you're all caught up" :
            "No " + activeTab.toLowerCase() + " applications";
        table.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-folder-open"></i>${Store.esc(msg)}</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(v => `
        <tr>
            <td>
                <div class="fw-600">${Store.esc(v.name)}</div>
                <small class="text-muted">${Store.esc(v.id)}</small>
            </td>
            <td>
                <div>${Store.esc(v.email)}</div>
                <small class="text-muted">${Store.esc(v.mobile)}</small>
            </td>
            <td>${Store.esc(v.district)}, ${Store.esc(v.state)}</td>
            <td>${Store.esc(CFG.idValue(v))}</td>
            <td>${Store.date(v.submitted)}</td>
            <td>${(v.docs || []).length} files</td>
            <td><span class="${Store.badge(v.status)}">${Store.esc(v.status)}</span></td>
            <td class="text-right">
                <button class="btn ${v.status === "Pending" ? "btn-primary" : "btn-secondary"} btn-sm" type="button" data-review="${Store.esc(v.id)}">
                    ${v.status === "Pending" ? "Review" : "View"}
                </button>
            </td>
        </tr>
    `).join("");
}

/* ---------- review modal ---------- */

function docIcon(file) {
    return /\.pdf$/i.test(file) ? "fa-file-pdf" : "fa-file-image";
}

function openReview(id) {
    const v = Store.find(VERIFY_KEY, id);
    if (!v) return showToast("Application not found", "error");
    reviewingId = id;

    const pending = v.status === "Pending";

    document.getElementById("reviewTitle").textContent = CFG.label + " Application · " + v.id;
    document.getElementById("reviewBody").innerHTML = `
        <div class="applicant-head">
            <span class="avatar avatar-lg">${Store.esc(Admin.initials(v.name))}</span>
            <div>
                <div class="fw-600">${Store.esc(v.name)}</div>
                <small class="text-muted">${Store.esc(v.email)} · ${Store.esc(v.mobile)}</small>
            </div>
            <div class="applicant-status">
                <span class="${Store.badge(v.status)}">${Store.esc(v.status)}</span>
                <small class="text-muted">Submitted ${Store.date(v.submitted)}</small>
            </div>
        </div>

        <dl class="detail-list">
            ${CFG.fields.map(([label, fn]) => `<div><dt>${label}</dt><dd>${Store.esc(fn(v))}</dd></div>`).join("")}
        </dl>

        <h4 class="section-title">Submitted Documents</h4>
        <div class="doc-layout">
            <div class="doc-list" role="list">
                ${v.docs.map((d, i) => `
                    <button type="button" class="doc-item${i === 0 ? " active" : ""}" data-doc="${i}" role="listitem">
                        <i class="fa-solid ${docIcon(d.file)}"></i>
                        <span>
                            <strong>${Store.esc(d.type)}</strong>
                            <small>${Store.esc(d.file)} · ${Store.esc(d.size)}</small>
                        </span>
                    </button>`).join("")}
            </div>
            <div class="doc-preview" id="docPreview"></div>
        </div>

        ${pending ? `
            <h4 class="section-title">Verification Checklist</h4>
            <div class="checklist" id="checklist">
                ${CFG.checks.map((c, i) => `
                    <label class="checkbox-row"><input type="checkbox" data-novalidate id="check${i}"> ${Store.esc(c)}</label>`).join("")}
            </div>` : ""}

        ${v.status === "Approved" ? `
            <div class="note-box note-success mt-2">
                <strong>Approved on ${Store.date(v.reviewedOn)}</strong>
                <p>Verified by ${Store.esc(v.reviewedBy || "Admin")}. The account is active on the platform.</p>
            </div>` : ""}

        ${v.status === "Rejected" ? `
            <div class="note-box note-danger mt-2">
                <strong>Rejected on ${Store.date(v.reviewedOn)}${v.reasonCategory ? " · " + Store.esc(v.reasonCategory) : ""}</strong>
                <p>${Store.esc(v.reason || "No reason recorded")}</p>
            </div>` : ""}
    `;

    document.getElementById("reviewFooter").innerHTML = pending ? `
        <button class="btn btn-secondary" type="button" data-close>Close</button>
        <button class="btn btn-danger" type="button" data-verify="reject"><i class="fa-solid fa-xmark"></i> Reject</button>
        <button class="btn btn-primary" type="button" data-verify="approve"><i class="fa-solid fa-check"></i> Approve</button>
    ` : `
        <button class="btn btn-secondary" type="button" data-close>Close</button>
    `;

    showDoc(v, 0);
    Admin.openModal("reviewModal");
}

function showDoc(v, index) {
    const d = v.docs[index];
    if (!d) return;
    document.querySelectorAll("#reviewBody .doc-item").forEach((el, i) => el.classList.toggle("active", i === index));
    document.getElementById("docPreview").innerHTML = `
        <div class="doc-sheet">
            <i class="fa-solid ${docIcon(d.file)}"></i>
            <strong>${Store.esc(d.type)}</strong>
            <span>${Store.esc(d.number)}</span>
            <div class="doc-lines"><span></span><span></span><span></span><span></span></div>
        </div>
        <small class="text-muted">Preview placeholder · ${Store.esc(d.file)}</small>
    `;
}

function onReviewClick(e) {
    const v = Store.find(VERIFY_KEY, reviewingId);
    if (!v) return;

    const doc = e.target.closest("[data-doc]");
    if (doc) return showDoc(v, Number(doc.dataset.doc));

    const action = e.target.closest("[data-verify]");
    if (!action) return;
    if (action.dataset.verify === "approve") approveApplication(v);
    if (action.dataset.verify === "reject") openReject(v);
}

/* ---------- approve ---------- */

function approveApplication(v) {
    const boxes = [...document.querySelectorAll("#checklist input[type=checkbox]")];
    const unchecked = boxes.filter(b => !b.checked);
    boxes.forEach(b => b.closest(".checkbox-row").classList.toggle("unchecked", !b.checked));

    if (unchecked.length) {
        showToast("Tick all " + boxes.length + " checklist items to confirm the documents were verified", "warning", { title: "Checklist incomplete" });
        unchecked[0].focus();
        return;
    }

    Store.update(VERIFY_KEY, v.id, {
        status: "Approved",
        reviewedOn: Store.iso(0),
        reviewedBy: Admin.adminName(),
        reasonCategory: "", reason: ""
    });
    syncUser(v, "Active");
    Admin.log("Approved " + CFG.label.toLowerCase() + " verification " + v.id + " (" + v.name + ")", "Verification");

    Admin.closeModal("reviewModal");
    renderTable();
    showToast(v.name + " has been verified and activated", "success");
}

/* ---------- reject ---------- */

function openReject(v) {
    const form = document.getElementById("rejectForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("rejectIntro").textContent =
        "Tell " + v.name + " why the registration was rejected so they can correct and resubmit their documents.";
    Admin.closeModal("reviewModal");
    Admin.openModal("rejectModal");
}

async function rejectApplication(e) {
    e.preventDefault();
    if (!Validator.validateForm("#rejectForm")) return;

    const v = Store.find(VERIFY_KEY, reviewingId);
    if (!v) return showToast("Application not found", "error");

    const ok = await confirmDialog({
        title: "Reject " + v.name + "?",
        message: "The applicant will be notified with your reason and must resubmit documents to register.",
        confirmText: "Reject Application",
        danger: true
    });
    if (!ok) return;

    Store.update(VERIFY_KEY, v.id, {
        status: "Rejected",
        reviewedOn: Store.iso(0),
        reviewedBy: Admin.adminName(),
        reasonCategory: document.getElementById("rejectCategory").value,
        reason: document.getElementById("rejectReason").value.trim()
    });
    syncUser(v, "Rejected");
    Admin.log("Rejected " + CFG.label.toLowerCase() + " verification " + v.id + " (" + v.name + ")", "Verification");

    Admin.closeModal("rejectModal");
    renderTable();
    showToast(v.name + "'s registration was rejected", "success");
}

/* ---------- keep User Management in sync ---------- */

function syncUser(v, status) {
    const users = Admin.get("admin_users");
    const existing = users.find(u => u.email.toLowerCase() === v.email.toLowerCase());
    if (existing) {
        if (existing.status !== "Blocked") Store.update("admin_users", existing.id, { status });
        return;
    }
    Store.add("admin_users", {
        name: v.name, role: CFG.label, email: v.email, mobile: v.mobile,
        location: v.district, state: v.state, status, joined: v.submitted
    }, "USR-");
}
