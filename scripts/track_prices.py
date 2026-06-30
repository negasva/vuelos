#!/usr/bin/env python3
"""Flight price tracker cron.

Searches Google Flights via the `fli` library (free, no API key), records price
history in Supabase, and sends Telegram alerts when a tracked flight drops to or
below its target price, falls 20%+ vs. the previous check, or looks like an
error fare. Designed to run in GitHub Actions.

Required environment variables:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN
Optional:
  TELEGRAM_DEFAULT_CHAT_ID  (fallback chat when a user has no telegram_chat_id)
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests
from fli.models import (
    Airport,
    FlightSearchFilters,
    FlightSegment,
    MaxStops,
    PassengerInfo,
    SeatType,
    SortBy,
    TripType,
)
from fli.search import SearchFlights

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_DEFAULT_CHAT_ID = os.environ.get("TELEGRAM_DEFAULT_CHAT_ID", "").strip()
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "FlightTracker <onboarding@resend.dev>")
ALERT_EMAIL_TO = os.environ.get("ALERT_EMAIL_TO", "").strip()

# When a tracked flight has no explicit departure date, watch a rolling date
# this many days out as a sensible default for fare hunting.
SEARCH_LEAD_DAYS = 30
CURRENCY = "COP"

STOPS_MAP = {
    0: MaxStops.NON_STOP,
    1: MaxStops.ONE_STOP_OR_FEWER,
    2: MaxStops.TWO_OR_FEWER_STOPS,
}


def supabase_get(path: str):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept": "application/json",
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def supabase_insert(path: str, rows: list) -> None:
    if not rows:
        return
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        data=json.dumps(rows),
        timeout=30,
    )
    response.raise_for_status()


def in_list(ids: list) -> str:
    return ",".join(f'"{value}"' for value in ids)


def fetch_users(user_ids: list) -> dict:
    """Map user_id -> {telegram_chat_id, notify_email}. Tolerant of failures."""
    if not user_ids:
        return {}
    try:
        rows = supabase_get(
            f"users?id=in.({in_list(user_ids)})&select=id,telegram_chat_id,notify_email"
        )
        return {
            row["id"]: {
                "telegram_chat_id": row.get("telegram_chat_id"),
                "notify_email": row.get("notify_email"),
            }
            for row in rows
        }
    except Exception as error:  # tolerant: fall back to defaults
        print(f"[warn] could not load user contacts: {error}")
        return {}


def fetch_price_stats(flight_ids: list) -> dict:
    if not flight_ids:
        return {}
    try:
        rows = supabase_get(
            f"price_history?flight_id=in.({in_list(flight_ids)})"
            "&select=flight_id,price&order=checked_at.desc"
        )
    except Exception as error:
        print(f"[warn] could not load price history: {error}")
        return {}

    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row["flight_id"], []).append(float(row["price"]))

    stats = {}
    for flight_id, prices in grouped.items():
        previous = prices[0] if prices else None  # newest first
        average = sum(prices) / len(prices) if prices else None
        stats[flight_id] = {"previous": previous, "average": average}
    return stats


def format_cop(value: float) -> str:
    return "COP " + f"{round(value):,}".replace(",", ".")


def parse_date(value):
    """Parse a 'YYYY-MM-DD' string into a datetime, or None."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError:
        return None


def send_telegram(chat_id: str, text: str) -> bool:
    if not TELEGRAM_TOKEN:
        print("[warn] TELEGRAM_BOT_TOKEN not set")
        return False
    if not chat_id:
        print("[warn] no chat id for alert")
        return False
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=30,
        )
        if response.status_code != 200:
            print(f"[warn] telegram sendMessage {response.status_code}: {response.text[:200]}")
            return False
        return True
    except Exception as error:
        print(f"[warn] telegram send failed: {error}")
        return False


def send_email(to_addr, subject, html) -> bool:
    if not RESEND_API_KEY:
        print("[warn] RESEND_API_KEY not set")
        return False
    if not to_addr:
        print("[warn] no recipient email for alert")
        return False
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"from": RESEND_FROM, "to": [to_addr], "subject": subject, "html": html},
            timeout=30,
        )
        if response.status_code not in (200, 201):
            print(f"[warn] resend {response.status_code}: {response.text[:200]}")
            return False
        return True
    except Exception as error:
        print(f"[warn] email send failed: {error}")
        return False


