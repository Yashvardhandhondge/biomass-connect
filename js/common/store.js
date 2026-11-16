/* =========================================================
   BIOMASS CONNECT — SHARED DATA STORE (localStorage, front-end only)
   ---------------------------------------------------------
   Shared collections (seeded with sample data on first use):

   biomassListings  — created by Farmers, browsed by Manufacturers
     { id, farmer, biomassType, quantity, unit:"Tons", price (₹/ton),
       location, district, state, availableFrom (YYYY-MM-DD), moisture (%),
       description, status: "Active" | "Inactive" | "Sold Out", createdAt }

   purchaseOrders   — Manufacturer → Farmer biomass orders
     { id, listingId, farmer, manufacturer, biomassType, quantity, price,
       total, orderDate, deliveryDate, deliveryAddress, notes,
       status: "Pending" | "Accepted" | "Rejected" | "In Transit" | "Delivered" | "Cancelled",
       expectedDelivery, vehicleNo }

   pelletListings   — created by Manufacturers, browsed by Power Plants
     { id, manufacturer, pelletType, grade, quantity, price, diameter (mm),
       length (mm), moisture (%), ashContent (%), calorificValue (kcal/kg),
       bulkDensity (kg/m3), location, availableFrom, certification,
       status: "Active" | "Inactive" | "Sold Out", createdAt }

   pelletOrders     — Power Plant → Manufacturer pellet orders
     { id, listingId, manufacturer, powerPlant, pelletType, grade, quantity,
       price, total, orderDate, deliveryDate, deliveryAddress, notes,
       status: same as purchaseOrders, expectedDelivery, vehicleNo }

   API:
     Store.get(key)               → array (seeds on first call)
     Store.set(key, array)
     Store.find(key, id)
     Store.add(key, item, prefix) → item with generated id + createdAt
     Store.update(key, id, patch) → updated item
     Store.remove(key, id)
     Store.nextId(key, prefix)    → e.g. "PO-B2051"
   Helpers:
     Store.esc(str)        escape for innerHTML
     Store.inr(n)          "₹1,25,000"
     Store.date(iso)       "13 Nov 2026"
     Store.badge(status)   badge css class for a status string
   Role-specific data (complaints, profile, etc.) should use keys
   prefixed with the role, e.g. "farmer_complaints".
========================================================= */

