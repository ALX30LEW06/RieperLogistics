/**
 * RIEPER LOGISTICS - Backend Server (Dropbox + CSV Upload)
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import querystring from "querystring";

dotenv.config();

// __dirname Fix für ES-Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;

/**
 * Test Route
 */
app.get("/", (req, res) => {
  res.json({ status: "Backend läuft! 🟢" });
});

/**
 * Refresh Token -> Neuer Access Token
 */
async function getDropboxAccessToken() {
  if (process.env.DROPBOX_ACCESS_TOKEN) {
    return process.env.DROPBOX_ACCESS_TOKEN;
  }

  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Kein Refresh Token! Bitte zuerst /auth/callback ausführen!");

  const body = querystring.stringify({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: DROPBOX_APP_KEY,
    client_secret: DROPBOX_APP_SECRET,
  });

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json();
  console.log("🔑 Refresh:", data);

  if (!data.access_token) {
    throw new Error("Refresh Token ungültig! " + JSON.stringify(data));
  }

  process.env.DROPBOX_ACCESS_TOKEN = data.access_token;
  saveEnvTokens();

  return data.access_token;
}

/**
 * Token in .env aktualisieren
 */
function saveEnvTokens() {
  const updatedEnv = [
    `DROPBOX_APP_KEY=${process.env.DROPBOX_APP_KEY}`,
    `DROPBOX_APP_SECRET=${process.env.DROPBOX_APP_SECRET}`,
    `DROPBOX_REFRESH_TOKEN=${process.env.DROPBOX_REFRESH_TOKEN || ""}`,
    `DROPBOX_ACCESS_TOKEN=${process.env.DROPBOX_ACCESS_TOKEN || ""}`,
    `PORT=${process.env.PORT || 5000}`
  ].join("\n");

  fs.writeFileSync(path.join(__dirname, ".env"), updatedEnv);
  console.log("💾 Tokens in .env gespeichert!");
}

/**
 * ========================================
 * 📊 STATS-SYSTEM für Website-KPIs
 * ========================================
 */

const STATS_PATH = "/RieperLogistik/stats.json";

/**
 * Stats aus Dropbox lesen (oder initial erstellen)
 */
async function readStatsFromDropbox() {
  try {
    const accessToken = await getDropboxAccessToken();
    
    const download = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: STATS_PATH })
      }
    });

    if (download.ok) {
      const content = await download.text();
      return JSON.parse(content);
    } else {
      // Stats existieren noch nicht → Initial erstellen
      console.log("📊 Stats-Datei existiert noch nicht, erstelle initial...");
      return {
        totalScans: 0,
        totalUploads: 0,
        lastUpdate: new Date().toISOString(),
        todayScans: 0,
        todayDate: new Date().toISOString().split('T')[0],
        activeUsersToday: new Set(),
        allTimeUsers: new Set()
      };
    }
  } catch (err) {
    console.error("⚠️ Fehler beim Lesen von stats.json:", err.message);
    // Fallback: leere Stats zurückgeben
    return {
      totalScans: 0,
      totalUploads: 0,
      lastUpdate: new Date().toISOString(),
      todayScans: 0,
      todayDate: new Date().toISOString().split('T')[0],
      activeUsersToday: new Set(),
      allTimeUsers: new Set()
    };
  }
}

/**
 * Stats aktualisieren nach erfolgreichem Upload
 */
async function updateStats(scanCount, mitarbeiterId) {
  try {
    const stats = await readStatsFromDropbox();
    const today = new Date().toISOString().split('T')[0];

    // Tag gewechselt? → Reset today-Zähler
    if (stats.todayDate !== today) {
      stats.todayScans = 0;
      stats.activeUsersToday = new Set();
      stats.todayDate = today;
    }

    // Stats aktualisieren
    stats.totalScans += scanCount;
    stats.totalUploads += 1;
    stats.todayScans += scanCount;
    stats.lastUpdate = new Date().toISOString();

    // Nutzer tracken (anonymisiert via Set - keine doppelten)
    if (mitarbeiterId) {
      if (!stats.activeUsersToday) stats.activeUsersToday = new Set();
      if (!stats.allTimeUsers) stats.allTimeUsers = new Set();
      
      stats.activeUsersToday.add(mitarbeiterId);
      stats.allTimeUsers.add(mitarbeiterId);
    }

    // Sets zu Arrays für JSON (Sets können nicht serialisiert werden)
    const statsToSave = {
      ...stats,
      activeUsersToday: Array.from(stats.activeUsersToday || []),
      allTimeUsers: Array.from(stats.allTimeUsers || [])
    };

    // Public-Stats (ohne Mitarbeiter-IDs!)
    const publicStats = {
      totalScans: statsToSave.totalScans,
      totalUploads: statsToSave.totalUploads,
      todayScans: statsToSave.todayScans,
      activeUsersCount: statsToSave.activeUsersToday.length,
      totalUsersCount: statsToSave.allTimeUsers.length,
      lastUpdate: statsToSave.lastUpdate
    };

    // In Dropbox speichern
    const accessToken = await getDropboxAccessToken();
    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: STATS_PATH,
          mode: "overwrite"
        }),
        "Content-Type": "application/octet-stream"
      },
      body: JSON.stringify(publicStats, null, 2)
    });

    if (upload.ok) {
      console.log(`📊 Stats aktualisiert: +${scanCount} Scans | Gesamt: ${publicStats.totalScans}`);
    } else {
      console.error("⚠️ Stats-Upload fehlgeschlagen:", await upload.text());
    }

  } catch (err) {
    // ⚠️ WICHTIG: Fehler nicht werfen - Upload soll trotzdem durchgehen!
    console.error("⚠️ Stats-Update fehlgeschlagen (nicht kritisch):", err.message);
  }
}

