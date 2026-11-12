import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Droplets, Flame, Leaf, Trees, Waves } from "lucide-react";
import { cn } from "@/utils/cn";
import { sfx } from "@/lib/sound";
import type { Category, Status } from "@/data/places";

export const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
export const softSpring = { type: "spring", stiffness: 240, damping: 28 } as const;
export const appleEase = [0.32, 0.72, 0, 1] as const;

export const CATEGORY: Record<Category, { icon: LucideIcon; color: string }> = {
  Water: { icon: Droplets, color: "#64d2ff" },
  Forest: { icon: Trees, color: "#30d158" },
  Fire: { icon: Flame, color: "#ff9f0a" },
  Flood: { icon: Waves, color: "#5e5ce6" },
  Wetland: { icon: Leaf, color: "#66d4cf" },
};

export const STATUS_COLOR: Record<Status, string> = {
  Critical: "#ff453a",
  Watching: "#ff9f0a",
  Recovering: "#30d158",
  Stable: "#8e8e93",
};

export const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

/* ------------------------------- Pressable ------------------------------- */
type PressableProps = HTMLMotionProps<"button"> & { pressScale?: number };
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { pressScale = 0.95, className, children, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: pressScale }}
      transition={spring}
      className={cn("select-none outline-none focus-visible:ring-2 focus-visible:ring-ios-blue/70", className)}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

/* -------------------------------- Tooltip -------------------------------- */
export function Tooltip({
  label,
  children,
  side = "bottom",
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  side?: "bottom" | "top" | "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useRef<number | undefined>(undefined);
  if (!label) return <>{children}</>;
  const pos = {
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2.5 top-1/2 -translate-y-1/2",
    right: "left-full ml-2.5 top-1/2 -translate-y-1/2",
  }[side];
  const offset = { bottom: { y: -4 }, top: { y: 4 }, left: { x: 4 }, right: { x: -4 } }[side];
  return (
    <span
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => {
        window.clearTimeout(t.current);
        t.current = window.setTimeout(() => setOpen(true), 450);
      }}
      onPointerLeave={() => {
        window.clearTimeout(t.current);
        setOpen(false);
      }}
      onPointerDown={() => {
        window.clearTimeout(t.current);
        setOpen(false);
      }}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9, ...offset }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
            transition={spring}
            className={cn(
              "pointer-events-none absolute z-[80] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white glass-strong",
              pos
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------ IconButton ------------------------------- */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  size = "md",
  variant = "glass",
  active,
  badge,
  tooltipSide = "bottom",
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "glass" | "plain" | "solid";
  active?: boolean;
  badge?: number;
  tooltipSide?: "bottom" | "top" | "left" | "right";
  className?: string;
  iconClassName?: string;
}) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const iconSize = size === "sm" ? 15 : size === "lg" ? 20 : 17;
  return (
    <Tooltip label={label} side={tooltipSide}>
      <Pressable
        onClick={onClick}
        aria-label={label}
        initial="rest"
        whileHover="hover"
        className={cn(
          "relative grid place-items-center rounded-full transition-colors duration-200",
          variant === "glass" && "glass liquid text-white/85 hover:text-white",
          variant === "plain" && "text-white/65 hover:bg-white/10 hover:text-white",
          variant === "solid" && "bg-white/10 text-white hover:bg-white/15",
          active && "!bg-white !text-black",
          dims,
          className
        )}
      >
        <motion.span
          variants={{ hover: { scale: 1.14, y: -1 }, rest: { scale: 1, y: 0 } }}
          transition={{ type: "spring", stiffness: 520, damping: 18 }}
          className="grid place-items-center"
        >
          {/* Re-keyed per glyph so swaps (bookmark → check, play → pause) spring in. */}
          <motion.span
            key={Icon.displayName ?? label}
            initial={{ scale: 0.4, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 560, damping: 17 }}
            className="grid place-items-center"
          >
            <Icon size={iconSize} strokeWidth={2} className={iconClassName} />
          </motion.span>
        </motion.span>
        <AnimatePresence>
          {badge ? (
            <motion.span
              key={badge}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 18 }}
              className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ios-red px-1 text-[10.5px] font-bold text-white ring-2 ring-black"
            >
              {badge}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </Pressable>
    </Tooltip>
  );
}

/* --------------------------------- Button -------------------------------- */
type ButtonProps = HTMLMotionProps<"button"> & {
  icon?: LucideIcon;
  variant?: "primary" | "tinted" | "glass" | "plain" | "blue";
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
};
export function Button({ icon: Icon, variant = "glass", size = "md", className, children, onClick, ...rest }: ButtonProps) {
  const v = {
    primary: "btn-sheen bg-white text-black hover:bg-white/90",
    tinted: "bg-ios-blue/15 text-[#4aa3ff] hover:bg-ios-blue/25",
    glass: "glass liquid text-white hover:bg-white/[0.08]",
    plain: "text-white/75 hover:text-white hover:bg-white/[0.08]",
    blue: "btn-sheen bg-ios-blue text-white hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(10,132,255,0.7)]",
  }[variant];
  const s = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5",
    md: "h-10 px-4 text-[13.5px] gap-2",
    lg: "h-12 px-5 text-[15px] gap-2",
  }[size];
  return (
    <Pressable
      initial="rest"
      animate="rest"
      whileHover="hover"
      onClick={(e) => {
        if (variant === "primary" || variant === "blue") sfx.press();
        else sfx.tap();
        onClick?.(e);
      }}
      className={cn("group/btn relative inline-flex items-center justify-center overflow-hidden rounded-full font-semibold transition-[background,filter,color] duration-200", v, s, className)}
      {...rest}
    >
      {Icon && (
        <motion.span
          key={Icon.displayName}
          initial={{ scale: 0.5, rotate: -20 }}
          variants={{ rest: { scale: 1, rotate: 0 }, hover: { scale: 1.12, rotate: -6 } }}
          transition={{ type: "spring", stiffness: 500, damping: 16 }}
          className="grid place-items-center"
        >
          <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} />
        </motion.span>
      )}
      {children}
    </Pressable>
  );
}

