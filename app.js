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
    dbClearByDateAndMitarbeiter,
    dbLoadAllEntriesByMitarbeiter
} from "./db.js";

import { getToday, sanitizeNumber, getClientId } from "./utils.js";
import { startScanner, stopScanner } from "./scanner.js";
import { createCsvForBackend } from "./csv.js";


// Globale Variablen
let eintraege = [];
let editingId = null;


// =====================================================
// Smarte Warnung beim Schließen (nur bei vielen Einträgen)
// =====================================================
window.addEventListener("beforeunload", (e) => {
    // In PWA funktioniert beforeunload eh nicht (iPhone) - ignorieren
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;
    if (isPWA) return;
    
    // Nur warnen wenn VIELE Einträge (> 20) - sonst nervt es
    if (eintraege.length > 20) {
        e.preventDefault();
        e.returnValue = "Du hast viele ungesendete Einträge! Wirklich schließen?";
        return e.returnValue;
    }
});


// =====================================================
// Mitarbeitnummer speichern
// =====================================================
let isSavingMitarbeiter = false;
document.getElementById("saveMitarbeiter").addEventListener("click", () => {
    if (isSavingMitarbeiter) return;
    isSavingMitarbeiter = true;
    
    const nr = document.getElementById("mitarbeiter").value.trim();

    if (!nr) {
        isSavingMitarbeiter = false;
        return alert("Bitte Mitarbeiternummer eingeben.");
    }

    localStorage.setItem("mitarbeiter", nr);
    alert("Mitarbeiternummer gespeichert!");
    isSavingMitarbeiter = false;
});


// =====================================================
// Custom Dropdown Funktionalität für Artikel
// =====================================================
function initArtikelDropdown() {
    const input = document.getElementById("artikel");
    const dropdown = document.getElementById("artikelDropdown");
    const items = dropdown.querySelectorAll(".dropdown-item");

    // Zeige Dropdown beim Klick (Input ist readonly)
    input.addEventListener("click", () => {
        dropdown.classList.toggle("show");
    });

    // Verstecke Dropdown beim Klick außerhalb
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-dropdown")) {
            dropdown.classList.remove("show");
        }
    });

    // Wähle Item beim Klick
    items.forEach(item => {
        item.addEventListener("click", () => {
            input.value = item.getAttribute("data-value");
            dropdown.classList.remove("show");
        });
    });
}


// =====================================================
// Seite laden → Datenbank initialisieren & Tabelle anzeigen
// =====================================================
window.addEventListener("load", async () => {

    const ma = localStorage.getItem("mitarbeiter");
    if (ma) document.getElementById("mitarbeiter").value = ma;

    // Initialisiere Custom Dropdown
    initArtikelDropdown();

    await initDB();

    if (ma) {
        // ⚠️ KRITISCH: Prüfe auf alte ungesendete Einträge!
        const allEntries = await dbLoadAllEntriesByMitarbeiter(ma);
        const today = getToday();
        const oldEntries = allEntries.filter(e => e.date < today);

        if (oldEntries.length > 0) {
            // ⚠️ SOFT WARNING: User entscheidet was er tun will
            const uniqueDates = [...new Set(oldEntries.map(e => e.date))].sort();
            const datesList = uniqueDates.join(", ");
            
            const userChoice = confirm(
                `⚠️ ACHTUNG: ${oldEntries.length} ungesendete Einträge gefunden!\n\n` +
                `Datum(e): ${datesList}\n\n` +
                `OK = Alte Einträge jetzt ansehen und senden\n` +
                `Abbrechen = Später senden (neue Einträge für heute scannen)`
            );
            
            if (userChoice) {
                // User will alte Einträge senden
                eintraege = oldEntries;
                renderTable();
                
                // Visueller Hinweis
                document.body.style.backgroundColor = "#fff3cd";
                document.querySelector("h1").textContent = "⚠️ ALTE EINTRÄGE - BITTE SENDEN!";
            } else {
                // User will neue Einträge scannen - zeige heutige
                eintraege = await dbLoadEntries(today, ma);
                renderTable();
                
                // Zeige dezente Warnung oben
                const warning = document.createElement("div");
                warning.id = "oldEntriesWarning";
                warning.style.cssText = "background:#ff9800;color:#fff;padding:10px;text-align:center;font-weight:bold;";
                warning.innerHTML = `⚠️ ${oldEntries.length} alte Einträge nicht vergessen!`;
                document.body.insertBefore(warning, document.body.firstChild);
            }
            
        } else {
            // ✓ Alles gut, zeige heutige Einträge
            eintraege = await dbLoadEntries(today, ma);
            renderTable();
        }
    }
});


