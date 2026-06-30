"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type Airport = {
  code: string;
  city: string;
  name: string;
  country: string;
};

export function AirportCombobox({
  label,
  value,
  onChange,
  airports,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  airports: Airport[];
  invalid?: boolean;
}) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => airports.find((airport) => airport.code === value),
    [airports, value]
  );

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return airports.slice(0, 60);
    return airports
      .filter((airport) =>
        `${airport.code} ${airport.city} ${airport.name} ${airport.country}`
          .toLowerCase()
          .includes(search)
      )
      .slice(0, 60);
  }, [airports, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectAirport(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  const displayValue = selected
    ? `${selected.code} — ${selected.city} (${selected.country})`
    : "";

  return (
    <div className="field" ref={containerRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className="combobox">
        <input
          id={inputId}
          className={`combobox-input${invalid ? " is-invalid" : ""}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : displayValue}
          placeholder="Buscar aeropuerto, ciudad o país"
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActiveIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              if (open && results[activeIndex]) {
                event.preventDefault();
                selectAirport(results[activeIndex].code);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {open ? (
          <ul className="combobox-list" id={listId} role="listbox">
            {results.length === 0 ? (
              <li className="combobox-empty">Sin resultados</li>
            ) : (
              results.map((airport, index) => (
                <li
                  key={`${airport.code}-${airport.city}`}
                  role="option"
                  aria-selected={airport.code === value}
                  className={`combobox-option${index === activeIndex ? " is-active" : ""}${
                    airport.code === value ? " is-selected" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectAirport(airport.code);
                  }}
                >
                  <span className="combobox-code">{airport.code}</span>
                  <span className="combobox-city">{airport.city}</span>
                  <span className="combobox-country">{airport.country}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
