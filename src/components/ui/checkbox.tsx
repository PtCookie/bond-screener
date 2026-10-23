import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "@phosphor-icons/react";

import { cn } from "cn";

// A 16px square: `control-strong` when off, `primary` with a `primary-foreground` check when on. Put the Label
// to its right and dim the whole row when disabled.
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-testid="checkbox"
      className={cn(
        "peer bg-control-strong text-primary-foreground focus-visible:outline-ring aria-invalid:border-invalid-border aria-invalid:ring-invalid-ring data-checked:border-primary data-checked:bg-primary relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        data-testid="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
