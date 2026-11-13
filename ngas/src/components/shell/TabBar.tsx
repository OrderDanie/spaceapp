import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useApp, useUnreadCount } from "@/store";
import { spring } from "@/components/ui/primitives";
import { NAV_ITEMS } from "./Sidebar";

/** Floating Liquid-Glass tab bar for compact widths. */
export function TabBar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const unread = useUnreadCount();
  return (
    <nav aria-label="Main navigation" className="mobile-tabbar absolute inset-x-3 bottom-3 z-40 flex h-[64px] items-center rounded-[32px] px-1.5 glass liquid lg:hidden">
      {NAV_ITEMS.map((item) => {
        const active = view === item.id;
        const Icon = item.icon;
        return (
          <motion.button
            key={item.id}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            whileTap={{ scale: 0.9 }}
            onClick={() => setView(item.id)}
            animate={{ flex: active ? 1.9 : 1 }}
            transition={spring}
            className="relative flex h-[54px] min-w-0 items-center justify-center gap-1.5 rounded-[27px] px-1"
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-[27px] bg-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_5px_16px_-8px_rgba(0,0,0,0.7)]"
                transition={spring}
              />
            )}
            <motion.span
              key={active ? "a" : "i"}
              initial={active ? { scale: 0.6, y: 3 } : false}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 15 }}
              className="relative shrink-0"
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? "text-[#4aa3ff]" : "text-white/70"} />
            </motion.span>
            <AnimatePresence initial={false}>
              {active && (
                <motion.span
                  initial={{ opacity: 0, width: 0, x: -5 }}
                  animate={{ opacity: 1, width: "auto", x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -4 }}
                  transition={spring}
                  className={cn("relative overflow-hidden whitespace-nowrap text-[11px] font-semibold text-[#4aa3ff]")}
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            {item.id === "alerts" && unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute right-[22%] top-2 h-2 w-2 rounded-full bg-ios-red ring-2 ring-black/60"
              />
            )}
          </motion.button>
        );
      })}
    </nav>
  );
}
