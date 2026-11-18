try { require('dotenv').config(); } catch (e) {}
const nodemailer = require('nodemailer');
const {
  renderActivationEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
  renderUserUpdatedEmail
} = require('./emails');

const SMTP_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
};

/**
 * Servicio unificado de envío de correos transaccionales (Brevo API HTTP v3 + Resend API HTTP + SMTP Nodemailer).
 */
class EmailService {
  /**
   * Resuelve de forma segura la URL base del frontend para enlaces en correos.
   * Prioriza FRONTEND_URL y permite únicamente orígenes confiables (localhost o *.vercel.app) como respaldo.
   */
  static resolveFrontendUrl(requestOrigin = '') {
    const envUrl = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    const candidate = String(requestOrigin || '').trim().replace(/\/+$/, '');
    const isTrustedOrigin = (origin) => {
      if (!origin) return false;
      return (
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      );
    };

    if (envUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(envUrl)) {
      return envUrl;
    }
    if (candidate && isTrustedOrigin(candidate)) {
      return candidate;
    }
    return envUrl || 'http://localhost:5173';
  }

  /**
   * Construye la configuración de transporte SMTP limpiando espacios de App Passwords.
   */
  static getTransporter(portOverride = null, secureOverride = null) {
    const smtpHost = (process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
    const smtpPort = Number(portOverride || process.env.SMTP_PORT || process.env.EMAIL_PORT) || 465;
    const smtpUser = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
    const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '';
    // Quita espacios internos por si una App Password de Google de 16 caracteres se pegó con espacios
    const smtpPass = String(rawPass).replace(/\s+/g, '').trim();

    if (!smtpUser || !smtpPass) {
      return null;
    }

    const explicitSecure = process.env.SMTP_SECURE;
    const isSecure =
      typeof secureOverride === 'boolean'
        ? secureOverride
        : explicitSecure !== undefined
          ? explicitSecure === 'true'
          : smtpPort === 465;

    const from = (process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Chazin Food" <${smtpUser}>`).trim();

    return {
      host: smtpHost,
      port: smtpPort,
      secure: isSecure,
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: isSecure,
        auth: { user: smtpUser, pass: smtpPass },
        ...SMTP_TIMEOUTS
      }),
      from
    };
  }

