// =========================
// PURCHASE ORDERS (US017 create + manage)
// =========================

const MANUFACTURER = "GreenPellet Industries";
const DEFAULT_ADDRESS = "Plot 14, MIDC Ambad, Nashik, Maharashtra 422010";

let selectedListing = null;

document.addEventListener("DOMContentLoaded", () => {

    fillListingOptions();
    prefillAddress();
    bindModals();

    const form = document.getElementById("poForm");

    document.getElementById("listingSelect").addEventListener("change", e => selectListing(e.target.value));
    document.getElementById("quantity").addEventListener("input", updateSummary);
    document.getElementById("notes").addEventListener("input", updateNotesCount);

    form.addEventListener("submit", e => {
        e.preventDefault();
        placeOrder();
    });

    form.addEventListener("reset", () => {
        // the form resets after this handler runs
        setTimeout(() => {
            Validator.reset(form);
            selectListing("");
            updateNotesCount();
        }, 0);
    });

    document.getElementById("orderSearch").addEventListener("input", renderOrders);
    document.getElementById("statusFilter").addEventListener("change", renderOrders);

    document.getElementById("purchaseOrderTable").addEventListener("click", e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "view") viewOrder(btn.dataset.id);
        if (btn.dataset.action === "cancel") cancelOrder(btn.dataset.id);
    });

    preselectFromUrl();
    renderOrders();
});

/* ---------------- Listing selection ---------------- */

function availableListings() {
    return Store.get("biomassListings").filter(l => l.status === "Active" && Number(l.quantity) > 0);
}

function fillListingOptions() {
    const select = document.getElementById("listingSelect");
    select.insertAdjacentHTML("beforeend", availableListings().map(l =>
        `<option value="${Store.esc(l.id)}">${Store.esc(l.biomassType)} — ${Store.esc(l.farmer)}, ${Store.esc(l.location)} · ${Store.esc(l.quantity)} t @ ${Store.inr(l.price)}/t (${Store.esc(l.id)})</option>`
    ).join(""));
}

function preselectFromUrl() {
    const id = new URLSearchParams(location.search).get("listing");
    if (!id) return;

    const listing = Store.find("biomassListings", id);
    if (!listing || listing.status !== "Active" || Number(listing.quantity) <= 0) {
        showToast("The selected listing is no longer available. Please choose another one.", "warning");
        return;
    }

    document.getElementById("listingSelect").value = id;
    selectListing(id);
    showToast(listing.biomassType + " from " + listing.farmer + " selected. Enter quantity and delivery details.", "info");
    document.getElementById("quantity").focus({ preventScroll: true });
}

function selectListing(id) {
    selectedListing = id ? Store.find("biomassListings", id) : null;

    const qty = document.getElementById("quantity");
    const delivery = document.getElementById("deliveryDate");
    const availableFrom = document.getElementById("listingAvailableFrom");
    const hint = document.getElementById("availableHint");
    const tomorrow = Store.iso(1);

    if (selectedListing) {
        const available = Number(selectedListing.quantity);
        qty.dataset.rules = "required|number|positive|max:" + Math.min(available, 10000) + "|decimals:2";
        qty.dataset.msgMax = "Quantity cannot exceed the available " + available + " tons";
        document.getElementById("farmerName").value = selectedListing.farmer;
        document.getElementById("priceDisplay").value = Store.inr(selectedListing.price) + " / ton";
        hint.textContent = "Available: " + available + " tons";
        availableFrom.value = selectedListing.availableFrom || "";
        delivery.min = availableFrom.value > tomorrow ? availableFrom.value : tomorrow;
    } else {
        qty.dataset.rules = "required|number|positive|max:10000|decimals:2";
        delete qty.dataset.msgMax;
        document.getElementById("farmerName").value = "";
        document.getElementById("priceDisplay").value = "";
        hint.textContent = "Select a listing to see available quantity";
        availableFrom.value = "";
        delivery.min = tomorrow;
    }

    // re-check fields that depend on the listing if the user already filled them
    if (qty.value) Validator.validateField(qty);
    if (delivery.value) Validator.validateField(delivery);

    renderListingSummary();
    updateSummary();
}

