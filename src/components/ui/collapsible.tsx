import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "cn";

// A header row with a ghost icon button that shows or hides the content below it. The trigger is the button
// (`render={<Button variant="ghost" size="icon-sm" />}` with a caret inside); its icon turns 180° when open.
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" data-testid="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      data-testid="collapsible-trigger"
      className={cn(
        "[&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:ease-out data-panel-open:[&>svg]:rotate-180",
        className,
      )}
      {...props}
    />
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" data-testid="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
