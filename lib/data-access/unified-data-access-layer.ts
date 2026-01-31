import { BaseConnector, ConnectionConfig, StreamOptions, StreamResult } from '@/lib/connectors/base-connector';
import { ConnectorFactory } from '@/lib/connectors/base-connector';
import { PostgresConnector } from '@/lib/connectors/postgres-connector';
import { RestApiConnector } from '@/lib/connectors/rest-api-connector';

/**
 * Unified Data Access Layer (UDAL)
 * Proporciona una interfaz unificada para acceder a datos de múltiples fuentes
 */
export class UnifiedDataAccessLayer {
  private connectors: Map<string, BaseConnector> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor() {
    this.initializeConnectors();
  }

  /**
   * Registrar conectores disponibles
   */
  private initializeConnectors(): void {
    ConnectorFactory.register('postgres', PostgresConnector);
    ConnectorFactory.register('rest_api', RestApiConnector);
    // Agregar más conectores según sea necesario
  }

  /**
   * Obtener o crear un conector
   */
  async getConnector(config: ConnectionConfig): Promise<BaseConnector> {
    const cacheKey = config.id;

    if (this.connectors.has(cacheKey)) {
      return this.connectors.get(cacheKey)!;
    }

    const connector = ConnectorFactory.create(config);
    await connector.connect();
    this.connectors.set(cacheKey, connector);

    return connector;
  }

  /**
   * Stream de datos con caché y optimizaciones
   */
  async *streamData(
    config: ConnectionConfig,
    options?: StreamOptions
  ): AsyncGenerator<StreamResult> {
    const connector = await this.getConnector(config);
    const cacheKey = this.buildCacheKey(config.id, options);

    // Verificar caché
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      yield cached.data;
      return;
    }

    let allData: Record<string, unknown>[] = [];

    // Stream de datos
    for await (const batch of connector.streamData(options)) {
      allData = allData.concat(batch.data);
      yield batch;
    }

    // Guardar en caché
    this.setCache(cacheKey, {
      data: {
        data: allData,
        hasMore: false,
        totalProcessed: allData.length,
        batchNumber: 1,
      },
    });
  }

  /**
   * Obtener datos con transformaciones
   */
  async getData(
    config: ConnectionConfig,
    options?: StreamOptions & { transform?: (row: Record<string, unknown>) => Record<string, unknown> }
  ): Promise<Record<string, unknown>[]> {
    const connector = await this.getConnector(config);
    const results: Record<string, unknown>[] = [];

    for await (const batch of connector.streamData(options)) {
      const transformed = batch.data.map(row =>
        options?.transform ? options.transform(row) : row
      );
      results.push(...transformed);
    }

    return results;
  }

  /**
   * Ejecutar query personalizada
   */
  async executeQuery(
    config: ConnectionConfig,
    query: string
  ): Promise<Record<string, unknown>[]> {
    const connector = await this.getConnector(config);

    if (!connector.executeQuery) {
      throw new Error('Este conector no soporta queries personalizadas');
    }

    return connector.executeQuery(query);
  }

  /**
   * Obtener metadatos de la fuente
   */
  async getMetadata(config: ConnectionConfig) {
    const connector = await this.getConnector(config);
    return connector.getMetadata();
  }

  /**
   * Probar conexión
   */
  async testConnection(config: ConnectionConfig) {
    const connector = await this.getConnector(config);
    return connector.testConnection();
  }

  /**
   * Cerrar conector
   */
  async closeConnector(connectionId: string): Promise<void> {
    const connector = this.connectors.get(connectionId);
    if (connector) {
      await connector.disconnect();
      this.connectors.delete(connectionId);
    }
  }

  /**
   * Cerrar todos los conectores
   */
  async closeAll(): Promise<void> {
    for (const [, connector] of this.connectors) {
      await connector.disconnect();
    }
    this.connectors.clear();
    this.cache.clear();
  }

  /**
   * Limpiar caché expirado
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - (entry.timestamp ?? 0) > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Obtener estadísticas de caché
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      connectors: this.connectors.size,
      ttl: this.CACHE_TTL,
    };
  }

  // ============ Métodos privados ============

  private buildCacheKey(connectionId: string, options?: StreamOptions): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${connectionId}:${optionsStr}`;
  }

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - (entry.timestamp ?? 0) > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private setCache(key: string, entry: CacheEntry): void {
    this.cache.set(key, {
      ...entry,
      timestamp: Date.now(),
    });
  }
}

interface CacheEntry {
  data: StreamResult;
  timestamp?: number;
}

/**
 * Query Builder para construir queries de forma segura
 */
