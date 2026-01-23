import { Button } from "@/components/ui/button";
import { Play, Settings, Save, Undo2, Redo2, Users } from "lucide-react";
import ETLEditor from "@/components/etl/etl-editor";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

export const dynamic = "force-dynamic";

export default function ETLPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-4">
      {/* Secondary toolbar */}
      <div className="w-full border rounded-full bg-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="inline-flex items-center gap-2">
            <div className="h-5 w-9 rounded-full bg-emerald-200 relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 h-4 w-4 rounded-full bg-white shadow" />
            </div>
          </div>
          <Save className="h-4 w-4" />
          <Undo2 className="h-4 w-4" />
          <Redo2 className="h-4 w-4" />
          <Settings className="h-4 w-4" />
        </div>
        <div className="text-gray-600 text-sm">
          Dashboards /{" "}
          <span className="font-medium text-gray-900">Empleados DHL</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600 inline-flex items-center gap-2">
            <Users className="h-4 w-4" /> 3 personas
          </div>
          <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white h-8 px-4 text-sm inline-flex items-center gap-2">
            <Play className="h-4 w-4" /> Ejecutar
          </Button>
          <button className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <Settings className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Editor with drag & drop canvas */}
      <ETLEditor />
    </div>
  );
}