import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "cn";
// Both files are installed into the same folder, so a relative import works in every project.
import { toggleVariants } from "./toggle";

type ToggleGroupContextValue = Pick<VariantProps<typeof toggleVariants>, "variant" | "size">;

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({ variant: "outline", size: "default" });

// Joined Toggles for one choice (or several) out of a short set. The items share hairlines; the selected
// item fills `muted`. A single-select group keeps one item on, so pass a `defaultValue` or `value`.
function ToggleGroup({
  className,
  variant = "outline",
  size = "default",
  children,
  ...props
}: ToggleGroupPrimitive.Props & ToggleGroupContextValue) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-testid="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn("inline-flex w-fit flex-row items-center", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({ className, children, ...props }: TogglePrimitive.Props) {
  const { variant, size } = React.useContext(ToggleGroupContext);
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-testid="toggle-group-item"
      className={cn(toggleVariants({ variant, size, grouped: true }), className)}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