export class QueryBuilder {
  private query: string = '';
  private params: unknown[] = [];

  select(...columns: string[]): this {
    this.query = `SELECT ${columns.join(', ')}`;
    return this;
  }

  from(table: string): this {
    this.query += ` FROM ${table}`;
    return this;
  }

  where(condition: string, ...values: unknown[]): this {
    this.query += ` WHERE ${condition}`;
    this.params.push(...values);
    return this;
  }

  and(condition: string, ...values: unknown[]): this {
    this.query += ` AND ${condition}`;
    this.params.push(...values);
    return this;
  }

  or(condition: string, ...values: unknown[]): this {
    this.query += ` OR ${condition}`;
    this.params.push(...values);
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.query += ` ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(count: number): this {
    this.query += ` LIMIT ${count}`;
    return this;
  }

  offset(count: number): this {
    this.query += ` OFFSET ${count}`;
    return this;
  }

  build(): { query: string; params: unknown[] } {
    return {
      query: this.query,
      params: this.params,
    };
  }

  toString(): string {
    return this.query;
  }
}

/**
 * Data Transformer para transformaciones comunes
 */
export class DataTransformer {
  /**
   * Filtrar datos por condición
   */
  static filter(
    data: Record<string, unknown>[],
    predicate: (row: Record<string, unknown>) => boolean
  ): Record<string, unknown>[] {
    return data.filter(predicate);
  }

  /**
   * Mapear datos
   */
  static map(
    data: Record<string, unknown>[],
    mapper: (row: Record<string, unknown>) => Record<string, unknown>
  ): Record<string, unknown>[] {
    return data.map(mapper);
  }

  /**
   * Agrupar datos
   */
  static groupBy(
    data: Record<string, unknown>[],
    key: string
  ): Map<unknown, Record<string, unknown>[]> {
    const grouped = new Map<unknown, Record<string, unknown>[]>();

    for (const row of data) {
      const groupKey = row[key];
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(row);
    }

    return grouped;
  }

  /**
   * Agregar datos
   */
  static aggregate(
    data: Record<string, unknown>[],
    aggregations: Record<string, (values: unknown[]) => unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, aggregator] of Object.entries(aggregations)) {
      const values = data.map(row => row[key]).filter(v => v !== null && v !== undefined);
      result[key] = aggregator(values);
    }

    return result;
  }

  /**
   * Unir datos de múltiples fuentes
   */
  static join(
    left: Record<string, unknown>[],
    right: Record<string, unknown>[],
    leftKey: string,
    rightKey: string,
    type: 'inner' | 'left' | 'right' | 'full' = 'inner'
  ): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    const rightMap = new Map(right.map(r => [r[rightKey], r]));

    for (const leftRow of left) {
      const rightRow = rightMap.get(leftRow[leftKey]);

      if (rightRow) {
        result.push({ ...leftRow, ...rightRow });
      } else if (type === 'left' || type === 'full') {
        result.push(leftRow);
      }
    }

    if (type === 'right' || type === 'full') {
      for (const rightRow of right) {
        if (!left.some(l => l[leftKey] === rightRow[rightKey])) {
          result.push(rightRow);
        }
      }
    }

    return result;
  }

  /**
   * Pivotar datos
   */
  static pivot(
    data: Record<string, unknown>[],
    rowKey: string,
    columnKey: string,
    valueKey: string,
    aggregator: (values: unknown[]) => unknown = (v) => v[0]
  ): Record<string, unknown>[] {
    const pivoted = new Map<unknown, Record<string, unknown>>();

    for (const row of data) {
      const rowValue = row[rowKey];
      const colValue = row[columnKey];
      const value = row[valueKey];

      if (!pivoted.has(rowValue)) {
        pivoted.set(rowValue, { [rowKey]: rowValue });
      }

      const pivotRow = pivoted.get(rowValue)!;
      if (!pivotRow[colValue as string]) {
        pivotRow[colValue as string] = [];
      }
      (pivotRow[colValue as string] as unknown[]).push(value);
    }

    // Aplicar agregador
    for (const row of pivoted.values()) {
      for (const [key, values] of Object.entries(row)) {
        if (Array.isArray(values)) {
          row[key] = aggregator(values);
        }
      }
    }

    return Array.from(pivoted.values());
  }
}