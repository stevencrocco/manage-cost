import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { ExpenseService } from '../../services/expense.service';
import { ExpenseDetailService, cardLabel } from '../../services/expense-detail.service';
import { ToastService } from '../../services/toast.service';
import { UI_ICONS } from '../../icons/ui-icons';
import { CategoryIconComponent } from '../../icons/category-icon.component';
import { PaymentBadgeComponent } from '../../icons/payment-badge.component';
import { Category, Expense, isCardTopUp, movementType } from '../../models/expense.model';
import { formatEuro } from '../../utils/format';

/** Finestra con tutti i dettagli di un movimento, montata una volta sola in app.html */
@Component({
  selector: 'app-expense-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, CategoryIconComponent, PaymentBadgeComponent],
  templateUrl: './expense-detail.component.html',
  styleUrls: ['./expense-detail.component.css']
})
export class ExpenseDetailComponent {
  readonly I = UI_ICONS;

  private expenseService = inject(ExpenseService);
  private detail = inject(ExpenseDetailService);
  private toast = inject(ToastService);
  private router = inject(Router);

  /** Il servizio riemette lo stesso array dopo una modifica: ogni emissione va considerata nuova */
  private expenses = signal<Expense[]>([], { equal: () => false });

  constructor() {
    this.expenseService.getExpenses()
      .pipe(takeUntilDestroyed())
      .subscribe(list => this.expenses.set(list));
  }

  /** Movimento aperto, sempre aggiornato (cambia se lo modifichi dalla finestra) */
  readonly expense = computed(() => {
    const id = this.detail.openId();
    return id ? this.expenses().find(e => e.id === id) ?? null : null;
  });

  /** Tutti i movimenti dello stesso esercente e tipo (incluso quello aperto), dal più recente */
  readonly sameMerchant = computed(() => {
    const e = this.expense();
    if (!e?.merchant) return { count: 0, total: 0, items: [] as Expense[] };
    const items = this.expenses()
      .filter(x => x.merchant === e.merchant && movementType(x) === movementType(e))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { count: items.length, total: items.reduce((s, x) => s + x.amount, 0), items };
  });

  /** Esercente di cui è aperto l'elenco movimenti: resta aperto passando da un movimento all'altro */
  private openMerchantList = signal<string | null>(null);
  readonly merchantListOpen = computed(() => {
    const m = this.expense()?.merchant;
    return !!m && this.openMerchantList() === m;
  });

  toggleMerchantList(e: Expense): void {
    this.openMerchantList.set(this.merchantListOpen() ? null : e.merchant ?? null);
  }

  /** Passa al dettaglio di un altro movimento dell'elenco */
  openOther(id: string): void {
    this.detail.open(id);
  }

  isCurrent(x: Expense): boolean {
    return x.id === this.expense()?.id;
  }

  shortDate(date: Date): string {
    return new Date(date).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.expense()) this.close();
  }

  close(): void {
    this.openMerchantList.set(null);
    this.detail.close();
  }

  // Formattazione -------------------------------------------------------------

  formatCurrency(n: number): string {
    return formatEuro(n);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('it-IT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  signedAmount(e: Expense): string {
    const sign = e.isTransfer ? '' : movementType(e) === 'entrata' ? '+' : '−';
    return sign + formatEuro(e.amount);
  }

  amountClass(e: Expense): string {
    if (e.isTransfer) return 'muted';
    return movementType(e) === 'entrata' ? 'pos' : 'neg';
  }

  typeLabel(e: Expense): string {
    return movementType(e) === 'entrata' ? 'Entrata' : 'Uscita';
  }

  sourceLabel(e: Expense): string {
    return e.source === 'banca' ? 'Import dalla banca' : 'Inserito a mano';
  }

  cardLabel(card: string | undefined): string {
    return cardLabel(card);
  }

  isTopUp(e: Expense): boolean {
    return isCardTopUp(e);
  }

  category(e: Expense): Category | undefined {
    return this.expenseService.getCategory(e.category);
  }

  categoriesFor(e: Expense): Category[] {
    return this.expenseService.getCategories(movementType(e));
  }

  // Azioni ------------------------------------------------------------------

  changeCategory(e: Expense, category: string): void {
    if (category === e.category) return;
    const others = this.sameMerchant().count - 1;
    if (e.merchant && others > 0 && confirm(
      `Applicare "${category}" anche agli altri ${others} movimenti di "${e.description}"?\n\n` +
      `OK = tutti (e anche ai prossimi import)\nAnnulla = solo questo`
    )) {
      const n = this.expenseService.setCategory(e.id, category, true);
      this.toast.success(`Categoria "${category}" applicata a ${n} movimenti`);
    } else {
      this.expenseService.setCategory(e.id, category, false);
      this.toast.success('Categoria aggiornata');
    }
  }

  markReviewed(e: Expense): void {
    this.expenseService.updateExpense(e.id, { needsReview: false });
    this.toast.success('Segnato come revisionato');
  }

  toggleTransfer(e: Expense): void {
    if (isCardTopUp(e)) return;
    this.expenseService.setTransfer(e.id, !e.isTransfer);
    this.toast.info(e.isTransfer ? 'Ora conta nei totali' : 'Segnato come trasferimento: escluso dai totali');
  }

  edit(e: Expense): void {
    this.close();
    this.router.navigate(['/expense-form', e.id]);
  }

  showSameMerchant(e: Expense): void {
    this.close();
    this.router.navigate(['/expenses'], { queryParams: { search: e.description } });
  }

  remove(e: Expense): void {
    if (confirm('Sei sicuro di voler eliminare questo movimento?')) {
      this.expenseService.deleteExpense(e.id);
      this.toast.success('Movimento eliminato');
      this.close();
    }
  }
}
