import express from "express";
import cors from "cors";
import path from "path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// log every incoming request (method, url, headers, small body)
app.use(express.text({ type: "*/*" })); // allow reading body as text for logging
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  console.log('Headers:', JSON.stringify(req.headers));
  if (req.body) {
    try { console.log('Body:', typeof req.body === 'string' ? req.body : JSON.stringify(req.body)); }
    catch (e) { console.log('Body: [unserializable]'); }
  }
  next();
});

app.use(cors());
app.use(express.json()); // <-- keep JSON parsing for normal handlers
app.use(express.static(path.join(__dirname, "public")));

app.get("/list_videos", (req, res) => {
  const fs = require("fs");
  const videoDir = path.join(__dirname, "public/videos");

  fs.readdir(videoDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Unable to list videos" });
    res.json({ videos: files });
  });
});

app.get("/download", (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "missing name" });

  const filePath = path.join(__dirname, "public/videos", name);
  res.download(filePath);
});

// Proxy POST /download -> local backend (yt-dlp) on 127.0.0.1:3001
app.post("/download", async (req, res) => {
  try {
    const backendUrl = "http://127.0.0.1:3001/download";
    const backendRes = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {})
    });
    const text = await backendRes.text();
    res.status(backendRes.status)
       .type(backendRes.headers.get("content-type") || "application/json")
       .send(text);
  } catch (err) {
    console.error("proxy /download error:", err);
    res.status(502).json({ error: "bad gateway", message: String(err) });
  }
});

// important: catch 404 errors only after all routes have been defined
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3000");
});
