const React = require('react');
const { Section, Text, Link, Hr } = require('@react-email/components');
const { colors, WHATSAPP_SUPPORT_URL, normalizeEmailBaseUrl } = require('./EmailStyles');
const { getColombiaYear } = require('../../../infrastructure/utils/colombiaDateUtils');

const e = React.createElement;

function EmailFooter({ frontendUrl = '' } = {}) {
  const currentYear = getColombiaYear();
  const baseUrl = normalizeEmailBaseUrl(frontendUrl);

  return e(
    Section,
    {
      style: {
        backgroundColor: '#FAFAF9',
        padding: '28px 24px 30px',
        textAlign: 'center',
        borderBottomLeftRadius: '16px',
        borderBottomRightRadius: '16px',
        borderTop: `1px solid ${colors.borderLight}`
      }
    },
    // Enlaces de utilidad / acceso rápido
    e(
      'div',
      { style: { marginBottom: '18px' } },
      e(
        Link,
        {
          href: `${baseUrl}/menu`,
          style: {
            backgroundColor: '#FFFFFF',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '8px',
            color: colors.textTitle,
            fontSize: '12px',
            fontWeight: '600',
            textDecoration: 'none',
            padding: '7px 14px',
            margin: '0 4px',
            display: 'inline-block'
          }
        },
        'Explorar Menú'
      ),
      e(
        Link,
        {
          href: `${baseUrl}/perfil`,
          style: {
            backgroundColor: '#FFFFFF',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '8px',
            color: colors.textTitle,
            fontSize: '12px',
            fontWeight: '600',
            textDecoration: 'none',
            padding: '7px 14px',
            margin: '0 4px',
            display: 'inline-block'
          }
        },
        'Mi Cuenta'
      ),
      e(
        Link,
        {
          href: WHATSAPP_SUPPORT_URL,
          style: {
            backgroundColor: '#FFFFFF',
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '8px',
            color: colors.emeraldText,
            fontSize: '12px',
            fontWeight: '600',
            textDecoration: 'none',
            padding: '7px 14px',
            margin: '0 4px',
            display: 'inline-block'
          }
        },
        'WhatsApp Soporte'
      )
    ),
    e(
      Text,
      {
        style: {
          color: colors.textBody,
          fontSize: '12px',
          fontWeight: '700',
          margin: '0 0 4px 0'
        }
      },
      'Chazin Food · Hamburguesería & Sabor Artesanal'
    ),
    e(
      Text,
      {
        style: {
          color: colors.textMuted,
          fontSize: '11.5px',
          lineHeight: '1.5',
          margin: '0 0 14px 0'
        }
      },
      'Calle 21 #80-21, Belén, Medellín, Colombia • Pedidos Online y Presencial'
    ),
    e(Hr, {
      style: {
        borderColor: colors.borderLight,
        margin: '14px 0'
      }
    }),
    e(
      Text,
      {
        style: {
          color: colors.textSubtle,
          fontSize: '11px',
          lineHeight: '1.6',
          margin: 0
        }
      },
      `© ${currentYear} Chazin Food. Todos los derechos reservados.`,
      e('br'),
      'Este es un mensaje transaccional automatizado y seguro emitido por Chazin Food. No respondas directamente a este remitente.'
    )
  );
}

module.exports = EmailFooter;
