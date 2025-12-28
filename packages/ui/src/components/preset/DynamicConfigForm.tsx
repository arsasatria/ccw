import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';

// 类型定义
interface InputOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  disabled?: boolean;
}

interface DynamicOptions {
  type: 'static' | 'providers' | 'models' | 'custom';
  options?: InputOption[];
  providerField?: string;
}

interface Condition {
  field: string;
  operator?: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  value?: any;
}

interface RequiredInput {
  id: string;
  type?: 'password' | 'input' | 'select' | 'multiselect' | 'confirm' | 'editor' | 'number';
  label?: string;
  prompt?: string;
  placeholder?: string;
  options?: InputOption[] | DynamicOptions;
  when?: Condition | Condition[];
  defaultValue?: any;
  required?: boolean;
  validator?: RegExp | string | ((value: any) => boolean | string);
  min?: number;
  max?: number;
  rows?: number;
  dependsOn?: string[];
}

interface PresetConfigSection {
  Providers?: Array<{
    name: string;
    api_base_url?: string;
    models?: string[];
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface DynamicConfigFormProps {
  schema: RequiredInput[];
  presetConfig: PresetConfigSection;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  initialValues?: Record<string, any>;
}

export function DynamicConfigForm({
  schema,
  presetConfig,
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialValues = {},
}: DynamicConfigFormProps) {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());

  // 计算可见字段
  useEffect(() => {
    const updateVisibility = () => {
      const visible = new Set<string>();

      for (const field of schema) {
        if (shouldShowField(field, values)) {
          visible.add(field.id);
        }
      }

      setVisibleFields(visible);
    };

    updateVisibility();
  }, [values, schema]);

  // 评估条件
  const evaluateCondition = (condition: Condition): boolean => {
    const actualValue = values[condition.field];

    if (condition.operator === 'exists') {
      return actualValue !== undefined && actualValue !== null;
    }

    if (condition.operator === 'in') {
      return Array.isArray(condition.value) && condition.value.includes(actualValue);
    }

    if (condition.operator === 'nin') {
      return Array.isArray(condition.value) && !condition.value.includes(actualValue);
    }

    switch (condition.operator) {
      case 'eq':
        return actualValue === condition.value;
      case 'ne':
        return actualValue !== condition.value;
      case 'gt':
        return actualValue > condition.value;
      case 'lt':
        return actualValue < condition.value;
      case 'gte':
        return actualValue >= condition.value;
      case 'lte':
        return actualValue <= condition.value;
      default:
        return actualValue === condition.value;
    }
  };

  // 判断字段是否应该显示
  const shouldShowField = (field: RequiredInput): boolean => {
    if (!field.when) {
      return true;
    }

    const conditions = Array.isArray(field.when) ? field.when : [field.when];
    return conditions.every(condition => evaluateCondition(condition));
  };

  // 获取选项列表
  const getOptions = (field: RequiredInput): InputOption[] => {
    if (!field.options) {
      return [];
    }

    const options = field.options as any;

    if (Array.isArray(options)) {
      return options as InputOption[];
    }

    if (options.type === 'static') {
      return options.options || [];
    }

    if (options.type === 'providers') {
      const providers = presetConfig.Providers || [];
      return providers.map((p) => ({
        label: p.name || p.id || String(p),
        value: p.name || p.id || String(p),
        description: p.api_base_url,
      }));
    }

    if (options.type === 'models') {
      const providerField = options.providerField;
      if (!providerField) {
        return [];
      }

      const providerId = String(providerField).replace(/^{{(.+)}}$/, '$1');
      const selectedProvider = values[providerId];

      if (!selectedProvider || !presetConfig.Providers) {
        return [];
      }

      const provider = presetConfig.Providers.find(
        (p) => p.name === selectedProvider || p.id === selectedProvider
      );

      if (!provider || !provider.models) {
        return [];
      }

      return provider.models.map((model: string) => ({
        label: model,
        value: model,
      }));
    }

    return [];
  };

  // 更新字段值
  const updateValue = (fieldId: string, value: any) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
    // 清除该字段的错误
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[fieldId];
      return newErrors;
    });
  };

  // 验证单个字段
  const validateField = (field: RequiredInput): string | null => {
    const value = values[field.id];

    // 检查必填
    if (field.required !== false && (value === undefined || value === null || value === '')) {
      return `${field.label || field.id} is required`;
    }

    if (!value && field.required === false) {
      return null;
    }

    // 类型检查
    if (field.type === 'number' && isNaN(Number(value))) {
      return `${field.label || field.id} must be a number`;
    }

    if (field.type === 'number') {
      const numValue = Number(value);
      if (field.min !== undefined && numValue < field.min) {
        return `${field.label || field.id} must be at least ${field.min}`;
      }
      if (field.max !== undefined && numValue > field.max) {
        return `${field.label || field.id} must be at most ${field.max}`;
      }
    }

    // 自定义验证器
    if (field.validator) {
      if (field.validator instanceof RegExp) {
        if (!field.validator.test(String(value))) {
          return `${field.label || field.id} format is invalid`;
        }
      } else if (typeof field.validator === 'string') {
        const regex = new RegExp(field.validator);
        if (!regex.test(String(value))) {
          return `${field.label || field.id} format is invalid`;
        }
      }
    }

    return null;
  };

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 验证所有可见字段
    const newErrors: Record<string, string> = {};

    for (const field of schema) {
      if (!visibleFields.has(field.id)) {
        continue;
      }

      const error = validateField(field);
      if (error) {
        newErrors[field.id] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {schema.map((field) => {
        if (!visibleFields.has(field.id)) {
          return null;
        }

        const label = field.label || field.id;
        const prompt = field.prompt;
        const error = errors[field.id];

        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`field-${field.id}`}>
              {label}
              {field.required !== false && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {prompt && (
              <p className="text-sm text-gray-600">{prompt}</p>
            )}

            {/* Password / Input */}
            {(field.type === 'password' || field.type === 'input' || !field.type) && (
              <Input
                id={`field-${field.id}`}
                type={field.type === 'password' ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e) => updateValue(field.id, e.target.value)}
                disabled={isSubmitting}
              />
            )}

            {/* Number */}
            {field.type === 'number' && (
              <Input
                id={`field-${field.id}`}
                type="number"
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e) => updateValue(field.id, Number(e.target.value))}
                min={field.min}
                max={field.max}
                disabled={isSubmitting}
              />
            )}

            {/* Select */}
            {field.type === 'select' && (
              <Select
                value={values[field.id] || ''}
                onValueChange={(value) => updateValue(field.id, value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id={`field-${field.id}`}>
                  <SelectValue placeholder={field.placeholder || `Select ${label}`} />
                </SelectTrigger>
                <SelectContent>
                  {getOptions(field).map((option) => (
                    <SelectItem
                      key={String(option.value)}
                      value={String(option.value)}
                      disabled={option.disabled}
                    >
                      <div>
                        <div>{option.label}</div>
                        {option.description && (
                          <div className="text-xs text-gray-500">{option.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Multiselect */}
            {field.type === 'multiselect' && (
              <div className="space-y-2">
                {getOptions(field).map((option) => (
                  <div key={String(option.value)} className="flex items-center space-x-2">
                    <Checkbox
                      id={`field-${field.id}-${option.value}`}
                      checked={Array.isArray(values[field.id]) && values[field.id].includes(option.value)}
                      onCheckedChange={(checked) => {
                        const current = Array.isArray(values[field.id]) ? values[field.id] : [];
                        if (checked) {
                          updateValue(field.id, [...current, option.value]);
                        } else {
                          updateValue(field.id, current.filter((v: any) => v !== option.value));
                        }
                      }}
                      disabled={isSubmitting || option.disabled}
                    />
                    <Label
                      htmlFor={`field-${field.id}-${option.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {option.label}
                      {option.description && (
                        <span className="text-gray-500 ml-2">{option.description}</span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {/* Confirm */}
            {field.type === 'confirm' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`field-${field.id}`}
                  checked={values[field.id] || false}
                  onCheckedChange={(checked) => updateValue(field.id, checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor={`field-${field.id}`} className="text-sm font-normal cursor-pointer">
                  {field.prompt || label}
                </Label>
              </div>
            )}

            {/* Editor */}
            {field.type === 'editor' && (
              <Textarea
                id={`field-${field.id}`}
                placeholder={field.placeholder}
                value={values[field.id] || ''}
                onChange={(e) => updateValue(field.id, e.target.value)}
                rows={field.rows || 5}
                disabled={isSubmitting}
              />
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>
        );
      })}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Apply
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
