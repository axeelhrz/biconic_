// components/SyncSettings.tsx
import { Database, FileText } from "lucide-react";
import SyncItem, { type SyncItemProps } from "./ConnectionsSyncItem"; // Importamos el tipo junto al componente

const ConnectionsSyncSettings = () => {
  // Tipamos nuestro array para asegurarnos de que cada objeto
  // cumpla con la estructura definida en SyncItemProps.
  const syncOptions: SyncItemProps[] = [
    {
      icon: <Database size={24} />,
      title: "Bases de Datos Principal",
      subtitle: "Sincronización automática",
    },
    {
      icon: <FileText size={24} />,
      title: "Datos de Ventas",
      subtitle: "Sincronización automática",
    },
  ];

  return (
    <div className="w-full mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Programación de Sincronización
      </h2>
      <div className="flex flex-col gap-4">
        {syncOptions.map((option) => (
          <SyncItem
            key={option.title} // Usar una propiedad única como 'title' para la key es mejor que el index
            icon={option.icon}
            title={option.title}
            subtitle={option.subtitle}
          />
        ))}
      </div>
    </div>
  );
};

export default ConnectionsSyncSettings;
