const test = require('node:test');
const assert = require('node:assert/strict');

const EmailService = require('../src/application/services/emailService');
const {
  renderActivationEmail,
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
  renderUserUpdatedEmail
} = require('../src/application/services/emails');
const {
  CANONICAL_FRONTEND_URL,
  WHATSAPP_SUPPORT_URL
} = require('../src/application/services/emails/EmailStyles');
const models = require('../src/persistence/models');
const UserService = require('../src/application/services/userService');
const ClienteService = require('../src/application/services/clienteService');

test('EmailService.resolveFrontendUrl reemplaza el dominio muerto chazin-food-web.vercel.app por el oficial', () => {
  const prevEnv = process.env.FRONTEND_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://chazin-food-web.vercel.app/';
    assert.equal(EmailService.resolveFrontendUrl(), CANONICAL_FRONTEND_URL);

    process.env.FRONTEND_URL = 'https://chazin-food-web.vercel.app,http://localhost:5173';
    assert.equal(EmailService.resolveFrontendUrl(), CANONICAL_FRONTEND_URL);

    process.env.FRONTEND_URL = '';
    assert.equal(EmailService.resolveFrontendUrl('https://chazin-food-web.vercel.app'), CANONICAL_FRONTEND_URL);
  } finally {
    process.env.FRONTEND_URL = prevEnv;
    process.env.NODE_ENV = prevNodeEnv;
  }
});

test('EmailService.getPendingProfileFields no muestra falsas alertas para clientes completos ni para staff sin dirección', () => {
  // Cliente completo con dirección JSON (como viene en Cliente.direccion)
  const pendingClienteCompleto = EmailService.getPendingProfileFields({
    idRol: 4,
    nombre: 'Samuel',
    apellidos: 'Gutiérrez',
    numeroDocumento: '1030555777',
    telefono: '3014599890',
    direccion: JSON.stringify({ direccion: 'Calle 34B #112C-54', tipo: 'VIP' })
  });
  assert.deepEqual(pendingClienteCompleto, []);

  // Administrador / Staff con datos completos y sin dirección de entrega -> sin datos pendientes
  const pendingAdmin = EmailService.getPendingProfileFields({
    idRol: 1,
    nombre: 'Samuel',
    apellidos: 'Gutiérrez Franco',
    numeroDocumento: '1030555777',
    telefono: '3014599890',
    direccion: ''
  });
  assert.deepEqual(pendingAdmin, []);

  // Cliente al que realmente le falta la dirección
  const pendingClienteSinDir = EmailService.getPendingProfileFields({
    idRol: 4,
    nombre: 'Ana',
    apellidos: 'Ruiz',
    numeroDocumento: '1020304050',
    telefono: '3101234567',
    direccion: ''
  });
  assert.deepEqual(pendingClienteSinDir, ['Dirección de Residencia / Entrega']);
});