def _price_of(item):
    """Total price of a result. For round-trip tuples the combined total is on
    the last (return) result, matching Google Flights' behaviour."""
    target = item[-1] if isinstance(item, tuple) else item
    price = getattr(target, "price", None)
    return price if isinstance(price, (int, float)) else None


def search_quote(origin, destination, max_stops, trip_type, depart_dt, return_dt):
    """Search a single departure (and optional return) date. Returns a quote
    dict or None. Raises on transport errors."""
    segments = [
        FlightSegment(
            departure_airport=[[Airport[origin], 0]],
            arrival_airport=[[Airport[destination], 0]],
            travel_date=depart_dt.strftime("%Y-%m-%d"),
        )
    ]
    if trip_type == "round_trip" and return_dt is not None:
        segments.append(
            FlightSegment(
                departure_airport=[[Airport[destination], 0]],
                arrival_airport=[[Airport[origin], 0]],
                travel_date=return_dt.strftime("%Y-%m-%d"),
            )
        )
        fli_trip = TripType.ROUND_TRIP
    else:
        fli_trip = TripType.ONE_WAY

    filters = FlightSearchFilters(
        trip_type=fli_trip,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=segments,
        seat_type=SeatType.ECONOMY,
        stops=STOPS_MAP.get(max_stops, MaxStops.ANY),
        sort_by=SortBy.CHEAPEST,
    )
    results = SearchFlights().search(filters, top_n=5, currency=CURRENCY)
    if not results:
        return None

    # Drop results without a usable price so min() can't hit None < float.
    priced = [item for item in results if (_price_of(item) or 0) > 0]
    if not priced:
        return None

    best = min(priced, key=lambda item: _price_of(item))
    outbound = best[0] if isinstance(best, tuple) else best
    leg = outbound.legs[0] if outbound.legs else None
    return {
        "price": float(_price_of(best)),
        "airline": outbound.primary_airline_name or (leg.airline.value if leg else None),
        "departure_time": str(leg.departure_datetime) if leg and leg.departure_datetime else None,
        "stops": outbound.stops,
        "depart_date": depart_dt.strftime("%Y-%m-%d"),
        "return_date": return_dt.strftime("%Y-%m-%d") if (return_dt and fli_trip == TripType.ROUND_TRIP) else None,
    }


def search_best_quote(origin, destination, max_stops, trip_type, base_depart, base_return, flex_days):
    """Search the ±flex_days window (shifting both dates to keep the trip length)
    and return the cheapest quote. Raises if every attempt errored."""
    today = datetime.now().date()
    best = None
    last_error = None
    for offset in range(-flex_days, flex_days + 1):
        depart_dt = base_depart + timedelta(days=offset)
        if depart_dt.date() < today:
            continue  # never search dates in the past
        return_dt = (base_return + timedelta(days=offset)) if base_return else None
        try:
            quote = search_quote(origin, destination, max_stops, trip_type, depart_dt, return_dt)
        except Exception as error:
            last_error = error
            continue
        if quote and (best is None or quote["price"] < best["price"]):
            best = quote
    if best is None and last_error is not None:
        raise last_error
    return best


def _trip_lines(quote, origin, destination, target, trip_type):
    trip = "Ida y vuelta" if trip_type == "round_trip" else "Solo ida"
    dates = quote.get("depart_date") or "—"
    if quote.get("return_date"):
        dates = f"{quote['depart_date']} → {quote['return_date']}"
    lines = [
        ("Ruta", f"{origin} → {destination}"),
        ("Viaje", trip),
        ("Fechas", dates),
        ("Precio", format_cop(quote["price"])),
        ("Tu objetivo", format_cop(target)),
        ("Escalas", str(quote["stops"])),
        ("Aerolínea", quote["airline"] or "—"),
    ]
    if quote.get("departure_time"):
        lines.append(("Salida", str(quote["departure_time"])))
    return lines


def build_message(quote, origin, destination, target, trip_type, error_fare):
    header = "🚨 *Posible tarifa de error*" if error_fare else "✈️ *Bajó el precio de tu vuelo*"
    body = "\n".join(f"*{label}:* {value}" for label, value in _trip_lines(quote, origin, destination, target, trip_type))
    return f"{header}\n{body}"


