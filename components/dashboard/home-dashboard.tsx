"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import airportsCatalog from "@/data/europe-latam-airports.json";
import { AirportCombobox, type Airport } from "./airport-combobox";
import { ToastProvider, useToast } from "./toast";
import {
  baggageLabel,
  formatCOP,
  formatThousands,
  maxStopsLabel,
  onlyDigits,
  relativeTime,
} from "@/lib/format";

const AIRPORTS = airportsCatalog as Airport[];

type TrackedFlight = {
  id: string;
  origin: string;
  destination: string;
  baggage_type: string;
  max_stops: number;
  visa_exclusion: boolean;
  night_only: boolean;
  flex_days: number;
  trip_type: "one_way" | "round_trip";
  trip_length_days: number;
  depart_date: string | null;
  return_date: string | null;
  target_price: number;
  is_active: boolean;
  created_at?: string;
};

type HistoryPoint = {
  flightId: string;
  price: number;
  airline: string | null;
  departureTime: string | null;
  checkedAt: string;
};

const BAGGAGE_OPTIONS = [
  { value: "any", label: "Cualquier equipaje" },
  { value: "morral", label: "Solo morral" },
  { value: "mano_10kg", label: "Equipaje de mano 10kg" },
  { value: "bodega_23kg", label: "Bodega 23kg" },
];

const MAX_STOPS_OPTIONS = [
  { value: 0, label: "Directo" },
  { value: 1, label: "Hasta 1 escala" },
  { value: 2, label: "Hasta 2 escalas" },
  { value: 9, label: "Cualquier escala" },
];

const FLEX_OPTIONS = [0, 1, 2, 3];

type SortKey = "recent" | "price-asc" | "price-desc" | "route";

function readCachedAlerts(): TrackedFlight[] {
  try {
    const cached = window.localStorage?.getItem("flighttracker_alerts");
    return cached ? (JSON.parse(cached) as TrackedFlight[]) : [];
  } catch {
    return [];
  }
}

function writeCachedAlerts(list: TrackedFlight[]) {
  try {
    window.localStorage?.setItem("flighttracker_alerts", JSON.stringify(list));
  } catch {
    // Some browsers block storage access; keep the UI working without cache.
  }
}

function airportName(code: string): string {
  const airport = AIRPORTS.find((item) => item.code === code);
  return airport ? `${airport.city} (${airport.code})` : code;
}

