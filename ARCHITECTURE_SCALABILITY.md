# Arquitectura de Escalabilidad - Biconic Platform

## 1. ANÁLISIS DEL ESTADO ACTUAL

### Limitaciones Identificadas

#### 1.1 Capacidad de Datos
- **Límite actual**: ~800K-900K filas (16M registros máximo)
- **Limitación**: Carga completa en memoria durante procesamiento
- **Problema**: ExcelJS carga todo el archivo en RAM
- **Impacto**: Timeout en archivos > 60MB, fallos en procesamiento

#### 1.2 Tipos de Conexión
- **Soportado**: Solo Excel (.xlsx, .xls)
- **No soportado**: 
  - Bases de datos estructuradas (MySQL, PostgreSQL, MongoDB)
  - APIs REST/GraphQL
  - Data warehouses (Snowflake, BigQuery)
  - Fuentes no estructuradas (JSON, Parquet)

#### 1.3 Procesamiento
- **Modelo**: Síncrono con fire-and-forget
- **Problema**: Sin control de concurrencia
- **Limitación**: Procesamiento secuencial de transformaciones
- **Escalabilidad**: No hay paralelización

#### 1.4 Almacenamiento
- **Ubicación**: PostgreSQL en Supabase
- **Estructura**: Tablas dinámicas por conexión
- **Problema**: Sin particionamiento
- **Índices**: Mínimos, sin optimización

---

## 2. PROPUESTA DE NUEVA ARQUITECTURA

### 2.1 Arquitectura Multi-Fuente

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                      │
│              (UI/API Endpoints Existentes)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              CAPA DE ORQUESTACIÓN                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Connection Manager | ETL Orchestrator | Job Queue   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│         CAPA DE ABSTRACCIÓN DE DATOS (UDAL)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Unified Data Access Layer                           │   │
│  │  - Streaming Interface                               │   │
│  │  - Query Optimizer                                   │   │
│  │  - Cache Manager                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┐
        │            │            │              │
┌───────▼──┐  ┌──────▼──┐  ┌─────▼──┐  ┌──────▼──┐
│ Conectores│  │ Caché   │  │ Índices│  │ Monitoreo
│ Modulares │  │Distribuido│ │Estratég│  │ & Logs
└───────────┘  └─────────┘  └────────┘  └─────────┘
        │            │            │              │
┌───────▼──────────────────────────────────────▼──┐
│         CAPA DE ALMACENAMIENTO                   │
│  ┌────────────────────────────────────────────┐ │
│  │ PostgreSQL (Particionado)                  │ │
│  │ - Tablas particionadas por rango/hash      │ │
│  │ - Índices B-tree y BRIN                    │ │
│  │ - Compresión de datos                      │ │
│  └────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ Redis (Caché)                              │ │
│  │ - Datos frecuentes                         │ │
│  │ - Metadatos de conexiones                  │ │
│  └────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ S3/Supabase Storage (Archivos)             │ │
│  │ - Datos crudos comprimidos                 │ │
│  │ - Backups incrementales                    │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 2.2 Conectores Soportados

| Tipo | Protocolo | Capacidad | Latencia | Prioridad |
|------|-----------|-----------|----------|-----------|
| Excel | File Upload | 500M+ | Batch | P1 |
| PostgreSQL | TCP/IP | Ilimitado | Real-time | P1 |
| MySQL | TCP/IP | Ilimitado | Real-time | P1 |
| MongoDB | TCP/IP | Ilimitado | Real-time | P2 |
| REST API | HTTP/HTTPS | Ilimitado | Real-time | P2 |
| Snowflake | HTTPS | Ilimitado | Real-time | P3 |
| BigQuery | HTTPS | Ilimitado | Real-time | P3 |

---

## 3. ESTRATEGIA DE ALMACENAMIENTO DISTRIBUIDO

### 3.1 Particionamiento de Datos

```sql
-- Particionamiento por rango (fecha)
CREATE TABLE data_warehouse.import_data (
    _import_id BIGSERIAL,
    connection_id UUID,
    data JSONB,
    created_at TIMESTAMP,
    PRIMARY KEY (_import_id, created_at)
) PARTITION BY RANGE (created_at);

-- Particiones mensuales
CREATE TABLE data_warehouse.import_data_2025_01 
    PARTITION OF data_warehouse.import_data
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Particionamiento por hash (para distribución)
CREATE TABLE data_warehouse.import_data_hash (
    _import_id BIGSERIAL,
    connection_id UUID,
    data JSONB,
    PRIMARY KEY (_import_id, connection_id)
) PARTITION BY HASH (connection_id);
```

### 3.2 Estrategia de Caché

```
Nivel 1: Redis (Hot Data)
├─ Últimas 1000 filas por conexión
├─ Metadatos de conexiones
└─ Resultados de queries frecuentes

Nivel 2: PostgreSQL (Warm Data)
├─ Índices BRIN para series temporales
├─ Índices B-tree para búsquedas
└─ Vistas materializadas

Nivel 3: S3/Storage (Cold Data)
├─ Datos históricos comprimidos
├─ Backups incrementales
└─ Archivos de auditoría
```

### 3.3 Compresión de Datos

```
Estrategia por tipo:
- Texto: ZSTD (mejor ratio)
- Números: Gorilla (series temporales)
- JSON: BSON comprimido
- Archivos: GZIP (compatibilidad)

Estimación de ahorro:
- Datos típicos: 60-70% reducción
- Series temporales: 80-90% reducción
- Archivos Excel: 40-50% reducción
```

