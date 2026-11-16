/* =========================================================
   BIOMASS CONNECT — ADMIN SHARED HELPERS
   ---------------------------------------------------------
   Loaded on every admin page after the common scripts
   (toast, validation, store, layout) and before the page script.

   Admin-private collections (seeded on first use):
     admin_users          { id, name, role, email, mobile, location, state,
                            status: Active|Pending|Blocked|Rejected, joined,
                            blockReason, blockedOn }
     admin_verifications  { id, role: farmer|manufacturer|powerplant, name,
                            email, mobile, location, district, state,
                            submitted, status: Pending|Approved|Rejected,
                            details{}, docs[{type, number, file, size}],
                            reviewedOn, reviewedBy, reasonCategory, reason }
     admin_disputes       { id, raisedBy, raisedByRole, against, againstRole,
                            orderId, orderValue, category, description,
                            priority, status: Open|In Review|Resolved, date,
                            assignedTo, history[], resolution{} }
     admin_audit_logs     { id, timestamp "YYYY-MM-DD HH:MM", user, role,
                            action, module, ip }
     admin_certificates   { id, plant, periodFrom, periodTo, coFiredTons,
                            coFiringPct, issueDate, validUntil, remarks }
     admin_impact         { id, month "YYYY-MM", state, district, coalSaved,
                            wasteUtilised, co2Avoided, incidentsPrevented,
                            remarks, createdAt }
     admin_order_flags    { orderId, reason, flaggedOn, by }
     admin_settings       object (see setting.js)

   API (window.Admin):
     Admin.get(key) / Admin.set(key, list)
     Admin.log(action, module)        → appends to admin_audit_logs
     Admin.adminName()
     Admin.allOrders()                → biomass + pellet orders, normalised
     Admin.isActiveOrder(o)
     Admin.now() / Admin.dateTime(stamp)
     Admin.openModal(id) / Admin.closeModal(idOrEl)
     Admin.exportCSV(filename, headers, rows)
     Admin.download(filename, content, mime)
     Admin.initials(name)
     Admin.ROLE_LABEL
========================================================= */

