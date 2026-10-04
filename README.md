# PSB Fimal – sklep internetowy z odbiorem osobistym (wersja 2.0 – flat design)

Sklep z materiałami budowlanymi + panel administratora. **Zero zależności npm** – czysty Node.js 22 z wbudowaną bazą SQLite (`node:sqlite`). Nie trzeba nic instalować ani kompilować.

## Funkcje

**Sklep**
- Strona główna: baner, najbliższy wolny termin odbioru, kategorie, promocje, polecane, nowości, punkty odbioru
- Lista produktów: filtry (kategoria, cena, producent, dostępność, promocje), sortowanie, paginacja, wyszukiwarka z podpowiedziami
- Karta produktu: galeria, cena brutto/netto, stan magazynowy, specyfikacja, produkty podobne
- Koszyk z kontrolą stanów i limitów
- Zamówienie **wyłącznie z odbiorem osobistym**: wybór punktu, kalendarz dni i godzin (z limitem zamówień na przedział, dniami zamkniętymi, czasem przygotowania), faktura VAT z walidacją NIP, płatność przy odbiorze / przelew
- Rezerwacja towaru (stan odejmowany przy zamówieniu, zwracany przy anulowaniu)
- Śledzenie zamówienia (numer + e-mail lub telefon)

**Panel administratora** (`/admin`)
- Pulpit: sprzedaż 30 dni (wykres), statusy, dzisiejsze odbiory, niskie stany, bestsellery
- Zamówienia: filtry, wyszukiwarka, zmiana statusu (pojedyncza i zbiorcza), płatność, zmiana terminu, notatki, historia, wydruk listy kompletacyjnej, eksport CSV
- Harmonogram odbiorów dzień po dniu z przyciskami „Gotowe” / „Wydano”
- Produkty: dodawanie/edycja, zdjęcia + galeria, specyfikacja, promocje, szybka edycja stanu, akcje zbiorcze, duplikowanie, import/eksport CSV
- Magazyn: korekty stanów, historia ruchów, ilości zarezerwowane
- Kategorie, punkty odbioru (godziny otwarcia), raporty sprzedaży (CSV), użytkownicy z rolami (administrator / pracownik), ustawienia, dziennik zdarzeń

## Uruchomienie lokalne

```bash
npm start            # http://localhost:3000
npm run reset-db     # usuwa bazę i wgrywa dane testowe od nowa
```
Wymagany Node.js 22.13+.

Domyślne logowanie: `admin@fimal.pl` / `Fimal2026!` – **zmień od razu** (lub ustaw `ADMIN_EMAIL` i `ADMIN_PASSWORD` przed pierwszym startem).

## Wdrożenie: GitHub + Railway

1. Wrzuć zawartość tego folderu do nowego repozytorium na GitHubie.
2. W Railway: **New Project → Deploy from GitHub repo** → wybierz repozytorium. Railway zbuduje projekt z `Dockerfile` (ustawione w `railway.json`).
3. **Dodaj Volume** (prawy klik na serwisie → *Attach Volume*), punkt montowania: `/data`. Bez tego baza i zdjęcia znikną po każdym wdrożeniu.
4. W zakładce **Variables** ustaw:
   - `DATA_DIR=/data`
   - `ADMIN_EMAIL=twoj@email.pl`
   - `ADMIN_PASSWORD=MocneHaslo123!`
5. **Settings → Networking → Generate Domain** – sklep będzie dostępny pod adresem Railway (możesz podpiąć własną domenę).

Port jest pobierany automatycznie ze zmiennej `PORT`. Healthcheck: `/health`.

## Po wdrożeniu
- Ustawienia → uzupełnij dane firmy, telefon, e-mail, treści regulaminu.
- Punkty odbioru → wpisz prawdziwe adresy i godziny.
- Produkty są testowe (zdjęcia poglądowe) – edytuj je lub usuń akcją zbiorczą, możesz też zaimportować własne z CSV.
- Treść regulaminu jest przykładowa – uzupełnij ją o pełne zapisy prawne.

## Struktura
```
server.js            start aplikacji
src/http.js          mini‑framework HTTP (routing, body, multipart, pliki statyczne)
src/db.js            schemat bazy SQLite
src/seed.js          dane testowe i ustawienia domyślne
src/core.js          sesje, CSRF, koszyk, terminy odbioru
src/routes/          trasy sklepu i panelu
src/views/           szablony HTML
public/              CSS, JS, logo
```
