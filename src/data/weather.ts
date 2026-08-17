import { fetchJson } from "../lib/http";

const DEFAULT_CITY = "Brussels";
const DEFAULT_COORDS = { lat: 50.85, lon: 4.35 };

export type Weather = {
  city: string;
  tempC: number;
  condition: string;
  icon: string;
  humidity: number;
  windKph: number;
  todayHigh: number;
  todayLow: number;
};

// WMO weather codes → (icon, label), grouped by condition family.
const CODE_MAP: Record<number, [string, string]> = {
  0: ["☀️", "Clear sky"],
  1: ["🌤️", "Mostly clear"],
  2: ["⛅", "Partly cloudy"],
  3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌦️", "Dense drizzle"],
  61: ["🌧️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  71: ["🌨️", "Light snow"],
  73: ["🌨️", "Snow"],
  75: ["🌨️", "Heavy snow"],
  80: ["🌦️", "Rain showers"],
  81: ["🌧️", "Rain showers"],
  82: ["⛈️", "Violent showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm + hail"],
  99: ["⛈️", "Severe thunderstorm"],
};

function describeCode(code: number): [string, string] {
  return CODE_MAP[code] ?? ["🌡️", "Unknown"];
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const data = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`,
    );
    const r = data.results?.[0];
    return r ? { lat: r.latitude, lon: r.longitude } : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(): Promise<Weather | null> {
  const city = process.env.WEATHER_CITY || DEFAULT_CITY;
  const coords = (await geocode(city)) ?? DEFAULT_COORDS;

  try {
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`,
    );
    const current = data.current;
    if (!current) return null;

    const [icon, condition] = describeCode(current.weather_code);

    return {
      city,
      tempC: current.temperature_2m,
      condition,
      icon,
      humidity: current.relative_humidity_2m,
      windKph: current.wind_speed_10m,
      todayHigh: data.daily?.temperature_2m_max?.[0] ?? current.temperature_2m,
      todayLow: data.daily?.temperature_2m_min?.[0] ?? current.temperature_2m,
    };
  } catch {
    return null;
  }
}
