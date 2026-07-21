import { Injectable } from '@nestjs/common';

export type PasswordResetMail = {
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class PasswordResetEmailService {
  buildResetMail(firstName: string, resetLink: string): PasswordResetMail {
    return {
      subject: 'Recuperación de Contraseña - Pizza To Go',
      text: `Hola ${firstName},\n\nPara restablecer tu contraseña, copia este enlace en tu navegador:\n${resetLink}\n\nSi no solicitaste esto, ignora este mensaje.`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Pizza To Go</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff; color: #333333;">
          <h2 style="margin-top: 0; color: #1a1a1a;">Recuperación de Contraseña</h2>
          <p style="font-size: 16px; line-height: 1.5;">Hola <strong>${firstName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.5;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de administrador en el sistema <strong>Pizza To Go</strong>.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #D32F2F; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Restablecer Contraseña</a>
          </div>
          <p style="font-size: 14px; color: #666666; line-height: 1.5;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
          <p style="font-size: 14px; color: #1976d2; word-break: break-all;">${resetLink}</p>
          <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999999; text-align: center;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu cuenta seguirá protegida.</p>
        </div>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; color: #888888; font-size: 12px;">
          &copy; ${new Date().getFullYear()} Pizza To Go - Sistema de Facturación
        </div>
      </div>
    `,
    };
  }
}