// =========================
// ADMIN — REPORTS & MONITORING (US044)
// Record and monitor environmental impact data (admin_impact).
// =========================

const IMPACT_KEY = "admin_impact";
const MIN_MONTH = "2020-01";

let editingId = null;

/* ---------- month rules (type="month" → YYYY-MM) ---------- */

function currentMonth() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function isMonth(v) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function monthLabel(m, short) {
    if (!isMonth(m)) return m || "—";
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", short ? { month: "short" } : { month: "short", year: "numeric" });
}

Validator.addRule("month", (v, p, el, label) => {
    if (el && el.validity && el.validity.badInput) return "Enter a complete month";
    if (!isMonth(v)) return label + " must be a valid month (YYYY-MM)";
    if (v < MIN_MONTH) return label + " cannot be before " + monthLabel(MIN_MONTH);
    return "";
});

Validator.addRule("notFutureMonth", (v, p, el, label) =>
    isMonth(v) && v > currentMonth() ? label + " cannot be in the future" : "");

Validator.addRule("monthSameOrAfter", (v, p, el, label) => {
    const other = document.querySelector(p);
    if (!other || !isMonth(other.value) || !isMonth(v)) return "";
    return v >= other.value ? "" : label + " cannot be before " + (other.dataset.label || "the start month").toLowerCase();
});

/* ---------- init ---------- */

document.addEventListener("DOMContentLoaded", () => {

    // picker bounds for month inputs
    ["impMonth", "fromMonth", "toMonth"].forEach(id => {
        const el = document.getElementById(id);
        el.min = MIN_MONTH;
        el.max = currentMonth();
    });
    document.getElementById("fromMonth").addEventListener("change", e => {
        document.getElementById("toMonth").min = e.target.value || MIN_MONTH;
    });

    fillStates();

    const form = document.getElementById("impactForm");
    form.addEventListener("submit", saveRecord);
    form.addEventListener("reset", () => setTimeout(() => Validator.reset(form), 0));
    document.getElementById("cancelEdit").addEventListener("click", () => { exitEdit(); showToast("Edit cancelled", "info"); });

    document.getElementById("stateFilter").addEventListener("change", render);
    ["fromMonth", "toMonth"].forEach(id => document.getElementById(id).addEventListener("change", onRangeChange));
    document.getElementById("filterForm").addEventListener("submit", e => e.preventDefault());
    document.getElementById("clearFilters").addEventListener("click", clearFilters);
    document.getElementById("chartMetric").addEventListener("change", render);
    document.getElementById("exportBtn").addEventListener("click", exportRecords);
    document.getElementById("impactTable").addEventListener("click", onAction);

    render();
});

function records() {
    return Admin.get(IMPACT_KEY);
}

function fillStates() {
    const select = document.getElementById("stateFilter");
    const current = select.value;
    const states = [...new Set(records().map(r => r.state))].sort();
    select.innerHTML = '<option value="All">All States</option>' + states.map(s => `<option>${Store.esc(s)}</option>`).join("");
    if (states.includes(current)) select.value = current;
}

/* ---------- filters ---------- */

function monthRange() {
    const from = document.getElementById("fromMonth");
    const to = document.getElementById("toMonth");
    const okFrom = Validator.validateField(from);
    const okTo = Validator.validateField(to);
    return { from: okFrom ? from.value : "", to: okFrom && okTo ? to.value : "", valid: okFrom && okTo };
}

function onRangeChange() {
    if (!monthRange().valid) showToast("Fix the highlighted month range to filter the report", "error", { title: "Invalid month range" });
    render();
}

function filtered() {
    const state = document.getElementById("stateFilter").value;
    const { from, to } = monthRange();
    return records()
        .filter(r => (state === "All" || r.state === state) && (!from || r.month >= from) && (!to || r.month <= to))
        .sort((a, b) => b.month.localeCompare(a.month) || a.state.localeCompare(b.state));
}

