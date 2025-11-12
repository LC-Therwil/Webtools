import React, { useState, useRef } from "react";
import Papa from "papaparse";
import parsePhoneNumber from 'libphonenumber-js'

// CSV Processor - Single-file React component
// Features:
// - Upload CSV (drag/drop or file input)
// - Parses locally in the browser using PapaParse
// - Basic processing: trim values, optional uppercase a chosen column, add a "ProcessedAt" timestamp
// - Preview first 10 rows
// - Download processed CSV

export default function CSVProcessor() {
  const [filename, setFilename] = useState(null);
  const [rawData, setRawData] = useState(null); // array of objects
  const [processedData, setProcessedData] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [originalHeaders, setOriginalHeaders] = useState([]); // Store original CSV headers
  const [status, setStatus] = useState("");
  const [csvDelimiter, setCsvDelimiter] = useState(","); // Store detected delimiter
  const [warnings, setWarnings] = useState([]); // Store processing warnings
  const fileInputRef = useRef(null);

  function handleFiles(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFilename(file.name);
    setStatus("Analysiere...");

    // Read file as ArrayBuffer to handle encoding properly
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;

      // Try to detect encoding and convert to proper UTF-8 string
      let csvText;
      try {
        // First try UTF-8
        const utf8Decoder = new TextDecoder('utf-8');
        csvText = utf8Decoder.decode(arrayBuffer);

        // If we see replacement characters, try Windows-1252/ISO-8859-1
        if (csvText.includes('�')) {
          const latinDecoder = new TextDecoder('windows-1252');
          csvText = latinDecoder.decode(arrayBuffer);
        }
      } catch (err) {
        // Fallback to ISO-8859-1 if UTF-8 fails
        const latinDecoder = new TextDecoder('iso-8859-1');
        csvText = latinDecoder.decode(arrayBuffer);
      }

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: "", // Let Papa auto-detect (handles both comma and semicolon)
        complete: (results) => {
          const data = results.data;
          const cols = results.meta.fields || (data.length ? Object.keys(data[0]) : []);
          setRawData(data);
          setOriginalHeaders(cols); // Store original headers
          setCsvDelimiter(results.meta.delimiter || ","); // Store the detected delimiter
          setWarnings([]); // Clear previous warnings

          // Automatically process the data
          const isSchnuppertraining = cols.some((col) =>
            typeof col === "string" && col.toLowerCase().includes("schnuppertraining")
          );

          if (isSchnuppertraining) {
            processDataSchnuppertraining(data, cols);
          } else {
            processDataAnmeldung(data, cols);
          }

          const fileType = isSchnuppertraining ? "Schnuppertraining" : "Anmeldung";

          setStatus(`${data.length} Zeilen und ${cols.length} Spalten analysiert und verarbeitet (Dateiart: ${fileType}, Trennzeichen: ${results.meta.delimiter})`);
        },
        error: (err) => {
          setStatus("Fehler beim Analysieren der CSV: " + err.message);
        },
      });
    };

    reader.onerror = () => {
      setStatus("Fehler beim Lesen der Datei");
    };

    reader.readAsArrayBuffer(file);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function doParsePhoneNumber(number) {
    if (!number || typeof number !== "string") return "";
    let cleaned = number.replace(/[\s']+/g, '');

    const phoneNumber = parsePhoneNumber(cleaned, "CH");

    let cleanedNumber = phoneNumber.country === 'CH' ? phoneNumber.formatNational() : phoneNumber.formatInternational();
    
    return cleanedNumber;
  }

  function parseAHV(ahv) {
    if (!ahv || typeof ahv !== "string") return false;
    const cleaned = ahv.replace(/[\s.]+/g, '');
    if (cleaned.length !== 13) return false;

    let pruefziffer = parseInt(cleaned.charAt(12), 10);
    let sum = 0;
    for (let i = 11; i >= 0; i--) {
        let multiplier = (i % 2 === 0) ? 1 : 3;
        sum += parseInt(cleaned.charAt(i), 10) * multiplier;
    }

    if (((10 - (sum % 10)) % 10) !== pruefziffer) {
        throw new Error("Ungültige AHV-Nummer");
    }

    let formatted = cleaned.slice(0, 3) + "." + cleaned.slice(3, 7) + "." + cleaned.slice(7, 11) + "." + cleaned.slice(11);
    return formatted;
  }

  function computeAnrede(geschlecht) {
    if (!geschlecht || typeof geschlecht !== "string") 
      throw new Error("Geschlecht fehlt - Anrede leer gelassen");

      const geschlechtLower = geschlecht.toLowerCase().trim();
      if (geschlechtLower === "weiblich") {
        return "Frau";
      } else if (geschlechtLower === "männlich") {
        return "Herr";
      } 
      
      throw new Error(`Unbekanntes Geschlecht "${geschlecht}" - Anrede leer gelassen`);
  }

  function computeEintritt(erhaltenAm) {
    if (!erhaltenAm || typeof erhaltenAm !== "string") {
      throw new Error(`"Erhalten am" Datum fehlt - Eintritt leer gelassen`);
    }

    // Extract date from format "dd.mm.YYYY hour:min:sec"
    const dateMatch = erhaltenAm.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      return `${day}.${month}.${year}`;
    }

    throw new Error(`Ungültiges Datumsformat in "Erhalten am": "${erhaltenAm}"`);
  }

  function computeStatus(mitgliedschaft) {
    if (!mitgliedschaft || typeof mitgliedschaft !== "string") {
      throw new Error(`Mitgliedschaft fehlt`);
    }

    if (mitgliedschaft.startsWith("Kindermitglied")) {
      return "Kindermitglied";
    } else if (mitgliedschaft.startsWith("Jugendmitglied")) {
      return "Jugendmitglied";
    } else if (mitgliedschaft.startsWith("Nachwuchsmitglied")) {
      return "Nachwuchsmitglied";
    } else if (mitgliedschaft.startsWith("Aktivmitglied (Fitnessgruppe)")) {
      return "Aktivmitglied (Fitness)";
    } else if (mitgliedschaft.startsWith("Aktivmitglied")) {
      return "Aktivmitglied";
    } else if (mitgliedschaft.startsWith("Passivmitglied")) {
      return "Passivmitglied";
    } else if (mitgliedschaft.startsWith("Wettkampffunktionär:in")) {
      return "Staff LC Therwil";
    } else if (mitgliedschaft.startsWith("Trainer:in")) {
      return "Staff LC Therwil";
    } 
    
    throw new Error(`Unbekannte Mitgliedschaft "${mitgliedschaft}"`);
  }

  function processDataAnmeldung(data, cols) {
    const processingWarnings = [];

    const processed = data.map((row, index) => {
      const newRow = {};
      for (const key of cols) {
        let v = row[key];
        if (v === null || v === undefined) {
          newRow[key] = v;
          continue;
        }
        // Trim strings
        if (typeof v === "string") v = v.trim();
        
        // Column mapping - rename columns
        const mappedKey = key === "AHV-Nummer (756.xxxx.xxxx.xx)" ? "AHV-Nummer" :
                          key;
        newRow[mappedKey] = v;
      }

      // Create "Anrede" column based on "Geschlecht"
      try {
        newRow["Anrede"] = computeAnrede(newRow["Geschlecht"]);
      } catch (err) {
        newRow["Anrede"] = "";
        processingWarnings.push(`Zeile ${index + 1}: ${err.message}`);
      }

      // Create "Briefanrede" column with personalized greeting
      newRow["Briefanrede"] = "Liebe(r) ...";

      // Create "Eintritt" column based on "Erhalten am" date
      try {
        newRow["Eintritt"] = computeEintritt(newRow["Erhalten am"]);
      } catch (err) {
        newRow["Eintritt"] = "";
        processingWarnings.push(`Zeile ${index + 1}: ${err.message}`);
      }

      // Create "Status" column based on "Mitgliedschaft"
      try {
        newRow["Status"] = computeStatus(newRow["Mitgliedschaft"]);
      } catch (err) {
        newRow["Status"] = "";
        processingWarnings.push(`Zeile ${index + 1}: ${err.message}`);
      }

      newRow["Notfallnummer"] = doParsePhoneNumber(newRow["Notfallnummer"]);
      newRow["Telefon Privat"] = doParsePhoneNumber(newRow["Mobiltelefon Athlet:in"]);
      newRow["Telefon Mobil"] = doParsePhoneNumber(newRow["Mobiltelefon Mutter"]);
      newRow["Telefon Geschäft"] = doParsePhoneNumber(newRow["Mobiltelefon Vater"]);

      // Email assignment with priority: Athlet -> Mutter -> Vater
      const emailAthlet = newRow["Email Athlet:in"];
      const emailMutter = newRow["Email Mutter"];
      const emailVater = newRow["Email Vater"];
      
      newRow["E-Mail"] = emailAthlet || emailMutter || emailVater || "";
      if (!newRow["E-Mail"]) {
        processingWarnings.push(`Zeile ${index + 1}: Keine E-Mail Adresse gefunden für Athlet:in, Mutter oder Vater`);
      }
      
      // Alternative email: use remaining emails not used as primary
      if (emailAthlet) {
        newRow["E-Mail Alternativ"] = emailMutter || emailVater || "";
      } else if (emailMutter) {
        newRow["E-Mail Alternativ"] = emailVater || "";
      } else {
        newRow["E-Mail Alternativ"] = "";
      }

      try {
        newRow["AHV-Nummer"] = parseAHV(newRow["AHV-Nummer"]);
      } catch (err) {
        processingWarnings.push(`Zeile ${index + 1}: Ungültige AHV-Nummer "${newRow["AHV-Nummer"]}"`);
      }

      newRow["Bemerkungen"] = "";

      newRow["ProcessedAt"] = new Date().toISOString();
      return newRow;
    });

    // Update headers to include new columns with Anrede at first position
    // const newHeaders = ["Anrede", "Briefanrede", "Eintritt", "Status", ...cols, "ProcessedAt"];
    const newHeaders = ["Anrede", "Briefanrede", "Vorname", "Nachname", "Adresse", "PLZ", "Ort", "Land", "Geschlecht", "Eintritt", "Status", "Notfallnummer", "AHV-Nummer", "Email Vater", "Telefon Privat", "Telefon Mobil", "Telefon Geschäft", "E-Mail", "E-Mail Alternativ", "Geburtsdatum", "Nationalität", "Bemerkungen"];
    setHeaders(newHeaders);
    setProcessedData(processed);
    setWarnings(processingWarnings);
  }

  function processDataSchnuppertraining(data, cols) {
    const processingWarnings = [];

    const processed = data.map((row, index) => {
      const newRow = {};
      for (const key of cols) {
        let v = row[key];
        if (v === null || v === undefined) {
          newRow[key] = v;
          continue;
        }
        // Trim strings
        if (typeof v === "string") v = v.trim();
        
        // Column mapping - rename columns
        const mappedKey = key === "AHV-Nummer (756.xxxx.xxxx.xx)" ? "AHV-Nummer" :
                          key === "E-Mail Erziehungsberechtigte" ? "E-Mail" :
                          key === "Vorname Athlet:in" ? "Vorname" :
                          key === "Nachname Athlet:in" ? "Nachname" :
                          key === "Geschlecht Athlet:in" ? "Geschlecht" :
                          key === "Geburtsdatum Athlet:in" ? "Geburtsdatum" :
                          key;
        newRow[mappedKey] = v;
      }

      // Create "Anrede" column based on "Geschlecht"
      try {
        newRow["Anrede"] = computeAnrede(newRow["Geschlecht"]);
      } catch (err) {
        newRow["Anrede"] = "";
        processingWarnings.push(`Zeile ${index + 1}: ${err.message}`);
      }

      // Create "Briefanrede" column with personalized greeting
      newRow["Briefanrede"] = "Liebe(r) ...";

      newRow["Notfallnummer"] = doParsePhoneNumber(newRow["Notfallnummer"]);
      newRow["Telefon Privat"] = newRow["Notfallnummer"]

      try {
        newRow["AHV-Nummer"] = parseAHV(newRow["AHV-Nummer"]);
      } catch (err) {
        processingWarnings.push(`Zeile ${index + 1}: Ungültige AHV-Nummer "${newRow["AHV-Nummer"]}"`);
      }

      const currentDate = new Date();
      const currentDateString = `${String(currentDate.getDate()).padStart(2, '0')}.${String(currentDate.getMonth() + 1).padStart(2, '0')}.${currentDate.getFullYear()}`;
      newRow["Bemerkungen"] = `Schnuppert ab ${currentDateString}`;

      newRow["ProcessedAt"] = new Date().toISOString();
      return newRow;
    });

    // Update headers to include new columns with Anrede at first position
    // const newHeaders = ["Anrede", "Briefanrede", "Eintritt", "Status", ...cols, "ProcessedAt"];
    const newHeaders = ["Anrede", "Briefanrede", "Vorname", "Nachname", "Adresse", "PLZ", "Ort", "Land", "Geschlecht", "Notfallnummer", "AHV-Nummer", "Telefon Privat", "E-Mail", "Geburtsdatum", "Bemerkungen"];
    setHeaders(newHeaders);
    setProcessedData(processed);
    setWarnings(processingWarnings);
  }

  function downloadCSV() {
    if (!processedData) return;
    const csv = Papa.unparse(processedData, {
      columns: headers,
      delimiter: csvDelimiter // Use the same delimiter as the input file
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const outName = filename ? filename.replace(/(\.csv)?$/i, "") + "_processed.csv" : "processed.csv";
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex items-start justify-center">
      <div className="w-full max-w-7xl bg-white rounded-2xl shadow-lg p-6">
        <h1 className="text-2xl font-semibold mb-2">LCT Clubdesk Anmeldungs- & Schnuppertrainingsdatei Umwandlung</h1>

        <ol className="text-sm text-slate-500 mb-4 list-decimal list-inside space-y-1">
          <li>Anmeldungen aus Clubdesk exportieren</li>
          <li>CSV Datei hier hochladen</li>
          <li>Verarbeitete CSV Datei hier herunterladen</li>
          <li>Verarbeitete CSV Datei in Clubdesk importieren</li>
        </ol>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 mb-4 text-center cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="text-slate-600">CSV-Datei hier hinziehen oder klicken zum Auswählen</div>
          <div className="mt-2 text-xs text-slate-400">Dateiname: {filename || "(keine)"}</div>
        </div>

        <div className="flex gap-3 items-center mb-4">
          <button
            onClick={downloadCSV}
            className="ml-auto bg-emerald-600 text-white px-4 py-2 rounded shadow hover:opacity-90"
            disabled={!processedData}
          >
            Verarbeitete CSV-Datei herunterladen
          </button>
        </div>

        <div className="mb-4 text-sm text-slate-500">Status: {status || "bereit"}</div>

        {warnings.length > 0 && (
          <div className="mb-6 p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-yellow-800">Warnungen ({warnings.length})</h3>
            <div className="max-h-40 overflow-y-auto">
              <ul className="text-sm text-yellow-700 space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-yellow-600 mr-2">⚠</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {rawData && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2 text-slate-700">Originaldaten (Erste 10 Zeilen)</h2>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full table-fixed border-collapse min-w-max">
                  <thead>
                    <tr>
                      {originalHeaders.map((h) => (
                        <th key={h} className="border px-3 py-2 text-left text-xs bg-slate-100 min-w-[120px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.slice(0, 10).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        {originalHeaders.map((h) => (
                          <td key={h} className="border px-3 py-2 text-xs min-w-[120px] break-words">{String(row?.[h] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {processedData && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2 text-slate-700">Verarbeitete Daten (Erste 10 Zeilen)</h2>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full table-fixed border-collapse min-w-max">
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h} className="border px-3 py-2 text-left text-xs bg-emerald-100 min-w-[120px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.slice(0, 10).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-emerald-50"}>
                          {headers.map((h) => (
                            <td key={h} className="border px-3 py-2 text-xs min-w-[120px] break-words">{String(row?.[h] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8 p-6 bg-slate-100 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-slate-800 flex items-center">
            <span className="mr-2">ℹ️</span>
            Verarbeitungsschritte
          </h3>
          <div className="text-sm text-slate-700 space-y-3">
            <p className="font-medium">Die folgenden Transformationen werden automatisch auf die CSV-Daten angewendet:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">Neue Spalten erstellen:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Anrede:</strong> "Frau" oder "Herr" basierend auf Geschlecht</li>
                  <li>• <strong>Eintritt:</strong> Datum aus "Erhalten am" extrahiert (dd.mm.yyyy) (nur bei Anmeldungen)</li>
                  <li>• <strong>Status:</strong> Mitgliedschaftstyp aus "Mitgliedschaft" abgeleitet (nur bei Anmeldungen)</li>
                  <li>• <strong>Bemerkungen:</strong> Aktuelles Datum als Schnupperstart (nur bei Schnuppertraining)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">Daten bereinigen:</h4>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Telefonnummern:</strong> Formatierung nach CH-Standard</li>
                  <li>• <strong>E-Mail Zuordnung:</strong> Priorität Athlet→Mutter→Vater</li>
                  <li>• <strong>AHV-Nummer:</strong> Validierung und Formatierung</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-xs text-blue-800">
                <strong>Hinweis:</strong> Die Verarbeitung erfolgt vollständig im Browser. Keine Daten werden an externe Server gesendet. 
                Warnungen werden angezeigt, wenn Daten nicht den erwarteten Formaten entsprechen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
