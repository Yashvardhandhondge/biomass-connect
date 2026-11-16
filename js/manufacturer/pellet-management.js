// =========================
// MANAGE PELLET LISTINGS (US022)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const OPEN_ORDER = ["Pending", "Accepted", "In Transit"];

let editingId = null;

/* ---------- Custom rules (same as the create page) ---------- */

Validator.addRule("uniqueBatch", (v, p, el) => {
    const exclude = (el && el.dataset.excludeId) || "";
    const taken = Store.get("pelletListings").some(l =>
        l.manufacturer === MANUFACTURER && l.id !== exclude &&
        String(l.batchNo || "").toLowerCase() === v.toLowerCase());
    return taken ? "Batch number " + v.toUpperCase() + " is already used by another listing" : "";
});

function isPremium(el) {
    const grade = el && el.form && el.form.querySelector("[data-grade-select]");
    return !!grade && grade.value === "Premium";
}

Validator.addRule("premiumMax", (v, p, el, label) =>
    isPremium(el) && Number(v) > Number(p) ? label + " must be at most " + p + " for Premium grade" : "");

Validator.addRule("premiumMin", (v, p, el, label) =>
    isPremium(el) && Number(v) < Number(p) ? label + " must be at least " + p + " for Premium grade" : "");

// an existing past date may be kept, but a newly chosen date cannot be in the past
Validator.addRule("notPastIfChanged", (v, p, el, label) =>
    el && v !== el.dataset.original && v < Store.iso(0) ? label + " cannot be in the past" : "");

/* ---------- Page ---------- */

document.addEventListener("DOMContentLoaded", () => {

    bindModals();

    document.getElementById("searchInput").addEventListener("input", render);
    document.getElementById("statusFilter").addEventListener("change", render);
    document.getElementById("gradeFilter").addEventListener("change", render);

    document.getElementById("listingTable").addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        ({ view: viewListing, edit: openEdit, toggle: toggleListing, remove: removeListing })[btn.dataset.action](id);
    });

    document.getElementById("editGrade").addEventListener("change", () => {
        ["editMoisture", "editAsh", "editCalorific"].forEach(id => {
            const el = document.getElementById(id);
            if (el.value) Validator.validateField(el);
        });
    });

    document.getElementById("editForm").addEventListener("submit", e => {
        e.preventDefault();
        saveEdit();
    });

    render();
});

function myListings() {
    return Store.get("pelletListings").filter(l => l.manufacturer === MANUFACTURER);
}

function openOrders(listingId) {
    return Store.get("pelletOrders").filter(o => o.listingId === listingId && OPEN_ORDER.includes(o.status));
}