// =====================================================
// Eintrag speichern oder aktualisieren
// =====================================================
let isAddingEntry = false;
document.getElementById("addEntry").addEventListener("click", async () => {
    if (isAddingEntry) {
        console.warn("⚠ Eintrag wird bereits gespeichert, ignoriere Mehrfachklick!");
        return;
    }
    
    isAddingEntry = true;
    const addButton = document.getElementById("addEntry");
    const originalText = addButton.textContent;
    addButton.disabled = true;

    try {
        const ma = localStorage.getItem("mitarbeiter");
        if (!ma) {
            alert("Bitte Mitarbeitnummer speichern!");
            return;
        }

        // 🔴 KRITISCH: Validierung - Barcode muss ausgefüllt sein
        const barcodeValue = document.getElementById("barcode").value.trim();
        if (!barcodeValue) {
            alert("⚠️ Bitte Barcode eingeben!");
            return;
        }

        const entry = {
            barcode: barcodeValue,
            spedition: document.getElementById("spedition").value,
            artikel: document.getElementById("artikel").value,
            bemerkung: document.getElementById("bemerkung").value,
            hundert: sanitizeNumber(document.getElementById("hundert").value),
            fuenfzig: sanitizeNumber(document.getElementById("fuenfzig").value),
            info: document.getElementById("info").value.toLowerCase(),
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

        // 🎯 SMART: Lade das Datum das gerade angezeigt wird
        const currentDate = eintraege.length > 0 ? eintraege[0].date : getToday();
        eintraege = await dbLoadEntries(currentDate, ma);
        renderTable();
        clearForm();
    } finally {
        isAddingEntry = false;
        addButton.disabled = false;
        addButton.textContent = originalText;
    }
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

    const ma = localStorage.getItem("mitarbeiter");
    
    // 🔴 FIX: Datum VOR dem Löschen merken (nicht danach!)
    const entryToDelete = eintraege.find(e => e.id === id);
    const currentDate = entryToDelete?.date || getToday();
    
    await dbDeleteEntry(id);
    
    eintraege = await dbLoadEntries(currentDate, ma);
    renderTable();
};


// =====================================================
// Scanner starten & stoppen
// =====================================================
let isScannerStarting = false;
document.getElementById("startScanner").addEventListener("click", () => {
    if (isScannerStarting) return;
    isScannerStarting = true;
    
    startScanner((barcode) => {
        document.getElementById("barcode").value = barcode;
        stopScanner();
        isScannerStarting = false;
    });
});

document.getElementById("stopScanner").addEventListener("click", () => {
    stopScanner();
    isScannerStarting = false;
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
        // 🔴 TIMEOUT: 3 Minuten (Render.com Cold Start kann lange dauern!)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 Minuten
        
        const response = await fetch("https://rieperlogistics.onrender.com/upload",{  
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, csvData }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        const result = await response.json();
        console.log("Upload Ergebnis:", result);

        if (result.success) {
            // 🎯 KRITISCHER FIX: Lösche ALLE Datümer die in eintraege sind
            // (wichtig bei Multi-Tages-Upload: Freitag + Samstag + Sonntag)
            const uniqueDates = [...new Set(eintraege.map(e => e.date))];
            console.log(`🗑️ Lösche Einträge von: ${uniqueDates.join(", ")}`);
            
            for (const date of uniqueDates) {
                await dbClearByDateAndMitarbeiter(date, ma);
                console.log(`✓ Gelöscht: ${date}`);
            }
            
            // ⚠️ REKURSIVE PRÜFUNG: Gibt es noch alte Daten von anderen Tagen?
            const allRemaining = await dbLoadAllEntriesByMitarbeiter(ma);
            const today = getToday();
            const stillOldEntries = allRemaining.filter(e => e.date < today);
            
            if (stillOldEntries.length > 0) {
                // Es gibt NOCH alte Daten (von anderen Sessions/Tagen)
                const oldDates = [...new Set(stillOldEntries.map(e => e.date))].sort().join(", ");
                
                alert(
                    `✅ Upload erfolgreich!\n\n` +
                    `⚠️ Aber: Du hast noch ${stillOldEntries.length} Einträge von anderen Tagen!\n\n` +
                    `Datum(e): ${oldDates}\n\n` +
                    `Diese werden jetzt angezeigt.`
                );
                
                eintraege = stillOldEntries;
                renderTable();
                
                // Warnung-Modus bleibt aktiv
                document.body.style.backgroundColor = "#fff3cd";
                document.querySelector("h1").textContent = "⚠️ NOCH ALTE EINTRÄGE - BITTE SENDEN!";
                
            } else {
                // ✓ Alles clean! Keine alten Daten mehr
                alert("✅ Upload erfolgreich — Alle Daten gesichert!");
                
                eintraege = await dbLoadEntries(today, ma);
                renderTable();
                
                // Visuellen Warnung-Modus zurücksetzen
                document.body.style.backgroundColor = "";
                document.querySelector("h1").textContent = "Rieper Logistics Scanner";
                
                // Entferne dezente Warnung falls vorhanden
                const warning = document.getElementById("oldEntriesWarning");
                if (warning) warning.remove();
            }
            
        } else {
            alert("❌ Upload fehlgeschlagen: " + result.error + "\n\nDaten bleiben lokal gespeichert!");
        }

    } catch (err) {
        console.error("❌ Netzwerkfehler beim Upload:", err);
        
        if (err.name === 'AbortError') {
            alert(
                "⏱️ Backend antwortet nicht (Timeout nach 3 Minuten).\n\n" +
                "Mögliche Gründe:\n" +
                "- Render.com ist offline\n" +
                "- Keine Internetverbindung\n\n" +
                "Daten bleiben lokal gespeichert - später nochmal versuchen!"
            );
        } else {
            alert("❌ Upload fehlgeschlagen — Backend nicht erreichbar!\n\nDaten bleiben lokal gespeichert.");
        }
    }
}

// =====================================================
// Event Listener mit Schutz gegen doppelte Ausführung
// =====================================================
const sendButton = document.getElementById("sendToDropbox");

// Nur einmal ausführen pro Klick
let isSending = false;
sendButton.addEventListener("click", async () => {
    if (isSending) {
        console.warn("⚠ Upload läuft bereits, Mehrfachklick ignoriert!");
        return;
    }
    
    isSending = true;
    sendButton.disabled = true;
    sendButton.textContent = "🔄 Wird gesendet... (kann bis 3 Min dauern)";
    
    try {
        await sendDailyDataToBackend();
    } finally {
        isSending = false;
        sendButton.disabled = false;
        sendButton.textContent = "Daten an Dropbox senden";
    }
});