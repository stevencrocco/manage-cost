# Gestione Spese Familiari — Documentazione

Aggiornata al 22/11/2026.

Applicazione Angular 20 (componenti standalone) per tenere traccia di **entrate e uscite** della famiglia.
Funziona tutta nel browser: non c'è un server, i dati restano nel `localStorage` del browser in cui usi l'app.

---

## 1. Avvio rapido

```powershell
npm install
npm start
```

Apri `http://localhost:4200`. `npm start` avvia anche il salvataggio automatico degli export in
`data/storico` (vedi sezione 7).

### Primo caricamento dei movimenti della banca

1. Vai su **Impostazioni → Movimenti bancari**.
2. **Archivia e svuota** (facoltativo ma consigliato la prima volta): salva `storico-spese-AAAA-MM-GG.json`
   nella cartella degli export (vedi sotto)
   con tutti i movimenti attuali e poi li cancella. Membri, categorie, regole e budget restano.
3. **Scegli file .xlsx**: seleziona l'export "Movimenti" della banca
   (es. `data/banca/movimenti-banca-2026-11-22.xlsx`). Compare un'anteprima con periodo, entrate,
   uscite reali, ricariche carta e movimenti da revisionare.
4. **Importa**.
5. **Chi usa ogni carta?**: controlla a chi è assegnata ogni carta. La ricaricabile **…2581 è di Rita**
   (impostato di default); le altre sono di Steven finché non le cambi. Il "Pagato da" si aggiorna su tutti
   i movimenti di quella carta.
6. Vai su **Movimenti → ⚠️ Da revisionare** e correggi le categorie (vedi §5).

Ogni mese basta ripetere il punto 3 con il nuovo export: i movimenti già presenti vengono saltati.

---

## 2. Cartella `data/`

| Percorso | Contenuto |
|---|---|
| `data/banca/movimenti-banca-2026-11-22.xlsx` | Export originale della banca (copia di `movements_20261122.xlsx`), 22/11/2024 – 21/11/2026 |
| `data/banca/movimenti-banca-2026-11-22.csv` | Lo stesso file in CSV, con **date leggibili** (gg/mm/aaaa), importi con segno e la categoria assegnata dall'app |
| `data/storico/spese-familiari-2025-11-*.json` | I vecchi export JSON che prima erano nella cartella principale del progetto |

Il CSV usa `;` come separatore, la virgola per i decimali e la codifica UTF-8 con BOM, quindi si apre
direttamente in Excel in italiano. Colonne:

`Data; Tipo; Importo; Categoria; Conta nei totali; Da revisionare; Descrizione; Carta/Conto;
Tipo operazione banca; Stato; Descrizione completa banca; Id`

> `data/` è in `.gitignore`: contiene dati bancari personali e non va mai versionata né condivisa.

---

## 3. Cosa c'è nell'export della banca (analisi del 22/11/2026)

- **2.198 movimenti** di un solo conto corrente, dal 22/11/2024 al 21/11/2026.
- **Entrate**: 69.025,12 € (stipendi 47.473,55 €, bonifici INPS circa 500 €/mese, rimborsi, regali).
- **Uscite reali**: 73.641,05 € (ricariche carta escluse).
- **Ricariche della carta ricaricabile**: 383 per 11.481,00 €.

### Perché le ricariche non contano come uscite

La carta ricaricabile **…2581** è la "MONOFUNZIONE CONTACTLESS CHIP 5267 **** **** 2581".
I suoi acquisti (504 movimenti, circa 11.489 €) sono **già nell'export**, uno per uno.
Contare anche le ricariche vorrebbe dire contare gli stessi soldi due volte, quindi:

- gli **acquisti fatti con la carta …2581** sono **uscite vere**;
- le **ricariche** ("Ricarica carta ricaricabile") sono segnate come **trasferimento**: restano in archivio,
  si trovano nelle ricerche e nei filtri, ma **non entrano nei totali** né nei grafici.

Le ricariche sono escluse **sempre e da ogni totale**: spese mensili, saldo, dashboard, grafici, report e budget.
Non hanno il pulsante 🔁 e nella lista mostrano il badge "ricarica carta · esclusa".
Anche se una ricarica risulta segnata diversamente, l'app la rimette fuori dai totali all'avvio.

Gli altri movimenti si possono segnare o togliere come trasferimento con il pulsante 🔁 nella lista.

### Carte e conti trovati

