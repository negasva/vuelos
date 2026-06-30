export type FlightAlert = {
  flightId: string;
  origin: string;
  destination: string;
  price: number;
  airline: string | null;
  departureTime: string | null;
  targetPrice: number;
  errorFare: boolean;
  telegramChatId: string | null;
};

const TELEGRAM_API = "https://api.telegram.org";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildAlertMessage(alert: FlightAlert): string {
  const lines = [
    alert.errorFare
      ? "🚨 *Posible tarifa de error*"
      : "✈️ *Bajó el precio de tu vuelo*",
    `*Ruta:* ${alert.origin} → ${alert.destination}`,
    `*Precio:* ${formatPrice(alert.price)}`,
    `*Tu objetivo:* ${formatPrice(alert.targetPrice)}`,
  ];
  if (alert.airline) lines.push(`*Aerolínea:* ${alert.airline}`);
  if (alert.departureTime) lines.push(`*Salida:* ${alert.departureTime}`);
  return lines.join("\n");
}

export async function sendTelegramAlert(alert: FlightAlert): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = alert.telegramChatId ?? process.env.TELEGRAM_DEFAULT_CHAT_ID ?? null;

  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN is not configured");
    return false;
  }
  if (!chatId) {
    console.error("[telegram] no chat id available for alert", alert.flightId);
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildAlertMessage(alert),
        parse_mode: "Markdown",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error(
        `[telegram] sendMessage failed ${response.status}: ${details.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[telegram] sendMessage threw", error);
    return false;
  }
}

export async function dispatchAlerts(alerts: FlightAlert[]): Promise<number> {
  let sent = 0;
  for (const alert of alerts) {
    if (await sendTelegramAlert(alert)) sent += 1;
  }
  return sent;
}
