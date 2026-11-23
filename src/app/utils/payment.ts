import { Banknote, CreditCard, Landmark, LucideIconData, PenLine, Wallet } from 'lucide-angular';
import { Expense } from '../models/expense.model';

export type PaymentKind = 'carta' | 'bancomat' | 'ricaricabile' | 'conto' | 'manuale';

export interface PaymentInfo {
  kind: PaymentKind;
  /** Testo principale: "Carta …3661", "Bancomat …366", "Ricaricabile …2581", "Conto", "Manuale" */
  label: string;
  /** Dettaglio dell'operazione: "Bonifico", "Addebito diretto", "Prelievo"… (vuoto se non serve) */
  detail: string;
  icon: LucideIconData;
}

/** Carta ricaricabile (prepagata): le altre carte a 4 cifre sono carte di credito/debito */
const PREPAID_CARDS = new Set(['2581']);

/** Tipo di operazione sul conto, a partire dalla descrizione della banca */
function contoDetail(bankType: string): string {
  const t = bankType.toLowerCase();
  if (t.includes('stipendio')) return 'Stipendio';
  if (t.includes('bonifico')) return t.includes('istantaneo') ? 'Bonifico istantaneo' : 'Bonifico';
  if (t.includes('sepa direct debit') || t.includes('sdd')) return t.startsWith('spese') ? 'Costi del conto' : 'Addebito diretto';
  if (t.includes('ricarica carta')) return 'Ricarica carta';
  if (t.includes('ricarica telefonica')) return 'Ricarica telefonica';
  if (t.includes('carta di credito')) return 'Addebito carta di credito';
  if (t.includes('f24')) return 'F24';
  if (t.includes('storno')) return 'Storno';
  if (t.includes('canone') || t.includes('bollo') || t.includes('quota adesione') || t.includes('commission') || t.startsWith('spese')) return 'Costi del conto';
  if (t.includes('bancomat')) return 'Bancomat';
  return bankType ? bankType.charAt(0).toUpperCase() + bankType.slice(1).toLowerCase() : '';
}

/** Come è stato pagato/incassato un movimento, per la colonna "Pagamento" */
export function paymentInfo(e: Pick<Expense, 'card' | 'bankType'>): PaymentInfo {
  const card = e.card;
  const bankType = e.bankType ?? '';

  if (!card || card === 'manuale') {
    return { kind: 'manuale', label: 'Manuale', detail: '', icon: PenLine };
  }
  if (card === 'Conto') {
    return { kind: 'conto', label: 'Conto', detail: contoDetail(bankType), icon: Landmark };
  }
  if (PREPAID_CARDS.has(card)) {
    return { kind: 'ricaricabile', label: `Ricaricabile …${card}`, detail: '', icon: Wallet };
  }
  if (card.length === 3) {
    const t = bankType.toLowerCase();
    const detail = t.includes('prelievo') ? 'Prelievo' : t.includes('commission') ? 'Commissione' : '';
    return { kind: 'bancomat', label: `Bancomat …${card}`, detail, icon: detail === 'Prelievo' ? Banknote : CreditCard };
  }
  return { kind: 'carta', label: `Carta …${card}`, detail: '', icon: CreditCard };
}

/** Testo unico, per ordinare e per i tooltip */
export function paymentText(e: Pick<Expense, 'card' | 'bankType'>): string {
  const p = paymentInfo(e);
  return p.detail ? `${p.label} · ${p.detail}` : p.label;
}
