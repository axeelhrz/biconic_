"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type DashboardImageConfig,
  IMAGE_HORIZONTAL_ALIGN_OPTIONS,
  IMAGE_OBJECT_FIT_OPTIONS,
  IMAGE_SIZE_PRESET_OPTIONS,
  IMAGE_VERTICAL_ALIGN_OPTIONS,
} from "@/lib/dashboard/imageLayout";

type ImageConfigFieldsProps = {
  config?: DashboardImageConfig;
  onChange: (patch: DashboardImageConfig) => void;
  labelClassName?: string;
  inputClassName?: string;
  selectClassName?: string;
};

export function ImageConfigFields({
  config,
  onChange,
  labelClassName = "text-xs font-medium text-[var(--platform-fg-muted)]",
  inputClassName = "mt-1 border-[var(--platform-border)] text-sm",
  selectClassName = "mt-1.5 h-9 w-full rounded-lg border border-[var(--platform-border)] bg-[var(--platform-bg)] px-3 text-sm",
}: ImageConfigFieldsProps) {
  const preserve = config?.preserveAspectRatio !== false;
  const isCustom = config?.sizePreset === "custom";

  const patch = (partial: Partial<DashboardImageConfig>) =>
    onChange({ ...config, ...partial });

  return (
    <div className="space-y-3">
      <div>
        <Label className={labelClassName}>Tamaño</Label>
        <select
          className={selectClassName}
          value={config?.sizePreset ?? "medium"}
          onChange={(e) =>
            patch({
              sizePreset: e.target.value as DashboardImageConfig["sizePreset"],
            })
          }
        >
          {IMAGE_SIZE_PRESET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {config?.sizePreset && config.sizePreset !== "custom" && (
        <div>
          <Label className={labelClassName}>Ancho máximo (% del contenedor)</Label>
          <Input
            type="number"
            min={10}
            max={100}
            value={config?.maxWidthPercent ?? ""}
            onChange={(e) =>
              patch({
                maxWidthPercent:
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
              })
            }
            placeholder="Automático según tamaño"
            className={inputClassName}
          />
        </div>
      )}

      {isCustom && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className={labelClassName}>Ancho (px)</Label>
            <Input
              type="number"
              min={0}
              value={config?.width ?? ""}
              onChange={(e) =>
                patch({
                  width: e.target.value === "" ? undefined : e.target.valueAsNumber,
                })
              }
              className={inputClassName}
            />
          </div>
          <div>
            <Label className={labelClassName}>Alto (px)</Label>
            <Input
              type="number"
              min={0}
              value={config?.height ?? ""}
              onChange={(e) =>
                patch({
                  height: e.target.value === "" ? undefined : e.target.valueAsNumber,
                })
              }
              className={inputClassName}
            />
          </div>
        </div>
      )}

      <div>
        <Label className={labelClassName}>Posición vertical</Label>
        <select
          className={selectClassName}
          value={config?.verticalAlign ?? "center"}
          onChange={(e) =>
            patch({
              verticalAlign: e.target.value as DashboardImageConfig["verticalAlign"],
            })
          }
        >
          {IMAGE_VERTICAL_ALIGN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label className={labelClassName}>Posición horizontal</Label>
        <select
          className={selectClassName}
          value={config?.horizontalAlign ?? "center"}
          onChange={(e) =>
            patch({
              horizontalAlign: e.target.value as DashboardImageConfig["horizontalAlign"],
            })
          }
        >
          {IMAGE_HORIZONTAL_ALIGN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="preserve-aspect-ratio"
          checked={preserve}
          onCheckedChange={(c) =>
            patch({
              preserveAspectRatio: c === true,
              ...(c === true ? { objectFit: "contain" as const } : {}),
            })
          }
        />
        <Label htmlFor="preserve-aspect-ratio" className={`${labelClassName} cursor-pointer`}>
          Mantener proporción (sin deformar)
        </Label>
      </div>

      {!preserve && (
        <div>
          <Label className={labelClassName}>Ajuste avanzado</Label>
          <select
            className={selectClassName}
            value={config?.objectFit ?? "contain"}
            onChange={(e) =>
              patch({
                objectFit: e.target.value as DashboardImageConfig["objectFit"],
              })
            }
          >
            {IMAGE_OBJECT_FIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label className={labelClassName}>Opacidad (0–1)</Label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={config?.opacity ?? 1}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            patch({
              opacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1,
            });
          }}
          className={inputClassName}
        />
      </div>
    </div>
  );
}
