const nodemailer = require('nodemailer');

/**
 * Creates and returns a configured Nodemailer transporter using environment variables.
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const service = process.env.SMTP_SERVICE;

  // 1. Service-based transporter (e.g., Gmail, SendGrid, Outlook)
  if (service && user && pass) {
    return nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  }

  // 2. Custom SMTP host transporter
  if (host && user && pass) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  // 3. Fallback transporter when SMTP credentials are not yet configured in environment
  return null;
}

/**
 * Sends a password reset email containing the 6-digit verification code.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.name - Recipient name
 * @param {string} options.code - 6-digit verification code
 */
async function sendPasswordResetEmail({ to, name, code }) {
  const transporter = createTransporter();
  const fromAddress = process.env.EMAIL_FROM || '"TaskForge" <no-reply@taskforge.com>';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - TaskForge</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050505; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #050505; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #0d1117; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background: radial-gradient(circle at 50% 0%, rgba(129, 140, 248, 0.15), transparent 70%); border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
              <div style="display: inline-block; width: 44px; height: 44px; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 12px; line-height: 44px; text-align: center; color: #ffffff; font-weight: 700; font-size: 20px; margin-bottom: 12px;">
                ⚡
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #ffffff; letter-spacing: -0.01em;">TaskForge</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #9ca3af;">Account Security Verification</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #f9fafb;">Password Reset Request</h2>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                Hello ${name ? name : 'there'},<br><br>
                We received a request to reset the password for your TaskForge account (<strong style="color: #e5e7eb;">${to}</strong>). Use the verification code below to complete the reset:
              </p>

              <!-- Verification Code Display -->
              <div style="background: rgba(17, 24, 39, 0.8); border: 1px solid rgba(129, 140, 248, 0.3); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #818cf8; font-weight: 600; margin-bottom: 8px;">6-Digit Verification Code</span>
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #ffffff; text-shadow: 0 0 15px rgba(129, 140, 248, 0.5);">${code}</span>
              </div>

              <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                ⏱ This code will expire in <strong style="color: #f3f4f6;">15 minutes</strong>.
              </p>

              <div style="padding: 14px 16px; background: rgba(255, 255, 255, 0.03); border-left: 3px solid #f59e0b; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #d1d5db;">
                  <strong>Didn't request this?</strong> If you did not ask for a password reset, you can safely ignore this email. Your current password remains active and secure.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #07090e; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #6b7280; line-height: 1.5;">
                This automated message was sent by TaskForge.<br>
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const textContent = `
TaskForge - Password Reset Verification Code

Hello ${name ? name : 'there'},

We received a request to reset your password. Use the verification code below:

Verification Code: ${code}

This code will expire in 15 minutes.

If you did not request this, you can safely ignore this email.

— TaskForge Security Team
`;

  if (!transporter) {
    // If SMTP credentials have not been configured yet in the environment,
    // log clear instructions and the code in server logs so administrators can test.
    console.warn('\n⚠️ [Email Service] SMTP configuration is missing from server/.env.');
    console.warn('To send real emails to users in production, set:');
    console.warn('  SMTP_HOST=your-smtp-host (e.g. smtp.gmail.com / smtp.sendgrid.net)');
    console.warn('  SMTP_PORT=587');
    console.warn('  SMTP_USER=your-user');
    console.warn('  SMTP_PASS=your-password');
    console.warn(`[DEVELOPMENT BACKUP LOG] Password reset code for ${to}: ${code}\n`);
    return { success: true, simulated: true };
  }

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `${code} is your TaskForge verification code`,
    text: textContent,
    html: htmlContent,
  };

  const info = await transporter.sendMail(mailOptions);
  return { success: true, messageId: info.messageId };
}

module.exports = {
  sendPasswordResetEmail,
};
