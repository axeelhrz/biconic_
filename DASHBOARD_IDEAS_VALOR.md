# Ideas competitivas para la pestaña de vista del dashboard

Ideas para generar más valor en la vista de dashboard (admin y usuario), ya implementadas o propuestas.

## Ya implementado en esta iteración

- **KPIs sin recorte**: Números muy largos (ej. 19,694,668,604) se muestran en formato compacto (19.7B) con el valor completo debajo y en tooltip, evitando que se corten.
- **Mejor uso del espacio en tablas**: Las tarjetas de tabla tienen altura mínima mayor (380px) y el contenido usa `flex-1 min-h-0 overflow-auto` para llenar el espacio disponible.
- **Exportar tabla individual**: Botón "Exportar CSV" en el encabezado de cada tarjeta de tabla para descargar solo esa tabla sin usar el menú global.

## Ideas adicionales de valor (priorizables)

1. **Mini sparkline en KPIs**  
   Mostrar una línea de tendencia junto al valor del KPI (si hay serie temporal en los datos) para contexto visual sin ocupar mucho espacio.

2. **Comparación vs período anterior**  
   En cada KPI, mostrar “vs anterior: +X%” o “vs anterior: -X%” cuando existan datos históricos o de comparación configurados.

3. **Densidad de tabla configurable**  
   Selector en la tarjeta (Compacta / Cómoda) para alternar padding y tamaño de fuente de la tabla y adaptar a pantallas grandes.

4. **Totales / pie de tabla**  
   Fila de totales o subtotales al final de la tabla para columnas numéricas (suma, media, etc.), opcional por widget.

5. **Filtros rápidos sobre la tabla**  
   Filtros por columna (por valor o búsqueda) sin salir de la vista, tipo “quick filters” en la cabecera de la tabla.

6. **Ordenación por columna**  
   Clic en cabecera de columna para ordenar ascendente/descendente en la vista (sobre los datos ya cargados).

7. **Búsqueda en tabla**  
   Campo de búsqueda en la tarjeta que filtre filas por cualquier columna.

8. **Vista de tarjeta para tablas**  
   Alternativa de visualización en “cards” (una fila = una tarjeta) para tablas con pocas columnas, útil en móvil.

9. **Alertas / umbrales en KPIs**  
   Colorear el KPI (verde/amarillo/rojo) según umbrales configurados (ej. objetivo superado, por debajo del mínimo).

10. **Drill-down desde KPI o gráfico**  
    Clic en un KPI o en una barra/sector que abra un desglose (modal o panel) con detalle o tabla filtrada.

Prioridad sugerida para siguiente fase: 1 (sparkline), 2 (vs anterior), 4 (totales), 6 (ordenación).
