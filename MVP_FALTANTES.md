# MVP — Qué falta para lanzar

Este documento resume **qué falta o qué corregir** para tener un MVP listo, con foco en el flujo: **crear conexión → crear ETL → crear dashboard → editar → visualizar**, y en los **cálculos de métricas** y la **actualización automática**.

---

## 1. Flujo principal: Conexión → ETL → Dashboard → Editar → Visualizar

### 1.1 Conexiones

| Estado | Detalle |
|--------|--------|
| ✅ | Crear conexión (Postgres, MySQL, Firebird, Excel) desde admin y desde usuario. |
| ✅ | Editar y eliminar conexión. |
| ⚠️ | **Probar conexión**: existe flujo de “test” en el formulario; asegurar que el usuario vea claramente si la conexión funciona antes de guardar. |
| ⚠️ | **Listado en ETL**: En admin, la página ETL obtiene conexiones con `getConnections()` (RLS/sesión). Verificar que un admin vea todas las conexiones necesarias o las del cliente correcto según tu modelo de permisos. |

### 1.2 ETL

| Estado | Detalle |
|--------|--------|
| ✅ | Crear ETL (asignado a cliente en admin). |
| ✅ | Flujo guiado: Origen (conexión) → Columnas/filtros → Destino (tabla Supabase) → Ejecutar. |
| ✅ | API `/api/etl/run`: ejecuta la carga y registra en `etl_runs_log`. |
| ✅ | Monitores: historial de ejecuciones (éxito/fallo/en curso). |
| ⚠️ | **Conexiones por cliente**: El ETL usa conexiones que devuelve `getConnections()`. Confirmar que en el contexto “por cliente” las conexiones mostradas sean las adecuadas (por ejemplo filtro por `client_id` si aplica). |

### 1.3 Dashboard: crear y fuentes de datos

| Estado | Detalle |
|--------|--------|
| ✅ | Crear dashboard (admin: cliente + uno o varios ETLs; usuario: nombre + ETLs). |
| ✅ | `dashboard_data_sources`: múltiples ETLs por dashboard (Principal, Fuente 2, …). |
| ✅ | API `GET /api/dashboard/[dashboard-id]/etl-data` devuelve `dataSources[]` con schema/tabla y campos por ETL. |

### 1.4 Dashboard: editar

| Estado | Detalle |
|--------|--------|
| ✅ | Editor con widgets (gráficos, KPI, tabla, filtros, texto, imagen). |
| ✅ | Configuración de agregación por widget (dimensión, métricas, filtros, orden, límite). |
| ✅ | Admin: `AdminDashboardEditor` y formulario de métricas con fuente de datos (cuando hay varias). |
| ⚠️ | **Persistencia del layout**: Confirmar que al guardar el dashboard se persisten bien `layout` (widgets con `aggregationConfig`, `source`, etc.) y que no se pierden opciones avanzadas (ver sección de métricas). |

### 1.5 Dashboard: visualizar

| Estado | Detalle |
|--------|--------|
| ✅ | Vista de solo lectura (editor y ruta `/view`). |
| ✅ | Vista pública por token: `/public/dashboard/[token]` con APIs propias (`etl-data`, `aggregate-data`, `raw-data`, `distinct-values`). |
| ❌ | **Widgets con varias fuentes (multi-ETL)**: En el **Viewer** la tabla usada para cada widget se resuelve siempre con el **primer ETL** (`etlData.etlData.name` o `etl_runs_log` del ETL principal). No se usa `widget.source.table` ni `widget.source.etlId` / `dataSourceId` para elegir la tabla de otra fuente. Si un widget fue configurado con “Fuente 2” en el editor, en la vista seguirá leyendo la tabla del ETL principal. **Falta**: en `loadETLDataIntoWidget` (y donde se construye `fullTableName` para aggregate/raw), usar la fuente asociada al widget cuando exista `source.etlId` / `source.table` o el `dataSourceId` guardado en el widget. |

---

## 2. Cálculo de métricas (agregaciones)

