// =========================
// PLACE PELLET ORDER + MY ORDERS (US029)
// =========================

const MAX_ORDER_TONS = 10000;
let activeListings = [];

document.addEventListener("DOMContentLoaded", () => {

    activeListings = Store.get("pelletListings").filter(l => l.status === "Active" && Number(l.quantity) > 0);

    populateListings();
    setDefaultAddress();
    Plant.counter("notes", "notesCount");

    const form = document.getElementById("orderForm");
    document.getElementById("listingSelect").addEventListener("change", onListingChange);
    document.getElementById("quantity").addEventListener("input", updateTotal);
    form.addEventListener("submit", placeOrder);
    form.addEventListener("reset", () => setTimeout(() => {
        Validator.reset(form);
        onListingChange();
    }, 0));

    // prefill from marketplace (?listing=PL-501)
    const pre = Plant.param("listing");
    if (pre) {
        if (activeListings.some(l => l.id === pre)) {
            document.getElementById("listingSelect").value = pre;
            document.getElementById("quantity").focus();
        } else {
            showToast("The selected listing is no longer available. Please choose another listing.", "warning");
        }
    }
    onListingChange();

    // my orders
    document.getElementById("orderSearch").addEventListener("input", renderOrders);
    document.getElementById("statusFilter").addEventListener("change", renderOrders);
    document.getElementById("orderTable").addEventListener("click", onTableClick);

    document.getElementById("editForm").addEventListener("submit", saveEdit);
    document.getElementById("editQuantity").addEventListener("input", updateEditTotal);

    renderOrders();
});

/* ---------------- New order form ---------------- */

function populateListings() {
    const select = document.getElementById("listingSelect");
    activeListings.forEach(l => {
        select.insertAdjacentHTML("beforeend",
            `<option value="${Store.esc(l.id)}">${Store.esc(l.pelletType)} (${Store.esc(l.grade)}) — ${Store.esc(l.manufacturer)} · ${Plant.num(l.quantity)} t @ ${Store.inr(l.price)}/t</option>`);
    });
    if (!activeListings.length) {
        select.insertAdjacentHTML("beforeend", `<option value="" disabled>No active listings available</option>`);
    }
}

