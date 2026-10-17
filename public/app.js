// --- TINYURL CLIENT APPLICATION ---

// State
let allLinks = [];
let currentQrUrl = "";
let currentQrCode = "";

// DOM Elements
const shortenForm = document.getElementById("shortenForm");
const longUrlInput = document.getElementById("longUrl");
const customSlugInput = document.getElementById("customSlug");
const linkTitleInput = document.getElementById("linkTitle");
const linkPasswordInput = document.getElementById("linkPassword");
const linkExpiryInput = document.getElementById("linkExpiry");
const maxClicksInput = document.getElementById("maxClicks");
const shortenBtn = document.getElementById("shortenBtn");
const advToggle = document.getElementById("advToggle");
const advContent = document.getElementById("advContent");
const domainPrefix = document.getElementById("domainPrefix");

// Result Elements
const resultArea = document.getElementById("resultArea");
const resultOriginalUrl = document.getElementById("resultOriginalUrl");
const shortUrlDisplay = document.getElementById("shortUrlDisplay");
const copyResultBtn = document.getElementById("copyResultBtn");
const qrResultBtn = document.getElementById("qrResultBtn");
const previewResultBtn = document.getElementById("previewResultBtn");
const statsResultBtn = document.getElementById("statsResultBtn");
const shareWhatsapp = document.getElementById("shareWhatsapp");
const shareTwitter = document.getElementById("shareTwitter");
const shareLinkedin = document.getElementById("shareLinkedin");

// Dashboard Elements
const searchInput = document.getElementById("searchInput");
const refreshBtn = document.getElementById("refreshBtn");
const linksTableBody = document.getElementById("linksTableBody");

// Modals
const qrModal = document.getElementById("qrModal");
const qrcodeContainer = document.getElementById("qrcodeContainer");
const qrUrlText = document.getElementById("qrUrlText");
const downloadQrBtn = document.getElementById("downloadQrBtn");
const closeQrModal = document.getElementById("closeQrModal");
const closeQrBtn = document.getElementById("closeQrBtn");

const analyticsModal = document.getElementById("analyticsModal");
const closeAnalyticsModal = document.getElementById("closeAnalyticsModal");

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editCode = document.getElementById("editCode");
const editOriginalUrl = document.getElementById("editOriginalUrl");
const editTitle = document.getElementById("editTitle");
const editMaxClicks = document.getElementById("editMaxClicks");
const editExpiry = document.getElementById("editExpiry");
const editIsActive = document.getElementById("editIsActive");
const closeEditModal = document.getElementById("closeEditModal");
const cancelEditBtn = document.getElementById("cancelEditBtn");

// Theme & Toast
const themeToggle = document.getElementById("themeToggle");
const toast = document.getElementById("toast");

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initDomainPrefix();
  fetchLinks();

  // Event Listeners
  advToggle.addEventListener("click", () => {
    const isHidden = advContent.style.display === "none";
    advContent.style.display = isHidden ? "block" : "none";
    advToggle.classList.toggle("active", isHidden);
  });

  shortenForm.addEventListener("submit", handleShorten);
  copyResultBtn.addEventListener("click", () => copyToClipboard(shortUrlDisplay.value));
  qrResultBtn.addEventListener("click", () => openQrModal(shortUrlDisplay.value, currentQrCode));
  statsResultBtn.addEventListener("click", () => openAnalyticsModal(currentQrCode));

  searchInput.addEventListener("input", debounce(fetchLinks, 300));
  refreshBtn.addEventListener("click", () => fetchLinks());

  // Modal Closers
  closeQrModal.addEventListener("click", () => qrModal.style.display = "none");
  closeQrBtn.addEventListener("click", () => qrModal.style.display = "none");
  qrModal.querySelector(".modal-backdrop").addEventListener("click", () => qrModal.style.display = "none");

  closeAnalyticsModal.addEventListener("click", () => analyticsModal.style.display = "none");
  analyticsModal.querySelector(".modal-backdrop").addEventListener("click", () => analyticsModal.style.display = "none");

  closeEditModal.addEventListener("click", () => editModal.style.display = "none");
  cancelEditBtn.addEventListener("click", () => editModal.style.display = "none");
  editModal.querySelector(".modal-backdrop").addEventListener("click", () => editModal.style.display = "none");

  editForm.addEventListener("submit", handleEditSubmit);
  downloadQrBtn.addEventListener("click", handleDownloadQr);
});

// Init Prefix
function initDomainPrefix() {
  domainPrefix.textContent = window.location.host + "/";
}

// --- SHORTEN URL HANDLER ---
async function handleShorten(e) {
  e.preventDefault();
  const originalUrl = longUrlInput.value.trim();
  const customSlug = customSlugInput.value.trim();
  const title = linkTitleInput.value.trim();
  const password = linkPasswordInput.value.trim();
  const expiresAt = linkExpiryInput.value ? new Date(linkExpiryInput.value).toISOString() : null;
  const maxClicks = parseInt(maxClicksInput.value, 10) || 0;

  if (!originalUrl) return;

  setLoading(true);

  try {
    const res = await fetch("/api/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_url: originalUrl,
        custom_slug: customSlug,
        title,
        password,
        expires_at: expiresAt,
        max_clicks: maxClicks
      })
    });

    const data = await res.json();
    setLoading(false);

    if (!data.ok) {
      showToast(data.error || "Failed to shorten URL", "error");
      return;
    }

    // Success - Populate Result Area
    currentQrCode = data.code;
    currentQrUrl = data.short_url;
    shortUrlDisplay.value = data.short_url;
    resultOriginalUrl.textContent = data.original_url;
    previewResultBtn.href = `${data.short_url}?preview=1`;

    // Social Share Links
    const encodedUrl = encodeURIComponent(data.short_url);
    const shareText = encodeURIComponent(`Check out this link: ${data.title || ''}`);
    shareWhatsapp.href = `https://api.whatsapp.com/send?text=${shareText}%20${encodedUrl}`;
    shareTwitter.href = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`;
    shareLinkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    resultArea.style.display = "block";
    resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });

    showToast("🎉 Short link generated successfully!");
    longUrlInput.value = "";
    customSlugInput.value = "";
    linkTitleInput.value = "";
    linkPasswordInput.value = "";
    linkExpiryInput.value = "";
    maxClicksInput.value = "";

    // Refresh Dashboard
    fetchLinks();
  } catch (err) {
    setLoading(false);
    showToast("Network error. Please try again.", "error");
  }
}

// --- FETCH & RENDER LINKS ---
async function fetchLinks() {
  const search = searchInput.value.trim();
  try {
    const res = await fetch(`/api/links?search=${encodeURIComponent(search)}`);
    const data = await res.json();

    if (data.ok) {
      allLinks = data.links;
      renderLinksTable(data.links);
    }
  } catch (err) {
    console.error("Failed to load links:", err);
  }
}

function renderLinksTable(links) {
  if (!links || links.length === 0) {
    linksTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center" style="padding: 40px; color: var(--text-muted);">
          No short links found. Create your first link above!
        </td>
      </tr>
    `;
    return;
  }

  linksTableBody.innerHTML = links.map(link => {
    // Badges
    let statusBadge = `<span class="badge-status status-active">Active</span>`;
    if (!link.is_active) {
      statusBadge = `<span class="badge-status status-paused">Paused</span>`;
    } else if (link.is_expired) {
      statusBadge = `<span class="badge-status status-expired">Expired</span>`;
    } else if (link.is_max_reached) {
      statusBadge = `<span class="badge-status status-expired">Limit Reached</span>`;
    }

    const lockedBadge = link.has_password ? `<span class="badge-status status-locked" title="Password Protected">🔒 Locked</span>` : "";
    const createdDate = new Date(link.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

    return `
      <tr>
        <td>
          <div class="link-title-cell">
            <a href="${link.short_url}" target="_blank" class="link-short">${link.short_url}</a>
            <span class="link-label">${escapeHtml(link.title || link.code)}</span>
          </div>
        </td>
        <td>
          <span class="dest-url" title="${escapeHtml(link.original_url)}">${escapeHtml(link.original_url)}</span>
        </td>
        <td>
          <div style="display:flex; gap: 4px; flex-wrap: wrap;">
            ${statusBadge}
            ${lockedBadge}
          </div>
        </td>
        <td>
          <span class="click-count">${link.clicks}</span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">
          ${createdDate}
        </td>
        <td>
          <div class="action-cell">
            <button class="btn-icon" onclick="copyToClipboard('${link.short_url}')" title="Copy Link">📋</button>
            <button class="btn-icon" onclick="openQrModal('${link.short_url}', '${link.code}')" title="QR Code">📱</button>
            <button class="btn-icon" onclick="openAnalyticsModal('${link.code}')" title="View Analytics">📊</button>
            <button class="btn-icon" onclick="openEditModal('${link.code}')" title="Edit Link">✏️</button>
            <button class="btn-icon" onclick="toggleLinkActive('${link.code}', ${link.is_active})" title="${link.is_active ? 'Pause Link' : 'Activate Link'}">${link.is_active ? '⏸️' : '▶️'}</button>
            <button class="btn-icon btn-danger-icon" onclick="deleteLink('${link.code}')" title="Delete Link">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// --- LINK ACTIONS ---
async function toggleLinkActive(code, currentActive) {
  try {
    const res = await fetch(`/api/links/${code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentActive })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(currentActive ? "Link paused" : "Link activated");
      fetchLinks();
    }
  } catch {
    showToast("Failed to update status", "error");
  }
}

