-- ============================================================================
-- Script idempotente para TiDB Cloud / MySQL 8
-- 1) Limpia variantes dummy ("Variante Base ...") si existieran
-- 2) Normaliza precios e insumos (1 und) + FichaTecnica en TODAS las gaseosas
-- 3) Crea variantes coherentes con FichaTecnica + VarianteInsumo en
--    Hamburguesas (#1, #3, #27, #28), Perros Calientes (#4, #5, #30)
--    y Salchipapas Gourmet (#6, #32, #33)
-- ============================================================================
USE `chazinfood`;

-- 0. Limpiar posibles variantes dummy de plantilla
UPDATE `variante` SET `estado` = 0 WHERE LOWER(TRIM(`nombre`)) LIKE 'variante base%';

-- ============================================================================
-- 1. BEBIDAS Y GASEOSAS (#8, #9, #10, #11, #12, #13, #14, #16, #38, #39)
-- ============================================================================
-- Producto #8
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sin Azúcar / Light 400ml', CONCAT(p.`nombre`, ' (Sin Azúcar / Light 400ml)'), 4500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 8 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml'));
UPDATE `variante` SET `precio` = 4500.00
WHERE `idProducto` = 8 AND LOWER(TRIM(`nombre`)) = LOWER('Sin Azúcar / Light 400ml') AND ABS(COALESCE(`precio`, 0) - 4500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 32, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 8, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 32, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 9500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 8 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 9500.00
WHERE `idProducto` = 8 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 9500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 29, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 8, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 29, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 8 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 8 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 29, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 8, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 29, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 8 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #16
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Con Azúcar 400ml', CONCAT(p.`nombre`, ' (Con Azúcar 400ml)'), 4500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 16 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Azúcar 400ml'));
UPDATE `variante` SET `precio` = 4500.00
WHERE `idProducto` = 16 AND LOWER(TRIM(`nombre`)) = LOWER('Con Azúcar 400ml') AND ABS(COALESCE(`precio`, 0) - 4500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 29, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Azúcar 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 16, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Azúcar 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 29, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Azúcar 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 29)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 9500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 16 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 9500.00
WHERE `idProducto` = 16 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 9500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 32, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 16, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 32, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 16 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 16 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 32, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 16, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 32, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 16 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 32)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #10
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 5500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 10 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 10 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 5500.00
WHERE `idProducto` = 10 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 5500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 31, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 10 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 31)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 10, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 10 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 31, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 10 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 31)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #9
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 9 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 9 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 30, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 9, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 30, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 9 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 9 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 30, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 9, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 30, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Uva 400ml', CONCAT(p.`nombre`, ' (Sabor Uva 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 9 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 9 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Uva 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 47, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 9, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 47, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Naranja 400ml', CONCAT(p.`nombre`, ' (Sabor Naranja 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 9 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 9 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Naranja 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 48, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 9, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 48, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Gaseosa Colombiana Postobón 400ml', CONCAT(p.`nombre`, ' (Gaseosa Colombiana Postobón 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 9 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Gaseosa Colombiana Postobón 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 9 AND LOWER(TRIM(`nombre`)) = LOWER('Gaseosa Colombiana Postobón 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 35, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Gaseosa Colombiana Postobón 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 9, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Gaseosa Colombiana Postobón 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 35, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 9 AND LOWER(TRIM(v.`nombre`)) = LOWER('Gaseosa Colombiana Postobón 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #11
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 11 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 11 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 33, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 33)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 11, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 33, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 33)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 11 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 11 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 33, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 33)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 11, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 33, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 33)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sin Azúcar / Light 400ml', CONCAT(p.`nombre`, ' (Sin Azúcar / Light 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 11 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 11 AND LOWER(TRIM(`nombre`)) = LOWER('Sin Azúcar / Light 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 34, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 34)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 11, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 34, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 11 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sin Azúcar / Light 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 34)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #12
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 12 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 12 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 35, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 12, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 35, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 12 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 12 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 35, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 12, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 35, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Uva 400ml', CONCAT(p.`nombre`, ' (Sabor Uva 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 12 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 12 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Uva 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 47, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 12, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 47, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Naranja 400ml', CONCAT(p.`nombre`, ' (Sabor Naranja 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 12 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 12 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Naranja 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 48, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 12, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 48, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Manzana 400ml', CONCAT(p.`nombre`, ' (Sabor Manzana 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 12 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 12 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Manzana 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 30, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 12, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 30, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 12 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #13
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 13 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 13 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 36, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 36)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 13, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 36, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 36)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 13 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 13 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 36, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 36)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 13, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 36, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 13 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 36)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #14
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 14 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 14 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 37, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 37)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 14, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 37, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 37)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 14 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 14 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 37, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 37)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 14, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 37, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 14 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 37)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #38
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 38 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 38 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 47, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 38, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 47, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 38 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 38 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 47, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 38, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 47, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Naranja 400ml', CONCAT(p.`nombre`, ' (Sabor Naranja 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 38 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 38 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Naranja 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 48, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 38, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 48, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Naranja 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Manzana 400ml', CONCAT(p.`nombre`, ' (Sabor Manzana 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 38 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 38 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Manzana 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 30, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 38, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 30, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Colombiana 400ml', CONCAT(p.`nombre`, ' (Sabor Colombiana 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 38 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 38 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Colombiana 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 35, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 38, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 35, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 38 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- Producto #39
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Botella 1.5 Litros', CONCAT(p.`nombre`, ' (Botella 1.5 Litros)'), 10500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 39 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros'));
UPDATE `variante` SET `precio` = 10500.00
WHERE `idProducto` = 39 AND LOWER(TRIM(`nombre`)) = LOWER('Botella 1.5 Litros') AND ABS(COALESCE(`precio`, 0) - 10500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 48, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 39, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 48, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Botella 1.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mega Botella 2.5 Litros', CONCAT(p.`nombre`, ' (Mega Botella 2.5 Litros)'), 13500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 39 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros'));
UPDATE `variante` SET `precio` = 13500.00
WHERE `idProducto` = 39 AND LOWER(TRIM(`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ABS(COALESCE(`precio`, 0) - 13500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 48, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 39, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 48, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mega Botella 2.5 Litros') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 48)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Uva 400ml', CONCAT(p.`nombre`, ' (Sabor Uva 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 39 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 39 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Uva 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 47, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 39, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 47, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Uva 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 47)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Manzana 400ml', CONCAT(p.`nombre`, ' (Sabor Manzana 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 39 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 39 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Manzana 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 30, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 39, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 30, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Manzana 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 30)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Sabor Colombiana 400ml', CONCAT(p.`nombre`, ' (Sabor Colombiana 400ml)'), 8500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 39 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml'));
UPDATE `variante` SET `precio` = 8500.00
WHERE `idProducto` = 39 AND LOWER(TRIM(`nombre`)) = LOWER('Sabor Colombiana 400ml') AND ABS(COALESCE(`precio`, 0) - 8500.00) > 0.01;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 35, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante`)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, CONCAT(p.`nombre`, ' — ', v.`nombre`), NOW(), 39, NULL, 'VARIANTE', 'Servir bebida refrigerada entre 2°C y 4°C según presentación.', 1, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v INNER JOIN `producto` p ON p.`idProducto` = v.`idProducto`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 35, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 39 AND LOWER(TRIM(v.`nombre`)) = LOWER('Sabor Colombiana 400ml') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 35)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica`)
LIMIT 1;

-- ============================================================================
-- 2. VARIANTES DE HAMBURGUESAS, PERROS CALIENTES Y SALCHIPAPAS GOURMET
-- ============================================================================
-- Producto #1
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Doble Carne Clásica (300g)', 'Hamburguesa doble carne de res molida 80/20 (300g), doble queso cheddar y tocineta ahumada.', 24000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 1 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 24000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Hamburguesa doble carne de res molida 80/20 (300g), doble queso cheddar y tocineta ahumada.' ELSE `descripcion` END
WHERE `idProducto` = 1 AND LOWER(TRIM(`nombre`)) = LOWER('Doble Carne Clásica (300g)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 14, NULL, 0.30, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 19, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.05, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Hamburguesa doble carne de res molida 80/20 (300g), doble queso cheddar y tocineta ahumada.', NOW(), 1, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 14, '1 porción (300g)', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.30, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 23, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne Clásica (300g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 23)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 23)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'BBQ Ahumada Especial', 'Hamburguesa clásica bañada en salsa BBQ ahumada artesanal, cebolla cabezona y doble cheddar.', 20500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 1 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 20500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Hamburguesa clásica bañada en salsa BBQ ahumada artesanal, cebolla cabezona y doble cheddar.' ELSE `descripcion` END
WHERE `idProducto` = 1 AND LOWER(TRIM(`nombre`)) = LOWER('BBQ Ahumada Especial');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 19, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 44, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 24, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Hamburguesa clásica bañada en salsa BBQ ahumada artesanal, cebolla cabezona y doble cheddar.', NOW(), 1, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.15, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 44, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 23, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Ahumada Especial') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 23)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 23)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Picante Jalapeño & Cheddar', 'Hamburguesa con rodajas de jalapeño encurtido y salsa cremosa de queso cheddar fundido.', 21000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 1 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 21000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Hamburguesa con rodajas de jalapeño encurtido y salsa cremosa de queso cheddar fundido.' ELSE `descripcion` END
WHERE `idProducto` = 1 AND LOWER(TRIM(`nombre`)) = LOWER('Picante Jalapeño & Cheddar');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 25, NULL, 0.02, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 43, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Hamburguesa con rodajas de jalapeño encurtido y salsa cremosa de queso cheddar fundido.', NOW(), 1, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.15, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 25, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 23, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 1 AND LOWER(TRIM(v.`nombre`)) = LOWER('Picante Jalapeño & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 23)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 23)
LIMIT 1;

-- Producto #3
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Pollo Crispy Bacon & BBQ', 'Pechuga crispy crujiente con tocineta ahumada, queso cheddar y salsa BBQ artesanal.', 24500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 3 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 24500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Pechuga crispy crujiente con tocineta ahumada, queso cheddar y salsa BBQ artesanal.' ELSE `descripcion` END
WHERE `idProducto` = 3 AND LOWER(TRIM(`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 18, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 19, NULL, 1.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 44, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Pechuga crispy crujiente con tocineta ahumada, queso cheddar y salsa BBQ artesanal.', NOW(), 3, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 13, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 15, 0.18, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 15)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 15)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 44, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 23, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Pollo Crispy Bacon & BBQ') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 23)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 23)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Doble Pollo Crispy (360g)', 'Doble filete de pechuga crispy (360g) con doble mozzarella gratinado y salsa tártara especial.', 27500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 3 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 27500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Doble filete de pechuga crispy (360g) con doble mozzarella gratinado y salsa tártara especial.' ELSE `descripcion` END
WHERE `idProducto` = 3 AND LOWER(TRIM(`nombre`)) = LOWER('Doble Pollo Crispy (360g)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 15, NULL, 0.36, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 15)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 15)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 45, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 45)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Doble filete de pechuga crispy (360g) con doble mozzarella gratinado y salsa tártara especial.', NOW(), 3, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 15, '1 porción (360g)', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 15, 0.36, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 15)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 15)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 45, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 45)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 23, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 3 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Pollo Crispy (360g)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 23)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 23)
LIMIT 1;

