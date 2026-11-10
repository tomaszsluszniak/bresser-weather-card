# Bresser weather card

[![HACS: Custom](https://img.shields.io/badge/HACS-Custom-orange)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Wydanie](https://img.shields.io/github/v/release/tomaszsluszniak/bresser-weather-card)](https://github.com/tomaszsluszniak/bresser-weather-card/releases/latest)
[![Licencja: MIT](https://img.shields.io/github/license/tomaszsluszniak/bresser-weather-card)](LICENSE)

Karta Home Assistant z odczytami stacji pogodowej **Bresser** na żywo, w układzie wbudowanej karty
pogody: ikona warunków i temperatura, wszystkie odczyty stacji, a tam, gdzie zwykła karta pokazuje
prognozę — pasek ostatnich godzin (temperatura i opad). Pod spodem sumy opadu i stan stacji.

*Home Assistant dashboard card showing live readings of a Bresser weather station in the layout of the
built-in weather card. The card's interface and documentation are in Polish.*

<!-- ![Karta stacji pogodowej](docs/karta.png) -->

> [!NOTE]
> Projekt niezależny, niezwiązany z firmą Bresser. Karta nie zawiera logo ani grafik producenta.

## Wymagania

- Home Assistant **2024.1** lub nowszy,
- encje stacji Bresser w Home Assistant, np. z [rtl_433](https://github.com/merbanan/rtl_433) przez MQTT,
- historia (recorder) — do paska ostatnich godzin i min/maks z 24 h.

## Instalacja

Przez [HACS](https://hacs.xyz) / Marketplace:

[![Otwórz repozytorium w HACS w swoim Home Assistant.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=tomaszsluszniak&repository=bresser-weather-card&category=plugin)

Albo ręcznie: menu ⋮ → **Custom repositories** (w Marketplace: **Add from link**) → wklej
`https://github.com/tomaszsluszniak/bresser-weather-card`, typ **Dashboard**, potem **Download**.

Po instalacji odśwież przeglądarkę (w aplikacji mobilnej: zamknij i otwórz aplikację).

<details>
<summary>Instalacja ręczna</summary>

1. Pobierz `bresser-weather-card.js` z [najnowszego wydania](https://github.com/tomaszsluszniak/bresser-weather-card/releases/latest).
2. Skopiuj do `/config/www/`.
3. Ustawienia → Panele → ⋮ → Zasoby → Dodaj `/local/bresser-weather-card.js`, typ *Moduł JavaScript*.

</details>

## Konfiguracja

```yaml
type: custom:bresser-weather-card
```

Karta sama znajduje encje, których przyjazna nazwa zaczyna się od prefiksu (domyślnie „Bresser”),
np. „Bresser Temperatura”, „Bresser Wiatr średni”, „Bresser Opad mm/dzień”. Rozpoznaje nazwy polskie
i angielskie oraz klasy urządzeń (`temperature`, `humidity`, `illuminance`…).

| Opcja | Domyślnie | Opis |
|---|---|---|
| `prefix` | `Bresser` | początek przyjaznej nazwy encji stacji |
| `name` | `Bresser` | podpis pod warunkami |
| `entities` | wykrywane | ręczne przypisanie encji, np. `temperature: sensor.ogrod_temperatura` |
| `condition_entity` | — | encja `weather.*`, z której brać warunki (opad ze stacji ma pierwszeństwo) |
| `hours_to_show` | `8` | liczba godzin w pasku (3–24) |
| `stale_after` | `300` | po ilu sekundach bez odczytu dane są oznaczane jako nieaktualne |
| `clear_sky_lux` | `110000` | natężenie światła przy czystym niebie i słońcu w zenicie (do oceny zachmurzenia) |
| `show_age` | `true` | wiek danych w stopce |
| `show_status` | `true` | stopka ze stanem stacji |

### Klucze `entities`

`temperature`, `humidity`, `illuminance`, `uv`, `wind_average`, `wind_max`, `wind_direction`
(stopnie), `wind_direction_str` (np. „NW”), `rain_last_hour`, `rain_hour`, `rain_day`, `rain_week`,
`rain_month`, `rain_year`, `rain_total` (licznik stacji), `rssi`, `battery`.

Brakujące odczyty są pomijane.

## Wydanie nowej wersji

1. Podbij `CARD_VERSION` w `dist/bresser-weather-card.js` i dopisz sekcję w `CHANGELOG.md`.
2. `git tag v1.1.0 && git push origin main v1.1.0` — workflow utworzy wydanie, które HACS zainstaluje.

## Licencja

[MIT](LICENSE)
