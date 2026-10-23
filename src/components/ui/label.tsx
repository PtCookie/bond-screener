import * as React from "react";

import { cn } from "cn";

// The visible name of a control: 14px medium at line-height 1. It dims with a disabled control.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      data-testid="label"
      className={cn(
        "text-foreground flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