-- Producto #27
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Individual BBQ Bacon 150g', 'Presentación individual 150g con tocineta ahumada, doble cheddar y salsa BBQ.', 22000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 27 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 22000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Presentación individual 150g con tocineta ahumada, doble cheddar y salsa BBQ.' ELSE `descripcion` END
WHERE `idProducto` = 27 AND LOWER(TRIM(`nombre`)) = LOWER('Individual BBQ Bacon 150g');
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Presentación individual 150g con tocineta ahumada, doble cheddar y salsa BBQ.', NOW(), 27, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción (150g)', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.15, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 44, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Individual BBQ Bacon 150g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 44)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Doble Carne BBQ Bacon 300g', 'Doble carne de res 300g con tocineta extra, triple cheddar y abundante salsa BBQ ahumada.', 28000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 27 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 28000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Doble carne de res 300g con tocineta extra, triple cheddar y abundante salsa BBQ ahumada.' ELSE `descripcion` END
WHERE `idProducto` = 27 AND LOWER(TRIM(`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 14, NULL, 0.30, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 19, NULL, 3.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 44, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Doble carne de res 300g con tocineta extra, triple cheddar y abundante salsa BBQ ahumada.', NOW(), 27, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 15, '1 porción (300g)', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.30, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 19, 3.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 19)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 19)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 44, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 27 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Carne BBQ Bacon 300g') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 44)
LIMIT 1;

-- Producto #28
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mexicana Clásica', 'Receta mexicana tradicional con guacamole artesanal fresco, jalapeños y queso mozzarella.', 23500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 28 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 23500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Receta mexicana tradicional con guacamole artesanal fresco, jalapeños y queso mozzarella.' ELSE `descripcion` END
WHERE `idProducto` = 28 AND LOWER(TRIM(`nombre`)) = LOWER('Mexicana Clásica');
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Receta mexicana tradicional con guacamole artesanal fresco, jalapeños y queso mozzarella.', NOW(), 28, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.15, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 40, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 40)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 40)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 25, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicana Clásica') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Extra Picante con Doble Jalapeño', 'Versión intensa con doble porción de jalapeños, guacamole extra y salsa de cheddar fundido.', 25000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 28 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 25000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Versión intensa con doble porción de jalapeños, guacamole extra y salsa de cheddar fundido.' ELSE `descripcion` END
WHERE `idProducto` = 28 AND LOWER(TRIM(`nombre`)) = LOWER('Extra Picante con Doble Jalapeño');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 40, NULL, 0.07, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 40)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 40)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 25, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 43, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Versión intensa con doble porción de jalapeños, guacamole extra y salsa de cheddar fundido.', NOW(), 28, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 12, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 12)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 12)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 14, 0.15, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 14)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 14)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 40, 0.07, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 40)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 40)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 25, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 22, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 28 AND LOWER(TRIM(v.`nombre`)) = LOWER('Extra Picante con Doble Jalapeño') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 22)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 22)
LIMIT 1;

-- Producto #4
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Doble Salchicha & Extra Queso', 'Perro americano con doble salchicha premium, tocineta ahumada y extra mozzarella gratinado.', 18000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 4 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 18000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Perro americano con doble salchicha premium, tocineta ahumada y extra mozzarella gratinado.' ELSE `descripcion` END
WHERE `idProducto` = 4 AND LOWER(TRIM(`nombre`)) = LOWER('Doble Salchicha & Extra Queso');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 16, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.07, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Perro americano con doble salchicha premium, tocineta ahumada y extra mozzarella gratinado.', NOW(), 4, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 10, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.07, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha & Extra Queso') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Con Chili & Cheddar Fundido', 'Perro americano cubierto con chili con carne artesanal y salsa de queso cheddar fundido.', 18500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 4 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 18500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Perro americano cubierto con chili con carne artesanal y salsa de queso cheddar fundido.' ELSE `descripcion` END
WHERE `idProducto` = 4 AND LOWER(TRIM(`nombre`)) = LOWER('Con Chili & Cheddar Fundido');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 39, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 39)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 39)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 43, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Perro americano cubierto con chili con carne artesanal y salsa de queso cheddar fundido.', NOW(), 4, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 10, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 39, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 39)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 39)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('Con Chili & Cheddar Fundido') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'BBQ Tocino & Cebolla', 'Perro caliente americano con extra tocineta, cebolla caramelizada y salsa BBQ ahumada.', 16500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 4 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 16500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Perro caliente americano con extra tocineta, cebolla caramelizada y salsa BBQ ahumada.' ELSE `descripcion` END
WHERE `idProducto` = 4 AND LOWER(TRIM(`nombre`)) = LOWER('BBQ Tocino & Cebolla');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.05, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 24, NULL, 0.02, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 44, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 44)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Perro caliente americano con extra tocineta, cebolla caramelizada y salsa BBQ ahumada.', NOW(), 4, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 10, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.02, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 44, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 4 AND LOWER(TRIM(v.`nombre`)) = LOWER('BBQ Tocino & Cebolla') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 44)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 44)
LIMIT 1;

-- Producto #5
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Suizo Gratinado con Tártara & Cheddar', 'Salchicha suiza ahumada con gratinado extra de mozzarella, salsa cheddar y tártara de la casa.', 19500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 5 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 19500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Salchicha suiza ahumada con gratinado extra de mozzarella, salsa cheddar y tártara de la casa.' ELSE `descripcion` END
WHERE `idProducto` = 5 AND LOWER(TRIM(`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 43, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 45, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 45)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Salchicha suiza ahumada con gratinado extra de mozzarella, salsa cheddar y tártara de la casa.', NOW(), 5, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 11, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 45, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Suizo Gratinado con Tártara & Cheddar') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 45)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Doble Salchicha Suiza Jumbo', 'Edición jumbo con doble salchicha suiza artesanal ahumada, tocineta y queso mozzarella.', 22500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 5 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 22500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Edición jumbo con doble salchicha suiza artesanal ahumada, tocineta y queso mozzarella.' ELSE `descripcion` END
WHERE `idProducto` = 5 AND LOWER(TRIM(`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 17, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.05, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.07, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Edición jumbo con doble salchicha suiza artesanal ahumada, tocineta y queso mozzarella.', NOW(), 5, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción Jumbo', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.07, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 24, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 5 AND LOWER(TRIM(v.`nombre`)) = LOWER('Doble Salchicha Suiza Jumbo') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 24)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 24)
LIMIT 1;

-- Producto #30
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Mexicano Extra Picante & Doble Salchicha', 'Doble salchicha americana con extra guacamole, doble jalapeño picante, cheddar y tocineta.', 20500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 30 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 20500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Doble salchicha americana con extra guacamole, doble jalapeño picante, cheddar y tocineta.' ELSE `descripcion` END
WHERE `idProducto` = 30 AND LOWER(TRIM(`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 16, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 40, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 40)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 40)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 43, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.03, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 25, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 25)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Doble salchicha americana con extra guacamole, doble jalapeño picante, cheddar y tocineta.', NOW(), 30, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 12, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 13, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 13)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 13)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 40, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 40)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 40)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 25, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 30 AND LOWER(TRIM(v.`nombre`)) = LOWER('Mexicano Extra Picante & Doble Salchicha') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 25)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 25)
LIMIT 1;

