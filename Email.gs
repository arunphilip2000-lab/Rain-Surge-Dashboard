/**
 * Email.gs
 * ---------------------------------------------------------------------------
 * Sends ONE email PER CITY (not one combined report) at 12:30 AM — invoked
 * from Sheets.gs::autoShutdownAtMidnight — and can be re-run manually via
 * the "Send Report Email" button in the dashboard. Template matches the
 * exact requested format:
 *
 *   Subject : Rainfall Impact on Operations at {City}
 *   Body    : "Dear sir, Heavy rainfall impacted the below-mentioned
 *              {City} stores during the specified period, leading to
 *              elevated LM delays. Rain Surge Mode was enabled with the
 *              corresponding surge amounts listed below to support
 *              operations."
 *   Table   : Store Name | Surge Amount | Total Duration
 *   Sign-off: Regards, {SenderName} / {SenderTitle} / {CompanyName}
 *             (all three editable in the Config sheet)
 * ---------------------------------------------------------------------------
 */

/** Groups today's rows by City, then by StoreName within each city. */
function buildCityReports_() {
  const sh = logSheet_();
  const data = sh.getDataRange().getValues();
  const idx = {};
  data[0].forEach((h, i) => (idx[h] = i));
  const today = todayStr_();

  const byCity = {}; // city -> { storeName -> { amount, durationMin } }
  data.slice(1).forEach((r) => {
    if (r[idx.Date] !== today) return;
    const city = r[idx.City];
    const storeName = r[idx.StoreName];
    const amount = Number(r[idx.Amount]) || 0;
    const durationMin = parseInt(String(r[idx.Duration] || "0"), 10) || 0;

    if (!byCity[city]) byCity[city] = {};
    if (!byCity[city][storeName]) byCity[city][storeName] = { amount: 0, durationMin: 0 };
    byCity[city][storeName].amount += amount;
    byCity[city][storeName].durationMin += durationMin;
  });

  return byCity;
}

function cityEmailHtml_(city, stores) {
  const rows = Object.entries(stores)
    .map(
      ([name, v]) =>
        `<tr><td>${name}</td><td align="center">₹${v.amount}</td><td align="center">${v.durationMin} mins</td></tr>`
    )
    .join("");

  const senderName = getConfigValue_("SenderName", "Rain Surge Ops Team");
  const senderTitle = getConfigValue_("SenderTitle", "Operations");
  const companyName = getConfigValue_("CompanyName", "Your Company");

  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#1c2a38;font-size:14px">
      <p>Dear sir,</p>
      <p>Heavy rainfall impacted the below-mentioned <b>${city}</b> stores during the
      specified period, leading to elevated LM delays. Rain Surge Mode was enabled
      with the corresponding surge amounts listed below to support operations.</p>

      <table cellpadding="8" style="border-collapse:collapse;border:1px solid #ccc;margin:12px 0">
        <tr style="background:#eef2f6">
          <th align="left">Store Name</th><th align="center">Surge Amount</th><th align="center">Total Duration</th>
        </tr>
        ${rows}
      </table>

      <p>Regards,<br/>
      <b>${senderName}</b><br/>
      ${senderTitle}<br/>
      ${companyName}</p>
    </div>`;
}

/** Sends one email per city that had sessions today, EACH to that city's
 *  own recipient list — read from the Config sheet key `Recipients_{City}`
 *  (e.g. `Recipients_Mumbai`, `Recipients_NCR`). A city with no matching
 *  key falls back to the shared `ClientReportEmails` list; a city with
 *  neither is skipped (with a warning) rather than silently emailed to
 *  everyone. See Config.gs::seedCityRecipients for how the per-city rows
 *  get created. */
function sendDailyReportEmail() {
  const byCity = buildCityReports_();
  const cities = Object.keys(byCity);
  if (cities.length === 0) {
    console.warn("No Rain Surge sessions today — no report emails sent.");
    return;
  }

  const csvBlob = Utilities.newBlob(buildCsv_(), "text/csv", `RainSurge_${todayStr_()}.csv`);
  let sentCount = 0;

  cities.forEach((city) => {
    const recipients = recipientListForCity_(city);
    if (recipients.length === 0) {
      console.warn(`No recipients configured for "${city}" (Recipients_${city} or ClientReportEmails) — skipping.`);
      return;
    }

    const subject = `Rainfall Impact on Operations at ${city}`;
    const html = cityEmailHtml_(city, byCity[city]);
    recipients.forEach((to) => {
      try {
        MailApp.sendEmail({ to, subject, htmlBody: html, attachments: [csvBlob] });
        sentCount++;
      } catch (err) {
        console.error(`Failed to email ${to} for ${city}: ${err.message}`);
      }
    });
  });

  console.log(`Sent ${sentCount} email(s) across ${cities.length} city report(s).`);
}

/** Recipients for one city: Config-sheet key `Recipients_{City}` first,
 *  falling back to the shared `ClientReportEmails` if that city-specific
 *  key doesn't exist or is empty. */
function recipientListForCity_(city) {
  const cityKey = `Recipients_${city}`;
  const cityValue = getConfigValue_(cityKey, "");
  const raw = cityValue && String(cityValue).trim() ? cityValue : getConfigValue_("ClientReportEmails", "");
  return String(raw)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}
