import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium text-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
