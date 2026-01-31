import postgres from 'postgres';
import {
  BaseConnector,
  ConnectionConfig,
  DataSourceMetadata,
  ColumnMetadata,
  StreamOptions,
  StreamResult,
  ConnectionTestResult,
  ConnectorError,
  ConnectorErrorCode,
  ConnectorValidators,
} from './base-connector';

/**
 * Conector para PostgreSQL
 * Soporta streaming de datos, queries personalizadas y metadatos
 */
export class PostgresConnector extends BaseConnector {
  private sql: postgres.Sql | null = null;
  private readonly BATCH_SIZE = 1000;
  private readonly QUERY_TIMEOUT = 30000; // 30 segundos

  async connect(): Promise<void> {
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const host = credentials.host as string;
      const port = credentials.port as number | undefined;
      const database = credentials.database as string;
      const user = credentials.user as string;
      const password = credentials.password as string;
      const ssl = credentials.ssl as boolean | undefined;

      // Validar configuración
      if (!host || !database || !user || !password) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'Credenciales incompletas para PostgreSQL'
        );
      }

      if (!ConnectorValidators.validateHost(host)) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'Host inválido'
        );
      }

      if (port && !ConnectorValidators.validatePort(port)) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'Puerto inválido'
        );
      }

      // Crear conexión
      this.sql = postgres({
        host,
        port: port || 5432,
        database,
        username: user,
        password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connect_timeout: 10,
        idle_timeout: 30,
        max: 10,
      });

      // Probar conexión
      await this.sql`SELECT 1`;
      this.isConnected = true;
      this.updateMetadata({ testStatus: 'success' });
    } catch (error: unknown) {
      this.isConnected = false;
      this.updateMetadata({ testStatus: 'failed' });
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(
        ConnectorErrorCode.CONNECTION_FAILED,
        `Error conectando a PostgreSQL: ${errorMessage}`,
        { originalError: error }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
      this.isConnected = false;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // Obtener metadatos básicos
      const metadata = await this.getMetadata();

      return {
        success: true,
        message: 'Conexión exitosa a PostgreSQL',
        metadata,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: 'Error en la conexión',
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    if (!this.sql) {
      throw new ConnectorError(
        ConnectorErrorCode.CONNECTION_FAILED,
        'No hay conexión activa'
      );
    }

    try {
      // Obtener información de tablas
      const tables = await this.sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        LIMIT 1
      `;

      if (tables.length === 0) {
        throw new ConnectorError(
          ConnectorErrorCode.QUERY_FAILED,
          'No hay tablas en la base de datos'
        );
      }

      const tableName = (tables[0] as Record<string, unknown>).table_name as string;

      // Obtener columnas
      const columns = await this.sql`
        SELECT 
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position
      `;

      // Obtener cantidad de filas
      const countResult = await this.sql`
        SELECT COUNT(*) as count FROM ${this.sql(tableName)}
      `;

      const totalRows = (countResult[0] as Record<string, unknown>).count as number;

      // Obtener muestra de datos
      const sampleData = await this.sql`
        SELECT * FROM ${this.sql(tableName)} LIMIT 5
      `;

      const columnMetadata: ColumnMetadata[] = columns.map((col: Record<string, unknown>) => ({
        name: col.column_name as string,
        type: this.mapPostgresType(col.data_type as string),
        nullable: col.is_nullable === 'YES',
      }));

      return {
        totalRows,
        totalColumns: columns.length,
        columns: columnMetadata,
        estimatedSize: totalRows * 1024, // Estimación aproximada
        lastUpdated: new Date(),
        sampleData: sampleData as Record<string, unknown>[],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(
        ConnectorErrorCode.QUERY_FAILED,
        `Error obteniendo metadatos: ${errorMessage}`
      );
    }
  }

  async *streamData(options?: StreamOptions): AsyncGenerator<StreamResult> {
    if (!this.sql) {
      throw new ConnectorError(
        ConnectorErrorCode.CONNECTION_FAILED,
        'No hay conexión activa'
      );
    }

    try {
      const batchSize = options?.batchSize || this.BATCH_SIZE;
      const startRow = options?.startRow || 0;

      // Obtener nombre de la tabla (primera tabla disponible)
      const tables = await this.sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        LIMIT 1
      `;

      if (tables.length === 0) {
        throw new ConnectorError(
          ConnectorErrorCode.QUERY_FAILED,
          'No hay tablas disponibles'
        );
      }

      const tableName = (tables[0] as Record<string, unknown>).table_name as string;
      let offset = startRow;
      let batchNumber = 0;
      let totalProcessed = 0;

      while (true) {
        const data = await this.sql`
          SELECT * FROM ${this.sql(tableName)}
          OFFSET ${offset}
          LIMIT ${batchSize}
        `;

        if (data.length === 0) {
          break;
        }

        totalProcessed += data.length;
        batchNumber++;

        yield {
          data: data as Record<string, unknown>[],
          hasMore: data.length === batchSize,
          totalProcessed,
          batchNumber,
        };

        offset += batchSize;

        if (options?.endRow && totalProcessed >= options.endRow) {
          break;
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(
        ConnectorErrorCode.QUERY_FAILED,
        `Error en streaming: ${errorMessage}`
      );
    }
  }

  async executeQuery(query: string): Promise<Record<string, unknown>[]> {
    if (!this.sql) {
      throw new ConnectorError(
        ConnectorErrorCode.CONNECTION_FAILED,
        'No hay conexión activa'
      );
    }

    try {
      // Sanitizar query (básico)
      if (query.toLowerCase().includes('drop') || 
          query.toLowerCase().includes('delete') ||
          query.toLowerCase().includes('truncate')) {
        throw new ConnectorError(
          ConnectorErrorCode.QUERY_FAILED,
          'Operaciones destructivas no permitidas'
        );
      }

      const result = await this.sql.unsafe(query);
      return result as Record<string, unknown>[];
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConnectorError(
        ConnectorErrorCode.QUERY_FAILED,
        `Error ejecutando query: ${errorMessage}`
      );
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const host = credentials.host as string;
      const port = credentials.port as number | undefined;
      const database = credentials.database as string;
      const user = credentials.user as string;
      const password = credentials.password as string;

      if (!host || !database || !user || !password) {
        return false;
      }

      if (!ConnectorValidators.validateHost(host)) {
        return false;
      }

      if (port && !ConnectorValidators.validatePort(port)) {
        return false;
      }

      if (!ConnectorValidators.validateDatabaseName(database)) {
        return false;
      }

      if (!ConnectorValidators.validateUsername(user)) {
        return false;
      }

      if (!ConnectorValidators.validatePassword(password)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private mapPostgresType(pgType: string): ColumnMetadata['type'] {
    const typeMap: Record<string, ColumnMetadata['type']> = {
      'character varying': 'string',
      'text': 'string',
      'integer': 'number',
      'bigint': 'number',
      'numeric': 'number',
      'double precision': 'number',
      'boolean': 'boolean',
      'date': 'date',
      'timestamp': 'datetime',
      'timestamp without time zone': 'datetime',
      'timestamp with time zone': 'datetime',
      'json': 'json',
      'jsonb': 'json',
    };

    return typeMap[pgType.toLowerCase()] || 'unknown';
  }
}