function setDefaultAddress() {
    const p = Plant.profile();
    const field = document.getElementById("deliveryAddress");
    const address = [p.address, [p.city, p.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    field.value = address;
    field.defaultValue = address;   // restored by the Clear button
}

function selectedListing() {
    const id = document.getElementById("listingSelect").value;
    return activeListings.find(l => l.id === id) || null;
}

function quantityRules(available) {
    const max = Math.min(Number(available) || MAX_ORDER_TONS, MAX_ORDER_TONS);
    return {
        rules: `required|number|positive|max:${max}|decimals:2`,
        msg: Number(available) > MAX_ORDER_TONS
            ? `Quantity cannot exceed ${MAX_ORDER_TONS} tons per order`
            : `Quantity cannot exceed the available ${Plant.num(available)} tons`
    };
}

function futureAvailability(listing) {
    return listing && listing.availableFrom && listing.availableFrom > Store.iso(0) ? listing.availableFrom : "";
}

function onListingChange() {
    const l = selectedListing();
    const qty = document.getElementById("quantity");
    const date = document.getElementById("deliveryDate");
    const availableFrom = document.getElementById("availableFrom");
    const hint = date.closest(".form-group").querySelector(".form-hint");

    if (!l) {
        ["supplierName", "availableQty", "price", "total"].forEach(id => { document.getElementById(id).value = ""; });
        qty.dataset.rules = `required|number|positive|max:${MAX_ORDER_TONS}|decimals:2`;
        delete qty.dataset.msgMax;
        availableFrom.value = "";
        hint.textContent = "Between tomorrow and 90 days from today.";
        document.getElementById("listingSummary").innerHTML =
            `<div class="empty-state"><i class="fa-solid fa-box-open"></i>Select a listing to see its quality specifications.</div>`;
    } else {
        document.getElementById("supplierName").value = l.manufacturer;
        document.getElementById("availableQty").value = Plant.num(l.quantity) + " t";
        document.getElementById("price").value = Store.inr(l.price);

        const q = quantityRules(l.quantity);
        qty.dataset.rules = q.rules;
        qty.dataset.msgMax = q.msg;

        availableFrom.value = futureAvailability(l);
        hint.textContent = availableFrom.value
            ? "Stock is available from " + Store.date(availableFrom.value) + "; delivery must be on or after that date (max 90 days)."
            : "Between tomorrow and 90 days from today.";

        renderSummary(l);
    }

    // refresh the date picker bounds and re-check filled fields against the new limits
    availableFrom.dispatchEvent(new Event("change"));
    if (qty.value) Validator.validateField(qty);
    if (date.value) Validator.validateField(date);
    updateTotal();
}

function renderSummary(l) {
    document.getElementById("listingSummary").innerHTML = `
        <dl class="detail-list">
            <div><dt>Listing</dt><dd>${Store.esc(l.id)}</dd></div>
            <div><dt>Grade</dt><dd>${Store.esc(l.grade)}</dd></div>
            <div><dt>Calorific Value</dt><dd>${Plant.num(l.calorificValue, 0)} kcal/kg</dd></div>
            <div><dt>Moisture</dt><dd>${Plant.num(l.moisture)}%</dd></div>
            <div><dt>Ash Content</dt><dd>${Plant.num(l.ashContent)}%</dd></div>
            <div><dt>Bulk Density</dt><dd>${Plant.num(l.bulkDensity, 0)} kg/m³</dd></div>
            <div><dt>Size (Ø × L)</dt><dd>${Plant.num(l.diameter)} × ${Plant.num(l.length)} mm</dd></div>
            <div><dt>Certification</dt><dd>${l.certification ? Store.esc(l.certification) : "—"}</dd></div>
            <div><dt>Dispatch From</dt><dd>${Store.esc(l.location)}</dd></div>
            <div><dt>Available From</dt><dd>${Store.date(l.availableFrom)}</dd></div>
        </dl>
        <div class="summary-total">
            <span class="text-muted">Order total</span>
            <strong id="summaryTotal">₹0</strong>
        </div>`;
}

function updateTotal() {
    const l = selectedListing();
    const q = Number(document.getElementById("quantity").value);
    const amount = l && q > 0 ? Plant.round(q * Number(l.price), 2) : 0;
    document.getElementById("total").value = amount ? Store.inr(amount) : "";
    const summary = document.getElementById("summaryTotal");
    if (summary) summary.textContent = Store.inr(amount);
}

function placeOrder(e) {
    e.preventDefault();

    if (!Validator.validateForm("#orderForm")) return;

    const selected = selectedListing();
    const listing = selected && Store.find("pelletListings", selected.id);

    if (!listing || listing.status !== "Active" || Number(listing.quantity) <= 0) {
        showToast("This listing is no longer available. Please choose another listing.", "error");
        return;
    }

    const quantity = Plant.round(Number(document.getElementById("quantity").value), 2);
    if (quantity > Number(listing.quantity)) {
        showToast(`Only ${Plant.num(listing.quantity)} tons are available on this listing`, "error");
        return;
    }

    const deliveryDate = document.getElementById("deliveryDate").value;

    const order = Store.add("pelletOrders", {
        listingId: listing.id,
        manufacturer: listing.manufacturer,
        powerPlant: Plant.NAME,
        pelletType: listing.pelletType,
        grade: listing.grade,
        quantity,
        price: Number(listing.price),
        total: Plant.round(quantity * Number(listing.price), 2),
        orderDate: Store.iso(0),
        deliveryDate,
        deliveryAddress: document.getElementById("deliveryAddress").value.trim(),
        notes: document.getElementById("notes").value.trim(),
        status: "Pending",
        expectedDelivery: deliveryDate,
        vehicleNo: ""
    });

    showToast(`Order ${order.id} placed with ${order.manufacturer}. Awaiting supplier confirmation.`, "success");

    const form = document.getElementById("orderForm");
    form.reset();
    Validator.reset(form);

    renderOrders();
    document.getElementById("myOrders").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- My orders ---------------- */

function renderOrders() {
    const q = document.getElementById("orderSearch").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;

    const list = Plant.orders()
        .filter(o => !status || o.status === status)
        .filter(o => !q || [o.id, o.manufacturer, o.pelletType, o.grade].join(" ").toLowerCase().includes(q))
        .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || "") || String(b.id).localeCompare(String(a.id)));

    const table = document.getElementById("orderTable");

    if (!list.length) {
        table.innerHTML = Plant.emptyRow(9, "fa-inbox", q || status ? "No orders match your search" : "You haven't placed any pellet orders yet");
        return;
    }

    table.innerHTML = list.map(o => `
        <tr>
            <td class="fw-600">${Store.esc(o.id)}</td>
            <td>${Store.esc(o.manufacturer)}</td>
            <td>${Store.esc(o.pelletType)} <span class="text-subtle">· ${Store.esc(o.grade)}</span></td>
            <td>${Plant.num(o.quantity)} t</td>
            <td>${Store.inr(o.total)}</td>
            <td>${Store.date(o.orderDate)}</td>
            <td>${Store.date(o.deliveryDate)}</td>
            <td><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></td>
            <td><div class="table-actions">${actionButtons(o)}</div></td>
        </tr>
    `).join("");
}

function actionButtons(o) {
    const id = Store.esc(o.id);
    let html = `<button class="btn btn-ghost btn-icon" type="button" data-action="view" data-id="${id}" title="View details" aria-label="View ${id}"><i class="fa-solid fa-eye"></i></button>`;

    if (o.status === "Pending") {
        html += `<button class="btn btn-ghost btn-icon" type="button" data-action="edit" data-id="${id}" title="Edit order" aria-label="Edit ${id}"><i class="fa-solid fa-pen"></i></button>`;
        html += `<button class="btn btn-danger btn-icon" type="button" data-action="cancel" data-id="${id}" title="Cancel order" aria-label="Cancel ${id}"><i class="fa-solid fa-xmark"></i></button>`;
    }
    if (o.status === "Accepted" || o.status === "In Transit") {
        html += `<a class="btn btn-ghost btn-icon" href="tracking.html?order=${encodeURIComponent(o.id)}" title="Track order" aria-label="Track ${id}"><i class="fa-solid fa-truck-fast"></i></a>`;
    }
    if (o.status === "Delivered") {
        html += `<a class="btn btn-ghost btn-icon" href="pellet-feedback.html?order=${encodeURIComponent(o.id)}" title="Batch feedback" aria-label="Feedback for ${id}"><i class="fa-solid fa-clipboard-check"></i></a>`;
    }
    return html;
}

function onTableClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "view") viewOrder(id);
    if (btn.dataset.action === "edit") openEdit(id);
    if (btn.dataset.action === "cancel") cancelOrder(id);
}

