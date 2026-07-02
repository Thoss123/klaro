import { Resend } from 'resend';

export const FROM_EMAIL = 'Axantilo <hello@axantilo.com>';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  return new Resend(key);
}

export async function sendEmail({ to, subject, html, from = FROM_EMAIL }: SendEmailOptions) {
  const { data, error } = await getResend().emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}