test('Los 5 tipos de correo renderizan links funcionales al dominio oficial, footer válido y soporte por WhatsApp', async () => {
  const prevEnv = process.env.FRONTEND_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://chazin-food-web.vercel.app';
    const base = CANONICAL_FRONTEND_URL;

    const activationHtml = await renderActivationEmail({
      nombre: 'Laura',
      apellidos: 'Gómez',
      email: 'laura@test.com',
      password: '',
      activationLink: `${base}/activar-cuenta?token=abc123`,
      profileLink: `${base}/activar-cuenta?token=abc123`,
      camposPendientes: [],
      frontendUrl: base
    });

    const welcomeHtml = await renderWelcomeEmail({
      nombre: 'Laura',
      apellidos: 'Gómez',
      email: 'laura@test.com',
      password: '',
      esGoogle: false,
      loginLink: `${base}/login`,
      profileLink: `${base}/perfil?tab=editar`,
      camposPendientes: [],
      frontendUrl: base
    });

    const welcomeGoogleHtml = await renderWelcomeEmail({
      nombre: 'Laura',
      apellidos: 'Gómez',
      email: 'laura@test.com',
      password: '',
      esGoogle: true,
      loginLink: `${base}/login`,
      profileLink: `${base}/perfil?tab=editar`,
      camposPendientes: ['Teléfono de Contacto'],
      frontendUrl: base
    });

    const resetHtml = await renderPasswordResetEmail({
      nombre: 'Laura',
      apellidos: 'Gómez',
      resetLink: `${base}/reset-password?token=xyz&email=laura%40test.com`,
      frontendUrl: base
    });

    const changedHtml = await renderPasswordChangedEmail({
      nombre: 'Laura',
      apellidos: 'Gómez',
      supportLink: `${base}/login`,
      frontendUrl: base
    });

    const updatedNoPendingHtml = await renderUserUpdatedEmail({
      nombre: 'Samuel',
      apellidos: 'Gutiérrez Franco',
      modifiedFields: 'Teléfono',
      portalLink: `${base}/perfil`,
      editProfileLink: `${base}/perfil?tab=editar`,
      camposPendientes: [],
      frontendUrl: base
    });

    const updatedWithPendingHtml = await renderUserUpdatedEmail({
      nombre: 'Samuel',
      apellidos: 'Gutiérrez Franco',
      modifiedFields: 'Teléfono',
      portalLink: `${base}/perfil`,
      editProfileLink: `${base}/perfil?tab=editar`,
      camposPendientes: ['Dirección de Residencia / Entrega'],
      frontendUrl: base
    });

    const allHtmls = [
      activationHtml,
      welcomeHtml,
      welcomeGoogleHtml,
      resetHtml,
      changedHtml,
      updatedNoPendingHtml,
      updatedWithPendingHtml
    ];

    for (const html of allHtmls) {
      assert.equal(html.includes('chazin-food-web.vercel.app'), false, 'No debe contener el dominio muerto');
      assert.equal(html.includes('573000000000'), false, 'No debe contener el número WhatsApp falso');
      assert.equal(html.includes('localhost:5173'), false, 'No debe contener localhost en producción');
      assert.ok(html.includes(`${base}/menu`), 'Footer debe enlazar Explorar Menú a /menu');
      assert.ok(html.includes(`${base}/perfil`), 'Footer debe enlazar Mi Cuenta a /perfil');
      assert.ok(html.includes(WHATSAPP_SUPPORT_URL), 'Footer debe enlazar WhatsApp Soporte real');
    }

    // Validaciones específicas de UserUpdatedEmail sin datos pendientes
    assert.ok(updatedNoPendingHtml.includes('Teléfono'));
    assert.equal(updatedNoPendingHtml.includes('Datos pendientes por registrar'), false, 'No debe mostrar alerta si no hay datos pendientes');
    assert.equal(updatedNoPendingHtml.includes('Completar datos pendientes'), false);
    assert.ok(updatedNoPendingHtml.includes('WhatsApp'), 'Protección de datos debe mencionar WhatsApp');

    // Validaciones específicas de UserUpdatedEmail CON datos pendientes
    assert.ok(updatedWithPendingHtml.includes('Datos pendientes por registrar'));
    assert.ok(updatedWithPendingHtml.includes(`${base}/perfil?tab=editar`));

    // Validaciones de WelcomeEmail Google vs Registro normal
    assert.ok(welcomeHtml.includes('Configurada en tu registro'));
    assert.ok(welcomeGoogleHtml.includes('Acceso vinculado con Google'));
    assert.ok(welcomeGoogleHtml.includes(`${base}/perfil?tab=editar`));

    // Validaciones de PasswordChangedEmail
    assert.ok(changedHtml.includes(`${base}/login`));
    assert.ok(changedHtml.includes('WhatsApp'));

    // Verificar también el árbol React de los 5 componentes + EmailFooter directamente (render en producción)
    const ActivationEmail = require('../src/application/services/emails/ActivationEmail');
    const WelcomeEmail = require('../src/application/services/emails/WelcomeEmail');
    const PasswordResetEmail = require('../src/application/services/emails/PasswordResetEmail');
    const PasswordChangedEmail = require('../src/application/services/emails/PasswordChangedEmail');
    const UserUpdatedEmail = require('../src/application/services/emails/UserUpdatedEmail');
    const EmailFooter = require('../src/application/services/emails/EmailFooter');

    const collectHrefsAndText = (node, acc = { hrefs: [], texts: [] }) => {
      if (node === null || node === undefined || typeof node === 'boolean') return acc;
      if (typeof node === 'string' || typeof node === 'number') {
        acc.texts.push(String(node));
        return acc;
      }
      if (Array.isArray(node)) {
        node.forEach(n => collectHrefsAndText(n, acc));
        return acc;
      }
      if (typeof node === 'object') {
        if (typeof node.type === 'function') {
          return collectHrefsAndText(node.type(node.props || {}), acc);
        }
        if (node.props?.href) acc.hrefs.push(String(node.props.href));
        if (node.props?.children !== undefined) collectHrefsAndText(node.props.children, acc);
      }
      return acc;
    };

    const footerScan = collectHrefsAndText(EmailFooter({ frontendUrl: base }));
    assert.deepEqual(footerScan.hrefs, [`${base}/menu`, `${base}/perfil`, WHATSAPP_SUPPORT_URL]);

    const updatedReactNoPending = collectHrefsAndText(UserUpdatedEmail({
      nombre: 'Samuel',
      apellidos: 'Gutiérrez',
      modifiedFields: 'Teléfono',
      portalLink: `${base}/perfil`,
      editProfileLink: `${base}/perfil?tab=editar`,
      camposPendientes: [],
      frontendUrl: base
    }));
    assert.equal(updatedReactNoPending.texts.join(' ').includes('Datos pendientes por registrar'), false);
    assert.ok(updatedReactNoPending.hrefs.includes(`${base}/perfil`));
    assert.ok(updatedReactNoPending.hrefs.some(h => h.startsWith(WHATSAPP_SUPPORT_URL)));

    const updatedReactWithPending = collectHrefsAndText(UserUpdatedEmail({
      nombre: 'Samuel',
      apellidos: 'Gutiérrez',
      modifiedFields: 'Teléfono',
      portalLink: `${base}/perfil`,
      editProfileLink: `${base}/perfil?tab=editar`,
      camposPendientes: ['Dirección de Residencia / Entrega'],
      frontendUrl: base
    }));
    assert.ok(updatedReactWithPending.hrefs.includes(`${base}/perfil?tab=editar`));

    for (const tree of [
      ActivationEmail({ nombre: 'A', email: 'a@b.co', activationLink: `${base}/activar-cuenta?token=t`, profileLink: `${base}/activar-cuenta?token=t`, camposPendientes: [], frontendUrl: base }),
      WelcomeEmail({ nombre: 'A', email: 'a@b.co', loginLink: `${base}/login`, profileLink: `${base}/perfil?tab=editar`, camposPendientes: [], frontendUrl: base }),
      PasswordResetEmail({ nombre: 'A', resetLink: `${base}/reset-password?token=t`, frontendUrl: base }),
      PasswordChangedEmail({ nombre: 'A', supportLink: `${base}/login`, frontendUrl: base })
    ]) {
      const scan = collectHrefsAndText(tree);
      assert.equal(scan.hrefs.some(h => h.includes('chazin-food-web.vercel.app') || h.includes('573000000000') || h.includes('localhost:5173')), false);
      assert.ok(scan.hrefs.includes(`${base}/menu`));
      assert.ok(scan.hrefs.includes(`${base}/perfil`));
      assert.ok(scan.hrefs.some(h => h.startsWith(WHATSAPP_SUPPORT_URL)));
    }
  } finally {
    process.env.FRONTEND_URL = prevEnv;
    process.env.NODE_ENV = prevNodeEnv;
  }
});

