"use client";

import { Card } from "@/components/ui/card";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export default function TableauDashboardPage() {
  const vizRef = useRef<TableauViz | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // URL del dashboard de Tableau Public (sin parámetros, la API v3 los maneja)
  const tableauUrl = "https://public.tableau.com/views/DEMO_oficial/Dashboard2";

  useEffect(() => {
    // Si el componente web ya fue registrado por una navegación previa,
    // marcamos el script como cargado para que se renderice el <tableau-viz>
    if (typeof window !== "undefined") {
      // customElements.get devuelve el constructor si el custom element ya está definido
      if ((window as any).customElements?.get?.("tableau-viz")) {
        setIsScriptLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!isScriptLoaded || !vizRef.current) return;

    // Aquí puedes agregar event listeners para interactuar con el dashboard
    const viz = vizRef.current;

    const handleFirstInteractive = () => {
      console.log("Dashboard de Tableau cargado e interactivo");
      // Aquí puedes agregar lógica adicional, como aplicar filtros
    };

    viz.addEventListener("firstinteractive", handleFirstInteractive);

    return () => {
      viz.removeEventListener("firstinteractive", handleFirstInteractive);
    };
  }, [isScriptLoaded]);

  return (
    <>
      {/* Cargar la Tableau Embedding API v3 */}
      <Script
        type="module"
        src="https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js"
        // onReady también se dispara si el script ya fue cargado previamente,
        // lo cual resuelve el caso de navegación cliente donde onLoad no se dispara.
        onReady={() => setIsScriptLoaded(true)}
        onLoad={() => setIsScriptLoaded(true)}
        strategy="afterInteractive"
      />

      <div className="w-full h-screen overflow-hidden">
        <Card className="w-full h-full overflow-hidden shadow-lg border-0">
          <div className="relative w-full h-full">
            {isScriptLoaded ? (
              // @ts-expect-error - tableau-viz is a web component loaded by the Tableau Embedding API v3
              <tableau-viz
                id="tableauViz"
                style={{ width: "100%", height: "100%" }}
                ref={vizRef}
                src={tableauUrl}
                width="100%"
                height="100%"
                toolbar="bottom"
                hide-tabs={false}
                device="default"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-gray-500">
                  Cargando dashboard de Tableau...
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
