# Nodo JOIN - Documentación

## Descripción

El nodo JOIN permite realizar uniones entre tablas de diferentes conexiones en el ETL de Biconic. Soporta JOIN entre bases de datos PostgreSQL, MySQL y archivos Excel importados.

## Características

### Tipos de JOIN Soportados
- **INNER JOIN**: Devuelve solo las filas que tienen coincidencias en ambas tablas
- **LEFT JOIN**: Devuelve todas las filas de la tabla izquierda y las coincidencias de la derecha
- **RIGHT JOIN**: Devuelve todas las filas de la tabla derecha y las coincidencias de la izquierda
- **FULL JOIN**: Devuelve todas las filas cuando hay coincidencias en cualquiera de las tablas

### Conexiones Soportadas
- **PostgreSQL**: Conexiones a bases de datos PostgreSQL
- **MySQL**: Conexiones a bases de datos MySQL
- **Excel**: Archivos Excel importados en Supabase
- **Mixto**: JOIN entre diferentes tipos de conexiones (limitado)

## Configuración

### 1. Conexiones
- **Conexión Izquierda**: Selecciona la conexión para la tabla izquierda del JOIN
- **Conexión Derecha**: Selecciona la conexión para la tabla derecha del JOIN
- Si ambas tablas están en la misma conexión, puedes usar la misma conexión para ambas

### 2. Tablas
- **Tabla Izquierda**: Especifica la tabla en formato `schema.tabla` (ej: `public.usuarios`)
- **Tabla Derecha**: Especifica la tabla en formato `schema.tabla` (ej: `public.pedidos`)

### 3. Condiciones de JOIN
- Puedes agregar múltiples condiciones de JOIN
- Cada condición especifica:
  - **Columna Izquierda**: Columna de la tabla izquierda
  - **Columna Derecha**: Columna de la tabla derecha
  - **Tipo de JOIN**: INNER, LEFT, RIGHT, o FULL

### 4. Selección de Columnas (Opcional)
- **Columnas Izquierda**: Lista de columnas a seleccionar de la tabla izquierda (separadas por coma)
- **Columnas Derecha**: Lista de columnas a seleccionar de la tabla derecha (separadas por coma)
- Si se deja vacío, se seleccionan todas las columnas

## Ejemplo de Uso

### Caso: JOIN entre tabla de usuarios y pedidos

1. **Configuración**:
   - Conexión Izquierda: `PostgreSQL - DB Principal`
   - Conexión Derecha: `PostgreSQL - DB Principal`
   - Tabla Izquierda: `public.usuarios`
   - Tabla Derecha: `public.pedidos`

2. **Condición de JOIN**:
   - Columna Izquierda: `id`
   - Columna Derecha: `usuario_id`
   - Tipo: `INNER JOIN`

3. **Selección de Columnas**:
   - Columnas Izquierda: `id, nombre, email`
   - Columnas Derecha: `id, total, fecha_pedido`

4. **Resultado**: 
   - El nodo generará una consulta que une usuarios con sus pedidos
   - Las columnas resultantes tendrán prefijos `left_` y `right_` para evitar conflictos

## API Endpoint

El nodo utiliza el endpoint `/api/connection/join-query` que acepta:

```typescript
{
  connectionId: string,           // ID de conexión izquierda
  secondaryConnectionId?: string, // ID de conexión derecha (opcional)
  leftTable: string,             // Tabla izquierda
  rightTable: string,            // Tabla derecha
  joinConditions: Array<{        // Condiciones de JOIN
    leftTable: string,
    leftColumn: string,
    rightTable: string,
    rightColumn: string,
    joinType: "INNER" | "LEFT" | "RIGHT" | "FULL"
  }>,
  leftColumns?: string[],        // Columnas izquierda (opcional)
  rightColumns?: string[],       // Columnas derecha (opcional)
  limit?: number,               // Límite de filas
  offset?: number,              // Offset para paginación
  count?: boolean               // Incluir conteo total
}
```

## Limitaciones

1. **JOINs entre diferentes bases de datos**: Actualmente no soportado para conexiones externas diferentes
2. **Rendimiento**: Para tablas muy grandes, considera usar filtros previos
3. **Memoria**: El JOIN se ejecuta en memoria, ten cuidado con el tamaño de los resultados

## Vista Previa

El nodo incluye una función de vista previa que permite:
- Ver los primeros resultados del JOIN
- Paginación de resultados
- Conteo total de filas
- Detección de errores en la configuración

## Integración con ETL

El nodo JOIN puede ser usado en flujos ETL como:
1. **Fuente de datos**: Como punto de partida para transformaciones posteriores
2. **Transformación intermedia**: Entre nodos de filtro y agregación
3. **Preparación de datos**: Antes de nodos de limpieza o cálculos

## Solución de Problemas

### Error: "No se encontró conexión"
- Verifica que las conexiones estén configuradas correctamente
- Asegúrate de que el usuario tenga permisos sobre las conexiones

### Error: "Tabla no encontrada"
- Verifica el formato `schema.tabla`
- Confirma que las tablas existen en las conexiones especificadas

### Error: "Columna no encontrada"
- Verifica que las columnas especificadas en las condiciones de JOIN existan
- Revisa la ortografía de los nombres de columnas

### Rendimiento lento
- Considera agregar índices en las columnas de JOIN
- Usa filtros previos para reducir el tamaño de las tablas
- Limita las columnas seleccionadas

## Desarrollo

### Archivos Modificados
- `/app/api/connection/join-query/route.ts` - Endpoint de la API
- `/components/etl/etl-editor.tsx` - Interfaz del nodo
- Tipos TypeScript actualizados para soportar configuración de JOIN

### Testing
- Prueba con diferentes tipos de conexiones
- Verifica todos los tipos de JOIN
- Testa con tablas grandes y pequeñas
- Confirma el manejo de errores
