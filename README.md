# 🔗 TinyURL Pro Clone

A high-performance, full-featured **TinyURL Clone** built with native **Node.js 24** and **SQLite** (`node:sqlite`). Zero external npm dependencies required for runtime.

---

## ✨ Features

- ⚡ **Instant URL Shortening**: Fast collision-resistant 6-character Base62 code generation.
- 🎯 **Custom Alias / Slug**: Choose custom memorable names (e.g., `http://localhost:3000/my-portfolio`).
- 🔒 **Password Protection**: Secure links with a password (PBKDF2 SHA-256 hash + salt). Visitors must enter the password to unlock.
- ⏳ **Expiration Date & Time**: Set links to automatically expire after a specified date/time.
- 🚫 **Click Limits**: Set maximum allowed visits (e.g. valid for only 100 clicks).
- 📱 **QR Code Generator**: Automatic high-res QR code generator with 1-click PNG download.
- 🛡️ **TinyURL Safe Preview**: Visit any short link with `?preview=1` to view target safety details before redirection.
- 📊 **Real-time Analytics Dashboard**:
  - Total visits & unique click counter.
  - Device distribution (Desktop, Mobile, Tablet).
  - Browser & OS breakdown (Chrome, Edge, Firefox, Safari, Windows, macOS, Android, iOS).
  - Top referrers / traffic sources.
  - Recent click log with timestamps.
- ⚙️ **Link Management**:
  - Search links in real-time.
  - Edit destination URLs and metadata.
  - 1-click Pause / Reactivate links.
  - Permanent delete.
- 🎨 **Modern Glassmorphic UI**:
  - Dark Mode and Light Mode with instant toggle.
  - Responsive layout for mobile, tablet, and desktop.
  - 1-click Copy to clipboard with toast notifications.
  - Social sharing (WhatsApp, X / Twitter, LinkedIn).
- 🚀 **REST API**: Clean JSON endpoints for programmatic URL shortening and stats.

---

## 🚀 Quick Start

### 1. Start the Server
Run from PowerShell or terminal:

```powershell
cd C:\Users\Hammad\.gemini\antigravity\scratch\tinyurl-app
node server.mjs
```

### 2. Open in Browser
Visit:
```
http://localhost:3000
```

---

## 📡 REST API Documentation

### 1. Shorten a URL
- **Endpoint**: `POST /api/shorten`
- **Request Body**:
```json
{
  "original_url": "https://example.com/very/long/url",
  "custom_slug": "my-promo",
  "title": "Marketing Campaign",
  "password": "optionalSecretPassword",
  "expires_at": "2026-12-31T23:59:59.000Z",
  "max_clicks": 100
}
```
- **Response**:
```json
{
  "ok": true,
  "code": "my-promo",
  "short_url": "http://localhost:3000/my-promo",
  "original_url": "https://example.com/very/long/url"
}
```

### 2. List Links
- **Endpoint**: `GET /api/links?search=promo`

### 3. Get Link Analytics
- **Endpoint**: `GET /api/links/:code/stats`

### 4. Edit a Link
- **Endpoint**: `PUT /api/links/:code`

### 5. Delete a Link
- **Endpoint**: `DELETE /api/links/:code`
