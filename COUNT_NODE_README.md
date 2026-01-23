# Nodo Count - ETL Editor

## Descripción

El nodo Count permite contar la cantidad de veces que se repite cada valor único en una columna específica, generando como resultado una tabla con el nombre del elemento y su cantidad de repeticiones. Este nodo es ideal para análisis de frecuencia y agregaciones de datos.

## Características

### Funcionalidad Principal
- **Conteo por atributo**: Cuenta las ocurrencias de cada valor único en una columna seleccionada
- **Resultado estructurado**: Genera una tabla con dos columnas:
  - La columna original con los valores únicos
  - Una nueva columna con el conteo de cada valor
- **Integración completa**: Se conecta perfectamente con el warehouse `etl_data_wherehouse`

### Posición en el Flujo ETL
El nodo Count está diseñado para ser usado **después del nodo Row Filter** y **antes del nodo End**, siguiendo este flujo:

```
[Conexión] → [Row Filter] → [Count] → [End] → etl_data_wherehouse
```

## Cómo Usar

### 1. Configuración del Flujo
1. **Conexión**: Arrastra un nodo de conexión a la base de datos desde el panel izquierdo
2. **Row Filter**: Arrastra y conecta un nodo "Row filter" para filtrar los datos según tus criterios
3. **Count**: Arrastra el nodo "Conteo por atributo" desde la sección "Transformaciones" del panel izquierdo y conéctalo al Row Filter
4. **End**: Arrastra y conecta un nodo "Fin" para almacenar los resultados en `etl_data_wherehouse`

### 2. Configuración del Nodo Count
1. **Selecciona el nodo Count** para abrir el panel de configuración
2. **Columna a contar**: Selecciona la columna de la cual quieres contar las ocurrencias
3. **Nombre de la nueva columna**: Define el nombre para la columna que contendrá los conteos (por defecto: "conteo")

### 3. Ejemplo de Configuración
```
Configuración:
- Columna a contar: categoria_producto
- Nombre de la nueva columna: cantidad_repeticiones

Resultado:
categoria_producto | cantidad_repeticiones
-------------------|---------------------
Electrónicos      | 150
Ropa              | 89
Hogar             | 67
Deportes          | 45
```

### 4. Vista Previa
El nodo Count incluye un botón **"Vista previa"** que permite:
- Ver los resultados del conteo en tiempo real
- Navegar por los datos con paginación
- Verificar la configuración antes de ejecutar el ETL completo

### 5. Ejecución y Almacenamiento
1. **Configura el nodo End** con:
   - Tabla destino: `etl_data_wherehouse` (o la tabla que prefieras)
   - Modo: "append" (agregar) o "replace" (reemplazar)
2. **Ejecuta el flujo** desde el nodo End
3. Los datos contados se almacenarán en el warehouse con la estructura:
   ```json
   {
     "data": [
       {"categoria_producto": "Electrónicos", "cantidad_repeticiones": 150},
       {"categoria_producto": "Ropa", "cantidad_repeticiones": 89},
       // ... más registros
     ],
     "name": "ETL_Run_2024-10-21T10-30-00-000Z",
     "etl_id": "uuid-del-etl"
   }
   ```

## Flujo de Datos Completo

### Entrada (desde Row Filter)
- Datos filtrados según las condiciones especificadas
- Mantiene todas las columnas originales

### Procesamiento (en Count)
- Agrupa los datos por la columna seleccionada
- Cuenta las ocurrencias de cada valor único
- Genera una nueva estructura de datos simplificada

### Salida (hacia End)
- Tabla con dos columnas: valor único y su conteo
- Datos listos para almacenamiento en el warehouse

## Casos de Uso Comunes

### 1. Análisis de Ventas por Categoría
```
Flujo: ventas_table → filter(fecha >= '2024-01-01') → count(categoria) → warehouse
Resultado: Cantidad de ventas por cada categoría de producto
```

### 2. Conteo de Usuarios por Ciudad
```
Flujo: usuarios_table → filter(activo = true) → count(ciudad) → warehouse
Resultado: Número de usuarios activos por ciudad
```

### 3. Frecuencia de Errores por Tipo
```
Flujo: logs_table → filter(nivel = 'ERROR') → count(tipo_error) → warehouse
Resultado: Cantidad de errores por cada tipo específico
```

### 4. Análisis de Productos Más Vendidos
```
Flujo: pedidos_table → filter(estado = 'completado') → count(producto_id) → warehouse
Resultado: Cantidad de veces que se vendió cada producto
```

## Notas Técnicas

### Rendimiento
- El nodo Count procesa todos los datos antes de generar el resultado final
- Optimizado para manejar grandes volúmenes de datos mediante procesamiento por lotes
- La agregación se realiza en memoria para máxima eficiencia

### Limitaciones
- Solo puede contar una columna a la vez por nodo
- Los valores nulos se convierten a cadena vacía para el conteo
- Para múltiples conteos, usa varios nodos Count en paralelo

### Integración con Otros Nodos
- **Compatible con**: Row Filter, Column Filter, Clean, Arithmetic, Condition
- **Posición recomendada**: Después de filtros, antes de transformaciones finales
- **Salida**: Siempre genera una estructura de dos columnas (valor + conteo)

## Troubleshooting

### Error: "Selecciona la columna a contar"
- **Causa**: No se ha seleccionado una columna en la configuración
- **Solución**: Abre el panel de configuración y selecciona una columna válida

### Error: "Conecta este nodo a un filtro"
- **Causa**: El nodo Count no está conectado a un nodo Row Filter
- **Solución**: Conecta un nodo Row Filter antes del nodo Count

### Sin datos en la vista previa
- **Causa**: El filtro anterior no devuelve datos o la conexión tiene problemas
- **Solución**: Verifica la configuración del Row Filter y la conexión a la base de datos

### Resultados inesperados
- **Causa**: La columna seleccionada contiene valores nulos o tipos de datos mixtos
- **Solución**: Usa un nodo Clean antes del Count para normalizar los datos
