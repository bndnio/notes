import type { Env } from "./types";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  env: Env,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await env.RESEND_API_KEY.get()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Notes <noreply@${env.EMAIL_DOMAIN}>`,
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send email: ${err}`);
  }
}
