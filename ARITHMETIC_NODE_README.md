# Nodo de Operaciones Aritméticas - ETL Editor

## Descripción

El nodo de operaciones aritméticas permite realizar cálculos matemáticos sobre las columnas de datos en el pipeline ETL, creando nuevas columnas con los resultados de las operaciones.

## Características

### Tipos de Operadores Soportados
- **Suma (+)**: Suma dos valores
- **Resta (-)**: Resta el segundo valor del primero
- **Multiplicación (*)**: Multiplica dos valores
- **División (/)**: Divide el primer valor entre el segundo
- **Módulo (%)**: Obtiene el residuo de la división
- **Potencia (^)**: Eleva el primer valor a la potencia del segundo

### Tipos de Operandos
- **Columna**: Utiliza el valor de una columna existente en la tabla
- **Constante**: Utiliza un valor fijo definido por el usuario

## Cómo Usar

### 1. Conexión del Nodo
1. Arrastra el nodo "Operaciones Aritméticas" desde la paleta al canvas
2. Conecta un nodo **Filter** (que ya tenga una tabla seleccionada) al nodo aritmético
3. El nodo aritmético puede conectarse a otros nodos como Clean, End, o visualizaciones

### 2. Configuración de Operaciones
1. Selecciona el nodo aritmético para abrir el panel de configuración
2. Haz clic en "Agregar operación" para crear una nueva operación
3. Para cada operación, configura:
   - **Nombre de columna resultado**: El nombre de la nueva columna que se creará
   - **Operando izquierdo**: Selecciona si es una columna o constante, y su valor
   - **Operador**: Selecciona la operación matemática a realizar
   - **Operando derecho**: Selecciona si es una columna o constante, y su valor

### 3. Vista Previa de Resultados
El nodo aritmético incluye un botón de **"Vista previa"** que permite ver los resultados de las operaciones en tiempo real:
- Muestra las columnas originales + las nuevas columnas calculadas
- Paginación para navegar por los datos
- Actualización automática cuando se modifican las operaciones
- Manejo de errores en caso de operaciones inválidas

### 4. Ejemplo de Configuración
```
Operación 1:
- Nombre de columna resultado: precio_con_iva
- Operando izquierdo: Columna -> precio_base
- Operador: Multiplicación (*)
- Operando derecho: Constante -> 1.21

Operación 2:
- Nombre de columna resultado: ganancia
- Operando izquierdo: Columna -> precio_venta
- Operador: Resta (-)
- Operando derecho: Columna -> precio_costo
```

## Flujo de Datos

```
[Conexión] → [Row Filter / Column Filter] → [Arithmetic] → [Clean/End/Visualización]
```

1. **Conexión**: Proporciona acceso a la base de datos
2. **Row Filter / Column Filter**: Filtra filas o selecciona columnas específicas
3. **Arithmetic**: Realiza las operaciones matemáticas sobre las columnas numéricas resultantes
4. **Siguiente nodo**: Procesa los datos con las nuevas columnas calculadas incluidas

### Tipos de Filtros Compatibles

- **Row Filter**: Filtra filas basado en condiciones específicas
- **Column Filter**: Selecciona columnas específicas de la tabla
- Ambos tipos pueden conectarse al nodo aritmético para realizar cálculos

## Notas Técnicas

- Las operaciones se ejecutan en el orden definido
- Las nuevas columnas creadas están disponibles para operaciones posteriores en el mismo nodo
- Los valores constantes deben ser números válidos
- Las operaciones de división por cero se manejan según las reglas de la base de datos
- El nodo preserva todas las columnas originales y añade las nuevas columnas calculadas

## Casos de Uso Comunes

1. **Cálculos de precios**: Aplicar impuestos, descuentos, márgenes
2. **Métricas financieras**: Calcular ganancias, ratios, porcentajes
3. **Transformaciones de unidades**: Convertir entre diferentes unidades de medida
4. **Cálculos estadísticos**: Crear índices, normalizar valores
5. **Operaciones de fecha/tiempo**: Calcular diferencias, añadir períodos (usando timestamps numéricos)
