const nodemailer = require('nodemailer');

/**
 * Creates and returns a configured Nodemailer transporter using environment variables.
 */
function createTransporter() {
  const host = (process.env.SMTP_HOST || '').trim();
  const rawUser = process.env.SMTP_USER || '';
  const rawPass = process.env.SMTP_PASS || '';
  const service = (process.env.SMTP_SERVICE || '').trim().toLowerCase();

  const user = rawUser.trim();
  // Strip all whitespace from pass (essential for Google 16-char App Passwords like "abcd efgh ijkl mnop")
  const pass = rawPass.replace(/\s+/g, '');

  if (!user || !pass) {
    return null;
  }

  const isGmail = service === 'gmail' || host.toLowerCase().includes('gmail') || user.toLowerCase().endsWith('@gmail.com');

  // Short 8-second timeout so requests do not hang when cloud firewalls (e.g. Render free tier) block ports
  const timeoutOptions = {
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  };

  // 1. Gmail specialized transport (uses port 465 SSL, official and most reliable)
  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      ...timeoutOptions,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  // 2. Custom SMTP host transporter
  if (host) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      ...timeoutOptions,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return null;
}

/**
 * Sends email using Resend REST API over HTTPS (Port 443).
 * Never blocked by Render or other cloud firewalls.
 */
async function sendViaResend({ to, code, htmlContent, textContent }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const fromEmail = process.env.RESEND_FROM || 'TaskForge Security <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: `${code} is your TaskForge verification code`,
      html: htmlContent,
      text: textContent,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Resend API error (${response.status})`);
  }

  console.log(`[Email Service] Delivered via Resend HTTPS API to ${to}. ID: ${data.id}`);
  return { success: true, messageId: data.id, provider: 'resend' };
}

/**
 * Sends email using Brevo (Sendinblue) REST API over HTTPS (Port 443).
 */
async function sendViaBrevo({ to, name, code, htmlContent, textContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const senderEmail = process.env.BREVO_SENDER || 'no-reply@taskforge.com';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'TaskForge Security', email: senderEmail },
      to: [{ email: to, name: name || to }],
      subject: `${code} is your TaskForge verification code`,
      htmlContent,
      textContent,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Brevo API error (${response.status})`);
  }

  console.log(`[Email Service] Delivered via Brevo HTTPS API to ${to}. ID: ${data.messageId}`);
  return { success: true, messageId: data.messageId, provider: 'brevo' };
}

/**
 * Sends email using Nodemailer SMTP.
 */
async function sendViaSMTP({ to, name, code, htmlContent, textContent }) {
  const transporter = createTransporter();
  if (!transporter) return null;

  const rawUser = (process.env.SMTP_USER || '').trim();
  const host = (process.env.SMTP_HOST || '').trim();
  const service = (process.env.SMTP_SERVICE || '').trim().toLowerCase();
  const isGmail = service === 'gmail' || host.toLowerCase().includes('gmail') || rawUser.toLowerCase().endsWith('@gmail.com');

  const fromEnv = (process.env.EMAIL_FROM || '').trim();
  let fromAddress;
  if (isGmail || !fromEnv || fromEnv.includes('no-reply@taskforge.com')) {
    fromAddress = rawUser ? `"TaskForge Security" <${rawUser}>` : '"TaskForge Security" <no-reply@taskforge.com>';
  } else {
    fromAddress = fromEnv;
  }

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `${code} is your TaskForge verification code`,
    text: textContent,
    html: htmlContent,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Email Service] Delivered via SMTP to ${to}. MessageId: ${info.messageId}`);
  return { success: true, messageId: info.messageId, provider: 'smtp' };
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

  // 1. Try Resend HTTPS API (Recommended for Render, uses port 443)
  if (process.env.RESEND_API_KEY) {
    return await sendViaResend({ to, code, htmlContent, textContent });
  }

  // 2. Try Brevo HTTPS API (uses port 443)
  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevo({ to, name, code, htmlContent, textContent });
  }

  // 3. Try Nodemailer SMTP
  try {
    const smtpResult = await sendViaSMTP({ to, name, code, htmlContent, textContent });
    if (smtpResult) return smtpResult;
  } catch (smtpErr) {
    const isTimeout = smtpErr.code === 'ETIMEDOUT' || smtpErr.timeoutType === 'CONNECT_TIMEOUT';

    if (isTimeout) {
      console.error('\n' + '='.repeat(64));
      console.error('⚠️  RENDER FIREWALL BLOCKED OUTBOUND SMTP (ETIMEDOUT)');
      console.error('Render blocks outbound SMTP ports 25, 465, and 587 on free tier.');
      console.error(`\n🔑 [RENDER DASHBOARD FALLBACK] Verification code for ${to}: ${code}\n`);
      console.error('💡 RECOMMENDED FIX:');
      console.error('   Add RESEND_API_KEY to your Render Environment variables.');
      console.error('   Resend sends emails over HTTPS (Port 443) which Render never blocks.');
      console.error('   Get a free key (3,000 emails/mo) in 30 seconds at: https://resend.com');
      console.error('='.repeat(64) + '\n');

      return {
        success: true,
        renderBlocked: true,
        message: 'Render free tier blocks SMTP ports (ETIMEDOUT). Your code was logged in Render Dashboard logs! Add RESEND_API_KEY in Render to send real emails over HTTPS.',
      };
    }

    throw smtpErr;
  }

  // Fallback if no provider was configured
  console.warn('\n⚠️ [Email Service] No email provider configured in server/.env.');
  console.warn(`[DEV BACKUP] Verification code for ${to}: ${code}\n`);
  return {
    success: true,
    renderBlocked: true,
    message: 'No email service configured. Verification code logged to server console.',
  };
}

module.exports = {
  createTransporter,
  sendPasswordResetEmail,
};
