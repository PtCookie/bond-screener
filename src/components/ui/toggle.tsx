import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "cn";

// A two-state button: off is transparent with `muted-foreground` content, on fills `muted` with `foreground`.
// `grouped` is set by ToggleGroup: items share hairlines and only the outer corners are rounded.
const toggleVariants = cva(
  "text-muted-foreground hover:bg-muted-hover hover:text-foreground focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground inline-flex cursor-pointer items-center justify-center gap-2 border font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-transparent bg-transparent",
        outline: "border-input bg-transparent",
      },
      size: {
        default: "h-(--control-md) min-w-(--control-md) px-3 text-sm",
        sm: "h-(--control-sm) min-w-(--control-sm) px-3 text-sm",
        lg: "h-(--control-lg) min-w-(--control-lg) px-4 text-sm",
      },
      grouped: {
        false: "rounded-lg",
        true: "rounded-none not-first:-ml-px first:rounded-l-lg last:rounded-r-lg focus-visible:z-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      grouped: false,
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  grouped,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-testid="toggle"
      className={cn(toggleVariants({ variant, size, grouped, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
