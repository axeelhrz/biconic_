/**
 * Performance Monitor
 * Sistema de monitoreo de rendimiento y métricas
 */

export interface PerformanceMetrics {
  queryLatency: LatencyMetrics;
  throughput: ThroughputMetrics;
  errorRate: ErrorMetrics;
  resourceUsage: ResourceMetrics;
  timestamp: Date;
}

export interface LatencyMetrics {
  p50: number; // ms
  p95: number; // ms
  p99: number; // ms
  mean: number; // ms
  max: number; // ms
}

export interface ThroughputMetrics {
  rowsPerSecond: number;
  queriesPerSecond: number;
  bytesPerSecond: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorRate: number; // porcentaje
  errorsByType: Map<string, number>;
}

export interface ResourceMetrics {
  cpuUsage: number; // porcentaje
  memoryUsage: number; // porcentaje
  diskUsage: number; // porcentaje
  activeConnections: number;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  resolved?: boolean;
}

/**
 * Monitor de rendimiento
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private alerts: Alert[] = [];
  private queryTimes: number[] = [];
  private errorCounts: Map<string, number> = new Map();
  private readonly MAX_METRICS_HISTORY = 1000;

  /**
   * Registrar tiempo de query
   */
  recordQueryTime(duration: number): void {
    this.queryTimes.push(duration);

    // Mantener historial limitado
    if (this.queryTimes.length > 10000) {
      this.queryTimes = this.queryTimes.slice(-5000);
    }
  }

  /**
   * Registrar error
   */
  recordError(errorType: string): void {
    this.errorCounts.set(
      errorType,
      (this.errorCounts.get(errorType) || 0) + 1
    );
  }

  /**
   * Obtener métricas actuales
   */
  getCurrentMetrics(): PerformanceMetrics {
    const latency = this.calculateLatency();
    const throughput = this.calculateThroughput();
    const errorRate = this.calculateErrorRate();
    const resourceUsage = this.getResourceUsage();

    const metrics: PerformanceMetrics = {
      queryLatency: latency,
      throughput,
      errorRate,
      resourceUsage,
      timestamp: new Date(),
    };

    this.metrics.push(metrics);

    // Mantener historial limitado
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-500);
    }

    return metrics;
  }

  /**
   * Obtener historial de métricas
   */
  getMetricsHistory(minutes: number = 60): PerformanceMetrics[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Verificar alertas
   */
  checkAlerts(metrics: PerformanceMetrics): Alert[] {
    const newAlerts: Alert[] = [];

    // Latencia crítica
    if (metrics.queryLatency.p99 > 5000) {
      newAlerts.push(this.createAlert(
        'critical',
        'Latencia p99 crítica',
        'latency_p99',
        5000,
        metrics.queryLatency.p99
      ));
    }

    // CPU alta
    if (metrics.resourceUsage.cpuUsage > 90) {
      newAlerts.push(this.createAlert(
        'critical',
        'Uso de CPU crítico',
        'cpu_usage',
        90,
        metrics.resourceUsage.cpuUsage
      ));
    }

    // Memoria alta
    if (metrics.resourceUsage.memoryUsage > 85) {
      newAlerts.push(this.createAlert(
        'critical',
        'Uso de memoria crítico',
        'memory_usage',
        85,
        metrics.resourceUsage.memoryUsage
      ));
    }

    // Disco lleno
    if (metrics.resourceUsage.diskUsage > 90) {
      newAlerts.push(this.createAlert(
        'critical',
        'Disco casi lleno',
        'disk_usage',
        90,
        metrics.resourceUsage.diskUsage
      ));
    }

    // Tasa de error alta
    if (metrics.errorRate.errorRate > 1) {
      newAlerts.push(this.createAlert(
        'warning',
        'Tasa de error elevada',
        'error_rate',
        1,
        metrics.errorRate.errorRate
      ));
    }

    // Advertencias
    if (metrics.queryLatency.p95 > 2000) {
      newAlerts.push(this.createAlert(
        'warning',
        'Latencia p95 elevada',
        'latency_p95',
        2000,
        metrics.queryLatency.p95
      ));
    }

    if (metrics.resourceUsage.cpuUsage > 75) {
      newAlerts.push(this.createAlert(
        'warning',
        'Uso de CPU elevado',
        'cpu_usage',
        75,
        metrics.resourceUsage.cpuUsage
      ));
    }

    this.alerts.push(...newAlerts);
    return newAlerts;
  }

  /**
   * Obtener alertas activas
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Resolver alerta
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  /**
   * Obtener resumen de salud
   */
  getHealthSummary(): HealthSummary {
    const metrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (activeAlerts.some(a => a.severity === 'critical')) {
      status = 'critical';
    } else if (activeAlerts.some(a => a.severity === 'warning')) {
      status = 'degraded';
    }

    return {
      status,
      metrics,
      activeAlerts: activeAlerts.length,
      criticalAlerts: activeAlerts.filter(a => a.severity === 'critical').length,
      warningAlerts: activeAlerts.filter(a => a.severity === 'warning').length,
    };
  }

  // ============ Métodos privados ============

  private calculateLatency(): LatencyMetrics {
    if (this.queryTimes.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, max: 0 };
    }

    const sorted = [...this.queryTimes].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      mean: sorted.reduce((a, b) => a + b, 0) / len,
      max: sorted[len - 1],
    };
  }

  private calculateThroughput(): ThroughputMetrics {
    const lastMinute = this.queryTimes.filter(
      t => Date.now() - t < 60000
    ).length;

    return {
      rowsPerSecond: lastMinute / 60,
      queriesPerSecond: lastMinute / 60,
      bytesPerSecond: (lastMinute * 1024) / 60, // Estimación
    };
  }

  private calculateErrorRate(): ErrorMetrics {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    const totalQueries = this.queryTimes.length + totalErrors;

    return {
      totalErrors,
      errorRate: totalQueries > 0 ? (totalErrors / totalQueries) * 100 : 0,
      errorsByType: this.errorCounts,
    };
  }

  private getResourceUsage(): ResourceMetrics {
    // En un entorno real, esto vendría de métricas del sistema
    // Por ahora, retornamos valores simulados
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      diskUsage: Math.random() * 100,
      activeConnections: Math.floor(Math.random() * 100),
    };
  }

  private createAlert(
    severity: 'critical' | 'warning' | 'info',
    message: string,
    metric: string,
    threshold: number,
    currentValue: number
  ): Alert {
    return {
      id: `alert_${Date.now()}_${Math.random()}`,
      severity,
      message,
      metric,
      threshold,
      currentValue,
      timestamp: new Date(),
    };
  }
}