/* --------------------------- Segmented control --------------------------- */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { value: T; label?: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex items-center rounded-full bg-white/[0.07] p-[3px] ring-1 ring-inset ring-white/[0.06]",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) sfx.tick();
              onChange(o.value);
            }}
            className={cn(
              "relative z-0 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors duration-200",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]",
              active ? "text-white" : "text-white/50 hover:text-white/85"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-white/[0.17] shadow-[0_1px_3px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]"
                transition={spring}
              />
            )}
            <motion.span
              key={active ? "on" : "off"}
              initial={active ? { scale: 0.86, y: 2 } : false}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 560, damping: 20 }}
              className="flex items-center gap-1.5"
            >
              {Icon && <Icon size={size === "sm" ? 13 : 14} strokeWidth={2.2} />}
              {o.label}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Switch -------------------------------- */
export function Switch({
  checked,
  onChange,
  tone = "#30d158",
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: string;
  label?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        if (checked) sfx.switchOff();
        else sfx.switchOn();
        onChange(!checked);
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ease-apple"
      style={{ background: checked ? tone : "rgba(120,120,128,0.36)" }}
    >
      <motion.span
        className="absolute top-[2px] grid h-[27px] place-items-center rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.18),0_3px_1px_rgba(0,0,0,0.06)]"
        initial={false}
        animate={{ width: pressed ? 33 : 27, left: checked ? (pressed ? 16 : 22) : 2 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className="overflow-visible">
          <motion.path
            d="M2.5 6.3l2.3 2.3L9.6 3.8"
            fill="none"
            stroke={tone}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: checked ? 0.08 : 0 }}
          />
        </svg>
      </motion.span>
    </button>
  );
}

/* ---------------------------------- Bits --------------------------------- */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-white/[0.09] px-1.5 font-sans text-[11px] font-medium text-white/55 ring-1 ring-inset ring-white/10",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold", className)}
      // Dark base under the tint keeps the label legible over bright imagery.
      style={{ color: c, background: `color-mix(in srgb, ${c} 22%, rgba(0,0,0,0.62))` }}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "Critical" && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: c }} />}
        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      </span>
      {status}
    </span>
  );
}

export function CategoryIcon({ category, size = 32, className }: { category: Category; size?: number; className?: string }) {
  const m = CATEGORY[category];
  const Icon = m.icon;
  return (
    <span
      className={cn("grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(180deg, ${m.color}, color-mix(in srgb, ${m.color} 62%, #000))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 16px -6px ${m.color}`,
      }}
    >
      <Icon size={size * 0.52} color="#fff" strokeWidth={2.3} />
    </span>
  );
}

export function ChangePill({ value, goodWhenUp, decimals = 0, className }: { value: number; goodWhenUp: boolean; decimals?: number; className?: string }) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  const c = good ? "#30d158" : "#ff453a";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-[3px] text-[11.5px] font-semibold tabular-nums", className)} style={{ color: c, background: `${c}1c` }}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(decimals)}%
    </span>
  );
}

export const goodWhenUp = (c: Category) => c === "Water" || c === "Forest" || c === "Wetland";

/* -------------------------------- Popover -------------------------------- */
/** Collapsed clip shapes, anchored at the corner the popover grows from. */
const CLIP_FROM = {
  left: "inset(0% 88% 90% 0% round 20px)",
  right: "inset(0% 0% 90% 88% round 20px)",
  center: "inset(0% 44% 90% 44% round 20px)",
} as const;
export function Popover({
  open,
  onClose,
  children,
  className,
  align = "left",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onPointerDown={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -6, filter: "blur(6px)", clipPath: CLIP_FROM[align] }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              filter: "blur(0px)",
              clipPath: "inset(0% 0% 0% 0% round 20px)",
              transitionEnd: { filter: "none", clipPath: "none" },
            }}
            exit={{ opacity: 0, scale: 0.96, y: -4, filter: "blur(4px)", clipPath: CLIP_FROM[align], transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            style={{ transformOrigin: align === "right" ? "top right" : align === "center" ? "top center" : "top left" }}
            className={cn(
              "absolute top-full z-[71] mt-2 rounded-[20px] p-2 glass-strong",
              align === "right" && "right-0",
              align === "left" && "left-0",
              align === "center" && "left-1/2 -translate-x-1/2",
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function SectionHeader({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between px-1", className)}>
      <h2 className="text-[19px] font-bold tracking-tight text-white">{title}</h2>
      {action}
    </div>
  );
}
