/**
 * Base Connector Interface
 * Define la interfaz estándar para todos los conectores de datos
 */

export interface ConnectionConfig {
  id: string;
  name: string;
  type: 'excel' | 'mysql' | 'postgres' | 'mongodb' | 'rest_api' | 'snowflake' | 'bigquery';
  credentials: Record<string, string | number | boolean | Record<string, unknown>>;
  metadata?: {
    description?: string;
    tags?: string[];
    lastTested?: Date;
    testStatus?: 'success' | 'failed' | 'pending';
  };
}

export interface DataSourceMetadata {
  totalRows: number;
  totalColumns: number;
  columns: ColumnMetadata[];
  estimatedSize: number; // en bytes
  lastUpdated: Date;
  sampleData?: Record<string, unknown>[];
}

export interface ColumnMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'unknown';
  nullable: boolean;
  unique?: boolean;
  indexed?: boolean;
  sampleValues?: unknown[];
}

export interface StreamOptions {
  batchSize?: number; // default: 1000
  startRow?: number; // default: 0
  endRow?: number; // default: all
  columns?: string[]; // default: all
  filters?: FilterCondition[];
}

export interface FilterCondition {
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'like' | 'between';
  value: unknown;
}

export interface StreamResult {
  data: Record<string, unknown>[];
  hasMore: boolean;
  totalProcessed: number;
  batchNumber: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  metadata?: DataSourceMetadata;
  error?: string;
  duration: number; // en ms
}

/**
 * Clase base abstracta para todos los conectores
 */
export abstract class BaseConnector {
  protected config: ConnectionConfig;
  protected isConnected: boolean = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  /**
   * Conectar a la fuente de datos
   */
  abstract connect(): Promise<void>;

  /**
   * Desconectar de la fuente de datos
   */
  abstract disconnect(): Promise<void>;

  /**
   * Probar la conexión y obtener metadatos
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Obtener metadatos de la fuente de datos
   */
  abstract getMetadata(): Promise<DataSourceMetadata>;

  /**
   * Stream de datos con soporte para grandes volúmenes
   */
  abstract streamData(options?: StreamOptions): AsyncGenerator<StreamResult>;

  /**
   * Ejecutar una query personalizada (si aplica)
   */
  abstract executeQuery?(query: string): Promise<Record<string, unknown>[]>;

  /**
   * Validar la configuración del conector
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Obtener el estado de la conexión
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Obtener configuración (sin credenciales sensibles)
   */
  getConfig(): Omit<ConnectionConfig, 'credentials'> {
    const { credentials: _credentials, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Actualizar metadatos de la conexión
   */
  updateMetadata(metadata: Partial<ConnectionConfig['metadata']>): void {
    this.config.metadata = {
      ...this.config.metadata,
      ...metadata,
    };
  }
}

/**
 * Factory para crear conectores
 */
export class ConnectorFactory {
  private static connectors: Map<string, new (config: ConnectionConfig) => BaseConnector> = new Map();

  static register(type: string, connectorClass: new (config: ConnectionConfig) => BaseConnector): void {
    this.connectors.set(type, connectorClass);
  }

  static create(config: ConnectionConfig): BaseConnector {
    const ConnectorClass = this.connectors.get(config.type);
    if (!ConnectorClass) {
      throw new Error(`Conector no soportado: ${config.type}`);
    }
    return new ConnectorClass(config);
  }

  static getAvailableConnectors(): string[] {
    return Array.from(this.connectors.keys());
  }
}

/**
 * Validadores comunes para conectores
 */
export class ConnectorValidators {
  static validateHost(host: string): boolean {
    const hostRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return hostRegex.test(host) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  }

  static validatePort(port: number): boolean {
    return port > 0 && port <= 65535;
  }

  static validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static validateDatabaseName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 64;
  }

  static validateUsername(username: string): boolean {
    return username.length > 0 && username.length <= 255;
  }

  static validatePassword(password: string): boolean {
    return password.length > 0 && password.length <= 1024;
  }
}

/**
 * Utilidades para manejo de errores en conectores
 */
export class ConnectorError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export enum ConnectorErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  TIMEOUT = 'TIMEOUT',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
}