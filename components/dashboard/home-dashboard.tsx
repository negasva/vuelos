"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import airportsCatalog from "@/data/europe-latam-airports.json";
import { AirportCombobox, type Airport } from "./airport-combobox";
import { ThemeToggle } from "./theme-toggle";
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

function airportName(code: string): string {
  const airport = AIRPORTS.find((item) => item.code === code);
  return airport ? `${airport.city} (${airport.code})` : code;
}

function tripLabel(tripType: string, lengthDays: number): string {
  return tripType === "round_trip" ? `Ida y vuelta · ${lengthDays} día(s)` : "Solo ida";
}

function datesLabel(
  departDate: string | null,
  returnDate: string | null,
  tripType: string
): string | null {
  if (!departDate) return null;
  if (tripType === "round_trip" && returnDate) return `${departDate} → ${returnDate}`;
  return departDate;
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
  const [targetPrice, setTargetPrice] = useState("180.000");
  const [baggageType, setBaggageType] = useState("any");
  const [maxStops, setMaxStops] = useState(9);
  const [flexDays, setFlexDays] = useState(0);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">("round_trip");
  const [tripLengthDays, setTripLengthDays] = useState(7);
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
      window.localStorage.setItem("flighttracker_alerts", JSON.stringify(list));
    } catch (error) {
      const cached = window.localStorage.getItem("flighttracker_alerts");
      if (cached) {
        try {
          setAlerts(JSON.parse(cached) as TrackedFlight[]);
        } catch {
          /* ignore malformed cache */
        }
      }
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

  const selectedHistory = useMemo(
    () =>
      history
        .filter((point) => point.flightId === selectedFlightId)
        .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)),
    [history, selectedFlightId]
  );
  const selectedAlert = alerts.find((alert) => alert.id === selectedFlightId) ?? null;

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
      // Reflect the deletion immediately even if the follow-up reload fails
      // (e.g. a pending DB migration making the list query error out).
      setAlerts((current) => {
        const next = current.filter((item) => item.id !== alert.id);
        window.localStorage.setItem("flighttracker_alerts", JSON.stringify(next));
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
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-text">
          <p className="eyebrow">FlightTracker Co</p>
          <h1>Rastreador de vuelos para Colombia</h1>
          <p className="hero-copy">
            Monitorea rutas, detecta tarifas error y recibe alertas inmediatas en Telegram cuando
            el precio cae por debajo de tu objetivo.
          </p>
        </div>
        <div className="hero-side">
          <ThemeToggle />
          <div className="hero-badges">
            <a className="badge-link" href="https://supabase.com" target="_blank" rel="noreferrer">
              Supabase
            </a>
            <a className="badge-link" href="https://apify.com" target="_blank" rel="noreferrer">
              Apify
            </a>
            <a
              className="badge-link"
              href="https://core.telegram.org/bots"
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </a>
          </div>
        </div>
      </section>

      <TelegramSettings notify={notify} />

      <section className="grid-layout">
        <article className="panel">
          <h2>Buscar y alertar</h2>
          <div className="form-grid">
            <AirportCombobox
              label="Origen"
              value={origin}
              onChange={setOrigin}
              airports={AIRPORTS}
              invalid={touched && Boolean(errors.origin)}
            />
            <div className="swap-row">
              <button
                type="button"
                className="ghost-btn swap-btn"
                onClick={swapAirports}
                aria-label="Intercambiar origen y destino"
                title="Intercambiar origen y destino"
              >
                ⇄
              </button>
            </div>
            <AirportCombobox
              label="Destino"
              value={destination}
              onChange={setDestination}
              airports={AIRPORTS}
              invalid={touched && Boolean(errors.destination)}
            />
          </div>
          {touched && errors.destination ? (
            <p className="field-error">{errors.destination}</p>
          ) : null}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="target-price">Precio objetivo (COP)</label>
              <input
                id="target-price"
                className={touched && errors.target ? "is-invalid" : ""}
                value={targetPrice}
                inputMode="numeric"
                placeholder="Ej. 1.800.000"
                onChange={(event) => setTargetPrice(formatThousands(event.target.value))}
              />
              {touched && errors.target ? (
                <p className="field-error">{errors.target}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="baggage">Equipaje</label>
              <select
                id="baggage"
                value={baggageType}
                onChange={(event) => setBaggageType(event.target.value)}
              >
                {BAGGAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="max-stops">Escalas</label>
              <select
                id="max-stops"
                value={maxStops}
                onChange={(event) => setMaxStops(Number(event.target.value))}
              >
                {MAX_STOPS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="flex-days">Flexibilidad (días)</label>
              <select
                id="flex-days"
                value={flexDays}
                onChange={(event) => setFlexDays(Number(event.target.value))}
              >
                {FLEX_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? "Fecha exacta" : `± ${value} día${value > 1 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="trip-type">Tipo de viaje</label>
              <select
                id="trip-type"
                value={tripType}
                onChange={(event) =>
                  setTripType(event.target.value as "one_way" | "round_trip")
                }
              >
                <option value="round_trip">Ida y vuelta</option>
                <option value="one_way">Solo ida</option>
              </select>
            </div>
            {tripType === "round_trip" ? (
              <div className="field">
                <label htmlFor="trip-length">Duración (días, si no eliges regreso)</label>
                <input
                  id="trip-length"
                  type="number"
                  min={1}
                  max={60}
                  value={tripLengthDays}
                  onChange={(event) =>
                    setTripLengthDays(
                      Math.max(1, Math.min(60, Number(event.target.value) || 1))
                    )
                  }
                />
              </div>
            ) : (
              <div className="field" aria-hidden="true" />
            )}
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="depart-date">Fecha de salida (opcional)</label>
              <input
                id="depart-date"
                type="date"
                value={departDate}
                onChange={(event) => setDepartDate(event.target.value)}
              />
            </div>
            {tripType === "round_trip" ? (
              <div className="field">
                <label htmlFor="return-date">Fecha de regreso (opcional)</label>
                <input
                  id="return-date"
                  type="date"
                  className={touched && errors.dates ? "is-invalid" : ""}
                  value={returnDate}
                  min={departDate || undefined}
                  onChange={(event) => setReturnDate(event.target.value)}
                />
              </div>
            ) : (
              <div className="field" aria-hidden="true" />
            )}
          </div>
          {touched && errors.dates ? <p className="field-error">{errors.dates}</p> : null}

          <div className="toggles">
            <TogglePill
              label="Sin escalas"
              active={maxStops === 0}
              onToggle={() => setMaxStops((value) => (value === 0 ? 9 : 0))}
            />
            <TogglePill
              label="Excluir visa (escala en USA)"
              active={visaExclusion}
              onToggle={() => setVisaExclusion((value) => !value)}
            />
            <TogglePill
              label="Horario vampiro (vuelos noche)"
              active={nightOnly}
              onToggle={() => setNightOnly((value) => !value)}
            />
          </div>

          <div className="summary-box">
            <span>
              Ruta: <strong>{airportName(origin)}</strong> → <strong>{airportName(destination)}</strong>
            </span>
            <span>Viaje: {tripLabel(tripType, tripLengthDays)}</span>
            <span>
              Fechas:{" "}
              {datesLabel(departDate || null, returnDate || null, tripType) ??
                "automáticas (~30 días)"}
              {flexDays > 0 ? ` · ±${flexDays} día(s)` : ""}
            </span>
            <span>Equipaje: {baggageLabel(baggageType)}</span>
            <span>Escalas: {maxStopsLabel(maxStops)}</span>
            <span>Objetivo: {formatCOP(targetNumber)}</span>
          </div>

          <button
            className="primary-btn"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Guardando…" : "Registrar alerta"}
          </button>
          <p className="panel-note">
            La alerta se guarda en Supabase y el cron la revisará 6 veces al día.
          </p>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Alertas activas</h2>
            <span className="count-pill">
              {activeCount} activa{activeCount === 1 ? "" : "s"} · {alerts.length} total
            </span>
          </div>

          {alerts.length > 0 ? (
            <div className="list-controls">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filtrar por ruta…"
                aria-label="Filtrar alertas por ruta"
              />
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                aria-label="Ordenar alertas"
              >
                <option value="recent">Más recientes</option>
                <option value="price-asc">Precio: menor a mayor</option>
                <option value="price-desc">Precio: mayor a menor</option>
                <option value="route">Ruta (A-Z)</option>
              </select>
            </div>
          ) : null}

          {alertLoadError ? (
            <div className="empty-state warning">
              <strong>Advertencia de carga</strong>
              <span>{alertLoadError}</span>
            </div>
          ) : null}

          {loadingAlerts ? (
            <div className="skeleton-list">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="empty-state">
              <strong>No hay alertas todavía.</strong>
              <span>Registra tu primera ruta a la izquierda y aparecerá aquí al instante.</span>
            </div>
          ) : visibleAlerts.length === 0 ? (
            <div className="empty-state">
              <strong>Sin coincidencias.</strong>
              <span>Ningún resultado para “{filter}”.</span>
            </div>
          ) : (
            <ul className="alert-list">
              {visibleAlerts.map((alert) => (
                <li key={alert.id} className={alert.is_active ? "" : "is-paused"}>
                  <div className="alert-head">
                    <strong>
                      {alert.origin} → {alert.destination}
                    </strong>
                    <span className={`status-badge ${alert.is_active ? "ok" : "muted"}`}>
                      {alert.is_active ? "Activa" : "Pausada"}
                    </span>
                  </div>
                  <span className="alert-route">
                    {airportName(alert.origin)} → {airportName(alert.destination)}
                  </span>
                  <span className="alert-target">Meta: {formatCOP(alert.target_price)}</span>
                  <div className="chip-row">
                    <span className="chip">{tripLabel(alert.trip_type, alert.trip_length_days)}</span>
                    {datesLabel(alert.depart_date, alert.return_date, alert.trip_type) ? (
                      <span className="chip">
                        {datesLabel(alert.depart_date, alert.return_date, alert.trip_type)}
                      </span>
                    ) : null}
                    <span className="chip">{baggageLabel(alert.baggage_type)}</span>
                    <span className="chip">{maxStopsLabel(alert.max_stops)}</span>
                    {alert.flex_days > 0 ? (
                      <span className="chip">± {alert.flex_days} día(s)</span>
                    ) : null}
                    {alert.visa_exclusion ? <span className="chip">Sin visa USA</span> : null}
                    {alert.night_only ? <span className="chip">Noche</span> : null}
                  </div>
                  <div className="alert-actions">
                    <button type="button" onClick={() => toggleActive(alert)}>
                      {alert.is_active ? "Pausar" : "Reactivar"}
                    </button>
                    <button type="button" onClick={() => setEditing(alert)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setConfirmingDelete(alert)}
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <h2>Historial y precio</h2>
          {alerts.length === 0 ? (
            <div className="empty-chart">
              <strong>Sin rutas que mostrar.</strong>
              <span>Registra una alerta para ver su evolución de precios.</span>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="history-flight">Ruta</label>
                <select
                  id="history-flight"
                  value={selectedFlightId}
                  onChange={(event) => setSelectedFlightId(event.target.value)}
                >
                  {alerts.map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      {alert.origin} → {alert.destination}
                    </option>
                  ))}
                </select>
              </div>
              <HistoryStats history={selectedHistory} target={selectedAlert?.target_price ?? 0} />
              <PriceChart
                points={selectedHistory}
                target={selectedAlert?.target_price ?? 0}
              />
              <p className="panel-note">
                Los datos se llenan automáticamente cada vez que corre el cron.
              </p>
            </>
          )}
        </article>
      </section>

      {editing ? (
        <EditAlertModal
          alert={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      ) : null}

      {confirmingDelete ? (
        <ConfirmDialog
          title="Borrar alerta"
          message={`¿Seguro que quieres borrar ${confirmingDelete.origin} → ${confirmingDelete.destination}? Esta acción no se puede deshacer.`}
          confirmLabel="Borrar"
          onCancel={() => setConfirmingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </main>
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

function HistoryStats({
  history,
  target,
}: {
  history: HistoryPoint[];
  target: number;
}) {
  if (history.length === 0) return null;
  const prices = history.map((point) => point.price);
  const lowest = Math.min(...prices);
  const latest = history[history.length - 1];
  const hitTarget = target > 0 && latest.price <= target;

  return (
    <div className="stats-grid">
      <div className="stat">
        <span className="stat-label">Último precio</span>
        <span className="stat-value">{formatCOP(latest.price)}</span>
        <span className="stat-sub">{relativeTime(latest.checkedAt)}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Mínimo visto</span>
        <span className="stat-value">{formatCOP(lowest)}</span>
        <span className="stat-sub">{history.length} registros</span>
      </div>
      <div className={`stat ${hitTarget ? "stat-good" : ""}`}>
        <span className="stat-label">Vs. objetivo</span>
        <span className="stat-value">{hitTarget ? "¡Compra ya!" : "Por encima"}</span>
        <span className="stat-sub">{formatCOP(target)}</span>
      </div>
    </div>
  );
}

function PriceChart({ points, target }: { points: HistoryPoint[]; target: number }) {
  if (points.length === 0) {
    return (
      <div className="empty-chart">
        <strong>Sin historial todavía.</strong>
        <span>La gráfica aparecerá cuando el cron registre precios.</span>
      </div>
    );
  }

  const width = 320;
  const height = 140;
  const pad = 10;
  const prices = points.map((point) => point.price);
  const allValues = target > 0 ? [...prices, target] : prices;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const toY = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const coords = points.map((point, index) => ({
    x: pad + index * stepX,
    y: toY(point.price),
  }));
  const linePath = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const targetY = target > 0 ? toY(target) : null;

  return (
    <svg
      className="price-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Evolución del precio"
    >
      {targetY !== null ? (
        <line
          x1={pad}
          x2={width - pad}
          y1={targetY}
          y2={targetY}
          className="chart-target"
        />
      ) : null}
      {points.length > 1 ? (
        <polyline className="chart-line" points={linePath} fill="none" />
      ) : null}
      {coords.map((c, index) => (
        <circle key={index} cx={c.x} cy={c.y} r={3} className="chart-dot" />
      ))}
    </svg>
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
  const [origin, setOrigin] = useState(alert.origin);
  const [destination, setDestination] = useState(alert.destination);
  const [target, setTarget] = useState(formatThousands(String(alert.target_price)));
  const [baggageType, setBaggageType] = useState(alert.baggage_type);
  const [maxStops, setMaxStops] = useState(alert.max_stops);
  const [flexDays, setFlexDays] = useState(alert.flex_days);
  const [tripType, setTripType] = useState<"one_way" | "round_trip">(alert.trip_type);
  const [tripLengthDays, setTripLengthDays] = useState(alert.trip_length_days);
  const [departDate, setDepartDate] = useState(alert.depart_date ?? "");
  const [returnDate, setReturnDate] = useState(alert.return_date ?? "");
  const [visaExclusion, setVisaExclusion] = useState(alert.visa_exclusion);
  const [nightOnly, setNightOnly] = useState(alert.night_only);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const targetNumber = Number(onlyDigits(target));
  const datesValid = !(
    tripType === "round_trip" &&
    departDate &&
    returnDate &&
    returnDate < departDate
  );
  const valid = origin !== destination && targetNumber > 0 && datesValid;

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Editar alerta"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3>Editar alerta</h3>
        <div className="form-grid">
          <AirportCombobox label="Origen" value={origin} onChange={setOrigin} airports={AIRPORTS} />
          <AirportCombobox
            label="Destino"
            value={destination}
            onChange={setDestination}
            airports={AIRPORTS}
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="edit-target">Precio objetivo (COP)</label>
            <input
              id="edit-target"
              value={target}
              inputMode="numeric"
              onChange={(event) => setTarget(formatThousands(event.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-baggage">Equipaje</label>
            <select
              id="edit-baggage"
              value={baggageType}
              onChange={(event) => setBaggageType(event.target.value)}
            >
              {BAGGAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="edit-stops">Escalas</label>
            <select
              id="edit-stops"
              value={maxStops}
              onChange={(event) => setMaxStops(Number(event.target.value))}
            >
              {MAX_STOPS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-flex">Flexibilidad (días)</label>
            <select
              id="edit-flex"
              value={flexDays}
              onChange={(event) => setFlexDays(Number(event.target.value))}
            >
              {FLEX_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "Fecha exacta" : `± ${value} día(s)`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="edit-trip-type">Tipo de viaje</label>
            <select
              id="edit-trip-type"
              value={tripType}
              onChange={(event) => setTripType(event.target.value as "one_way" | "round_trip")}
            >
              <option value="round_trip">Ida y vuelta</option>
              <option value="one_way">Solo ida</option>
            </select>
          </div>
          {tripType === "round_trip" ? (
            <div className="field">
              <label htmlFor="edit-trip-length">Duración del viaje (días)</label>
              <input
                id="edit-trip-length"
                type="number"
                min={1}
                max={60}
                value={tripLengthDays}
                onChange={(event) =>
                  setTripLengthDays(Math.max(1, Math.min(60, Number(event.target.value) || 1)))
                }
              />
            </div>
          ) : (
            <div className="field" aria-hidden="true" />
          )}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="edit-depart-date">Fecha de salida (opcional)</label>
            <input
              id="edit-depart-date"
              type="date"
              value={departDate}
              onChange={(event) => setDepartDate(event.target.value)}
            />
          </div>
          {tripType === "round_trip" ? (
            <div className="field">
              <label htmlFor="edit-return-date">Fecha de regreso (opcional)</label>
              <input
                id="edit-return-date"
                type="date"
                value={returnDate}
                min={departDate || undefined}
                onChange={(event) => setReturnDate(event.target.value)}
              />
            </div>
          ) : (
            <div className="field" aria-hidden="true" />
          )}
        </div>
        <div className="toggles">
          <TogglePill
            label="Excluir visa"
            active={visaExclusion}
            onToggle={() => setVisaExclusion((value) => !value)}
          />
          <TogglePill
            label="Horario vampiro"
            active={nightOnly}
            onToggle={() => setNightOnly((value) => !value)}
          />
        </div>
        {!valid ? (
          <p className="field-error">
            Revisa que el precio sea mayor a 0 y que origen y destino sean distintos.
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!valid}
            onClick={() =>
              onSave({
                id: alert.id,
                origin,
                destination,
                target_price: targetNumber,
                baggage_type: baggageType as TrackedFlight["baggage_type"],
                max_stops: maxStops,
                flex_days: flexDays,
                trip_type: tripType,
                trip_length_days: tripLengthDays,
                depart_date: departDate || null,
                return_date: tripType === "round_trip" ? returnDate || null : null,
                visa_exclusion: visaExclusion,
                night_only: nightOnly,
              })
            }
          >
            Guardar cambios
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
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal modal-sm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3>{title}</h3>
        <p className="panel-note">{message}</p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary-btn danger-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TelegramSettings({ notify }: { notify: (message: string, type?: "success" | "error" | "info") => void }) {
  const [chatId, setChatId] = useState("");
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/settings");
        const payload = (await response.json()) as {
          ok?: boolean;
          telegram_chat_id?: string | null;
          notify_email?: string | null;
        };
        if (!cancelled && response.ok && payload.ok) {
          setChatId(payload.telegram_chat_id ?? "");
          setEmail(payload.notify_email ?? "");
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify("El correo no parece válido.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_chat_id: chatId, notify_email: email }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "No se pudo guardar");
      notify("Notificaciones guardadas.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-bar">
      <div className="settings-text">
        <strong>Notificaciones</strong>
        <span>
          Telegram: tu chat ID (escribe a <code>@userinfobot</code>). Correo: dónde recibir las
          alertas. Puedes usar uno o ambos; deja vacío lo que no quieras.
        </span>
      </div>
      <div className="settings-input">
        <input
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          placeholder={loaded ? "Telegram chat ID" : "Cargando…"}
          inputMode="numeric"
          aria-label="Telegram chat ID"
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tucorreo@ejemplo.com"
          type="email"
          aria-label="Correo para alertas"
        />
        <button type="button" className="primary-btn" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}
