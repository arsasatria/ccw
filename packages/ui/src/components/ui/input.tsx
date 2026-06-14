import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const isNumeric = type === "number";
    const [tempValue, setTempValue] = React.useState(props.value?.toString() || "");

    React.useEffect(() => {
      if (props.value !== undefined) {
        setTempValue(props.value.toString());
      }
    }, [props.value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (isNumeric) {
        if (newValue === "" || /^\d+$/.test(newValue)) {
          setTempValue(newValue);
          if (props.onChange && newValue !== "") {
            props.onChange(e);
          }
        }
      } else {
        setTempValue(newValue);
        if (props.onChange) {
          props.onChange(e);
        }
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (isNumeric && tempValue === "") {
        const defaultValue = props.placeholder || "1";
        setTempValue(defaultValue);

        if (props.onChange) {
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: defaultValue },
          } as React.ChangeEvent<HTMLInputElement>;

          props.onChange(syntheticEvent);
        }
      }

      if (props.onBlur) {
        props.onBlur(e);
      }
    };

    const inputType = isNumeric ? "text" : type;
    const inputValue = isNumeric ? tempValue : props.value;

    return (
      <input
        {...props}
        type={inputType}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "flex h-9 w-full rounded-sm border border-line bg-surface-2 px-3 py-1 text-[13px] text-ink",
          "placeholder:text-ink-subtle",
          "focus:bg-surface focus:border-line-strong",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-paper",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className
        )}
        ref={ref}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
