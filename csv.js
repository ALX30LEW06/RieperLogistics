// ======================================================================
// CSV-Export Modul – FINAL FIXED
// ======================================================================
// Schutz vor Excel-Fehlern
// ✓ Barcodes IMMER als Text --> ="123"
// ✓ Zahlen bleiben Zahlen --> 0, 3, 5
// ✓ Umlaute und UTF-8 BOM
// ✓ Kein kaputter Header
// ======================================================================


// ----------------------------------------
// Prüft Barcode → wenn nur Zahlen: Excel-Text markieren
// ----------------------------------------
function protectBarcode(value) {
    if (/^\d+$/.test(value)) {
        return `="${value}"`; 
    }
    return value ?? "";
}

// ----------------------------------------
// CSV-Escape
// ----------------------------------------
function esc(v) {
    return `"${(v ?? "").toString().replace(/"/g, '""')}"`;
}


// ----------------------------------------
// Dateiname erzeugen
// ----------------------------------------
export function generateCsvFilename(mitarbeiter, clientId) {
    const today = new Date().toISOString().split("T")[0];
    return `${today}_DEVICE_${clientId}_MA_${mitarbeiter}.csv`;
}


// ----------------------------------------
// CSV-Inhalt erzeugen
// ----------------------------------------
export function generateCsvContent(entries) {

    const header =
        "barcode;spedition;artikel;bemerkung;hundert;fuenfzig;info;mitarbeiter;date;timestamp";

    const rows = entries.map(e => [
        protectBarcode(e.barcode),
        esc(e.spedition),
        esc(e.artikel),
        esc(e.bemerkung),
        e.hundert ?? 0,   // Zahl bleibt Zahl!
        e.fuenfzig ?? 0, // Zahl bleibt Zahl!
        esc(e.info),
        esc(e.mitarbeiter),
        esc(e.date),
        esc(e.timestamp)
    ].join(";"));

    return "\uFEFF" + header + "\n" + rows.join("\n") + "\n";
}


// ----------------------------------------
// Für Upload ans Backend
// ----------------------------------------
export function createCsvForBackend(entries, ma, clientId) {
    return {
        filename: generateCsvFilename(ma, clientId),
        csvData: generateCsvContent(entries)
    };
}