// =========================
// CERTIFICATIONS & COMPLIANCE (US035)
// =========================

const CERTS_KEY = "powerplant_certificates";
const REQUESTS_KEY = "powerplant_cert_requests";
const EXPIRING_DAYS = 60;

let viewingId = null;

document.addEventListener("DOMContentLoaded", () => {

    seedCertificates();

    document.getElementById("addCertBtn").addEventListener("click", openAdd);
    document.getElementById("addForm").addEventListener("submit", saveCertificate);
    document.getElementById("viewModalDownload").addEventListener("click", () => downloadCertificate(viewingId));
    document.getElementById("certTable").addEventListener("click", onCertAction);

    const form = document.getElementById("renewalForm");
    const contact = document.getElementById("renewContact");
    contact.value = Plant.profile().contactPerson || "";
    contact.defaultValue = contact.value;
    Plant.counter("renewReason", "reasonCount");
    form.addEventListener("submit", submitRenewal);
    form.addEventListener("reset", () => setTimeout(() => Validator.reset(form), 0));

    refresh();
});

function refresh() {
    const list = certificates();
    loadKpis(list);
    loadCompliance();
    renderCertificates(list);
    populateRenewSelect(list);
    renderRequests();
}

/* ---------------- Data ---------------- */

function seedCertificates() {
    if (localStorage.getItem(CERTS_KEY) !== null) return;
    Store.set(CERTS_KEY, [
        { id: "CERT-1001", type: "Biomass Co-firing Compliance", name: "Biomass Co-firing Compliance Certificate FY 2025-26", number: "SAMARTH/CF/2025/0142", authority: "Ministry of Power — SAMARTH Mission", issueDate: Store.iso(-318), expiryDate: Store.iso(48), fileName: "cofiring-compliance-2025-26.pdf" },
        { id: "CERT-1002", type: "Environmental Clearance", name: "Environmental Clearance — Units 3 to 5", number: "EC/IA-I/2019/1301", authority: "Ministry of Environment, Forest and Climate Change", issueDate: Store.iso(-1150), expiryDate: Store.iso(2500), fileName: "environmental-clearance.pdf" },
        { id: "CERT-1003", type: "Consent to Operate", name: "Consent to Operate (Air & Water Acts)", number: "MPCB/CTO/2025/1182", authority: "Maharashtra Pollution Control Board", issueDate: Store.iso(-400), expiryDate: Store.iso(-35), fileName: "mpcb-consent-to-operate.pdf" },
        { id: "CERT-1004", type: "Renewable Energy Certificate", name: "REC Accreditation — Biomass Co-firing", number: "REC/ACC/MH/2026/0091", authority: "Maharashtra Energy Development Agency", issueDate: Store.iso(-200), expiryDate: Store.iso(530), fileName: "rec-accreditation.pdf" },
        { id: "CERT-1005", type: "ISO 14001 Environmental Management", name: "ISO 14001:2015 Environmental Management System", number: "EMS/14001/77612", authority: "Bureau of Indian Standards", issueDate: Store.iso(-700), expiryDate: Store.iso(395), fileName: "iso-14001.pdf" }
    ]);
}

function statusOf(cert) {
    const days = Plant.daysUntil(cert.expiryDate);
    if (days < 0) return "Expired";
    if (days <= EXPIRING_DAYS) return "Expiring";
    return "Valid";
}

function certificates() {
    const order = { Expired: 0, Expiring: 1, Valid: 2 };
    return Store.get(CERTS_KEY)
        .map(c => Object.assign({}, c, { status: statusOf(c) }))
        .sort((a, b) => order[a.status] - order[b.status] || (a.expiryDate || "").localeCompare(b.expiryDate || ""));
}

function requests() {
    return Store.get(REQUESTS_KEY).slice().sort((a, b) => (b.requestedOn || "").localeCompare(a.requestedOn || "") || String(b.id).localeCompare(String(a.id)));
}

/* ---------------- KPIs + compliance ---------------- */

function loadKpis(list) {
    const count = s => list.filter(c => c.status === s).length;
    document.getElementById("kpiTotal").textContent = list.length;
    document.getElementById("kpiValid").textContent = count("Valid");
    document.getElementById("kpiExpiring").textContent = count("Expiring");
    document.getElementById("kpiExpired").textContent = count("Expired");
}