export interface HealthSummary {
  status: 'healthy' | 'degraded' | 'critical';
  metrics: PerformanceMetrics;
  activeAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
}

/**
 * Auto-scaler basado en métricas
 */
export class AutoScaler {
  private readonly CPU_THRESHOLD_UP = 85;
  private readonly CPU_THRESHOLD_DOWN = 30;
  private readonly MEMORY_THRESHOLD_UP = 80;
  private readonly MEMORY_THRESHOLD_DOWN = 40;
  private readonly QUEUE_THRESHOLD_UP = 100;
  private readonly QUEUE_THRESHOLD_DOWN = 10;

  /**
   * Determinar si se necesita escalar
   */
  shouldScaleUp(metrics: PerformanceMetrics, queueSize: number): boolean {
    return (
      metrics.resourceUsage.cpuUsage > this.CPU_THRESHOLD_UP ||
      metrics.resourceUsage.memoryUsage > this.MEMORY_THRESHOLD_UP ||
      queueSize > this.QUEUE_THRESHOLD_UP
    );
  }

  /**
   * Determinar si se puede reducir escala
   */
  shouldScaleDown(metrics: PerformanceMetrics, queueSize: number): boolean {
    return (
      metrics.resourceUsage.cpuUsage < this.CPU_THRESHOLD_DOWN &&
      metrics.resourceUsage.memoryUsage < this.MEMORY_THRESHOLD_DOWN &&
      queueSize < this.QUEUE_THRESHOLD_DOWN
    );
  }

  /**
   * Calcular número de workers necesarios
   */
  calculateWorkerCount(
    metrics: PerformanceMetrics,
    queueSize: number,
    currentWorkers: number
  ): number {
    let targetWorkers = currentWorkers;

    // Basado en CPU
    if (metrics.resourceUsage.cpuUsage > 85) {
      targetWorkers = Math.min(currentWorkers + 2, 16);
    } else if (metrics.resourceUsage.cpuUsage < 30) {
      targetWorkers = Math.max(currentWorkers - 1, 2);
    }

    // Basado en queue
    if (queueSize > 100) {
      targetWorkers = Math.min(targetWorkers + 1, 16);
    } else if (queueSize < 10) {
      targetWorkers = Math.max(targetWorkers - 1, 2);
    }

    return targetWorkers;
  }
}

/**
 * Logger de eventos
 */
export class EventLogger {
  private events: LogEvent[] = [];
  private readonly MAX_EVENTS = 10000;

  /**
   * Registrar evento
   */
  log(
    level: 'info' | 'warning' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>
  ): void {
    const event: LogEvent = {
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this.events.push(event);

    // Mantener historial limitado
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-5000);
    }

    // Log a consola en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level.toUpperCase()}] ${message}`, context);
    }
  }

  /**
   * Obtener eventos
   */
  getEvents(
    level?: string,
    minutes: number = 60
  ): LogEvent[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.events.filter(
      e =>
        e.timestamp.getTime() > cutoff &&
        (!level || e.level === level)
    );
  }

  /**
   * Obtener resumen de errores
   */
  getErrorSummary(minutes: number = 60): Map<string, number> {
    const errors = this.getEvents('error', minutes);
    const summary = new Map<string, number>();

    for (const error of errors) {
      const key = error.message;
      summary.set(key, (summary.get(key) || 0) + 1);
    }

    return summary;
  }
}

interface LogEvent {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
}