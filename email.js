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
      await GoogleSheetsAPI.sendReportEmail();
      Dashboard.notify("success", "Email Sent");
    } catch (err) {
      Dashboard.notify("danger", `Failed to send email: ${err.message}`);
    }
  }

  function wireUi() {
    document.getElementById("btnSendEmail")?.addEventListener("click", sendNow);
  }

  return { sendNow, wireUi };
})();