-- Producto #6
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Salvaje con Carne & Cheddar (Mediana)', 'Salchipapa salvaje enriquecida con chili con carne de res artesanal y salsa cheddar fundido.', 27500.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 6 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 27500.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Salchipapa salvaje enriquecida con chili con carne de res artesanal y salsa cheddar fundido.' ELSE `descripcion` END
WHERE `idProducto` = 6 AND LOWER(TRIM(`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 39, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 39)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 39)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'AGREGAR', 43, NULL, 0.04, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Salchipapa salvaje enriquecida con chili con carne de res artesanal y salsa cheddar fundido.', NOW(), 6, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 14, '1 porción abundante', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 21, 0.25, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 1.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 39, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 39)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 39)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Salvaje con Carne & Cheddar (Mediana)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Familiar Salvaje (2 a 3 Personas)', 'Porción familiar generosa (500g de papas, doble salchicha americana y suiza, tocineta y mozzarella).', 38000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 6 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 38000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Porción familiar generosa (500g de papas, doble salchicha americana y suiza, tocineta y mozzarella).' ELSE `descripcion` END
WHERE `idProducto` = 6 AND LOWER(TRIM(`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 21, NULL, 0.50, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 16, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 17, NULL, 2.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.12, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Porción familiar generosa (500g de papas, doble salchicha americana y suiza, tocineta y mozzarella).', NOW(), 6, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 16, '2 a 3 porciones', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 21, 0.50, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 2.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.12, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 6 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Salvaje (2 a 3 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;

-- Producto #32
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Porción Personal Grande', 'Salchipapa criolla personal con tocineta, mozzarella, suero costeño y salsa cheddar.', 21000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 32 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 21000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Salchipapa criolla personal con tocineta, mozzarella, suero costeño y salsa cheddar.' ELSE `descripcion` END
WHERE `idProducto` = 32 AND LOWER(TRIM(`nombre`)) = LOWER('Porción Personal Grande');
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Salchipapa criolla personal con tocineta, mozzarella, suero costeño y salsa cheddar.', NOW(), 32, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 13, '1 porción grande', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 21, 0.25, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 1.50, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 41, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Porción Personal Grande') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Familiar para Compartir (2 Personas)', 'Versión familiar para 2 personas con doble porción de papa, 3 salchichas americanas, tocineta y salsas.', 34000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 32 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 34000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Versión familiar para 2 personas con doble porción de papa, 3 salchichas americanas, tocineta y salsas.' ELSE `descripcion` END
WHERE `idProducto` = 32 AND LOWER(TRIM(`nombre`)) = LOWER('Familiar para Compartir (2 Personas)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 21, NULL, 0.50, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 16, NULL, 3.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.10, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 41, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 43, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 43)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Versión familiar para 2 personas con doble porción de papa, 3 salchichas americanas, tocineta y salsas.', NOW(), 32, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 16, '2 porciones', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 21, 0.50, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 16, 3.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 16)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 16)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.10, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 41, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 43, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 32 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar para Compartir (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 43)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 43)
LIMIT 1;

