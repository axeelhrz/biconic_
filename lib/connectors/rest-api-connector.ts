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
 * Conector para APIs REST
 * Soporta paginación, autenticación y transformación de datos
 */
export class RestApiConnector extends BaseConnector {
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly REQUEST_TIMEOUT = 30000; // 30 segundos
  private readonly MAX_RETRIES = 3;

  async connect(): Promise<void> {
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const baseUrl = credentials.baseUrl as string;
      const auth = credentials.auth as Record<string, unknown> | undefined;

      if (!baseUrl) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'URL base requerida para API REST'
        );
      }

      if (!ConnectorValidators.validateUrl(baseUrl)) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'URL inválida'
        );
      }

      // Validar autenticación si existe
      if (auth) {
        this.validateAuthConfig(auth);
      }

      this.isConnected = true;
      this.updateMetadata({ testStatus: 'pending' });
    } catch (error: unknown) {
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const credentials = this.config.credentials as Record<string, unknown>;
      const baseUrl = credentials.baseUrl as string;
      const endpoint = (credentials.endpoint as string) || '/';
      const url = `${baseUrl}${endpoint}`;

      const response = await this.makeRequest(url, {
        method: 'GET',
        timeout: this.REQUEST_TIMEOUT,
      });

      if (!response.ok) {
        throw new ConnectorError(
          ConnectorErrorCode.CONNECTION_FAILED,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const metadata = await this.getMetadata();

      this.updateMetadata({ testStatus: 'success' });

      return {
        success: true,
        message: 'Conexión exitosa a API REST',
        metadata,
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      this.updateMetadata({ testStatus: 'failed' });
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
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const baseUrl = credentials.baseUrl as string;
      const endpoint = (credentials.endpoint as string) || '/';
      const dataPath = (credentials.dataPath as string) || 'data';
      const url = `${baseUrl}${endpoint}`;

      // Obtener primera página para inferir estructura
      const response = await this.makeRequest(url, {
        method: 'GET',
        params: { limit: 10, offset: 0 },
      });

      const data = await response.json() as Record<string, unknown>;
      const items = this.extractData(data, dataPath);

      if (!Array.isArray(items) || items.length === 0) {
        throw new ConnectorError(
          ConnectorErrorCode.QUERY_FAILED,
          'No se encontraron datos en la respuesta'
        );
      }

      // Inferir columnas del primer item
      const firstItem = items[0] as Record<string, unknown>;
      const columns = this.inferColumns(firstItem);

      // Obtener total de registros si está disponible
      const totalRows = (data.total as number) || (data.count as number) || items.length;

      return {
        totalRows,
        totalColumns: columns.length,
        columns,
        estimatedSize: totalRows * 1024,
        lastUpdated: new Date(),
        sampleData: items.slice(0, 5) as Record<string, unknown>[],
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
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const baseUrl = credentials.baseUrl as string;
      const endpoint = (credentials.endpoint as string) || '/';
      const dataPath = (credentials.dataPath as string) || 'data';
      const paginationType = (credentials.paginationType as string) || 'offset';
      const batchSize = options?.batchSize || this.DEFAULT_BATCH_SIZE;
      const url = `${baseUrl}${endpoint}`;

      let offset = options?.startRow || 0;
      let page = 1;
      let batchNumber = 0;
      let totalProcessed = 0;
      let hasMore = true;

      while (hasMore && (!options?.endRow || totalProcessed < options.endRow)) {
        const params: Record<string, unknown> = { limit: batchSize };

        if (paginationType === 'offset') {
          params.offset = offset;
        } else if (paginationType === 'page') {
          params.page = page;
        } else if (paginationType === 'cursor') {
          params.cursor = offset;
        }

        const response = await this.makeRequest(url, {
          method: 'GET',
          params,
        });

        const responseData = await response.json() as Record<string, unknown>;
        const items = this.extractData(responseData, dataPath);

        if (!Array.isArray(items) || items.length === 0) {
          break;
        }

        totalProcessed += items.length;
        batchNumber++;

        yield {
          data: items as Record<string, unknown>[],
          hasMore: items.length === batchSize,
          totalProcessed,
          batchNumber,
        };

        if (items.length < batchSize) {
          hasMore = false;
        }

        offset += batchSize;
        page++;

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
    try {
      const credentials = this.config.credentials as Record<string, unknown>;
      const baseUrl = credentials.baseUrl as string;
      const url = `${baseUrl}${query}`;

      if (!ConnectorValidators.validateUrl(url)) {
        throw new ConnectorError(
          ConnectorErrorCode.INVALID_CONFIG,
          'URL inválida'
        );
      }

      const response = await this.makeRequest(url, {
        method: 'GET',
      });

      const data = await response.json() as unknown;
      return Array.isArray(data) ? data : [data as Record<string, unknown>];
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
      const baseUrl = credentials.baseUrl as string;
      const auth = credentials.auth as Record<string, unknown> | undefined;

      if (!baseUrl || !ConnectorValidators.validateUrl(baseUrl)) {
        return false;
      }

      if (auth) {
        return this.validateAuthConfig(auth);
      }

      return true;
    } catch {
      return false;
    }
  }

  private async makeRequest(
    url: string,
    options: {
      method?: string;
      params?: Record<string, unknown>;
      body?: unknown;
      timeout?: number;
    } = {}
  ): Promise<Response> {
    const { method = 'GET', params, body, timeout = this.REQUEST_TIMEOUT } = options;

    // Construir URL con parámetros
    let finalUrl = url;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, String(value));
      });
      finalUrl = `${url}?${searchParams.toString()}`;
    }

    // Construir headers
    const headers = this.buildHeaders();

    // Crear controller para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(finalUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ConnectorError(
          ConnectorErrorCode.CONNECTION_FAILED,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ConnectorError(
          ConnectorErrorCode.TIMEOUT,
          'Timeout en la solicitud'
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildHeaders(): Record<string, string> {
    const credentials = this.config.credentials as Record<string, unknown>;
    const headers = (credentials.headers as Record<string, string>) || {};
    const auth = credentials.auth as Record<string, unknown> | undefined;
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (auth) {
      const authType = auth.type as string;
      if (authType === 'bearer') {
        finalHeaders['Authorization'] = `Bearer ${auth.token as string}`;
      } else if (authType === 'basic') {
        const credentials_str = Buffer.from(`${auth.username as string}:${auth.password as string}`).toString('base64');
        finalHeaders['Authorization'] = `Basic ${credentials_str}`;
      } else if (authType === 'api_key') {
        finalHeaders[auth.headerName as string || 'X-API-Key'] = auth.apiKey as string;
      }
    }

    return finalHeaders;
  }

  private validateAuthConfig(auth: Record<string, unknown>): boolean {
    const authType = auth.type as string;
    if (!authType) return false;

    switch (authType) {
      case 'bearer':
        return !!auth.token;
      case 'basic':
        return !!auth.username && !!auth.password;
      case 'api_key':
        return !!auth.apiKey;
      default:
        return false;
    }
  }

  private extractData(response: Record<string, unknown>, dataPath: string): unknown[] {
    const parts = dataPath.split('.');
    let current: unknown = response;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return [];
      }
    }

    return Array.isArray(current) ? current : [];
  }

  private inferColumns(item: Record<string, unknown>): ColumnMetadata[] {
    return Object.entries(item).map(([key, value]) => ({
      name: key,
      type: this.inferType(value),
      nullable: value === null || value === undefined,
    }));
  }

  private inferType(value: unknown): ColumnMetadata['type'] {
    if (value === null || value === undefined) return 'unknown';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') {
      // Intentar detectar fecha
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'datetime';
      return 'string';
    }
    if (typeof value === 'object') return 'json';
    return 'unknown';
  }
}