function renderListingSummary() {
    const box = document.getElementById("listingSummary");
    const l = selectedListing;

    if (!l) {
        box.className = "text-muted";
        box.textContent = "No listing selected.";
        return;
    }

    box.className = "";
    box.innerHTML = `
        <div class="listing-summary-title">${Store.esc(l.biomassType)}</div>
        <div class="text-muted" style="font-size:13px">${Store.esc(l.id)} · ${Store.esc(l.farmer)} · ${Store.esc(l.location)}, ${Store.esc(l.state)}</div>
        <div class="text-muted" style="font-size:13px">Available ${Store.esc(l.quantity)} t from ${Store.date(l.availableFrom)}${l.moisture !== undefined ? " · Moisture " + Store.esc(l.moisture) + "%" : ""}</div>`;
}

function updateSummary() {
    const qtyEl = document.getElementById("quantity");
    const qty = Number(qtyEl.value);
    const price = selectedListing ? Number(selectedListing.price) : 0;
    const max = selectedListing ? Number(selectedListing.quantity) : 10000;
    const valid = qtyEl.value !== "" && qty > 0 && qty <= max;

    document.getElementById("sumQty").textContent = valid ? qty + " tons" : "—";
    document.getElementById("sumPrice").textContent = price ? Store.inr(price) : "—";
    document.getElementById("sumTotal").textContent = valid && price ? Store.inr(Math.round(qty * price * 100) / 100) : "₹0";
}

function updateNotesCount() {
    document.getElementById("notesCount").textContent = document.getElementById("notes").value.length;
}

function prefillAddress() {
    let address = DEFAULT_ADDRESS;
    try {
        const p = JSON.parse(localStorage.getItem("bc_profile_manufacturer")) || {};
        if (p.address && p.city && p.pincode) {
            address = [p.address, p.city, (p.state || "") + " " + p.pincode].map(s => s.trim()).filter(Boolean).join(", ");
        }
    } catch (e) { /* use default */ }

    const el = document.getElementById("deliveryAddress");
    el.defaultValue = address; // kept after form reset
    el.value = address;
}

/* ---------------- Place order ---------------- */

async function placeOrder() {
    const form = document.getElementById("poForm");
    if (!Validator.validateForm(form)) return;

    // the listing might have changed since the page loaded
    const listing = Store.find("biomassListings", document.getElementById("listingSelect").value);
    if (!listing || listing.status !== "Active") {
        showToast("This listing is no longer available. Please select another listing.", "error");
        return;
    }

    const quantity = Number(document.getElementById("quantity").value);
    if (quantity > Number(listing.quantity)) {
        showToast("Only " + listing.quantity + " tons are available for this listing.", "error");
        return;
    }

    const duplicate = Store.get("purchaseOrders").find(o =>
        o.manufacturer === MANUFACTURER && o.listingId === listing.id && o.status === "Pending");

    if (duplicate) {
        const ok = await confirmDialog({
            title: "Place another order?",
            message: "You already have a pending order (" + duplicate.id + ") for this listing. Do you want to place another one?",
            confirmText: "Place order"
        });
        if (!ok) return;
    }

    const deliveryDate = document.getElementById("deliveryDate").value;
    const order = Store.add("purchaseOrders", {
        listingId: listing.id,
        farmer: listing.farmer,
        manufacturer: MANUFACTURER,
        biomassType: listing.biomassType,
        quantity,
        price: Number(listing.price),
        total: Math.round(quantity * Number(listing.price) * 100) / 100,
        orderDate: Store.iso(0),
        deliveryDate,
        deliveryAddress: document.getElementById("deliveryAddress").value.trim(),
        notes: document.getElementById("notes").value.trim(),
        status: "Pending",
        expectedDelivery: deliveryDate,
        vehicleNo: ""
    });

    form.reset();
    if (location.search) history.replaceState(null, "", location.pathname);

    showToast("Purchase order " + order.id + " sent to " + order.farmer + " for " + quantity + " tons of " + order.biomassType + ".", "success", { title: "Order placed" });
    renderOrders();
}

/* ---------------- My purchase orders ---------------- */

function myOrders() {
    return Store.get("purchaseOrders").filter(o => o.manufacturer === MANUFACTURER);
}

