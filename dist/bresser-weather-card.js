/*
 * Bresser weather card for Home Assistant
 * Live readings of a Bresser weather station laid out like the built-in weather forecast card:
 * condition icon, current temperature, all station readings, and a strip of the last hours
 * (temperature and rain) where the forecast card shows its forecast.
 *
 * Not affiliated with Bresser; no manufacturer logo, wordmark or artwork is used.
 */

const CARD_VERSION = "1.0.0";

// key: [domains, test(friendly name with the prefix removed, state)]
// Entities are matched among those whose friendly name starts with the prefix (default "Bresser").
const ENTITY_KEYS = {
  temperature: [["sensor"], (n, st) => /^(temperature|temperatura)$/i.test(n) || dc(st) === "temperature"],
  humidity: [["sensor"], (n, st) => /^(humidity|wilgotno)/i.test(n) || dc(st) === "humidity"],
  illuminance: [["sensor"], (n, st) => /^(illuminance|światło|natężenie)/i.test(n) || dc(st) === "illuminance"],
  uv: [["sensor"], (n) => /^uv/i.test(n)],
  wind_average: [["sensor"], (n) => /^wind (average|avg|speed)$|^wiatr (średni|średnia)/i.test(n)],
  wind_max: [["sensor"], (n) => /^wind (max|gust)|^(porywy|wiatr w porywach)/i.test(n)],
  wind_direction: [["sensor"], (n, st) => /^(wind direction|kierunek wiatru)$/i.test(n) && num(st.state) !== null],
  wind_direction_str: [["sensor"], (n, st) => /^(wind direction|kierunek wiatru)/i.test(n) && num(st.state) === null],
  rain_last_hour: [["sensor"], (n) => /rain last hour|opad.*ostatnia godzina/i.test(n)],
  rain_hour: [["sensor"], (n) => /^opad mm\/h$|^rain (this )?hour$/i.test(n)],
  rain_day: [["sensor"], (n) => /^opad mm\/dzie|^rain (today|daily|day)$/i.test(n)],
  rain_week: [["sensor"], (n) => /^opad mm\/tydzie|^rain (weekly|week)$/i.test(n)],
  rain_month: [["sensor"], (n) => /^opad mm\/miesi|^rain (monthly|month)$/i.test(n)],
  rain_year: [["sensor"], (n) => /^opad mm\/rok|^rain (yearly|year)$/i.test(n)],
  rain_total: [["sensor"], (n) => /^(rain|opad|rain total|opad całkowity)$/i.test(n)],
  rssi: [["sensor"], (n, st) => /^(rssi|sygnał)/i.test(n) || dc(st) === "signal_strength"],
  battery: [["binary_sensor", "sensor"], (n, st) => /^(battery|bateria)/i.test(n) || dc(st) === "battery"],
};

// Values that change with every radio packet; the newest of them tells how fresh the data is.
const LIVE_KEYS = ["temperature", "humidity", "wind_average", "wind_max", "wind_direction", "illuminance", "rssi"];

const CONDITIONS = {
  sunny: ["mdi:weather-sunny", "Słonecznie", "sun"],
  partlycloudy: ["mdi:weather-partly-cloudy", "Częściowe zachmurzenie", "sun"],
  cloudy: ["mdi:weather-cloudy", "Pochmurno", "cloud"],
  rainy: ["mdi:weather-rainy", "Deszcz", "rain"],
  pouring: ["mdi:weather-pouring", "Ulewa", "rain"],
  snowy: ["mdi:weather-snowy", "Śnieg", "snow"],
  "snowy-rainy": ["mdi:weather-snowy-rainy", "Deszcz ze śniegiem", "snow"],
  windy: ["mdi:weather-windy", "Wietrznie", "cloud"],
  dawn: ["mdi:weather-sunset-up", "Świt", "sun"],
  dusk: ["mdi:weather-sunset-down", "Zmierzch", "sun"],
  night: ["mdi:weather-night", "Noc", "moon"],
  // Names of the core weather entity, for condition_entity
  "clear-night": ["mdi:weather-night", "Pogodna noc", "moon"],
  fog: ["mdi:weather-fog", "Mgła", "cloud"],
  hail: ["mdi:weather-hail", "Grad", "snow"],
  lightning: ["mdi:weather-lightning", "Burza", "rain"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "Burza z deszczem", "rain"],
  "windy-variant": ["mdi:weather-windy-variant", "Wietrznie, pochmurno", "cloud"],
  exceptional: ["mdi:alert-circle-outline", "Wyjątkowe warunki", "cloud"],
};

