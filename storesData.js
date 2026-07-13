/**
 * storesData.js
 * ---------------------------------------------------------------------------
 * Embedded copy of your master store list -- City, Store Name, Store Code,
 * Latitude, Longitude -- extracted and normalized from
 * "Untitled_spreadsheet_completed.xlsx" (94 stores, 10 cities).
 *
 * This is NOT the live data source. Once the Apps Script backend is
 * deployed (see README.md phases 1-7), the dashboard reads live data from
 * the `Stores` tab in Google Sheets on every poll -- this file is only a
 * local fallback so the dashboard has real store details (city, lat/long)
 * to render immediately in VS Code, before the backend is wired up.
 *
 * KNOWN DATA GAP: one cell in the source file packed three store names
 * into a single cell (line-break separated) but only carried ONE set of
 * coordinates for all three. TEA6 and TEA9 below are the two that lost
 * their coordinates as a result -- latitude/longitude are null until you
 * fill them in (here and in the Stores tab in Google Sheets).
 *
 * If you update the master list later, re-paste into the `Stores` tab in
 * Google Sheets (source of truth) -- you do not need to edit this file too.
 * ---------------------------------------------------------------------------
 */

const STORE_DATA = [
  { city: 'Mumbai', storeName: 'BOM_Dahisareast_ANow', storeCode: 'TML4', latitude: 19.2574665, longitude: 72.8650191 },
  { city: 'Mumbai', storeName: 'BOM_Dahisarwest_ANow', storeCode: 'TML3', latitude: 19.2546655, longitude: 72.8538822 },
  { city: 'Mumbai', storeName: 'BOM_JogeshwariEast_ANow', storeCode: 'TML2', latitude: 19.1354492, longitude: 72.85750879999999 },
  { city: 'Mumbai', storeName: 'BOM_Borivali_ANow', storeCode: 'TMJ9', latitude: 19.2307329, longitude: 72.856673 },
  { city: 'Mumbai', storeName: 'MUM_AmbernarthWest_ANow', storeCode: 'TMQ1', latitude: 19.2038, longitude: 73.1867 },
  { city: 'Mumbai', storeName: 'MUM_Gundavali_ANow', storeCode: 'TMF2', latitude: 19.2463238, longitude: 73.0343934 },
  { city: 'Mumbai', storeName: 'BOM_VasaiEast_ANow', storeCode: 'TMO7', latitude: 19.4055741, longitude: 72.8557411 },
  { city: 'Mumbai', storeName: 'MUM_Shilfataroad_ANow', storeCode: 'TMO6', latitude: 19.1864953, longitude: 73.0915674 },
  { city: 'Mumbai', storeName: 'MUM_ThaneW_ANow', storeCode: 'TMO5', latitude: 19.2467218, longitude: 72.9759713 },
  { city: 'Mumbai', storeName: 'MUM_DombivaliEast_ANow', storeCode: 'TMP3', latitude: 19.2161427, longitude: 73.0989616 },
  { city: 'Mumbai', storeName: 'MUM_Vashi_ANow', storeCode: 'TMR7', latitude: 18.7501386, longitude: 73.0420662 },
  { city: 'Mumbai', storeName: 'MUM_MadhubanChowk_ANow', storeCode: 'TMP2', latitude: 28.70311, longitude: 77.13247 },
  { city: 'Mumbai', storeName: 'MUM_Siddarthnagar_ANow', storeCode: 'TMR1', latitude: 27.2715633, longitude: 82.82097399999999 },
  { city: 'Mumbai', storeName: 'MUM_Sakinaka_ANow', storeCode: 'TMJ8', latitude: 19.0961829, longitude: 72.88774219999999 },
  { city: 'Mumbai', storeName: 'MUM_KalyanWest_ANow', storeCode: 'TMP7', latitude: 19.2446361, longitude: 73.1235274 },
  { city: 'Mumbai', storeName: 'MUM_Sewri_ANow', storeCode: 'TMR6', latitude: 18.9924132, longitude: 72.8547164 },
  { city: 'Mumbai', storeName: 'MUM_Ulwe_ANow', storeCode: 'TMR3', latitude: 18.972009, longitude: 73.0348229 },
  { city: 'Pune', storeName: 'PUN_Talhaveli_ANow', storeCode: 'TPC9', latitude: 18.7176722, longitude: 73.7670914 },
  { city: 'Pune', storeName: 'PUN_Tathawade_ANow', storeCode: 'TPC4', latitude: 18.627597, longitude: 73.74549 },
  { city: 'Ahmedabad', storeName: 'AMD_Chenpur_ANow', storeCode: 'TEA6', latitude: null, longitude: null },  // ⚠ missing coordinates in source file — fill in manually
  { city: 'Ahmedabad', storeName: 'AMD_Saibabatemple_ANow', storeCode: 'TEA9', latitude: null, longitude: null },  // ⚠ missing coordinates in source file — fill in manually
  { city: 'Ahmedabad', storeName: 'AMD_Motera_ANow', storeCode: 'TEA2', latitude: 21.7137051, longitude: 76.0130784 },
  { city: 'Chennai', storeName: 'CHN_Medavakkam_ANow', storeCode: 'TCB2', latitude: 12.9200089, longitude: 80.1919901 },
  { city: 'Chennai', storeName: 'CHN_Athipattu_ANow', storeCode: 'TCC7', latitude: 13.2514715, longitude: 80.3064689 },
  { city: 'Chennai', storeName: 'CHN_Korattur_ANow', storeCode: 'TCB5', latitude: 13.1081798, longitude: 80.1834167 },
  { city: 'Chennai', storeName: 'CHN_NatesanRoad_ANow', storeCode: 'TCB7', latitude: 12.9768805, longitude: 80.2607495 },
  { city: 'Chennai', storeName: 'CHN_BalajiNagar_ANow', storeCode: 'TCE5', latitude: 18.4646316, longitude: 73.8602841 },
  { city: 'Chennai', storeName: 'CHN_Madhavaram_ANow', storeCode: 'TCE4', latitude: 13.1487898, longitude: 80.2305586 },
  { city: 'Chennai', storeName: 'CHN_Thirumullaivayal_ANow', storeCode: 'TCD8', latitude: 13.1307405, longitude: 80.1314386 },
  { city: 'Chennai', storeName: 'CHN_OMRNavalur_ANow', storeCode: 'TCD6', latitude: 12.8469906, longitude: 80.2265264 },
  { city: 'Chennai', storeName: 'CHN_KannigaPuram_ANow', storeCode: 'TCE6', latitude: 13.0032072, longitude: 79.4174633 },
  { city: 'Chennai', storeName: 'CHN_Venkatapuram_ANow', storeCode: 'TCB6', latitude: 17.4938639, longitude: 78.50431669999999 },
  { city: 'Chennai', storeName: 'CHN_Kattupakkam_ANow', storeCode: 'TCC4', latitude: 13.0413894, longitude: 80.1267136 },
  { city: 'Chennai', storeName: 'CHN_Ponniammanmedu_ANow', storeCode: 'TCF3', latitude: 13.1349662, longitude: 80.2274201 },
  { city: 'Chennai', storeName: 'CHN_Anujannagar_ANow', storeCode: 'TCD2', latitude: 13.0508, longitude: 80.2075 },
  { city: 'Chennai', storeName: 'CHN_Mugalivakkam_ANow', storeCode: 'TCD7', latitude: 13.0209529, longitude: 80.16135109999999 },
  { city: 'Chennai', storeName: 'CHN_Nolambur_ANow', storeCode: 'TCB4', latitude: 13.075397, longitude: 80.1679758 },
  { city: 'Hyderabad', storeName: 'HYD_Greenhills_ANow', storeCode: 'TTC8', latitude: 39.2671883, longitude: -84.5233788 },
  { city: 'Hyderabad', storeName: 'HYD_Boduppal_ANow', storeCode: 'TTB7', latitude: 17.41412, longitude: 78.5790607 },
  { city: 'Hyderabad', storeName: 'HYD_Uppal_ANow', storeCode: 'TTB1', latitude: 17.4015441, longitude: 78.5681716 },
  { city: 'Hyderabad', storeName: 'HYD_Malkajgiricircle_ANow', storeCode: 'TTA9', latitude: 17.4503375, longitude: 78.53224809999999 },
  { city: 'Hyderabad', storeName: 'HYD_Moosapet_ANow', storeCode: 'TTA5', latitude: 17.4664636, longitude: 78.4254105 },
  { city: 'Hyderabad', storeName: 'HYD_Mirchowk_ANow', storeCode: 'TTD4', latitude: 17.3652276, longitude: 78.4769704 },
  { city: 'Hyderabad', storeName: 'HYD_IzzatNagar_ANow', storeCode: 'TTB4', latitude: 28.4025574, longitude: 79.42452159999999 },
  { city: 'Hyderabad', storeName: 'HYD_RangaReddydt_ANow', storeCode: 'TTB9', latitude: 17.3891, longitude: 78.4011 },
  { city: 'Hyderabad', storeName: 'HYD_ShapurNagar_ANow', storeCode: 'TTE2', latitude: 17.5193869, longitude: 78.4429863 },
  { city: 'Hyderabad', storeName: 'HYD_Dammaiguda_ANow', storeCode: 'TTE6', latitude: 17.5003026, longitude: 78.5938192 },
  { city: 'Hyderabad', storeName: 'HYD_Secunderabad_ANow', storeCode: 'TTB2', latitude: 17.4399295, longitude: 78.4982741 },
  { city: 'Hyderabad', storeName: 'HYD_MarredpallyWest_ANow', storeCode: 'TTE7', latitude: 17.4523906, longitude: 78.5060029 },
  { city: 'Hyderabad', storeName: 'HYD_RRdist_ANow', storeCode: 'TTB8', latitude: 17.1999602, longitude: 78.5505481 },
  { city: 'Hyderabad', storeName: 'HYD_BowenpallyCircle_ANow', storeCode: 'TTD6', latitude: 17.4764113, longitude: 78.48079589999999 },
  { city: 'Hyderabad', storeName: 'HYD_Nagole_ANow', storeCode: 'TTC5', latitude: 17.3714737, longitude: 78.5695016 },
  { city: 'Hyderabad', storeName: 'HYD_Khanamet_ANow', storeCode: 'TTB6', latitude: 17.4636188, longitude: 78.37800109999999 },
  { city: 'Lucknow', storeName: 'LKO_Rajajipuram_ANow', storeCode: 'TLB5', latitude: 26.8379544, longitude: 80.8765463 },
  { city: 'Lucknow', storeName: 'LKO_Mahanagar_ANow', storeCode: 'TLB6', latitude: 26.8785, longitude: 80.9474 },
  { city: 'Kolkata', storeName: 'KOL_NorthPargana_ANow', storeCode: 'TKD4', latitude: 22.701, longitude: 88.374 },
  { city: 'Jaipur', storeName: 'JAI_Gopalpura_ANow', storeCode: 'TJA1', latitude: 26.5712202, longitude: 75.7391805 },
  { city: 'Jaipur', storeName: 'JAI_Murlipura_ANow', storeCode: 'TJA7', latitude: 26.9776019, longitude: 75.76391869999999 },
  { city: 'Jaipur', storeName: 'JAI_TonkPhatak_ANow', storeCode: 'TJB2', latitude: 26.8792696, longitude: 75.7908453 },
  { city: 'Jaipur', storeName: 'JAI_Jagatpura_ANow', storeCode: 'TJA3', latitude: 26.8176736, longitude: 75.86171709999999 },
  { city: 'Bengaluru', storeName: 'BLR_UttarahalliHobli_ANow', storeCode: 'TBV8', latitude: 12.9069823, longitude: 77.552059 },
  { city: 'Bengaluru', storeName: 'BLR_YelahankaHobli,ANow', storeCode: 'TBU1', latitude: 13.05523, longitude: 77.60239399999999 },
  { city: 'Bengaluru', storeName: 'BLR_AnnapoorneshwariNagar_ANow', storeCode: 'TBW1', latitude: 12.979195, longitude: 77.50676059999999 },
  { city: 'Bengaluru', storeName: 'BLR_Domlur_ANow', storeCode: 'TBV9', latitude: 12.9609857, longitude: 77.6387316 },
  { city: 'Bengaluru', storeName: 'BLR_Yelahanka_ANow', storeCode: 'TBT9', latitude: 13.1154662, longitude: 77.6069977 },
  { city: 'Bengaluru', storeName: 'BLR_Doddakallasandra_ANow', storeCode: 'TBP9', latitude: 12.8806617, longitude: 77.55758039999999 },
  { city: 'Bengaluru', storeName: 'BLR_VarthurHobli_ANow', storeCode: 'TBV2', latitude: 12.938265, longitude: 77.7468954 },
  { city: 'Bengaluru', storeName: 'BLR_kaggadasapura_ANow', storeCode: 'TBJ4', latitude: 12.9836351, longitude: 77.6797411 },
  { city: 'Bengaluru', storeName: 'BLR_Agara_ANow', storeCode: 'TBF8', latitude: 12.9230648, longitude: 77.6464534 },
  { city: 'Bengaluru', storeName: 'BLR_KengeriHobli_ANow', storeCode: 'TBR7', latitude: 12.9017955, longitude: 77.453704 },
  { city: 'Bengaluru', storeName: 'BLR_Jayanagar_ANow', storeCode: 'TBS8', latitude: 12.9308107, longitude: 77.58385770000001 },
  { city: 'NCR', storeName: 'NCR_Narela_ANow', storeCode: 'TDJ3', latitude: 28.8548818, longitude: 77.08921509999999 },
  { city: 'NCR', storeName: 'NCR_PalamColony_ANow', storeCode: 'TDL9', latitude: 28.5900637, longitude: 77.08878279999999 },
  { city: 'NCR', storeName: 'NCR_AmritVihar_ANow', storeCode: 'TDM7', latitude: 28.7673356, longitude: 77.181407 },
  { city: 'NCR', storeName: 'NCR_Rithala_ANow', storeCode: 'TDM6', latitude: 28.7191961, longitude: 77.1006616 },
  { city: 'NCR', storeName: 'NCR_Meharulidt_ANow', storeCode: 'TDO3', latitude: 28.5204882, longitude: 77.1786869 },
  { city: 'NCR', storeName: 'NCR_VasantKunj_ANow', storeCode: 'TDD2', latitude: 28.5293121, longitude: 77.1484442 },
  { city: 'NCR', storeName: 'NCR_Burati_ANow', storeCode: 'TDD1', latitude: 43.8357351, longitude: 18.8839455 },
  { city: 'NCR', storeName: 'NCR_PremNagar_ANow', storeCode: 'TDM1', latitude: 29.5768405, longitude: 74.3271858 },
  { city: 'NCR', storeName: 'NCR_UttamNagar_ANow', storeCode: 'TDL6', latitude: 28.6195574, longitude: 77.0549901 },
  { city: 'NCR', storeName: 'NCR_Kakrola_ANow', storeCode: 'TDM4', latitude: 28.5971368, longitude: 77.0277977 },
  { city: 'NCR', storeName: 'NCR_Ramagarden_ANow', storeCode: 'TDJ7', latitude: 28.6708, longitude: 77.3304 },
  { city: 'NCR', storeName: 'NCR_IMTManesar_ANow', storeCode: 'TDK8', latitude: 28.3515381, longitude: 76.9427774 },
  { city: 'NCR', storeName: 'NCR_Chauma_ANow', storeCode: 'TFA5', latitude: 29.5942044, longitude: 79.48023169999999 },
  { city: 'NCR', storeName: 'NCR_Yojana_ANow', storeCode: 'TZA7', latitude: 28.6857, longitude: 77.2863 },
  { city: 'NCR', storeName: 'NCR_Bagpatroad_ANow', storeCode: 'TZB4', latitude: 28.9574721, longitude: 77.27246140000001 },
  { city: 'NCR', storeName: 'NCR_NITRailwayRoad_ANow', storeCode: 'TFA8', latitude: 28.3905, longitude: 77.3092 },
  { city: 'NCR', storeName: 'NCR_SaraiMarket_ANow', storeCode: 'TSF6', latitude: 28.4092, longitude: 77.3168 },
  { city: 'NCR', storeName: 'NCR_Faridabad_ANow', storeCode: 'TFB1', latitude: 28.4089123, longitude: 77.3177894 },
  { city: 'NCR', storeName: 'NCR_Mohannagar_ANow', storeCode: 'TZA2', latitude: 28.672818, longitude: 77.3862836 },
  { city: 'NCR', storeName: 'NCR_Indrapuram_ANow', storeCode: 'TZA4', latitude: 28.6460176, longitude: 77.3695166 },
  { city: 'NCR', storeName: 'NCR_Buddhanagar_ANow', storeCode: 'TNG9', latitude: 27.6867401, longitude: 85.33042119999999 },
  { city: 'NCR', storeName: 'NCR_Barola_ANow', storeCode: 'TZB6', latitude: 28.5613883, longitude: 77.3712314 },
  { city: 'NCR', storeName: 'NCR_Buddhanagar_ANow', storeCode: 'TNF7', latitude: 27.6867401, longitude: 85.33042119999999 },
];
