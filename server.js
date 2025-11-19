import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
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

// important: catch 404 errors only after all routes have been defined
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3000");
});