| Codice | Cos'è | Movimenti |
|---|---|---|
| `Conto` | Bonifici, addebiti SEPA, prelievi, ricariche, canoni | 915 |
| `366` | Bancomat (pagamenti "Pagamento Bancomat … Carta N *****366") | 564 |
| `2581` | Carta ricaricabile (contactless monofunzione) — **Rita Lucanto** | 504 |
| `3661` | Carta multifunzione (contactless) | 215 |

### Cose da sapere sul file della banca

- La banca va a capo ogni **40 caratteri** della descrizione e lì inserisce uno spazio. Con il prefisso
  "Pag. del … presso: " lo spazio cade dopo il 4° carattere del nome: "PIZZ ERIA", "ACQU A E SAPONE",
  "FARM ACIA". Altri spazi spuri compaiono più avanti nel testo ("Ca rta", "Transazion e").
  - All'import l'app **ricuce le parole** (`createSpacingFixer` in `bank-import.ts`). Si basa su un vocabolario
    costruito da tutte le descrizioni del file. Allo spazio della 40ª colonna le due parti si uniscono, salvo
    quando sono chiaramente due parole: "TOYS CENTER", "DOTT CARLO", "SPAM SRL", "LIDL 6092", "APS Ins:".
    Altrove si uniscono solo se la parola intera è più frequente dei pezzi.
  - I movimenti già salvati vengono riparati **una volta sola** all'avvio (`repairBankSpacing`; chiave
    `bankSpacingFixed`). Un nome cambiato a mano non viene toccato.
  - Gli id dei movimenti non cambiano, perché sono calcolati senza spazi, quindi i reimport non creano doppioni.
    Anche le regole per esercente funzionano come prima: anche le chiavi degli esercenti sono **senza spazi**.
  - Il CSV in `data/banca/` è stato rigenerato con i nomi riparati. L'xlsx originale resta com'è.
- Per i pagamenti bancomat la data dell'operazione è quella di contabilizzazione: l'app usa la data reale
  dell'acquisto letta dal testo ("Pag. del 19/11/26"), oppure "Data operazione" per i prelievi.
- I movimenti con stato **Autorizzato** sono provvisori. Al prossimo import, quelli nel periodo coperto dal
  nuovo file vengono sostituiti dalla versione contabilizzata, così non risultano doppi.
- Gli **estratti conto della carta di credito** (25, 6.892,50 €) arrivano come un solo addebito al mese,
  senza il dettaglio degli acquisti: finiscono nella categoria "Carta di credito".
- I **prelievi** (12.050 €) finiscono in "Contanti": l'app non sa come sono stati spesi.

---

## 4. Categorie

Le categorie hanno un **tipo**: uscita o entrata. Il form e i menu mostrano solo quelle del tipo giusto.
Le nuove categorie di default vengono aggiunte da sole ai dati esistenti, senza toccare quelle personalizzate.

**Uscite**: Alimentari, Ristoranti, Carburante, Trasporti, Bollette, Telefonia, Casa, Salute, Assicurazioni,
Tasse e PA, Acquisti online, Shopping, Intrattenimento, Sport, Abbonamenti, Finanziamenti, Istruzione, Regali,
Contanti, Carta di credito, Spese bancarie, Trasferimenti, Altro.

**Entrate**: Stipendio, INPS e contributi, Rimborsi, Regali ricevuti, Altre entrate.

### Come vengono assegnate in automatico (`src/app/services/bank-import.ts`)

In quest'ordine:

1. **Tipo di operazione della banca**: ricarica carta → Trasferimenti; utilizzo carta di credito → Carta di credito;
   prelievo → Contanti; ricarica telefonica → Telefonia; canone, commissioni e bollo → Spese bancarie;
   F24 → Tasse e PA.
2. **Regole personali** (create da te dalla lista, vedi §5): esercente → categoria.
3. **Entrate**: Stipendio; INPS; Rimborsi (Unisalute, Cometa, storni, PayPal); Regali ricevuti (causale "Regalo").
4. **Regole per esercente** (`MERCHANT_RULES`): per esempio Super Go, ARD, Eurospin, Coop, Conad, MD → Alimentari;
   Farmacia, studi medici → Salute; Esso, distributore PV78xx → Carburante; TIM, Eni, servizio idrico → Bollette;
   CNP Santander Insurance → Assicurazioni; PagoPA, Comune → Tasse e PA; PayPal, Google, Amazon → Acquisti online.
5. Tutto il resto va in **Altro / Altre entrate** ed è marcato **da revisionare**.