function viewOrder(id) {
    const o = Store.find("pelletOrders", id);
    if (!o) {
        showToast("Order not found", "error");
        return;
    }

    document.getElementById("viewModalTitle").textContent = "Order " + o.id;
    document.getElementById("viewModalBody").innerHTML = `
        <dl class="detail-list">
            <div><dt>Status</dt><dd><span class="${Store.badge(o.status)}">${Store.esc(o.status)}</span></dd></div>
            <div><dt>Supplier</dt><dd>${Store.esc(o.manufacturer)}</dd></div>
            <div><dt>Pellet Type</dt><dd>${Store.esc(o.pelletType)} (${Store.esc(o.grade)})</dd></div>
            <div><dt>Listing</dt><dd>${Store.esc(o.listingId)}</dd></div>
            <div><dt>Quantity</dt><dd>${Plant.num(o.quantity)} tons</dd></div>
            <div><dt>Price</dt><dd>${Store.inr(o.price)} / ton</dd></div>
            <div><dt>Total</dt><dd>${Store.inr(o.total)}</dd></div>
            <div><dt>Ordered On</dt><dd>${Store.date(o.orderDate)}</dd></div>
            <div><dt>Required Delivery</dt><dd>${Store.date(o.deliveryDate)}</dd></div>
            <div><dt>Expected Delivery</dt><dd>${Store.date(o.expectedDelivery)}</dd></div>
            <div><dt>Vehicle</dt><dd>${o.vehicleNo ? Store.esc(o.vehicleNo) : "Not assigned"}</dd></div>
            <div><dt>Delivered On</dt><dd>${Store.date(o.deliveredOn)}</dd></div>
            <div class="span-2"><dt>Delivery Address</dt><dd>${Store.esc(o.deliveryAddress)}</dd></div>
            <div class="span-2"><dt>Notes</dt><dd>${o.notes ? Store.esc(o.notes) : "—"}</dd></div>
        </dl>`;
    Plant.openModal("viewModal");
}