function clearFilters() {
    const form = document.getElementById("filterForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("toMonth").min = MIN_MONTH;
    render();
    showToast("Filters cleared", "info");
}

/* ---------- render ---------- */

function tons(n) {
    return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " t";
}

function sum(list, key) {
    return list.reduce((s, r) => s + Number(r[key] || 0), 0);
}

function render() {
    const list = filtered();

    document.getElementById("kpiCoal").textContent = tons(sum(list, "coalSaved"));
    document.getElementById("kpiWaste").textContent = tons(sum(list, "wasteUtilised"));
    document.getElementById("kpiCo2").textContent = tons(sum(list, "co2Avoided"));
    document.getElementById("kpiIncidents").textContent = sum(list, "incidentsPrevented").toLocaleString("en-IN");
    document.getElementById("recordCount").textContent = list.length + (list.length === 1 ? " record" : " records");

    renderChart(list);
    renderTable(list);
}

function chartMonths() {
    const { from, to } = monthRange();
    const end = to || currentMonth();
    const months = [];
    let [y, m] = end.split("-").map(Number);
    // walk back from the end month, at most 12 bars
    while (months.length < 12) {
        const key = y + "-" + String(m).padStart(2, "0");
        if (from ? key < from : months.length >= 6) break;
        months.unshift(key);
        m--;
        if (m === 0) { m = 12; y--; }
    }
    return months;
}

function renderChart(list) {
    const metric = document.getElementById("chartMetric").value;
    const months = chartMonths();
    const values = months.map(mo => sum(list.filter(r => r.month === mo), metric));
    const max = Math.max(...values, 0);
    const unit = metric === "incidentsPrevented" ? "" : " t";

    document.getElementById("chartSubtitle").textContent = months.length
        ? monthLabel(months[0]) + " – " + monthLabel(months[months.length - 1])
        : "No months in range";

    document.getElementById("barChart").innerHTML = months.map((mo, i) => {
        const pct = max ? Math.max(Math.round(values[i] / max * 100), 2) : 2;
        const label = Number(values[i]).toLocaleString("en-IN", { maximumFractionDigits: 0 });
        return `<div class="bar${i === months.length - 1 ? " accent" : ""}" style="height:${pct}%" title="${monthLabel(mo)}: ${label}${unit}">
                    <b>${values[i] ? label : ""}</b><span>${monthLabel(mo, true)}</span>
                </div>`;
    }).join("");

    // share by state for the selected metric
    const total = sum(list, metric) || 1;
    const byState = {};
    list.forEach(r => { byState[r.state] = (byState[r.state] || 0) + Number(r[metric] || 0); });
    const rows = Object.entries(byState).sort((a, b) => b[1] - a[1]);

    document.getElementById("regionList").innerHTML = rows.length ? rows.map(([state, v]) => `
        <div>
            <div class="region-row">
                <span class="text-muted">${Store.esc(state)}</span>
                <strong>${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit}</strong>
            </div>
            <div class="progress"><span style="width:${Math.round(v / total * 100)}%"></span></div>
        </div>`).join("") : "";
}

function renderTable(list) {
    const table = document.getElementById("impactTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-chart-column"></i>No impact records for the selected filters</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(r => `
        <tr class="${r.id === editingId ? "is-editing" : ""}">
            <td class="fw-600">${monthLabel(r.month)}</td>
            <td>
                <div>${Store.esc(r.district)}</div>
                <small class="text-muted">${Store.esc(r.state)}</small>
            </td>
            <td>${tons(r.coalSaved)}</td>
            <td>${tons(r.wasteUtilised)}</td>
            <td>${tons(r.co2Avoided)}</td>
            <td>${Number(r.incidentsPrevented).toLocaleString("en-IN")}</td>
            <td>${Store.date(r.createdAt)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" type="button" data-action="edit" data-id="${Store.esc(r.id)}" title="Edit record" aria-label="Edit record ${Store.esc(r.id)}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-sm btn-icon" type="button" data-action="delete" data-id="${Store.esc(r.id)}" title="Delete record" aria-label="Delete record ${Store.esc(r.id)}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
    `).join("");
}

/* ---------- add / edit ---------- */

function val(id) {
    return document.getElementById(id).value.trim();
}

function saveRecord(e) {
    e.preventDefault();
    if (!Validator.validateForm("#impactForm")) return;

    const data = {
        month: val("impMonth"),
        state: val("impState"),
        district: val("impDistrict").replace(/\s+/g, " "),
        coalSaved: Number(val("impCoal")),
        wasteUtilised: Number(val("impWaste")),
        co2Avoided: Number(val("impCo2")),
        incidentsPrevented: Number(val("impIncidents")),
        remarks: val("impRemarks")
    };

    if (!data.coalSaved && !data.wasteUtilised && !data.co2Avoided) {
        showToast("Enter at least one non-zero value for coal saved, waste utilised or CO₂ avoided", "error", { title: "Nothing to record" });
        document.getElementById("impCoal").focus();
        return;
    }

    const duplicate = records().find(r => r.id !== editingId &&
        r.month === data.month && r.state === data.state && r.district.toLowerCase() === data.district.toLowerCase());
    if (duplicate) {
        showToast("A record for " + data.district + ", " + data.state + " in " + monthLabel(data.month) + " already exists. Edit that record instead.", "error", { title: "Duplicate record" });
        return;
    }

    if (editingId) {
        Store.update(IMPACT_KEY, editingId, data);
        Admin.log("Updated environmental impact record " + editingId + " (" + data.district + ", " + monthLabel(data.month) + ")", "Reports");
        showToast("Impact record for " + data.district + " · " + monthLabel(data.month) + " updated", "success");
        exitEdit();
    } else {
        const rec = Store.add(IMPACT_KEY, data, "IMP-");
        Admin.log("Recorded environmental impact data " + rec.id + " (" + data.district + ", " + monthLabel(data.month) + ")", "Reports");
        showToast("Impact data for " + data.district + " · " + monthLabel(data.month) + " recorded", "success");
        const form = document.getElementById("impactForm");
        form.reset();
        Validator.reset(form);
    }

    fillStates();
    render();
}

function onAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "edit") startEdit(btn.dataset.id);
    if (btn.dataset.action === "delete") deleteRecord(btn.dataset.id);
}