Sui dati attuali circa 320 movimenti su 2.198 (circa 8.900 €) restano da revisionare. Sono per lo più
piccoli esercenti che compaiono una o due volte.

Per aggiungere una regola fissa basta aggiungere una riga in `MERCHANT_RULES`. Le chiavi si scrivono in
maiuscolo e senza spazi:

- normalmente valgono quando il nome dell'esercente **contiene** la chiave;
- le chiavi di 3 lettere o meno, e quelle che iniziano con `^`, valgono solo quando il nome **inizia** con la chiave
  (es. `^CASA`, così "CASALI DEL MANCO" non finisce in Casa).

---

## 5. Lista movimenti (menu **Movimenti**)

### Vista raggruppata per categoria
Con **Raggruppa per categoria** (solo in vista Tabella) ogni categoria è una scheda che si apre e si chiude:

- **Aprire o chiudere:** clic sull'intestazione. La freccia ruota e, passando col mouse, compare "Espandi" o
  "Comprimi".
- **Scheda chiusa:** restano visibili icona, nome, numero di movimenti e **totale** della categoria.
- **Tutte insieme:** sopra le schede ci sono **Espandi tutte** e **Comprimi tutte**, con il conteggio delle
  categorie chiuse.
- **All'apertura** le categorie sono **tutte chiuse**: quando attivi il raggruppamento o torni su Movimenti
  vedi subito il riepilogo con i totali di ogni categoria.
- **Totale generale:** il riquadro in fondo resta sempre visibile.

### Colonna Pagamento
In tutte le viste dei movimenti c'è la colonna **Pagamento**: tabella, vista raggruppata, schede, finestra di
dettaglio con l'elenco dello stesso esercente, dashboard (movimenti recenti e alberi per categoria e persona).
Ogni tipo ha la sua icona colorata.

| Valore | Quando |
|---|---|
| **Carta …3661** | Carta di credito/debito (carte a 4 cifre diverse dalla prepagata) |
| **Bancomat …366** | Carta a 3 cifre; sotto compaiono "Prelievo" o "Commissione" quando servono |
| **Ricaricabile …2581** | Carta prepagata |
| **Conto** + tipo | Operazioni sul conto, con il tipo sotto: Bonifico, Bonifico istantaneo, Stipendio, Addebito diretto, Ricarica carta, Ricarica telefonica, Addebito carta di credito, F24, Costi del conto, Storno |
| **Manuale** | Movimenti inseriti a mano |

- **Ordinamento:** nella tabella principale cliccando l'intestazione.
- **Filtro:** "Carta/conto" nei Filtri avanzati.
- **Su telefono:** la colonna è nascosta e il pagamento compare sotto la descrizione.
- **Codice:** `src/app/utils/payment.ts` (regole) e `src/app/icons/payment-badge.component.ts` (`<app-payment>`).

### Mese in evidenza (barra in alto)
- **Barra in alto:** sopra i filtri c'è sempre la barra del mese, con il nome grande ("Novembre 2026") e
  entrate, uscite e saldo di quel mese.
- **Mese in corso:** è segnato con l'etichetta blu "MESE IN CORSO" e il bordo blu.
- **Cambiare mese:** con le frecce ‹ ›, con il selettore del mese o con **Mese in corso**. Non si va oltre il
  mese in corso.
- **Tutti i mesi:** mostra tutto l'archivio; la barra allora indica il periodo.
- **All'apertura** la lista parte dal **mese in corso**. Nella stessa sessione del browser ricorda l'ultimo
  mese scelto.
- **Cancella filtri** non tocca il mese, perché il mese non è un filtro.
- **Ricerca dall'esercente e "Da revisionare" dalla dashboard:** guardano tutti i mesi.
- **Link a un mese:** `/expenses?month=AAAA-MM` apre direttamente quel mese.

### Filtri sempre visibili
- **Tutti / Uscite / Entrate**
- **Periodo**: Un mese (quello della barra in alto), Tutto, Ultimi 3 / 6 / 12 / 24 / 36 mesi, Quest'anno, Anno scorso, Date…
- **Ricerca libera**: cerca in descrizione, note, descrizione originale della banca, categoria e membro.
  Più parole vanno tutte trovate.
- **⚠️ Da revisionare (N)**: mostra solo i movimenti categorizzati senza una regola sicura.

### Filtri avanzati (pulsante 🔍 Filtri)
Pagato da · Carta/conto · Ricariche e trasferimenti (mostra / nascondi / solo) · Importo da/a ·
Date personalizzate · **più categorie insieme** (selezionabili come "chip").