def build_email(quote, origin, destination, target, trip_type, error_fare):
    title = "🚨 Posible tarifa de error" if error_fare else "✈️ Bajó el precio de tu vuelo"
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#64748b'>{label}</td>"
        f"<td style='padding:4px 0;font-weight:600'>{value}</td></tr>"
        for label, value in _trip_lines(quote, origin, destination, target, trip_type)
    )
    html = (
        f"<div style='font-family:system-ui,sans-serif'>"
        f"<h2>{title}</h2><table>{rows}</table>"
        f"<p style='color:#94a3b8;font-size:12px'>FlightTracker Co</p></div>"
    )
    subject = f"{'🚨 Tarifa error' if error_fare else '✈️ Bajó'}: {origin}→{destination} {format_cop(quote['price'])}"
    return subject, html


def main() -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase config (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
        return 1

    flights = supabase_get("tracked_flights?is_active=eq.true&select=*")
    users = fetch_users([f["user_id"] for f in flights])
    stats = fetch_price_stats([f["id"] for f in flights])

    now = datetime.now(timezone.utc).isoformat()
    history_rows: list = []
    errors: list = []
    results_found = 0
    alerts_triggered = 0
    alerts_sent = 0
    emails_sent = 0

    for flight in flights:
        origin = (flight.get("origin") or "").strip().upper()
        destination = (flight.get("destination") or "").strip().upper()
        target = float(flight.get("target_price") or 0)
        trip_type = flight.get("trip_type") or "one_way"
        trip_length_days = int(flight.get("trip_length_days") or 7)
        flex_days = max(0, min(3, int(flight.get("flex_days") or 0)))

        if origin not in Airport.__members__ or destination not in Airport.__members__:
            errors.append(f"{origin}->{destination}: aeropuerto no soportado por fli")
            continue

        # Resolve base departure/return dates (explicit, or sensible fallbacks).
        base_depart = parse_date(flight.get("depart_date")) or (
            datetime.now() + timedelta(days=SEARCH_LEAD_DAYS)
        )
        if trip_type == "round_trip":
            base_return = parse_date(flight.get("return_date")) or (
                base_depart + timedelta(days=trip_length_days)
            )
        else:
            base_return = None

        try:
            quote = search_best_quote(
                origin, destination, int(flight.get("max_stops") or 0),
                trip_type, base_depart, base_return, flex_days,
            )
        except Exception as error:
            errors.append(f"{origin}->{destination}: {error}")
            continue

        if quote is None:
            continue

        results_found += 1
        price = quote["price"]

        history_rows.append(
            {
                "flight_id": flight["id"],
                "price": price,
                "airline": quote["airline"],
                "departure_time": quote["departure_time"],
                "checked_at": now,
            }
        )

        flight_stats = stats.get(flight["id"], {"previous": None, "average": None})
        previous = flight_stats["previous"]
        average = flight_stats["average"]
        error_fare = bool(average and average > 0 and price <= average * 0.3)
        big_drop = bool(previous and previous > 0 and price <= previous * 0.8)

        if price <= target or big_drop or error_fare:
            alerts_triggered += 1
            contact = users.get(flight["user_id"], {})

            chat_id = (flight.get("telegram_chat_id") or contact.get("telegram_chat_id")
                       or TELEGRAM_DEFAULT_CHAT_ID)
            message = build_message(quote, origin, destination, target, trip_type, error_fare)
            if chat_id and send_telegram(chat_id, message):
                alerts_sent += 1

            email_to = contact.get("notify_email") or ALERT_EMAIL_TO
            if email_to:
                subject, html = build_email(
                    quote, origin, destination, target, trip_type, error_fare
                )
                if send_email(email_to, subject, html):
                    emails_sent += 1

    try:
        supabase_insert("price_history", history_rows)
    except Exception as error:
        errors.append(f"price_history insert: {error}")

    summary = {
        "ok": True,
        "groupsProcessed": len(flights),
        "fliResults": results_found,
        "errors": len(errors),
        "sampleError": errors[0] if errors else None,
        "telegramConfigured": bool(TELEGRAM_TOKEN),
        "emailConfigured": bool(RESEND_API_KEY),
        "alertsTriggered": alerts_triggered,
        "alertsSent": alerts_sent,
        "emailsSent": emails_sent,
    }
    print("SUMMARY:", json.dumps(summary, ensure_ascii=False))
    for error in errors:
        print("  -", error)

    # Red X only when there was work to do but every search failed.
    if flights and results_found == 0 and len(errors) >= len(flights):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