async function cancelOrder(id) {
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "Pending") {
        showToast("Only pending orders can be cancelled", "warning");
        renderOrders();
        return;
    }

    const ok = await confirmDialog({
        title: "Cancel order " + o.id + "?",
        message: `Your order for ${Plant.num(o.quantity)} t of ${o.pelletType} from ${o.manufacturer} will be cancelled. This cannot be undone.`,
        confirmText: "Cancel Order",
        cancelText: "Keep Order",
        danger: true
    });
    if (!ok) return;

    Store.update("pelletOrders", id, { status: "Cancelled", cancelledOn: Store.iso(0) });
    showToast(`Order ${id} has been cancelled`, "success");
    renderOrders();
}

/* ---------------- Edit pending order ---------------- */

let editing = null;

function openEdit(id) {
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "Pending") {
        showToast("Only pending orders can be edited", "warning");
        renderOrders();
        return;
    }

    const listing = Store.find("pelletListings", o.listingId);
    const available = listing ? Number(listing.quantity) : Number(o.quantity);
    editing = { order: o, available };

    const qty = document.getElementById("editQuantity");
    const q = quantityRules(available);
    qty.dataset.rules = q.rules;
    qty.dataset.msgMax = q.msg;

    const availableFrom = document.getElementById("editAvailableFrom");
    availableFrom.value = futureAvailability(listing);
    availableFrom.dispatchEvent(new Event("change"));

    document.getElementById("editOrderId").value = o.id;
    document.getElementById("editModalTitle").textContent = "Edit Order " + o.id;
    document.getElementById("editSummary").textContent =
        `${o.pelletType} (${o.grade}) from ${o.manufacturer} @ ${Store.inr(o.price)}/t · up to ${Plant.num(Math.min(available, MAX_ORDER_TONS))} t`;
    qty.value = o.quantity;
    document.getElementById("editDeliveryDate").value = o.deliveryDate || "";
    document.getElementById("editAddress").value = o.deliveryAddress || "";
    document.getElementById("editNotes").value = o.notes || "";

    updateEditTotal();
    Plant.openModal("editModal");
}

function updateEditTotal() {
    if (!editing) return;
    const q = Number(document.getElementById("editQuantity").value);
    document.getElementById("editTotal").textContent =
        "New total: " + Store.inr(q > 0 ? Plant.round(q * Number(editing.order.price), 2) : 0);
}

function saveEdit(e) {
    e.preventDefault();

    if (!Validator.validateForm("#editForm")) return;

    const id = document.getElementById("editOrderId").value;
    const o = Store.find("pelletOrders", id);
    if (!o || o.status !== "Pending") {
        Plant.closeModal("editModal");
        showToast("This order can no longer be edited — the supplier has already responded", "error");
        renderOrders();
        return;
    }

    const quantity = Plant.round(Number(document.getElementById("editQuantity").value), 2);
    const patch = {
        quantity,
        total: Plant.round(quantity * Number(o.price), 2),
        deliveryDate: document.getElementById("editDeliveryDate").value,
        expectedDelivery: document.getElementById("editDeliveryDate").value,
        deliveryAddress: document.getElementById("editAddress").value.trim(),
        notes: document.getElementById("editNotes").value.trim()
    };

    const unchanged = patch.quantity === Number(o.quantity) && patch.deliveryDate === o.deliveryDate &&
        patch.deliveryAddress === (o.deliveryAddress || "") && patch.notes === (o.notes || "");
    if (unchanged) {
        showToast("No changes to save", "info");
        return;
    }

    Store.update("pelletOrders", id, patch);
    Plant.closeModal("editModal");
    showToast(`Order ${id} updated successfully`, "success");
    renderOrders();
}
