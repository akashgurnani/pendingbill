const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json({ limit: "5mb" }));
app.use("/images", express.static("images"));

if (!fs.existsSync("images")) fs.mkdirSync("images");

const db = new sqlite3.Database("data.db");

/* ---------- DB ---------- */
db.run(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_code TEXT,
  name TEXT,
  phone TEXT,
  created_at TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  barcode TEXT,
  image_path TEXT,
  scanned_at TEXT
)
`);

/* ---------- UI ---------- */
app.get("/", (req, res) => {
  db.all(`
    SELECT c.*, COUNT(s.id) AS total_scans
    FROM customers c
    LEFT JOIN scans s ON s.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.id DESC
  `, (err, customers) => {

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Customer Scanner</title>
<script src="https://unpkg.com/html5-qrcode"></script>
<style>
body { font-family: Arial; padding: 12px; }
input, button { width:100%; padding:12px; margin-top:8px; }
.customer { border:1px solid #ccc; padding:10px; margin-top:10px; }
.scans { display:none; margin-top:10px; }
img { max-width:100%; margin-top:5px; }
.modal {
  display:none; position:fixed; top:0; left:0;
  width:100%; height:100%; background:rgba(0,0,0,0.6);
}
.modal-content {
  background:#fff; margin:15% auto; padding:15px;
  width:90%; max-width:400px;
}
.delete { color:red; margin-top:5px; display:block; }
</style>
</head>
<body>

<h3>📦 Store Scanner</h3>

<input id="store" placeholder="Store Code">
<input id="name" placeholder="Customer Name">
<input id="phone" placeholder="Phone Number">
<button onclick="clearCustomer()">Clear Customer</button>

<div id="reader"></div>
<video id="video" autoplay playsinline style="display:none"></video>

<!-- CONFIRM MODAL -->
<div id="modal" class="modal">
  <div class="modal-content">
    <p><b>Barcode:</b> <span id="modalCode"></span></p>
    <img id="modalImg">
    <button onclick="confirmSave()">Confirm</button>
    <button onclick="closeModal()">Cancel</button>
  </div>
</div>

<hr>
<h4>Customers</h4>

${customers.map(c => `
<div class="customer" onclick="toggle(${c.id})">
<b>${c.store_code}</b><br>
${c.name} (${c.phone})<br>
🧾 ${c.total_scans} scans
</div>
<div class="scans" id="scans-${c.id}"></div>
`).join("")}

<script>
const store = document.getElementById("store");
const name = document.getElementById("name");
const phone = document.getElementById("phone");
const video = document.getElementById("video");
const modal = document.getElementById("modal");

store.value = localStorage.store || "";
name.value = localStorage.name || "";
phone.value = localStorage.phone || "";

store.oninput = () => localStorage.store = store.value;
name.oninput = () => localStorage.name = name.value;
phone.oninput = () => localStorage.phone = phone.value;

function clearCustomer() {
  localStorage.removeItem("name");
  localStorage.removeItem("phone");
  name.value = phone.value = "";
}

navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } })
  .then(s => video.srcObject = s);

let pendingBarcode = "";
let pendingImage = "";

function onScanSuccess(code) {
  if (!store.value || !name.value || !phone.value) {
    alert("Enter store, name and phone");
    return;
  }

  pendingBarcode = code;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  pendingImage = canvas.toDataURL("image/jpeg");

  document.getElementById("modalCode").innerText = code;
  document.getElementById("modalImg").src = pendingImage;
  modal.style.display = "block";
}

function closeModal() {
  modal.style.display = "none";
}

function confirmSave() {
  fetch("/scan", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      store: store.value,
      name: name.value,
      phone: phone.value,
      barcode: pendingBarcode,
      image: pendingImage
    })
  }).then(() => location.reload());
}

function toggle(id) {
  const div = document.getElementById("scans-" + id);
  if (div.innerHTML === "") {
    fetch("/scans/" + id)
      .then(r => r.text())
      .then(html => div.innerHTML = html);
  }
  div.style.display = div.style.display === "none" ? "block" : "none";
}

new Html5Qrcode("reader").start(
  { facingMode:"environment" },
  { fps:10, qrbox:250 },
  onScanSuccess
);
</script>

</body>
</html>
`);
  });
});

/* ---------- LIST SCANS ---------- */
app.get("/scans/:id", (req, res) => {
  db.all(
    "SELECT * FROM scans WHERE customer_id=? ORDER BY id DESC",
    [req.params.id],
    (err, rows) => {
      res.send(rows.map(r => `
<div>
<b>${r.barcode}</b><br>
<img src="/${r.image_path}">
<a class="delete" href="/delete-scan/${r.id}">Delete</a>
</div>
`).join(""));
    }
  );
});

/* ---------- DELETE SCAN ---------- */
app.get("/delete-scan/:id", (req, res) => {
  db.get(
    "SELECT image_path FROM scans WHERE id=?",
    [req.params.id],
    (err, row) => {
      if (row && fs.existsSync(row.image_path)) fs.unlinkSync(row.image_path);
      db.run("DELETE FROM scans WHERE id=?", [req.params.id], () =>
        res.redirect("/")
      );
    }
  );
});

/* ---------- SAVE SCAN ---------- */
app.post("/scan", (req, res) => {
  const { store, name, phone, barcode, image } = req.body;
  const now = new Date().toISOString();

  db.get(
    "SELECT id FROM customers WHERE store_code=? AND name=? AND phone=?",
    [store, name, phone],
    (err, customer) => {

      const imgPath = `images/${Date.now()}.jpg`;
      fs.writeFileSync(imgPath, image.split(",")[1], "base64");

      if (customer) {
        db.run(
          "INSERT INTO scans (customer_id, barcode, image_path, scanned_at) VALUES (?,?,?,?)",
          [customer.id, barcode, imgPath, now]
        );
      } else {
        db.run(
          "INSERT INTO customers (store_code, name, phone, created_at) VALUES (?,?,?,?)",
          [store, name, phone, now],
          function () {
            db.run(
              "INSERT INTO scans (customer_id, barcode, image_path, scanned_at) VALUES (?,?,?,?)",
              [this.lastID, barcode, imgPath, now]
            );
          }
        );
      }
      res.sendStatus(200);
    }
  );
});

app.listen(PORT, () => console.log("Running on", PORT));
