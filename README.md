# Dienotvarkė

Asmeninis dienos užduočių ir automobilių užrašų puslapis. Veikia telefone ir kompiuteryje,
be jokių mokamų paslaugų.

## Kas yra

- **Diena**: užduotys pagal dienas, pažymėjimas „atlikta“, neatliktos iš praėjusių dienų
  rodomos šiandien su mygtuku „Į šiandien“.
- **⏳ Laukiu**: užduotis, kuri stringa dėl kito žmogaus atsakymo. Visos tokios surenkamos
  skiltyje „Laukiu“, seniausios viršuje.
- **Automobiliai**: kiekvienam automobiliui atskiras puslapis su darbų sąrašu ir užrašais.
  Užrašui galima nustatyti priminimo datą: tą dieną jis atsiras dienos vaizde.
- **Nustatymai**: sinchronizacija ir atsarginė kopija.

## Kur saugomi duomenys

- Naršyklėje, tame įrenginyje (`localStorage`).
- Įjungus sinchronizaciją: privačioje GitHub repozitorijoje, faile `data.json`.

## Failai

- `index.html`, `style.css`: puslapis ir išvaizda
- `app.js`: visa programėlės logika
- `sync.js`: sinchronizacija per GitHub
- `sw.js`, `manifest.webmanifest`, `icon.svg`: kad veiktų kaip programėlė telefone ir be interneto

## Paleisti savo kompiuteryje

```
python3 -m http.server 8123
```

ir atidaryti http://localhost:8123
