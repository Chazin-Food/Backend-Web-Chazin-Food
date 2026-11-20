const React = require('react');
const {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button
} = require('@react-email/components');
const EmailHeader = require('./EmailHeader');
const EmailFooter = require('./EmailFooter');
const { colors, commonStyles } = require('./EmailStyles');

const e = React.createElement;

function UserUpdatedEmail({
  nombre = 'Usuario',
  apellidos = '',
  modifiedFields = 'Perfil actualizado',
  portalLink = 'http://localhost:5173/perfil',
  camposPendientes = []
}) {
  const fullName = `${nombre} ${apellidos}`.trim() || 'Usuario';
  const updateDate = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return e(
    Html,
    { lang: 'es' },
    e(Head),
    e(Preview, null, `Notificación de actualización de perfil en Chazin Food`),
    e(
      Body,
      { style: commonStyles.body },
      e(
        Container,
        { style: commonStyles.container },
        e(EmailHeader, { subtitle: 'Actualización de Perfil' }),
        e(
          Section,
          { style: commonStyles.contentSection },
          // Badge
          e(
            'div',
            { style: { textAlign: 'center', marginBottom: '18px' } },
            e(
              'span',
              {
                style: {
                  ...commonStyles.badge,
                  backgroundColor: colors.emeraldLight,
                  border: `1px solid ${colors.emeraldBorder}`,
                  color: colors.emeraldText
                }
              },
              'Perfil Actualizado'
            )
          ),
          // Heading
          e(
            Heading,
            {
              as: 'h2',
              style: {
                color: colors.textTitle,
                fontSize: '22px',
                fontWeight: '800',
                lineHeight: '1.3',
                margin: '0 0 12px 0',
                textAlign: 'center'
              }
            },
            `Datos actualizados, ${fullName}`
          ),
          e(
            Text,
            {
              style: {
                color: colors.textBody,
                fontSize: '14.5px',
                lineHeight: '1.6',
                margin: '0 0 24px 0',
                textAlign: 'center'
              }
            },
            'Te confirmamos que los cambios realizados en tu cuenta de Chazin Food han sido sincronizados y guardados correctamente en nuestra base de datos.'
          ),
          // Summary Card
          e(
            Section,
            {
              style: {
                backgroundColor: colors.cardSubtle,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: '12px',
                padding: '18px 20px',
                marginBottom: '24px'
              }
            },
            e(
              'div',
              {
                style: {
                  borderBottom: `1px solid ${colors.borderLight}`,
                  paddingBottom: '10px',
                  marginBottom: '12px',
                  color: colors.textTitle,
                  fontSize: '11.5px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }
              },
              'Resumen de la Operación'
            ),
            e(
              'table',
              { border: '0', cellPadding: '0', cellSpacing: '0', style: { width: '100%' } },
              e(
                'tbody',
                null,
                e(
                  'tr',
                  null,
                  e('td', { style: { padding: '5px 0', color: colors.textMuted, fontSize: '13px', width: '130px', fontWeight: '500' } }, 'Modificación:'),
                  e(
                    'td',
                    { style: { padding: '5px 0' } },
                    e(
                      'span',
                      {
                        style: {
                          backgroundColor: '#FFFFFF',
                          border: `1px solid ${colors.borderLight}`,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          color: colors.textTitle,
                          fontSize: '12.5px',
                          fontWeight: '600'
                        }
                      },
                      modifiedFields
                    )
                  )
                ),
                e(
                  'tr',
                  null,
                  e('td', { style: { padding: '5px 0', color: colors.textMuted, fontSize: '13px', fontWeight: '500' } }, 'Fecha y hora:'),
                  e('td', { style: { padding: '5px 0', color: colors.textTitle, fontSize: '13px', fontWeight: '600' } }, updateDate)
                ),
                e(
                  'tr',
                  null,
                  e('td', { style: { padding: '5px 0', color: colors.textMuted, fontSize: '13px', fontWeight: '500' } }, 'Estado:'),
                  e('td', { style: { padding: '5px 0', color: colors.emeraldText, fontSize: '13px', fontWeight: '700' } }, 'Sincronizado en tiempo real')
                )
              )
            )
          ),
          // Alerta de campos pendientes por registrar (si aplica)
          camposPendientes && camposPendientes.length > 0
            ? e(
                Section,
                {
                  style: {
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '22px'
                  }
                },
                e(
                  'div',
                  {
                    style: {
                      color: '#B45309',
                      fontSize: '12px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '6px'
                    }
                  },
                  '⚠️ Datos pendientes por registrar en tu perfil'
                ),
                e(
                  Text,
                  {
                    style: {
                      color: '#92400E',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      margin: '0 0 10px 0'
                    }
                  },
                  'Tu perfil aún tiene información pendiente por registrar. Te sugerimos completarla para agilizar tus trámites y pedidos:'
                ),
                e(
                  'ul',
                  { style: { color: '#78350F', fontSize: '13px', margin: '0 0 12px 18px', padding: 0 } },
                  camposPendientes.map((campo, idx) =>
                    e('li', { key: idx, style: { marginBottom: '4px', fontWeight: '600' } }, campo)
                  )
                ),
                e(
                  'div',
                  { style: { textAlign: 'center', marginTop: '10px' } },
                  e(
                    Button,
                    {
                      href: portalLink,
                      style: {
                        backgroundColor: '#F59E0B',
                        color: '#FFFFFF',
                        padding: '9px 20px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        textDecoration: 'none',
                        display: 'inline-block'
                      }
                    },
                    'Completar datos pendientes'
                  )
                )
              )
            : null,
          // CTA
          e(
            Section,
            { style: { textAlign: 'center', margin: '22px 0 26px' } },
            e(
              Button,
              {
                href: portalLink,
                style: commonStyles.ctaButton
              },
              'Ver Mi Perfil en Chazin Food'
            )
          ),
          // Reaseguro
          e(
            Section,
            {
              style: {
                backgroundColor: colors.cardSubtle,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: '10px',
                padding: '12px 14px'
              }
            },
            e(
              Text,
              {
                style: {
                  color: colors.textMuted,
                  fontSize: '12px',
                  lineHeight: '1.5',
                  margin: 0
                }
              },
              e('strong', null, 'Protección de datos: '),
              'Si no autorizaste esta modificación, ingresa inmediatamente a tu perfil o comunícate con nosotros para verificar la seguridad de tu cuenta.'
            )
          )
        ),
        e(EmailFooter)
      )
    )
  );
}

module.exports = UserUpdatedEmail;
