// =========================
// ADMIN — AUDIT & COMPLIANCE (US043)
// Audit log viewer + co-firing compliance certificates for coal power plants.
// =========================

const LOGS_KEY = "admin_audit_logs";
const CERTS_KEY = "admin_certificates";
const MANDATE_PCT = 5;
const LOG_PAGE = 15;

let logLimit = LOG_PAGE;
let viewingCert = null;

document.addEventListener("DOMContentLoaded", () => {

    // tabs
    document.querySelectorAll("#sectionTabs .tab").forEach(tab =>
        tab.addEventListener("click", () => showPanel(tab.dataset.panel)));
    if (location.hash === "#certificates") showPanel("certPanel");

    // audit log filters
    fillModules();
    document.getElementById("logSearch").addEventListener("input", resetAndRenderLogs);
    document.getElementById("logRole").addEventListener("change", resetAndRenderLogs);
    document.getElementById("logModule").addEventListener("change", resetAndRenderLogs);
    ["logFrom", "logTo"].forEach(id => document.getElementById(id).addEventListener("change", onLogDateChange));
    document.getElementById("logFilters").addEventListener("submit", e => e.preventDefault());
    document.getElementById("clearLogFilters").addEventListener("click", clearLogFilters);
    document.getElementById("exportLogsBtn").addEventListener("click", exportLogs);
    document.getElementById("moreLogsBtn").addEventListener("click", () => { logLimit += LOG_PAGE; renderLogs(); });

    // certificates
    fillPlants();
    const form = document.getElementById("certForm");
    form.addEventListener("submit", generateCertificate);
    form.addEventListener("reset", () => setTimeout(() => { Validator.reset(form); updateDeliveredHint(); }, 0));
    ["certPlant", "certFrom", "certTo"].forEach(id => document.getElementById(id).addEventListener("change", updateDeliveredHint));
    document.getElementById("certTable").addEventListener("click", onCertAction);
    document.getElementById("certDownloadBtn").addEventListener("click", () => viewingCert && downloadCertificate(viewingCert));

    renderKpis();
    renderLogs();
    renderCerts();
});

