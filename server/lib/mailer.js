const fs = require('fs');
const path = require('path');

// Gestion des emails. Par défaut, les emails sont écrits dans un journal
// (data/mail.log). Pour un vrai envoi, configurez MAIL_SMTP_HOST,
// MAIL_SMTP_USER, MAIL_SMTP_PASS, MAIL_FROM (cf. README).
const LOG_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'mail.log')
  : path.join(__dirname, '..', '..', 'data', 'mail.log');

let transporter = null;
let smtpConfigured = false;

function buildTransporter() {
  const host = process.env.MAIL_SMTP_HOST;
  if (!host) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_SMTP_PORT || 587),
    secure: process.env.MAIL_SMTP_SECURE === 'true',
    auth: process.env.MAIL_SMTP_USER
      ? { user: process.env.MAIL_SMTP_USER, pass: process.env.MAIL_SMTP_PASS }
      : undefined,
  });
}

function logEmail(to, subject, body) {
  const line = `[${new Date().toISOString()}] TO: ${to} | SUBJECT: ${subject}\n${body}\n${'-'.repeat(60)}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    console.error('mail log write failed', e.message);
  }
}

async function sendMail({ to, subject, text }) {
  if (!transporter && smtpConfigured === false) {
    transporter = buildTransporter();
    smtpConfigured = true;
  }
  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'no-reply@localhost',
        to,
        subject,
        text,
      });
      return { via: 'smtp' };
    } catch (e) {
      console.error('SMTP send failed, falling back to log', e.message);
    }
  }
  logEmail(to, subject, text);
  return { via: 'log' };
}

module.exports = { sendMail };