async function deleteLink(code) {
  if (!confirm(`Are you sure you want to permanently delete short link /${code}?`)) return;
  try {
    const res = await fetch(`/api/links/${code}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      showToast("Link deleted successfully");
      fetchLinks();
    }
  } catch {
    showToast("Failed to delete link", "error");
  }
}

// --- EDIT MODAL ---
function openEditModal(code) {
  const link = allLinks.find(l => l.code === code);
  if (!link) return;

  editCode.value = link.code;
  editOriginalUrl.value = link.original_url;
  editTitle.value = link.title || "";
  editMaxClicks.value = link.max_clicks || "";
  editExpiry.value = link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 16) : "";
  editIsActive.checked = !!link.is_active;

  editModal.style.display = "flex";
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const code = editCode.value;
  try {
    const res = await fetch(`/api/links/${code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_url: editOriginalUrl.value.trim(),
        title: editTitle.value.trim(),
        max_clicks: parseInt(editMaxClicks.value, 10) || 0,
        expires_at: editExpiry.value ? new Date(editExpiry.value).toISOString() : null,
        is_active: editIsActive.checked
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast("Link updated successfully!");
      editModal.style.display = "none";
      fetchLinks();
    } else {
      showToast(data.error || "Failed to update", "error");
    }
  } catch {
    showToast("Network error updating link", "error");
  }
}

// --- ANALYTICS MODAL ---
async function openAnalyticsModal(code) {
  analyticsModal.style.display = "flex";
  try {
    const res = await fetch(`/api/links/${code}/stats`);
    const data = await res.json();

    if (!data.ok) {
      showToast(data.error || "Failed to load stats", "error");
      return;
    }

    const { link, stats } = data;
    document.getElementById("statTotalClicks").textContent = stats.totalClicks;
    document.getElementById("statStatus").textContent = link.is_active ? "Active" : "Paused";
    document.getElementById("statCreated").textContent = new Date(link.created_at).toLocaleDateString();

    // Render Devices Breakdown
    renderBreakdown(document.getElementById("deviceStats"), stats.devices, stats.totalClicks);
    // Render Browsers Breakdown
    renderBreakdown(document.getElementById("browserStats"), stats.browsers, stats.totalClicks);
    // Render Referrers Breakdown
    renderBreakdown(document.getElementById("referrerStats"), stats.referrers, stats.totalClicks, "Direct / None");

    // Render Recent Logs
    const recentLogBody = document.getElementById("recentLogBody");
    if (!stats.recentClicks || stats.recentClicks.length === 0) {
      recentLogBody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 15px; color: var(--text-muted);">No clicks recorded yet.</td></tr>`;
    } else {
      recentLogBody.innerHTML = stats.recentClicks.map(c => `
        <tr>
          <td>${new Date(c.clicked_at).toLocaleString()}</td>
          <td>${c.device || 'Desktop'}</td>
          <td>${c.browser || 'Unknown'} (${c.os || 'Unknown'})</td>
          <td style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.referer || 'Direct'}</td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.error("Error loading stats:", err);
  }
}

function renderBreakdown(container, items, total, fallbackLabel = "Other") {
  if (!items || items.length === 0) {
    container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">No data collected yet.</span>`;
    return;
  }
  container.innerHTML = items.map(item => {
    const label = item.device || item.browser || item.referer || fallbackLabel;
    const count = item.count;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="breakdown-item">
        <span style="min-width: 90px;">${escapeHtml(label)}</span>
        <div class="breakdown-bar-wrapper">
          <div class="breakdown-bar" style="width: ${pct}%;"></div>
        </div>
        <span style="font-weight: 700; font-family: var(--font-mono);">${count} (${pct}%)</span>
      </div>
    `;
  }).join("");
}

// --- QR CODE GENERATOR (Canvas API) ---
function openQrModal(url, code) {
  currentQrUrl = url;
  qrUrlText.textContent = url;
  qrcodeContainer.innerHTML = "";

  // Render QR code using high-quality Canvas & Image QR Server API with offline fallback
  const img = document.createElement("img");
  img.id = "qrImage";
  img.crossOrigin = "anonymous";
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(url)}`;
  img.alt = "QR Code";
  img.style.width = "200px";
  img.style.height = "200px";
  img.style.display = "block";
  qrcodeContainer.appendChild(img);

  qrModal.style.display = "flex";
}

async function handleDownloadQr() {
  const img = document.getElementById("qrImage");
  if (!img) return;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 240, 240);

    const a = document.createElement("a");
    a.download = `tinyurl-qr-${currentQrCode || "code"}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    showToast("QR code downloaded!");
  } catch (e) {
    // Fallback: direct window open
    window.open(img.src, "_blank");
  }
}

// --- THEME & TOAST UTILITIES ---
function initTheme() {
  const saved = localStorage.getItem("tinyurl_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  themeToggle.querySelector(".theme-icon").textContent = saved === "light" ? "☀️" : "🌙";

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tinyurl_theme", next);
    themeToggle.querySelector(".theme-icon").textContent = next === "light" ? "☀️" : "🌙";
  });
}

function showToast(msg, type = "success") {
  toast.textContent = msg;
  toast.style.borderColor = type === "error" ? "var(--danger)" : "var(--primary)";
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("📋 Copied to clipboard!");
    });
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("📋 Copied to clipboard!");
  }
}

function setLoading(isLoading) {
  shortenBtn.disabled = isLoading;
  shortenBtn.querySelector(".btn-text").style.display = isLoading ? "none" : "inline";
  shortenBtn.querySelector(".spinner").style.display = isLoading ? "inline-block" : "none";
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
