import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const sendPasswordResetEmail = async (to: string, nombre: string, token: string) => {
  const resetUrl = `${FRONTEND_URL}/reset-password/${token}`;

  if (!resend) {
    // Sin API key configurada: no se envía el email, pero no rompe el flujo (dev/local).
    console.warn(
      `[email] RESEND_API_KEY no configurada. Link de recuperación para ${to}: ${resetUrl}`
    );
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Recuperar contraseña - Examline",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E2955;">Recuperar contraseña</h2>
        <p>Hola ${nombre},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña en Examline. Si no fuiste vos, ignorá este email.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1E2955;color:#fff;text-decoration:none;border-radius:8px;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#666; font-size:0.85rem;">Este link expira en 1 hora.</p>
      </div>
    `,
  });
};
