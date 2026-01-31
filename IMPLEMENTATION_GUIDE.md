# Guía de Implementación - Sistema de Escalabilidad

## 1. INSTALACIÓN DE DEPENDENCIAS

```bash
# Dependencias ya incluidas en package.json
npm install

# Dependencias adicionales opcionales para monitoreo
npm install bull redis prometheus-client
```

## 2. ESTRUCTURA DE CARPETAS

```
lib/
├── connectors/
│   ├── base-connector.ts          # Interfaz base
│   ├── postgres-connector.ts      # Conector PostgreSQL
│   ├── rest-api-connector.ts      # Conector REST API
│   └── mysql-connector.ts         # (Por implementar)
├── data-access/
│   └── unified-data-access-layer.ts  # UDAL
└── monitoring/
    └── performance-monitor.ts     # Monitoreo
```

## 3. EJEMPLOS DE USO

### 3.1 Conectar a PostgreSQL

```typescript
import { PostgresConnector } from '@/lib/connectors/postgres-connector';
import { ConnectionConfig } from '@/lib/connectors/base-connector';

const config: ConnectionConfig = {
  id: 'pg-connection-1',
  name: 'Production Database',
  type: 'postgres',
  credentials: {
    host: 'db.example.com',
    port: 5432,
    database: 'myapp',
    user: 'postgres',
    password: 'secure_password',
    ssl: true,
  },
};

const connector = new PostgresConnector(config);
await connector.connect();

// Obtener metadatos
const metadata = await connector.getMetadata();
console.log(`Total rows: ${metadata.totalRows}`);
console.log(`Columns: ${metadata.columns.map(c => c.name).join(', ')}`);

// Stream de datos
for await (const batch of connector.streamData({ batchSize: 1000 })) {
  console.log(`Procesadas ${batch.totalProcessed} filas`);
  // Procesar batch.data
}

await connector.disconnect();
```

### 3.2 Conectar a API REST

```typescript
import { RestApiConnector } from '@/lib/connectors/rest-api-connector';

const config: ConnectionConfig = {
  id: 'api-connection-1',
  name: 'External API',
  type: 'rest_api',
  credentials: {
    baseUrl: 'https://api.example.com',
    endpoint: '/v1/users',
    dataPath: 'data.items', // Ruta a los datos en la respuesta
    paginationType: 'offset', // 'offset', 'page', o 'cursor'
    auth: {
      type: 'bearer',
      token: 'your_api_token',
    },
  },
};

const connector = new RestApiConnector(config);
await connector.connect();

// Stream con paginación automática
for await (const batch of connector.streamData({ batchSize: 100 })) {
  console.log(`Batch ${batch.batchNumber}: ${batch.data.length} items`);
}

await connector.disconnect();
```

### 3.3 Usar UDAL (Unified Data Access Layer)

```typescript
import { UnifiedDataAccessLayer, DataTransformer } from '@/lib/data-access/unified-data-access-layer';

const udal = new UnifiedDataAccessLayer();

// Stream de datos con transformación
const data = await udal.getData(postgresConfig, {
  batchSize: 2000,
  transform: (row) => ({
    ...row,
    fullName: `${row.firstName} ${row.lastName}`,
    age: new Date().getFullYear() - new Date(row.birthDate).getFullYear(),
  }),
});

// Transformaciones avanzadas
const filtered = DataTransformer.filter(data, row => row.age > 18);
const grouped = DataTransformer.groupBy(filtered, 'country');
const aggregated = DataTransformer.aggregate(filtered, {
  age: (values) => values.reduce((a, b) => a + b, 0) / values.length,
  salary: (values) => Math.max(...values),
});

// Cerrar conexiones
await udal.closeAll();
```

### 3.4 Monitoreo y Alertas

```typescript
import { PerformanceMonitor, AutoScaler, EventLogger } from '@/lib/monitoring/performance-monitor';

const monitor = new PerformanceMonitor();
const scaler = new AutoScaler();
const logger = new EventLogger();

// Registrar tiempos de query
const startTime = Date.now();
// ... ejecutar query ...
const duration = Date.now() - startTime;
monitor.recordQueryTime(duration);

// Registrar errores
try {
  // ... operación ...
} catch (error) {
  monitor.recordError(error.constructor.name);
  logger.log('error', 'Query failed', { error: error.message });
}

// Obtener métricas
const metrics = monitor.getCurrentMetrics();
console.log(`Latencia p99: ${metrics.queryLatency.p99}ms`);
console.log(`Throughput: ${metrics.throughput.rowsPerSecond} rows/sec`);

// Verificar alertas
const alerts = monitor.checkAlerts(metrics);
if (alerts.length > 0) {
  logger.log('warning', 'Alertas detectadas', { alerts });
}

// Auto-scaling
const queueSize = 50;
if (scaler.shouldScaleUp(metrics, queueSize)) {
  const newWorkerCount = scaler.calculateWorkerCount(metrics, queueSize, 4);
  console.log(`Escalando a ${newWorkerCount} workers`);
}

// Obtener resumen de salud
const health = monitor.getHealthSummary();
console.log(`Estado: ${health.status}`);
console.log(`Alertas críticas: ${health.criticalAlerts}`);
```

## 4. INTEGRACIÓN CON ENDPOINTS EXISTENTES

### 4.1 Actualizar endpoint de conexión