(function () {

    const iso = Store.iso;

    const ROLE_LABEL = { farmer: "Farmer", manufacturer: "Manufacturer", powerplant: "Power Plant" };

    function stamp(offsetDays, time) { return iso(offsetDays) + " " + time; }

    function monthsAgo(n) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - n);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }

    /* ---------------- Verification seed ---------------- */

    function farmerDocs(slug, aadhaar) {
        return [
            { type: "Aadhaar Card", number: aadhaar, file: "aadhaar_" + slug + ".pdf", size: "386 KB" },
            { type: "Land Record (7/12 Extract)", number: "Survey No. " + (100 + slug.length * 7), file: "land_record_" + slug + ".pdf", size: "512 KB" },
            { type: "Bank Passbook", number: "A/c ending " + (4000 + slug.length * 37), file: "passbook_" + slug + ".jpg", size: "244 KB" }
        ];
    }

    function manufacturerDocs(slug, gstin, pan) {
        return [
            { type: "GST Certificate", number: gstin, file: "gst_" + slug + ".pdf", size: "412 KB" },
            { type: "PAN Card", number: pan, file: "pan_" + slug + ".pdf", size: "198 KB" },
            { type: "Factory Licence", number: "FL/MH/" + (2400 + slug.length * 11), file: "factory_licence_" + slug + ".pdf", size: "640 KB" },
            { type: "Pollution Consent (CTO)", number: "MPCB-CTO-" + (5100 + slug.length * 13), file: "pollution_consent_" + slug + ".pdf", size: "720 KB" }
        ];
    }

    function powerplantDocs(slug, gstin) {
        return [
            { type: "GST Certificate", number: gstin, file: "gst_" + slug + ".pdf", size: "405 KB" },
            { type: "Environmental Clearance", number: "EC/MoEFCC/" + (8800 + slug.length * 17), file: "environmental_clearance_" + slug + ".pdf", size: "1.2 MB" },
            { type: "SPCB Consent to Operate", number: "SPCB-CTO-" + (6200 + slug.length * 19), file: "spcb_consent_" + slug + ".pdf", size: "830 KB" }
        ];
    }

    const VERIFICATIONS = [
        // Farmers
        { id: "VER-1001", role: "farmer", name: "Mahesh Pawar", email: "mahesh.pawar@gmail.com", mobile: "9876501234", location: "Niphad", district: "Nashik", state: "Maharashtra", submitted: iso(-1), status: "Pending",
          details: { aadhaar: "XXXX XXXX 4521", landArea: 6.5, crops: "Rice, Wheat" }, docs: farmerDocs("mahesh_pawar", "XXXX XXXX 4521") },
        { id: "VER-1002", role: "farmer", name: "Anita Kale", email: "anita.kale@gmail.com", mobile: "9823107654", location: "Sinnar", district: "Nashik", state: "Maharashtra", submitted: iso(-2), status: "Pending",
          details: { aadhaar: "XXXX XXXX 7810", landArea: 4, crops: "Sugarcane" }, docs: farmerDocs("anita_kale", "XXXX XXXX 7810") },
        { id: "VER-1003", role: "farmer", name: "Prakash More", email: "prakash.more@yahoo.com", mobile: "9960234517", location: "Indapur", district: "Pune", state: "Maharashtra", submitted: iso(-3), status: "Pending",
          details: { aadhaar: "XXXX XXXX 3307", landArea: 9.25, crops: "Cotton, Soybean" }, docs: farmerDocs("prakash_more", "XXXX XXXX 3307") },
        { id: "VER-1004", role: "farmer", name: "Savita Gaikwad", email: "savita.gaikwad@gmail.com", mobile: "9881456023", location: "Kopargaon", district: "Ahmednagar", state: "Maharashtra", submitted: iso(-32), status: "Approved", reviewedOn: iso(-30), reviewedBy: "System Admin",
          details: { aadhaar: "XXXX XXXX 6642", landArea: 5.5, crops: "Wheat, Maize" }, docs: farmerDocs("savita_gaikwad", "XXXX XXXX 6642") },
        { id: "VER-1005", role: "farmer", name: "Ramesh Patil", email: "ramesh.patil@gmail.com", mobile: "9822014587", location: "Nashik", district: "Nashik", state: "Maharashtra", submitted: iso(-182), status: "Approved", reviewedOn: iso(-180), reviewedBy: "System Admin",
          details: { aadhaar: "XXXX XXXX 1185", landArea: 12, crops: "Rice, Wheat, Cotton" }, docs: farmerDocs("ramesh_patil", "XXXX XXXX 1185") },
        { id: "VER-1006", role: "farmer", name: "Dattatray Bhosale", email: "datta.bhosale@gmail.com", mobile: "9730562148", location: "Phaltan", district: "Satara", state: "Maharashtra", submitted: iso(-11), status: "Rejected", reviewedOn: iso(-10), reviewedBy: "System Admin",
          reasonCategory: "Document unclear", reason: "Aadhaar card image is blurred and the name does not match the land record.",
          details: { aadhaar: "XXXX XXXX 9024", landArea: 3, crops: "Jowar" }, docs: farmerDocs("dattatray_bhosale", "XXXX XXXX 9024") },

        // Manufacturers
        { id: "VER-2001", role: "manufacturer", name: "Shree Agro Pellets", email: "info@shreeagropellets.in", mobile: "9823001122", location: "MIDC Jalgaon", district: "Jalgaon", state: "Maharashtra", submitted: iso(-1), status: "Pending",
          details: { gstin: "27AAKCS1234M1Z2", pan: "AAKCS1234M", capacity: 40 }, docs: manufacturerDocs("shree_agro", "27AAKCS1234M1Z2", "AAKCS1234M") },
        { id: "VER-2002", role: "manufacturer", name: "BioCarbon Fuels", email: "contact@biocarbonfuels.com", mobile: "9890456712", location: "Waluj MIDC", district: "Aurangabad", state: "Maharashtra", submitted: iso(-3), status: "Pending",
          details: { gstin: "27AAHCB5521Q1Z7", pan: "AAHCB5521Q", capacity: 25 }, docs: manufacturerDocs("biocarbon", "27AAHCB5521Q1Z7", "AAHCB5521Q") },
        { id: "VER-2003", role: "manufacturer", name: "GreenPellet Industries", email: "contact@greenpellet.in", mobile: "9823456712", location: "MIDC Ambad", district: "Nashik", state: "Maharashtra", submitted: iso(-204), status: "Approved", reviewedOn: iso(-202), reviewedBy: "System Admin",
          details: { gstin: "27AACCG4410L1Z4", pan: "AACCG4410L", capacity: 60 }, docs: manufacturerDocs("greenpellet", "27AACCG4410L1Z4", "AACCG4410L") },
        { id: "VER-2004", role: "manufacturer", name: "Sahyadri Briquettes", email: "sahyadri.briquettes@gmail.com", mobile: "9767334410", location: "Kurkumbh MIDC", district: "Pune", state: "Maharashtra", submitted: iso(-16), status: "Rejected", reviewedOn: iso(-15), reviewedBy: "System Admin",
          reasonCategory: "Expired document", reason: "Pollution consent certificate has expired; please upload a valid Consent to Operate.",
          details: { gstin: "27AAPFS7788D1Z1", pan: "AAPFS7788D", capacity: 18 }, docs: manufacturerDocs("sahyadri", "27AAPFS7788D1Z1", "AAPFS7788D") },

        // Power plants
        { id: "VER-3001", role: "powerplant", name: "Mahagenco Koradi TPS", email: "koradi.fuel@mahagenco.in", mobile: "9420112233", location: "Koradi", district: "Nagpur", state: "Maharashtra", submitted: iso(-2), status: "Pending",
          details: { gstin: "27AABCM5678K1Z9", capacity: 2400, target: 5 }, docs: powerplantDocs("koradi", "27AABCM5678K1Z9") },
        { id: "VER-3002", role: "powerplant", name: "JSW Energy Ratnagiri", email: "fuel.ratnagiri@jsw.in", mobile: "9422876510", location: "Jaigad", district: "Ratnagiri", state: "Maharashtra", submitted: iso(-5), status: "Pending",
          details: { gstin: "27AAACJ3344R1Z6", capacity: 1200, target: 7 }, docs: powerplantDocs("jsw_ratnagiri", "27AAACJ3344R1Z6") },
        { id: "VER-3003", role: "powerplant", name: "NTPC Nashik Unit", email: "procurement.nashik@ntpc.co.in", mobile: "9422334455", location: "Eklahare", district: "Nashik", state: "Maharashtra", submitted: iso(-214), status: "Approved", reviewedOn: iso(-212), reviewedBy: "System Admin",
          details: { gstin: "27AAACN0255D1ZQ", capacity: 630, target: 5 }, docs: powerplantDocs("ntpc_nashik", "27AAACN0255D1ZQ") },
        { id: "VER-3004", role: "powerplant", name: "Adani Power Tiroda", email: "biomass.tiroda@adani.com", mobile: "9370665412", location: "Tiroda", district: "Gondia", state: "Maharashtra", submitted: iso(-21), status: "Rejected", reviewedOn: iso(-20), reviewedBy: "System Admin",
          reasonCategory: "Invalid document", reason: "Environmental clearance letter does not cover biomass co-firing; resubmit the amended clearance.",
          details: { gstin: "27AAECA1122H1Z3", capacity: 3300, target: 5 }, docs: powerplantDocs("adani_tiroda", "27AAECA1122H1Z3") }
    ];

    /* ---------------- Users seed ---------------- */

    const BASE_USERS = [
        { name: "Ramesh Patil", role: "Farmer", email: "ramesh.patil@gmail.com", mobile: "9822014587", location: "Nashik", state: "Maharashtra", status: "Active", joined: iso(-180) },
        { name: "Sunita Jadhav", role: "Farmer", email: "sunita.jadhav@gmail.com", mobile: "9765432108", location: "Baramati", state: "Maharashtra", status: "Active", joined: iso(-150) },
        { name: "Vijay Shinde", role: "Farmer", email: "vijay.shinde@yahoo.com", mobile: "9850123476", location: "Latur", state: "Maharashtra", status: "Active", joined: iso(-120) },
        { name: "Kiran Deshmukh", role: "Farmer", email: "kiran.deshmukh@gmail.com", mobile: "9921345670", location: "Ahmednagar", state: "Maharashtra", status: "Blocked", joined: iso(-90),
          blockReason: "Repeatedly listed biomass that was not available for pickup.", blockedOn: iso(-14) },
        { name: "GreenPellet Industries", role: "Manufacturer", email: "contact@greenpellet.in", mobile: "9823456712", location: "Nashik", state: "Maharashtra", status: "Active", joined: iso(-200) },
        { name: "EcoFuel Pellets Ltd", role: "Manufacturer", email: "info@ecofuelpellets.com", mobile: "9890011223", location: "Pune", state: "Maharashtra", status: "Active", joined: iso(-160) },
        { name: "NTPC Nashik Unit", role: "Power Plant", email: "procurement.nashik@ntpc.co.in", mobile: "9422334455", location: "Nashik", state: "Maharashtra", status: "Active", joined: iso(-210) },
        { name: "Tata Power Trombay", role: "Power Plant", email: "biomass.trombay@tatapower.com", mobile: "9819988776", location: "Mumbai", state: "Maharashtra", status: "Active", joined: iso(-140) }
    ];

    function usersSeed() {
        const list = BASE_USERS.map(u => Object.assign({}, u));
        VERIFICATIONS.forEach(v => {
            if (list.some(u => u.email === v.email)) return;
            list.push({
                name: v.name, role: ROLE_LABEL[v.role], email: v.email, mobile: v.mobile,
                location: v.district, state: v.state,
                status: v.status === "Approved" ? "Active" : v.status,
                joined: v.submitted
            });
        });
        return list
            .sort((a, b) => a.joined.localeCompare(b.joined))
            .map((u, i) => Object.assign({ id: "USR-" + (1001 + i) }, u))
            .reverse();
    }

    /* ---------------- Disputes seed ---------------- */

    const DISPUTES = [
        { id: "DSP-1006", raisedBy: "NTPC Nashik Unit", raisedByRole: "Power Plant", against: "EcoFuel Pellets Ltd", againstRole: "Manufacturer", orderId: "PP-3005", orderValue: 298000,
          category: "Quality Issue", priority: "High", status: "Open", date: iso(0), assignedTo: "",
          description: "Lab report shows 14% ash content against the 5% declared in the listing. Requesting replacement or price adjustment.",
          history: [{ status: "Open", date: iso(0), note: "Dispute raised by NTPC Nashik Unit" }] },
        { id: "DSP-1005", raisedBy: "Sunita Jadhav", raisedByRole: "Farmer", against: "GreenPellet Industries", againstRole: "Manufacturer", orderId: "PO-B2043", orderValue: 54000,
          category: "Payment Delay", priority: "Medium", status: "Open", date: iso(-2), assignedTo: "",
          description: "The agreed 30% advance has not been received even though the bagasse has already been dispatched.",
          history: [{ status: "Open", date: iso(-2), note: "Dispute raised by Sunita Jadhav" }] },
        { id: "DSP-1004", raisedBy: "EcoFuel Pellets Ltd", raisedByRole: "Manufacturer", against: "Ramesh Patil", againstRole: "Farmer", orderId: "PO-B2042", orderValue: 32250,
          category: "Quantity Mismatch", priority: "Medium", status: "In Review", date: iso(-3), assignedTo: "Anita Desai (Operations)",
          description: "Weighbridge slip shows 13.6 tons of wheat straw received against the ordered 15 tons.",
          history: [
              { status: "Open", date: iso(-3), note: "Dispute raised by EcoFuel Pellets Ltd" },
              { status: "In Review", date: iso(-2), note: "Assigned to Anita Desai (Operations)" }
          ] },
        { id: "DSP-1003", raisedBy: "NTPC Nashik Unit", raisedByRole: "Power Plant", against: "GreenPellet Industries", againstRole: "Manufacturer", orderId: "PP-3008", orderValue: 390000,
          category: "Quality Issue", priority: "High", status: "In Review", date: iso(-2), assignedTo: "Rahul Mehta (Quality)",
          description: "Delivered pellets had moisture above 12% against the agreed 8%, causing boiler feed issues.",
          history: [
              { status: "Open", date: iso(-2), note: "Dispute raised by NTPC Nashik Unit" },
              { status: "In Review", date: iso(-1), note: "Assigned to Rahul Mehta (Quality)" }
          ] },
        { id: "DSP-1002", raisedBy: "Tata Power Trombay", raisedByRole: "Power Plant", against: "EcoFuel Pellets Ltd", againstRole: "Manufacturer", orderId: "PP-2994", orderValue: 312000,
          category: "Delayed Delivery", priority: "Medium", status: "Resolved", date: iso(-20), assignedTo: "Anita Desai (Operations)",
          description: "Consignment was delivered 9 days after the committed date without any prior intimation.",
          resolution: { type: "Penalty on seller", notes: "Late delivery penalty of 2% applied as per platform terms; seller has been warned.", refund: 6240, date: iso(-12), by: "System Admin" },
          history: [
              { status: "Open", date: iso(-20), note: "Dispute raised by Tata Power Trombay" },
              { status: "In Review", date: iso(-18), note: "Assigned to Anita Desai (Operations)" },
              { status: "Resolved", date: iso(-12), note: "Penalty on seller" }
          ] },
        { id: "DSP-1001", raisedBy: "Vijay Shinde", raisedByRole: "Farmer", against: "GreenPellet Industries", againstRole: "Manufacturer", orderId: "PO-B2031", orderValue: 48000,
          category: "Payment Delay", priority: "Low", status: "Resolved", date: iso(-34), assignedTo: "Rahul Mehta (Finance)",
          description: "Final payment for soybean husk was pending for more than 15 days after delivery.",
          resolution: { type: "Mutual settlement", notes: "Manufacturer released the full payment after mediation; both parties agreed to close.", refund: 0, date: iso(-28), by: "System Admin" },
          history: [
              { status: "Open", date: iso(-34), note: "Dispute raised by Vijay Shinde" },
              { status: "In Review", date: iso(-33), note: "Assigned to Rahul Mehta (Finance)" },
              { status: "Resolved", date: iso(-28), note: "Mutual settlement" }
          ] }
    ];

    /* ---------------- Audit log seed ---------------- */

    const LOG_ROWS = [
        [0, "09:12", "System Admin", "Admin", "Logged in to admin console", "Authentication", "10.0.4.21"],
        [0, "08:40", "NTPC Nashik Unit", "Power Plant", "Raised dispute DSP-1006 on order PP-3005", "Disputes", "103.21.58.14"],
        [0, "07:55", "Tata Power Trombay", "Power Plant", "Placed pellet order PP-3013", "Orders", "49.36.112.8"],
        [-1, "17:05", "GreenPellet Industries", "Manufacturer", "Accepted pellet order PP-3012", "Orders", "117.198.40.77"],
        [-1, "11:30", "Mahesh Pawar", "Farmer", "Submitted registration documents", "Verification", "157.33.21.190"],
        [-1, "10:02", "Shree Agro Pellets", "Manufacturer", "Submitted registration documents", "Verification", "106.210.14.62"],
        [-2, "16:48", "System Admin", "Admin", "Assigned dispute DSP-1004 to Anita Desai (Operations)", "Disputes", "10.0.4.21"],
        [-2, "14:20", "GreenPellet Industries", "Manufacturer", "Placed purchase order PO-B2041", "Orders", "117.198.40.77"],
        [-2, "12:15", "Anita Kale", "Farmer", "Submitted registration documents", "Verification", "152.58.92.17"],
        [-2, "09:30", "Mahagenco Koradi TPS", "Power Plant", "Submitted registration documents", "Verification", "14.139.60.5"],
        [-3, "18:10", "EcoFuel Pellets Ltd", "Manufacturer", "Raised dispute DSP-1004 on order PO-B2042", "Disputes", "103.87.144.9"],
        [-3, "15:42", "Prakash More", "Farmer", "Submitted registration documents", "Verification", "157.48.11.203"],
        [-4, "11:05", "Ramesh Patil", "Farmer", "Updated biomass listing BL-1002", "Listings", "152.58.70.41"],
        [-5, "13:27", "GreenPellet Industries", "Manufacturer", "Placed purchase order PO-B2043", "Orders", "117.198.40.77"],
        [-5, "10:18", "JSW Energy Ratnagiri", "Power Plant", "Submitted registration documents", "Verification", "45.112.64.30"],
        [-6, "16:33", "Ramesh Patil", "Farmer", "Accepted purchase order PO-B2044", "Orders", "152.58.70.41"],
        [-7, "12:50", "GreenPellet Industries", "Manufacturer", "Created pellet listing PL-501", "Listings", "117.198.40.77"],
        [-10, "15:05", "System Admin", "Admin", "Rejected farmer verification VER-1006", "Verification", "10.0.4.21"],
        [-12, "11:40", "System Admin", "Admin", "Resolved dispute DSP-1002 (Penalty on seller)", "Disputes", "10.0.4.21"],
        [-14, "17:22", "System Admin", "Admin", "Blocked user Kiran Deshmukh", "Users", "10.0.4.21"],
        [-15, "10:11", "System Admin", "Admin", "Rejected manufacturer verification VER-2004", "Verification", "10.0.4.21"],
        [-18, "09:47", "System Admin", "Admin", "Updated platform settings", "Settings", "10.0.4.21"],
        [-20, "14:36", "System Admin", "Admin", "Rejected power plant verification VER-3004", "Verification", "10.0.4.21"],
        [-25, "16:02", "System Admin", "Admin", "Recorded environmental impact data", "Reports", "10.0.4.21"],
        [-30, "11:28", "System Admin", "Admin", "Approved farmer verification VER-1004", "Verification", "10.0.4.21"]
    ];

    function logsSeed() {
        return LOG_ROWS.map((r, i) => ({
            id: "LOG-" + (1000 + LOG_ROWS.length - i),
            timestamp: stamp(r[0], r[1]), user: r[2], role: r[3], action: r[4], module: r[5], ip: r[6]
        }));
    }

    /* ---------------- Certificates seed ---------------- */

    const CERTIFICATES = [
        { id: "CERT-1003", plant: "Tata Power Trombay", periodFrom: iso(-150), periodTo: iso(-60), coFiredTons: 920, coFiringPct: 4.2, issueDate: iso(-55), validUntil: iso(310), remarks: "Below the 5% co-firing mandate; improvement plan submitted.", createdAt: iso(-55) },
        { id: "CERT-1002", plant: "NTPC Nashik Unit", periodFrom: iso(-200), periodTo: iso(-110), coFiredTons: 1850, coFiringPct: 5.6, issueDate: iso(-100), validUntil: iso(265), remarks: "", createdAt: iso(-100) },
        { id: "CERT-1001", plant: "NTPC Nashik Unit", periodFrom: iso(-560), periodTo: iso(-470), coFiredTons: 1320, coFiringPct: 5.1, issueDate: iso(-460), validUntil: iso(-95), remarks: "", createdAt: iso(-460) }
    ];

    /* ---------------- Environmental impact seed ---------------- */

    function impactSeed() {
        const regions = [
            { state: "Maharashtra", district: "Nashik", base: 1180 },
            { state: "Punjab", district: "Ludhiana", base: 1640 },
            { state: "Haryana", district: "Karnal", base: 920 }
        ];
        const rows = [];
        let n = 1001;
        for (let m = 5; m >= 0; m--) {
            regions.forEach((r, i) => {
                if (m === 0 && i === 2) return; // current month: Haryana not reported yet
                const factor = 1 + ((5 - m) * 0.07) + (i * 0.03);
                const coal = Math.round(r.base * factor * 100) / 100;
                rows.push({
                    id: "IMP-" + (n++),
                    month: monthsAgo(m),
                    state: r.state,
                    district: r.district,
                    coalSaved: coal,
                    wasteUtilised: Math.round(coal * 1.62 * 100) / 100,
                    co2Avoided: Math.round(coal * 1.87 * 100) / 100,
                    incidentsPrevented: Math.round(coal / 28),
                    remarks: "",
                    createdAt: iso(-m * 30)
                });
            });
        }
        return rows.reverse();
    }

    /* ---------------- Seeding ---------------- */

    const SEED = {
        admin_users: usersSeed,
        admin_verifications: () => VERIFICATIONS,
        admin_disputes: () => DISPUTES,
        admin_audit_logs: logsSeed,
        admin_certificates: () => CERTIFICATES,
        admin_impact: impactSeed,
        admin_order_flags: () => []
    };

    function seed(key) {
        let raw = null;
        try { raw = localStorage.getItem(key); } catch (e) { /* storage unavailable */ }
        if (raw === null && SEED[key]) Store.set(key, JSON.parse(JSON.stringify(SEED[key]())));
    }

    Object.keys(SEED).forEach(seed);

    function get(key) {
        seed(key);
        return Store.get(key);
    }

    function set(key, list) {
        Store.set(key, list);
    }

    /* ---------------- Profile / audit ---------------- */

    function adminName() {
        try {
            const p = JSON.parse(localStorage.getItem("bc_profile_admin"));
            if (p && p.name) return p.name;
        } catch (e) { /* ignore */ }
        return "System Admin";
    }

    function pad(n) { return String(n).padStart(2, "0"); }

    function now() {
        const d = new Date();
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function dateTime(ts) {
        if (!ts) return "—";
        const parts = String(ts).split(" ");
        return Store.date(parts[0]) + (parts[1] ? ", " + parts[1] : "");
    }

    function log(action, module) {
        return Store.add("admin_audit_logs", {
            timestamp: now(),
            user: adminName(),
            role: "Admin",
            action: action,
            module: module,
            ip: "10.0.4.21"
        }, "LOG-");
    }

    /* ---------------- Orders (biomass + pellet) ---------------- */

    function allOrders() {
        const bio = Store.get("purchaseOrders").map(o => ({
            id: o.id, type: "Biomass", buyer: o.manufacturer, buyerRole: "Manufacturer",
            seller: o.farmer, sellerRole: "Farmer", product: o.biomassType,
            quantity: Number(o.quantity) || 0, price: Number(o.price) || 0, total: Number(o.total) || 0,
            orderDate: o.orderDate, deliveryDate: o.expectedDelivery || o.deliveryDate,
            status: o.status, address: o.deliveryAddress, vehicleNo: o.vehicleNo, notes: o.notes
        }));
        const pellet = Store.get("pelletOrders").map(o => ({
            id: o.id, type: "Pellet", buyer: o.powerPlant, buyerRole: "Power Plant",
            seller: o.manufacturer, sellerRole: "Manufacturer",
            product: o.pelletType + (o.grade ? " (" + o.grade + ")" : ""),
            quantity: Number(o.quantity) || 0, price: Number(o.price) || 0, total: Number(o.total) || 0,
            orderDate: o.orderDate, deliveryDate: o.expectedDelivery || o.deliveryDate,
            status: o.status, address: o.deliveryAddress, vehicleNo: o.vehicleNo, notes: o.notes
        }));
        return bio.concat(pellet).sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
    }

    function isActiveOrder(o) {
        return ["Pending", "Accepted", "In Transit"].includes(o.status);
    }

    function isBillable(o) {
        return !["Rejected", "Cancelled"].includes(o.status);
    }

    /* ---------------- Modals ---------------- */

    function modalEl(idOrEl) {
        return typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    }

    function openModal(idOrEl) {
        const m = modalEl(idOrEl);
        if (!m) return;
        m.classList.add("open");
        m.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        const field = m.querySelector("form input:not([type=hidden]):not([readonly]):not([type=checkbox]), form select, form textarea");
        if (field) setTimeout(() => field.focus(), 60);
    }

    function closeModal(idOrEl) {
        const m = modalEl(idOrEl);
        if (!m) return;
        m.classList.remove("open");
        m.setAttribute("aria-hidden", "true");
        m.querySelectorAll("form").forEach(f => Validator.reset(f));
        if (!document.querySelector(".modal-backdrop.open:not(.confirm-dialog)")) document.body.style.overflow = "";
    }

    document.addEventListener("click", e => {
        const closer = e.target.closest("[data-close]");
        if (closer) {
            const m = closer.closest(".modal-backdrop");
            if (m) closeModal(m);
            return;
        }
        if (e.target.classList && e.target.classList.contains("modal-backdrop") && !e.target.classList.contains("confirm-dialog")) {
            closeModal(e.target);
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key !== "Escape" || document.querySelector(".confirm-dialog")) return;
        const open = document.querySelectorAll(".modal-backdrop.open:not(.confirm-dialog)");
        if (open.length) closeModal(open[open.length - 1]);
    });

    /* ---------------- Files ---------------- */

    function download(filename, content, mime) {
        const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    function exportCSV(filename, headers, rows) {
        const cell = v => {
            const s = String(v == null ? "" : v);
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const csv = [headers].concat(rows).map(r => r.map(cell).join(",")).join("\r\n");
        download(filename, "﻿" + csv, "text/csv;charset=utf-8");
    }

    function initials(name) {
        return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
    }

    window.Admin = {
        ROLE_LABEL,
        get, set, log, adminName,
        now, dateTime, monthsAgo,
        allOrders, isActiveOrder, isBillable,
        openModal, closeModal,
        download, exportCSV, initials
    };

})();
