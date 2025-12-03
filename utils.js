// ======================================================================
// utils.js – Hilfsfunktionen der App
// ======================================================================
//
// Enthält:
//   - getToday()       → liefert heutiges Datum im Format YYYY-MM-DD
//   - sanitizeNumber() → wandelt Eingaben zuverlässig in Zahlen um
//   - getClientId()    → erzeugt/liest eine eindeutige Geräte-ID
//   - lastSync Speicherfunktionen
//
// Diese Datei hilft allen anderen Modulen dabei,
// konsistente Werte zu verwenden (Datum, Nummern, Device-ID).
// ======================================================================



// ======================================================================
// Heutiges Datum im Format YYYY-MM-DD
// → wichtig für: Dateifilter, Tagesabschluss, Autosync
// ======================================================================
export function getToday() {
    return new Date().toISOString().split("T")[0];
}



// ======================================================================
// Zahlen aus Inputfeldern sicher in Integer umwandeln
//
// Beispiele:
//   ""     → 0
//   "25"   → 25
//   "001"  → 1
//   "abc"  → 0
//
// verhindert NaN in der Datenbank
// ======================================================================
export function sanitizeNumber(value) {
    const num = parseInt(value, 10);
    return isNaN(num) ? 0 : num;
}



// ======================================================================
// Gerätespezifische ID erzeugen und merken
//
// Warum?
//  - Wenn 2 Mitarbeiter versehentlich die gleiche Nummer eingeben,
//    unterscheiden sich trotzdem ihre Dateien.
//
// Funktion:
//   - Prüft: existiert clientId in localStorage?
//   - Wenn nein → neue UUID erzeugen & speichern
//   - Gibt ID als String zurück
//
// Beispiel Ausgabe:
//   "device_3f2d9a87b1d74c889f2f"
// ======================================================================
export function getClientId() {

    let id = localStorage.getItem("clientId");

    if (!id) {
        id = "device_" + crypto.randomUUID();
        localStorage.setItem("clientId", id);
    }

    return id;
}



// ======================================================================
// LAST SYNC DATUM SPEICHERN
//
// Speichert das Datum des letzten erfolgreichen Uploads.
// Wird vom Auto-Sync genutzt.
//
// Format: "YYYY-MM-DD"
// ======================================================================
export function setLastSyncDate(date) {
    localStorage.setItem("lastSync", date);
}



// ======================================================================
// LAST SYNC DATUM LADEN
//
// Gibt das String-Datum zurück oder null, wenn nie gesendet.
// ======================================================================
export function getLastSyncDate() {
    return localStorage.getItem("lastSync");
}