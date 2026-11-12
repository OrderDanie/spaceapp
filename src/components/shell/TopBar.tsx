import { AnimatePresence, motion } from "framer-motion";
import { Bell, PanelLeft, Search, Settings } from "lucide-react";
import { useApp, useUnreadCount } from "@/store";
import { IconButton, Kbd, Tooltip } from "@/components/ui/primitives";
import { AppIcon } from "./AppIcon";
import { PALETTE_MORPH_ID } from "./CommandPalette";
import { APP_ICON_MORPH_ID, morphLayout, useBrandMorphTarget, useSearchMorphTarget } from "@/hooks/useMorphTargets";

export function TopBar() {
  const view = useApp((s) => s.view);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const setPalette = useApp((s) => s.setPalette);
  const setSettings = useApp((s) => s.setSettings);
  const setView = useApp((s) => s.setView);
  const unread = useUnreadCount();
  const brand = useBrandMorphTarget();
  const search = useSearchMorphTarget();
  const paletteOpen = useApp((s) => s.paletteOpen); // see Sidebar: enables the snapshot

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setView("today")}
        aria-label="Epoch home"
        className="absolute left-3 top-3 z-40 flex h-10 items-center gap-2 rounded-full pl-1.5 pr-3 glass liquid sm:hidden"
      >
        <motion.span
          key={brand === "mobile" ? "brand-morph" : "brand"}
          layoutId={brand === "mobile" ? APP_ICON_MORPH_ID : undefined}
          transition={morphLayout}
          style={{ borderRadius: 6 }}
          className="block"
        >
          <AppIcon size={28} />
        </motion.span>
        <span className="hidden text-[13.5px] font-bold tracking-tight min-[360px]:inline">Epoch</span>
      </motion.button>

      <AnimatePresence>
        {!sidebarOpen && (
          <motion.div
            initial={{ opacity: 0, x: -16, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: -16, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute left-4 top-4 z-40 hidden items-center gap-2 lg:flex"
          >
            <IconButton icon={PanelLeft} label="Show sidebar" onClick={toggleSidebar} />
            <div className="flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 glass liquid">
              <motion.span
                key={brand === "topbar" ? "brand-morph" : "brand"}
                layoutId={brand === "topbar" ? APP_ICON_MORPH_ID : undefined}
                transition={morphLayout}
                style={{ borderRadius: 6 }}
                className="block"
              >
                <AppIcon size={28} />
              </motion.span>
              <span className="text-[14px] font-bold tracking-tight">Epoch</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute right-3 top-3 z-40 flex items-center gap-2 sm:right-4 sm:top-4">
        <motion.button
          key={search === "topbar" ? "search-morph" : "search"}
          layoutId={search === "topbar" ? PALETTE_MORPH_ID : undefined}
          data-palette-open={paletteOpen || undefined}
          style={{ borderRadius: 999 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setPalette(true)}
          className="group hidden h-10 items-center gap-2 rounded-full pl-3.5 pr-2 text-[13px] text-white/50 transition-colors glass liquid hover:text-white/80 xl:flex"
        >
          <Search size={15} className="transition-transform duration-300 ease-apple group-hover:scale-110 group-hover:-rotate-6" />
          <span className="w-40 text-left">Search places, layers…</span>
          <Kbd>⌘K</Kbd>
        </motion.button>
        <span className="hidden min-[360px]:inline-flex xl:hidden">
          <IconButton icon={Search} label="Search  ⌘K" onClick={() => setPalette(true)} />
        </span>
        <motion.span
          key={unread}
          className="hidden origin-top lg:inline-flex"
          initial={unread > 0 ? { rotate: 0 } : false}
          animate={unread > 0 ? { rotate: [0, -16, 12, -8, 4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut", delay: 0.2 }}
        >
          <IconButton icon={Bell} label="Alerts" badge={unread} active={view === "alerts"} onClick={() => setView("alerts")} />
        </motion.span>
        <span className="hidden sm:inline-flex">
          <IconButton icon={Settings} label="Settings  ⌘," onClick={() => setSettings(true)} />
        </span>
        <Tooltip label="Jordan Avery · Pro">
          <motion.button
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => setSettings(true)}
            className="hidden h-10 w-10 rounded-full bg-gradient-to-br from-ios-blue via-ios-purple to-ios-pink p-[2px] sm:block"
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-[#1c1c1e] text-[13px] font-bold">JA</span>
          </motion.button>
        </Tooltip>
        <Tooltip label="Settings">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setSettings(true)}
            aria-label="Settings"
            className="h-10 w-10 rounded-full bg-gradient-to-br from-ios-blue via-ios-purple to-ios-pink p-[2px] sm:hidden"
          >
            <span className="grid h-full w-full place-items-center rounded-full bg-[#1c1c1e] text-[12px] font-bold">JA</span>
          </motion.button>
        </Tooltip>
      </div>
    </>
  );
}
