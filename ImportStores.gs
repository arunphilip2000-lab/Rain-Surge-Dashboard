/**
 * ImportStores.gs
 * ---------------------------------------------------------------------------
 * One-time (or repeatable) importer for master store lists that come in the
 * "raw export" shape rather than the clean Stores tab format:
 *
 *   Raw columns : Cities | Stores | Latitude | Longitude
 *     - "Cities" is only filled on the FIRST row of each city group and
 *       blank for the rest (a flattened merged-cell export).
 *     - "Stores" is a combined identifier like
 *       "BOM_Dahisareast_ANow_TML4" — everything after the last
 *       underscore is the store code (e.g. "TML4"); the rest is the name.
 *     - A single "Stores" cell can ALSO contain more than one store,
 *       separated by line breaks (seen in the source data: one Ahmedabad
 *       cell packed 3 stores into 1 cell). When that happens, only the
 *       LAST store in that cell keeps the row's Latitude/Longitude — the
 *       others have no coordinates in the source data and are imported
 *       with blank lat/long plus a console warning, since inventing
 *       coordinates would be worse than flagging the gap.
 *
 *   Normalized columns (what Sheets.gs actually reads) :
 *       City | StoreName | StoreCode | Latitude | Longitude
 *
 * Usage:
 *   1. Paste your raw export into a new tab named exactly "RawStores"
 *      (headers in row 1: Cities, Stores, Latitude, Longitude).
 *   2. Select `importStoresFromRaw` in the Apps Script editor and Run.
 *   3. It (re)writes the "Stores" tab from scratch — safe to re-run
 *      whenever the master list changes.
 *   4. Check the Executions log for any "missing coordinates" warnings
 *      and fill those cells in manually in the Stores tab.
 * ---------------------------------------------------------------------------
 */

function importStoresFromRaw() {
  const ss = ss_();
  const raw = ss.getSheetByName("RawStores");
  if (!raw) {
    throw new Error('No "RawStores" tab found. Paste your raw export there first (see ImportStores.gs header comment).');
  }

  const rows = raw.getDataRange().getValues().slice(1); // drop header row
  const normalized = [];
  let currentCity = "";
  const seenCodes = new Set();
  const missingCoords = [];

  rows.forEach(([city, storeCell, lat, lon]) => {
    if (city && String(city).trim()) currentCity = String(city).trim();
    if (!storeCell || !String(storeCell).trim()) return; // skip blank separator rows

    // A cell can contain more than one store, separated by line breaks.
    const entries = String(storeCell)
      .split("\n")
      .map((e) => e.trim())
      .filter(Boolean);

    entries.forEach((entry, i) => {
      const parts = entry.split("_");
      const storeCode = parts.length > 1 ? parts[parts.length - 1] : entry;
      const storeName = parts.length > 1 ? parts.slice(0, -1).join("_") : entry;
      const isLast = i === entries.length - 1;

      if (seenCodes.has(storeCode)) {
        console.warn(`Duplicate store code "${storeCode}" for "${entry}" — check the raw data.`);
      }
      seenCodes.add(storeCode);

      // Only the last store in a multi-store cell inherits that row's
      // coordinates — the others have no coordinates in the source data.
      const rowLat = isLast ? lat : "";
      const rowLon = isLast ? lon : "";
      if (!isLast) missingCoords.push(storeCode);

      normalized.push([currentCity, storeName, storeCode, rowLat, rowLon]);
    });
  });

  const storesSheet = sheet_(CFG.SHEETS.STORES, CFG.STORE_HEADERS);
  // Clear everything below the header, then write the fresh normalized set.
  const lastRow = storesSheet.getLastRow();
  if (lastRow > 1) {
    storesSheet.getRange(2, 1, lastRow - 1, CFG.STORE_HEADERS.length).clearContent();
  }
  if (normalized.length) {
    storesSheet.getRange(2, 1, normalized.length, CFG.STORE_HEADERS.length).setValues(normalized);
  }

  console.log(`Imported ${normalized.length} stores across ${new Set(normalized.map((r) => r[0])).size} cities.`);
  if (missingCoords.length) {
    console.warn(`Stores missing coordinates (fill in manually in the Stores tab): ${missingCoords.join(", ")}`);
  }
  SpreadsheetApp.getUi()?.alert(
    `Imported ${normalized.length} stores into the Stores tab.` +
      (missingCoords.length ? ` ${missingCoords.length} store(s) need coordinates filled in manually — see the Executions log.` : "")
  );
}
