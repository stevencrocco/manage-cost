import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExpenseService } from '../../services/expense.service';
import { ToastService } from '../../services/toast.service';
import { formatEuro } from '../../utils/format';
import { ExpenseDetailService, cardLabel } from '../../services/expense-detail.service';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { CategoryIconComponent } from '../../icons/category-icon.component';
import { Category, Expense, isCardTopUp, movementType } from '../../models/expense.model';

type SortColumn = 'date' | 'description' | 'amount' | 'category' | 'paidBy';
type PeriodPreset = 'all' | 'thisMonth' | 'lastMonth' | 'last3' | 'last12' | 'thisYear' | 'lastYear' | 'custom';

const FILTERS_KEY = 'expenseListFilters';

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, CategoryIconComponent],
  templateUrl: './expense-list.component.html',
  styleUrls: ['./expense-list.component.css']
})
export class ExpenseListComponent implements OnInit {
  readonly I = UI_ICONS;
  readonly detail = inject(ExpenseDetailService);

  expenses: Expense[] = [];
  filteredExpenses: Expense[] = [];
  /** Righe della pagina corrente (calcolate una volta per cambio, non a ogni change detection) */
  pageItems: Expense[] = [];
  groupedItems: { category: string; expenses: Expense[]; total: number }[] = [];
  totals = { income: 0, expenses: 0, balance: 0, transfers: 0, transferCount: 0 };

  // Filtri
  typeFilter: 'all' | 'uscita' | 'entrata' = 'all';
  period: PeriodPreset = 'all';
  dateFrom = '';
  dateTo = '';
  selectedCategories: string[] = [];
  selectedMember = 'all';
  selectedCard = 'all';
  searchText = '';
  minAmount: number | null = null;
  maxAmount: number | null = null;
  transfers: 'show' | 'hide' | 'only' = 'show';
  onlyToReview = false;
  showFilters = false;

  readonly periods: { value: PeriodPreset; label: string }[] = [
    { value: 'all', label: 'Tutto' },
    { value: 'thisMonth', label: 'Questo mese' },
    { value: 'lastMonth', label: 'Mese scorso' },
    { value: 'last3', label: 'Ultimi 3 mesi' },
    { value: 'last12', label: 'Ultimi 12 mesi' },
    { value: 'thisYear', label: 'Quest\'anno' },
    { value: 'lastYear', label: 'Anno scorso' },
    { value: 'custom', label: 'Date…' }
  ];

  // Visualizzazione
  viewMode: 'cards' | 'table' = 'table';
  currentPage = 1;
  itemsPerPage = 25;
  sortColumn: SortColumn = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';
  groupByCategory = false;

  private destroyRef = inject(DestroyRef);

  constructor(
    private expenseService: ExpenseService,
    private router: Router,
    private route: ActivatedRoute,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.restoreFilters();
    if (this.route.snapshot.queryParamMap.get('review')) {
      this.clearFilters(false);
      this.onlyToReview = true;
      this.showFilters = true;
    }
    const search = this.route.snapshot.queryParamMap.get('search');
    if (search) {
      this.clearFilters(false);
      this.searchText = search;
    }

    this.expenseService.getExpenses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(expenses => {
        this.expenses = expenses;
        this.filterExpenses();
      });
  }

  // ---------------------------------------------------------------------------
  // Filtri
  // ---------------------------------------------------------------------------

  /** Chiamato quando l'utente cambia un filtro: torna alla prima pagina */
  applyFilters(): void {
    this.currentPage = 1;
    this.saveFilters();
    this.filterExpenses();
  }

  setPeriod(p: PeriodPreset): void {
    this.period = p;
    if (p !== 'custom') {
      const range = this.periodRange(p);
      this.dateFrom = range ? this.toInputDate(range[0]) : '';
      this.dateTo = range ? this.toInputDate(range[1]) : '';
    }
    this.applyFilters();
  }

  onCustomDateChange(): void {
    this.period = 'custom';
    this.applyFilters();
  }

