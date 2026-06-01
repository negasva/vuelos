"use client";

import { useEffect, useMemo, useState } from "react";
import airportsCatalog from "@/data/europe-latam-airports.json";

type Airport = {
  code: string;
  city: string;
  name: string;
  country: string;
};

type ActiveAlert = {
  id: string;
  route: string;
  target: string;
  status: string;
};

function AirportSelect({
  label,
  value,
  onChange,
  airports,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  airports: Airport[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = airports.filter((airport) =>
      [airport.code, airport.city, airport.name, airport.country].some((field) =>
        field.toLowerCase().includes(search),
      ),
    );

    return (search ? matches : airports).slice(0, 120);
  }, [airports, query]);

  return (
    <label>
      {label}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar aeropuerto, ciudad o país"
      />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {filtered.map((airport) => (
          <option key={`${airport.code}-${airport.city}`} value={airport.code}>
            {airport.code} - {airport.city} ({airport.country})
          </option>
        ))}
      </select>
    </label>
  );
}

function TogglePill({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`toggle-pill${active ? " toggle-pill-active" : ""}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function airportLabel(airport?: Airport, fallback?: string) {
  if (!airport) return fallback ?? "";
  return `${airport.code} - ${airport.city}`;
}

export function HomeDashboard() {
  const [origin, setOrigin] = useState("MDE");
  const [destination, setDestination] = useState("BCN");
  const [targetPrice, setTargetPrice] = useState("180000");
  const [baggageType, setBaggageType] = useState("any");
  const [nonStopOnly, setNonStopOnly] = useState(false);
  const [visaExclusion, setVisaExclusion] = useState(false);
  const [nightOnly, setNightOnly] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("flighttracker_alerts");
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as ActiveAlert[];
      if (Array.isArray(parsed)) {
        setAlerts(parsed);
      }
    } catch {
      // Ignore malformed local cache.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("flighttracker_alerts", JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const response = await fetch("/api/tracked-flights");
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          trackedFlights?: Array<{
            id: string;
            origin: string;
            destination: string;
            target_price: number;
            is_active: boolean;
          }>;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "No se pudieron cargar las alertas");
        }

        const nextAlerts = (payload.trackedFlights ?? []).map((flight) => ({
          id: flight.id,
          route: `${flight.origin} -> ${flight.destination}`,
          target: `COP ${Number(flight.target_price || 0).toLocaleString("es-CO")}`,
          status: flight.is_active ? "Activa" : "Pausada",
        }));
        setAlerts(nextAlerts);
      } catch {
        // Keep local fallback if the server can't be reached.
      } finally {
        setLoadingAlerts(false);
      }
    }

    loadAlerts();
  }, []);

  const originAirport = useMemo(
    () => airportsCatalog.find((airport) => airport.code === origin),
    [origin],
  );
  const destinationAirport = useMemo(
    () => airportsCatalog.find((airport) => airport.code === destination),
    [destination],
  );

  const historyRows: Array<{ checkedAt: string; price: number }> = [];

  async function handleSubmit() {
    setSubmitState("saving");
    setSubmitMessage("");

    try {
      const response = await fetch("/api/tracked-flights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          baggage_type: baggageType,
          max_stops: nonStopOnly ? 0 : 9,
          visa_exclusion: visaExclusion,
          night_only: nightOnly,
          flex_days: 0,
          target_price: Number(targetPrice || 0),
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        trackedFlight?: { id?: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "No se pudo registrar la alerta");
      }

      const nextAlert: ActiveAlert = {
        id: payload.trackedFlight?.id ?? `${origin}-${destination}-${Date.now()}`,
        route: `${origin} -> ${destination}`,
        target: `COP ${Number(targetPrice || 0).toLocaleString("es-CO")}`,
        status: "Activa",
      };

      setAlerts((current) => [nextAlert, ...current]);
      setSubmitState("saved");
      setSubmitMessage("Alerta registrada correctamente.");
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error instanceof Error ? error.message : "No se pudo registrar la alerta");
    }
  }

  async function handleDelete(alertId: string) {
    const response = await fetch(`/api/tracked-flights?id=${encodeURIComponent(alertId)}`, {
      method: "DELETE",
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "No se pudo borrar la alerta");
    }

    setAlerts((current) => current.filter((alert) => alert.id !== alertId));
  }

  async function handleEdit(alertId: string) {
    const nextTarget = window.prompt("Nuevo precio objetivo en COP:");
    if (!nextTarget) return;

    const response = await fetch("/api/tracked-flights", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: alertId,
        target_price: Number(nextTarget),
      }),
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string; trackedFlight?: { target_price?: number } };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "No se pudo editar la alerta");
    }

    const updatedTarget = `COP ${Number(payload.trackedFlight?.target_price ?? Number(nextTarget)).toLocaleString("es-CO")}`;
    setAlerts((current) =>
      current.map((alert) => (alert.id === alertId ? { ...alert, target: updatedTarget } : alert)),
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">FlightTracker Co</p>
          <h1>Rastreador de vuelos para Colombia</h1>
          <p className="hero-copy">
            Monitorea rutas, detecta tarifas error y recibe alertas inmediatas cuando el precio cae.
          </p>
        </div>
        <div className="hero-badges">
          <span>Supabase</span>
          <span>Apify</span>
          <span>Telegram</span>
        </div>
      </section>

      <section className="grid-layout">
        <article className="panel">
          <h2>Buscar y alertar</h2>
          <div className="form-grid">
            <AirportSelect label="Origen" value={origin} onChange={setOrigin} airports={airportsCatalog} />
            <AirportSelect label="Destino" value={destination} onChange={setDestination} airports={airportsCatalog} />
            <label>
              Precio objetivo
              <input
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              Equipaje
              <select value={baggageType} onChange={(event) => setBaggageType(event.target.value)}>
                <option value="any">Cualquiera</option>
                <option value="morral">Solo morral</option>
                <option value="mano_10kg">Mano 10kg</option>
                <option value="bodega_23kg">Bodega 23kg</option>
              </select>
            </label>
          </div>

          <div className="toggles">
            <TogglePill label="Sin escalas" active={nonStopOnly} onToggle={() => setNonStopOnly((value) => !value)} />
            <TogglePill label="Excluir visa" active={visaExclusion} onToggle={() => setVisaExclusion((value) => !value)} />
            <TogglePill label="Horario vampiro" active={nightOnly} onToggle={() => setNightOnly((value) => !value)} />
          </div>

          <div className="summary-box">
            <span>Ruta: {origin} -> {destination}</span>
            <span>
              Aeropuertos: {airportLabel(originAirport, origin)} -> {airportLabel(destinationAirport, destination)}
            </span>
            <span>Equipaje: {baggageType}</span>
            <span>Precio: COP {Number(targetPrice || 0).toLocaleString("es-CO")}</span>
          </div>

          <button className="primary-btn" type="button" onClick={handleSubmit} disabled={submitState === "saving"}>
            Registrar alerta
          </button>
          <p className={`panel-note ${submitState === "error" ? "panel-note-error" : ""}`}>
            {submitState === "idle" && "La alerta se guardará en Supabase cuando presiones el botón."}
            {submitState === "saving" && "Guardando alerta..."}
            {submitState === "saved" && submitMessage}
            {submitState === "error" && submitMessage}
          </p>
        </article>

        <article className="panel">
          <h2>Alertas activas</h2>
          {loadingAlerts ? (
            <div className="empty-state">
              <strong>Cargando alertas...</strong>
              <span>Estamos leyendo tus alertas guardadas en Supabase.</span>
            </div>
          ) : alerts.length === 0 ? (
            <div className="empty-state">
              <strong>No hay alertas activas todavía.</strong>
              <span>Cuando registres una alerta, aparecerá inmediatamente aquí.</span>
            </div>
          ) : (
            <ul className="alert-list">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.route}</strong>
                  <span>Meta: {alert.target}</span>
                  <span>{alert.status}</span>
                  <div className="alert-actions">
                    <button type="button" onClick={() => handleEdit(alert.id)}>Editar</button>
                    <button type="button" onClick={() => handleDelete(alert.id)}>Borrar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <h2>Historial y compra</h2>
          {historyRows.length === 0 ? (
            <div className="empty-chart">
              <strong>Sin historial todavía.</strong>
              <span>La gráfica aparecerá cuando lleguen datos reales de Supabase.</span>
            </div>
          ) : (
            <>
              <div className="buy-badge">COMPRA YA</div>
              <div className="line-chart" aria-hidden="true">
                {historyRows.map((point, index) => (
                  <span
                    key={`${point.checkedAt}-${index}`}
                    style={{ height: `${Math.max(20, Math.min(100, point.price / 5000))}%` }}
                  />
                ))}
              </div>
            </>
          )}
          <p className="panel-note">Los datos reales se cargarán desde `price_history`.</p>
        </article>
      </section>
    </main>
  );
}
