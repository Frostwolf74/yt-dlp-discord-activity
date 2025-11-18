// written entirely by chat gpt because i dont have the faintest idea of what im doing here
// but this just allows the application to run in a browser-like environment

const http = require('http');
const { spawn } = require('child_process');

function runShellCommand(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-lc', cmd], {
            stdio: ['ignore', 'pipe', 'pipe'],
            ...opts
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err) => reject(err));
        child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
}

async function handleDownload(link) {
    const safeLink = String(link).replace(/"/g, '\\"');

    // clear the videos folder first before downloading another video
    await runShellCommand('rm ./videos/*');

    // use the same format selection and merge-output-format when querying filename
    const nameCmd = 'mkdir -p ./videos && cd ./videos && yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 --get-filename -o "%(title)s.%(ext)s" "' + safeLink + '"';
    const nameRes = await runShellCommand(nameCmd);
    if (nameRes.code !== 0) throw new Error('yt-dlp failed to get filename: ' + (nameRes.stderr || nameRes.stdout));
    const filename = (nameRes.stdout || '').split(/\r?\n/).find(l => l && l.trim());
    if (!filename) throw new Error('Could not determine filename');

    const downloadCmd = 'mkdir -p ./videos && cd ./videos && yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 -o "./%(title)s.%(ext)s" "' + safeLink + '"';
    const dlRes = await runShellCommand(downloadCmd);
    if (dlRes.code !== 0) throw new Error('yt-dlp download failed: ' + (dlRes.stderr || dlRes.stdout));

    return filename.trim();
}

const server = http.createServer(async (req, res) => {
    // simple CORS and routing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'POST' && req.url === '/download') {
        let body = '';
        req.on('data', ch => body += ch);
        req.on('end', async () => {
            try {
                const { link } = JSON.parse(body || '{}');
                if (!link) { res.writeHead(400); return res.end('missing link'); }
                const filename = await handleDownload(link);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ filename }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(String(err.message || err));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('not found');
});

const PORT = 3000;
server.listen(PORT, () => console.log(`backend listening on http://localhost:${PORT}`));