/**
 * 📤 CSV Simple Upload - jede Sendung = neue Datei (SICHER!)
 */
app.post("/upload", async (req, res) => {
  const { filename, csvData } = req.body;

  if (!filename || !csvData) {
    return res.json({ success: false, error: "Missing filename or data" });
  }

  const dropboxPath = `/RieperLogistik/${filename}`;
  console.log("📤 Upload:", dropboxPath);

  try {
    const accessToken = await getDropboxAccessToken();

    // CSV als UTF-8 Buffer mit BOM für korrekte Umlaut-Darstellung in Excel
    const csvBuffer = Buffer.from(csvData, 'utf8');

    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: dropboxPath,
          mode: "add",  // Neue Datei - kein overwrite!
          autorename: true  // Falls Datei existiert, automatisch umbenennen
        }),
        "Content-Type": "application/octet-stream"
      },
      body: csvBuffer
    });

    const result = await upload.json();

    // ⚠️ KRITISCH: Nur success: true wenn Dropbox wirklich erfolgreich!
    if (!upload.ok) {
      console.error("❌ Dropbox Upload Fehler:", result);
      return res.json({ 
        success: false, 
        error: result.error_summary || "Dropbox Upload fehlgeschlagen" 
      });
    }

    // ✅ Dropbox hat bestätigt - jetzt ist es sicher!
    console.log("✔ CSV erfolgreich in Dropbox hochgeladen:", result.name);
    
    // 📊 Stats aktualisieren (fail-safe - blockiert Upload nicht)
    try {
      const scanCount = csvData.split('\n').length - 2; // -2 wegen Header + BOM
      const mitarbeiterId = filename.match(/MA_([^.]+)/)?.[1]; // MA aus Filename extrahieren
      await updateStats(scanCount, mitarbeiterId);
    } catch (statsErr) {
      console.error("⚠️ Stats-Update fehlgeschlagen (Upload erfolgreich):", statsErr.message);
    }
    
    return res.json({ 
      success: true,
      filename: result.name,
      path: result.path_display
    });

  } catch (err) {
    console.error("❌ Schwerer Fehler beim Upload:", err);
    return res.json({ 
      success: false, 
      error: `Backend-Fehler: ${err.message}` 
    });
  }
});

/**
 * 📤 CSV Append Upload (Datei wird erweitert statt überschrieben)
 */
app.post("/upload-append", async (req, res) => {
  const { filename, csvData } = req.body;

  if (!filename || !csvData) {
    return res.json({ success: false, error: "Missing filename or data" });
  }

  const dropboxPath = `/RieperLogistik/${filename}`;
  console.log("📎 Append nach:", dropboxPath);

  try {
    const accessToken = await getDropboxAccessToken();

    // 1️⃣ Bestehende Datei versuchen zu laden
    let existingContent = "";
    const download = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath })
      }
    });

    if (download.ok) {
      existingContent = await download.text();
      console.log("📄 Datei existiert — Content wird angehängt!");
    } else {
      console.log("🆕 Datei existiert noch nicht — wird neu erstellt.");
    }

    // 2️⃣ Neue CSV hinten anhängen
    const newContent = existingContent
      ? existingContent.trim() + "\n" + csvData.trim() + "\n"
      : csvData.trim() + "\n";

    // 3️⃣ Datei neu hochladen (overwrite, aber jetzt mit append-Inhalt)
    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: dropboxPath,
          mode: "overwrite"
        }),
        "Content-Type": "application/octet-stream"
      },
      body: newContent
    });

    const result = await upload.json();

    if (!upload.ok) {
      console.error("❌ Append Fehler:", result);
      return res.json({ success: false, error: result.error_summary });
    }

    console.log("✔ CSV erfolgreich angehängt:", result.name);
    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Schwerer Fehler beim Append:", err);
    return res.json({ success: false, error: err.message });
  }
});

/**
 * OAuth Callback - Token speichern!
 */
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code!");

  const body = querystring.stringify({
    code,
    grant_type: "authorization_code",
    client_id: DROPBOX_APP_KEY,
    client_secret: DROPBOX_APP_SECRET,
    redirect_uri: "http://localhost:5000/auth/callback"
  });

  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json();
  console.log("🔐 Token Response:", data);

  if (!data.refresh_token) return res.status(500).send("❌ Kein Refresh Token!");

  process.env.DROPBOX_REFRESH_TOKEN = data.refresh_token;
  process.env.DROPBOX_ACCESS_TOKEN = data.access_token;
  saveEnvTokens();

  res.send(`
    <h2>Erfolg! 🎉</h2>
    <p>Tokens wurden gespeichert!</p>
    <p>Du kannst dieses Fenster schließen.</p>
  `);
});

/**
 * 📊 Public Stats API - für Website-Integration
 */
app.get("/stats/public", async (req, res) => {
  try {
    const accessToken = await getDropboxAccessToken();
    
    const download = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: STATS_PATH })
      }
    });

    if (download.ok) {
      const stats = await download.json();
      res.json(stats);
    } else {
      // Stats existieren noch nicht
      res.json({
        totalScans: 0,
        totalUploads: 0,
        todayScans: 0,
        activeUsersCount: 0,
        totalUsersCount: 0,
        lastUpdate: null
      });
    }
  } catch (err) {
    console.error("❌ Fehler beim Abrufen der Stats:", err);
    res.status(500).json({ error: "Stats konnten nicht geladen werden" });
  }
});

/**
 * Server Start
 */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🔥 Backend läuft auf Port ${PORT} 🚀`)
);