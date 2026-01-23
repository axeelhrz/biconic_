# Nuevos Tipos de Gráficos en Dashboard

Se han agregado tres nuevos tipos de gráficos al editor de dashboards:

## 📊 Gráfico de Barras Horizontales
- **Tipo**: `horizontalBar`
- **Descripción**: Gráfico de barras con orientación horizontal
- **Uso**: Ideal para mostrar rankings, comparaciones con etiquetas largas
- **Características**:
  - Las barras se extienden horizontalmente
  - Las etiquetas se muestran en el eje Y
  - Los valores se muestran en el eje X

## 🍩 Gráfico de Dona
- **Tipo**: `doughnut`
- **Descripción**: Similar al gráfico circular pero con un agujero en el centro
- **Uso**: Perfecto para mostrar proporciones con un diseño más moderno
- **Características**:
  - Centro vacío que permite agregar información adicional
  - Misma funcionalidad que el gráfico circular
  - Soporte para múltiples colores por segmento

## 📈📊 Gráfico Combo (Barras + Línea)
- **Tipo**: `combo`
- **Descripción**: Combina gráfico de barras y líneas en una sola visualización
- **Uso**: Ideal para comparar dos métricas diferentes (ej: ventas vs. crecimiento)
- **Características**:
  - Primera serie se muestra como barras
  - Segunda serie se muestra como línea
  - Permite comparar métricas con diferentes escalas
  - Auto-detecta el mejor campo para cada tipo

## 🚀 Carga Automática de Datos ETL

Todos los nuevos tipos de gráficos soportan:

- ✅ **Carga automática** desde `etl_data_wherehouse`
- ✅ **Selección dinámica de campos** mediante dropdowns
- ✅ **Auto-detección inteligente** de campos apropiados
- ✅ **Configuración manual** de campos y colores
- ✅ **Integración completa** con el sistema ETL existente

## 💡 Consejos de Uso

### Barras Horizontales
- Usa cuando tengas etiquetas largas
- Perfecto para rankings y comparaciones
- Ideal para mostrar datos categóricos

### Gráfico de Dona
- Excelente para mostrar proporciones
- Más moderno que el gráfico circular tradicional
- El centro puede usarse para mostrar totales

### Gráfico Combo
- Combina métricas relacionadas pero diferentes
- Ejemplo: Ventas (barras) + Crecimiento % (línea)
- Permite análisis más profundo de tendencias

## 🔧 Implementación Técnica

Los nuevos gráficos utilizan:
- **Chart.js** como motor de renderizado
- **React Chart.js 2** para la integración con React
- **Configuración dinámica** basada en datos del ETL
- **Tipos TypeScript** actualizados para mejor desarrollo

¡Disfruta creando visualizaciones más ricas y variadas en tus dashboards!