  /**
   * Envía un correo mediante la API HTTP v3 de Brevo (puerto 443, sin bloqueo SMTP en Render).
   */
  static async _sendViaBrevo({ to, subject, text, html }) {
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    if (!apiKey || typeof fetch !== 'function') {
      return { attempted: false, ok: false };
    }

    const rawSender = (
      process.env.BREVO_SENDER_EMAIL ||
      process.env.SMTP_USER ||
      process.env.EMAIL_USER ||
      ''
    ).trim();
    const angleMatch = rawSender.match(/<([^>]+)>/);
    const senderEmail = (angleMatch ? angleMatch[1] : rawSender).trim();
    const senderName = (process.env.BREVO_SENDER_NAME || 'Chazin Food').trim();

    if (!senderEmail) {
      console.error('Error Brevo: falta BREVO_SENDER_EMAIL o SMTP_USER verificado en Brevo.');
      return { attempted: false, ok: false };
    }

    const toList = (Array.isArray(to) ? to : [to])
      .filter(Boolean)
      .map((email) => ({ email: String(email).trim() }));

    if (toList.length === 0) {
      console.error('Error Brevo: no se especificó un destinatario válido.');
      return { attempted: false, ok: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: toList,
          subject,
          textContent: text,
          htmlContent: html
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(`Error Brevo HTTP ${response.status}:`, errBody || response.statusText);
        return { attempted: true, ok: false, error: `Brevo HTTP ${response.status}` };
      }

      return { attempted: true, ok: true };
    } catch (err) {
      console.error('Error de red al enviar correo via Brevo:', err.message);
      return { attempted: true, ok: false, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Envía un correo mediante la API HTTP de Resend cuando RESEND_API_KEY está configurada (puerto 443, sin bloqueo SMTP).
   */
  static async _sendViaResend({ to, subject, text, html }) {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey || typeof fetch !== 'function') {
      return { attempted: false, ok: false };
    }

    const from = (
      process.env.RESEND_FROM ||
      process.env.EMAIL_FROM ||
      (process.env.SMTP_USER ? `Chazin Food <${process.env.SMTP_USER.trim()}>` : 'Chazin Food <onboarding@resend.dev>')
    ).trim();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, html }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(`Error Resend HTTP ${response.status}:`, errBody || response.statusText);
        return { attempted: true, ok: false, error: `Resend HTTP ${response.status}` };
      }

      return { attempted: true, ok: true };
    } catch (err) {
      console.error('Error de red al enviar correo via Resend:', err.message);
      return { attempted: true, ok: false, error: err.message };
    }
  }

  /**
   * Envía un correo via SMTP, reintentando automáticamente por puerto 587 STARTTLS si 465 falla por red/timeout.
   */
  static async _sendViaSmtp({ to, subject, text, html }, emailConfig = null) {
    const activeConfig = emailConfig || this.getTransporter();
    if (!activeConfig) {
      return { attempted: false, ok: false };
    }

    try {
      await activeConfig.transporter.sendMail({
        from: activeConfig.from,
        to,
        subject,
        text,
        html
      });
      return { attempted: true, ok: true };
    } catch (err) {
      const code = err?.code || '';
      const isNetworkFailure = ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code);
      if (isNetworkFailure && activeConfig.port === 465) {
        console.warn(`SMTP puerto 465 falló (${code}), intentando respaldo en puerto 587 STARTTLS...`);
        const fallbackConfig = this.getTransporter(587, false);
        try {
          await fallbackConfig.transporter.sendMail({
            from: fallbackConfig.from,
            to,
            subject,
            text,
            html
          });
          return { attempted: true, ok: true };
        } catch (fallbackErr) {
          console.error(
            `Error SMTP respaldo 587 (${fallbackErr?.code || 'ERR'} ${fallbackErr?.responseCode || ''}):`,
            fallbackErr.message
          );
          return { attempted: true, ok: false, error: fallbackErr.message };
        }
      }

      console.error(
        `Error SMTP al enviar correo (${code || 'ERR'} ${err?.responseCode || ''}):`,
        err.message
      );
      return { attempted: true, ok: false, error: err.message };
    }
  }

  /**
   * Canal centralizado de entrega: Brevo API HTTP v3 -> Resend HTTP -> SMTP Nodemailer -> modo dev (solo fuera de producción).
   */
  static async _deliverEmail({ to, subject, text, renderHtml, label, devLines }) {
    try {
      const hasBrevo = Boolean((process.env.BREVO_API_KEY || '').trim());
      const hasResend = Boolean((process.env.RESEND_API_KEY || '').trim());
      const smtpConfig = this.getTransporter();

      if (!hasBrevo && !hasResend && !smtpConfig) {
        if (process.env.NODE_ENV === 'production') {
          console.error(
            `❌ No hay proveedor de correo configurado en producción (BREVO_API_KEY, RESEND_API_KEY o SMTP_USER/SMTP_PASS faltantes) para enviar ${label} a ${to}`
          );
          return false;
        }
        console.log('\n╔══════════════════════════════════════════════════════╗');
        console.log(`║  ✉️  ${label.toUpperCase()} (MODO DEV - NO SMTP)`);
        console.log('╠══════════════════════════════════════════════════════╣');
        for (const line of devLines) {
          console.log(`║  ${line}`);
        }
        console.log('╚══════════════════════════════════════════════════════╝\n');
        return true;
      }

      const html = await renderHtml();

      if (hasBrevo) {
        const brevoResult = await this._sendViaBrevo({ to, subject, text, html });
        if (brevoResult.ok) {
          console.log(`✅ Correo (${label}) enviado via Brevo a ${to}`);
          return true;
        }
      }

      if (hasResend) {
        const resendResult = await this._sendViaResend({ to, subject, text, html });
        if (resendResult.ok) {
          console.log(`✅ Correo (${label}) enviado via Resend a ${to}`);
          return true;
        }
      }

      if (smtpConfig) {
        const smtpResult = await this._sendViaSmtp({ to, subject, text, html }, smtpConfig);
        if (smtpResult.ok) {
          console.log(`✅ Correo (${label}) enviado via SMTP a ${to}`);
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error(`Error inesperado en envío de correo (${label}):`, err.message);
      return false;
    }
  }

  /**
   * Envía correo de activación de cliente con diseño React Email.
   */
  static async sendActivationEmail({ email, nombre, apellidos, password, activationLink }) {
    const userName = `${nombre} ${apellidos || ''}`.trim();
    const frontendUrl = this.resolveFrontendUrl();
    const targetLink = activationLink || `${frontendUrl}/login`;

    return this._deliverEmail({
      to: email,
      subject: '🍔 ¡Activa tu cuenta de cliente en Chazin Food! Credenciales de acceso',
      text: `¡Bienvenido a Chazin Food, ${userName}!\n\nTu cuenta de cliente ha sido registrada. Para activarla ingresa con tus credenciales:\nUsuario: ${email}\nClave temporal: ${password}\nEnlace: ${targetLink}`,
      renderHtml: () =>
        renderActivationEmail({
          nombre,
          apellidos,
          email,
          password,
          activationLink: targetLink
        }),
      label: 'activación de cliente',
      devLines: [
        `Para: ${userName} <${email}>`,
        `Enlace Activación: ${targetLink}`,
        `Clave Temporal: ${password}`
      ]
    });
  }

  /**
   * Envía correo de bienvenida con diseño React Email.
   */
  static async sendWelcomeEmail({ email, nombre, apellidos, password, loginLink }) {
    const userName = `${nombre} ${apellidos || ''}`.trim();
    const frontendUrl = this.resolveFrontendUrl();
    const targetLink = loginLink || `${frontendUrl}/login`;

    return this._deliverEmail({
      to: email,
      subject: '🎉 ¡Bienvenido a Chazin Food! Credenciales de acceso',
      text: `¡Bienvenido a Chazin Food, ${userName}!\n\nTu cuenta ha sido creada exitosamente:\nUsuario: ${email}${password ? `\nContraseña: ${password}` : ''}\nEnlace de acceso: ${targetLink}`,
      renderHtml: () =>
        renderWelcomeEmail({
          nombre,
          apellidos,
          email,
          password,
          loginLink: targetLink
        }),
      label: 'bienvenida',
      devLines: [
        `Para: ${userName} <${email}>`,
        `Clave: ${password || '(OAuth / sin clave temporal)'}`
      ]
    });
  }

  /**
   * Envía correo de recuperación de contraseña con diseño React Email.
   */
  static async sendPasswordResetEmail({ email, nombre, apellidos, resetLink }) {
    const userName = `${nombre} ${apellidos || ''}`.trim();

    return this._deliverEmail({
      to: email,
      subject: '🔐 Restablecer Contraseña - Chazin Food',
      text: `Hola ${userName},\n\nPara restablecer tu contraseña de Chazin Food, ingresa al siguiente enlace:\n${resetLink}\n\nEste enlace expira en 1 hora.`,
      renderHtml: () =>
        renderPasswordResetEmail({
          nombre,
          apellidos,
          resetLink
        }),
      label: 'restablecimiento de contraseña',
      devLines: [
        `Para: ${userName} <${email}>`,
        `Enlace: ${resetLink}`
      ]
    });
  }

  /**
   * Envía notificación de cambio de contraseña con diseño React Email.
   */
  static async sendPasswordChangedEmail({ email, nombre, apellidos, nuevaContrasena, password, supportLink }) {
    const userName = `${nombre} ${apellidos || ''}`.trim();
    const frontendUrl = this.resolveFrontendUrl();
    const finalPass = nuevaContrasena || password || '';

    return this._deliverEmail({
      to: email,
      subject: '🔐 Notificación de Seguridad: Contraseña modificada - Chazin Food',
      text: `Hola ${userName},\n\nTe notificamos que la contraseña de tu cuenta en Chazin Food ha sido modificada exitosamente.${finalPass ? `\n\nTu nueva contraseña es: ${finalPass}` : ''}\n\nSi no realizaste este cambio, por favor comunícate con nosotros de inmediato para proteger tu cuenta.`,
      renderHtml: () =>
        renderPasswordChangedEmail({
          nombre,
          apellidos,
          nuevaContrasena: finalPass,
          password: finalPass,
          supportLink: supportLink || frontendUrl
        }),
      label: 'cambio de contraseña',
      devLines: [
        `Para: ${userName} <${email}>`,
        ...(finalPass ? [`Nueva Clave: ${finalPass}`] : [])
      ]
    });
  }

  /**
   * Envía notificación de datos de cuenta actualizados con diseño React Email.
   */
  static async sendUserUpdatedEmail({ email, nombre, apellidos, modifiedFields, portalLink }) {
    const userName = `${nombre} ${apellidos || ''}`.trim();
    const frontendUrl = this.resolveFrontendUrl();

    return this._deliverEmail({
      to: email,
      subject: '✏️ Tus datos de usuario han sido actualizados - Chazin Food',
      text: `Hola ${userName},\n\nTe informamos que los datos de tu cuenta en Chazin Food han sido actualizados.\nModificaciones: ${modifiedFields || 'Perfil actualizado'}`,
      renderHtml: () =>
        renderUserUpdatedEmail({
          nombre,
          apellidos,
          modifiedFields,
          portalLink: portalLink || `${frontendUrl}/perfil`
        }),
      label: 'actualización de perfil',
      devLines: [
        `Para: ${userName} <${email}>`,
        `Cambios: ${modifiedFields || 'Perfil actualizado'}`
      ]
    });
  }
}

module.exports = EmailService;