---

## 4. OPTIMIZACIONES DE RENDIMIENTO

### 4.1 Streaming de Datos

**Problema actual**: Carga completa en memoria
**Solución**: Procesamiento por chunks

```
Flujo de Streaming:
1. Lectura: 1000 filas por iteración
2. Transformación: Aplicar reglas ETL
3. Validación: Verificar integridad
4. Inserción: Batch insert (2000 filas)
5. Caché: Actualizar Redis
6. Monitoreo: Registrar progreso
```

### 4.2 Procesamiento Paralelo

```
Estrategia:
- Worker Pool: 4-8 workers por CPU
- Queue: Bull/RabbitMQ para jobs
- Timeout: 30min para jobs largos
- Retry: 3 intentos con backoff exponencial

Ejemplo de distribución:
- Job 1: Lectura de datos (1 worker)
- Job 2-5: Transformaciones paralelas (4 workers)
- Job 6: Inserción en BD (1 worker)
- Job 7: Actualización de índices (1 worker)
```

### 4.3 Índices Estratégicos

```sql
-- Índice BRIN para series temporales (bajo overhead)
CREATE INDEX idx_import_data_created_at_brin 
ON data_warehouse.import_data USING BRIN (created_at);

-- Índice B-tree para búsquedas frecuentes
CREATE INDEX idx_import_data_connection_id 
ON data_warehouse.import_data (connection_id);

-- Índice compuesto para queries comunes
CREATE INDEX idx_import_data_conn_date 
ON data_warehouse.import_data (connection_id, created_at DESC);

-- Índice GiST para búsquedas de rango
CREATE INDEX idx_import_data_range 
ON data_warehouse.import_data USING GIST (created_at);
```

---

## 5. SISTEMA DE MONITOREO Y ESCALADO

### 5.1 Métricas Clave

```
Rendimiento:
- Latencia de query (p50, p95, p99)
- Throughput (filas/segundo)
- Tasa de error
- Tiempo de procesamiento ETL

Capacidad:
- Uso de CPU (%)
- Uso de memoria (%)
- Uso de disco (%)
- Conexiones activas

Negocio:
- Conexiones activas
- Datos procesados (GB)
- Transformaciones ejecutadas
- Errores por tipo
```

### 5.2 Alertas Automáticas

```
Críticas (Inmediato):
- CPU > 90% por 5 min
- Memoria > 85% por 5 min
- Disco > 90%
- Latencia p99 > 5s

Advertencias (30 min):
- CPU > 75% por 30 min
- Memoria > 70% por 30 min
- Tasa de error > 1%
- Job timeout > 3 veces/hora
```

### 5.3 Auto-escalado

```
Horizontal:
- Agregar workers si queue > 100 jobs
- Remover workers si queue < 10 jobs
- Máximo 16 workers por instancia

Vertical:
- Aumentar RAM si memoria > 80%
- Aumentar CPU si CPU > 85%
- Máximo 32 CPU cores

Almacenamiento:
- Archivos > 30 días → Comprimir
- Archivos > 90 días → Mover a S3
- Mantener 7 días en hot storage
```

---

## 6. PLAN DE MIGRACIÓN

### Fase 1: Preparación (Semana 1-2)
- [ ] Crear nuevas tablas particionadas
- [ ] Configurar Redis
- [ ] Implementar conectores base
- [ ] Tests unitarios

### Fase 2: Implementación (Semana 3-4)
- [ ] Migrar datos existentes
- [ ] Implementar UDAL
- [ ] Crear conectores específicos
- [ ] Tests de integración

### Fase 3: Optimización (Semana 5-6)
- [ ] Crear índices
- [ ] Configurar caché
- [ ] Implementar monitoreo
- [ ] Tests de carga

### Fase 4: Producción (Semana 7-8)
- [ ] Rollout gradual (10% → 50% → 100%)
- [ ] Monitoreo 24/7
- [ ] Rollback plan
- [ ] Documentación

---

## 7. ESTIMACIONES DE CAPACIDAD

### Antes (Estado Actual)
```
Máximo: 16M registros
Tiempo procesamiento: 30-60 min
Tamaño máximo archivo: 60MB
Conexiones simultáneas: 5
Throughput: ~5K filas/seg
```

### Después (Propuesta)
```
Máximo: 1B+ registros
Tiempo procesamiento: 5-10 min (100M registros)
Tamaño máximo archivo: 5GB+
Conexiones simultáneas: 100+
Throughput: ~100K filas/seg
```

### Mejora
```
Capacidad: 62.5x
Velocidad: 10x
Concurrencia: 20x
```

---

## 8. COSTOS ESTIMADOS

### Infraestructura Adicional
- Redis (Managed): $50-200/mes
- PostgreSQL (Upgrade): +$100-300/mes
- S3 Storage: $0.023/GB/mes
- Monitoring: $50-100/mes

### Ahorros
- Menos timeouts → Menos reintentos
- Mejor caché → Menos queries
- Compresión → Menos almacenamiento

**ROI**: 2-3 meses

---

## 9. REFERENCIAS Y RECURSOS

### Documentación
- PostgreSQL Partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html
- Redis Caching: https://redis.io/docs/
- Bull Queue: https://docs.bullmq.io/

### Herramientas
- pgAdmin: Monitoreo PostgreSQL
- Redis Commander: Monitoreo Redis
- Prometheus + Grafana: Métricas