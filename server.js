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

db.run(`
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  store_code TEXT,
  name TEXT,
  phone TEXT,
  barcode TEXT,
  image_path TEXT
)
`);

app.get("/", (req, res) => {
  db.all("SELECT * FROM records ORDER BY id DESC", (err, rows) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barcode Scanner</title>
<script src="https://unpkg.com/html5-qrcode"></script>
<style>
body { font-family: Arial; padding: 12px; }
input, button { width: 100%; padding: 12px; margin-top: 8px; }
#reader { margin-top: 10px; }
.card { border: 1px solid #ccc; padding: 8px; margin-top: 8px; }
img { max-width: 100%; }
</style>
</head>
<body>

<h3>📦 Store Barcode Scanner</h3>

<input id="store" placeholder="Store Code">
<input id="name" placeholder="Customer Name">
<input id="phone" placeholder="Phone Number">
<button onclick="clearCustomer()">Clear Customer</button>

<div id="reader"></div>

<video id="video" autoplay playsinline style="display:none;"></video>

<div id="confirm" style="display:none;">
  <p><b>Barcode:</b> <span id="code"></span></p>
  <img id="preview">
  <button onclick="confirmSave()">Confirm Save</button>
</div>

<h4>Recent</h4>

${rows.map(r => `
<div class="card">
<b>${r.store_code}</b><br>
${r.name} (${r.phone})<br>
${r.barcode}<br>
<img src="${r.image_path}">
</div>
`).join("")}

<script>
const store = document.getElementById("store");
const name = document.getElementById("name");
const phone = document.getElementById("phone");
const video = document.getElementById("video");

store.value = localStorage.store || "";
name.value = localStorage.name || "";
phone.value = localStorage.phone || "";

store.oninput = () => localStorage.store = store.value;
name.oninput = () => localStorage.name = name.value;
phone.oninput = () => localStorage.phone = phone.value;

function clearCustomer() {
  localStorage.removeItem("name");
  localStorage.removeItem("phone");
  name.value = "";
  phone.value = "";
}

navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
  .then(stream => video.srcObject = stream);

let scannedCode = "";
let imageData = "";

function onScanSuccess(text) {
  if (!store.value || !name.value || !phone.value) {
    alert("Enter store, name and phone");
    return;
  }

  scannedCode = text;
  document.getElementById("code").innerText = text;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  imageData = canvas.toDataURL("image/jpeg");

  document.getElementById("preview").src = imageData;
  document.getElementById("confirm").style.display = "block";
}

function confirmSave() {
  fetch("/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store: store.value,
      name: name.value,
      phone: phone.value,
      barcode: scannedCode,
      image: imageData
    })
  }).then(() => {
    document.getElementById("confirm").style.display = "none";
    location.reload();
  });
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
  const { store, name, phone, barcode, image } = req.body;
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);

  const imgPath = `images/${Date.now()}.jpg`;
  fs.writeFileSync(imgPath, image.split(",")[1], "base64");

  db.run(
    `INSERT INTO records (timestamp, store_code, name, phone, barcode, image_path)
     VALUES (?,?,?,?,?,?)`,
    [ts, store, name, phone, barcode, imgPath],
    () => res.sendStatus(200)
  );
});

app.listen(PORT, () => console.log("Running on port", PORT));
