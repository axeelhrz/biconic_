# Test del Nodo Count - Guía de Prueba

## Objetivo
Verificar que el nodo Count funciona correctamente en el flujo ETL: **Row Filter → Count → End → etl_data_wherehouse**

## Datos de Prueba Sugeridos

### Tabla de Ejemplo: `productos`
```sql
CREATE TABLE productos (
  id INT PRIMARY KEY,
  nombre VARCHAR(100),
  categoria VARCHAR(50),
  precio DECIMAL(10,2),
  stock INT,
  activo BOOLEAN
);

INSERT INTO productos VALUES
(1, 'Laptop HP', 'Electrónicos', 899.99, 10, true),
(2, 'Camisa Polo', 'Ropa', 29.99, 50, true),
(3, 'Sofá 3 Plazas', 'Hogar', 599.99, 5, true),
(4, 'iPhone 15', 'Electrónicos', 999.99, 15, true),
(5, 'Pantalón Jeans', 'Ropa', 49.99, 30, true),
(6, 'Mesa de Centro', 'Hogar', 199.99, 8, true),
(7, 'Tablet Samsung', 'Electrónicos', 299.99, 20, true),
(8, 'Vestido Casual', 'Ropa', 39.99, 25, false),
(9, 'Lámpara LED', 'Hogar', 79.99, 12, true),
(10, 'Auriculares', 'Electrónicos', 149.99, 40, true);
```

## Pasos de Prueba

### 1. Configurar la Conexión
- Crear una conexión a la base de datos que contiene la tabla `productos`
- Verificar que la conexión funciona correctamente

### 2. Configurar Row Filter
- **Tabla**: `productos`
- **Condiciones**: `activo = true` (para filtrar solo productos activos)
- **Columnas**: Todas (o específicamente: `id`, `nombre`, `categoria`, `precio`)

### 3. Configurar Nodo Count
- **Columna a contar**: `categoria`
- **Nombre de la nueva columna**: `cantidad_productos`

### 4. Configurar Nodo End
- **Tabla destino**: `etl_data_wherehouse`
- **Modo**: `replace` (para limpiar datos anteriores)

### 5. Ejecutar Vista Previa del Count
**Resultado Esperado:**
```
categoria     | cantidad_productos
--------------|------------------
Electrónicos  | 4
Ropa          | 2
Hogar         | 3
```

### 6. Ejecutar ETL Completo
**Verificar en etl_data_wherehouse:**
```json
{
  "data": [
    {"categoria": "Electrónicos", "cantidad_productos": 4},
    {"categoria": "Ropa", "cantidad_productos": 2},
    {"categoria": "Hogar", "cantidad_productos": 3}
  ],
  "name": "ETL_Run_2024-10-21T...",
  "etl_id": "uuid-del-etl"
}
```

## Casos de Prueba Adicionales

### Caso 1: Sin Filtros
- **Row Filter**: Sin condiciones (todos los productos)
- **Resultado Esperado**: 
  - Electrónicos: 4
  - Ropa: 3 (incluye el vestido inactivo)
  - Hogar: 3

### Caso 2: Filtro por Precio
- **Row Filter**: `precio > 100`
- **Count**: `categoria`
- **Resultado Esperado**:
  - Electrónicos: 3 (Laptop, iPhone, Auriculares)
  - Hogar: 2 (Sofá, Mesa)

### Caso 3: Conteo por Rango de Stock
- **Row Filter**: `stock >= 20`
- **Count**: `categoria`
- **Resultado Esperado**:
  - Electrónicos: 2 (Tablet: 20, Auriculares: 40)
  - Ropa: 2 (Camisa: 50, Vestido: 25)

### Caso 4: Columna con Valores Nulos
```sql
-- Agregar productos con categoría NULL
INSERT INTO productos VALUES
(11, 'Producto Sin Categoría', NULL, 19.99, 5, true);
```
- **Resultado Esperado**: Una fila con categoria = "" (cadena vacía) y count = 1

## Verificaciones de Calidad

### 1. Integridad de Datos
- ✅ La suma de todos los conteos debe igual al número total de filas filtradas
- ✅ No debe haber valores duplicados en la columna de categorías
- ✅ Los conteos deben ser números enteros positivos

### 2. Rendimiento
- ✅ La vista previa debe cargar en menos de 5 segundos
- ✅ La ejecución completa debe completarse sin errores de timeout
- ✅ Los datos deben almacenarse correctamente en etl_data_wherehouse

### 3. Manejo de Errores
- ✅ Error claro si no se selecciona columna para contar
- ✅ Error claro si no hay conexión al nodo anterior
- ✅ Manejo correcto de valores nulos y tipos de datos mixtos

## Resultados Esperados por Escenario

### Escenario Base (productos activos)
```
Total filas procesadas: 9
Resultado del conteo:
- Electrónicos: 4 productos
- Ropa: 2 productos  
- Hogar: 3 productos
Total categorías únicas: 3
```

### Validación en Base de Datos
```sql
-- Verificar manualmente
SELECT categoria, COUNT(*) as cantidad_productos 
FROM productos 
WHERE activo = true 
GROUP BY categoria 
ORDER BY cantidad_productos DESC;
```

## Checklist de Prueba

- [ ] Conexión a base de datos funciona
- [ ] Row Filter filtra correctamente
- [ ] Nodo Count se configura sin errores
- [ ] Vista previa muestra resultados correctos
- [ ] Ejecución completa sin errores
- [ ] Datos se almacenan en etl_data_wherehouse
- [ ] Estructura JSON es correcta
- [ ] Conteos coinciden con consulta manual
- [ ] Manejo de valores nulos funciona
- [ ] Rendimiento es aceptable

## Notas de Depuración

### Si la vista previa no funciona:
1. Verificar conexión a base de datos
2. Revisar configuración del Row Filter
3. Confirmar que la tabla tiene datos
4. Verificar permisos de base de datos

### Si la ejecución falla:
1. Revisar logs del servidor
2. Verificar configuración del nodo End
3. Confirmar permisos de escritura en etl_data_wherehouse
4. Verificar que el ETL ID es válido

### Si los conteos son incorrectos:
1. Ejecutar consulta SQL manual para comparar
2. Verificar filtros del Row Filter
3. Revisar tipos de datos de la columna contada
4. Confirmar manejo de valores nulos

