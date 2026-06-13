import * as React from "react";
import { useTranslation } from "react-i18next";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showPreview?: boolean;
}

const getColorValue = (color: string): string => {
  if (color.startsWith("#")) {
    return color;
  }
  return "#000000";
};

export function ColorPicker({
  value = "",
  onChange,
  placeholder,
  showPreview = true,
}: ColorPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [customColor, setCustomColor] = React.useState("");

  React.useEffect(() => {
    if (value.startsWith("#")) {
      setCustomColor(value);
    } else {
      setCustomColor("");
    }
  }, [value]);

  const handleColorChange = (color: string) => {
    onChange(color);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      handleColorChange(color);
    }
  };

  const selectedColorValue = getColorValue(value);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-9",
              !value && "text-fg-subtle"
            )}
          >
            <div className="flex items-center gap-2 w-full">
              {showPreview && (
                <div
                  className="h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: selectedColorValue }}
                />
              )}
              <span className="truncate flex-1 font-mono text-xs">
                {value || placeholder || t("color_picker.placeholder")}
              </span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {t("color_picker.title")}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleColorChange("")}
              >
                {t("color_picker.clear")}
              </Button>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-md bg-surface-2">
              <div
                className="h-8 w-8 rounded border border-border"
                style={{ backgroundColor: selectedColorValue }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {value || t("color_picker.no_color_selected")}
                </div>
                {value && value.startsWith("#") && (
                  <div className="text-xs text-fg-subtle font-mono">
                    {value.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md overflow-hidden border border-border">
              <HexColorPicker
                color={selectedColorValue}
                onChange={handleColorChange}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("color_picker.custom_color")}
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={customColor}
                  onChange={handleCustomColorChange}
                  placeholder="#RRGGBB"
                  className="font-mono flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (customColor && /^#[0-9A-F]{6}$/i.test(customColor)) {
                      handleColorChange(customColor);
                      setOpen(false);
                    }
                  }}
                  disabled={!customColor || !/^#[0-9A-F]{6}$/i.test(customColor)}
                >
                  {t("color_picker.apply")}
                </Button>
              </div>
              <p className="text-xs text-fg-subtle">
                {t("color_picker.hex_input_help")}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