function renderOrders() {
    const search = document.getElementById("orderSearch").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;
    const all = myOrders();

    const list = all.filter(o => {
        if (status && o.status !== status) return false;
        if (search && ![o.id, o.farmer, o.biomassType].join(" ").toLowerCase().includes(search)) return false;
        return true;
    });

    document.getElementById("orderCount").textContent =
        all.length + (all.length === 1 ? " order" : " orders") + " · " + all.filter(o => o.status === "Pending").length + " awaiting farmer response";

    const table = document.getElementById("purchaseOrderTable");

    if (!list.length) {
        table.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-file-circle-question"></i>${all.length ? "No orders match your filters" : "You have not placed any purchase orders yet"}</div></td></tr>`;
        return;
    }

    table.innerHTML = list.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.farmer)}</td>
            <td>${Store.esc(o.biomassType)}</td>
            <td>${Store.esc(o.quantity)} t</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(o.deliveryDate)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm btn-icon" data-action="view" data-id="${Store.esc(o.id)}" title="View details" aria-label="View ${Store.esc(o.id)}"><i class="fa-solid fa-eye"></i></button>
                    ${["Accepted", "In Transit"].includes(o.status)
                        ? `<a class="btn btn-secondary btn-sm btn-icon" href="tracking.html?order=${encodeURIComponent(o.id)}" title="Track order" aria-label="Track ${Store.esc(o.id)}"><i class="fa-solid fa-truck-fast"></i></a>` : ""}
                    ${o.status === "Pending"
                        ? `<button class="btn btn-danger btn-sm" data-action="cancel" data-id="${Store.esc(o.id)}"><i class="fa-solid fa-ban"></i> Cancel</button>` : ""}
                </div>
            </td>
        </tr>
    `).join("");
}

function viewOrder(id) {
    const o = Store.find("purchaseOrders", id);
    if (!o) {
        showToast("Purchase order not found.", "error");
        return;
    }

    document.getElementById("viewTitle").textContent = "Purchase Order " + o.id;
    document.getElementById("viewBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></dd></div>
            <div><dt>Listing</dt><dd>${Store.esc(o.listingId || "—")}</dd></div>
            <div><dt>Farmer</dt><dd>${Store.esc(o.farmer)}</dd></div>
            <div><dt>Biomass type</dt><dd>${Store.esc(o.biomassType)}</dd></div>
            <div><dt>Quantity</dt><dd>${Store.esc(o.quantity)} tons</dd></div>
            <div><dt>Price / ton</dt><dd>${Store.inr(o.price)}</dd></div>
            <div><dt>Order total</dt><dd>${Store.inr(o.total)}</dd></div>
            <div><dt>Order date</dt><dd>${Store.date(o.orderDate)}</dd></div>
            <div><dt>Requested delivery</dt><dd>${Store.date(o.deliveryDate)}</dd></div>
            <div><dt>Expected delivery</dt><dd>${Store.date(o.expectedDelivery)}</dd></div>
            <div><dt>Vehicle no.</dt><dd>${Store.esc(o.vehicleNo || "—")}</dd></div>
            <div><dt>Delivery address</dt><dd>${Store.esc(o.deliveryAddress || "—")}</dd></div>
            ${o.notes ? `<div class="span-2"><dt>Notes</dt><dd>${Store.esc(o.notes)}</dd></div>` : ""}
            ${o.rejectReason ? `<div class="span-2"><dt>Rejection reason</dt><dd>${Store.esc(o.rejectReason)}</dd></div>` : ""}
        </dl>`;

    openModal("viewModal");
}

async function cancelOrder(id) {
    const o = Store.find("purchaseOrders", id);
    if (!o || o.status !== "Pending") {
        showToast("Only pending orders can be cancelled.", "warning");
        renderOrders();
        return;
    }

    const ok = await confirmDialog({
        title: "Cancel purchase order?",
        message: o.id + " for " + o.quantity + " tons of " + o.biomassType + " from " + o.farmer + " will be cancelled. This cannot be undone.",
        confirmText: "Cancel order",
        cancelText: "Keep order",
        danger: true
    });
    if (!ok) return;

    Store.update("purchaseOrders", id, { status: "Cancelled", cancelledOn: Store.iso(0) });
    showToast("Purchase order " + id + " has been cancelled.", "success");
    renderOrders();
}

/* ---------------- Modal helpers ---------------- */

function openModal(id) {
    document.getElementById(id).classList.add("open");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("open");
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
