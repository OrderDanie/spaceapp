import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";

/** Scroll container with an iOS-style large title that collapses into a compact bar. */
export function ViewScroll({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const { scrollY } = useScroll({ container: ref });
  const titleOpacity = useTransform(scrollY, [0, 70], [1, 0]);
  const titleScale = useTransform(scrollY, [0, 70], [1, 0.94]);
  const titleY = useTransform(scrollY, [0, 70], [0, -6]);
  const barOpacity = useTransform(scrollY, [50, 90], [0, 1]);
  const barTitleY = useTransform(scrollY, [50, 90], [8, 0]);

  const padL = sidebarOpen ? "lg:pl-[300px]" : "lg:pl-10";

  return (
    <div ref={ref} className="scroll-area absolute inset-0 overflow-y-auto overflow-x-hidden">
      <motion.div style={{ opacity: barOpacity }} className="pointer-events-none sticky top-0 z-[35] -mb-[72px] h-[72px]">
        <div className="glass-bar absolute inset-0 border-b border-white/[0.06]" />
        <div className={cn("relative flex h-full items-center px-5 transition-[padding] duration-500 ease-apple sm:px-8", padL)}>
          <motion.span style={{ y: barTitleY }} className="text-[17px] font-semibold tracking-tight">
            {title}
          </motion.span>
        </div>
      </motion.div>

      <div className={cn("px-4 pb-32 pt-20 transition-[padding] duration-500 ease-apple sm:px-8 lg:pb-16 lg:pr-8", padL, className)}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <motion.div style={{ opacity: titleOpacity, scale: titleScale, y: titleY, transformOrigin: "left bottom" }}>
            {eyebrow && <div className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-white/40">{eyebrow}</div>}
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">{title}</h1>
            {subtitle && <div className="mt-1.5 text-[15px] text-white/50">{subtitle}</div>}
          </motion.div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}
