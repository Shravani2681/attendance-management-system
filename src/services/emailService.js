const nodemailer = require('nodemailer');

// ── Transporter ──────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── OTP Email ─────────────────────────────────────────────────────────────────
/**
 * Send a styled OTP email to the given address.
 * @param {string} toEmail   recipient email
 * @param {string} userName  first name for the greeting
 * @param {string} otp       6-digit OTP code
 */
async function sendOtpEmail(toEmail, userName, otp) {
  const mailOptions = {
    from: `"Attendance System" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '🔐 Your OTP for Password Reset',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>OTP - Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
                 border-radius:16px;border:1px solid rgba(99,102,241,0.25);
                 box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);
                        padding:32px 40px;text-align:center;">
              <div style="width:60px;height:60px;background:rgba(255,255,255,0.15);
                          border-radius:50%;display:inline-flex;align-items:center;
                          justify-content:center;margin-bottom:16px;font-size:28px;">
                🔐
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;
                          letter-spacing:0.5px;">Password Reset OTP</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
                Attendance Management System
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#c4c4d4;font-size:15px;margin:0 0 20px;">
                Hi <strong style="color:#818cf8;">${userName}</strong>,
              </p>
              <p style="color:#c4c4d4;font-size:14px;line-height:1.6;margin:0 0 28px;">
                We received a request to reset the password for your account.
                Use the OTP below to proceed. It expires in <strong style="color:#fbbf24;">10 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <div style="text-align:center;margin:0 0 28px;">
                <div style="display:inline-block;background:rgba(79,70,229,0.12);
                            border:2px solid rgba(99,102,241,0.4);border-radius:14px;
                            padding:20px 40px;">
                  <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;
                              letter-spacing:2px;text-transform:uppercase;">Your OTP</p>
                  <p style="margin:0;font-size:42px;font-weight:800;
                              letter-spacing:12px;color:#818cf8;
                              font-family:'Courier New',monospace;">${otp}</p>
                </div>
              </div>

              <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 10px;">
                ⚠️ If you did not request a password reset, please ignore this email.
                Your password will remain unchanged.
              </p>
              <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
                🔒 Never share this OTP with anyone. Our team will never ask for it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:20px 40px;
                        border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:12px;">
                © ${new Date().getFullYear()} Attendance Management System. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendOtpEmail };
