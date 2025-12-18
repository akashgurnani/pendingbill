const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.urlencoded({ extended: false }));

const db = new sqlite3.Database("data.db");

db.run(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    name TEXT,
    phone TEXT,
    barcode TEXT
  )
`);

app.get("/", (req, res) => {
  db.all("SELECT * FROM records ORDER BY id DESC", (err, rows) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phone Barcode Scanner</title>
<script src="https://unpkg.com/html5-qrcode"></script>
<style>
body { font-family: Arial; padding: 15px; }
input { width: 100%; padding: 12px; margin-top: 10px; font-size: 16px; }
#reader { width: 100%; margin-top: 15px; }
.card { border: 1px solid #ddd; padding: 10px; margin-top: 10px; }
.small { font-size: 12px; color: #555; }
</style>
</head>
<body>

<h2>📱 Customer Barcode Scanner</h2>

<input id="name" placeholder="Customer Name">
<input id="phone" placeholder="Phone Number">

<div id="reader"></div>
<div id="status" class="small"></div>

<h3>Recent Scans</h3>

${rows.map(r => `
<div class="card">
  <div class="small">${r.timestamp}</div>
  <b>${r.name}</b> (${r.phone})<br>
  Barcode: ${r.barcode}<br>
  <a href="/delete/${r.id}">Delete</a>
</div>
`).join("")}

<script>
function onScanSuccess(text) {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;

  if (!name || !phone) {
    alert("Enter name and phone first");
    return;
  }

  fetch("/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "name=" + encodeURIComponent(name) +
          "&phone=" + encodeURIComponent(phone) +
          "&barcode=" + encodeURIComponent(text)
  }).then(() => location.reload());
}

new Html5Qrcode("reader").start(
  { facingMode: "environment" },
  { fps: 10, qrbox: 250 },
  onScanSuccess
);
</script>

</body>
</html>
    `);
  });
});

app.post("/add", (req, res) => {
  const { name, phone, barcode } = req.body;
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);

  db.run(
    "INSERT INTO records (timestamp, name, phone, barcode) VALUES (?,?,?,?)",
    [ts, name, phone, barcode],
    () => res.sendStatus(200)
  );
});

app.get("/delete/:id", (req, res) => {
  db.run("DELETE FROM records WHERE id=?", req.params.id, () => res.redirect("/"));
});

app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