test('UserService.updateUser y ClienteService.update notifican SOLO los campos realmente modificados', async () => {
  const originals = {
    userFindByPk: models.User.findByPk,
    clienteFindOne: models.Cliente.findOne,
    clienteFindByPk: models.Cliente.findByPk,
    getUserById: UserService.getUserById,
    getClienteById: ClienteService.getById,
    sendUpdated: EmailService.sendUserUpdatedEmail
  };

  const sentPayloads = [];
  try {
    EmailService.sendUserUpdatedEmail = async (payload) => {
      sentPayloads.push(payload);
      return true;
    };
    UserService.getUserById = async () => ({ ok: true });
    ClienteService.getById = async () => ({ ok: true });

    // 1) UserService.updateUser: el formulario envía TODOS los campos, pero solo cambió Teléfono
    const mockUser = {
      idUsuario: 10,
      nombre: 'Samuel',
      apellidos: 'Gutiérrez Franco',
      email: 'samuel@test.com',
      tipoDocumento: 'C.C.',
      numeroDocumento: '1030555777',
      telefono: '3001112233',
      idRol: 1,
      estado: 'ACTIVO',
      foto: null,
      async save() { return this; },
      toJSON() { return { ...this }; }
    };
    models.User.findByPk = async () => mockUser;
    models.Cliente.findOne = async () => null;

    await UserService.updateUser(10, {
      nombre: 'Samuel',
      apellidos: 'Gutiérrez Franco',
      email: 'samuel@test.com',
      telefono: '3009998877', // Único campo realmente cambiado
      idRol: 1,
      estado: 'ACTIVO'
    });

    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0].modifiedFields, 'Teléfono');
    assert.deepEqual(EmailService.getPendingProfileFields(sentPayloads[0].usuario), []);

    // 2) Guardar sin cambiar ningún campo -> NO debe enviar correo
    await UserService.updateUser(10, {
      nombre: 'Samuel',
      apellidos: 'Gutiérrez Franco',
      email: 'samuel@test.com',
      telefono: '3009998877',
      idRol: 1,
      estado: 'ACTIVO'
    });
    assert.equal(sentPayloads.length, 1, 'No debe enviar correo si ningún valor cambió');

    // 3) ClienteService.update: el formulario envía todos los campos, pero solo cambió Dirección
    const mockCliUser = {
      idUsuario: 20,
      nombre: 'María',
      apellidos: 'García',
      email: 'maria@test.com',
      tipoDocumento: 'C.C.',
      numeroDocumento: '1040555666',
      telefono: '3190000002',
      idRol: 4,
      estado: 'ACTIVO',
      async save() { return this; },
      toJSON() { return { ...this }; }
    };
    const mockCliente = {
      idCliente: 2,
      idUsuario: 20,
      estado: 1,
      direccion: JSON.stringify({
        nombre: 'María',
        apellidos: 'García',
        telefono: '3190000002',
        direccion: 'Calle Falsa 123',
        tipo: 'VIP'
      }),
      usuario: mockCliUser,
      async save() { return this; }
    };
    models.Cliente.findByPk = async () => mockCliente;

    await ClienteService.update(2, {
      nombre: 'María',
      apellidos: 'García',
      email: 'maria@test.com',
      telefono: '3190000002',
      direccion: 'Carrera 80 #21-45, Belén', // Único campo realmente cambiado
      tipo: 'VIP',
      estado: 'Activo'
    });

    assert.equal(sentPayloads.length, 2);
    assert.equal(sentPayloads[1].modifiedFields, 'Dirección');
    assert.deepEqual(EmailService.getPendingProfileFields(sentPayloads[1].usuario), []);
  } finally {
    models.User.findByPk = originals.userFindByPk;
    models.Cliente.findOne = originals.clienteFindOne;
    models.Cliente.findByPk = originals.clienteFindByPk;
    UserService.getUserById = originals.getUserById;
    ClienteService.getById = originals.getClienteById;
    EmailService.sendUserUpdatedEmail = originals.sendUpdated;
  }
});