(function () {

    function iso(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    const SEED = {

        biomassListings: [
            { id: "BL-1001", farmer: "Ramesh Patil", biomassType: "Rice Husk", quantity: 40, unit: "Tons", price: 2000, location: "Nashik", district: "Nashik", state: "Maharashtra", availableFrom: iso(-5), moisture: 12, description: "Clean, dry rice husk stored under cover.", status: "Active", createdAt: iso(-10) },
            { id: "BL-1002", farmer: "Ramesh Patil", biomassType: "Wheat Straw", quantity: 25, unit: "Tons", price: 2150, location: "Niphad", district: "Nashik", state: "Maharashtra", availableFrom: iso(2), moisture: 14, description: "Baled wheat straw, ready for pickup.", status: "Active", createdAt: iso(-8) },
            { id: "BL-1003", farmer: "Sunita Jadhav", biomassType: "Sugarcane Bagasse", quantity: 60, unit: "Tons", price: 1800, location: "Baramati", district: "Pune", state: "Maharashtra", availableFrom: iso(0), moisture: 18, description: "Fresh bagasse from the current crushing season.", status: "Active", createdAt: iso(-6) },
            { id: "BL-1004", farmer: "Ramesh Patil", biomassType: "Cotton Stalk", quantity: 12, unit: "Tons", price: 1800, location: "Nashik", district: "Nashik", state: "Maharashtra", availableFrom: iso(-15), moisture: 10, description: "Shredded cotton stalk.", status: "Sold Out", createdAt: iso(-20) },
            { id: "BL-1005", farmer: "Vijay Shinde", biomassType: "Soybean Husk", quantity: 30, unit: "Tons", price: 2400, location: "Latur", district: "Latur", state: "Maharashtra", availableFrom: iso(5), moisture: 11, description: "Soybean husk, low ash content.", status: "Active", createdAt: iso(-3) }
        ],

        purchaseOrders: [
            { id: "PO-B2041", listingId: "BL-1001", farmer: "Ramesh Patil", manufacturer: "GreenPellet Industries", biomassType: "Rice Husk", quantity: 20, price: 2000, total: 40000, orderDate: iso(-2), deliveryDate: iso(6), deliveryAddress: "Plot 14, MIDC Ambad, Nashik 422010", notes: "", status: "Pending", expectedDelivery: iso(6), vehicleNo: "" },
            { id: "PO-B2042", listingId: "BL-1002", farmer: "Ramesh Patil", manufacturer: "EcoFuel Pellets Ltd", biomassType: "Wheat Straw", quantity: 15, price: 2150, total: 32250, orderDate: iso(-12), deliveryDate: iso(-4), deliveryAddress: "Gat 221, Chakan MIDC, Pune 410501", notes: "", status: "Delivered", expectedDelivery: iso(-4), vehicleNo: "MH15AB4521" },
            { id: "PO-B2043", listingId: "BL-1003", farmer: "Sunita Jadhav", manufacturer: "GreenPellet Industries", biomassType: "Sugarcane Bagasse", quantity: 30, price: 1800, total: 54000, orderDate: iso(-5), deliveryDate: iso(2), deliveryAddress: "Plot 14, MIDC Ambad, Nashik 422010", notes: "Deliver before noon", status: "In Transit", expectedDelivery: iso(2), vehicleNo: "MH42CD7810" },
            { id: "PO-B2044", listingId: "BL-1004", farmer: "Ramesh Patil", manufacturer: "GreenPellet Industries", biomassType: "Cotton Stalk", quantity: 12, price: 1800, total: 21600, orderDate: iso(-6), deliveryDate: iso(4), deliveryAddress: "Plot 14, MIDC Ambad, Nashik 422010", notes: "", status: "Accepted", expectedDelivery: iso(4), vehicleNo: "" }
        ],

        pelletListings: [
            { id: "PL-501", manufacturer: "GreenPellet Industries", pelletType: "Agro Residue Pellets", grade: "Premium", quantity: 120, price: 7800, diameter: 8, length: 30, moisture: 8, ashContent: 6, calorificValue: 4200, bulkDensity: 650, location: "Nashik, Maharashtra", availableFrom: iso(0), certification: "BIS IS 17583", status: "Active", createdAt: iso(-7) },
            { id: "PL-502", manufacturer: "GreenPellet Industries", pelletType: "Rice Husk Pellets", grade: "Standard", quantity: 80, price: 6900, diameter: 10, length: 35, moisture: 10, ashContent: 12, calorificValue: 3600, bulkDensity: 620, location: "Nashik, Maharashtra", availableFrom: iso(3), certification: "", status: "Active", createdAt: iso(-4) },
            { id: "PL-503", manufacturer: "EcoFuel Pellets Ltd", pelletType: "Bagasse Pellets", grade: "Premium", quantity: 200, price: 7500, diameter: 8, length: 28, moisture: 9, ashContent: 5, calorificValue: 4100, bulkDensity: 640, location: "Pune, Maharashtra", availableFrom: iso(-1), certification: "BIS IS 17583", status: "Active", createdAt: iso(-9) }
        ],

        pelletOrders: [
            { id: "PP-3008", listingId: "PL-501", manufacturer: "GreenPellet Industries", powerPlant: "NTPC Nashik Unit", pelletType: "Agro Residue Pellets", grade: "Premium", quantity: 50, price: 7800, total: 390000, orderDate: iso(-14), deliveryDate: iso(-3), deliveryAddress: "Eklahare, Nashik 422105", notes: "", status: "Delivered", expectedDelivery: iso(-3), vehicleNo: "MH15GH1122" },
            { id: "PP-3011", listingId: "PL-503", manufacturer: "EcoFuel Pellets Ltd", powerPlant: "NTPC Nashik Unit", pelletType: "Bagasse Pellets", grade: "Premium", quantity: 50, price: 7500, total: 375000, orderDate: iso(-4), deliveryDate: iso(4), deliveryAddress: "Eklahare, Nashik 422105", notes: "", status: "In Transit", expectedDelivery: iso(4), vehicleNo: "MH12KL5566" },
            { id: "PP-3012", listingId: "PL-502", manufacturer: "GreenPellet Industries", powerPlant: "NTPC Nashik Unit", pelletType: "Rice Husk Pellets", grade: "Standard", quantity: 40, price: 6900, total: 276000, orderDate: iso(-1), deliveryDate: iso(9), deliveryAddress: "Eklahare, Nashik 422105", notes: "", status: "Accepted", expectedDelivery: iso(9), vehicleNo: "" },
            { id: "PP-3013", listingId: "PL-501", manufacturer: "GreenPellet Industries", powerPlant: "Tata Power Trombay", pelletType: "Agro Residue Pellets", grade: "Premium", quantity: 30, price: 7800, total: 234000, orderDate: iso(0), deliveryDate: iso(10), deliveryAddress: "Trombay, Mumbai 400074", notes: "", status: "Pending", expectedDelivery: iso(10), vehicleNo: "" }
        ]
    };

    const PREFIX = { biomassListings: "BL-", purchaseOrders: "PO-B", pelletListings: "PL-", pelletOrders: "PP-" };

    function read(key) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return null;
    }

    function get(key) {
        let data = read(key);
        if (!Array.isArray(data)) {
            data = SEED[key] ? JSON.parse(JSON.stringify(SEED[key])) : [];
            if (SEED[key]) set(key, data);
        }
        return data;
    }

    function set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota / private mode */ }
    }

    function nextId(key, prefix) {
        prefix = prefix || PREFIX[key] || "ID-";
        const nums = get(key)
            .map(i => String(i.id || ""))
            .filter(id => id.startsWith(prefix))
            .map(id => parseInt(id.slice(prefix.length), 10))
            .filter(n => !isNaN(n));
        const next = nums.length ? Math.max(...nums) + 1 : 1001;
        return prefix + next;
    }

    function add(key, item, prefix) {
        const list = get(key);
        const record = Object.assign({ id: nextId(key, prefix), createdAt: iso(0) }, item);
        list.unshift(record);
        set(key, list);
        return record;
    }

    function find(key, id) {
        return get(key).find(i => i.id === id) || null;
    }

    function update(key, id, patch) {
        const list = get(key);
        const idx = list.findIndex(i => i.id === id);
        if (idx === -1) return null;
        list[idx] = Object.assign({}, list[idx], patch);
        set(key, list);
        return list[idx];
    }

    function remove(key, id) {
        set(key, get(key).filter(i => i.id !== id));
    }

    function esc(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function inr(n) {
        const num = Number(n);
        if (isNaN(num)) return n;
        return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }

    function date(isoStr) {
        if (!isoStr) return "—";
        const parts = String(isoStr).split("-").map(Number);
        if (parts.length !== 3) return isoStr;
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }

    function badge(status) {
        const s = String(status || "").toLowerCase();
        if (["delivered", "completed", "paid", "approved", "verified", "active", "resolved"].includes(s)) return "badge badge-success";
        if (["pending", "processing", "in review", "unpaid", "open", "under review"].includes(s)) return "badge badge-warning";
        if (["rejected", "cancelled", "blocked", "overdue", "failed", "suspended", "expired"].includes(s)) return "badge badge-danger";
        if (["accepted", "in transit", "dispatched", "shipped", "confirmed", "in progress"].includes(s)) return "badge badge-info";
        return "badge";
    }

    window.Store = { get, set, find, add, update, remove, nextId, esc, inr, date, badge, iso };

})();
