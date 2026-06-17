import { useState, useEffect } from "react";
import { ScrollView, StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY ?? "";

const DEFAULT_LAT = 14.07;
const DEFAULT_LON = 120.63;
const DEFAULT_LOCATION_NAME = "NASUGBU BATANGAS, PH";

interface WeatherData {
  temp: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: keyof typeof Ionicons.glyphMap;
}

interface LocationData {
  lat: number;
  lon: number;
  name: string;
}

function formatTime(date: Date) {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours === 0 ? 12 : hours;
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

function formatDate(date: Date) {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
}

function mapConditionToIcon(condition: string): keyof typeof Ionicons.glyphMap {
  switch (condition.toLowerCase()) {
    case "clear":
      return "sunny-outline";
    case "clouds":
      return "cloudy-outline";
    case "rain":
    case "drizzle":
      return "rainy-outline";
    case "thunderstorm":
      return "thunderstorm-outline";
    case "snow":
      return "snow-outline";
    case "mist":
    case "fog":
    case "haze":
    case "smoke":
    case "dust":
      return "partly-sunny-outline";
    default:
      return "partly-sunny-outline";
  }
}

function capitalizeWords(text: string) {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function fetchOpenWeather(lat: number, lon: number): Promise<WeatherData> {
  const url =
    `https://api.openweathermap.org/data/2.5/weather?` +
    `lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.message || `Status ${response.status}`;
    throw new Error(`OpenWeatherMap: ${message}`);
  }

  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].main,
    description: data.weather[0].description,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    icon: mapConditionToIcon(data.weather[0].main),
  };
}

function mapOpenMeteoCodeToIcon(code: number): keyof typeof Ionicons.glyphMap {
  if (code === 0) return "sunny-outline";
  if (code >= 1 && code <= 3) return "partly-sunny-outline";
  if (code === 45 || code === 48) return "partly-sunny-outline";
  if (code >= 51 && code <= 67) return "rainy-outline";
  if (code >= 71 && code <= 77) return "snow-outline";
  if (code >= 80 && code <= 82) return "rainy-outline";
  if (code >= 95) return "thunderstorm-outline";
  return "partly-sunny-outline";
}

function mapOpenMeteoCodeToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code >= 1 && code <= 3) return "Clouds";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain";
  if (code >= 95) return "Thunderstorm";
  return "Clouds";
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.reason || `Status ${response.status}`;
    throw new Error(`Open-Meteo: ${message}`);
  }

  const current = data.current;
  const condition = mapOpenMeteoCodeToCondition(current.weather_code);

  return {
    temp: Math.round(current.temperature_2m),
    condition,
    description: condition.toLowerCase(),
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    icon: mapOpenMeteoCodeToIcon(current.weather_code),
  };
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  try {
    return await fetchOpenWeather(lat, lon);
  } catch (openWeatherErr) {
    console.warn("OpenWeatherMap failed, falling back to Open-Meteo:", openWeatherErr);
    return fetchOpenMeteo(lat, lon);
  }
}

async function resolveLocationName(lat: number, lon: number): Promise<string> {
  try {
    const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const place = addresses[0];
    if (place) {
      const parts = [
        place.city || place.district || place.subregion || place.name,
        place.region,
        place.isoCountryCode,
      ].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(", ").toUpperCase();
      }
    }
  } catch (err) {
    console.warn("Reverse geocoding failed:", err);
  }
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

async function loadDeviceLocation(): Promise<LocationData> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error("Location permission not granted");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const name = await resolveLocationName(lat, lon);

  return { lat, lon, name };
}

export default function HomeScreen() {
  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState<LocationData>({
    lat: DEFAULT_LAT,
    lon: DEFAULT_LON,
    name: DEFAULT_LOCATION_NAME,
  });
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initLocation() {
      try {
        const deviceLocation = await loadDeviceLocation();
        if (isMounted) {
          setLocation(deviceLocation);
        }
      } catch (err) {
        console.warn("Failed to load device location, using default:", err);
      }
    }

    initLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWeather() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchWeather(location.lat, location.lon);
        if (isMounted) {
          setWeather(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load weather");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadWeather();
    const refreshInterval = setInterval(loadWeather, 600000); // refresh every 10 minutes

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [location]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <LinearGradient colors={["#4A0E17", "#2A080C"]} style={styles.background} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <View style={styles.pill}>
            <Ionicons name="location-sharp" size={16} color="#D4AF37" />
            <Text style={styles.text}>{location.name}</Text>
          </View>
          <View style={styles.midContainer}>
            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <Ionicons name="time-outline" size={16} color="#D4AF37" />
                <Text style={styles.textHeader}>CURRENT TIME</Text>
              </View>
              <View style={styles.clockContainer}>
                <Text style={styles.clockTime}>{formatTime(now)}</Text>
                <View style={styles.calendarContainer}>
                  <Ionicons name="calendar-outline" size={16} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={styles.clockDate}>{formatDate(now)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <Ionicons name="help-outline" size={16} color="#D4AF37" />
                <Text style={styles.textHeader}>WEATHER UPDATES</Text>
              </View>
              {loading ? (
                <View style={styles.weatherStateContainer}>
                  <ActivityIndicator color="#D4AF37" />
                </View>
              ) : error ? (
                <View style={styles.weatherStateContainer}>
                  <Ionicons name="warning-outline" size={24} color="#FF6B6B" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : weather ? (
                <>
                  <View style={styles.tempContainer}>
                    <View style={styles.tempRow}>
                      <Text style={styles.tempValue}>{weather.temp}°C</Text>
                    </View>
                    <Text style={styles.conditionText}>{capitalizeWords(weather.description)}</Text>
                  </View>
                  <View style={styles.weatherDetails}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>HUMIDITY</Text>
                      <Text style={styles.detailValue}>{weather.humidity}%</Text>
                    </View>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>WIND</Text>
                      <Text style={styles.detailValue}>{weather.windSpeed} m/s</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.cardContainer}>
              <View style={styles.cardHeader}>
                <Ionicons name="logo-react" size={16} color="#D4AF37" />
                <Text style={styles.textHeader}>REACT NATIVE</Text>
              </View>
              <Text style={styles.textBody}>LINUX ADONA</Text>
            </View>
          </View>
          <View>
            <View style={styles.footer} />
            <View style={styles.footerContainer}>
              <Ionicons name="logo-react" size={16} color="#D4AF37" />
              <Text style={styles.footerText}>REACT NATIVE • LIVE MONITORS</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 24,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 1,
  },
  pill: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "auto",
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  cardContainer: {
    width: 380,
    height: "auto",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 20,
    padding: 24,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  textBody: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 12,
  },
  textHeader: {
    color: "#D4AF37",
    fontWeight: "700",
    letterSpacing: 3,
  },
  clockContainer: {
    paddingTop: 12,
    gap: 12,
  },
  clockTime: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "600",
    letterSpacing: 2,
  },
  clockDate: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    letterSpacing: 1,
    fontWeight: "600",
  },
  calendarContainer: {
    flexDirection: "row",
    gap: 8,
  },
  midContainer: {
    gap: 24,
  },
  weatherStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    textAlign: "center",
  },
  tempContainer: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  tempRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tempValue: {
    color: "#FFFFFF",
    fontSize: 64,
    fontWeight: "900",
  },
  conditionText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 18,
    letterSpacing: 0.6,
    marginTop: -4,
  },
  weatherDetails: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    padding: 16,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  detailItem: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailValue: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
  },
  detailDivider: {
    height: 25,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  footer: {
    alignSelf: "center",
    flexDirection: "row",
    width: 100,
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    paddingVertical: 8,
  },
  footerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  footerText: {
    color: "#A3A3A3",
    letterSpacing: 2,
    fontSize: 12,
    textAlign: "center",
  },
});
