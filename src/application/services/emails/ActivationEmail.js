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
  Button,
  Link
} = require('@react-email/components');
const EmailHeader = require('./EmailHeader');
const EmailFooter = require('./EmailFooter');
const { colors, typography, commonStyles, WHATSAPP_SUPPORT_URL, normalizeEmailBaseUrl } = require('./EmailStyles');

const e = React.createElement;

function ActivationEmail({
  nombre = 'Cliente',
  apellidos = '',
  email = '',
  password = '',
  activationLink = '',
  camposPendientes = [],
  profileLink = '',
  frontendUrl = ''
}) {
  const baseUrl = normalizeEmailBaseUrl(frontendUrl);
  const resolvedActivationLink = activationLink || `${baseUrl}/login`;
  const resolvedProfileLink = profileLink || resolvedActivationLink;
  const fullName = `${nombre} ${apellidos}`.trim() || 'Estimado(a) Cliente';

  return e(
    Html,
    { lang: 'es' },
    e(Head),
    e(Preview, null, `Tu cuenta en Chazin Food está lista. Accede con tus credenciales.`),
    e(
      Body,
      { style: commonStyles.body },
      e(
        Container,
        { style: commonStyles.container },
        e(EmailHeader, { subtitle: 'Activación de Cuenta de Cliente' }),
        e(
          Section,
          { style: commonStyles.contentSection },
          // Badge de bienvenida sobrio y elegante
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
              'Registro Exitoso'
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
            `¡Bienvenido a Chazin Food, ${fullName}!`
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
            'Tu cuenta ha sido creada exitosamente. Ya puedes disfrutar de nuestras hamburguesas al carbón, carnes seleccionadas y acompañamientos artesanales desde cualquier dispositivo.'
          ),
          // Tarjeta de credenciales de acceso
          e(
            Section,
            {
              style: {
                backgroundColor: colors.cardSubtle,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '26px'
              }
            },
            e(
              'div',
              {
                style: {
                  borderBottom: `1px solid ${colors.borderLight}`,
                  paddingBottom: '10px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }
              },
              e(
                'span',
                {
                  style: {
                    color: colors.textTitle,
                    fontSize: '11.5px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }
                },
                'Credenciales de Ingreso'
              ),
              e(
                'span',
                {
                  style: {
                    backgroundColor: colors.briocheAmberLight,
                    color: colors.amberText,
                    border: `1px solid ${colors.briocheAmberBorder}`,
                    fontSize: '10.5px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }
                },
                'Acceso Inicial'
              )
            ),
            e(
              'table',
              {
                border: '0',
                cellPadding: '0',
                cellSpacing: '0',
                style: { width: '100%' }
              },
              e(
                'tbody',
                null,
                e(
                  'tr',
                  null,
                  e(
                    'td',
                    {
                      style: {
                        padding: '6px 0',
                        color: colors.textMuted,
                        fontSize: '13px',
                        width: '130px',
                        fontWeight: '500'
                      }
                    },
                    'Usuario / Correo:'
                  ),
                  e(
                    'td',
                    {
                      style: {
                        padding: '6px 0',
                        color: colors.textTitle,
                        fontSize: '13.5px',
                        fontWeight: '700'
                      }
                    },
                    email
                  )
                ),
                e(
                  'tr',
                  null,
                  e(
                    'td',
                    {
                      style: {
                        padding: '6px 0',
                        color: colors.textMuted,
                        fontSize: '13px',
                        fontWeight: '500'
                      }
                    },
                    'Estado de clave:'
                  ),
                  e(
                    'td',
                    { style: { padding: '6px 0' } },
                    password
                      ? e(
                          'code',
                          {
                            style: {
                              backgroundColor: colors.crimsonLight,
                              color: colors.crimson,
                              border: `1px solid ${colors.crimsonBorder}`,
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '13.5px',
                              fontWeight: '700',
                              fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                              letterSpacing: '0.5px'
                            }
                          },
                          password
                        )
                      : e(
                          'span',
                          {
                            style: {
                              color: colors.emeraldText,
                              fontSize: '12.5px',
                              fontWeight: '600'
                            }
                          },
                          'Definirás tu contraseña personal al activar la cuenta'
                        )
                  )
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
                    marginBottom: '24px'
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
                  'Para habilitar el envío a domicilio y la facturación de tus compras, completa los siguientes datos en tu cuenta:'
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
                      href: resolvedProfileLink,
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
                    'Activar y completar mi perfil'
                  )
                )
              )
            : null,
          // Botón Principal CTA
          e(
            Section,
            { style: { textAlign: 'center', margin: '24px 0 28px' } },
            e(
              Button,
              {
                href: resolvedActivationLink,
                style: commonStyles.ctaButton
              },
              'Activar Cuenta e Iniciar Sesión'
            )
          ),
          // Beneficios en tabla limpia (100% compatible con clientes de correo)
          e(
            'div',
            {
              style: {
                backgroundColor: '#FFFFFF',
                border: `1px solid ${colors.borderLight}`,
                borderRadius: '12px',
                padding: '16px 14px',
                marginBottom: '22px'
              }
            },
            e(
              'table',
              { border: '0', cellPadding: '0', cellSpacing: '0', style: { width: '100%' } },
              e(
                'tbody',
                null,
                e(
                  'tr',
                  null,
                  e(
                    'td',
                    { style: { padding: '8px', verticalAlign: 'top', width: '33.3%', textAlign: 'center' } },
                    e('div', { style: { color: colors.crimson, fontSize: '13px', fontWeight: '700', marginBottom: '2px' } }, '100% Artesanal'),
                    e('div', { style: { color: colors.textMuted, fontSize: '11px', lineHeight: '1.4' } }, 'Pan brioche fresco y carnes preparadas al carbón.')
                  ),
                  e(
                    'td',
                    { style: { padding: '8px', verticalAlign: 'top', width: '33.3%', textAlign: 'center', borderLeft: `1px solid ${colors.borderLight}`, borderRight: `1px solid ${colors.borderLight}` } },
                    e('div', { style: { color: colors.crimson, fontSize: '13px', fontWeight: '700', marginBottom: '2px' } }, 'En Vivo'),
                    e('div', { style: { color: colors.textMuted, fontSize: '11px', lineHeight: '1.4' } }, 'Seguimiento en tiempo real de tu pedido y entrega.')
                  ),
                  e(
                    'td',
                    { style: { padding: '8px', verticalAlign: 'top', width: '33.3%', textAlign: 'center' } },
                    e('div', { style: { color: colors.crimson, fontSize: '13px', fontWeight: '700', marginBottom: '2px' } }, 'Club Chazin'),
                    e('div', { style: { color: colors.textMuted, fontSize: '11px', lineHeight: '1.4' } }, 'Acumula puntos y promociones en cada compra.')
                  )
                )
              )
            )
          ),
          // Nota de seguridad y cambio de contraseña
          e(
            Section,
            {
              style: {
                backgroundColor: colors.briocheAmberLight,
                border: `1px solid ${colors.briocheAmberBorder}`,
                borderRadius: '10px',
                padding: '12px 14px'
              }
            },
            e(
              Text,
              {
                style: {
                  color: colors.amberText,
                  fontSize: '12px',
                  lineHeight: '1.5',
                  margin: 0
                }
              },
              e('strong', null, 'Consejo de seguridad y vigencia: '),
              'El enlace de activación tiene una vigencia de 72 horas. Al activar tu cuenta podrás definir tu contraseña personal. Si necesitas ayuda, contáctanos por ',
              e(
                Link,
                {
                  href: WHATSAPP_SUPPORT_URL,
                  style: { color: colors.amberText, fontWeight: '700', textDecoration: 'underline' }
                },
                'WhatsApp'
              ),
              '.'
            )
          )
        ),
        e(EmailFooter, { frontendUrl: baseUrl })
      )
    )
  );
}

module.exports = ActivationEmail;
