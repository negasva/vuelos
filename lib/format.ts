export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/** "3900000" | "3.900.000" -> "3.900.000" for display in inputs. */
export function formatThousands(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("es-CO").format(Number(digits));
}

export function baggageLabel(type: string): string {
  switch (type) {
    case "morral":
      return "Solo morral";
    case "mano_10kg":
      return "Equipaje de mano 10kg";
    case "bodega_23kg":
      return "Bodega 23kg";
    default:
      return "Cualquier equipaje";
  }
}

export function maxStopsLabel(stops: number): string {
  if (stops <= 0) return "Directo";
  if (stops >= 9) return "Cualquier escala";
  return `Hasta ${stops} escala${stops > 1 ? "s" : ""}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days > 1 ? "s" : ""}`;
}