function showPanel(id) {
    document.querySelectorAll("#sectionTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.panel === id));
    document.getElementById("logsPanel").classList.toggle("hidden", id !== "logsPanel");
    document.getElementById("certPanel").classList.toggle("hidden", id !== "certPanel");
    history.replaceState(null, "", id === "certPanel" ? "#certificates" : location.pathname + location.search);
}

function renderKpis() {
    const logs = Admin.get(LOGS_KEY);
    const certs = Admin.get(CERTS_KEY);
    const since = Store.iso(-30);
    const today = Store.iso(0);

    document.getElementById("kpiLogs").textContent = logs.filter(l => l.timestamp.slice(0, 10) >= since).length;
    document.getElementById("kpiAdminToday").textContent = logs.filter(l => l.role === "Admin" && l.timestamp.slice(0, 10) === today).length;
    document.getElementById("kpiCerts").textContent = certs.length;
    document.getElementById("kpiValid").textContent = certs.filter(c => c.validUntil >= today).length;
}

/* =========================
   AUDIT LOGS
========================= */

function fillModules() {
    const known = ["Authentication", "Users", "Verification", "Orders", "Disputes", "Listings", "Compliance", "Reports", "Settings", "Profile"];
    const modules = [...new Set(known.concat(Admin.get(LOGS_KEY).map(l => l.module)))].sort();
    document.getElementById("logModule").insertAdjacentHTML("beforeend",
        modules.map(m => `<option>${Store.esc(m)}</option>`).join(""));
}

function logDateRange() {
    const from = document.getElementById("logFrom");
    const to = document.getElementById("logTo");
    const okFrom = Validator.validateField(from);
    const okTo = Validator.validateField(to);
    return { from: okFrom ? from.value : "", to: okFrom && okTo ? to.value : "", valid: okFrom && okTo };
}

function onLogDateChange() {
    if (!logDateRange().valid) showToast("Fix the highlighted date range to filter the log", "error", { title: "Invalid date range" });
    resetAndRenderLogs();
}

function filteredLogs() {
    const q = document.getElementById("logSearch").value.trim().toLowerCase();
    const role = document.getElementById("logRole").value;
    const mod = document.getElementById("logModule").value;
    const { from, to } = logDateRange();

    return Admin.get(LOGS_KEY)
        .filter(l => {
            const day = l.timestamp.slice(0, 10);
            return (role === "All" || l.role === role) &&
                (mod === "All" || l.module === mod) &&
                (!from || day >= from) &&
                (!to || day <= to) &&
                (!q || [l.user, l.action, l.ip, l.id].some(v => String(v || "").toLowerCase().includes(q)));
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function resetAndRenderLogs() {
    logLimit = LOG_PAGE;
    renderLogs();
}

function renderLogs() {
    const list = filteredLogs();
    const table = document.getElementById("logTable");
    const more = document.getElementById("moreLogsBtn");

    document.getElementById("logCount").textContent =
        list.length + (list.length === 1 ? " entry" : " entries") + (list.length > logLimit ? " · showing " + logLimit : "");
    more.classList.toggle("hidden", list.length <= logLimit);

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-clipboard-list"></i>No log entries match your filters</div></td></tr>`;
        return;
    }

    table.innerHTML = list.slice(0, logLimit).map(l => `
        <tr>
            <td class="nowrap">${Admin.dateTime(l.timestamp)}</td>
            <td class="fw-600">${Store.esc(l.user)}</td>
            <td>${Store.esc(l.role)}</td>
            <td>${Store.esc(l.action)}</td>
            <td><span class="badge">${Store.esc(l.module)}</span></td>
            <td class="mono">${Store.esc(l.ip)}</td>
        </tr>
    `).join("");
}

function clearLogFilters() {
    const form = document.getElementById("logFilters");
    form.reset();
    Validator.reset(form);
    resetAndRenderLogs();
    showToast("Filters cleared", "info");
}

function exportLogs() {
    if (!logDateRange().valid) return showToast("Fix the date range before exporting", "error");
    const list = filteredLogs();
    if (!list.length) return showToast("There are no log entries to export for the current filters", "warning");

    Admin.exportCSV("audit-log-" + Store.iso(0) + ".csv",
        ["Log ID", "Timestamp", "User", "Role", "Action", "Module", "IP Address"],
        list.map(l => [l.id, l.timestamp, l.user, l.role, l.action, l.module, l.ip]));
    Admin.log("Exported audit log (" + list.length + " entries)", "Compliance");
    renderKpis();
    renderLogs();
    showToast(list.length + " log entries exported to CSV", "success");
}

/* =========================
   COMPLIANCE CERTIFICATES
========================= */

function fillPlants() {
    const fromUsers = Admin.get("admin_users").filter(u => u.role === "Power Plant" && u.status === "Active").map(u => u.name);
    const plants = [...new Set(fromUsers)].sort();
    document.getElementById("certPlant").insertAdjacentHTML("beforeend",
        plants.map(p => `<option>${Store.esc(p)}</option>`).join(""));
    if (!plants.length) showToast("No active power plants found. Approve a power plant registration first.", "warning");
}

function deliveredTons(plant, from, to) {
    return Store.get("pelletOrders")
        .filter(o => o.powerPlant === plant && o.status === "Delivered")
        .filter(o => {
            const d = o.expectedDelivery || o.deliveryDate || o.orderDate;
            return d >= from && d <= to;
        })
        .reduce((s, o) => s + Number(o.quantity || 0), 0);
}

function updateDeliveredHint() {
    const plant = document.getElementById("certPlant").value;
    const from = document.getElementById("certFrom").value;
    const to = document.getElementById("certTo").value;
    const hint = document.getElementById("deliveredHint");

    if (!plant || !from || !to || to < from) {
        hint.textContent = "Select a plant and period to see platform deliveries.";
        return;
    }
    const tons = deliveredTons(plant, from, to);
    hint.textContent = "Pellets delivered via Biomass Connect in this period: " + tons + " tons.";
}

function certStatus(c) {
    return c.validUntil >= Store.iso(0) ? "Valid" : "Expired";
}

function compliance(c) {
    return Number(c.coFiringPct) >= MANDATE_PCT ? "Compliant" : "Below Target";
}

function generateCertificate(e) {
    e.preventDefault();
    if (!Validator.validateForm("#certForm")) return;

    const data = {
        plant: document.getElementById("certPlant").value,
        periodFrom: document.getElementById("certFrom").value,
        periodTo: document.getElementById("certTo").value,
        coFiredTons: Number(document.getElementById("certTons").value),
        coFiringPct: Number(document.getElementById("certPct").value),
        issueDate: document.getElementById("certIssue").value,
        validUntil: document.getElementById("certValid").value,
        remarks: document.getElementById("certRemarks").value.trim()
    };

    // a plant cannot hold two certificates for overlapping periods
    const overlap = Admin.get(CERTS_KEY).find(c =>
        c.plant === data.plant && c.periodFrom <= data.periodTo && c.periodTo >= data.periodFrom);
    if (overlap) {
        showToast(overlap.id + " already covers " + Store.date(overlap.periodFrom) + " – " + Store.date(overlap.periodTo) +
            " for " + data.plant + ". Choose a non-overlapping period.", "error", { title: "Overlapping period" });
        document.getElementById("certFrom").focus();
        return;
    }

    const cert = Store.add(CERTS_KEY, data, "CERT-");
    Admin.log("Generated compliance certificate " + cert.id + " for " + cert.plant, "Compliance");

    const form = document.getElementById("certForm");
    form.reset();
    Validator.reset(form);
    updateDeliveredHint();
    renderKpis();
    renderLogs();
    renderCerts();

    if (compliance(cert) === "Compliant") {
        showToast("Certificate " + cert.id + " generated for " + cert.plant, "success");
    } else {
        showToast("Certificate " + cert.id + " generated. " + cert.plant + " is below the " + MANDATE_PCT + "% co-firing mandate.", "warning", { title: "Generated · below target" });
    }
}

function renderCerts() {
    const list = Admin.get(CERTS_KEY).slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const table = document.getElementById("certTable");
    document.getElementById("certCount").textContent = list.length + (list.length === 1 ? " certificate" : " certificates");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-certificate"></i>No certificates issued yet</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(c => `
        <tr>
            <td class="fw-600">${Store.esc(c.id)}</td>
            <td>${Store.esc(c.plant)}</td>
            <td class="nowrap">${Store.date(c.periodFrom)} – ${Store.date(c.periodTo)}</td>
            <td>${Number(c.coFiredTons).toLocaleString("en-IN")} t</td>
            <td>
                ${Store.esc(c.coFiringPct)}%
                <div><small class="${compliance(c) === "Compliant" ? "text-success" : "text-warning"}">${compliance(c)}</small></div>
            </td>
            <td>${Store.date(c.issueDate)}</td>
            <td>${Store.date(c.validUntil)}</td>
            <td><span class="${certStatus(c) === "Valid" ? "badge badge-success" : "badge badge-danger"}">${certStatus(c)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="view" data-id="${Store.esc(c.id)}" title="View certificate" aria-label="View ${Store.esc(c.id)}"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="download" data-id="${Store.esc(c.id)}" title="Download certificate" aria-label="Download ${Store.esc(c.id)}"><i class="fa-solid fa-download"></i></button>
                </div>
            </td>
        </tr>
    `).join("");
}

function onCertAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const cert = Store.find(CERTS_KEY, btn.dataset.id);
    if (!cert) return showToast("Certificate not found", "error");
    if (btn.dataset.action === "view") viewCertificate(cert);
    if (btn.dataset.action === "download") downloadCertificate(cert);
}

function certificateHtml(c) {
    return `
        <div class="certificate">
            <div class="certificate-brand"><i class="fa-solid fa-leaf"></i> Biomass Connect</div>
            <h2>Biomass Co-firing Compliance Certificate</h2>
            <p class="certificate-no">Certificate No. ${Store.esc(c.id)}</p>
            <p>This is to certify that</p>
            <h3>${Store.esc(c.plant)}</h3>
            <p>has co-fired <strong>${Number(c.coFiredTons).toLocaleString("en-IN")} tons</strong> of agricultural-residue biomass pellets,
               achieving a co-firing ratio of <strong>${Store.esc(c.coFiringPct)}%</strong>, during the reporting period
               <strong>${Store.date(c.periodFrom)}</strong> to <strong>${Store.date(c.periodTo)}</strong>.</p>
            <p class="certificate-status">${compliance(c) === "Compliant"
                ? "Meets the " + MANDATE_PCT + "% biomass co-firing mandate."
                : "Below the " + MANDATE_PCT + "% biomass co-firing mandate."}</p>
            ${c.remarks ? `<p class="text-muted">Remarks: ${Store.esc(c.remarks)}</p>` : ""}
            <div class="certificate-foot">
                <div><small>Issued on</small><strong>${Store.date(c.issueDate)}</strong></div>
                <div><small>Valid until</small><strong>${Store.date(c.validUntil)}</strong></div>
                <div><small>Status</small><strong>${certStatus(c)}</strong></div>
            </div>
        </div>`;
}

function viewCertificate(c) {
    viewingCert = c;
    document.getElementById("certModalTitle").textContent = "Certificate " + c.id;
    document.getElementById("certModalBody").innerHTML = certificateHtml(c);
    Admin.openModal("certModal");
}

function downloadCertificate(c) {
    const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${Store.esc(c.id)} | Biomass Connect</title>
<style>
body{font-family:"Segoe UI",Arial,sans-serif;background:#f6f8f6;color:#1d2a21;padding:40px}
.certificate{max-width:720px;margin:auto;background:#fff;border:2px solid #cfe5d6;border-radius:14px;padding:40px;text-align:center}
.certificate-brand{color:#2f7d4f;font-weight:700;letter-spacing:.04em}
h2{margin:12px 0 4px}h3{font-size:24px;color:#1f5636;margin:8px 0 16px}
p{line-height:1.6}.certificate-no,.text-muted{color:#5f6d63}
.certificate-status{color:#2f7d4f;font-weight:600}
.certificate-foot{display:flex;justify-content:space-around;margin-top:28px;padding-top:18px;border-top:1px solid #e3e9e4}
.certificate-foot small{display:block;color:#8a978e}
</style></head><body>${certificateHtml(c).replace(/<i class="[^"]*"><\/i>\s*/g, "")}</body></html>`;

    Admin.download(c.id + "-compliance-certificate.html", doc, "text/html;charset=utf-8");
    Admin.log("Downloaded compliance certificate " + c.id, "Compliance");
    renderKpis();
    renderLogs();
    showToast("Certificate " + c.id + " downloaded", "success");
}