-- Producto #33
INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Costeña con Papas en Casco Rústicas', 'Salchipapa costeña preparada con papas rústicas en casco con piel en reemplazo de papa delgada.', 24000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 33 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 24000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Salchipapa costeña preparada con papas rústicas en casco con piel en reemplazo de papa delgada.' ELSE `descripcion` END
WHERE `idProducto` = 33 AND LOWER(TRIM(`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'REEMPLAZAR', 38, 21, 0.25, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 38)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 38)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Salchipapa costeña preparada con papas rústicas en casco con piel en reemplazo de papa delgada.', NOW(), 33, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 14, '1 porción', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 38, 0.25, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 38)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 38)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 1.50, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.05, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 41, 0.04, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 45, 0.03, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Costeña con Papas en Casco Rústicas') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 45)
LIMIT 1;

INSERT INTO `variante` (`idProducto`, `nombre`, `descripcion`, `precio`, `estado`)
SELECT p.`idProducto`, 'Familiar Costeña (2 Personas)', 'Presentación familiar costeña para 2 personas con 3 salchichas suizas, suero costeño y salsa tártara.', 36000.00, COALESCE(p.`estado`, 1)
FROM `producto` p
WHERE p.`idProducto` = 33 AND COALESCE(p.`eliminado`, 0) = 0
  AND NOT EXISTS (SELECT 1 FROM `variante` v WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)'));
UPDATE `variante`
SET `precio` = CASE WHEN COALESCE(`precio`, 0) <= 0 THEN 36000.00 ELSE `precio` END,
    `descripcion` = CASE WHEN `descripcion` IS NULL OR TRIM(`descripcion`) = '' THEN 'Presentación familiar costeña para 2 personas con 3 salchichas suizas, suero costeño y salsa tártara.' ELSE `descripcion` END
WHERE `idProducto` = 33 AND LOWER(TRIM(`nombre`)) = LOWER('Familiar Costeña (2 Personas)');
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 21, NULL, 0.50, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 17, NULL, 3.00, 'und', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 18, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 20, NULL, 0.10, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 41, NULL, 0.08, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `variante_insumo` (`idVariante`, `tipoAccion`, `idInsumo`, `idInsumoReemplazado`, `cantidad`, `unidadMedida`, `observaciones`)
SELECT v.`idVariante`, 'MODIFICAR_CANTIDAD', 45, NULL, 0.06, 'kg', NULL
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `variante_insumo` vi WHERE vi.`idVariante` = v.`idVariante` AND vi.`idInsumo` = 45)
LIMIT 1;
INSERT INTO `fichatecnica` (`idVariante`, `descripcion`, `fechaCreacion`, `idProducto`, `idInsumo`, `tipo`, `procedimiento`, `tiempoPreparacion`, `rendimiento`, `especificaciones`, `caracteristicas`, `informacionNutricional`, `condicionesAlmacenamiento`, `vidaUtil`, `observaciones`, `versionActual`, `estado`)
SELECT v.`idVariante`, 'Presentación familiar costeña para 2 personas con 3 salchichas suizas, suero costeño y salsa tártara.', NOW(), 33, NULL, 'VARIANTE', CONCAT('Preparación estándar Chazin Food para ', v.`nombre`), 16, '2 porciones', '', CONCAT('Variante: ', v.`nombre`), '', '', '', '', 1, 1
FROM `variante` v
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)')
  AND NOT EXISTS (SELECT 1 FROM `fichatecnica` ft WHERE ft.`idVariante` = v.`idVariante` AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 21, 0.50, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 21)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 21)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 17, 3.00, 'und'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 17)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 17)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 18, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 18)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 18)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 20, 0.10, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 20)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 20)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 41, 0.08, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 41)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 41)
LIMIT 1;
INSERT INTO `detallefichainsumo` (`idFichaTecnica`, `idInsumo`, `cantidad`, `unidadMedida`)
SELECT ft.`idFichaTecnica`, 45, 0.06, 'kg'
FROM `fichatecnica` ft INNER JOIN `variante` v ON v.`idVariante` = ft.`idVariante`
WHERE v.`idProducto` = 33 AND LOWER(TRIM(v.`nombre`)) = LOWER('Familiar Costeña (2 Personas)') AND ft.`tipo` = 'VARIANTE' AND ft.`estado` = 1
  AND EXISTS (SELECT 1 FROM `insumo` i WHERE i.`idInsumo` = 45)
  AND NOT EXISTS (SELECT 1 FROM `detallefichainsumo` dfi WHERE dfi.`idFichaTecnica` = ft.`idFichaTecnica` AND dfi.`idInsumo` = 45)
LIMIT 1;

COMMIT;
