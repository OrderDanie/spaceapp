import { useId, useMemo, useState } from "react";
import { globeTextureUrl } from "@/lib/gibs";
import { safeId } from "@/components/ui/primitives";

interface OrbitDef {
  rx: number;
  ry: number;
  rot: number;
  dur: number;
  begin: number;
  color: string;
  label: string;
}

function OrbitLayer({ which, W, H, orbits }: { which: "back" | "front"; W: number; H: number; orbits: OrbitDef[] }) {
  const id = safeId(useId());
  const cx = W / 2;
  const cy = H / 2;
  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {orbits.map((o, i) => {
        const d = `M ${cx - o.rx} ${cy} A ${o.rx} ${o.ry} 0 1 0 ${cx + o.rx} ${cy} A ${o.rx} ${o.ry} 0 1 0 ${cx - o.rx} ${cy}`;
        return (
          <g key={i} transform={`rotate(${o.rot} ${cx} ${cy})`}>
            {which === "front" && (
              <clipPath id={`oc${id}${i}`}>
                <rect x={-W} y={cy} width={W * 3} height={H * 2} />
              </clipPath>
            )}
            <g clipPath={which === "front" ? `url(#oc${id}${i})` : undefined}>
              <path
                d={d}
                fill="none"
                stroke={o.color}
                strokeOpacity={which === "front" ? 0.6 : 0.2}
                strokeWidth={which === "front" ? 1.3 : 1}
                strokeDasharray={which === "back" ? "2 5" : undefined}
              />
              <g>
                <circle r={9} fill={o.color} opacity={0.18} />
                <circle r={3.2} fill="#fff" style={{ filter: `drop-shadow(0 0 4px ${o.color})` }} />
                {which === "front" && (
                  <text x={9} y={-8} fill="white" fillOpacity={0.85} fontSize={10} fontWeight={600} style={{ letterSpacing: "-0.01em" }}>
                    {o.label}
                  </text>
                )}
                <animateMotion dur={`${o.dur}s`} begin={`${o.begin}s`} repeatCount="indefinite" path={d} />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Pseudo-3D rotating Earth (NASA Blue Marble) with decorative SVG orbits. */
export function GlobeCSS({ size = 220 }: { size?: number }) {
  const url = useMemo(() => globeTextureUrl(1024), []);
  const [loaded, setLoaded] = useState(false);
  const W = size * 1.75;
  const H = size * 1.32;
  const orbits: OrbitDef[] = [
    { rx: size * 0.8, ry: size * 0.2, rot: -16, dur: 13, begin: 0, color: "#64d2ff", label: "Terra" },
    { rx: size * 0.72, ry: size * 0.3, rot: 30, dur: 18, begin: -7, color: "#30d158", label: "NOAA-20" },
    { rx: size * 0.86, ry: size * 0.13, rot: 6, dur: 23, begin: -12, color: "#ff9f0a", label: "Landsat 9" },
  ];
  return (
    <div className="relative" style={{ width: W, height: H }}>
      <OrbitLayer which="back" W={W} H={H} orbits={orbits} />
      <div
        className="absolute rounded-full"
        style={{
          left: W / 2 - size / 2,
          top: H / 2 - size / 2,
          width: size,
          height: size,
          boxShadow: "0 0 50px 6px rgba(64,156,255,0.32), 0 0 140px 30px rgba(64,156,255,0.12)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#2b6fd6,#0b2a66_60%,#020814)]">
          <div
            className="absolute inset-y-0 left-0 flex animate-globe"
            style={{ width: size * 4, opacity: loaded ? 1 : 0, transition: "opacity 1.4s cubic-bezier(.32,.72,0,1)" }}
          >
            <img src={url} alt="" onLoad={() => setLoaded(true)} className="block max-w-none" style={{ width: size * 2, height: size }} />
            <img src={url} alt="" className="block max-w-none" style={{ width: size * 2, height: size }} />
          </div>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.2), transparent 36%), radial-gradient(circle at 84% 78%, rgba(0,0,8,0.78), rgba(0,0,8,0) 58%)",
              boxShadow: "inset -18px -14px 40px rgba(0,0,10,0.62), inset 6px 6px 22px rgba(170,210,255,0.28)",
            }}
          />
        </div>
        <div className="pointer-events-none absolute -inset-px rounded-full" style={{ boxShadow: "inset 0 0 10px 2px rgba(130,195,255,0.5)" }} />
      </div>
      <OrbitLayer which="front" W={W} H={H} orbits={orbits} />
    </div>
  );
}
