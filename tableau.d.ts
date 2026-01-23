// Declaración de tipos para Tableau Embedding API v3
import "react";

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

  // Tipos para el objeto viz de Tableau
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

export {};

