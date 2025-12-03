// ======================================================================
// db.js – IndexedDB-Datenbankmodul
// ======================================================================
// Dieses Modul kümmert sich um:
// - Erstellen der lokalen Datenbank
// - Speichern von Einträgen
// - Laden gefilterter Einträge (pro Datum + Mitarbeiter)
// - Aktualisieren eines Eintrags
// - Löschen eines Eintrags
// - Komplettes Löschen für Tagesabschluss / AutoSync
//
// Nichts geht verloren — wenn du ohne Internet scannst,
// bleibt alles lokal in der DB, bis es erfolgreich gesendet wurde.
// ======================================================================



// -------------------------------------------------------------
// Datenbank-Konstanten
// -------------------------------------------------------------
const DB_NAME = "rieperlogistics";
const DB_VERSION = 1;

let db = null; // globale Referenz auf die geöffnete Datenbank



// -------------------------------------------------------------
// Datenbank initialisieren
// wird 1x beim Laden der App ausgeführt
// -------------------------------------------------------------
export async function initDB() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Wenn DB nicht geöffnet werden kann
        request.onerror = () => reject("IndexedDB Fehler beim Öffnen");

        // Wenn DB erfolgreich geöffnet wurde
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        // Wird aufgerufen, wenn DB noch nicht existiert oder Version neuer ist
        request.onupgradeneeded = (e) => {
            const database = e.target.result;

            // Object Store erzeugen, falls fehlt
            if (!database.objectStoreNames.contains("entries")) {

                // keyPath: id → automatisch inkrementiert
                const store = database.createObjectStore("entries", {
                    keyPath: "id",
                    autoIncrement: true
                });

                // Indexe erstellen (wichtige Felder)
                store.createIndex("by_date", "date");
                store.createIndex("by_mitarbeiter", "mitarbeiter");
            }
        };
    });
}



// -------------------------------------------------------------
// Neuen Eintrag speichern
// -------------------------------------------------------------
export function dbAddEntry(entry) {
    return new Promise((resolve, reject) => {

        const tx = db.transaction("entries", "readwrite");

        tx.objectStore("entries").add(entry);

        tx.oncomplete = resolve;
        tx.onerror = () => reject("Fehler beim Speichern in der DB");
    });
}



// -------------------------------------------------------------
// Eintrag aktualisieren (Bearbeiten)
// -------------------------------------------------------------
export function dbUpdateEntry(entry) {
    return new Promise((resolve, reject) => {

        const tx = db.transaction("entries", "readwrite");

        tx.objectStore("entries").put(entry);

        tx.oncomplete = resolve;
        tx.onerror = () => reject("Fehler beim Aktualisieren");
    });
}



// -------------------------------------------------------------
// Eintrag löschen
// -------------------------------------------------------------
export function dbDeleteEntry(id) {
    return new Promise((resolve, reject) => {

        const tx = db.transaction("entries", "readwrite");

        tx.objectStore("entries").delete(id);

        tx.oncomplete = resolve;
        tx.onerror = () => reject("Fehler beim Löschen");
    });
}



// -------------------------------------------------------------
// Einträge eines Tages + eines Mitarbeiters laden
// wird von App benutzt, um Tabelle zu bauen
// -------------------------------------------------------------
export function dbLoadEntries(date, mitarbeiter) {

    return new Promise((resolve) => {

        const tx = db.transaction("entries", "readonly");
        const store = tx.objectStore("entries");

        const result = [];
        const cursor = store.openCursor();

        cursor.onsuccess = (e) => {

            const cur = e.target.result;

            if (cur) {
                const val = cur.value;

                // Filter: nur heutiges Datum + richtiger Mitarbeiter
                if (val.date === date && val.mitarbeiter === mitarbeiter) {
                    result.push(val);
                }

                cur.continue();

            } else {
                resolve(result); // fertig
            }
        };
    });
}



// -------------------------------------------------------------
// Datenbank komplett leeren (für erfolgreichen Tagesabschluss)
// -------------------------------------------------------------
export function dbClearAll() {
    return new Promise((resolve, reject) => {

        const tx = db.transaction("entries", "readwrite");

        tx.objectStore("entries").clear();

        tx.oncomplete = resolve;
        tx.onerror = () => reject("Fehler beim Löschen aller Einträge");
    });
}