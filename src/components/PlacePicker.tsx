import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { useApp } from "@/store";
import { PLACES, placeById } from "@/data/places";
import { CategoryIcon, Popover, Pressable } from "@/components/ui/primitives";

export function PlacePicker() {
  const placeId = useApp((s) => s.placeId);
  const selectPlace = useApp((s) => s.selectPlace);
  const [open, setOpen] = useState(false);
  const p = placeById(placeId);
  return (
    <div className="relative">
      <Pressable onClick={() => setOpen((o) => !o)} className="flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-3.5 glass liquid">
        <CategoryIcon category={p.category} size={32} />
        <span className="text-left leading-tight">
          <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-white/45">Place</span>
          <span className="block max-w-[150px] truncate text-[13.5px] font-semibold">{p.name}</span>
        </span>
        <ChevronDown size={15} className={cn("text-white/45 transition-transform duration-300", open && "rotate-180")} />
      </Pressable>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[300px] p-1.5">
        {PLACES.map((pl) => (
          <button
            key={pl.id}
            onClick={() => {
              selectPlace(pl.id);
              setOpen(false);
            }}
            className="relative flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]"
          >
            <CategoryIcon category={pl.category} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{pl.name}</span>
              <span className="block truncate text-[11.5px] text-white/45">{pl.region}</span>
            </span>
            {pl.id === placeId && <Check size={16} strokeWidth={2.6} className="text-[#4aa3ff]" />}
          </button>
        ))}
      </Popover>
    </div>
  );
}
