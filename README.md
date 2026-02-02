Skript, co kontroluje, zda uživatel používá AdBlockery a jaké reklamní & analytické systémy má zablokované - Zároveň kontroluje, zda návštěva nepochází od robota, data následně posílá do BigQuery odkud se dají využít pro Reporting

Přínos pro klienta
Klient bude mít real-time reporting o celkovém množství návštěvnosti na webu a zároveň bude vědět o kolik procent návštěv přichází v analytice kvůli adblockerům a blokátorům cookie lišty - Ty data pak můžou sloužit jako náboj pro implementaci server-sideZda rekl. nástroje nepřinášejí na web boty a nedochází k plýtvání MKT budgetuMožnost obohatit datovou vrstvu o informaci, zda se jedná o robota či nikoliv

Jak to technicky funguje:
Na web se do hlavičky webu nasadí řádek skriptu, který zavolá endpoint, kde je skript hostovaný. Samotný skript pak na FE udělá několik checků:
Vezme data o návštěvě (UTM parametry, Prohlížeč etc)Zkusí provolat endpointy jedn. analytických & MKT systémů (např. https://pagead2.googlesyndication.com) a zcheckne, zda request projde, nebo ne, pokud ne - tak to bere, že uživatel používá adblock a endpoint je blokovaný.Zcheckne jestli se nejedná o headless browser, což funguje jako 1. detekce robotůZároveň pak do datové vrstvy pushne informaci, zda se jedná o robota či ne.

Data pak vezme a odešle je na Google Cloud Run, tam pak ještě proběhne 2.detekce robotů, zcheckne se IP adresa a porovná se proti listu známých IP Adres robotů a dalších crawlerů (https://github.com/sefinek/known-bots-ip-whitelist), kde případně zaznamená typ Robota (např. zda se jedná o GoogleBota nebo Open AI bota), následně se data pošlou do BigQuery.

Reporting
Report v LS: https://lookerstudio.google.com/reporting/fddbf235-c76d-4e0e-b9ac-d63725a37137/page/9JUhF