function render() {
    const all = myListings();
    const active = all.filter(l => l.status === "Active");
    const stock = active.reduce((s, l) => s + Number(l.quantity || 0), 0);
    const value = active.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.price || 0), 0);

    document.getElementById("kpiTotal").textContent = all.length;
    document.getElementById("kpiActive").textContent = active.length;
    document.getElementById("kpiStock").textContent = stock.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " t";
    document.getElementById("kpiValue").textContent = Store.inr(Math.round(value));

    const search = document.getElementById("searchInput").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const grade = document.getElementById("gradeFilter").value;

    const list = all.filter(l => {
        if (status && l.status !== status) return false;
        if (grade && l.grade !== grade) return false;
        if (search && ![l.id, l.pelletType, l.batchNo].join(" ").toLowerCase().includes(search)) return false;
        return true;
    });

    document.getElementById("resultCount").textContent =
        list.length + " of " + all.length + (all.length === 1 ? " listing" : " listings");

    const table = document.getElementById("listingTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-boxes-stacked"></i>${all.length ? "No listings match your filters" : "You have no pellet listings yet"}<br>
            ${all.length ? "" : `<a class="btn btn-primary btn-sm mt-2" href="pellet-listing.html">Create your first listing</a>`}</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(l => {
        const id = Store.esc(l.id);
        const toggleBtn = l.status === "Active"
            ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="toggle" data-id="${id}" title="Deactivate" aria-label="Deactivate ${id}"><i class="fa-solid fa-pause"></i></button>`
            : `<button class="btn btn-secondary btn-sm btn-icon" data-action="toggle" data-id="${id}" title="Activate" aria-label="Activate ${id}"><i class="fa-solid fa-play"></i></button>`;
        return `
        <tr>
            <td class="fw-600 listing-id">${id}<small>${l.batchNo ? "Batch " + Store.esc(l.batchNo) : "No batch no."}</small></td>
            <td>${Store.esc(l.pelletType)}</td>
            <td>${Store.esc(l.grade)}</td>
            <td>${Store.esc(l.quantity)} t</td>
            <td>${Store.inr(l.price)}</td>
            <td class="quality-cell">${Store.esc(l.moisture)}% / ${Store.esc(l.ashContent)}% / ${Store.esc(l.calorificValue)}</td>
            <td>${Store.date(l.availableFrom)}</td>
            <td><span class="${Store.badge(l.status)}">${Store.esc(l.status)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" data-action="view" data-id="${id}" title="View" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-secondary btn-sm btn-icon" data-action="edit" data-id="${id}" title="Edit" aria-label="Edit ${id}"><i class="fa-solid fa-pen"></i></button>
                    ${toggleBtn}
                    <button class="btn btn-danger btn-sm btn-icon" data-action="remove" data-id="${id}" title="Remove" aria-label="Remove ${id}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

/* ---------- View ---------- */

function viewListing(id) {
    const l = Store.find("pelletListings", id);
    if (!l) return notFound();

    const item = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    const orders = openOrders(id).length;

    document.getElementById("viewTitle").textContent = l.id + " · " + l.pelletType;
    document.getElementById("viewBody").innerHTML = `
        <div class="view-section">
            <h4>Product</h4>
            <dl class="detail-list">
                ${item("Status", `<span class="${Store.badge(l.status)}">${Store.esc(l.status)}</span>`)}
                ${item("Grade", Store.esc(l.grade))}
                ${item("Batch number", Store.esc(l.batchNo || "—"))}
                ${item("Quantity", Store.esc(l.quantity) + " tons")}
                ${item("Price / ton", Store.inr(l.price))}
                ${item("Stock value", Store.inr(Math.round(l.quantity * l.price)))}
                ${item("Production date", Store.date(l.productionDate))}
                ${item("Available from", Store.date(l.availableFrom))}
                ${item("Location", Store.esc(l.location))}
            </dl>
        </div>
        <div class="view-section">
            <h4>Quality parameters</h4>
            <dl class="detail-list">
                ${item("Diameter", Store.esc(l.diameter) + " mm")}
                ${item("Length", Store.esc(l.length) + " mm")}
                ${item("Moisture", Store.esc(l.moisture) + " %")}
                ${item("Ash content", Store.esc(l.ashContent) + " %")}
                ${item("Calorific value", Store.esc(l.calorificValue) + " kcal/kg")}
                ${item("Bulk density", Store.esc(l.bulkDensity) + " kg/m³")}
            </dl>
        </div>
        <div class="view-section">
            <h4>Certification &amp; orders</h4>
            <dl class="detail-list">
                ${item("Certification", Store.esc(l.certification || "—"))}
                ${item("Quality report", Store.esc(l.qualityReport || "—"))}
                ${item("Open orders", orders)}
            </dl>
            ${l.description ? `<p class="text-muted mt-2" style="font-size:13px">${Store.esc(l.description)}</p>` : ""}
        </div>`;

    openModal("viewModal");
}

/* ---------- Edit ---------- */

const FIELDS = {
    editPelletType: "pelletType",
    editGrade: "grade",
    editBatch: "batchNo",
    editQuantity: "quantity",
    editPrice: "price",
    editAvailableFrom: "availableFrom",
    editLocation: "location",
    editDiameter: "diameter",
    editLength: "length",
    editMoisture: "moisture",
    editAsh: "ashContent",
    editCalorific: "calorificValue",
    editBulk: "bulkDensity",
    editCertification: "certification",
    editDescription: "description"
};

const NUMERIC = ["quantity", "price", "diameter", "length", "moisture", "ashContent", "calorificValue", "bulkDensity"];

function openEdit(id) {
    const l = Store.find("pelletListings", id);
    if (!l) return notFound();

    editingId = id;
    Object.entries(FIELDS).forEach(([fieldId, key]) => {
        document.getElementById(fieldId).value = l[key] == null ? "" : l[key];
    });

    document.getElementById("editBatch").dataset.excludeId = id;
    document.getElementById("editAvailableFrom").dataset.original = l.availableFrom || "";

    document.getElementById("editTitle").textContent = "Edit " + l.id;
    openModal("editModal");
}

function saveEdit() {
    const form = document.getElementById("editForm");
    if (!Validator.validateForm(form)) return;

    const current = Store.find("pelletListings", editingId);
    if (!current) {
        closeModal("editModal");
        return notFound();
    }

    const patch = {};
    Object.entries(FIELDS).forEach(([fieldId, key]) => {
        const raw = document.getElementById(fieldId).value.trim();
        patch[key] = NUMERIC.includes(key) ? Number(raw) : (key === "batchNo" ? raw.toUpperCase() : raw);
    });

    const changed = Object.keys(patch).filter(k => String(patch[k]) !== String(current[k] == null ? "" : current[k]));
    if (!changed.length) {
        closeModal("editModal");
        showToast("No changes were made to " + current.id + ".", "info");
        return;
    }

    let relisted = false;
    if (current.status === "Sold Out" && patch.quantity > 0) {
        patch.status = "Active";
        relisted = true;
    }

    Store.update("pelletListings", editingId, patch);
    closeModal("editModal");
    showToast(current.id + " updated successfully" + (relisted ? " and relisted as Active." : "."), "success", { title: "Listing updated" });
    render();
}

/* ---------- Toggle / remove ---------- */

function toggleListing(id) {
    const l = Store.find("pelletListings", id);
    if (!l) return notFound();

    if (l.status === "Sold Out") {
        showToast("This listing is sold out. Edit it and add stock to relist it.", "warning");
        return;
    }

    const next = l.status === "Active" ? "Inactive" : "Active";
    Store.update("pelletListings", id, { status: next });
    showToast(next === "Active"
        ? l.id + " is active again and visible to power plants."
        : l.id + " is now inactive and hidden from the marketplace.", "success");
    render();
}

async function removeListing(id) {
    const l = Store.find("pelletListings", id);
    if (!l) return notFound();

    const open = openOrders(id);
    if (open.length) {
        showToast(l.id + " has " + open.length + " open order" + (open.length > 1 ? "s" : "") +
            " (" + open.map(o => o.id).join(", ") + "). Complete or reject them before removing this listing.", "error", { title: "Cannot remove listing" });
        return;
    }

    const ok = await confirmDialog({
        title: "Remove pellet listing?",
        message: l.id + " (" + l.quantity + " t " + l.pelletType + ") will be permanently removed from the marketplace.",
        confirmText: "Remove",
        danger: true
    });
    if (!ok) return;

    Store.remove("pelletListings", id);
    showToast("Listing " + l.id + " removed.", "success");
    render();
}

function notFound() {
    showToast("This listing no longer exists.", "error");
    render();
}

/* ---------- Modal helpers ---------- */

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
