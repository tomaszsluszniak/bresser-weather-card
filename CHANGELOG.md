# Changelog

Wszystkie istotne zmiany karty. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje: [SemVer](https://semver.org/lang/pl/).

## [1.0.0] - 2026-11-10

### Dodano

- Pierwsze wydanie jako repozytorium HACS (wcześniej zasób wbudowany w Home Assistant).
- Układ jak wbudowana karta pogody: ikona warunków, temperatura z odczuwalną albo min/maks 24 h.
- Odczyty stacji: wilgotność, punkt rosy, wiatr z kierunkiem i skalą Beauforta, porywy z maksimum 24 h,
  opad, światło, indeks UV.
- Pasek ostatnich godzin (temperatura, opad, ikona warunków) zamiast prognozy.
- Sumy opadu (dziś, tydzień, miesiąc, rok), sygnał, bateria, licznik opadu i wiek danych.
- Warunki liczone ze stacji (opad, natężenie światła względem wysokości słońca) albo z encji `weather`.
- Automatyczne wyszukiwanie encji po prefiksie nazwy („Bresser”).

[1.0.0]: https://github.com/tomaszsluszniak/bresser-weather-card/releases/tag/v1.0.0