function loadCompliance() {
    const target = Number(Plant.profile().cofiringTarget) || 7;
    const since = Store.iso(-365);
    const entries = Plant.consumption().filter(e => e.date >= since);
    const pellets = entries.reduce((s, e) => s + Number(e.pellets || 0), 0);
    const coal = entries.reduce((s, e) => s + Number(e.coal || 0), 0);
    const achieved = Plant.ratio(pellets, coal);
    const status = !entries.length ? "No Data" : achieved >= target ? "On Track" : "Below Target";

    document.getElementById("achievedRatio").textContent = Plant.num(achieved) + "%";
    document.getElementById("targetRatio").textContent = "Target " + Plant.num(target) + "%";
    document.getElementById("complianceBar").style.width = Math.min(100, Math.round(achieved / target * 100)) + "%";
    document.getElementById("complianceBadge").innerHTML = `<span class="${Plant.badge(status)}">${status}</span>`;
    document.getElementById("complianceHint").textContent = entries.length
        ? `Average co-firing ratio over the last 12 months against the target set in your profile.`
        : "No consumption logged in the last 12 months.";

    document.getElementById("complianceStats").innerHTML = `
        <div><dt>Pellets Co-fired (12 months)</dt><dd>${Plant.num(pellets)} t</dd></div>
        <div><dt>Coal Consumed (12 months)</dt><dd>${Plant.num(coal, 0)} t</dd></div>
        <div><dt>Shortfall to Target</dt><dd>${achieved >= target ? "None" : Plant.num(Math.max(0, (target / 100 * (pellets + coal)) - pellets), 0) + " t pellets"}</dd></div>
        <div><dt>Log Entries</dt><dd>${entries.length} · <a href="consumption.html">view log</a></dd></div>`;
}

/* ---------------- Certificates ---------------- */