I filtri restano impostati finché la scheda del browser è aperta.

### Totali del risultato filtrato
Sopra la lista: **Entrate**, **Uscite**, **Saldo** e, se presenti, le ricariche/trasferimenti esclusi dai totali.
Gli stessi totali compaiono anche **sotto ogni tabella**. Valgono per tutte le righe filtrate, non solo per la pagina visibile.
- **Tabella:** l'ultima riga riporta il saldo e il dettaglio entrate, uscite ed esclusi.
- **Vista per categoria:** ogni gruppo ha la sua riga di totale, più il totale generale in fondo.
- **Vista card:** un riquadro con il totale sotto le card.

Righe di totale anche nelle altre pagine:
- **Dashboard → 📅 Totali per mese:** una riga per mese, dal più recente, con entrate, uscite, saldo e numero
  di movimenti. In fondo ci sono il totale di tutti i mesi e la media mensile. Ricariche e trasferimenti esclusi.
  Il mese in corso è evidenziato (sfondo blu ed etichetta "In corso"). **Un clic su un mese** apre Movimenti su quel mese.
- **Dashboard → Spese per membro, Spese per categoria, Spese per persona:** riga "Totale" in fondo.
- **Report → Dati mensili dettagliati:** totale e media mensile del periodo selezionato.

### Correggere le categorie
Nella tabella la categoria è un menu a tendina. Quando la cambi, se ci sono altri movimenti dello stesso
esercente l'app chiede se applicarla a tutti:

- **OK**: aggiorna tutti i movimenti di quell'esercente e salva una **regola personale**, usata anche nei
  prossimi import;
- **Annulla**: cambia solo quel movimento.

### Dettaglio di un movimento
Un clic su **qualsiasi riga di movimento** apre una finestra con tutti i dettagli. Vale per la lista
(tabella, vista raggruppata e schede) e per la dashboard (movimenti recenti e righe aperte di
"Uscite per categoria" / "Uscite per persona").

- **Contenuto:** data, importo, tipo, eventuali stati (trasferimento, ricarica esclusa, da revisionare),
  categoria (modificabile), chi ha pagato, carta o conto, origine, tipo operazione e stato della banca,
  esercente con il numero e il totale dei suoi movimenti, descrizione originale della banca e note.
- **Azioni:** Modifica, Escludi/Conta nei totali, Revisionato, Elimina.
- **Esercente:** il link "N movimenti · totale" apre, dentro la finestra, l'elenco dei movimenti di quell'esercente
  (stesso tipo, dal più recente), con il totale. Un clic su una riga passa al dettaglio di quel movimento.
  **Apri in Movimenti** porta alla lista cercando il nome (`/expenses?search=…`). Funziona anche se la lista è
  già aperta, e trova anche i movimenti che citano il nome nella descrizione della banca.
- **Come si chiude:** tasto Esc, la X o un clic fuori dalla finestra.
- **Controlli della riga:** i clic su tendine e pulsanti dentro la riga fanno la loro azione e non aprono
  la finestra.

---

## 6. Dashboard e report

- **Dashboard**: entrate, uscite e saldo del mese corrente con le medie mensili, saldo complessivo,
  grafico entrate/uscite per mese, distribuzione per categoria, andamento degli ultimi 30 giorni,
  movimenti recenti.
- **Grafico "Entrate e uscite per mese"**:
  - **Periodo:** si sceglie dal menu: ultimi 6, 12, 24 o 36 mesi, Tutto, oppure "Da mese… a mese…" con due
    selettori.
  - **Mesi senza movimenti:** compaiono vuoti, così l'asse del tempo resta regolare.
  - **Riepilogo:** sotto il titolo ci sono il periodo, le entrate, le uscite, il saldo e la media delle uscite
    al mese.
  - **Clic su un mese:** apre Movimenti su quel mese.
  - **Scelta ricordata:** la scelta resta nel browser (`localStorage`, chiave `dashboardChartRange`).
- **Report**: periodo da 3 mesi a 36 mesi, oppure Tutto.
- **Report**: entrate contro uscite mese per mese, andamento per membro, budget mensili per categoria.
  Usano solo le uscite reali.

---

## 7. Modello dei dati (`src/app/models/expense.model.ts`)

Ogni movimento è un `Expense`. Il nome è rimasto per compatibilità con i dati già salvati.

