import { Injectable, signal } from '@angular/core';

/** Apre la finestra di dettaglio di un movimento da qualunque pagina */
@Injectable({ providedIn: 'root' })
export class ExpenseDetailService {
  readonly openId = signal<string | null>(null);

  open(id: string): void {
    this.openId.set(id);
  }

  close(): void {
    this.openId.set(null);
  }

  /**
   * Gestore per il click su una riga: ignora i click su controlli interni
   * (pulsanti, tendine, link, campi) così le azioni della riga continuano a funzionare.
   */
  openFromRow(event: Event, id: string): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, select, input, textarea, a, label')) return;
    if (window.getSelection()?.toString()) return; // l'utente stava selezionando del testo
    this.open(id);
  }
}

export function cardLabel(card: string | undefined): string {
  if (!card || card === 'manuale') return 'Inserite a mano';
  if (card === 'Conto') return 'Conto (bonifici/addebiti)';
  if (card === '2581') return 'Ricaricabile …2581';
  return card.length === 3 ? `Bancomat …${card}` : `Carta …${card}`;
}
