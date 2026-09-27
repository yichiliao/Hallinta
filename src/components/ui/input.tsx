import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus-visible:border-stone-500 focus-visible:ring-2 focus-visible:ring-stone-200 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
