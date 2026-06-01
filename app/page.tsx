export default function HomePage() {
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
            <label>
              Origen
              <input defaultValue="MDE" />
            </label>
            <label>
              Destino
              <input defaultValue="BOG" />
            </label>
            <label>
              Precio objetivo
              <input defaultValue="180000" />
            </label>
            <label>
              Equipaje
              <select defaultValue="mano_10kg">
                <option value="morral">Solo morral</option>
                <option value="mano_10kg">Mano 10kg</option>
                <option value="bodega_23kg">Bodega 23kg</option>
              </select>
            </label>
          </div>
          <div className="toggles">
            <span>Sin escalas</span>
            <span>Excluir visa</span>
            <span>Horario vampiro</span>
          </div>
          <button className="primary-btn">Registrar alerta</button>
        </article>

        <article className="panel">
          <h2>Alertas activas</h2>
          <ul className="alert-list">
            <li>
              <strong>MDE → BOG</strong>
              <span>Meta: COP 180.000</span>
            </li>
            <li>
              <strong>BOG → CTG</strong>
              <span>Meta: COP 120.000</span>
            </li>
            <li>
              <strong>JFK → BOG</strong>
              <span>Meta: COP 750.000</span>
            </li>
          </ul>
        </article>

        <article className="panel">
          <h2>Historial y compra</h2>
          <div className="buy-badge">COMPRA YA</div>
          <div className="chart-placeholder">
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
          <p className="panel-note">Precio en punto bajo histórico con tendencia estable.</p>
        </article>
      </section>
    </main>
  );
}
