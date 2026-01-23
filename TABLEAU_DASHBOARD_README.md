# Dashboard de Tableau con Embedding API v3

## Descripción

Este módulo implementa la integración de un dashboard de Tableau Public utilizando la **Tableau Embedding API v3**, la forma más moderna y recomendada de embeber visualizaciones de Tableau en aplicaciones web.

## Ubicación

- **Ruta**: `/tableau-dashboard`
- **Archivo**: `app/(main)/tableau-dashboard/page.tsx`

## Características

✅ **Tableau Embedding API v3** - Utiliza la última versión de la API de Tableau  
✅ **Web Component** - Usa el elemento `<tableau-viz>` nativo  
✅ **Carga asíncrona** - El script se carga de forma eficiente con Next.js Script  
✅ **Estado de carga** - Muestra un indicador mientras se carga el dashboard  
✅ **Event Listeners** - Configurado para escuchar eventos del dashboard  
✅ **Responsive** - Se adapta al tamaño de la pantalla  
✅ **TypeScript** - Con tipos definidos para mejor desarrollo

## Dashboard actual

**URL**: https://public.tableau.com/views/DEMO_oficial/Dashboard1

## Características de la API v3

### Web Component `<tableau-viz>`

El componente soporta los siguientes atributos:

```tsx
<tableau-viz
  id="tableauViz"
  src="https://public.tableau.com/views/DEMO_oficial/Dashboard1"
  width="100%"
  height="100%"
  toolbar="bottom"        // Opciones: "top", "bottom", "hidden"
  hide-tabs={false}       // Mostrar u ocultar pestañas
  device="default"        // Opciones: "default", "desktop", "tablet", "phone"
/>
```

### Eventos disponibles

El componente emite varios eventos que puedes escuchar:

- **firstinteractive**: Se dispara cuando el dashboard está completamente cargado y listo para interactuar
- **tabswitch**: Cuando el usuario cambia de pestaña
- **filterchange**: Cuando se aplica un filtro
- **markselection**: Cuando se seleccionan marcas en la visualización
- **parameterchange**: Cuando cambia un parámetro

Ejemplo de uso:

```typescript
viz.addEventListener("firstinteractive", () => {
  console.log("Dashboard listo");
});

viz.addEventListener("filterchange", (event) => {
  console.log("Filtro aplicado:", event);
});
```

## Interactividad avanzada

### Aplicar filtros desde la aplicación

```typescript
const viz = document.getElementById("tableauViz") as TableauViz;

// Esperar a que esté listo
viz.addEventListener("firstinteractive", async () => {
  const sheet = viz.workbook?.activeSheet;
  
  // Aplicar filtro
  await sheet?.applyFilterAsync("NombreCampo", "Valor", "REPLACE");
  
  // Aplicar múltiples valores
  await sheet?.applyFilterAsync("NombreCampo", ["Valor1", "Valor2"], "REPLACE");
});
```

### Obtener datos de la visualización

```typescript
viz.addEventListener("firstinteractive", async () => {
  const workbook = viz.workbook;
  
  // Obtener información del workbook
  console.log("Nombre:", workbook?.name);
  console.log("Hojas:", workbook?.publishedSheetsInfo);
});
```

## Configuración de tipos (TypeScript)

Los tipos están definidos en `tableau.d.ts` en la raíz del proyecto:

```typescript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "tableau-viz": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          id?: string;
          src?: string;
          width?: string;
          height?: string;
          toolbar?: "top" | "bottom" | "hidden";
          "hide-tabs"?: boolean;
          device?: "default" | "desktop" | "tablet" | "phone";
        },
        HTMLElement
      >;
    }
  }

  interface TableauViz extends HTMLElement {
    workbook?: {
      activeSheet?: {
        applyFilterAsync?: (
          fieldName: string,
          values: string | string[],
          updateType: string
        ) => Promise<void>;
      };
    };
  }
}
```

## Personalización

### Cambiar el dashboard

Para cambiar a otro dashboard de Tableau Public, simplemente actualiza la URL:

```typescript
const tableauUrl = "https://public.tableau.com/views/TU_WORKBOOK/TU_VISTA";
```

### Ajustar la altura

Modifica el estilo inline en el contenedor:

```tsx
<div style={{ height: "calc(100vh - 200px)" }}>
```

### Configurar la barra de herramientas

```tsx
toolbar="top"     // Arriba
toolbar="bottom"  // Abajo (por defecto)
toolbar="hidden"  // Oculta
```

### Ocultar pestañas

```tsx
hide-tabs={true}  // Oculta las pestañas del dashboard
```

## Rendimiento

La implementación incluye optimizaciones de rendimiento:

1. **Carga diferida**: El script de Tableau se carga con `strategy="afterInteractive"`
2. **Estado de carga**: Muestra un indicador mientras carga
3. **Limpieza de eventos**: Los event listeners se eliminan correctamente al desmontar

## Navegación

El enlace al dashboard de Tableau está disponible en el menú principal con la etiqueta **"Tableau"**.

## Referencias

- [Tableau Embedding API v3 Documentation](https://help.tableau.com/current/api/embedding_api/en-us/index.html)
- [Web Component Reference](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_component.html)
- [Tableau Public](https://public.tableau.com)

## Troubleshooting

### El dashboard no se carga

1. Verifica que la URL del dashboard sea correcta
2. Asegúrate de que el dashboard sea público en Tableau Public
3. Revisa la consola del navegador para errores

### TypeScript muestra errores

Si ves errores de tipo relacionados con `<tableau-viz>`, asegúrate de que:
- El archivo `tableau.d.ts` existe en la raíz del proyecto
- El archivo está incluido en `tsconfig.json`

### El dashboard se ve cortado

Ajusta la altura del contenedor en el estilo:

```tsx
style={{ height: "800px" }} // O el valor que necesites
```

## Soporte

Para más información sobre la API de Tableau, consulta la [documentación oficial](https://help.tableau.com/current/api/embedding_api/en-us/index.html).