| Campo | Significato |
|---|---|
| `type` | `'uscita'` (default per i dati vecchi) o `'entrata'` |
| `amount` | Sempre positivo: il segno dipende da `type` |
| `isTransfer` | Trasferimento tra conti propri: escluso dai totali |
| `needsReview` | Categoria assegnata senza una regola sicura |
| `source` | `'manuale'` o `'banca'` |
| `bankType`, `bankDescription`, `bankStatus` | Dati originali della banca |
| `merchant` | Esercente normalizzato (maiuscolo, senza spazi): chiave delle regole personali |
| `card` | `2581`, `3661`, `366` o `Conto` |

Gli id dei movimenti importati (`b-…`) sono calcolati dai dati della riga, quindi lo stesso movimento ha
sempre lo stesso id: è così che i reimport saltano i doppioni.

### Chiavi in `localStorage`

| Chiave | Contenuto |
|---|---|
| `familyExpenses` | Movimenti |
| `familyMembers` | Membri della famiglia |
| `expenseCategories` | Categorie |
| `budgets` | Budget mensili per categoria |
| `categoryRules` | Regole personali esercente → categoria |
| `cardOwners` | Carta → membro |
| `bankSpacingFixed` | `1` dopo la riparazione una tantum degli spazi spuri |

L'export JSON (Impostazioni → Esporta, versione `3.0`) contiene tutto questo e si può reimportare.

**Importare un export da un altro browser o PC** (es. lavoro fatto su Chrome, importato su Edge):
- **Movimenti nuovi:** vengono aggiunti.
- **Movimenti già presenti** (stesso id): vengono **aggiornati** con categoria, note, revisione, trasferimento ecc.
  del file. Ogni modifica fatta nell'app salva `updatedAt`. Se entrambe le versioni ce l'hanno vince la più
  recente; se ce l'ha solo quella locale resta quella locale. Un export vecchio, quindi, non cancella il
  lavoro fatto dopo.
- **Regole esercente → categoria e proprietari delle carte:** vince il file.
- **Categorie:** icona e colore delle categorie con lo stesso nome vengono presi dal file.
- **Prima di questa versione** i movimenti già presenti venivano saltati, quindi le categorie cambiate
  sull'altro browser non arrivavano.
I file in versione `2.0` e quelli vecchi con le sole spese restano compatibili.

### Dove finiscono export e archivi
**Esporta dati** e **Archivia e svuota** salvano il file **direttamente in `data/storico`**, senza chiedere nulla.

- **Come funziona:** `npm start` avvia `ng serve` e, insieme, un piccolo server locale
  (`scripts/storage-server.mjs`, porta 4300). L'app lo chiama su `/api/storico`; `ng serve` inoltra la
  chiamata tramite `proxy.conf.json`. Il server scrive il file in `data/storico`.
- **Nessuna sovrascrittura:** se esiste già un file con lo stesso nome, aggiunge `-2`, `-3`, …
- **Sicurezza:**
  - il server ascolta solo su `127.0.0.1`;
  - accetta solo richieste dell'app (header `X-Manage-Cost` e origine localhost);
  - accetta solo nomi di file `.json` semplici.
- **Stato in Impostazioni:** in Gestione dati, *Cartella degli export* mostra "data/storico · salvataggio
  automatico nel progetto" quando il server è attivo.
