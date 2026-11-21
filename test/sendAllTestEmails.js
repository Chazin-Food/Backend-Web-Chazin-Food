/**
 * Script de Pruebas de Envío de Todos los Correos Electrónicos (5 tipos)
 * Destinatario: samu36669@gmail.com
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Forzar dominio productivo oficial para que todos los botones y links de la prueba abran la web real
process.env.NODE_ENV = 'production';
process.env.FRONTEND_URL = 'https://frontend-web-chazin-food.vercel.app';

const EmailService = require('../src/application/services/emailService');

const TARGET_EMAIL = 'samu36669@gmail.com';
const USER_NAME = 'Samuel';
const USER_LASTNAME = 'Gutiérrez Franco';
const BASE_URL = EmailService.resolveFrontendUrl();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAllEmailTests() {
  console.log('====================================================');
  console.log('🚀 INICIANDO BATERÍA DE PRUEBAS DE CORREOS CHAZIN FOOD');
  console.log(`📬 Destinatario objetivo: ${TARGET_EMAIL}`);
  console.log(`🌐 URL Base en enlaces: ${BASE_URL}`);
  console.log('====================================================\n');

  // 1. Correo de Bienvenida (con 1 dato pendiente para verificar el botón "Completar mi perfil" -> /perfil?tab=editar&cuenta=...)
  console.log('1️⃣ Enviando Correo de Bienvenida...');
  const res1 = await EmailService.sendWelcomeEmail({
    email: TARGET_EMAIL,
    nombre: USER_NAME,
    apellidos: USER_LASTNAME,
    password: '',
    esGoogle: true,
    usuario: {
      idRol: 4,
      nombre: USER_NAME,
      apellidos: USER_LASTNAME,
      numeroDocumento: '1030555777',
      telefono: '3192028562',
      direccion: ''
    }
  });
  console.log(res1 ? '   ✅ Correo 1 (Bienvenida) enviado con éxito.' : '   ❌ Error al enviar Correo 1.');
  await sleep(1500);

  // 2. Correo de Activación de Cliente (perfil completo, sin alerta de datos pendientes)
  console.log('\n2️⃣ Enviando Correo de Activación de Cuenta de Cliente...');
  const res2 = await EmailService.sendActivationEmail({
    email: TARGET_EMAIL,
    nombre: USER_NAME,
    apellidos: USER_LASTNAME,
    password: '',
    activationLink: `${BASE_URL}/activar-cuenta?token=demo_revisar_activacion`,
    usuario: {
      idRol: 4,
      nombre: USER_NAME,
      apellidos: USER_LASTNAME,
      numeroDocumento: '1030555777',
      telefono: '3192028562',
      direccion: 'Calle 21 #80-21, Belén, Medellín'
    }
  });
  console.log(res2 ? '   ✅ Correo 2 (Activación) enviado con éxito.' : '   ❌ Error al enviar Correo 2.');
  await sleep(1500);

  // 3. Correo de Restablecimiento de Contraseña
  console.log('\n3️⃣ Enviando Correo de Restablecimiento de Contraseña...');
  const res3 = await EmailService.sendPasswordResetEmail({
    email: TARGET_EMAIL,
    nombre: USER_NAME,
    apellidos: USER_LASTNAME,
    resetLink: `${BASE_URL}/reset-password?token=demo_revisar_reset&email=${encodeURIComponent(TARGET_EMAIL)}`
  });
  console.log(res3 ? '   ✅ Correo 3 (Restablecer Clave) enviado con éxito.' : '   ❌ Error al enviar Correo 3.');
  await sleep(1500);

  // 4. Correo de Confirmación de Cambio de Contraseña
  console.log('\n4️⃣ Enviando Notificación de Cambio de Contraseña...');
  const res4 = await EmailService.sendPasswordChangedEmail({
    email: TARGET_EMAIL,
    nombre: USER_NAME,
    apellidos: USER_LASTNAME
  });
  console.log(res4 ? '   ✅ Correo 4 (Contraseña Modificada) enviado con éxito.' : '   ❌ Error al enviar Correo 4.');
  await sleep(1500);

  // 5. Correo de Actualización de Perfil (solo 1 campo realmente modificado y perfil completo -> sin advertencia de pendientes)
  console.log('\n5️⃣ Enviando Notificación de Datos de Usuario Actualizados...');
  const res5 = await EmailService.sendUserUpdatedEmail({
    email: TARGET_EMAIL,
    nombre: USER_NAME,
    apellidos: USER_LASTNAME,
    modifiedFields: 'Teléfono',
    usuario: {
      idRol: 4,
      nombre: USER_NAME,
      apellidos: USER_LASTNAME,
      numeroDocumento: '1030555777',
      telefono: '3192028562',
      direccion: 'Calle 21 #80-21, Belén, Medellín'
    }
  });
  console.log(res5 ? '   ✅ Correo 5 (Perfil Actualizado) enviado con éxito.' : '   ❌ Error al enviar Correo 5.');

  const allOk = res1 && res2 && res3 && res4 && res5;
  console.log('\n====================================================');
  console.log(allOk ? '🎉 LOS 5 CORREOS DE PRUEBA FUERON ENVIADOS!' : '⚠️ ALGÚN CORREO FALLÓ EN EL ENVÍO.');
  console.log(`📬 Revisa tu bandeja de entrada en: ${TARGET_EMAIL}`);
  console.log('====================================================');
  if (!allOk) process.exit(1);
}

runAllEmailTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error general en la prueba:', err);
    process.exit(1);
  });
