/**
 * email.js
 * ---------------------------------------------------------------------------
 * Automatic per-client emails at 12:30 AM are sent entirely server-side by
 * appscript/Email.gs, fired from the same time-based trigger that performs
 * the midnight auto-shutdown (see appscript/Code.gs::autoShutdownAtMidnight).
 *
 * This client module only exposes a manual "Send Test / Resend Report"
 * action for admins, and renders the "Email Sent" notification.
 * ---------------------------------------------------------------------------
 */

const EmailModule = (() => {
  async function sendNow() {
    Dashboard.notify("info", "Generating report and sending email…");
    try {
      await GoogleSheetsAPI.logEvent({ type: "MANUAL_EMAIL_TRIGGER", user: Auth.currentUser() });
      const result = await GoogleSheetsAPI.sendReportEmail();
      const level = result.sentCount > 0 ? "success" : "warning";
      Dashboard.notify(level, result.message || "Done.");
    } catch (err) {
      Dashboard.notify("danger", `Failed to send email: ${err.message}`);
    }
  }

  /** Recovery path for a missed automatic midnight run — resend the
   *  report for any specific past date the user picks. */
  async function resendForDate() {
    const dateInput = document.getElementById("resendDateInput");
    const date = dateInput?.value; // yyyy-MM-dd from <input type="date">
    if (!date) {
      Dashboard.notify("danger", "Pick a date first.");
      return;
    }

    Dashboard.notify("info", `Sending report for ${date}…`);
    try {
      await GoogleSheetsAPI.logEvent({ type: "MANUAL_EMAIL_RESEND", date, user: Auth.currentUser() });
      const result = await GoogleSheetsAPI.sendReportEmailForDate(date);
      const level = result.sentCount > 0 ? "success" : "warning";
      Dashboard.notify(level, result.message || "Done.");
      bootstrap.Modal.getInstance(document.getElementById("resendEmailModal"))?.hide();
    } catch (err) {
      Dashboard.notify("danger", `Failed to resend: ${err.message}`);
    }
  }

  function wireUi() {
    document.getElementById("btnSendEmail")?.addEventListener("click", sendNow);

    document.getElementById("btnResendEmail")?.addEventListener("click", () => {
      new bootstrap.Modal(document.getElementById("resendEmailModal")).show();
    });
    document.getElementById("btnResendSend")?.addEventListener("click", resendForDate);
  }

  return { sendNow, resendForDate, wireUi };
})();
