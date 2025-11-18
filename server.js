import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discord = new DiscordSDK("1309612526580928515");
await discord.ready();

// discord.activities.send("state_update", { filename: name })

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files (HTML, JS, CSS, assets)
app.use(express.static(path.join(__dirname, "public")));

// Videos folder (raw files)
app.use("/videos", express.static(path.join(__dirname, "public/videos"), {
    setHeaders(res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
}));

app.listen(PORT, () => {
    console.log(`Discord Activity running at http://localhost:${PORT}`);
});