function renderCertificates(list) {
    const table = document.getElementById("certTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(7, "fa-certificate", "No certificates added yet");
        return;
    }

    table.innerHTML = list.map(c => {
        const id = Store.esc(c.id);
        const days = Plant.daysUntil(c.expiryDate);
        const note = c.status === "Expired" ? `expired ${-days} day${days === -1 ? "" : "s"} ago`
            : c.status === "Expiring" ? `expires in ${days} day${days === 1 ? "" : "s"}` : "";
        return `
        <tr>
            <td class="cert-name"><span class="fw-600">${Store.esc(c.name)}</span><small>${Store.esc(c.type)}</small></td>
            <td>${Store.esc(c.number)}</td>
            <td>${Store.esc(c.authority)}</td>
            <td>${Store.date(c.issueDate)}</td>
            <td>${Store.date(c.expiryDate)}${note ? `<br><small class="text-muted">${note}</small>` : ""}</td>
            <td><span class="${Plant.badge(c.status)}">${c.status}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-ghost btn-icon" type="button" data-action="view" data-id="${id}" title="View certificate" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-ghost btn-icon" type="button" data-action="download" data-id="${id}" title="Download certificate" aria-label="Download ${id}"><i class="fa-solid fa-download"></i></button>
                    <button class="btn btn-ghost btn-icon" type="button" data-action="renew" data-id="${id}" title="Request renewal" aria-label="Request renewal for ${id}"><i class="fa-solid fa-rotate"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function onCertAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") viewCertificate(id);
    if (btn.dataset.action === "download") downloadCertificate(id);
    if (btn.dataset.action === "renew") startRenewal(id);
}

function findCert(id) {
    return certificates().find(c => c.id === id) || null;
}

function viewCertificate(id) {
    const c = findCert(id);
    if (!c) {
        showToast("Certificate not found", "error");
        return;
    }
    viewingId = id;
    document.getElementById("viewModalTitle").textContent = c.name;
    document.getElementById("viewModalBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Plant.badge(c.status)}">${c.status}</span></dd></div>
            <div><dt>Type</dt><dd>${Store.esc(c.type)}</dd></div>
            <div><dt>Certificate No.</dt><dd>${Store.esc(c.number)}</dd></div>
            <div><dt>Issued By</dt><dd>${Store.esc(c.authority)}</dd></div>
            <div><dt>Issue Date</dt><dd>${Store.date(c.issueDate)}</dd></div>
            <div><dt>Expiry Date</dt><dd>${Store.date(c.expiryDate)}</dd></div>
            <div><dt>Holder</dt><dd>${Store.esc(Plant.profile().name)}</dd></div>
            <div><dt>File</dt><dd>${c.fileName ? Store.esc(c.fileName) : "—"}</dd></div>
        </dl>`;
    Plant.openModal("viewModal");
}

function downloadCertificate(id) {
    const c = findCert(id);
    if (!c) {
        showToast("Certificate not found", "error");
        return;
    }
    const text = [
        "BIOMASS CONNECT - CERTIFICATE COPY",
        "-".repeat(50),
        "Certificate   : " + c.name,
        "Type          : " + c.type,
        "Number        : " + c.number,
        "Issued by     : " + c.authority,
        "Holder        : " + Plant.profile().name,
        "Issue date    : " + Store.date(c.issueDate),
        "Expiry date   : " + Store.date(c.expiryDate),
        "Status        : " + c.status,
        "Original file : " + (c.fileName || "-"),
        "",
        "Downloaded on " + Store.date(Store.iso(0))
    ].join("\r\n");

    const safe = String(c.number).replace(/[^A-Za-z0-9-]+/g, "-");
    Plant.downloadText("certificate-" + safe + ".txt", text);
    showToast(`${c.name} downloaded`, "success");
}

function openAdd() {
    const form = document.getElementById("addForm");
    form.reset();
    Validator.reset(form);
    Plant.openModal("addModal");
}

function saveCertificate(e) {
    e.preventDefault();

    if (!Validator.validateForm("#addForm")) return;

    const number = document.getElementById("certNumber").value.trim().toUpperCase();
    if (Store.get(CERTS_KEY).some(c => String(c.number).toUpperCase() === number)) {
        showToast(`A certificate with number ${number} already exists`, "error");
        document.getElementById("certNumber").focus();
        return;
    }

    const file = document.getElementById("certFile").files[0];
    const cert = Store.add(CERTS_KEY, {
        type: document.getElementById("certType").value,
        name: document.getElementById("certName").value.trim(),
        number,
        authority: document.getElementById("certAuthority").value.trim(),
        issueDate: document.getElementById("issueDate").value,
        expiryDate: document.getElementById("expiryDate").value,
        fileName: file ? file.name : ""
    }, "CERT-");

    Plant.closeModal("addModal");
    document.getElementById("addForm").reset();

    const status = statusOf(cert);
    showToast(`${cert.name} added${status !== "Valid" ? " — note: it is " + status.toLowerCase() : ""}`, status === "Valid" ? "success" : "warning");
    refresh();
}

/* ---------------- Renewal requests ---------------- */

function populateRenewSelect(list) {
    const select = document.getElementById("renewCert");
    const current = select.value;
    select.innerHTML = `<option value="">Select certificate</option>` + list.map(c =>
        `<option value="${Store.esc(c.id)}">${Store.esc(c.name)} (${c.status})</option>`).join("");
    if (list.some(c => c.id === current)) select.value = current;
}

function startRenewal(id) {
    document.getElementById("renewCert").value = id;
    Validator.validateField(document.getElementById("renewCert"));
    document.getElementById("renewalCard").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById("renewDate").focus(), 400);
}

function submitRenewal(e) {
    e.preventDefault();

    if (!Validator.validateForm("#renewalForm")) return;

    const certId = document.getElementById("renewCert").value;
    const cert = findCert(certId);
    if (!cert) {
        showToast("The selected certificate could not be found", "error");
        return;
    }

    const pending = requests().find(r => r.certId === certId && r.status === "Pending");
    if (pending) {
        showToast(`Renewal request ${pending.id} for this certificate is already pending`, "warning");
        return;
    }

    const req = Store.add(REQUESTS_KEY, {
        certId,
        certName: cert.name,
        preferredDate: document.getElementById("renewDate").value,
        contact: document.getElementById("renewContact").value.trim(),
        reason: document.getElementById("renewReason").value.trim(),
        status: "Pending",
        requestedOn: Store.iso(0)
    }, "RNW-");

    showToast(`Renewal request ${req.id} submitted for ${cert.name}`, "success");

    const form = document.getElementById("renewalForm");
    form.reset();
    Validator.reset(form);
    renderRequests();
}

function renderRequests() {
    const list = requests();
    const table = document.getElementById("requestTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(4, "fa-rotate", "No renewal requests yet");
        return;
    }

    table.innerHTML = list.map(r => `
        <tr>
            <td class="fw-600">${Store.esc(r.id)}<br><small class="text-muted">${Store.date(r.requestedOn)}</small></td>
            <td>${Store.esc(r.certName)}</td>
            <td>${Store.date(r.preferredDate)}</td>
            <td><span class="${Store.badge(r.status)}">${Store.esc(r.status)}</span></td>
        </tr>
    `).join("");
}
