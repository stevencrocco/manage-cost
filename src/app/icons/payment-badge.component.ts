import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Expense } from '../models/expense.model';
import { paymentInfo } from '../utils/payment';

/** Colonna "Pagamento": icona + "Carta …3661" / "Bancomat …366" / "Ricaricabile …2581" / "Conto" con il tipo */
@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'pay pay-' + info().kind + (inline() ? ' inline' : '')" [title]="info().detail ? info().label + ' · ' + info().detail : info().label">
      <lucide-icon class="pay-icon" [img]="info().icon" [size]="15" />
      <span class="pay-text">
        <span class="pay-label">{{ info().label }}</span>
        @if (info().detail && !inline()) {
          <span class="pay-detail">{{ info().detail }}</span>
        }
        @if (info().detail && inline()) {
          <span class="pay-detail"> · {{ info().detail }}</span>
        }
      </span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; min-width: 0; }
    .pay { display: inline-flex; align-items: flex-start; gap: 7px; min-width: 0; color: var(--text-2); }
    .pay-icon { margin-top: 1px; color: var(--text-3); }
    .pay-carta .pay-icon { color: #2563eb; }
    .pay-bancomat .pay-icon { color: #0e7490; }
    .pay-ricaricabile .pay-icon { color: #7c3aed; }
    .pay-conto .pay-icon { color: #b45309; }
    .pay-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
    .pay-label { white-space: nowrap; }
    .pay-detail { font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pay.inline .pay-text { flex-direction: row; flex-wrap: wrap; align-items: baseline; }
    .pay.inline .pay-detail { font-size: inherit; white-space: pre-wrap; }
    :host-context(body.dark-theme) .pay-carta .pay-icon { color: #60a5fa; }
    :host-context(body.dark-theme) .pay-bancomat .pay-icon { color: #22d3ee; }
    :host-context(body.dark-theme) .pay-ricaricabile .pay-icon { color: #a78bfa; }
    :host-context(body.dark-theme) .pay-conto .pay-icon { color: #fbbf24; }
  `]
})
export class PaymentBadgeComponent {
  readonly expense = input.required<Pick<Expense, 'card' | 'bankType'>>();
  /** Su una riga sola ("Conto · Bonifico") invece che su due */
  readonly inline = input(false);
  readonly info = computed(() => paymentInfo(this.expense()));
}
