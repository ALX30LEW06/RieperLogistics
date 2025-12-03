// ==============================================
// scanner.js – Barcode-Scanner Wrapper
// ==============================================
// Diese Version funktioniert auf allen Geräten,
// da html5-qrcode über <script> geladen wurde.
// ==============================================

let html5QrCode = null;

/**
 * Startet den Barcode-Scanner.
 * @param {function} onScan  Callback mit dem gelesenen Code
 */
export async function startScanner(onScan) {

    const reader = document.getElementById("reader");
    reader.style.display = "block";
    document.getElementById("stopScanner").style.display = "inline-block";

    // Scanner-Instanz erstellen
    html5QrCode = new Html5Qrcode("reader");

    try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
            alert("Keine Kamera gefunden!");
            return;
        }

        const backCamera = cameras[cameras.length - 1].id;

        await html5QrCode.start(
            backCamera,
            { fps: 10, qrbox: { width: 250, height: 150 } },
            decodedText => {
                onScan(decodedText);
            }
        );

    } catch (err) {
        console.error("Scanner Fehler:", err);
        alert("Kamera konnte nicht gestartet werden.");
    }
}

/**
 * Stoppt den Barcode-Scanner.
 */
export function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        });
    }

    document.getElementById("reader").style.display = "none";
    document.getElementById("stopScanner").style.display = "none";
}