La API de agregación (`/api/dashboard/aggregate-data` y la versión pública) construye SQL dinámico y usa la RPC `execute_sql`.

### 2.1 Posibles errores o mejoras en el cálculo

| Tema | Detalle |
|------|--------|
| **Validación de funciones** | La API no valida que `metrics[].func` esté en la lista permitida (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `COUNT(DISTINCT`). Conviene validar y rechazar cualquier otro valor para evitar inyección o comportamientos raros. |
| **Fórmulas derivadas** | Las fórmulas que referencian `metric_0`, `metric_1`, etc. están limitadas por un regex estricto. Revisar con casos reales (decimales, espacios, paréntesis) que todas las fórmulas válidas pasen y que el resultado numérico sea el esperado. |
| **Condiciones en métricas** | Las métricas con `condition` (solo filas que cumplan algo) usan `CASE WHEN ... THEN ... END`. Verificar con datos reales que los totales y subtotales coincidan con lo esperado (por ejemplo, “ventas donde estado = Aprobado”). |
| **Orden y alias en ORDER BY** | El ordenamiento puede ser por dimensión o por alias de métrica. Si el front envía un alias con caracteres raros o que no coinciden exactamente con lo generado, el ORDER BY puede fallar o no aplicarse. Unificar criterio de nombres (por ejemplo siempre alias interno `metric_i` en el ORDER BY del backend). |
| **Comparación temporal** | `comparePeriod` (año anterior / mes anterior) hace un segundo query y mezcla resultados. Si las dimensiones no coinciden (por ejemplo, categorías distintas entre períodos), algunas filas pueden quedar sin valor de comparación. Documentar o ajustar el comportamiento cuando falte período anterior. |
| **Tipos de datos** | Algunos campos vienen como string desde Excel/CSV. El uso de `cast: "numeric"` o `"sanitize"` en la API debe aplicarse de forma consistente en filtros y métricas; revisar casos donde el valor tenga comas, puntos o símbolos de moneda. |

### 2.2 Parámetros avanzados no enviados desde la vista

La API ya soporta:

- `dimensions` (varias dimensiones, GROUP BY múltiple)
- `cumulative` (`running_sum`, `ytd`)
- `comparePeriod` y `dateDimension`

En el **Viewer** (y en el Editor al previsualizar), el body que se envía a `aggregate-data` solo incluye `dimension` (una), `metrics`, `filters`, `orderBy`, `limit`. **No se envían**:

- `dimensions` (array)
- `cumulative`
- `comparePeriod`
- `dateDimension`

El formulario de métricas en admin (`AddMetricConfigForm`) sí tiene `dimension2`, `cumulative`, `comparePeriod`, `dateDimension`. **Falta**: al guardar el widget, persistir estos campos en `aggregationConfig` y, en el Viewer (y en el Editor al cargar datos del widget), enviarlos en el POST a `aggregate-data` para que los cálculos avanzados se reflejen en la vista.

---

## 3. Actualización automática de métricas

| Estado | Detalle |
|--------|--------|
| ✅ | Botón **“Actualizar métricas”** en la vista: llama a `reloadAll()` y recarga todos los widgets (cada uno vuelve a llamar a aggregate o raw). |
| ✅ | Al cambiar **filtros globales** o filtros de widget, hay un efecto con debounce que recarga los widgets afectados. |
| ❌ | **Actualización automática en el tiempo**: No hay un intervalo (por ejemplo cada X minutos) que refresque los datos del dashboard sin que el usuario pulse el botón. Para el MVP se puede implementar: un intervalo configurable (ej. 5 min) que llame a `reloadAll()` cuando la pestaña esté visible (usar `document.visibilityState` o similar para no refrescar en segundo plano si no se desea). |
| ⚠️ | **Datos del ETL**: Los datos mostrados son los que ya están cargados en Supabase (última ejecución del ETL). No hay “actualización automática” del ETL en sí (ej. cron). Eso es un tema de diseño: el usuario puede ejecutar el ETL manualmente y luego refrescar el dashboard; para MVP puede ser suficiente. |

