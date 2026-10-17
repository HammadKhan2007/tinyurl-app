import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "tinyurl.db");
const PUBLIC_DIR = path.join(__dirname, "public");

// Initialize SQLite database
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    title TEXT DEFAULT '',
    password_hash TEXT DEFAULT NULL,
    password_salt TEXT DEFAULT NULL,
    expires_at TEXT DEFAULT NULL,
    max_clicks INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL,
    clicked_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    referer TEXT,
    browser TEXT,
    os TEXT,
    device TEXT,
    FOREIGN KEY(link_id) REFERENCES links(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
  CREATE INDEX IF NOT EXISTS idx_analytics_link_id ON analytics(link_id);
`);

// Helpers
function generateShortCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256").toString("hex");
  return check === hash;
}

function parseUserAgent(ua = "") {
  let browser = "Other";
  let os = "Other";
  let device = "Desktop";

  if (/Mobile|Android|iPhone|iPod|BlackBerry/i.test(ua)) {
    device = "Mobile";
  } else if (/iPad|Tablet/i.test(ua)) {
    device = "Tablet";
  }

  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium|Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/MSIE|Trident/i.test(ua)) browser = "IE";

  return { browser, os, device };
}

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// Serve static files
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// HTML Templates for Special Link Landing Pages
function renderErrorPage(title, message, icon = "⚠️") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - TinyURL</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="bg-gradient">
  <div class="card error-card">
    <div class="card-icon">${icon}</div>
    <h1>${title}</h1>
    <p class="subtitle">${message}</p>
    <a href="/" class="btn btn-primary" style="margin-top: 20px;">Go to TinyURL Homepage</a>
  </div>
</body>
</html>`;
}

