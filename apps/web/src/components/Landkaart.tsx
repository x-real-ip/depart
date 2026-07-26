import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import type { PuntRol, RoutePunt } from "../lib/api.ts";

/**
 * Kaart met vertrekpunt, overnachtingen en eindbestemming, met de route
 * ertussen als lijn. OpenStreetMap-tegels, geen sleutel nodig — zelfde soort
 * dienst als het weer en de route.
 *
 * Eigen gekleurde stippen in plaats van Leaflet's standaardmarkers: die
 * vereisen afbeeldingsbestanden waarvan het pad met een bundler als Vite
 * gemakkelijk breekt, en stippen in de eigen kleuren passen beter bij de
 * rest van de app.
 */

const KLEUR_PER_ROL: Record<PuntRol, string> = {
  thuis: "#12283C",
  overnachting: "#FFB703",
  bestemming: "#2F6B4F",
};

const LABEL_PER_ROL: Record<PuntRol, string> = {
  thuis: "Thuis",
  overnachting: "Overnachting",
  bestemming: "Bestemming",
};

function maakIcoon(kleur: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${kleur};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const ICONEN: Record<PuntRol, L.DivIcon> = {
  thuis: maakIcoon(KLEUR_PER_ROL.thuis),
  overnachting: maakIcoon(KLEUR_PER_ROL.overnachting),
  bestemming: maakIcoon(KLEUR_PER_ROL.bestemming),
};

export function Landkaart({
  punten,
  geometrie,
}: {
  punten: RoutePunt[];
  geometrie?: [number, number][];
}) {
  const reduceerBeweging =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (punten.length === 0) return null;
    return punten.map((punt): [number, number] => [punt.lat, punt.lon]);
  }, [punten]);

  if (bounds === null) return null;

  const routeBeschrijving =
    punten.length === 1
      ? punten[0]!.naam
      : `${punten[0]!.naam} → ${punten
          .slice(1, -1)
          .map((p) => p.naam)
          .join(" → ")}${punten.length > 2 ? " → " : ""}${punten[punten.length - 1]!.naam}`;

  return (
    <div className="space-y-2">
      {/*
        role="img" met een beschrijving: de kaart is hier een aanvulling op de
        route die al als tekst in de lijst hierboven/onder staat, niet de enige
        plek waar deze informatie te vinden is.
      */}
      <div
        role="img"
        aria-label={`Kaart met de route: ${routeBeschrijving}`}
        className="h-72 overflow-hidden rounded-[var(--radius-card)] border border-slate/20 sm:h-80"
      >
        <MapContainer
          bounds={bounds}
          boundsOptions={{ padding: [28, 28] }}
          className="h-full w-full"
          zoomAnimation={!reduceerBeweging}
          fadeAnimation={!reduceerBeweging}
          markerZoomAnimation={!reduceerBeweging}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-auteurs'
          />
          {geometrie !== undefined && geometrie.length > 0 && (
            <Polyline
              positions={geometrie}
              pathOptions={{ color: "#12283C", weight: 4, opacity: 0.65 }}
            />
          )}
          {punten.map((punt, index) => (
            <Marker key={index} position={[punt.lat, punt.lon]} icon={ICONEN[punt.rol]} />
          ))}
        </MapContainer>
      </div>

      {/* Legenda: welke kleur staat voor wat. */}
      <div className="flex flex-wrap gap-3">
        {(["thuis", "overnachting", "bestemming"] as const).map((rol) => (
          <span key={rol} className="flex items-center gap-1.5 text-xs text-slate">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: KLEUR_PER_ROL[rol] }}
            />
            {LABEL_PER_ROL[rol]}
          </span>
        ))}
      </div>
    </div>
  );
}
