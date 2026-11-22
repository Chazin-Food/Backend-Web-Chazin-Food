const assert = require('assert');
const bcrypt = require('bcryptjs');
const {
  mapWompiPaymentMethodType,
  normalizePrincipalPaymentMethod,
  resolveMetodoPagoDetalle,
  computeClientPurchasePreferences
} = require('../src/infrastructure/utils/paymentMethodUtils');
const AuthService = require('../src/application/services/authService');
const models = require('../src/persistence/models');
const EmailService = require('../src/application/services/emailService');

async function runTests() {
  let passed = 0;
  async function test(name, fn) {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  }

  console.log('Ejecutando pruebas de Preferencias de Compra y Google OAuth Password...');

  await test('Mapea correctamente todos los payment_method_type de Wompi a nombres legibles', () => {
    assert.strictEqual(mapWompiPaymentMethodType('CARD'), 'Tarjeta');
    assert.strictEqual(mapWompiPaymentMethodType('NEQUI'), 'Nequi');
    assert.strictEqual(mapWompiPaymentMethodType('PSE'), 'PSE');
    assert.strictEqual(mapWompiPaymentMethodType('BANCOLOMBIA_TRANSFER'), 'Botón Bancolombia');
    assert.strictEqual(mapWompiPaymentMethodType('BANCOLOMBIA_COLLECT'), 'Corresponsal Bancolombia');
    assert.strictEqual(mapWompiPaymentMethodType('DAVIPLATA'), 'DaviPlata');
    assert.strictEqual(mapWompiPaymentMethodType('PCOL'), 'Puntos Colombia');
    assert.strictEqual(mapWompiPaymentMethodType('BNPL'), 'BNPL');
    assert.strictEqual(mapWompiPaymentMethodType('SU_PLUS'), 'Crédito SU+Pay');
    assert.strictEqual(mapWompiPaymentMethodType('Wompi'), null);
  });

  await test('Mantiene el método principal limpio (Wompi / Efectivo) y extrae detalle incluso de registros legacy', () => {
    assert.strictEqual(normalizePrincipalPaymentMethod('Wompi (CARD)', true), 'Wompi');
    assert.strictEqual(normalizePrincipalPaymentMethod('Wompi', true), 'Wompi');
    assert.strictEqual(normalizePrincipalPaymentMethod('Efectivo', false), 'Efectivo');

    assert.strictEqual(
      resolveMetodoPagoDetalle({ metodo_pago_detalle: 'Nequi', metodoPago: 'Wompi' }, 'Wompi'),
      'Nequi'
    );
    assert.strictEqual(
      resolveMetodoPagoDetalle({ paymentMethodType: 'BANCOLOMBIA_TRANSFER', metodoPago: 'Wompi' }, 'Wompi'),
      'Botón Bancolombia'
    );
    assert.strictEqual(
      resolveMetodoPagoDetalle({ metodoPago: 'Wompi (CARD)' }, 'Wompi (CARD)'),
      'Tarjeta'
    );
    assert.strictEqual(
      resolveMetodoPagoDetalle({ metodoPago: 'Efectivo' }, 'Efectivo'),
      null
    );
  });

  await test('Estado vacío: 0 compras devuelve tieneCompras=false y null en método/entrega (sin Efectivo 100% ni A Domicilio)', () => {
    const emptyPrefs = computeClientPurchasePreferences([]);
    assert.strictEqual(emptyPrefs.tieneCompras, false);
    assert.strictEqual(emptyPrefs.totalCompras, 0);
    assert.strictEqual(emptyPrefs.metodoPagoFavorito, null);
    assert.strictEqual(emptyPrefs.metodoPagoPorcentaje, 0);
    assert.strictEqual(emptyPrefs.preferenciaEntrega, null);
  });

  await test('Combina compras online Wompi (detalle) y compras presenciales POS (Efectivo) con porcentaje real', () => {
    const ventas = [
      {
        tipoVenta: 'DOMICILIO',
        origen: 'ONLINE',
        observaciones: JSON.stringify({
          origen: 'ONLINE',
          tipoEntrega: 'Domicilio',
          metodoPago: 'Wompi',
          metodo_pago_detalle: 'Nequi'
        })
      },
      {
        tipoVenta: 'DOMICILIO',
        origen: 'ONLINE',
        observaciones: JSON.stringify({
          origen: 'ONLINE',
          tipoEntrega: 'Domicilio',
          metodoPago: 'Wompi',
          paymentMethodType: 'NEQUI'
        })
      },
      {
        tipoVenta: 'PUNTO_DE_VENTA',
        origen: 'PUNTO_FISICO',
        observaciones: JSON.stringify({
          origen: 'PUNTO_FISICO',
          tipoEntrega: 'En Mesa',
          metodoPago: 'Efectivo'
        })
      }
    ];
    const prefs = computeClientPurchasePreferences(ventas);
    assert.strictEqual(prefs.tieneCompras, true);
    assert.strictEqual(prefs.totalCompras, 3);
    assert.strictEqual(prefs.metodoPagoFavorito, 'Nequi');
    assert.strictEqual(prefs.metodoPagoPorcentaje, 67);
    assert.strictEqual(prefs.preferenciaEntrega, 'A Domicilio');

    // Ahora con mayoría POS Efectivo
    const ventasPos = [
      ventas[2],
      ventas[2],
      {
        tipoVenta: 'DOMICILIO',
        origen: 'ONLINE',
        observaciones: JSON.stringify({
          origen: 'ONLINE',
          tipoEntrega: 'Domicilio',
          metodoPago: 'Wompi',
          paymentMethodType: 'CARD'
        })
      }
    ];
    const prefsPos = computeClientPurchasePreferences(ventasPos);
    assert.strictEqual(prefsPos.metodoPagoFavorito, 'Efectivo');
    assert.strictEqual(prefsPos.metodoPagoPorcentaje, 67);
    assert.strictEqual(prefsPos.preferenciaEntrega, 'En Mesa');
  });

  await test('resolveUserAuthFlags distingue Google sin contraseña local, Google con contraseña y cuenta local normal', async () => {
    const realHash = await bcrypt.hash('MiClaveSegura123', 4);

    // 1. Usuario nuevo de Google con marcador OAUTH_GOOGLE_UNSET_
    const flagsNewGoogle = AuthService.resolveUserAuthFlags({
      contrasena: `${AuthService.GOOGLE_OAUTH_NO_PASSWORD_PREFIX}abcdef123456`,
      foto: 'https://lh3.googleusercontent.com/a/avatar'
    }, { direccion: JSON.stringify({ authProvider: 'google', googleVinculado: true, tienePasswordLocal: false }) });
    assert.strictEqual(flagsNewGoogle.esUsuarioGoogle, true);
    assert.strictEqual(flagsNewGoogle.tiene_password, false);

    // 2. Usuario legacy de Google (hash aleatorio anterior, sin tienePasswordLocal)
    const flagsLegacyGoogle = AuthService.resolveUserAuthFlags({
      contrasena: realHash,
      foto: 'https://lh3.googleusercontent.com/a/legacy'
    }, { direccion: JSON.stringify({ direccion: 'CR 90B', tipo: 'Nuevo' }) });
    assert.strictEqual(flagsLegacyGoogle.esUsuarioGoogle, true);
    assert.strictEqual(flagsLegacyGoogle.tiene_password, false);

    // 3. Usuario Google que ya asignó su contraseña local
    const flagsGoogleWithPass = AuthService.resolveUserAuthFlags({
      contrasena: realHash,
      foto: 'https://lh3.googleusercontent.com/a/legacy'
    }, { direccion: JSON.stringify({ direccion: 'CR 90B', googleVinculado: true, tienePasswordLocal: true }) });
    assert.strictEqual(flagsGoogleWithPass.esUsuarioGoogle, true);
    assert.strictEqual(flagsGoogleWithPass.tiene_password, true);

    // 4. Usuario tradicional correo/contraseña
    const flagsLocal = AuthService.resolveUserAuthFlags({
      contrasena: realHash,
      foto: null
    }, { direccion: JSON.stringify({ direccion: 'Calle 10' }) });
    assert.strictEqual(flagsLocal.esUsuarioGoogle, false);
    assert.strictEqual(flagsLocal.tiene_password, true);
  });

  await test('updateProfile permite a usuario Google con tiene_password=false crear contraseña sin passwordActual y luego exige passwordActual', async () => {
    const origFindByPk = models.User.findByPk;
    const origGetProfile = AuthService.getUserProfile;
    const origSendEmail = EmailService.sendPasswordChangedEmail;

    let currentHash = `${AuthService.GOOGLE_OAUTH_NO_PASSWORD_PREFIX}test123`;
    let clienteDireccion = JSON.stringify({ direccion: 'Calle 1', authProvider: 'google', googleVinculado: true, tienePasswordLocal: false });

    const mockCliente = {
      idCliente: 55,
      idUsuario: 77,
      get direccion() { return clienteDireccion; },
      set direccion(v) { clienteDireccion = v; },
      async save() { return this; }
    };

    const mockUser = {
      idUsuario: 77,
      nombre: 'Samuel',
      apellidos: 'Test',
      email: 'samu.test@gmail.com',
      foto: 'https://lh3.googleusercontent.com/a/test',
      numeroDocumento: '1018238872',
      idRol: 4,
      get contrasena() { return currentHash; },
      set contrasena(v) { currentHash = v; },
      clienteInfo: mockCliente,
      async update(patch) {
        if (patch.contrasena !== undefined) currentHash = patch.contrasena;
        return this;
      }
    };

    try {
      models.User.findByPk = async () => mockUser;
      EmailService.sendPasswordChangedEmail = async () => true;
      AuthService.getUserProfile = async () => {
        const flags = AuthService.resolveUserAuthFlags(mockUser, mockCliente);
        return { idUsuario: 77, ...flags };
      };

      // Paso 1: sin contraseña local -> crea contraseña sin enviar passwordActual
      const createdRes = await AuthService.updateProfile(77, { passwordNueva: 'NuevaClave2026!' });
      assert.strictEqual(createdRes.tiene_password, true);
      assert.strictEqual(await bcrypt.compare('NuevaClave2026!', currentHash), true);
      assert.strictEqual(JSON.parse(clienteDireccion).tienePasswordLocal, true);

      // Paso 2: ya tiene contraseña local -> intentar cambiar sin passwordActual DEBE fallar con 400
      let rejectedWithoutCurrent = false;
      try {
        await AuthService.updateProfile(77, { passwordNueva: 'OtraClave999!' });
      } catch (err) {
        rejectedWithoutCurrent = err.statusCode === 400;
      }
      assert.strictEqual(rejectedWithoutCurrent, true, 'Debe exigir passwordActual cuando tiene_password === true');

      // Paso 3: cambiando con passwordActual correcta -> debe permitir
      const updatedRes = await AuthService.updateProfile(77, {
        passwordActual: 'NuevaClave2026!',
        passwordNueva: 'ClaveActualizada99!'
      });
      assert.strictEqual(updatedRes.tiene_password, true);
      assert.strictEqual(await bcrypt.compare('ClaveActualizada99!', currentHash), true);
    } finally {
      models.User.findByPk = origFindByPk;
      AuthService.getUserProfile = origGetProfile;
      EmailService.sendPasswordChangedEmail = origSendEmail;
    }
  });

  console.log(`Todas las pruebas pasaron (${passed}/${passed}).`);
}

runTests().catch((err) => {
  console.error('ERROR EN PRUEBA:', err);
  process.exit(1);
});