function renderPasswordPage(code, title = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protected Link - TinyURL</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="bg-gradient">
  <div class="card auth-card">
    <div class="card-icon">🔒</div>
    <h1>Password Protected Link</h1>
    <p class="subtitle">${title ? `"${title}" requires` : "This link requires"} a password to open.</p>
    <form id="passForm" method="POST" action="/${code}">
      <div class="form-group">
        <input type="password" name="password" id="passInput" class="input" placeholder="Enter password" required autofocus>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Unlock & Proceed →</button>
    </form>
    <div id="errorMsg" class="alert-error" style="display:none; margin-top: 15px;">Incorrect password. Please try again.</div>
  </div>
  <script>
    const form = document.getElementById('passForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = document.getElementById('passInput').value;
      const res = await fetch('/api/links/${code}/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        document.getElementById('errorMsg').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}

function renderPreviewPage(link, shortUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Preview - TinyURL</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="bg-gradient">
  <div class="card preview-card">
    <div class="card-icon">🛡️</div>
    <h1>TinyURL Safe Preview</h1>
    <p class="subtitle">You are about to be redirected to an external destination:</p>
    
    <div class="preview-box">
      <div class="preview-field">
        <label>Short URL:</label>
        <span class="preview-value highlight">${shortUrl}</span>
      </div>
      <div class="preview-field">
        <label>Original Destination:</label>
        <a href="${link.original_url}" class="preview-value url-link" target="_blank" rel="noopener noreferrer">${link.original_url}</a>
      </div>
      ${link.title ? `
      <div class="preview-field">
        <label>Title:</label>
        <span class="preview-value">${link.title}</span>
      </div>` : ''}
      <div class="preview-field">
        <label>Created On:</label>
        <span class="preview-value">${new Date(link.created_at).toLocaleString()}</span>
      </div>
      <div class="preview-field">
        <label>Total Visits:</label>
        <span class="preview-value">${link.clicks} clicks</span>
      </div>
    </div>

    <div class="btn-group" style="margin-top: 25px;">
      <a href="${link.original_url}" class="btn btn-primary" rel="noopener noreferrer">Proceed to Destination →</a>
      <a href="/" class="btn btn-secondary">Cancel</a>
    </div>
  </div>
</body>
</html>`;
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// HTTP Request Handler
const server = http.createServer(async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const url = new URL(req.url, baseUrl);
  const pathname = url.pathname;

  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // --- API ROUTES ---

  // 1. Create / Shorten a URL
  if (pathname === "/api/shorten" && req.method === "POST") {
    try {
      const data = await parseBody(req);
      const originalUrl = (data.original_url || "").trim();
      let customSlug = (data.custom_slug || "").trim();
      const title = (data.title || "").trim();
      const password = (data.password || "").trim();
      const expiresAt = data.expires_at ? new Date(data.expires_at).toISOString() : null;
      const maxClicks = parseInt(data.max_clicks, 10) || 0;

      if (!originalUrl || !isValidUrl(originalUrl)) {
        return sendJson(res, 400, { ok: false, error: "Please enter a valid URL starting with http:// or https://" });
      }

      // Handle custom slug or auto generate
      let code = customSlug;
      if (code) {
        if (!/^[a-zA-Z0-9_-]{3,50}$/.test(code)) {
          return sendJson(res, 400, { ok: false, error: "Custom alias must be 3-50 alphanumeric characters, hyphens or underscores." });
        }
        // Reserved paths
        if (["api", "style.css", "app.js", "favicon.ico", "preview", "stats"].includes(code.toLowerCase())) {
          return sendJson(res, 400, { ok: false, error: "This alias is reserved. Please choose another one." });
        }
        const existing = db.prepare("SELECT id FROM links WHERE code = ?").get(code);
        if (existing) {
          return sendJson(res, 409, { ok: false, error: `The alias '${code}' is already taken. Please choose another.` });
        }
      } else {
        // Generate random unique code
        let attempts = 0;
        do {
          code = generateShortCode(6);
          const exists = db.prepare("SELECT id FROM links WHERE code = ?").get(code);
          if (!exists) break;
          attempts++;
        } while (attempts < 10);
      }

      // Password hashing if provided
      let passwordHash = null;
      let passwordSalt = null;
      if (password) {
        const { hash, salt } = hashPassword(password);
        passwordHash = hash;
        passwordSalt = salt;
      }

      const createdAt = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO links (code, original_url, title, password_hash, password_salt, expires_at, max_clicks, clicks, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
      `);
      const result = stmt.run(code, originalUrl, title, passwordHash, passwordSalt, expiresAt, maxClicks, createdAt);

      const shortUrl = `${baseUrl}/${code}`;

      return sendJson(res, 201, {
        ok: true,
        id: result.lastInsertRowid,
        code,
        short_url: shortUrl,
        original_url: originalUrl,
        title,
        has_password: !!password,
        expires_at: expiresAt,
        max_clicks: maxClicks,
        created_at: createdAt
      });
    } catch (err) {
      console.error("Error creating link:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // 2. List All Links (with search & stats)
  if (pathname === "/api/links" && req.method === "GET") {
    try {
      const search = url.searchParams.get("search") || "";
      let query = "SELECT id, code, original_url, title, password_hash IS NOT NULL as has_password, expires_at, max_clicks, clicks, is_active, created_at FROM links";
      let params = [];

      if (search) {
        query += " WHERE code LIKE ? OR original_url LIKE ? OR title LIKE ?";
        const term = `%${search}%`;
        params = [term, term, term];
      }
      query += " ORDER BY id DESC LIMIT 100";

      const links = db.prepare(query).all(...params);
      const mapped = links.map(l => ({
        ...l,
        short_url: `${baseUrl}/${l.code}`,
        is_expired: l.expires_at ? new Date(l.expires_at) < new Date() : false,
        is_max_reached: l.max_clicks > 0 && l.clicks >= l.max_clicks
      }));

      return sendJson(res, 200, { ok: true, links: mapped });
    } catch (err) {
      console.error("Error listing links:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // 3. Link Analytics & Stats
  const statsMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)\/stats$/);
  if (statsMatch && req.method === "GET") {
    try {
      const code = statsMatch[1];
      const link = db.prepare("SELECT * FROM links WHERE code = ?").get(code);
      if (!link) {
        return sendJson(res, 404, { ok: false, error: "Link not found" });
      }

      // Aggregations
      const totalClicks = link.clicks;
      const recentClicks = db.prepare("SELECT clicked_at, referer, browser, os, device FROM analytics WHERE link_id = ? ORDER BY id DESC LIMIT 50").all(link.id);

      // Clicks per day
      const dailyClicks = db.prepare(`
        SELECT SUBSTR(clicked_at, 1, 10) as date, COUNT(*) as count 
        FROM analytics 
        WHERE link_id = ? 
        GROUP BY SUBSTR(clicked_at, 1, 10) 
        ORDER BY date DESC LIMIT 14
      `).all(link.id);

      // Devices
      const devices = db.prepare("SELECT device, COUNT(*) as count FROM analytics WHERE link_id = ? GROUP BY device").all(link.id);

      // Browsers
      const browsers = db.prepare("SELECT browser, COUNT(*) as count FROM analytics WHERE link_id = ? GROUP BY browser").all(link.id);

      // Top referrers
      const referrers = db.prepare("SELECT referer, COUNT(*) as count FROM analytics WHERE link_id = ? AND referer != '' GROUP BY referer ORDER BY count DESC LIMIT 5").all(link.id);

      return sendJson(res, 200, {
        ok: true,
        link: {
          id: link.id,
          code: link.code,
          short_url: `${baseUrl}/${link.code}`,
          original_url: link.original_url,
          title: link.title,
          has_password: !!link.password_hash,
          expires_at: link.expires_at,
          max_clicks: link.max_clicks,
          clicks: link.clicks,
          is_active: !!link.is_active,
          created_at: link.created_at
        },
        stats: {
          totalClicks,
          dailyClicks,
          devices,
          browsers,
          referrers,
          recentClicks
        }
      });
    } catch (err) {
      console.error("Error getting stats:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // 4. Verify password for protected link
  const verifyPassMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)\/verify-password$/);
  if (verifyPassMatch && req.method === "POST") {
    try {
      const code = verifyPassMatch[1];
      const data = await parseBody(req);
      const link = db.prepare("SELECT * FROM links WHERE code = ?").get(code);

      if (!link) return sendJson(res, 404, { ok: false, error: "Link not found" });
      if (!link.password_hash) return sendJson(res, 200, { ok: true, url: link.original_url });

      const isValid = verifyPassword(data.password || "", link.password_hash, link.password_salt);
      if (!isValid) {
        return sendJson(res, 401, { ok: false, error: "Incorrect password" });
      }

      // Log click
      const { browser, os, device } = parseUserAgent(req.headers["user-agent"]);
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
      const referer = req.headers.referer || "";
      const now = new Date().toISOString();

      db.prepare("UPDATE links SET clicks = clicks + 1 WHERE id = ?").run(link.id);
      db.prepare("INSERT INTO analytics (link_id, clicked_at, ip, user_agent, referer, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        link.id, now, String(ip), String(req.headers["user-agent"] || ""), String(referer), browser, os, device
      );

      return sendJson(res, 200, { ok: true, url: link.original_url });
    } catch (err) {
      console.error("Error verifying password:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // 5. Update / Edit Link
  const updateMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)$/);
  if (updateMatch && req.method === "PUT") {
    try {
      const code = updateMatch[1];
      const data = await parseBody(req);
      const link = db.prepare("SELECT * FROM links WHERE code = ?").get(code);

      if (!link) return sendJson(res, 404, { ok: false, error: "Link not found" });

      const originalUrl = data.original_url !== undefined ? data.original_url.trim() : link.original_url;
      const title = data.title !== undefined ? data.title.trim() : link.title;
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : link.is_active;
      const maxClicks = data.max_clicks !== undefined ? parseInt(data.max_clicks, 10) : link.max_clicks;
      const expiresAt = data.expires_at !== undefined ? (data.expires_at ? new Date(data.expires_at).toISOString() : null) : link.expires_at;

      if (originalUrl && !isValidUrl(originalUrl)) {
        return sendJson(res, 400, { ok: false, error: "Invalid destination URL" });
      }

      let passwordHash = link.password_hash;
      let passwordSalt = link.password_salt;
      if (data.remove_password) {
        passwordHash = null;
        passwordSalt = null;
      } else if (data.password) {
        const h = hashPassword(data.password);
        passwordHash = h.hash;
        passwordSalt = h.salt;
      }

      db.prepare(`
        UPDATE links 
        SET original_url = ?, title = ?, is_active = ?, max_clicks = ?, expires_at = ?, password_hash = ?, password_salt = ?
        WHERE id = ?
      `).run(originalUrl, title, isActive, maxClicks, expiresAt, passwordHash, passwordSalt, link.id);

      return sendJson(res, 200, { ok: true, message: "Link updated successfully" });
    } catch (err) {
      console.error("Error updating link:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // 6. Delete Link
  const deleteMatch = pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    try {
      const code = deleteMatch[1];
      const link = db.prepare("SELECT id FROM links WHERE code = ?").get(code);
      if (!link) return sendJson(res, 404, { ok: false, error: "Link not found" });

      db.prepare("DELETE FROM analytics WHERE link_id = ?").run(link.id);
      db.prepare("DELETE FROM links WHERE id = ?").run(link.id);

      return sendJson(res, 200, { ok: true, message: "Link deleted successfully" });
    } catch (err) {
      console.error("Error deleting link:", err);
      return sendJson(res, 500, { ok: false, error: "Internal server error" });
    }
  }

  // --- REDIRECTION & SPECIAL PAGES ROUTE (/:code) ---
  const codeMatch = pathname.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (codeMatch && req.method === "GET") {
    const code = codeMatch[1];
    const link = db.prepare("SELECT * FROM links WHERE code = ?").get(code);

    if (link) {
      const shortUrl = `${baseUrl}/${link.code}`;

      // Check Preview Flag (?preview=1)
      if (url.searchParams.get("preview") === "1") {
        return sendHtml(res, 200, renderPreviewPage(link, shortUrl));
      }

      // Check Active Status
      if (!link.is_active) {
        return sendHtml(res, 403, renderErrorPage("Link Paused", "This short link has been temporarily disabled by its creator.", "⏸️"));
      }

      // Check Expiration
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return sendHtml(res, 410, renderErrorPage("Link Expired", `This short link expired on ${new Date(link.expires_at).toLocaleString()}.`, "⏳"));
      }

      // Check Max Clicks Limit
      if (link.max_clicks > 0 && link.clicks >= link.max_clicks) {
        return sendHtml(res, 410, renderErrorPage("Click Limit Reached", `This short link has reached its maximum allowed visits (${link.max_clicks} clicks).`, "🚫"));
      }

      // Check Password Protection
      if (link.password_hash) {
        return sendHtml(res, 200, renderPasswordPage(code, link.title));
      }

      // Log Click Analytics
      const { browser, os, device } = parseUserAgent(req.headers["user-agent"]);
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
      const referer = req.headers.referer || "";
      const now = new Date().toISOString();

      try {
        db.prepare("UPDATE links SET clicks = clicks + 1 WHERE id = ?").run(link.id);
        db.prepare("INSERT INTO analytics (link_id, clicked_at, ip, user_agent, referer, browser, os, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          link.id, now, String(ip), String(req.headers["user-agent"] || ""), String(referer), browser, os, device
        );
      } catch (err) {
        console.error("Analytics log error:", err);
      }

      // 302 Redirect to destination
      res.writeHead(302, { "Location": link.original_url });
      return res.end();
    }
  }

  // --- STATIC ASSETS SERVING ---
  let staticPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(path.join(PUBLIC_DIR, staticPath));

  if (safePath.startsWith(PUBLIC_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    return serveStatic(req, res, safePath);
  }

  // 404 Page
  return sendHtml(res, 404, renderErrorPage("Page Not Found", "The requested page or link does not exist.", "🔍"));
});

// Start Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 TinyURL Clone Server is running on:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`💾 SQLite Database connected: ${DB_PATH}`);
  console.log(`====================================================`);
});
