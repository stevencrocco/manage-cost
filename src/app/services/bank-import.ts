/**
 * Lettura dell'export "Movimenti" della banca (.xlsx) e conversione in movimenti dell'app.
 * Modulo senza dipendenze Angular: legge lo zip con DecompressionStream del browser.
 */
import { Expense } from '../models/expense.model';
import { UNCATEGORIZED_EXPENSE, UNCATEGORIZED_INCOME } from './default-data';

// ---------------------------------------------------------------------------
// Lettura XLSX (zip + XML del primo foglio)
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();

  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Il file non è un .xlsx valido');

  const entries = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();

  for (let n = 0; n < entries; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error('Struttura .xlsx non valida');
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
  }
  return files;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** Restituisce le righe del primo foglio come matrice di stringhe */
export async function readXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buffer);
  const read = (p: string) => {
    const f = files.get(p);
    return f ? new TextDecoder().decode(f) : '';
  };

  const shared: string[] = [];
  for (const m of read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  // Primo foglio: workbook.xml -> rels -> file
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const firstSheet = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(read('xl/workbook.xml'));
  if (firstSheet) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${firstSheet[1]}"[^>]*Target="([^"]+)"`).exec(read('xl/_rels/workbook.xml.rels'))
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet[1]}"`).exec(read('xl/_rels/workbook.xml.rels'));
    if (rel) sheetPath = rel[1].startsWith('/') ? rel[1].slice(1) : 'xl/' + rel[1].replace(/^\.\//, '');
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new Error('Foglio non trovato nel file .xlsx');

  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = decodeXml(v);
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push('');
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Normalizzazione e regole di categoria
// ---------------------------------------------------------------------------

/** Chiave di confronto: la banca spezza le parole con spazi ("SUPE R GO"), quindi li togliamo tutti */
export function textKey(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface MerchantRule {
  keys: string[];
  category: string;
  label?: string;
  transfer?: boolean;
}

/** Regole per esercenti/controparti (confronto su textKey, "contiene") */
const MERCHANT_RULES: MerchantRule[] = [
  // Alimentari
  { keys: ['SUPERGO'], category: 'Alimentari', label: 'Super Go' },
  { keys: ['ARDDISCOUNT', 'ARD'], category: 'Alimentari', label: 'ARD Discount' },
  { keys: ['EUROSPIN'], category: 'Alimentari', label: 'Eurospin' },
  { keys: ['IPERCOOP', 'COOP'], category: 'Alimentari', label: 'Coop' },
  { keys: ['CONAD'], category: 'Alimentari', label: 'Conad' },
  { keys: ['MDDISCOU', 'SUPERMERCATOMD'], category: 'Alimentari', label: 'MD Discount' },
  { keys: ['DOK'], category: 'Alimentari', label: 'Supermercato Dok' },
  { keys: ['LIDL'], category: 'Alimentari', label: 'Lidl' },
  { keys: ['CARREFOUR'], category: 'Alimentari', label: 'Carrefour' },
  { keys: ['DESPAR', 'SPAR'], category: 'Alimentari', label: 'Despar' },
  { keys: ['PENNY'], category: 'Alimentari', label: 'Penny' },
  { keys: ['RISPARMIOSICURO'], category: 'Alimentari', label: 'Risparmio Sicuro' },
  { keys: ['SUPERMERCATO', 'MINIMARKET', 'MACELLERIA', 'PANIFICIO', 'PASTIFICIO', 'FORNO', 'ORTOFRUTTA', 'SALUMERIA', 'PESCHERIA'], category: 'Alimentari' },
  // Ristoranti
  { keys: ['SUSHI'], category: 'Ristoranti' },
  { keys: ['PIZZ', 'RISTO', 'TRATTORIA', 'OSTERIA', 'PANINOTECA', 'ROSTICCERIA', 'ILRUSTICO', 'ALSOLITO', 'MCDONALD', 'BURGER', 'KEBAB', 'GELATERIA', 'PASTICCERIA', 'BAR', 'CAFFE', 'GLOVO', 'JUSTEAT', 'DELIVEROO'], category: 'Ristoranti' },
  // Carburante
  { keys: ['PV78', 'ESSO', 'Q8', 'TAMOIL', 'IPSTATION', 'ENISTATION', 'ENILIVE', 'CARBURANT', 'DISTRIBUTORE', 'API'], category: 'Carburante' },
  // Salute
  { keys: ['FARMACIA', 'FARMACI', 'PARAFARMACIA', 'OTTICA', 'DENTIST', 'MEDIC', 'LABORATORIO', 'ANALISI', 'OSPEDAL', 'CLINICA', 'RADIOL', 'CHECKUP', '^DOTT', '^DR', 'ASP'], category: 'Salute' },
  // Casa
  { keys: ['PIANETAPULITO', 'LEROYMERLIN', 'BRICO', 'IKEA', 'FERRAMENTA', 'ACQUADISAPONE', 'TIGOTA', 'LAVANDERIA', '^CASA'], category: 'Casa' },
  // Finanziamenti
  { keys: ['FINDOMESTIC', 'SANTANDERCONSUMER', 'AGOS', 'COMPASS', 'COFIDIS'], category: 'Finanziamenti' },
  // Abbonamenti digitali
  { keys: ['CLAUDEAI', 'ANTHROPIC', 'OPENAI', 'MICROSOFT', 'ADOBE'], category: 'Abbonamenti' },
  // Bollette / utenze
  { keys: ['TELECOMITALIA', 'TIMSPA', 'VODAFONE', 'WINDTRE', 'ILIAD', 'FASTWEB'], category: 'Bollette', label: 'Telefono/Internet' },
  { keys: ['ENISPA', 'ENIPLENITUDE', 'PLENITUDE', 'ENEL', 'HERA', 'A2A', 'EDISON', 'IREN', 'SORGENIA'], category: 'Bollette', label: 'Luce/Gas' },
  { keys: ['SERVIZIOIDR', 'ACQUEDOTTO', 'SORICAL'], category: 'Bollette', label: 'Acqua' },
  // Assicurazioni
  { keys: ['INSURANCE', 'ASSICURAZ', 'UNIPOL', 'GENERALI', 'ALLIANZ', 'AXA', 'PRIMA', 'GENIALLOYD', 'VERTI'], category: 'Assicurazioni' },
  // Tasse e PA
  { keys: ['PAGOPA', 'COMUNEDI', 'COMCASALIDELMANCO', 'AGENZIAENTRATE', 'ACI', 'MOTORIZZAZIONE', 'POSTEITALIANE'], category: 'Tasse e PA' },
  // Acquisti online
  { keys: ['PAYPAL'], category: 'Acquisti online', label: 'PayPal' },
  { keys: ['AMAZON', 'AMZN'], category: 'Acquisti online', label: 'Amazon' },
  { keys: ['GOOGLE'], category: 'Acquisti online', label: 'Google' },
  { keys: ['APPLE', 'ITUNES'], category: 'Acquisti online', label: 'Apple' },
  { keys: ['EBAY', 'ALIEXPRESS', 'SHEIN', 'TEMU', 'ZALANDO'], category: 'Acquisti online' },
  // Intrattenimento
  { keys: ['NETFLIX', 'SPOTIFY', 'DISNEY', 'DAZN', 'CINEMA', 'PRIMEVIDEO', 'STEAM', 'PLAYSTATION', '^LIDO', 'BEACH'], category: 'Intrattenimento' },
  { keys: ['ASD', 'BODYINMOVEMENT', 'PALESTRA', 'FITNESS', 'PISCINA', 'DANIELSCLUB'], category: 'Sport' },
  // Shopping
  { keys: ['ZARA', 'OVS', 'DECATHLON', 'MEDIAWORLD', 'UNIEURO', 'EURONICS', 'CALZEDONIA', 'PRIMARK', 'ABBIGLIAMENTO', 'CALZATURE',
           'TIGER', 'DEICHMANN', 'TOYSCENTER', 'GIOCHERIA', 'BEAUTY', 'PROFUMERIA', 'SCINTILLE'], category: 'Shopping' }
];

/** "^X" = il nome inizia con X; chiavi corte (<= 3, es. "ARD", "BAR") anche; le altre = contiene */
function keyMatches(key: string, k: string): boolean {
  if (k.startsWith('^')) return key.startsWith(k.slice(1));
  return k.length <= 3 ? key.startsWith(k) : key.includes(k);
}

function matchRule(key: string): MerchantRule | undefined {
  if (!key) return undefined;
  return MERCHANT_RULES.find(r => r.keys.some(k => keyMatches(key, k)))
    // Seconda passata: chiavi corte anche in mezzo al nome (es. "GECLAM SRLS OVS KIDS")
    ?? MERCHANT_RULES.find(r => r.keys.some(k => k.length === 3 && !['BAR', 'ARD', 'API', 'ASP', 'DOK', 'ACI'].includes(k) && key.includes(k)));
}

// ---------------------------------------------------------------------------
// Conversione righe banca -> movimenti
// ---------------------------------------------------------------------------

export type BankMovement = Omit<Expense, 'paidBy'> & { paidBy: string };

export interface BankParseResult {
  movements: BankMovement[];
  from: Date | null;
  to: Date | null;
  accountHolder: string;
  skippedRows: number;
}

export interface BankParseOptions {
  /** Regole create dall'utente: chiave esercente -> categoria */
  customRules?: { [merchantKey: string]: string };
  /** Carta -> membro */
  cardOwners?: { [card: string]: string };
  defaultMember: string;
}

function excelDate(v: string): Date | null {
  const n = Number(v);
  if (!v || isNaN(n) || n < 20000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

/** "Pag. del 19/11/26" o "Data operazione 22/11/2025": la data reale dell'acquisto/prelievo */
function realDateFromText(desc: string): Date | null {
  const m = /(?:Pag\.\s*del|Data\s*operazione)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i.exec(desc);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
}

function num(v: string): number {
  if (!v) return 0;
  const n = Number(v.includes(',') && !v.includes('.') ? v.replace(',', '.') : v);
  return isNaN(n) ? 0 : n;
}

function clean(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Spazi spuri della banca
// ---------------------------------------------------------------------------

/** La banca va a capo ogni 40 caratteri della descrizione e lì inserisce uno spazio */
const BANK_LINE_BREAK = 40;

/** Parole brevi complete: se lo spazio cade subito dopo, è uno spazio vero ("TOYS CENTER", "DOTT CARLO") */
const REAL_WORDS_BEFORE_BREAK = new Set([
  'BAR', 'CAFE', 'TOYS', 'DOTT', 'DOTT.', 'DR', 'DR.', 'ST', 'SAN', 'STA', 'VIA', 'CASA', 'SPAM', 'LIDL',
  'IL', 'LA', 'LO', 'DI', 'DA', 'DE', 'E', 'ED', 'A'
]);

/**
 * Crea una funzione che ripara le parole spezzate dalla banca ("PIZZ ERIA" -> "PIZZERIA").
 * Il vocabolario si costruisce da tutte le descrizioni dello stesso export:
 * - allo spazio della 40ª colonna le due parti si uniscono, salvo che siano due parole vere;
 * - altrove si uniscono solo se la parola intera compare più spesso dei due pezzi ("Ca rta" -> "Carta").
 */
export function createSpacingFixer(texts: string[]): (s: string) => string {
  const counts = new Map<string, number>();
  for (const t of texts) {
    let pos = 0;
    for (const tok of t.split(' ')) {
      const start = pos, end = pos + tok.length;
      pos = end + 1;
      // I pezzi attorno all'a capo non contano come parole vere
      if (!tok || end === BANK_LINE_BREAK || start === BANK_LINE_BREAK + 1) continue;
      const k = tok.toUpperCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const n = (s: string) => counts.get(s.toUpperCase()) ?? 0;
  const looksLikeTwoWords = (l: string, r: string) =>
    (/^[A-Z][a-z]/.test(r) && (l.length >= 2 || /[a-z]$/.test(l))) || // "Sanita Della", "APS Ins:", "BUNX Via"
    /^(SRL|SRLS|SNC|SAS|SPA)$/i.test(r) ||                // "FUEL SRLS"
    !/[A-Za-z0-9]/.test(l) ||                            // "& VI"
    (/^[A-Za-z]+$/.test(l) && /^\d+$/.test(r)) ||        // "LIDL 6092"
    REAL_WORDS_BEFORE_BREAK.has(l.toUpperCase());

  return (s: string) => {
    const toks = s.split(' ');
    const out = [toks[0]];
    let pos = toks[0].length;
    for (let j = 1; j < toks.length; j++) {
      const r = toks[j];
      const l = out[out.length - 1];
      const atBreak = pos === BANK_LINE_BREAK;
      pos += 1 + r.length;
      const joined = l + r;
      const wholeIsCommoner = n(joined) > Math.max(n(l), n(r));
      const join = atBreak
        ? wholeIsCommoner || (!looksLikeTwoWords(l, r) && !(n(l) >= 2 && n(r) >= 2 && n(joined) === 0))
        : n(joined) >= 3 && wholeIsCommoner;
      if (join && l && r) out[out.length - 1] = joined;
      else out.push(r);
    }
    return out.join(' ');
  };
}

/**
 * Ripara gli spazi spuri nei movimenti della banca già salvati.
 * Aggiorna descrizione completa e nome esercente (se l'utente non l'ha modificato).
 * Restituisce i movimenti aggiornati e le chiavi esercente cambiate (per spostare le regole).
 */
export function repairBankSpacing(expenses: Expense[]): { expenses: Expense[]; changed: number; renamedKeys: Map<string, string> } {
  const bank = expenses.filter(e => e.source === 'banca' && e.bankDescription);
  const fix = createSpacingFixer(bank.map(e => e.bankDescription!));
  const renamedKeys = new Map<string, string>();
  let changed = 0;

  const result = expenses.map(e => {
    if (e.source !== 'banca' || !e.bankDescription || !e.bankType) return e;
    const fixed = fix(e.bankDescription);
    if (fixed === e.bankDescription) return e;
    changed++;
    const isIncome = e.type === 'entrata';
    const oldName = extractMerchant(e.bankType, e.bankDescription, isIncome);
    const newName = extractMerchant(e.bankType, fixed, isIncome);
    const newKey = textKey(newName);
    if (e.merchant && e.merchant !== newKey) renamedKeys.set(e.merchant, newKey);
    return {
      ...e,
      bankDescription: fixed,
      // Il nome si aggiorna solo se è ancora quello generato dall'import
      description: e.description === oldName ? (newName || e.description) : e.description,
      merchant: newKey || e.merchant
    };
  });
  return { expenses: result, changed, renamedKeys };
}

function extractCard(type: string, desc: string): string {
  const full = /\*{4}\s*\*{4}\s*(\d{4})/.exec(type);
  if (full) return full[1];
  const short = /Carta\s*N\s*([*\s]+)(\d{3,4})/i.exec(desc);
  if (short) return short[2];
  return 'Conto';
}

/** Esercente o controparte, come testo leggibile */
function extractMerchant(type: string, desc: string, isIncome: boolean): string {
  const t = textKey(type);
  if (t.startsWith('MONOFUNZIONE') || t.startsWith('MULTIFUNZIONE')) return clean(desc);

  const presso = /presso:\s*(.+?)\s+Carta\s*N/i.exec(desc) ?? /presso:\s*(.+)$/i.exec(desc);
  if (presso) {
    // Toglie indirizzo, CAP e paese che seguono il nome
    return clean(presso[1].split(/\s(?:VIA|V\.LE|VIALE|PIAZZA|P\.ZZA|C\.SO|CORSO|CONTRADA|STRADA|LOC\.|LOCALITA)\s|\s\d{5}\s|\sITA$/i)[0]);
  }

  if (t.startsWith('SEPADIRECTDEBIT')) return clean(desc.split(/\s*A\s*d\s*d\s*e\s*b\s*i\s*t\s*o/i)[0]);

  if (t.includes('BONIFICO') || t.startsWith('STIPENDIO')) {
    const who = isIncome
      ? /(?:Ord|Ordinante)\s*:\s*(.+?)\s+(?:Ben|Beneficiario)\s*:/i.exec(desc)
      : /(?:Ben|Beneficiario)\s*:\s*(.+?)\s+(?:Dt-ord|Banca|Data|Causale|Ord|IBAN|Info)/i.exec(desc);
    if (who) return clean(who[1].split(/\s+Ins\s*:/i)[0]);
  }
  return clean(type);
}

interface Classification {
  type: 'uscita' | 'entrata';
  category: string;
  label?: string;
  isTransfer?: boolean;
  needsReview?: boolean;
}

function classify(bankType: string, desc: string, merchant: string, isIncome: boolean, customRules: { [k: string]: string }): Classification {
  const t = textKey(bankType);
  const d = textKey(desc);
  const mk = textKey(merchant);
  const type = isIncome ? 'entrata' : 'uscita';

  // Operazioni riconosciute dal tipo di movimento
  if (!isIncome) {
    if (t.startsWith('RICARICACARTARICARICABILE')) return { type, category: 'Trasferimenti', label: 'Ricarica carta ricaricabile', isTransfer: true };
    if (t.startsWith('UTILIZZOCARTADICREDITO')) return { type, category: 'Carta di credito', label: 'Estratto conto carta di credito' };
    if (t.startsWith('PRELIEVOBANCOMAT')) return { type, category: 'Contanti', label: 'Prelievo contanti' };
    if (t.startsWith('RICARICATELEFONICA')) return { type, category: 'Telefonia', label: 'Ricarica telefonica' };
    if (/^(CANONEMENSILE|COMMISSIONE|SPESESEPA|IMPOSTABOLLO|CARTARICARIC)/.test(t)) return { type, category: 'Spese bancarie', label: clean(bankType) };
    if (t.startsWith('PAGAMENTODELEGAF24')) return { type, category: 'Tasse e PA', label: 'F24' };
  }

  // Regola dell'utente per questo esercente (vince sulle regole standard)
  if (mk && customRules[mk]) return { type, category: customRules[mk] };

  if (isIncome) {
    if (t.startsWith('STIPENDIO')) return { type, category: 'Stipendio' };
    if (mk.includes('INPS') || d.includes('ORDINPS')) return { type, category: 'INPS e contributi', label: 'INPS' };
    if (/UNISALUTE|COMETA|STORNO|RIMBORSO|PAYPAL|SCONTOCANONE|AMAZON/.test(mk + t + d)) return { type, category: 'Rimborsi' };
    if (d.includes('REGALO') || d.includes('AUGURI')) return { type, category: 'Regali ricevuti' };
    return { type, category: UNCATEGORIZED_INCOME, needsReview: true };
  }

  const rule = matchRule(mk) ?? (t.startsWith('SEPADIRECTDEBIT') || t.includes('BONIFICO') ? matchRule(d) : undefined);
  if (rule) return { type, category: rule.category, label: rule.label, isTransfer: rule.transfer };
  if (d.includes('REGALO')) return { type, category: 'Regali' };
  return { type, category: UNCATEGORIZED_EXPENSE, needsReview: true };
}

/** Hash FNV-1a a 32 bit, per id stabili tra un import e l'altro */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function parseBankRows(rows: string[][], options: BankParseOptions): BankParseResult {
  const headerIdx = rows.findIndex(r => (r[0] || '').trim() === 'Data_Operazione');
  if (headerIdx < 0) throw new Error('Intestazione "Data_Operazione" non trovata: il file non sembra un export movimenti della banca');

  const header = rows[headerIdx].map(h => h.trim());
  const col = (name: string) => header.indexOf(name);
  const cOp = col('Data_Operazione'), cVal = col('Data_Valuta'), cIn = col('Entrate'), cOut = col('Uscite');
  const cType = col('Descrizione'), cDesc = col('Descrizione_Completa'), cStatus = col('Stato');

  const holderRow = rows.slice(0, headerIdx).find(r => /Intestazione/i.test(r[0] || ''));
  const accountHolder = holderRow ? clean((holderRow[0].split(':')[1] || '')) : '';

  const customRules = options.customRules ?? {};
  const cardOwners = options.cardOwners ?? {};
  const seen = new Map<string, number>();
  const movements: BankMovement[] = [];
  let skippedRows = 0;
  let from: Date | null = null;
  let to: Date | null = null;

  const dataRows = rows.slice(headerIdx + 1);
  const fixSpacing = createSpacingFixer(dataRows.map(r => clean(cDesc >= 0 ? r[cDesc] ?? '' : '')));

  for (const r of dataRows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const income = num(get(cIn));
    const outflow = num(get(cOut));
    if (!income && !outflow) { if (r.some(c => c && c.trim())) skippedRows++; continue; }

    const bankType = clean(get(cType));
    // L'id resta calcolato sul testo originale (textKey ignora comunque gli spazi)
    const desc = fixSpacing(clean(get(cDesc)));
    const date = realDateFromText(desc) ?? excelDate(get(cOp)) ?? excelDate(get(cVal));
    if (!date) { skippedRows++; continue; }

    const isIncome = income > 0;
    const merchant = extractMerchant(bankType, desc, isIncome);
    const c = classify(bankType, desc, merchant, isIncome, customRules);
    const card = extractCard(bankType, desc);

    // Id stabile: stessi dati -> stesso id; le righe identiche nello stesso file ricevono un progressivo
    const baseKey = [get(cOp), get(cVal), income, outflow, textKey(bankType), textKey(desc)].join('|');
    const occurrence = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, occurrence);

    const opDate = excelDate(get(cOp)) ?? excelDate(get(cVal)) ?? date;
    if (!from || opDate < from) from = opDate;
    if (!to || opDate > to) to = opDate;

    movements.push({
      id: 'b-' + hash(baseKey + '#' + occurrence),
      description: c.label ?? (merchant || bankType),
      amount: Math.round(Math.abs(isIncome ? income : outflow) * 100) / 100,
      category: c.category,
      date,
      paidBy: cardOwners[card] || options.defaultMember,
      notes: '',
      type: c.type,
      source: 'banca',
      isTransfer: c.isTransfer || undefined,
      needsReview: c.needsReview || undefined,
      bankType,
      bankDescription: desc,
      bankStatus: get(cStatus),
      merchant: textKey(merchant),
      card
    });
  }

  return { movements, from, to, accountHolder, skippedRows };
}

/** Riclassifica un movimento della banca con regole aggiornate (usato dopo una correzione dell'utente) */
export function reclassify(m: Expense, customRules: { [k: string]: string }): Classification | null {
  if (m.source !== 'banca' || !m.bankType) return null;
  return classify(m.bankType, m.bankDescription ?? '', m.merchant ?? '', m.type === 'entrata', customRules);
}
