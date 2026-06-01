"use client";

import { useMemo, useState } from "react";
import europeAirports from "@/data/europe-airports.json";

type Airport = {
  code: string;
  city: string;
  name: string;
  country: string;
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
    if (!search) return airports.slice(0, 120);
    return airports.filter((airport) =>
      [airport.code, airport.city, airport.name, airport.country].some((field) =>
        field.toLowerCase().includes(search),
      ),
    ).slice(0, 120);
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

export function HomeDashboard() {
  const [origin, setOrigin] = useState("MAD");
  const [destination, setDestination] = useState("CDG");
  const [targetPrice, setTargetPrice] = useState("180000");
  const [baggageType, setBaggageType] = useState("mano_10kg");
  const [nonStopOnly, setNonStopOnly] = useState(false);
  const [visaExclusion, setVisaExclusion] = useState(false);
  const [nightOnly, setNightOnly] = useState(false);

  const originAirport = useMemo(
    () => europeAirports.find((airport) => airport.code === origin),
    [origin]
  );
  const destinationAirport = useMemo(
    () => europeAirports.find((airport) => airport.code === destination),
    [destination]
  );

  const activeAlerts: Array<{
    route: string;
    target: string;
    status: string;
  }> = [];

  const historyRows: Array<{ checkedAt: string; price: number }> = [];

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
            <AirportSelect
              label="Origen"
              value={origin}
              onChange={setOrigin}
              airports={europeAirports}
            />
            <AirportSelect
              label="Destino"
              value={destination}
              onChange={setDestination}
              airports={europeAirports}
            />
            <label>
              Precio objetivo
              <input value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} inputMode="numeric" />
            </label>
            <label>
              Equipaje
              <select value={baggageType} onChange={(event) => setBaggageType(event.target.value)}>
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
            <span>
              Ruta: {origin} → {destination}
            </span>
            <span>Equipaje: {baggageType}</span>
            <span>Precio: COP {Number(targetPrice || 0).toLocaleString("es-CO")}</span>
          </div>

          <button className="primary-btn" type="button">
            Registrar alerta
          </button>
          <p className="panel-note">
            Origen: {originAirport?.city ?? origin} · Destino: {destinationAirport?.city ?? destination}
          </p>
        </article>

        <article className="panel">
          <h2>Alertas activas</h2>
          {activeAlerts.length === 0 ? (
            <div className="empty-state">
              <strong>No hay alertas activas todavía.</strong>
              <span>Cuando conectes Supabase, aquí aparecerán solo las alertas que tú hayas creado.</span>
            </div>
          ) : (
            <ul className="alert-list">
              {activeAlerts.map((alert) => (
                <li key={alert.route}>
                  <strong>{alert.route}</strong>
                  <span>Meta: {alert.target}</span>
                  <span>{alert.status}</span>
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
                  <span key={`${point.checkedAt}-${index}`} style={{ height: `${Math.max(20, Math.min(100, point.price / 5000))}%` }} />
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