---

## 4. Infraestructura y datos

### 4.1 RPC `execute_sql`

Las rutas de agregación y raw data usan:

```ts
supabase.rpc("execute_sql", { sql_query: query })
```

El tipo en `database.types.ts` declara esta RPC, pero **no hay ninguna migración en el repo** que cree `execute_sql` en Supabase. Si no existe en el proyecto de Supabase, las llamadas a aggregate/raw fallarán.

**Acción**: Crear en Supabase la función `execute_sql` (o equivalente seguro que ejecute solo lecturas y sobre esquemas permitidos, por ejemplo `etl_output` y `public`) y documentarla, o añadir una migración en `supabase/migrations` que la cree.

### 4.2 Seguridad de `execute_sql`

Aunque no es “falta de MVP” en sí, es crítico: la RPC no debe permitir escrituras ni acceso a esquemas sensibles. Revisar permisos y, si hace falta, restringir a un conjunto fijo de esquemas/tablas.

---

## 5. Resumen de tareas prioritarias para el MVP

Ordenadas por impacto en el flujo principal y en “métricas correctas + actualización”:

1. **Viewer multi-fuente** — ✅ Implementado: el Viewer usa `widget.source.table` o `widget.dataSourceId` + `etlData.dataSources` para resolver la tabla por widget; `fetchDistinctOptions` también resuelve por fuente.
2. **Persistir y enviar opciones avanzadas de agregación** — ✅ Implementado: el Viewer y el Editor envían `dimensions`, `cumulative`, `comparePeriod`, `dateDimension` a `aggregate-data`; el tipo `AggregationConfig` en el Viewer incluye estos campos.
3. **Revisar y corregir cálculos** — ✅ Implementado: la API de agregación valida que cada métrica use una función permitida (SUM, AVG, COUNT, MIN, MAX, COUNT(DISTINCT)); el resto (fórmulas, ORDER BY) sigue igual.
4. **RPC `execute_sql`** — ✅ Implementado: migración `20250218000000_add_execute_sql_rpc.sql` crea la función de solo lectura (solo SELECT) con `SECURITY DEFINER` y permisos para `authenticated` y `service_role`.
5. **Actualización automática** — ✅ Implementado: en la vista del dashboard hay refresh cada 5 minutos cuando la pestaña está visible, más un recargo al volver a la pestaña (`visibilitychange`).
6. **Flujo conexión → ETL** — ✅ Implementado: `getConnections(options?)` acepta `clientId` opcional; la página admin de edición de ETL (`/admin/etl/[etl-id]`) pasa el `client_id` del ETL para listar solo conexiones de ese cliente.

---

## 6. Checklist rápido pre-lanzamiento

- [ ] Crear conexión → se guarda y aparece en la lista.
- [ ] En ETL, elegir esa conexión, tabla, columnas, destino y ejecutar → estado “completed” en monitores y datos en `etl_output.*`.
- [ ] Crear dashboard asociado a ese ETL (y opcionalmente otro ETL).
- [ ] En el editor, añadir al menos un widget con agregación (dimensión + una o más métricas) y guardar.
- [ ] Abrir la vista del dashboard: los números/gráficos coinciden con lo esperado (revisar un caso manual con datos conocidos).
- [ ] Cambiar un filtro global o de widget → los widgets se actualizan.
- [ ] Pulsar “Actualizar métricas” → los datos se recargan.
- [ ] Si hay más de una fuente en el dashboard, un widget configurado con “Fuente 2” muestra datos de la tabla del segundo ETL (tras implementar el punto 1).
- [ ] Vista pública por token: mismo dashboard abre y muestra datos sin login.
- [ ] La RPC `execute_sql` existe en Supabase y las rutas aggregate/raw responden sin error.

Cuando estos puntos estén cubiertos y los cálculos validados, el flujo MVP (conexión → ETL → dashboard → editar → visualizar) y la base de métricas y actualización quedarán listos para lanzar.
