export type MovementType = 'uscita' | 'entrata';
export type MovementSource = 'manuale' | 'banca';

/**
 * Un movimento: spesa (uscita) o entrata.
 * Il nome "Expense" è mantenuto per compatibilità con i dati e il codice esistenti.
 * L'importo è sempre positivo: il segno è dato da `type`.
 */
export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  paidBy: string;
  notes?: string;

  /** Default 'uscita' per i dati inseriti prima dell'introduzione delle entrate */
  type?: MovementType;
  source?: MovementSource;
  /** Giroconto/ricarica tra conti propri: escluso dai totali per non contare due volte */
  isTransfer?: boolean;
  /** Categoria assegnata in automatico senza una regola sicura */
  needsReview?: boolean;

  // Dati originali della banca (solo per source === 'banca')
  bankType?: string;
  bankDescription?: string;
  bankStatus?: string;
  /** Esercente/controparte normalizzato, usato per le regole di categoria */
  merchant?: string;
  /** Ultime cifre della carta, o 'Conto' per operazioni sul conto */
  card?: string;
  /** Ultima modifica fatta nell'app (ISO): all'import vince la versione più recente */
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Default 'uscita' */
  type?: MovementType;
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalIncome: number;
  expensesByCategory: { [key: string]: number };
  expensesByMember: { [key: string]: number };
  monthlyAverage: number;
  monthlyIncomeAverage: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  color: string;
}

export interface ExportData {
  expenses: Expense[];
  categories: Category[];
  members: FamilyMember[];
  exportDate: string;
  version: string;
  budgets?: { [key: string]: number };
  categoryRules?: { [merchant: string]: string };
  cardOwners?: { [card: string]: string };
}

export function movementType(e: Expense): MovementType {
  return e.type ?? 'uscita';
}

/**
 * Ricarica della carta prepagata (…2581). Non è mai una spesa: le spese vere sono gli
 * acquisti fatti con la carta, che arrivano come movimenti separati. Resta in archivio e nelle ricerche.
 */
export function isCardTopUp(e: Expense): boolean {
  return (e.bankType ?? '').toUpperCase().replace(/[^A-Z]/g, '').startsWith('RICARICACARTARICARICABILE');
}

/** Escluso da ogni totale: trasferimento interno o ricarica della prepagata */
export function isExcludedFromTotals(e: Expense): boolean {
  return !!e.isTransfer || isCardTopUp(e);
}

/** Uscita reale (non trasferimento interno né ricarica carta) */
export function isRealExpense(e: Expense): boolean {
  return movementType(e) === 'uscita' && !isExcludedFromTotals(e);
}

/** Entrata reale (non trasferimento interno) */
export function isRealIncome(e: Expense): boolean {
  return movementType(e) === 'entrata' && !isExcludedFromTotals(e);
}