- **Se il server non è attivo** (per esempio l'app è avviata con `ng serve` invece di `npm start`):
  - in Chrome ed Edge puoi scegliere una cartella con **Scegli cartella** (File System Access API);
  - la scelta resta salvata in IndexedDB `manageCost`;
  - altrimenti il file va in Download.
- **Avvio del solo server di salvataggio:** `npm run storage`.
- **Codice:**
  - `scripts/storage-server.mjs`, `scripts/dev.mjs`, `proxy.conf.json`;
  - `src/app/services/project-folder.service.ts`.

---

## 8. File principali

| File | Ruolo |
|---|---|
| `src/app/services/bank-import.ts` | Lettura del file .xlsx (senza librerie esterne, con `DecompressionStream`), conversione delle righe, regole di categoria |
| `src/app/services/expense.service.ts` | Archivio dei movimenti, riepiloghi, import banca, regole, carte, archivio/export/import |
| `src/app/services/default-data.ts` | Membri e categorie di default |
| `src/app/components/settings/` | Sezione Movimenti bancari, membri, categorie, gestione dati |
| `src/app/components/expense-list/` | Lista con filtri, totali, revisione delle categorie |
| `src/app/components/dashboard/`, `reports/` | Riepiloghi e grafici |
| `src/app/components/expense-form/` | Inserimento e modifica manuale (entrata o uscita) |
| `src/app/components/expense-detail/` + `services/expense-detail.service.ts` | Finestra di dettaglio del movimento, montata una volta in `app.html` e aperta da qualunque riga con `detail.openFromRow($event, id)` |
| `src/styles.css` | Design system: token di colore per tema chiaro e scuro, pulsanti, form, tabelle (`.data-table`), badge |
| `src/app/charts/chart-theme.ts` | Palette e stile comune dei grafici; li ridisegna al cambio di tema e quando il font è caricato |
| `src/app/icons/` | Icone Lucide: set dell'interfaccia, icone delle categorie, componente `app-category-icon` |
| `src/app/utils/format.ts` | Formattazione degli importi in euro, sempre con il separatore delle migliaia ("2.683,60 €") |

### Grafica

Lo stile è sobrio, da gestionale, e le regole sono queste:
- **Base:** font Inter, sfondo grigio chiaro, card bianche con bordo sottile, un solo colore primario (blu).
- **Colori con significato:** verde per le entrate, rosso per le uscite; nient'altro è colorato.
- **Icone professionali:** tutte le icone vengono da [Lucide](https://lucide.dev) (`lucide-angular`, licenza ISC).
  - Icone dell'interfaccia in `src/app/icons/ui-icons.ts`; nei componenti `readonly I = UI_ICONS`
    e nel template `<lucide-icon [img]="I.edit" [size]="16" />`.
  - Icone delle categorie in `src/app/icons/category-icons.ts`: la categoria salva la chiave (es. `shopping-cart`).
    Le vecchie emoji vengono convertite in automatico all'avvio; le categorie senza icona prendono quella
    del nome ("Cura persona" diventa `sparkles`), altrimenti `tag`.
  - `<app-category-icon>` mostra l'icona nel colore della categoria su un riquadro tenue.
    Compare in tabelle, schede, filtri, dashboard, budget e impostazioni.
  - Nelle tendine native (`<select>`) le icone non si possono mostrare: l'icona compare accanto alla tendina.
  - In Impostazioni → Categorie si sceglie l'icona da una griglia di 57 simboli.
- **Tabelle:** intestazioni grigie, numeri allineati a destra con cifre a larghezza fissa, riga di totale in fondo.
- **Tema scuro:** è costruito sugli stessi token (`body.dark-theme` in `styles.css`). I componenti non usano colori fissi.

Per cambiare un colore in tutta l'app basta modificare il token in `src/styles.css`, per esempio `--primary`.

---

## 9. Bug corretti

- **Memory leak**: dashboard, lista e report aprivano sottoscrizioni senza mai chiuderle; la dashboard
  ne aggiungeva una nuova a ogni modifica.
- **Doppioni all'import JSON**: reimportare lo stesso backup duplicava le spese con lo stesso id. Ora
  vengono saltate, e al primo avvio i doppioni già salvati vengono rimossi.
- **Budget**: la card spariva mentre scrivevi il limite e il budget appena aggiunto non veniva salvato;
  ora si può anche scegliere la categoria.
- **Paginazione**: cambiando filtro si restava su una pagina vuota.
- **Toast**: non comparivano per un'animazione Angular non configurata (`@slideIn`).
- **Date**: i grafici giornalieri mescolavano ora locale e UTC; ora tutte le date usano UTC.
- **Test** `app.spec.ts`: controllava un titolo vecchio.

---

## 10. Limiti noti e prossimi passi possibili

- I dati restano nel browser: cambiando browser o cancellando i dati di navigazione si perdono.
  Fai un **Esporta** ogni tanto: finisce in `data/storico`.
- Circa 320 movimenti da revisionare: le regole "applica a tutti" li riducono rapidamente.
- Le regole personali valgono per il nome esatto dell'esercente compresa la città
  (es. "SPAM SRL CASALI DEL MA ITA"). La stessa catena con un'altra sigla va corretta una volta in più.
- Proprietari delle carte: la …2581 è di Rita (default in `DEFAULT_CARD_OWNERS`, `src/app/services/default-data.ts`);
  conto, bancomat …366 e carta …3661 sono di Steven Crocco. Si cambiano in Impostazioni → Chi usa ogni carta?
  Una scelta fatta lì vale sempre più del default.
- La pagina principale dell'app pesa circa 716 kB, sopra il limite consigliato di 500 kB (solo un avviso
  di build), soprattutto per Chart.js.
