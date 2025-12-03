// ===========================================
// app.js – Hauptsteuerungslogik
// ===========================================
//
// Aufgaben:
//  ✓ Barcode scannen
//  ✓ Offline-Einträge speichern (IndexedDB)
//  ✓ CSV erstellen & an Backend senden
//  ✓ Tabelle anzeigen & bearbeiten
//
// __________________________________________
// KEIN Dropbox Upload mehr im Frontend!
// Alles nur über /upload Route (Backend)
// __________________________________________
// ===========================================


import {
    dbAddEntry,
    dbUpdateEntry,
    dbDeleteEntry,
    dbLoadEntries,
    initDB,
    dbClearAll
} from "./db.js";

import { getToday, sanitizeNumber, getClientId } from "./utils.js";
import { startScanner, stopScanner } from "./scanner.js";
import { createCsvForBackend } from "./csv.js";


// Globale Variablen
let eintraege = [];
let editingId = null;


// =====================================================
// Mitarbeitnummer speichern
// =====================================================
document.getElementById("saveMitarbeiter").addEventListener("click", () => {
    const nr = document.getElementById("mitarbeiter").value.trim();

    if (!nr) return alert("Bitte Mitarbeitnummer eingeben.");

    localStorage.setItem("mitarbeiter", nr);
    alert("Mitarbeiternummer gespeichert!");
});


// =====================================================
// Seite laden → Datenbank initialisieren & Tabelle anzeigen
// =====================================================
window.addEventListener("load", async () => {

    const ma = localStorage.getItem("mitarbeiter");
    if (ma) document.getElementById("mitarbeiter").value = ma;

    await initDB();

    if (ma) {
        eintraege = await dbLoadEntries(getToday(), ma);
        renderTable();
    }
});


// =====================================================
// Eintrag speichern oder aktualisieren
// =====================================================
document.getElementById("addEntry").addEventListener("click", async () => {

    const ma = localStorage.getItem("mitarbeiter");
    if (!ma) return alert("Bitte Mitarbeitnummer speichern!");

    const entry = {
        barcode: document.getElementById("barcode").value,
        spedition: document.getElementById("spedition").value,
        artikel: document.getElementById("artikel").value,
        bemerkung: document.getElementById("bemerkung").value,
        hundert: sanitizeNumber(document.getElementById("hundert").value),
        fuenfzig: sanitizeNumber(document.getElementById("fuenfzig").value),
        info: document.getElementById("info").value,
        mitarbeiter: ma,
        date: getToday(),
        timestamp: new Date().toISOString()
    };

    if (editingId === null) {
        await dbAddEntry(entry);
    } else {
        entry.id = editingId;
        await dbUpdateEntry(entry);
        editingId = null;
        document.getElementById("addEntry").textContent = "Eintrag speichern";
    }

    eintraege = await dbLoadEntries(getToday(), ma);
    renderTable();
    clearForm();
});


// =====================================================
// Tabelle darstellen
// =====================================================
function renderTable() {
    const body = document.getElementById("listBody");
    body.innerHTML = "";

    eintraege.forEach(e => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${e.barcode}</td>
            <td>${e.spedition}</td>
            <td>${e.artikel}</td>
            <td>${e.bemerkung}</td>
            <td>${e.hundert}</td>
            <td>${e.fuenfzig}</td>
            <td>${e.info}</td>
            <td>
                <button onclick="editEntry(${e.id})">📝</button>
                <button onclick="deleteEntry(${e.id})">❌</button>
            </td>
        `;
        body.appendChild(row);
    });
}


// =====================================================
// Formular entleeren
// =====================================================
function clearForm() {
    document.getElementById("barcode").value = "";
    document.getElementById("artikel").value = "";
    document.getElementById("bemerkung").value = "";
    document.getElementById("hundert").value = "";
    document.getElementById("fuenfzig").value = "";
    document.getElementById("info").value = "";
}


// =====================================================
// Eintrag bearbeiten
// =====================================================
window.editEntry = function (id) {
    const e = eintraege.find(x => x.id === id);
    if (!e) return;

    editingId = id;

    document.getElementById("barcode").value = e.barcode;
    document.getElementById("spedition").value = e.spedition;
    document.getElementById("artikel").value = e.artikel;
    document.getElementById("bemerkung").value = e.bemerkung;
    document.getElementById("hundert").value = e.hundert;
    document.getElementById("fuenfzig").value = e.fuenfzig;
    document.getElementById("info").value = e.info;

    document.getElementById("addEntry").textContent = "Änderung speichern";
};


// =====================================================
// Eintrag löschen
// =====================================================
window.deleteEntry = async function (id) {
    if (!confirm("Wirklich löschen?")) return;

    await dbDeleteEntry(id);

    const ma = localStorage.getItem("mitarbeiter");
    eintraege = await dbLoadEntries(getToday(), ma);
    renderTable();
};


// =====================================================
// Scanner starten & stoppen
// =====================================================
document.getElementById("startScanner").addEventListener("click", () => {
    startScanner((barcode) => {
        document.getElementById("barcode").value = barcode;
        stopScanner();
    });
});

document.getElementById("stopScanner").addEventListener("click", () => {
    stopScanner();
});



// =====================================================
// CSV an Backend senden (FINAL STABLE VERSION)
// =====================================================
async function sendDailyDataToBackend() {

    const ma = localStorage.getItem("mitarbeiter");
    if (!ma) return alert("Bitte Mitarbeiternummer speichern!");

    if (eintraege.length === 0)
        return alert("Keine Einträge für heute.");

    const clientId = getClientId();
    const { filename, csvData } = createCsvForBackend(eintraege, ma, clientId);

    console.log("⬆ Sende Datei an Backend:", filename);

    try {
        const response = await fetch("http://localhost:5000/upload-append", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, csvData })
        });

        const result = await response.json();
        console.log("Upload Ergebnis:", result);

        if (result.success) {
            alert("Upload erfolgreich — Backend hat Datei erweitert!");
            await dbClearAll(); // nur löschen wenn gespeichert!
            eintraege = [];
            renderTable();
        } else {
            alert("Upload fehlgeschlagen: " + result.error);
        }

    } catch (err) {
        console.error("❌ Netzwerkfehler beim Upload:", err);
        alert("Upload fehlgeschlagen — Backend nicht erreichbar!");
    }
}
document.getElementById("sendToDropbox")
    .addEventListener("click", sendDailyDataToBackend);