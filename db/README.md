# Base de Datos Chazin Food

Esta carpeta contiene los scripts SQL actualizados y respaldos de la base de datos del sistema **Chazin Food**.

---

## 📁 Estructura de Archivos

| Archivo | Descripción |
| :--- | :--- |
| **`chazinfood.sql`** | **Archivo SQL único y oficial del proyecto.** 100% compatible con TiDB Cloud Serverless, Docker y MySQL 8.0 / MariaDB (XAMPP). Contiene el esquema completo (incluidas las columnas vigentes de `producto` y `devolucion`), datos de producción, vistas y la sección idempotente de variantes, fichas técnicas e insumos. |

---

## 🚀 Cómo importar la base de datos

### Opción 1: En XAMPP (MySQL Local)
1. Inicia **Apache** y **MySQL** desde el panel de control de XAMPP.
2. Abre tu terminal o PowerShell en la carpeta `backend` y ejecuta:
   ```bash
   C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS chazinfood DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   C:\xampp\mysql\bin\mysql.exe -u root chazinfood < "db\chazinfood.sql"
   ```
3. O si prefieres desde **phpMyAdmin** (`http://localhost/phpmyadmin`):
   - Crea la base de datos `chazinfood`.
   - Ve a la pestaña **Importar** y selecciona `db/chazinfood.sql`.

### Opción 2: En TiDB Cloud Serverless (Nube)
1. Conéctate a tu clúster de TiDB Cloud usando el CLI de MySQL o la consola web de TiDB:
   ```bash
   mysql -u '<tu_usuario>' -h '<gateway.tidbcloud.com>' -P 4000 -D chazinfood --ssl-mode=VERIFY_IDENTITY -p < "db\chazinfood.sql"
   ```
   *(Si tu base de datos en producción ya existe con pedidos/usuarios y solo quieres sincronizar variantes e insumos sin reiniciar tablas, copia únicamente el bloque final `SINCRONIZACIÓN DE VARIANTES, FICHAS TÉCNICAS E INSUMOS (IDEMPOTENTE)` de `db/chazinfood.sql`.)*
2. En tu archivo `.env`, configura las variables de conexión:
   ```env
   DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
   DB_PORT=4000
   DB_USER=tu_usuario_tidb
   DB_PASSWORD=tu_contraseña_tidb
   DB_NAME=chazinfood
   DB_SSL=true
   ```
