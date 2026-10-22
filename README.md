# diena

Asmeninis dienos darbų ir veiklų planuoklis. Veikia telefone ir kompiuteryje, be mokamų paslaugų.

## Ekranai

- **Mano diena** – savaitės juosta, dienos užduotys grupėmis ir dienos progresas.
  Grupės rodomos šia tvarka, kiekviena užduotis tik vieną kartą:
  laikas vėl susisiekti · iš ankstesnių dienų · suplanuota (su laiku) · be konkretaus laiko · atlikta.
- **Kalendorius** – kompiuteryje savaitės laiko tinklelis su „Be laiko“ juosta,
  telefone dienomis sugrupuota darbotvarkė. Čia pat savaitės, mėnesio ir metų planai.
- **Laukiu atsakymo** – visi aktyvūs laukimai, pradelsti viršuje.
- **Veiklos** – automobiliai ir kitos sritys, kiekviena su užduotimis ir užrašais.

## Užduotis

Trys būsenos: **To do**, **In progress**, **Done**. Būsena keičiama tiesiogiai iš sąrašo
(pilka žyma eilutės dešinėje), atlikimo apskritimas pažymi Done ir grąžina ankstesnę būseną.

**Laukiu atsakymo** yra atskiras požymis, ne ketvirta būsena. Jis turi savo laukus:
iš ko laukiama, nuo kada, kada vėl susisiekti ir ką žmogus pažadėjo iki kada.
Šios datos nepriklauso viena nuo kitos ir nuo suplanuotos dienos.

## Užrašai ir susitarimai

Automobilio skiltyje „Užrašai ir eiga“ rašomas laisvas tekstas. Pažymėjus
„Yra pažadėtas terminas“ galima nurodyti, kas ir ką pažadėjo, ir sukurti susietą
pasitikslinimo užduotį. Pakeitus terminą, užrašas išlaiko pirminį pažadą, užduotis
rodo dabartinį, o pakeitimas lieka susitarimų istorijoje.

## Duomenys

- Naršyklėje, tame įrenginyje (`localStorage`).
- Įjungus sinchronizaciją: privačioje GitHub repozitorijoje, faile `data.json`.
- Įrašai sujungiami pagal įrašo laiką, o esant tiksliai tokiam pačiam laikui, pagal
  nulemtą taisyklę, kad abu įrenginiai gautų tą patį rezultatą. Ištrynimai keliauja kartu,
  todėl senas įrenginys neprikelia ištrintų įrašų.
- Nebaigta forma saugoma vietoje ir neprapuola nei po sinchronizacijos, nei perkrovus.

## Failai

- `index.html`, `style.css` – karkasas ir dizaino sistema
- `model.js` – duomenų modelis, senų įrašų migracija, atrankos ir būsenų taisyklės
- `views.js` – visi ekranai ir formos
- `app.js` – būsena, veiksmai, formų logika
- `sync.js` – sinchronizacija per GitHub
- `sw.js`, `manifest.webmanifest`, `icon.svg` – kad veiktų kaip programėlė telefone

## Paleisti savo kompiuteryje

```
python3 -m http.server 8123
```

ir atidaryti http://localhost:8123