export function HomeDashboard() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const { notify } = useToast();

  // Form state
  const [origin, setOrigin] = useState("MDE");
  const [destination, setDestination] = useState("BCN");
  const [targetPrice, setTargetPrice] = useState("1.800.000");
  const [baggageType, setBaggageType] = useState("any");
  const [maxStops, setMaxStops] = useState(9);
  const [flexDays, setFlexDays] = useState(3);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("round_trip");
  const [tripLengthDays, setTripLengthDays] = useState(14);
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [visaExclusion, setVisaExclusion] = useState(false);
  const [nightOnly, setNightOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Data state
  const [alerts, setAlerts] = useState<TrackedFlight[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [alertLoadError, setAlertLoadError] = useState("");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [selectedFlightId, setSelectedFlightId] = useState<string>("");

  // List controls
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  // Modals
  const [editing, setEditing] = useState<TrackedFlight | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<TrackedFlight | null>(null);

  const targetNumber = Number(onlyDigits(targetPrice));
  const errors = {
    origin: !origin ? "Selecciona un origen" : "",
    destination: !destination
      ? "Selecciona un destino"
      : destination === origin
        ? "El destino no puede ser igual al origen"
        : "",
    target: targetNumber <= 0 ? "Ingresa un precio objetivo mayor a 0" : "",
    dates:
      tripType === "round_trip" && departDate && returnDate && returnDate < departDate
        ? "El regreso no puede ser antes de la salida"
        : "",
  };
  const isValid = !errors.origin && !errors.destination && !errors.target && !errors.dates;

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/tracked-flights");
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        trackedFlights?: TrackedFlight[];
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "No se pudieron cargar las alertas");
      }
      const list = payload.trackedFlights ?? [];
      setAlerts(list);
      setAlertLoadError("");
      writeCachedAlerts(list);
    } catch (error) {
      const cached = readCachedAlerts();
      if (cached.length > 0) setAlerts(cached);
      setAlertLoadError(
        error instanceof Error
          ? `No se pudo leer Supabase (${error.message}). Mostrando caché local si existe.`
          : "No se pudo leer Supabase."
      );
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/price-history");
      const payload = (await response.json()) as { ok?: boolean; history?: HistoryPoint[] };
      if (response.ok && payload.ok) setHistory(payload.history ?? []);
    } catch {
      /* history is optional, ignore */
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    loadHistory();
  }, [loadAlerts, loadHistory]);

  // Keep a valid selected flight for the history panel.
  useEffect(() => {
    if (alerts.length === 0) {
      setSelectedFlightId("");
    } else if (!alerts.some((alert) => alert.id === selectedFlightId)) {
      setSelectedFlightId(alerts[0].id);
    }
  }, [alerts, selectedFlightId]);

  const visibleAlerts = useMemo(() => {
    const search = filter.trim().toLowerCase();
    const filtered = search
      ? alerts.filter((alert) =>
          `${alert.origin} ${alert.destination} ${airportName(alert.origin)} ${airportName(
            alert.destination
          )}`
            .toLowerCase()
            .includes(search)
        )
      : alerts;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "price-asc":
          return a.target_price - b.target_price;
        case "price-desc":
          return b.target_price - a.target_price;
        case "route":
          return `${a.origin}${a.destination}`.localeCompare(`${b.origin}${b.destination}`);
        default:
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }
    });
    return sorted;
  }, [alerts, filter, sortKey]);

  const activeCount = alerts.filter((alert) => alert.is_active).length;
  const selectedAlert = alerts.find((alert) => alert.id === selectedFlightId) ?? null;
  const selectedHistory = useMemo(
    () =>
      history
        .filter((point) => point.flightId === selectedFlightId)
        .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)),
    [history, selectedFlightId]
  );

  function swapAirports() {
    setOrigin(destination);
    setDestination(origin);
  }

  async function handleSubmit() {
    setTouched(true);
    if (!isValid) {
      notify("Revisa los campos marcados antes de registrar.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/tracked-flights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          baggage_type: baggageType,
          max_stops: maxStops,
          visa_exclusion: visaExclusion,
          night_only: nightOnly,
          flex_days: flexDays,
          trip_type: tripType,
          trip_length_days: tripLengthDays,
          depart_date: departDate || null,
          return_date: tripType === "round_trip" ? returnDate || null : null,
          target_price: targetNumber,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "No se pudo registrar la alerta");
      }
      notify("Alerta registrada correctamente.", "success");
      setTouched(false);
      await loadAlerts();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo registrar la alerta", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(alert: TrackedFlight) {
    try {
      const response = await fetch("/api/tracked-flights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id, is_active: !alert.is_active }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo actualizar");
      notify(alert.is_active ? "Alerta pausada." : "Alerta reactivada.", "success");
      await loadAlerts();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo actualizar", "error");
    }
  }

  async function confirmDelete() {
    if (!confirmingDelete) return;
    const alert = confirmingDelete;
    setConfirmingDelete(null);
    try {
      const response = await fetch(
        `/api/tracked-flights?id=${encodeURIComponent(alert.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo borrar");
      setAlerts((current) => {
        const next = current.filter((item) => item.id !== alert.id);
        writeCachedAlerts(next);
        return next;
      });
      notify("Alerta eliminada.", "success");
      await loadAlerts();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo borrar", "error");
    }
  }

  async function handleSaveEdit(updated: Partial<TrackedFlight> & { id: string }) {
    try {
      const response = await fetch("/api/tracked-flights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo guardar");
      notify("Alerta actualizada.", "success");
      setEditing(null);
      await loadAlerts();
      await loadHistory();
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar", "error");
    }
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* ============ TOP BAR ============ */}
      <Header />

      {/* ============ HERO ============ */}
      <HeroSection activeCount={activeCount} />

      {/* ============ MAIN GRID ============ */}
      <main
        style={{
          maxWidth: "1320px",
          margin: "0 auto",
          padding: "32px 40px 80px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 380px",
          gap: "32px",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Create Alert Form */}
          <CreateAlertForm
            origin={origin}
            setOrigin={setOrigin}
            destination={destination}
            setDestination={setDestination}
            targetPrice={targetPrice}
            setTargetPrice={setTargetPrice}
            baggageType={baggageType}
            setBaggageType={setBaggageType}
            maxStops={maxStops}
            setMaxStops={setMaxStops}
            flexDays={flexDays}
            setFlexDays={setFlexDays}
            tripType={tripType}
            setTripType={setTripType}
            tripLengthDays={tripLengthDays}
            setTripLengthDays={setTripLengthDays}
            departDate={departDate}
            setDepartDate={setDepartDate}
            returnDate={returnDate}
            setReturnDate={setReturnDate}
            visaExclusion={visaExclusion}
            setVisaExclusion={setVisaExclusion}
            nightOnly={nightOnly}
            setNightOnly={setNightOnly}
            errors={errors}
            isValid={isValid}
            touched={touched}
            submitting={submitting}
            onSwap={swapAirports}
            onSubmit={handleSubmit}
          />

          {/* Active Alerts */}
          <ActiveAlertsList
            alerts={visibleAlerts}
            loading={loadingAlerts}
            error={alertLoadError}
            filter={filter}
            onFilterChange={setFilter}
            sortKey={sortKey}
            onSortChange={setSortKey}
            onToggle={toggleActive}
            onEdit={setEditing}
            onDelete={setConfirmingDelete}
            history={history}
          />

          {/* Price History Chart */}
          <PriceHistorySection alerts={alerts} history={history} selectedAlert={selectedAlert} selectedHistory={selectedHistory} selectedFlightId={selectedFlightId} onSelectFlight={setSelectedFlightId} />
        </div>

        {/* RIGHT SIDEBAR */}
        <Sidebar />
      </main>

      {/* Modals */}
      {editing && (
        <EditAlertModal
          alert={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title="Borrar alerta"
          message={`¿Seguro que quieres borrar ${confirmingDelete.origin} → ${confirmingDelete.destination}?`}
          confirmLabel="Borrar"
          onCancel={() => setConfirmingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        height: "64px",
        boxSizing: "border-box",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        className="hov"
        aria-label="Menú"
        style={{ width: "48px", height: "48px", borderRadius: "50%" }}
      >
        <span className="ms" style={{ fontSize: "24px", color: "#c4c7c5" }}>
          menu
        </span>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 6px" }}>
        <div
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "9px",
            background: "linear-gradient(135deg,#8ab4f8 0%,#aecbfa 60%,#c58af9 100%)",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 2px 8px rgba(138,180,248,.25)",
          }}
        >
          <span className="ms msf" style={{ fontSize: "18px", color: "#1b1c1e" }}>
            flightsmode
          </span>
        </div>
        <div
          style={{
            fontSize: "20px",
            letterSpacing: "-.2px",
            fontWeight: 500,
            fontFamily: "'Google Sans', system-ui, sans-serif",
          }}
        >
          Pista<span style={{ color: "var(--primary)" }}>·</span>
          <span style={{ color: "#c4c7c5", fontWeight: 400 }}>vuelos</span>
        </div>
      </div>

      <nav style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "18px" }}>
        <button
          className="seg on"
          style={{
            height: "40px",
            padding: "0 16px 0 14px",
            borderRadius: "20px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          <span className="ms" style={{ fontSize: "18px" }}>
            notifications_active
          </span>
          Alertas
        </button>
        <button
          className="seg chip-hov"
          style={{
            height: "40px",
            padding: "0 16px 0 14px",
            borderRadius: "20px",
            background: "transparent",
            color: "#e3e3e3",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <span className="ms" style={{ fontSize: "18px" }}>
            show_chart
          </span>
          Historial
        </button>
        <button
          className="seg chip-hov"
          style={{
            height: "40px",
            padding: "0 16px 0 14px",
            borderRadius: "20px",
            background: "transparent",
            color: "#e3e3e3",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <span className="ms" style={{ fontSize: "18px" }}>
            travel_explore
          </span>
          Explorar
        </button>
        <button
          className="seg chip-hov"
          style={{
            height: "40px",
            padding: "0 16px 0 14px",
            borderRadius: "20px",
            background: "transparent",
            color: "#e3e3e3",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <span className="ms" style={{ fontSize: "18px" }}>
            settings
          </span>
          Ajustes
        </button>
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          className="hov"
          title="Telegram conectado"
          style={{
            height: "36px",
            padding: "0 12px 0 10px",
            borderRadius: "18px",
            border: "1px solid #2a6d3f",
            background: "rgba(31,169,113,.10)",
            color: "#7ee2a8",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
          }}
        >
          <span className="ms msf" style={{ fontSize: "16px" }}>
            check_circle
          </span>
          Telegram listo
        </button>
        <button
          className="hov"
          aria-label="Tema"
          style={{ width: "40px", height: "40px", borderRadius: "50%" }}
        >
          <span className="ms" style={{ fontSize: "22px", color: "#c4c7c5" }}>
            dark_mode
          </span>
        </button>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#8ab4f8,#c58af9)",
            display: "grid",
            placeItems: "center",
            fontWeight: 600,
            color: "#1b1c1e",
            fontSize: "13px",
            marginLeft: "4px",
            fontFamily: "'Google Sans', system-ui, sans-serif",
          }}
        >
          AV
        </div>
      </div>
    </header>
  );
}

function HeroSection({ activeCount }: { activeCount: number }) {
  return (
    <section
      style={{
        position: "relative",
        padding: "56px 40px 24px",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 480px",
        gap: "48px",
        alignItems: "center",
        maxWidth: "1320px",
        margin: "0 auto",
      }}
    >
      <div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px 6px 10px",
            borderRadius: "999px",
            background: "rgba(168,199,250,.10)",
            color: "var(--primary)",
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: ".3px",
            textTransform: "uppercase",
          }}
        >
          <span className="ms" style={{ fontSize: "14px" }}>
            bolt
          </span>
          Detección de tarifas error · 6×/día
        </div>
        <h1
          style={{
            fontSize: "60px",
            lineHeight: 1.05,
            letterSpacing: "-1.2px",
            fontWeight: 500,
            margin: "18px 0 16px",
            color: "#f1f1f1",
            fontFamily: "'Google Sans', system-ui, sans-serif",
          }}
        >
          Vuelos baratos,<br />
          encontrados{" "}
          <span
            style={{
              background: "linear-gradient(120deg,#a8c7fa,#c58af9 60%,#fdb1c8)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            mientras duermes
          </span>
          .
        </h1>
        <p style={{ fontSize: "17px", lineHeight: 1.55, color: "#9aa0a6", maxWidth: "560px", margin: "0 0 28px" }}>
          Define una ruta y un precio objetivo. Revisamos seis veces al día y te avisamos por Telegram o correo cuando alguien se equivoca y la tarifa cae.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            className="pill-btn"
            style={{
              fontFamily: "'Google Sans', system-ui, sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: "20px" }}>
              add
            </span>
            Nueva alerta
          </button>
          <button
            className="pill-btn hov"
            style={{
              background: "transparent",
              color: "#e3e3e3",
              border: "1px solid #444746",
              fontFamily: "'Google Sans', system-ui, sans-serif",
            }}
          >
            <span className="ms" style={{ fontSize: "20px" }}>
              play_circle
            </span>
            Ver cómo funciona
          </button>
        </div>
        <div style={{ display: "flex", gap: "32px", marginTop: "36px" }}>
          <div>
            <div style={{ fontSize: "28px", fontWeight: 500, color: "#f1f1f1", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
              {activeCount}
            </div>
            <div style={{ fontSize: "12px", color: "#9aa0a6", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Alertas activas
            </div>
          </div>
          <div style={{ width: "1px", background: "#2a2c2f" }} />
          <div>
            <div style={{ fontSize: "28px", fontWeight: 500, color: "#f1f1f1", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
              $ 1.2M
            </div>
            <div style={{ fontSize: "12px", color: "#9aa0a6", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Ahorro este mes
            </div>
          </div>
          <div style={{ width: "1px", background: "#2a2c2f" }} />
          <div>
            <div style={{ fontSize: "28px", fontWeight: 500, color: "#f1f1f1", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
              3.487
            </div>
            <div style={{ fontSize: "12px", color: "#9aa0a6", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Precios revisados
            </div>
          </div>
        </div>
      </div>

      {/* Globe SVG */}
      <div style={{ position: "relative", height: "380px" }}>
        <div
          style={{
            position: "absolute",
            inset: "-40px",
            background:
              "radial-gradient(60% 60% at 60% 40%, rgba(138,180,248,.18), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <svg viewBox="0 0 480 380" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="globe" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#2a3346" />
              <stop offset="1" stopColor="#1b1c1e" />
            </linearGradient>
            <radialGradient id="dot" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#a8c7fa" />
              <stop offset="1" stopColor="#a8c7fa" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="260" cy="200" r="160" fill="url(#globe)" stroke="#3c4043" strokeWidth="1" />
          <g stroke="#3c4043" fill="none" strokeWidth="1">
            <ellipse cx="260" cy="200" rx="160" ry="60" />
            <ellipse cx="260" cy="200" rx="160" ry="110" />
            <ellipse cx="260" cy="200" rx="60" ry="160" />
            <ellipse cx="260" cy="200" rx="110" ry="160" />
            <line x1="100" y1="200" x2="420" y2="200" />
          </g>
          <circle cx="180" cy="170" r="40" fill="url(#dot)" opacity=".6" />
          <circle cx="340" cy="240" r="40" fill="url(#dot)" opacity=".6" />
          <path
            d="M180,170 Q260,80 340,240"
            fill="none"
            stroke="#a8c7fa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="3 5"
          />
          <circle cx="180" cy="170" r="6" fill="#a8c7fa" />
          <circle cx="180" cy="170" r="11" fill="none" stroke="#a8c7fa" strokeWidth="1.5" opacity=".5" />
          <circle cx="340" cy="240" r="6" fill="#fdb1c8" />
          <circle cx="340" cy="240" r="11" fill="none" stroke="#fdb1c8" strokeWidth="1.5" opacity=".5" />
          <g style={{ fontFamily: "'Google Sans', system-ui", fontSize: "11", fontWeight: "500" }}>
            <rect x="100" y="142" width="76" height="22" rx="11" fill="#26282b" stroke="#3c4043" />
            <text x="138" y="157" textAnchor="middle" fill="#e3e3e3">
              MDE · Medellín
            </text>
            <rect x="346" y="248" width="72" height="22" rx="11" fill="#26282b" stroke="#3c4043" />
            <text x="382" y="263" textAnchor="middle" fill="#e3e3e3">
              BCN · España
            </text>
          </g>
          <g transform="translate(255,130) rotate(35)">
            <path
              d="M-14,0 L14,-3 L22,-7 L26,-5 L26,2 L22,2 L14,4 L-4,8 L-14,4 Z"
              fill="#f1f1f1"
            />
          </g>
        </svg>

        {/* Floating price card */}
        <div
          style={{
            position: "absolute",
            left: "-12px",
            bottom: "14px",
            width: "240px",
            background: "#26282b",
            border: "1px solid #3c4043",
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: "0 12px 32px rgba(0,0,0,.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#7ee2a8", fontWeight: 500 }}>
            <span className="ms msf" style={{ fontSize: "16px" }}>
              trending_down
            </span>
            Bajó 28% hoy
          </div>
          <div
            style={{
              fontSize: "26px",
              fontWeight: 500,
              color: "#f1f1f1",
              marginTop: "4px",
              fontFamily: "'Google Sans', system-ui, sans-serif",
            }}
          >
            $ 1.842.300{" "}
            <span style={{ fontSize: "13px", color: "#9aa0a6", fontWeight: 400 }}>COP</span>
          </div>
          <div style={{ fontSize: "12px", color: "#9aa0a6", marginTop: "2px" }}>
            MDE → BCN · Oct 14–28 · 1 escala
          </div>
          <svg
            className="spark"
            viewBox="0 0 200 40"
            style={{ width: "100%", height: "36px", marginTop: "8px" }}
          >
            <path
              className="line"
              d="M0,18 L20,22 L40,15 L60,20 L80,12 L100,16 L120,10 L140,24 L160,18 L180,28 L200,32"
              fill="none"
              stroke="#7ee2a8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Floating notification tag */}
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "8px",
            background: "#26282b",
            border: "1px solid #3c4043",
            borderRadius: "14px",
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 6px 18px rgba(0,0,0,.3)",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "#2c3a4f",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span className="ms" style={{ fontSize: "16px", color: "var(--primary)" }}>
              send
            </span>
          </div>
          <div style={{ fontSize: "12px", lineHeight: 1.3 }}>
            <div style={{ color: "#e3e3e3", fontWeight: 500 }}>Telegram</div>
            <div style={{ color: "#9aa0a6" }}>Notificado hace 2 min</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Component stubs below - keeping existing logic, just reorganizing layout
function CreateAlertForm({
  origin,
  setOrigin,
  destination,
  setDestination,
  targetPrice,
  setTargetPrice,
  baggageType,
  setBaggageType,
  maxStops,
  setMaxStops,
  flexDays,
  setFlexDays,
  tripType,
  setTripType,
  tripLengthDays,
  setTripLengthDays,
  departDate,
  setDepartDate,
  returnDate,
  setReturnDate,
  visaExclusion,
  setVisaExclusion,
  nightOnly,
  setNightOnly,
  errors,
  isValid,
  touched,
  submitting,
  onSwap,
  onSubmit,
}: any) {
  return (
    <section style={{ background: "#202124", border: "1px solid #2f3236", borderRadius: "24px", padding: "24px 24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "1px",
              color: "var(--primary)",
              textTransform: "uppercase",
            }}
          >
            Paso 01
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 500, margin: "2px 0 0", letterSpacing: "-.3px", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
            Crea una alerta
          </h2>
        </div>
        <div
          style={{
            display: "flex",
            background: "#26282b",
            border: "1px solid #3c4043",
            borderRadius: "999px",
            padding: "4px",
          }}
        >
          <button
            className="seg"
            style={{
              height: "32px",
              padding: "0 14px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: 500,
              ...(tripType === "round_trip" ? { background: "#2c3a4f", color: "var(--primary)" } : { background: "transparent", color: "#c4c7c5" }),
            }}
            onClick={() => setTripType("round_trip")}
          >
            Ida y vuelta
          </button>
          <button
            className="seg"
            style={{
              height: "32px",
              padding: "0 14px",
              borderRadius: "999px",
              fontSize: "13px",
              ...(tripType === "one_way" ? { background: "#2c3a4f", color: "var(--primary)" } : { background: "transparent", color: "#c4c7c5" }),
            }}
            onClick={() => setTripType("one_way")}
          >
            Solo ida
          </button>
        </div>
      </div>

      {/* Origin/Destination */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 44px 1fr",
          gap: 0,
          alignItems: "stretch",
          background: "#26282b",
          border: "1px solid #3c4043",
          borderRadius: "14px",
          overflow: "hidden",
          marginBottom: "10px",
        }}
      >
        <label
          className="ring"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "10px 16px",
            cursor: "text",
          }}
        >
          <span style={{ fontSize: "11px", color: "#9aa0a6", letterSpacing: ".3px" }}>
            Origen
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
            <span className="ms" style={{ fontSize: "18px", color: "var(--primary)" }}>
              trip_origin
            </span>
            <AirportCombobox
              label=""
              value={origin}
              onChange={setOrigin}
              airports={AIRPORTS}
              invalid={touched && Boolean(errors.origin)}
            />
          </div>
        </label>
        <button
          className="hov"
          style={{
            borderLeft: "1px solid #3c4043",
            borderRight: "1px solid #3c4043",
            background: "transparent",
            display: "grid",
            placeItems: "center",
            color: "#c4c7c5",
          }}
          onClick={onSwap}
        >
          <span className="ms" style={{ fontSize: "20px" }}>
            swap_horiz
          </span>
        </button>
        <label
          className="ring"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "10px 16px",
            cursor: "text",
          }}
        >
          <span style={{ fontSize: "11px", color: "#9aa0a6", letterSpacing: ".3px" }}>
            Destino
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
            <span className="ms" style={{ fontSize: "18px", color: "#fdb1c8" }}>
              location_on
            </span>
            <AirportCombobox
              label=""
              value={destination}
              onChange={setDestination}
              airports={AIRPORTS}
              invalid={touched && Boolean(errors.destination)}
            />
          </div>
        </label>
      </div>

      {/* Dates and flexibility row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <label style={{ background: "#26282b", border: "1px solid #3c4043", borderRadius: "14px", padding: "10px 14px", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "11px", color: "#9aa0a6" }}>Salida</span>
          <input type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} style={{ marginTop: "2px", fontSize: "14px", fontWeight: 500 }} />
        </label>
        <label style={{ background: "#26282b", border: "1px solid #3c4043", borderRadius: "14px", padding: "10px 14px", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "11px", color: "#9aa0a6" }}>Regreso</span>
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} style={{ marginTop: "2px", fontSize: "14px", fontWeight: 500 }} />
        </label>
        <label style={{ background: "#26282b", border: "1px solid #3c4043", borderRadius: "14px", padding: "10px 14px", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "11px", color: "#9aa0a6" }}>Flexibilidad</span>
          <select value={flexDays} onChange={(e) => setFlexDays(Number(e.target.value))} style={{ marginTop: "2px", fontSize: "14px", fontWeight: 500 }}>
            {FLEX_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "Exacta" : `± ${v} día${v > 1 ? "s" : ""}`}
              </option>
            ))}
          </select>
        </label>
        <label style={{ background: "#26282b", border: "1px solid #3c4043", borderRadius: "14px", padding: "10px 14px", display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "11px", color: "#9aa0a6" }}>Duración</span>
          <input type="number" value={tripLengthDays} onChange={(e) => setTripLengthDays(Math.max(1, Math.min(60, Number(e.target.value))))} style={{ marginTop: "2px", fontSize: "14px", fontWeight: 500 }} />
        </label>
      </div>

      {/* Stops and Baggage */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
        <div>
          <div style={{ fontSize: "12px", color: "#9aa0a6", margin: "0 4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="ms" style={{ fontSize: "14px" }}>multiple_stop</span>Escalas
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {MAX_STOPS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="seg"
                style={{
                  height: "34px",
                  padding: "0 14px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  ...(maxStops === opt.value ? { background: "#2c3a4f", color: "var(--primary)" } : { background: "transparent", color: "#c4c7c5", border: "1px solid #3c4043" }),
                }}
                onClick={() => setMaxStops(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#9aa0a6", margin: "0 4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="ms" style={{ fontSize: "14px" }}>luggage</span>Equipaje
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {BAGGAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="seg"
                style={{
                  height: "34px",
                  padding: "0 14px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  ...(baggageType === opt.value ? { background: "#2c3a4f", color: "var(--primary)" } : { background: "transparent", color: "#c4c7c5", border: "1px solid #3c4043" }),
                }}
                onClick={() => setBaggageType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px", paddingTop: "18px", borderTop: "1px solid #2a2c2f" }}>
        <button
          className="seg"
          style={{
            height: "36px",
            padding: "0 14px 0 10px",
            borderRadius: "999px",
            border: "1px solid #3c4043",
            background: "transparent",
            color: "#c4c7c5",
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setMaxStops(maxStops === 0 ? 9 : 0)}
        >
          <span className="ms" style={{ fontSize: "16px" }}>add</span>Sin escalas
        </button>
        <button
          className="seg"
          style={{
            height: "36px",
            padding: "0 14px 0 10px",
            borderRadius: "999px",
            ...(visaExclusion ? { background: "#2c3a4f", color: "var(--primary)" } : { border: "1px solid #3c4043", background: "transparent", color: "#c4c7c5" }),
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setVisaExclusion(!visaExclusion)}
        >
          <span className="ms" style={{ fontSize: "16px" }}>{visaExclusion ? "check" : "add"}</span>Excluir USA (visa)
        </button>
        <button
          className="seg"
          style={{
            height: "36px",
            padding: "0 14px 0 10px",
            borderRadius: "999px",
            ...(nightOnly ? { background: "#2c3a4f", color: "var(--primary)" } : { border: "1px solid #3c4043", background: "transparent", color: "#c4c7c5" }),
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
          onClick={() => setNightOnly(!nightOnly)}
        >
          <span className="ms" style={{ fontSize: "16px" }}>bedtime</span>Horario vampiro
        </button>
      </div>

      {/* Target price */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "14px", alignItems: "end", marginBottom: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "1px",
                  color: "#fdb1c8",
                  textTransform: "uppercase",
                }}
              >
                Paso 02
              </div>
              <span style={{ color: "#5f6368" }}>·</span>
              <span style={{ fontSize: "13px", color: "#c4c7c5" }}>Precio objetivo</span>
            </div>
            <span style={{ fontSize: "12px", color: "#9aa0a6" }}>Promedio últimos 30d: $ 2.450.000</span>
          </div>
          <label
            className="ring"
            style={{
              background: "#26282b",
              border: "1px solid #3c4043",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "14px", color: "#9aa0a6", fontFamily: "'Google Sans', system-ui, sans-serif" }}>COP</span>
            <input
              type="text"
              value={targetPrice}
              onChange={(e) => setTargetPrice(formatThousands(e.target.value))}
              style={{
                fontSize: "32px",
                fontWeight: 500,
                letterSpacing: "-.5px",
                flex: 1,
                color: "#f1f1f1",
                fontFamily: "'Roboto Mono', monospace",
              }}
            />
            <span style={{ fontSize: "13px", color: "#7ee2a8", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span className="ms" style={{ fontSize: "14px" }}>arrow_downward</span>26% bajo promedio
            </span>
          </label>
        </div>
        <button
          className="pill-btn"
          style={{
            height: "56px",
            padding: "0 28px 0 22px",
            borderRadius: "28px",
            fontFamily: "'Google Sans', system-ui, sans-serif",
          }}
          onClick={onSubmit}
          disabled={submitting}
        >
          <span className="ms" style={{ fontSize: "22px" }}>
            notifications_active
          </span>
          {submitting ? "Registrando…" : "Registrar alerta"}
        </button>
      </div>

      <div style={{ fontSize: "12px", color: "#9aa0a6", display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="ms" style={{ fontSize: "14px" }}>
          info
        </span>
        Tu alerta se revisa cada 4 horas. Recibirás un Telegram apenas alguien cobre menos de tu objetivo.
      </div>
    </section>
  );
}

function ActiveAlertsList({
  alerts,
  loading,
  error,
  filter,
  onFilterChange,
  sortKey,
  onSortChange,
  onToggle,
  onEdit,
  onDelete,
  history,
}: any) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", margin: "0 4px 14px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 500, letterSpacing: "-.3px", margin: 0, fontFamily: "'Google Sans', system-ui, sans-serif" }}>
            Alertas activas
          </h2>
          <div style={{ fontSize: "13px", color: "#9aa0a6", marginTop: "2px" }}>
            {alerts.length} vigilando · última revisión hace 38 min
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="seg chip-hov on"
            style={{
              height: "32px",
              padding: "0 12px",
              borderRadius: "999px",
              fontSize: "12px",
            }}
          >
            Activas · {alerts.filter((a: any) => a.is_active).length}
          </button>
          <button
            className="seg chip-hov"
            style={{
              height: "32px",
              padding: "0 12px",
              borderRadius: "999px",
              background: "transparent",
              color: "#c4c7c5",
              fontSize: "12px",
            }}
          >
            Pausadas · {alerts.filter((a: any) => !a.is_active).length}
          </button>
        </div>
      </div>

      {alerts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {alerts.map((alert: any) => (
            <article
              key={alert.id}
              className="card-hov"
              style={{
                background: "#202124",
                border: "1px solid #2f3236",
                borderRadius: "20px",
                padding: "18px 20px",
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: "20px",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "56px",
                  height: "56px",
                  borderRadius: "14px",
                  background: "#2c3a4f",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <span className="ms msf" style={{ fontSize: "26px", color: "var(--primary)" }}>
                  flight_takeoff
                </span>
                {alert.is_active && (
                  <div
                    style={{
                      position: "absolute",
                      right: "-4px",
                      top: "-4px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: "#7ee2a8",
                      border: "3px solid #202124",
                    }}
                  />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 500,
                    color: "#f1f1f1",
                    fontFamily: "'Google Sans', system-ui, sans-serif",
                  }}
                >
                  {alert.origin} → {alert.destination}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#9aa0a6",
                    marginTop: "3px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{alert.depart_date || "~30 días"}</span>
                  <span style={{ color: "#3c4043" }}>•</span>
                  <span>{maxStopsLabel(alert.max_stops)}</span>
                  <span style={{ color: "#3c4043" }}>•</span>
                  <span>{baggageLabel(alert.baggage_type)}</span>
                </div>
              </div>
              <svg
                className="spark"
                viewBox="0 0 160 56"
                style={{ width: "160px", height: "56px" }}
              >
                <path
                  d="M0,30 L20,28 L40,34 L60,22 L80,30 L100,18 L120,26 L140,14 L160,42"
                  fill="none"
                  stroke="#3c4043"
                  strokeWidth="1.5"
                />
                <path
                  className="line"
                  d="M0,30 L20,28 L40,34 L60,22 L80,30 L100,18 L120,26 L140,14 L160,42"
                  fill="none"
                  stroke="#7ee2a8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="160" cy="42" r="3.5" fill="#7ee2a8" />
              </svg>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 500,
                    color: "#f1f1f1",
                    fontFamily: "'Roboto Mono', monospace",
                  }}
                >
                  {formatCOP(alert.target_price)}
                </div>
                <div style={{ fontSize: "12px", color: "#9aa0a6" }}>objetivo</div>
                <div
                  style={{
                    fontSize: "11px",
                    color: alert.is_active ? "#7ee2a8" : "#9aa0a6",
                    marginTop: "2px",
                  }}
                >
                  {alert.is_active ? "98% cerca" : "pausada"}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "#202124",
            borderRadius: "20px",
            color: "#9aa0a6",
          }}
        >
          <strong style={{ color: "#e3e3e3" }}>No hay alertas todavía.</strong>
          <p>Registra tu primera ruta arriba y aparecerá aquí al instante.</p>
        </div>
      )}
    </section>
  );
}

function PriceHistorySection({
  alerts,
  history,
  selectedAlert,
  selectedHistory,
  selectedFlightId,
  onSelectFlight,
}: any) {
  return (
    <section style={{ background: "#202124", border: "1px solid #2f3236", borderRadius: "24px", padding: "24px" }}>
      <h2 style={{ fontSize: "22px", fontWeight: 500, margin: 0, letterSpacing: "-.3px", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
        Evolución de precios
      </h2>
      {alerts.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "#9aa0a6",
          }}
        >
          <strong style={{ color: "#e3e3e3" }}>Sin rutas que mostrar.</strong>
          <p>Registra una alerta para ver su evolución de precios.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", color: "#9aa0a6", marginBottom: "6px", display: "block" }}>
              Ruta
            </label>
            <select
              value={selectedFlightId}
              onChange={(e) => onSelectFlight(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "#26282b",
                border: "1px solid #3c4043",
                borderRadius: "8px",
                color: "inherit",
              }}
            >
              {alerts.map((alert: any) => (
                <option key={alert.id} value={alert.id}>
                  {alert.origin} → {alert.destination}
                </option>
              ))}
            </select>
          </div>
          <PriceChart points={selectedHistory} target={selectedAlert?.target_price ?? 0} />
          <p style={{ fontSize: "12px", color: "#9aa0a6", marginTop: "12px" }}>
            Los datos se llenan automáticamente cada vez que corre el cron.
          </p>
        </>
      )}
    </section>
  );
}

function PriceChart({ points, target }: { points: any[]; target: number }) {
  if (points.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "40px",
          color: "#9aa0a6",
        }}
      >
        <strong style={{ color: "#e3e3e3" }}>Sin historial todavía.</strong>
        <p>La gráfica aparecerá cuando el cron registre precios.</p>
      </div>
    );
  }

  const width = 760;
  const height = 260;
  const pad = 40;
  const prices = points.map((p) => p.price);
  const allValues = target > 0 ? [...prices, target] : prices;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const toY = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const coords = points.map((p, i) => ({ x: pad + i * stepX, y: toY(p.price) }));
  const linePath = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const targetY = target > 0 ? toY(target) : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "260px", display: "block" }}
    >
      {targetY !== null && (
        <line
          x1={pad}
          x2={width - pad}
          y1={targetY}
          y2={targetY}
          stroke="#7ee2a8"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      )}
      {points.length > 1 && (
        <polyline
          points={linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--primary)" />
      ))}
    </svg>
  );
}

function Sidebar() {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Notifications */}
      <section style={{ background: "#202124", border: "1px solid #2f3236", borderRadius: "20px", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#2c3a4f",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span className="ms msf" style={{ fontSize: "18px", color: "var(--primary)" }}>
              notifications
            </span>
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, fontFamily: "'Google Sans', system-ui, sans-serif" }}>
              Notificaciones
            </div>
            <div style={{ fontSize: "12px", color: "#9aa0a6" }}>¿Dónde te avisamos?</div>
          </div>
        </div>

        <label
          className="ring"
          style={{
            display: "block",
            background: "#26282b",
            border: "1px solid #3c4043",
            borderRadius: "12px",
            padding: "10px 14px",
            marginBottom: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#9aa0a6" }}>
            <span className="ms" style={{ fontSize: "14px" }}>
              send
            </span>
            Telegram chat ID
            <span style={{ marginLeft: "auto", color: "#7ee2a8", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span className="ms msf" style={{ fontSize: "12px" }}>
                check_circle
              </span>
              Verificado
            </span>
          </div>
          <input
            defaultValue="487 213 998"
            style={{ fontSize: "14px", marginTop: "2px", width: "100%", fontWeight: 500, fontFamily: "'Roboto Mono', monospace" }}
          />
        </label>

        <label
          className="ring"
          style={{
            display: "block",
            background: "#26282b",
            border: "1px solid #3c4043",
            borderRadius: "12px",
            padding: "10px 14px",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#9aa0a6" }}>
            <span className="ms" style={{ fontSize: "14px" }}>
              mail
            </span>
            Correo
          </div>
          <input
            defaultValue="avi@correo.com"
            style={{ fontSize: "14px", marginTop: "2px", width: "100%", fontWeight: 500 }}
          />
        </label>

        <button
          className="pill-btn"
          style={{
            width: "100%",
            height: "40px",
            borderRadius: "20px",
            marginTop: "8px",
            fontFamily: "'Google Sans', system-ui, sans-serif",
          }}
        >
          Guardar cambios
        </button>
      </section>

      {/* Recent Notifications */}
      <section style={{ background: "#202124", border: "1px solid #2f3236", borderRadius: "20px", padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 500, margin: 0, fontFamily: "'Google Sans', system-ui, sans-serif" }}>
            Últimas notificaciones
          </h3>
          <button
            className="hov"
            style={{
              background: "transparent",
              color: "var(--primary)",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "8px",
            }}
          >
            Ver todas
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <li style={{ display: "flex", gap: "12px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "rgba(31,169,113,.15)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <span className="ms msf" style={{ fontSize: "16px", color: "#7ee2a8" }}>
                trending_down
              </span>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#f1f1f1", lineHeight: 1.4 }}>
                <b>MDE → BCN</b> bajó a <span style={{ color: "#7ee2a8", fontFamily: "'Roboto Mono', monospace" }}>$1.842.300</span>
              </div>
              <div style={{ fontSize: "11px", color: "#9aa0a6", marginTop: "2px" }}>Hace 2 min · enviado a Telegram</div>
            </div>
          </li>
        </ul>
      </section>

      {/* Cron status */}
      <section style={{ background: "#202124", border: "1px solid #2f3236", borderRadius: "20px", padding: "16px 18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#9aa0a6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7ee2a8", boxShadow: "0 0 0 4px rgba(126,226,168,.15)" }} />
            Cron activo
          </div>
          <div>
            Próxima revisión <span style={{ color: "#e3e3e3", fontFamily: "'Roboto Mono', monospace" }}>14:00</span>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(24,1fr)",
            gap: "3px",
            marginTop: "12px",
          }}
        >
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              style={{
                height: "22px",
                borderRadius: "3px",
                background: i === 23 ? "var(--primary)" : i === 22 ? "#2a4a36" : "#2c3a4f",
              }}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}

function EditAlertModal({
  alert,
  onCancel,
  onSave,
}: {
  alert: TrackedFlight;
  onCancel: () => void;
  onSave: (updated: Partial<TrackedFlight> & { id: string }) => void;
}) {
  const [target, setTarget] = useState(formatThousands(String(alert.target_price)));

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#202124",
          border: "1px solid #2f3236",
          borderRadius: "20px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: "20px", fontWeight: 500, margin: "0 0 16px", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
          Editar alerta
        </h3>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "12px", color: "#9aa0a6", display: "block", marginBottom: "6px" }}>
            Precio objetivo (COP)
          </label>
          <input
            value={target}
            onChange={(e) => setTarget(formatThousands(e.target.value))}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#26282b",
              border: "1px solid #3c4043",
              borderRadius: "8px",
              color: "inherit",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            className="ghost-btn"
            style={{
              flex: 1,
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid var(--border-light)",
              borderRadius: "8px",
              color: "#e3e3e3",
            }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="pill-btn"
            style={{
              flex: 1,
              height: "40px",
              fontFamily: "'Google Sans', system-ui, sans-serif",
            }}
            onClick={() =>
              onSave({
                id: alert.id,
                target_price: Number(onlyDigits(target)),
              })
            }
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#202124",
          border: "1px solid #2f3236",
          borderRadius: "20px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: "20px", fontWeight: 500, margin: "0 0 12px", fontFamily: "'Google Sans', system-ui, sans-serif" }}>
          {title}
        </h3>
        <p style={{ fontSize: "14px", color: "#9aa0a6", margin: "0 0 20px" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="ghost-btn"
            style={{
              flex: 1,
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid var(--border-light)",
              borderRadius: "8px",
              color: "#e3e3e3",
            }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="pill-btn"
            style={{
              flex: 1,
              height: "40px",
              background: "#f28b82",
              fontFamily: "'Google Sans', system-ui, sans-serif",
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
