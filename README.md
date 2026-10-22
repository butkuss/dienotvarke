# Dienotvarkė

Asmeninis dienos užduočių ir automobilių užrašų puslapis. Veikia telefone ir kompiuteryje,
be jokių mokamų paslaugų.

## Kas yra

- **Planas**: keturi vaizdai, perjungiami viršuje.
  - *Diena*: dienos užduotys, neatliktos iš praėjusių dienų rodomos šiandien su mygtuku „Į šiandien“.
  - *Savaitė*: savaitės planai ir visos septynios dienos.
  - *Mėnuo*: mėnesio planai ir kalendorius, kuriame matosi kiekvienos dienos atlikta/iš viso.
  - *Metai*: metų planai, 12 mėnesių apžvalga ir užduotys be datos.

  Užduotis priklauso vienam laikotarpiui: dienai, savaitei, mėnesiui ar metams. Jis keičiamas
  užduoties redagavimo lange. Nieko netrinama, todėl bet kada galima grįžti ir pažiūrėti,
  kas buvo daroma konkrečią praėjusią dieną.
- **Būsenos**: kiekviena užduotis yra vienos iš keturių būsenų, keičiamų vienu paspaudimu:
  *Reikia padaryti* (numatytoji), *Daroma* (mygtukas ▶, mėlyna), *Laukiu atsakymo*
  (mygtukas ⏳, geltona) ir *Atlikta* (apskritimas su varnele). Pradėtos užduotys visada
  sąrašo viršuje, o pradėtos kitomis dienomis rodomos ir šiandienos vaizde.
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
