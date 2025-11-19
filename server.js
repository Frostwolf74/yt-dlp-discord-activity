import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.post("/download", (req, res) => {
    const name = req.body.name;
    const filePath = path.join("videos", name);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
    }

    res.setHeader("Content-Type", "video/mp4");
    fs.createReadStream(filePath).pipe(res);
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