  private periodRange(p: PeriodPreset): [Date, Date] | null {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const utc = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd));
    switch (p) {
      case 'thisMonth': return [utc(y, m, 1), utc(y, m + 1, 0)];
      case 'lastMonth': return [utc(y, m - 1, 1), utc(y, m, 0)];
      case 'last3': return [utc(y, m - 2, 1), utc(y, m + 1, 0)];
      case 'last12': return [utc(y, m - 11, 1), utc(y, m + 1, 0)];
      case 'thisYear': return [utc(y, 0, 1), utc(y, 11, 31)];
      case 'lastYear': return [utc(y - 1, 0, 1), utc(y - 1, 11, 31)];
      default: return null;
    }
  }

  private toInputDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  toggleCategory(name: string): void {
    this.selectedCategories = this.selectedCategories.includes(name)
      ? this.selectedCategories.filter(c => c !== name)
      : [...this.selectedCategories, name];
    this.applyFilters();
  }

  isCategorySelected(name: string): boolean {
    return this.selectedCategories.includes(name);
  }

  filterExpenses(): void {
    const search = this.searchText.trim().toLowerCase();
    // Le date sono salvate a mezzanotte UTC: confronto sullo stesso formato
    const from = this.dateFrom ? new Date(this.dateFrom).getTime() : null;
    const to = this.dateTo ? new Date(this.dateTo).getTime() : null;

    this.filteredExpenses = this.expenses.filter(e => {
      const type = movementType(e);
      if (this.typeFilter !== 'all' && type !== this.typeFilter) return false;
      if (this.transfers === 'hide' && e.isTransfer) return false;
      if (this.transfers === 'only' && !e.isTransfer) return false;
      if (this.onlyToReview && !e.needsReview) return false;
      if (this.selectedCategories.length && !this.selectedCategories.includes(e.category)) return false;
      if (this.selectedMember !== 'all' && e.paidBy !== this.selectedMember) return false;
      if (this.selectedCard !== 'all' && (e.card ?? 'manuale') !== this.selectedCard) return false;
      const t = new Date(e.date).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (this.minAmount !== null && this.minAmount !== undefined && e.amount < this.minAmount) return false;
      if (this.maxAmount !== null && this.maxAmount !== undefined && e.amount > this.maxAmount) return false;
      if (search) {
        const haystack = `${e.description} ${e.notes ?? ''} ${e.bankDescription ?? ''} ${e.category} ${e.paidBy}`.toLowerCase();
        if (!search.split(/\s+/).every(w => haystack.includes(w))) return false;
      }
      return true;
    });

    this.computeTotals();

    // Se la pagina corrente non esiste più (es. dopo un'eliminazione), torna all'ultima valida
    this.currentPage = Math.min(this.currentPage, Math.max(this.getTotalPages(), 1));
    this.refreshView();
  }

  private computeTotals(): void {
    const t = { income: 0, expenses: 0, balance: 0, transfers: 0, transferCount: 0 };
    for (const e of this.filteredExpenses) {
      if (e.isTransfer) { t.transfers += e.amount; t.transferCount++; }
      else if (movementType(e) === 'entrata') t.income += e.amount;
      else t.expenses += e.amount;
    }
    t.balance = t.income - t.expenses;
    this.totals = t;
  }

  private refreshView(): void {
    const sorted = this.getSortedExpenses();
    const start = (this.currentPage - 1) * this.itemsPerPage;
    this.pageItems = sorted.slice(start, start + Number(this.itemsPerPage));

    if (this.groupByCategory) {
      const grouped = new Map<string, Expense[]>();
      sorted.forEach(e => {
        if (!grouped.has(e.category)) grouped.set(e.category, []);
        grouped.get(e.category)!.push(e);
      });
      this.groupedItems = Array.from(grouped.entries())
        .map(([category, expenses]) => ({
          category,
          expenses,
          total: expenses.reduce((s, e) => s + this.signedAmount(e), 0)
        }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    }
  }

  clearFilters(apply = true): void {
    this.typeFilter = 'all';
    this.period = 'all';
    this.dateFrom = '';
    this.dateTo = '';
    this.selectedCategories = [];
    this.selectedMember = 'all';
    this.selectedCard = 'all';
    this.searchText = '';
    this.minAmount = null;
    this.maxAmount = null;
    this.transfers = 'show';
    this.onlyToReview = false;
    if (apply) this.applyFilters();
  }

  getActiveFiltersCount(): number {
    let count = 0;
    if (this.typeFilter !== 'all') count++;
    if (this.dateFrom || this.dateTo) count++;
    if (this.selectedCategories.length) count++;
    if (this.selectedMember !== 'all') count++;
    if (this.selectedCard !== 'all') count++;
    if (this.searchText) count++;
    if (this.minAmount !== null) count++;
    if (this.maxAmount !== null) count++;
    if (this.transfers !== 'show') count++;
    if (this.onlyToReview) count++;
    return count;
  }

  hasActiveFilters(): boolean {
    return this.getActiveFiltersCount() > 0;
  }

  /** Filtri ricordati nella sessione del browser (comodità, non dati) */
  private saveFilters(): void {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
        typeFilter: this.typeFilter, period: this.period, dateFrom: this.dateFrom, dateTo: this.dateTo,
        selectedCategories: this.selectedCategories, selectedMember: this.selectedMember,
        selectedCard: this.selectedCard, transfers: this.transfers, viewMode: this.viewMode,
        itemsPerPage: this.itemsPerPage
      }));
    } catch { /* storage non disponibile */ }
  }

  private restoreFilters(): void {
    try {
      const saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || 'null');
      if (saved) Object.assign(this, saved);
      // I periodi relativi si ricalcolano sulla data di oggi
      if (this.period !== 'all' && this.period !== 'custom') {
        const range = this.periodRange(this.period);
        if (range) { this.dateFrom = this.toInputDate(range[0]); this.dateTo = this.toInputDate(range[1]); }
      }
    } catch { /* ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Opzioni dei filtri
  // ---------------------------------------------------------------------------

  getCategoryOptions(): Category[] {
    const used = new Set(this.expenses.map(e => e.category));
    const type = this.typeFilter === 'all' ? undefined : this.typeFilter;
    return this.expenseService.getCategories(type).filter(c => used.has(c.name));
  }

  getMembers(): string[] {
    return Array.from(new Set(this.expenses.map(exp => exp.paidBy))).sort();
  }

  getCards(): string[] {
    return Array.from(new Set(this.expenses.map(e => e.card ?? 'manuale')));
  }

  cardLabel(card: string | undefined): string {
    return cardLabel(card);
  }

  getCategoriesForType(e: Expense): Category[] {
    return this.expenseService.getCategories(movementType(e));
  }

  getReviewCount(): number {
    return this.expenses.filter(e => e.needsReview).length;
  }

  // ---------------------------------------------------------------------------
  // Azioni
  // ---------------------------------------------------------------------------

  changeCategory(e: Expense, category: string): void {
    if (category === e.category) return;
    const sameMerchant = e.merchant
      ? this.expenses.filter(x => x.merchant === e.merchant && x.id !== e.id && !x.isTransfer && movementType(x) === movementType(e)).length
      : 0;

    if (sameMerchant > 0 && confirm(
      `Applicare "${category}" anche agli altri ${sameMerchant} movimenti di "${e.description}"?\n\n` +
      `OK = tutti (e anche ai prossimi import)\nAnnulla = solo questo`
    )) {
      const n = this.expenseService.setCategory(e.id, category, true);
      this.toastService.success(`Categoria "${category}" applicata a ${n} movimenti`);
    } else {
      this.expenseService.setCategory(e.id, category, false);
      this.toastService.success('Categoria aggiornata');
    }
  }

  isTopUp(e: Expense): boolean {
    return isCardTopUp(e);
  }

  toggleTransfer(e: Expense): void {
    if (isCardTopUp(e)) {
      this.toastService.info('Le ricariche della prepagata non contano mai nei totali: le spese vere sono gli acquisti con la carta');
      return;
    }
    this.expenseService.setTransfer(e.id, !e.isTransfer);
    this.toastService.info(e.isTransfer ? 'Ora conta nei totali' : 'Segnato come trasferimento: escluso dai totali');
  }

  openDetails(id: string): void {
    this.detail.open(id);
  }

  deleteExpense(id: string): void {
    if (confirm('Sei sicuro di voler eliminare questo movimento?')) {
      this.expenseService.deleteExpense(id);
      this.toastService.success('Movimento eliminato');
    }
  }

  editExpense(id: string): void {
    this.router.navigate(['/expense-form', id]);
  }

  addNewExpense(): void {
    this.router.navigate(['/expense-form']);
  }

  // ---------------------------------------------------------------------------
  // Formattazione
  // ---------------------------------------------------------------------------

  signedAmount(e: Expense): number {
    if (e.isTransfer) return 0;
    return movementType(e) === 'entrata' ? e.amount : -e.amount;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }

  formatCurrency(amount: number): string {
    return formatEuro(amount);
  }

  formatSigned(e: Expense): string {
    const sign = e.isTransfer ? '' : movementType(e) === 'entrata' ? '+' : '−';
    return sign + this.formatCurrency(e.amount);
  }

  amountClass(e: Expense): string {
    if (e.isTransfer) return 'amount-transfer';
    return movementType(e) === 'entrata' ? 'amount-income' : 'amount-expense';
  }

  getCategoryColor(categoryName: string): string {
    return this.expenseService.getCategory(categoryName)?.color || '#607D8B';
  }

  getCategoryIcon(categoryName: string): string {
    return this.expenseService.getCategory(categoryName)?.icon || '';
  }

  // ---------------------------------------------------------------------------
  // Vista, ordinamento e paginazione
  // ---------------------------------------------------------------------------

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'cards' ? 'table' : 'cards';
    this.saveFilters();
  }

  setViewMode(mode: 'cards' | 'table'): void {
    if (this.viewMode !== mode) this.toggleViewMode();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  getSortedExpenses(): Expense[] {
    const sorted = [...this.filteredExpenses];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (this.sortColumn) {
        case 'date': comparison = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'description': comparison = a.description.localeCompare(b.description); break;
        case 'amount': comparison = this.signedAmount(a) - this.signedAmount(b) || a.amount - b.amount; break;
        case 'category': comparison = a.category.localeCompare(b.category); break;
        case 'paidBy': comparison = a.paidBy.localeCompare(b.paidBy); break;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }

  sortBy(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.refreshView();
  }

  sortIcon(column: SortColumn): string {
    return this.sortColumn === column ? (this.sortDirection === 'asc' ? '↑' : '↓') : '';
  }

  toggleGrouping(): void {
    this.groupByCategory = !this.groupByCategory;
    this.currentPage = 1;
    this.refreshView();
  }

  getTotalPages(): number {
    return Math.ceil(this.filteredExpenses.length / this.itemsPerPage);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.getTotalPages()) {
      this.currentPage = page;
      this.refreshView();
    }
  }

  onItemsPerPageChange(): void {
    this.itemsPerPage = Number(this.itemsPerPage);
    this.currentPage = 1;
    this.saveFilters();
    this.refreshView();
  }

  getPageNumbers(): number[] {
    const total = this.getTotalPages();
    const pages: number[] = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else if (this.currentPage <= 3) {
      pages.push(1, 2, 3, 4, 5, -1, total);
    } else if (this.currentPage >= total - 2) {
      pages.push(1, -1);
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1, -1, this.currentPage - 1, this.currentPage, this.currentPage + 1, -1, total);
    }
    return pages;
  }
}