function startEdit(id) {
    const r = Store.find(IMPACT_KEY, id);
    if (!r) return showToast("Record not found", "error");

    editingId = id;
    const form = document.getElementById("impactForm");
    Validator.reset(form);

    document.getElementById("impMonth").value = r.month;
    document.getElementById("impState").value = r.state;
    document.getElementById("impDistrict").value = r.district;
    document.getElementById("impCoal").value = r.coalSaved;
    document.getElementById("impWaste").value = r.wasteUtilised;
    document.getElementById("impCo2").value = r.co2Avoided;
    document.getElementById("impIncidents").value = r.incidentsPrevented;
    document.getElementById("impRemarks").value = r.remarks || "";

    document.getElementById("formTitle").textContent = "Edit Impact Record";
    document.getElementById("formSubtitle").textContent = r.id + " · " + r.district + ", " + monthLabel(r.month);
    document.getElementById("submitBtn").innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Record';
    document.getElementById("cancelEdit").classList.remove("hidden");
    document.getElementById("resetForm").classList.add("hidden");
    document.getElementById("entryCard").classList.add("is-editing");
    document.getElementById("entryCard").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("impMonth").focus({ preventScroll: true });

    render();
    showToast("Editing " + r.district + " · " + monthLabel(r.month), "info");
}

function exitEdit() {
    editingId = null;
    const form = document.getElementById("impactForm");
    form.reset();
    Validator.reset(form);
    document.getElementById("formTitle").textContent = "Record Impact Data";
    document.getElementById("formSubtitle").textContent = "Monthly figures for one region";
    document.getElementById("submitBtn").innerHTML = '<i class="fa-solid fa-plus"></i> Add Record';
    document.getElementById("cancelEdit").classList.add("hidden");
    document.getElementById("resetForm").classList.remove("hidden");
    document.getElementById("entryCard").classList.remove("is-editing");
    render();
}

async function deleteRecord(id) {
    const r = Store.find(IMPACT_KEY, id);
    if (!r) return showToast("Record not found", "error");

    const ok = await confirmDialog({
        title: "Delete impact record?",
        message: r.district + ", " + r.state + " · " + monthLabel(r.month) + " will be removed from all reports.",
        confirmText: "Delete",
        danger: true
    });
    if (!ok) return;

    Store.remove(IMPACT_KEY, id);
    if (editingId === id) exitEdit();
    Admin.log("Deleted environmental impact record " + id, "Reports");
    fillStates();
    render();
    showToast("Impact record deleted", "success");
}

/* ---------- export ---------- */

function exportRecords() {
    if (!monthRange().valid) return showToast("Fix the month range before exporting", "error");
    const list = filtered();
    if (!list.length) return showToast("There are no records to export for the current filters", "warning");

    Admin.exportCSV("environmental-impact-" + Store.iso(0) + ".csv",
        ["Record ID", "Month", "State", "District", "Coal Saved (t)", "Agri Waste Utilised (t)", "CO2 Avoided (t)", "Burning Incidents Prevented", "Remarks", "Recorded On"],
        list.map(r => [r.id, r.month, r.state, r.district, r.coalSaved, r.wasteUtilised, r.co2Avoided, r.incidentsPrevented, r.remarks || "", r.createdAt]));
    Admin.log("Exported environmental impact report (" + list.length + " records)", "Reports");
    showToast(list.length + " impact records exported to CSV", "success");
}