```typescript
// app/api/connection/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { UnifiedDataAccessLayer } from "@/lib/data-access/unified-data-access-layer";
import { ConnectionConfig } from "@/lib/connectors/base-connector";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, connectionName, ...credentials } = body;

    const config: ConnectionConfig = {
      id: crypto.randomUUID(),
      name: connectionName,
      type,
      credentials,
    };

    const udal = new UnifiedDataAccessLayer();
    const testResult = await udal.testConnection(config);

    if (!testResult.success) {
      return NextResponse.json(
        { ok: false, error: testResult.error },
        { status: 400 }
      );
    }

    // Guardar en BD
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("connections")
      .insert({
        id: config.id,
        name: config.name,
        type: config.type,
        credentials: config.credentials,
        user_id: user.id,
      })
      .select()
      .single();

    await udal.closeConnector(config.id);

    return NextResponse.json({
      ok: true,
      data,
      metadata: testResult.metadata,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
```

### 4.2 Endpoint de streaming de datos

```typescript
// app/api/data/stream/route.ts
import { NextRequest, NextResponse } from "next/server";
import { UnifiedDataAccessLayer } from "@/lib/data-access/unified-data-access-layer";
import { PerformanceMonitor } from "@/lib/monitoring/performance-monitor";

export async function POST(req: NextRequest) {
  const monitor = new PerformanceMonitor();
  const udal = new UnifiedDataAccessLayer();

  try {
    const { connectionId, batchSize = 1000 } = await req.json();

    // Obtener configuración de conexión
    const supabase = await createClient();
    const { data: connection } = await supabase
      .from("connections")
      .select("*")
      .eq("id", connectionId)
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "Conexión no encontrada" },
        { status: 404 }
      );
    }

    // Stream de datos
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const batch of udal.streamData(connection, { batchSize })) {
            const startTime = Date.now();

            // Enviar batch
            controller.enqueue(
              encoder.encode(JSON.stringify(batch) + "\n")
            );

            // Registrar métrica
            const duration = Date.now() - startTime;
            monitor.recordQueryTime(duration);
          }

          controller.close();
        } catch (error: any) {
          monitor.recordError(error.constructor.name);
          controller.error(error);
        } finally {
          await udal.closeConnector(connectionId);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## 5. MIGRACIONES DE BASE DE DATOS

### 5.1 Crear tabla de conexiones mejorada

```sql
-- Tabla de conexiones con soporte multi-tipo
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  credentials JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_tested_at TIMESTAMP,
  test_status VARCHAR(20),
  UNIQUE(user_id, name)
);

-- Índices
CREATE INDEX idx_connections_user_id ON connections(user_id);
CREATE INDEX idx_connections_type ON connections(type);
CREATE INDEX idx_connections_created_at ON connections(created_at DESC);
```

### 5.2 Crear tabla de datos particionada

```sql
-- Tabla particionada por fecha
CREATE TABLE data_warehouse.import_data (
  _import_id BIGSERIAL,
  connection_id UUID NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (_import_id, created_at)
) PARTITION BY RANGE (created_at);

-- Crear particiones mensuales automáticamente
CREATE TABLE data_warehouse.import_data_2025_01 
  PARTITION OF data_warehouse.import_data
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Índices
CREATE INDEX idx_import_data_connection_id 
  ON data_warehouse.import_data (connection_id);
CREATE INDEX idx_import_data_created_at_brin 
  ON data_warehouse.import_data USING BRIN (created_at);
```

## 6. VARIABLES DE ENTORNO

```env
# Conectores
DATABASE_URL=postgresql://user:password@localhost:5432/myapp
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Monitoreo
MONITORING_ENABLED=true
ALERT_EMAIL=admin@example.com
METRICS_RETENTION_DAYS=30

# Performance
BATCH_SIZE=1000
QUERY_TIMEOUT=30000
MAX_CONNECTIONS=100

# Auto-scaling
AUTO_SCALE_ENABLED=true
MIN_WORKERS=2
MAX_WORKERS=16
```

## 7. TESTING

```typescript
// __tests__/connectors.test.ts
import { PostgresConnector } from '@/lib/connectors/postgres-connector';
import { RestApiConnector } from '@/lib/connectors/rest-api-connector';

describe('Connectors', () => {
  it('should connect to PostgreSQL', async () => {
    const connector = new PostgresConnector({
      id: 'test-pg',
      name: 'Test',
      type: 'postgres',
      credentials: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'postgres',
        password: 'password',
      },
    });

    await connector.connect();
    const result = await connector.testConnection();
    expect(result.success).toBe(true);
    await connector.disconnect();
  });

  it('should stream data correctly', async () => {
    const connector = new PostgresConnector(config);
    await connector.connect();

    let batchCount = 0;
    for await (const batch of connector.streamData({ batchSize: 100 })) {
      batchCount++;
      expect(batch.data.length).toBeGreaterThan(0);
    }

    expect(batchCount).toBeGreaterThan(0);
    await connector.disconnect();
  });
});
```

## 8. CHECKLIST DE IMPLEMENTACIÓN

- [ ] Instalar dependencias
- [ ] Crear estructura de carpetas
- [ ] Implementar conectores base
- [ ] Implementar conectores específicos
- [ ] Crear UDAL
- [ ] Implementar monitoreo
- [ ] Crear migraciones de BD
- [ ] Actualizar endpoints
- [ ] Agregar tests
- [ ] Documentar APIs
- [ ] Configurar alertas
- [ ] Realizar tests de carga
- [ ] Desplegar en staging
- [ ] Monitorear en producción

## 9. PRÓXIMOS PASOS

1. **Conectores adicionales**: MongoDB, Snowflake, BigQuery
2. **Queue de jobs**: Implementar Bull/RabbitMQ
3. **Caché distribuido**: Redis
4. **Compresión**: ZSTD para datos
5. **Replicación**: Sincronización multi-región
6. **Seguridad**: Encriptación de credenciales