const BEAUFORT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118, Infinity];
const BEAUFORT_NAMES = [
  "cisza", "powiew", "słaby wiatr", "łagodny wiatr", "umiarkowany wiatr", "dość silny wiatr", "silny wiatr",
  "bardzo silny wiatr", "sztorm", "silny sztorm", "bardzo silny sztorm", "gwałtowny sztorm", "huragan",
];
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const UV_LEVELS = [[3, "niski"], [6, "umiarkowany"], [8, "wysoki"], [11, "bardzo wysoki"], [Infinity, "ekstremalny"]];

const num = (v) => {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const dc = (st) => st && st.attributes && st.attributes.device_class;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const unavailable = (st) => !st || st.state === "unavailable" || st.state === "unknown";
const comma = (v, d) => v.toFixed(d).replace(".", ",").replace(/^-(?=.*[1-9])/, "−").replace(/^-/, "");
const unit = (st) => (st && st.attributes && st.attributes.unit_of_measurement) || "";
const pad = (n) => String(n).padStart(2, "0");

// Wind speed in km/h, whatever unit the sensor reports.
const toKmh = (v, u) => {
  if (v === null) return null;
  switch ((u || "km/h").toLowerCase()) {
    case "m/s": return v * 3.6;
    case "mph": return v * 1.609344;
    case "kn": case "kt": return v * 1.852;
    default: return v;
  }
};

// Solar elevation in degrees (NOAA approximation, good to a fraction of a degree).
const sunElevation = (date, lat, lon) => {
  const rad = Math.PI / 180;
  const day = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const g = (2 * Math.PI / 365) * (day - 1 + (date.getUTCHours() - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + eqt + 4 * lon;
  const ha = (minutes / 4 - 180) * rad;
  const cosZ = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / rad;
};

class BresserWeatherCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = {
      prefix: "Bresser",
      name: "Bresser",
      hours_to_show: 8,
      stale_after: 300,
      clear_sky_lux: 110000,
      ...config,
    };
    this._entities = null;
    this._history = null;
    this._historyAt = 0;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    }
  }

  connectedCallback() {
    // Data age moves on its own; history is refreshed every 5 minutes.
    this._tick = setInterval(() => {
      this._render();
      if (Date.now() - this._historyAt > 300000) this._loadHistory();
    }, 15000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entities) {
      this._resolve();
      this._loadHistory();
    }
    const cond = this._config.condition_entity;
    const sig = [...Object.values(this._entities), cond]
      .filter(Boolean)
      .map((id) => (hass.states[id] ? hass.states[id].state + "|" + hass.states[id].last_updated : "-"))
      .join(",");
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  // ------------------------------------------------------------------ entity discovery
  _resolve() {
    const explicit = this._config.entities || {};
    const prefix = String(this._config.prefix || "").trim();
    const strip = (fname) =>
      prefix && fname.toLowerCase().startsWith(prefix.toLowerCase() + " ") ? fname.slice(prefix.length + 1).trim() : null;
    const candidates = Object.values(this._hass.states)
      .map((st) => ({ st, name: strip(st.attributes.friendly_name || "") }))
      .filter((c) => c.name !== null);
    const found = {};
    for (const [key, [domains, test]] of Object.entries(ENTITY_KEYS)) {
      if (explicit[key]) {
        found[key] = explicit[key];
        continue;
      }
      for (const domain of domains) {
        const hit = candidates.find(
          (c) => c.st.entity_id.startsWith(domain + ".") && !Object.values(found).includes(c.st.entity_id) && test(c.name, c.st)
        );
        if (hit) {
          found[key] = hit.st.entity_id;
          break;
        }
      }
    }
    this._entities = found;
  }

  _st(key) {
    const id = this._entities && this._entities[key];
    return id ? this._hass.states[id] : undefined;
  }

  _num(key) {
    const st = this._st(key);
    return unavailable(st) ? null : num(st.state);
  }

  // ------------------------------------------------------------------ history
  async _loadHistory() {
    const keys = ["temperature", "wind_max", "illuminance", this._entities.rain_total ? "rain_total" : "rain_hour"];
    const ids = keys.map((k) => this._entities && this._entities[k]).filter(Boolean);
    if (!this._hass || !ids.length || this._historyBusy) return;
    this._historyBusy = true;
    this._historyAt = Date.now();
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - 24 * 3600000).toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const series = (key) =>
        (res[this._entities[key]] || [])
          .map((p) => ({ t: (p.lu ?? p.lc ?? Date.parse(p.last_updated) / 1000) * 1000, v: num(p.s ?? p.state) }))
          .filter((p) => p.v !== null && Number.isFinite(p.t));
      this._history = {};
      for (const k of keys) this._history[k] = series(k);
      this._render();
    } catch (err) {
      console.warn("bresser-weather-card: history unavailable", err);
    } finally {
      this._historyBusy = false;
    }
  }

  // Last N full hours (and the current one): temperature at the end of the hour, rain within it,
  // mean light for the icon.
  _hours() {
    const h = this._history;
    if (!h || !(h.temperature || []).length) return [];
    const n = Math.max(3, Math.min(24, this._config.hours_to_show));
    const top = new Date();
    top.setMinutes(0, 0, 0);
    const rainKey = this._entities.rain_total ? "rain_total" : "rain_hour";
    const valueAt = (pts, t) => {
      let v = null;
      for (const p of pts) {
        if (p.t > t) break;
        v = p.v;
      }
      return v;
    };
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = top.getTime() - i * 3600000;
      const end = Math.min(start + 3600000, Date.now());
      const temp = valueAt(h.temperature, end);
      const inside = (pts) => (pts || []).filter((p) => p.t >= start && p.t < end);
      let rain = null;
      const rp = h[rainKey] || [];
      if (rp.length) {
        if (rainKey === "rain_total") {
          // Counter: add up increases, a drop means it was reset.
          let prev = valueAt(rp, start);
          rain = 0;
          for (const p of inside(rp)) {
            if (prev !== null && p.v > prev) rain += p.v - prev;
            prev = p.v;
          }
        } else {
          rain = Math.max(0, ...inside(rp).map((p) => p.v));
        }
      }
      const lux = inside(h.illuminance);
      const luxMean = lux.length ? lux.reduce((a, p) => a + p.v, 0) / lux.length : valueAt(h.illuminance || [], end);
      const mid = new Date((start + end) / 2);
      out.push({
        label: `${pad(new Date(start).getHours())}:00`,
        temp,
        rain,
        condition: this._condition({ rain, t: temp, lux: luxMean, when: mid }),
        current: i === 0,
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ derived values
  _condition({ rain, t, lux, wind, when }) {
    if (rain !== null && rain > 0) {
      if (t !== null && t <= 0) return "snowy";
      if (t !== null && t <= 2) return "snowy-rainy";
      return rain >= 4 ? "pouring" : "rainy";
    }
    const cfg = this._hass && this._hass.config;
    const elev = cfg && Number.isFinite(cfg.latitude) ? sunElevation(when || new Date(), cfg.latitude, cfg.longitude) : null;
    let sky;
    if (elev !== null) {
      if (elev < -4) sky = "night";
      else if (elev < 4) sky = (when || new Date()).getHours() < 12 ? "dawn" : "dusk";
      else if (lux === null) sky = "partlycloudy";
      else {
        const ratio = lux / (this._config.clear_sky_lux * Math.sin((elev * Math.PI) / 180));
        sky = ratio >= 0.55 ? "sunny" : ratio >= 0.25 ? "partlycloudy" : "cloudy";
      }
    } else if (lux !== null) {
      sky = lux < 50 ? "night" : lux >= 40000 ? "sunny" : lux >= 15000 ? "partlycloudy" : "cloudy";
    } else sky = "cloudy";
    if (wind !== null && wind !== undefined && wind >= 39 && sky !== "night") return "windy";
    return sky;
  }

  _derived() {
    const t = this._num("temperature");
    const rh = this._num("humidity");
    const v = toKmh(this._num("wind_average"), unit(this._st("wind_average")));
    let dew = null;
    if (t !== null && rh !== null && rh > 0) {
      const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
      dew = (243.12 * g) / (17.62 - g);
    }
    let feels = t;
    if (t !== null && v !== null && t <= 10 && v > 4.8) {
      const p = Math.pow(v, 0.16);
      feels = 13.12 + 0.6215 * t - 11.37 * p + 0.3965 * t * p;
    } else if (t !== null && rh !== null && t >= 27 && rh >= 40) {
      const f = t * 1.8 + 32;
      const hi =
        -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f -
        0.05481717 * rh * rh + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
      feels = (hi - 32) / 1.8;
    }
    return { t, rh, v, dew, feels };
  }

  _age() {
    let newest = 0;
    for (const k of LIVE_KEYS) {
      const st = this._st(k);
      if (st && st.state !== "unavailable") newest = Math.max(newest, Date.parse(st.last_updated) || 0);
    }
    return newest ? Math.max(0, (Date.now() - newest) / 1000) : null;
  }

  // ------------------------------------------------------------------ actions
  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && n.dataset.action);
    if (!el) return;
    if (el.dataset.action === "more") {
      const id = el.dataset.arg.includes(".") ? el.dataset.arg : this._entities[el.dataset.arg];
      if (!id) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
    }
  }

  // ------------------------------------------------------------------ rendering helpers
  _more(key, inner, cls = "", label = "") {
    const known = key && (key.includes(".") || this._entities[key]);
    if (!known) return `<div class="${cls}">${inner}</div>`;
    return `<button class="${cls}" data-action="more" data-arg="${esc(key)}"${label ? ` aria-label="${esc(label)}"` : ""}>${inner}</button>`;
  }

  _fmt(key, digits) {
    const v = this._num(key);
    return v === null ? "–" : comma(v, digits);
  }

  _icon(condition, cls = "") {
    const c = CONDITIONS[condition] || CONDITIONS.cloudy;
    return `<ha-icon class="wx ${c[2]} ${cls}" icon="${c[0]}"></ha-icon>`;
  }

  _attr(key, icon, label, value, sub = "", iconStyle = "") {
    return this._more(
      key,
      `<ha-icon icon="${icon}"${iconStyle ? ` style="${iconStyle}"` : ""}></ha-icon>
       <span class="a-text"><span class="a-label">${label}</span><span class="a-value">${value}</span>${sub ? `<span class="a-sub">${sub}</span>` : ""}</span>`,
      "attr"
    );
  }

  // ------------------------------------------------------------------ main render
  _render() {
    if (!this.shadowRoot || !this._hass || !this._entities) return;
    const e = this._entities;
    const cfg = this._config;
    const { t, rh, v, dew, feels } = this._derived();
    const age = this._age();
    const stale = age !== null && age > cfg.stale_after;
    const hist = this._history || {};

    // Current condition: from the station, or from a weather entity when configured.
    const lastHour = this._num(e.rain_last_hour ? "rain_last_hour" : "rain_hour");
    let condition = this._condition({ rain: lastHour, t, lux: this._num("illuminance"), wind: v });
    const condSt = cfg.condition_entity && this._hass.states[cfg.condition_entity];
    if (!unavailable(condSt) && CONDITIONS[condSt.state]) {
      condition = lastHour > 0 && !/rain|pour|snow|lightning|hail/.test(condSt.state) ? condition : condSt.state;
    }

    const tUnit = unit(this._st("temperature")) || "°C";
    const ageText =
      age === null ? "brak danych" : age < 60 ? `${Math.round(age)} s temu` : age < 3600 ? `${Math.floor(age / 60)} min temu` : `${Math.floor(age / 3600)} h temu`;
    const temps24 = hist.temperature || [];
    const tMin = temps24.length ? Math.min(...temps24.map((p) => p.v)) : null;
    const tMax = temps24.length ? Math.max(...temps24.map((p) => p.v)) : null;

    const header = `
      <div class="header">
        ${this._more(cfg.condition_entity || "illuminance", this._icon(condition, "big"), "icon-btn", "Warunki")}
        <div class="info">
          <div class="state">${CONDITIONS[condition][1]}</div>
          <div class="name">${esc(cfg.name)}${stale ? ` · <span class="stale">brak danych od ${ageText.replace(" temu", "")}</span>` : ""}</div>
        </div>
        ${this._more("temperature", `
          <div class="temp">${t === null ? "–" : comma(t, 1)}<span class="t-unit">${esc(tUnit)}</span></div>
          <div class="t-sub">${feels !== null && t !== null && Math.abs(feels - t) >= 0.5 ? `Odczuwalna ${comma(feels, 1)} ${esc(tUnit)}` : tMin !== null ? `${comma(tMax, 1)}° / ${comma(tMin, 1)}°` : "&nbsp;"}</div>`,
          "temp-btn", "Temperatura")}
      </div>`;

    // All station readings
    const wUnit = unit(this._st("wind_average")) || unit(this._st("wind_max")) || "km/h";
    const avg = this._num("wind_average");
    const gust = this._num("wind_max");
    const deg = this._num("wind_direction");
    const strSt = this._st("wind_direction_str");
    const point = !unavailable(strSt) ? strSt.state : deg !== null ? POINTS[Math.round(deg / 22.5) % 16] : null;
    const calm = v !== null && v < 1 && (gust === null || toKmh(gust, wUnit) < 1);
    const bf = v === null ? null : BEAUFORT.findIndex((lim) => v < lim);
    const gustMax = (hist.wind_max || []).length ? Math.max(...hist.wind_max.map((p) => p.v)) : null;
    const lux = this._num("illuminance");
    const luxText = lux === null ? "–" : lux >= 1000 ? `${comma(lux / 1000, lux >= 10000 ? 0 : 1)} klx` : `${comma(lux, 0)} lx`;
    const uv = this._num("uv");
    const rUnit = unit(this._st(e.rain_last_hour ? "rain_last_hour" : "rain_hour")) || "mm";

    const attrs = [];
    if (e.humidity) attrs.push(this._attr("humidity", "mdi:water-percent", "Wilgotność", `${rh === null ? "–" : comma(rh, 0)} %`));
    if (dew !== null) attrs.push(this._attr("humidity", "mdi:thermometer-water", "Punkt rosy", `${comma(dew, 1)} ${esc(tUnit)}`));
    if (e.wind_average)
      attrs.push(this._attr(e.wind_direction ? "wind_direction" : "wind_average",
        calm || deg === null ? "mdi:weather-windy" : "mdi:navigation",
        "Wiatr", calm ? "cisza" : `${avg === null ? "–" : comma(avg, 1)} ${esc(wUnit)}${point ? ` ${esc(point)}` : ""}`,
        bf !== null && !calm ? `${bf}° B · ${BEAUFORT_NAMES[bf]}` : "",
        !calm && deg !== null ? `transform: rotate(${(deg + 180) % 360}deg)` : ""));
    if (e.wind_max)
      attrs.push(this._attr("wind_max", "mdi:weather-windy-variant", "Porywy", `${gust === null ? "–" : comma(gust, 1)} ${esc(wUnit)}`,
        gustMax !== null ? `maks. 24 h ${comma(gustMax, 1)}` : ""));
    if (e.rain_last_hour || e.rain_hour)
      attrs.push(this._attr(e.rain_last_hour ? "rain_last_hour" : "rain_hour", "mdi:weather-rainy",
        e.rain_last_hour ? "Opad 1 h" : "Opad w tej godz.", `${lastHour === null ? "–" : comma(lastHour, 1)} ${esc(rUnit)}`,
        e.rain_last_hour && e.rain_hour ? `w tej godz. ${this._fmt("rain_hour", 1)}` : ""));
    if (e.illuminance) attrs.push(this._attr("illuminance", "mdi:brightness-5", "Światło", luxText));
    if (e.uv)
      attrs.push(this._attr("uv", "mdi:sun-wireless-outline", "Indeks UV", uv === null ? "–" : comma(uv, uv % 1 ? 1 : 0),
        uv === null ? "" : UV_LEVELS.find(([lim]) => uv < lim)[1]));
    if (tMin !== null)
      attrs.push(this._attr("temperature", "mdi:thermometer-lines", "Min / maks 24 h", `${comma(tMin, 1)}° / ${comma(tMax, 1)}°`));

    // Last hours, where the forecast card shows its forecast
    const hours = this._hours();
    const strip = hours.length
      ? `<div class="forecast" style="grid-template-columns: repeat(${hours.length}, minmax(0, 1fr))">
          ${hours.map((h) => `
            <div class="hour${h.current ? " now" : ""}">
              <div class="h-time">${h.current ? "Teraz" : h.label}</div>
              ${this._icon(h.condition, "small")}
              <div class="h-temp">${h.temp === null ? "–" : comma(h.temp, 1)}°</div>
              <div class="h-rain">${h.rain ? `${comma(h.rain, 1)} mm` : "&nbsp;"}</div>
            </div>`).join("")}
        </div>`
      : "";

    // Rain totals
    const totals = [["rain_day", "Dziś"], ["rain_week", "Tydzień"], ["rain_month", "Miesiąc"], ["rain_year", "Rok"]].filter(([k]) => e[k]);
    const rain = totals.length
      ? `<div class="totals">
          <ha-icon icon="mdi:water-outline"></ha-icon>
          ${totals.map(([k, l]) => this._more(k, `<span class="a-label">${l}</span><span class="tot">${this._fmt(k, 1)} <small>${esc(unit(this._st(k)) || "mm")}</small></span>`, "total")).join("")}
        </div>`
      : "";

    // Station status
    const batSt = this._st("battery");
    const batLow = batSt && (batSt.entity_id.startsWith("binary_sensor.") ? batSt.state === "on" : num(batSt.state) !== null && num(batSt.state) < 20);
    const rssi = this._num("rssi");
    const bars = rssi === null ? "off-outline" : rssi > -70 ? 4 : rssi > -80 ? 3 : rssi > -90 ? 2 : 1;
    const foot = [
      e.rssi ? this._more("rssi", `<ha-icon icon="mdi:wifi-strength-${bars}"></ha-icon>${rssi === null ? "–" : comma(rssi, 0)} ${esc(unit(this._st("rssi")) || "dBm")}`, "f-item", "Siła sygnału") : "",
      e.battery ? this._more("battery", `<ha-icon icon="${batLow ? "mdi:battery-alert-variant-outline" : "mdi:battery-outline"}"></ha-icon>${batLow ? "Słaba bateria" : "Bateria OK"}`, `f-item${batLow ? " alarm" : ""}`, "Bateria") : "",
      e.rain_total ? this._more("rain_total", `<ha-icon icon="mdi:counter"></ha-icon>Licznik opadu ${this._fmt("rain_total", 1)} ${esc(unit(this._st("rain_total")) || "mm")}`, "f-item", "Licznik opadu stacji") : "",
      cfg.show_age === false ? "" : `<span class="f-item age${stale ? " stale" : ""}"><ha-icon icon="mdi:update"></ha-icon>${ageText}</span>`,
    ].join("");

    const missing = !e.temperature
      ? `<div class="banner">Nie znaleziono encji stacji z prefiksem „${esc(cfg.prefix)}”. Ustaw <code>prefix</code> albo przypisz encje w <code>entities</code>.</div>`
      : "";

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="content">
          ${header}
          ${attrs.length ? `<div class="attrs">${attrs.join("")}</div>` : ""}
          ${strip}
          ${rain}
          ${foot && cfg.show_status !== false ? `<div class="foot">${foot}</div>` : ""}
          ${missing}
        </div>
      </ha-card>`;
  }
}

const STYLE = `
  :host {
    --bw-sun: var(--weather-icon-sun-color, #fdd93c);
    --bw-moon: var(--weather-icon-moon-color, #fcf497);
    --bw-rain: var(--weather-icon-rain-color, #30b3ff);
    --bw-snow: var(--weather-icon-snow-color, #f3f3f3);
    --bw-cloud: var(--weather-icon-cloud-front-color, var(--secondary-text-color));
  }
  ha-card { overflow: hidden; height: 100%; }
  .content { padding: 16px; color: var(--primary-text-color); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: inherit; border-radius: 8px; }
  button:hover { background: var(--secondary-background-color); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }

  .header { display: flex; align-items: center; gap: 16px; }
  .icon-btn { flex: 0 0 auto; border-radius: 50%; }
  .wx.big { --mdc-icon-size: 64px; display: block; }
  .wx.sun { color: var(--bw-sun); }
  .wx.moon { color: var(--bw-moon); }
  .wx.rain { color: var(--bw-rain); }
  .wx.cloud { color: var(--bw-cloud); }
  .wx.snow { color: var(--bw-snow); filter: drop-shadow(0 0 1px var(--secondary-text-color)); }
  .info { flex: 1 1 auto; min-width: 0; }
  .state { font-size: 28px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name { font-size: 16px; color: var(--secondary-text-color); line-height: 1.3; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name .stale { color: var(--warning-color, #ffa600); font-weight: 500; }
  .temp-btn { flex: 0 0 auto; text-align: right; padding: 2px 4px; margin-right: -4px; }
  .temp { font-size: 28px; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .t-unit { font-size: 0.6em; vertical-align: top; margin-left: 2px; }
  .t-sub { font-size: 16px; color: var(--secondary-text-color); line-height: 1.3; margin-top: 2px; white-space: nowrap; }

  .attrs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 12px; margin-top: 16px; }
  .attr { display: flex; align-items: flex-start; gap: 10px; padding: 6px 6px; margin: 0 -6px; }
  .attr ha-icon { --mdc-icon-size: 22px; color: var(--state-icon-color, var(--secondary-text-color)); flex: 0 0 auto; margin-top: 2px; transition: transform .4s; }
  .a-text { display: flex; flex-direction: column; min-width: 0; }
  .a-label { font-size: 12px; color: var(--secondary-text-color); line-height: 1.3; }
  .a-value { font-size: 15px; font-weight: 500; line-height: 1.35; font-variant-numeric: tabular-nums; }
  .a-sub { font-size: 12px; color: var(--secondary-text-color); line-height: 1.3; }

  .forecast { display: grid; gap: 4px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--divider-color); }
  .hour { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; min-width: 0; }
  .h-time { font-size: 13px; color: var(--secondary-text-color); white-space: nowrap; }
  .hour.now .h-time { color: var(--primary-text-color); font-weight: 500; }
  .wx.small { --mdc-icon-size: 28px; }
  .h-temp { font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .h-rain { font-size: 12px; color: var(--bw-rain); white-space: nowrap; min-height: 15px; }

  .totals { display: flex; align-items: center; gap: 4px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--divider-color); }
  .totals > ha-icon { --mdc-icon-size: 22px; color: var(--bw-rain); margin-right: 6px; flex: 0 0 auto; }
  .total { flex: 1 1 0; display: flex; flex-direction: column; padding: 4px 6px; min-width: 0; }
  .tot { font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tot small { font-size: 12px; font-weight: 400; color: var(--secondary-text-color); }

  .foot { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 10px; font-size: 12px; color: var(--secondary-text-color); }
  .f-item { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; margin: 0 -4px; border-radius: 6px; }
  .f-item ha-icon { --mdc-icon-size: 16px; }
  .f-item.age { margin-left: auto; }
  .f-item.stale { color: var(--warning-color, #ffa600); font-weight: 500; }
  .f-item.alarm { color: var(--error-color, #db4437); font-weight: 500; }
  .banner { margin-top: 12px; padding: 8px 10px; border-radius: 6px; background: rgba(219, 68, 55, .12); color: var(--error-color, #db4437); font-size: 14px; }
  code { font-size: .85em; }

  @media (max-width: 420px) {
    .header { gap: 12px; }
    .wx.big { --mdc-icon-size: 52px; }
    .state { font-size: 22px; }
    .name, .t-sub { font-size: 14px; }
    .attrs { grid-template-columns: 1fr 1fr; }
    .wx.small { --mdc-icon-size: 24px; }
    .h-time { font-size: 12px; }
    .h-temp { font-size: 14px; }
    .totals > ha-icon { display: none; }
  }
`;

if (!customElements.get("bresser-weather-card")) customElements.define("bresser-weather-card", BresserWeatherCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "bresser-weather-card")) window.customCards.push({
  type: "bresser-weather-card",
  name: "Bresser – stacja pogodowa",
  description: "Odczyty stacji Bresser na żywo w układzie karty pogodowej: warunki, temperatura, wiatr, opad, światło i ostatnie godziny.",
  preview: false,
});
console.info(`%c BRESSER-WEATHER-CARD %c ${CARD_VERSION} `, "background:#fdd93c;color:#000", "background:#30b3ff;color:#fff");
