// Minimal CommonJS backend for downloads with SSE progress reporting
const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// ensure we always write into the public/videos directory next to this file
const videosDir = path.join(__dirname, 'videos');
fs.mkdirSync(videosDir, { recursive: true });
console.log('[backend] videosDir (absolute):', videosDir);

function runShellCommand(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', cmd], { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', (d) => { stderr += d.toString(); process.stderr.write(d); });
    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

function sseWrite(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // split multiline to data: lines
  payload.split(/\r?\n/).forEach(line => res.write(`data: ${line}\n`));
  res.write('\n');
}

function parseProgressLine(line) {
  // example: "[download]   12.3% of 10.34MiB at 123.45KiB/s ETA 00:01"
  const out = { raw: line };
  const pct = line.match(/([0-9]{1,3}(?:\.[0-9]+)?)%/);
  if (pct) out.percent = parseFloat(pct[1]);
  const speed = line.match(/at\s+([0-9\.]+[A-Za-z\/]+)\s*/);
  if (speed) out.speed = speed[1];
  const eta = line.match(/ETA\s+([0-9:]+)/);
  if (eta) out.eta = eta[1];
  const of = line.match(/of\s+([0-9\.]+\w+)/);
  if (of) out.total = of[1];
  const status = line.match(/\[download\]\s+(.*)/);
  if (status) out.status = status[1].trim();
  return out;
}

async function ensureVideosDir() {
  const dir = path.join(__dirname, 'videos');
  await runShellCommand(`mkdir -p "${dir}"`);
  return dir;
}

async function getFilenameForLink(link) {
  const safeLink = String(link).replace(/"/g, '\\"');
  // use absolute output template so cwd doesn't matter
  const template = path.join(videosDir, '%(title)s.%(ext)s').replace(/\\/g, '/');
  const cmd = `yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 --get-filename -o "${template}" "${safeLink}"`;
  const res = await runShellCommand(cmd);
  if (res.code !== 0) throw new Error('yt-dlp failed to get filename: ' + (res.stderr || res.stdout));
  const filename = (res.stdout || '').split(/\r?\n/).find(l => l && l.trim());
  if (!filename) throw new Error('Could not determine filename');
  return filename.trim();
}

const server = http.createServer(async (req, res) => {
  console.log(new Date().toISOString(), req.method, req.url);
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, pid: process.pid }));
  }

  if (req.method === 'POST' && req.url === '/download-stream') {
    // Stream yt-dlp progress as Server-Sent Events (SSE)
    let body = '';
    req.on('data', ch => body += ch);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const link = parsed.link;
        if (!link) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'missing link' }));
        }

        await ensureVideosDir();
        // determine filename that will be produced
        let filename = null;
        try {
          filename = await getFilenameForLink(link);
        } catch (err) {
          // proceed; we still can attempt download but report filename unknown
          console.warn('Could not determine filename in advance:', err.message);
        }

        // set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        res.write('\n'); // flush

        const safeLink = String(link).replace(/"/g, '\\"');
        const args = ['-f', 'bestvideo+bestaudio', '--merge-output-format', 'mp4', '--newline', '-o', './public/videos/%(title)s.%(ext)s', safeLink];
        const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        // combine stdout and stderr lines (yt-dlp may output progress to stderr)
        const handleLine = (line) => {
          const l = String(line).trim();
          if (!l) return;
          const parsed = parseProgressLine(l);
          // send a progress SSE event
          sseWrite(res, 'progress', parsed);
        };

        // buffer incoming data by lines
        let stdoutBuf = '';
        child.stdout.on('data', (chunk) => {
          stdoutBuf += chunk;
          let idx;
          while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
            const line = stdoutBuf.slice(0, idx);
            stdoutBuf = stdoutBuf.slice(idx + 1);
            handleLine(line);
          }
        });
        let stderrBuf = '';
        child.stderr.on('data', (chunk) => {
          stderrBuf += chunk;
          let idx;
          while ((idx = stderrBuf.indexOf('\n')) >= 0) {
            const line = stderrBuf.slice(0, idx);
            stderrBuf = stderrBuf.slice(idx + 1);
            handleLine(line);
          }
        });

        child.on('error', (err) => {
          sseWrite(res, 'error', { message: String(err) });
          res.end();
        });

        child.on('close', (code, signal) => {
          if (code === 0) {
            // attempt to discover filename if not known
            (async () => {
              try {
                if (!filename) filename = await getFilenameForLink(link);
              } catch (_) {}
              sseWrite(res, 'done', { filename: filename || null });
              res.end();
            })();
          } else {
            sseWrite(res, 'error', { code, signal, message: `yt-dlp exited with code ${code}` });
            res.end();
          }
        });

        // keep the connection alive until yt-dlp finishes
      } catch (innerErr) {
        console.error('download-stream error:', innerErr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(innerErr && innerErr.message ? innerErr.message : innerErr) }));
      }
    });
    return;
  }

  // fallback: existing /download endpoint (simple, non-streaming) for compatibility
  if (req.method === 'POST' && req.url === '/download') {
    let body = '';
    req.on('data', ch => body += ch);
    req.on('end', async () => {
      try {
        const { link } = JSON.parse(body || '{}');
        if (!link) { res.writeHead(400); return res.end('missing link'); }
        const safeLink = String(link).replace(/"/g, '\\"');
        console.log('[backend] download requested for:', link);
        await runShellCommand(`mkdir -p "${videosDir}"`);

        const absTemplate = path.join(videosDir, '%(title)s.%(ext)s').replace(/\\/g, '/');
        const downloadCmd = `yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 -o "${absTemplate}" "${String(link).replace(/"/g,'\\"')}"`;
        console.log('[backend] spawning yt-dlp:', downloadCmd);
        const dlRes = await runShellCommand(downloadCmd);
        console.log('[backend] yt-dlp exit:', dlRes.code);
        if (dlRes.code !== 0) {
          console.error('[backend] yt-dlp stderr:', dlRes.stderr);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end(String(dlRes.stderr || dlRes.stdout));
        }

        // debug: list files written to videosDir
        try {
          const files = fs.readdirSync(videosDir).filter(f => fs.statSync(path.join(videosDir, f)).isFile());
          console.log('[backend] files in videosDir after download:', files);
        } catch (e) {
          console.warn('[backend] could not list videosDir:', e && e.message);
        }

        const filename = (await getFilenameForLink(link)).trim();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ filename }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err.message || err));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const PORT = process.env.YTDLP_BACKEND_PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`yt-dlp backend listening on http://0.0.0.0:${PORT}`));