# Lena Money

Eenvoudige webapp om `zakgeld` en `kledingsbudget` van Lena op te volgen.

## Wat deze versie kan

- Lena-view met resterend totaal en per categorie.
- Ouder-modus met aparte PINs per ouder om budget en transacties te beheren.
- Aparte bijdragen van `mama` en `papa` per maand en categorie.
- Over van vorige maand(en) per maandbron (bijv. "nog 5 euro van maand X").
- Negatieve stand toegelaten (in min gaan).
- Grafiek met evolutie van het totale budget.

## Standaard ouder-PINs

- Mama: `1111`
- Papa: `2222`

In `Ouder-beheer` staat ook een blok `PIN wijzigen` waarmee de aangemelde ouder zijn/haar eigen PIN kan aanpassen.

## Lokaal gebruiken

Open `index.html` in je browser.

## View modi via URL

- `index.html?view=lena` -> extra details standaard verborgen.
- `index.html?view=ouder` -> extra details standaard zichtbaar.
- Zonder parameter blijft de standaard op Lena-view.

## Solo-modus (eigen budget, bv. Ella)

Zelfde GitHub Pages-site, andere link met `mode=solo` en een **eigen** `child` UUID (aparte snapshot in Supabase).

Voorbeeld:

`index.html?family=<family-uuid>&child=<ella-child-uuid>&childName=Ella&mode=solo`

- Geen mama/papa-splitsing: één budgetpot per categorie.
- Beheer via het slotje; standaard-PIN: `1111` (zelfde als mama in de family-app).
- Automatische coach staat standaard aan; persoonlijke herinneringen kan ze zelf instellen na inloggen.
- Categorieën zijn gedeeld binnen die app (één kind-URL); budgetbedragen zijn niet gekoppeld aan de family-app van Lena.

Maak in Supabase een aparte rij in `children` + snapshot, zoals voor Lena.

### Geen kruisbesmetting met Lena (family)

| Laag | Isolatie |
|------|----------|
| **Supabase** | Eén snapshot per `child_id` (primary key). Ella **moet** een andere UUID hebben dan Lena. |
| **localStorage** | Sleutel bevat `family` + `child` + `mode` (`solo` vs `family`). |
| **Config** | Solo gebruikt **niet** automatisch `childId` van Lena; alleen `?child=` of `soloChildId` in config. |
| **Cloud-guard** | Snapshot met `appMode` / mama-papa-structuur wordt niet geladen in solo (en omgekeerd). Zelfde child-ID als Lena in solo = sync geblokkeerd. |

Gebruik nooit `mode=solo` met Lena’s `child`-UUID in de URL.

## Op GitHub Pages zetten

1. Maak een nieuwe repo op GitHub (bijv. `lena-money`).
2. Upload alle bestanden uit deze map.
3. Ga naar **Settings** -> **Pages**.
4. Kies branch `main` en folder `/root`.
5. Save. Na enkele minuten staat je site online.

## Belangrijk (beveiliging)

Deze eerste versie is volledig client-side en bewaart data in `localStorage` van de browser.
Dat betekent:

- Data staat eerst lokaal; optioneel sync naar Supabase snapshot per kind (zie `supabase/migrations/202605071000_child_budget_snapshots.sql`).
- De PIN is basisbescherming, maar geen harde beveiliging zoals een echte login met server.

Als je wil, maak ik in een volgende stap een **echte beveiligde versie** met accounts:

- ouders kunnen bewerken;
- Lena heeft alleen leesrechten;
- alles veilig in een online database (Supabase/Firebase).
