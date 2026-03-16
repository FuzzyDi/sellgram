import nodemailer from 'nodemailer';
import { getConfig } from '../config/index.js';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;
  const config = getConfig();
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) return null;
  _transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return _transporter;
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const { SMTP_FROM } = getConfig();
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachments,
    });
    return true;
  } catch (err) {
    console.error('[email] send failed:', err);
    return false;
  }
}
