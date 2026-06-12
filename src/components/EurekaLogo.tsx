import { cn } from "@/lib/utils";

export function EurekaLogo({ size = "md", className }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = {
    sm: "text-xl",
    md: "text-3xl",
    lg: "text-5xl sm:text-6xl",
    xl: "text-6xl sm:text-8xl",
  };
  return (
    <div className={cn("inline-flex items-center gap-2 font-black tracking-tighter", sizes[size], className)}>
      <span className="text-foreground">EUR</span>
      <span className="neon-text">EKA</span>
      <span className="text-foreground">·</span>
      <span className="text-foreground/60 text-[0.5em] font-bold tracking-[0.3em] uppercase">Rocket</span>
    </div>
  );
}
