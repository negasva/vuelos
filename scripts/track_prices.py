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
)
from fli.search import SearchFlights

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_DEFAULT_CHAT_ID = os.environ.get("TELEGRAM_DEFAULT_CHAT_ID", "").strip()

# The app stores no specific travel date (only flex_days), so we watch a rolling
# date this many days out as a sensible default for fare hunting.
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


def fetch_chat_ids(user_ids: list) -> dict:
    if not user_ids:
        return {}
    try:
        rows = supabase_get(f"users?id=in.({in_list(user_ids)})&select=id,telegram_chat_id")
        return {row["id"]: row.get("telegram_chat_id") for row in rows}
    except Exception as error:  # tolerant: fall back to default chat
        print(f"[warn] could not load telegram chat ids: {error}")
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


def search_cheapest(origin: str, destination: str, max_stops: int):
    """Return the cheapest one-way FlightResult, or None. Raises on transport errors."""
    travel_date = (datetime.now() + timedelta(days=SEARCH_LEAD_DAYS)).strftime("%Y-%m-%d")
    filters = FlightSearchFilters(
        passenger_info=PassengerInfo(adults=1),
        flight_segments=[
            FlightSegment(
                departure_airport=[[Airport[origin], 0]],
                arrival_airport=[[Airport[destination], 0]],
                travel_date=travel_date,
            )
        ],
        seat_type=SeatType.ECONOMY,
        stops=STOPS_MAP.get(max_stops, MaxStops.ANY),
        sort_by=SortBy.CHEAPEST,
    )
    results = SearchFlights().search(filters, top_n=5, currency=CURRENCY)
    if not results:
        return None
    # Some Google Flights results come back without a usable price; drop them
    # before picking the cheapest so the comparison can't hit None < float.
    priced = [
        flight
        for flight in results
        if isinstance(getattr(flight, "price", None), (int, float)) and flight.price > 0
    ]
    if not priced:
        return None
    return min(priced, key=lambda flight: flight.price)


def build_message(flight, origin: str, destination: str, target: float, error_fare: bool) -> str:
    header = "🚨 *Posible tarifa de error*" if error_fare else "✈️ *Bajó el precio de tu vuelo*"
    leg = flight.legs[0] if flight.legs else None
    airline = flight.primary_airline_name or (leg.airline.value if leg else "—")
    departure = leg.departure_datetime if leg else None
    lines = [
        header,
        f"*Ruta:* {origin} → {destination}",
        f"*Precio:* {format_cop(flight.price)}",
        f"*Tu objetivo:* {format_cop(target)}",
        f"*Escalas:* {flight.stops}",
        f"*Aerolínea:* {airline}",
    ]
    if departure:
        lines.append(f"*Salida:* {departure}")
    return "\n".join(lines)


def main() -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase config (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
        return 1

    flights = supabase_get("tracked_flights?is_active=eq.true&select=*")
    chat_ids = fetch_chat_ids([f["user_id"] for f in flights])
    stats = fetch_price_stats([f["id"] for f in flights])

    now = datetime.now(timezone.utc).isoformat()
    history_rows: list = []
    errors: list = []
    results_found = 0
    alerts_triggered = 0
    alerts_sent = 0

    for flight in flights:
        origin = (flight.get("origin") or "").strip().upper()
        destination = (flight.get("destination") or "").strip().upper()
        target = float(flight.get("target_price") or 0)

        if origin not in Airport.__members__ or destination not in Airport.__members__:
            errors.append(f"{origin}->{destination}: aeropuerto no soportado por fli")
            continue

        try:
            best = search_cheapest(origin, destination, int(flight.get("max_stops") or 0))
        except Exception as error:
            errors.append(f"{origin}->{destination}: {error}")
            continue

        if best is None:
            continue

        results_found += 1
        price = float(best.price)
        leg = best.legs[0] if best.legs else None
        airline = best.primary_airline_name or (leg.airline.value if leg else None)
        departure = str(leg.departure_datetime) if leg and leg.departure_datetime else None

        history_rows.append(
            {
                "flight_id": flight["id"],
                "price": price,
                "airline": airline,
                "departure_time": departure,
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
            chat_id = (flight.get("telegram_chat_id") or chat_ids.get(flight["user_id"])
                       or TELEGRAM_DEFAULT_CHAT_ID)
            message = build_message(best, origin, destination, target, error_fare)
            if send_telegram(chat_id, message):
                alerts_sent += 1

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
        "alertsTriggered": alerts_triggered,
        "alertsSent": alerts_sent,
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
