import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ExpenseService } from '../../services/expense.service';
import { ExpenseSummary, Expense, Category, FamilyMember, isRealExpense, isRealIncome } from '../../models/expense.model';
import { BaseChartDirective } from 'ng2-charts';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { CategoryIconComponent } from '../../icons/category-icon.component';
import { ChartConfiguration, ChartData } from 'chart.js';
import { formatEuro } from '../../utils/format';
import { ExpenseDetailService } from '../../services/expense-detail.service';
import { CHART_COLORS, CHART_PALETTE, euroTick } from '../../charts/chart-theme';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, LucideAngularModule, CategoryIconComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  readonly I = UI_ICONS;
  readonly detail = inject(ExpenseDetailService);

  summary: ExpenseSummary = {
    totalExpenses: 0,
    totalIncome: 0,
    expensesByCategory: {},
    expensesByMember: {},
    monthlyAverage: 0,
    monthlyIncomeAverage: 0
  };

  /** Tutti i movimenti (comprese entrate e trasferimenti) */
  allMovements: Expense[] = [];
  /** Mese corrente: entrate e uscite reali */
  currentMonth = { income: 0, expenses: 0 };

  recentExpenses: Expense[] = [];
  topCategories: { name: string; amount: number; percentage: number }[] = [];

  // Tree view state
  expandedCategories: Set<string> = new Set();
  expandedMembers: Set<string> = new Set();
  allExpenses: Expense[] = [];
  /** Tabella dei totali per mese (dal più recente) e riga di totale */
  monthlyRows: { label: string; income: number; expenses: number; balance: number; count: number }[] = [];
  monthlyTotals = { income: 0, expenses: 0, balance: 0, count: 0 };
  categories: Category[] = [];
  members: FamilyMember[] = [];

  // Grafici (stile comune in charts/chart-theme.ts)
  public pieChartType = 'doughnut' as const;
  public pieChartData: ChartData<'doughnut'> = { labels: [], datasets: [{ data: [], backgroundColor: CHART_PALETTE }] };
  public pieChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed || 0;
            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
            return ` ${context.label}: ${formatEuro(value)} (${((value / total) * 100).toFixed(1)}%)`;
          }
        }
      }
    }
  };

  public barChartType = 'bar' as const;
  public barChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'end' },
      tooltip: { callbacks: { label: (context) => ` ${context.dataset.label}: ${formatEuro(context.parsed.y || 0)}` } }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, border: { display: false }, ticks: { callback: (value) => euroTick(value) } }
    }
  };

  public lineChartType = 'line' as const;
  public lineChartData: ChartData<'line'> = { labels: [], datasets: [] };
  public lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (context) => ` ${formatEuro(context.parsed.y || 0)}` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, border: { display: false }, ticks: { callback: (value) => euroTick(value), maxTicksLimit: 5 } }
    }
  };

  private destroyRef = inject(DestroyRef);

  constructor(
    private expenseService: ExpenseService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Una sola sottoscrizione, chiusa automaticamente alla distruzione del componente
    this.expenseService.getExpenses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(expenses => {
        this.allMovements = expenses;
        // Solo uscite reali: le ricariche della carta non sono spese
        this.allExpenses = expenses.filter(isRealExpense);
        this.recentExpenses = expenses
          .filter(e => !e.isTransfer)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 8);
        this.computeCurrentMonth();
        this.loadDashboardData();
      });
  }

  loadDashboardData(): void {
    this.summary = this.expenseService.getSummary();
    this.categories = this.expenseService.getCategories();
    this.members = this.expenseService.getFamilyMembers();
    this.calculateTopCategories();
    this.updateCharts();
  }

  calculateTopCategories(): void {
    const categories = Object.entries(this.summary.expensesByCategory)
      .filter(([_, amount]) => amount > 0)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: (amount / this.summary.totalExpenses) * 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    this.topCategories = categories;
  }

  getCategoryEntries(): { name: string; amount: number }[] {
    return Object.entries(this.summary.expensesByCategory)
      .filter(([_, amount]) => amount > 0)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  /** Somma degli importi di una lista (per le righe di totale) */
  sumOf(items: { amount?: number; total?: number }[]): number {
    return items.reduce((s, i) => s + (i.total ?? i.amount ?? 0), 0);
  }

  getMemberEntries(): { name: string; amount: number }[] {
    return Object.entries(this.summary.expensesByMember)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  formatCurrency(amount: number): string {
    return formatEuro(amount);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('it-IT', { timeZone: 'UTC' });
  }

  private computeCurrentMonth(): void {
    const now = new Date();
    const inMonth = (e: Expense) => {
      const d = new Date(e.date);
      return d.getUTCFullYear() === now.getFullYear() && d.getUTCMonth() === now.getMonth();
    };
    const month = this.allMovements.filter(inMonth);
    this.currentMonth = {
      income: month.filter(isRealIncome).reduce((s, e) => s + e.amount, 0),
      expenses: month.filter(isRealExpense).reduce((s, e) => s + e.amount, 0)
    };
  }

  isIncome(e: Expense): boolean {
    return e.type === 'entrata';
  }

  navigateToExpenses(): void {
    this.router.navigate(['/expenses']);
  }

  navigateToAddExpense(): void {
    this.router.navigate(['/expense-form']);
  }

  categoryByName(name: string): Category | undefined {
    return this.categories.find(c => c.name === name);
  }

  getCategoryColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length];
  }

  // Tree view methods
  toggleCategory(categoryName: string): void {
    if (this.expandedCategories.has(categoryName)) {
      this.expandedCategories.delete(categoryName);
    } else {
      this.expandedCategories.add(categoryName);
    }
  }

  toggleMember(memberName: string): void {
    if (this.expandedMembers.has(memberName)) {
      this.expandedMembers.delete(memberName);
    } else {
      this.expandedMembers.add(memberName);
    }
  }

  isCategoryExpanded(categoryName: string): boolean {
    return this.expandedCategories.has(categoryName);
  }

  isMemberExpanded(memberName: string): boolean {
    return this.expandedMembers.has(memberName);
  }

  getExpensesByCategory(categoryName: string): Expense[] {
    return this.allExpenses.filter(exp => exp.category === categoryName);
  }

  getExpensesByMember(memberName: string): Expense[] {
    return this.allExpenses.filter(exp => exp.paidBy === memberName);
  }

  getCategoryWithExpenses(): Array<{ category: Category; expenses: Expense[]; total: number }> {
    return this.categories
      .map(category => ({
        category,
        expenses: this.getExpensesByCategory(category.name),
        total: this.getExpensesByCategory(category.name).reduce((sum, exp) => sum + exp.amount, 0)
      }))
      .filter(item => item.expenses.length > 0)
      .sort((a, b) => b.total - a.total);
  }

  getMemberWithExpenses(): Array<{ member: FamilyMember; expenses: Expense[]; total: number }> {
    return this.members
      .map(member => ({
        member,
        expenses: this.getExpensesByMember(member.name),
        total: this.getExpensesByMember(member.name).reduce((sum, exp) => sum + exp.amount, 0)
      }))
      .filter(item => item.expenses.length > 0)
      .sort((a, b) => b.total - a.total);
  }

  editExpense(id: string): void {
    this.router.navigate(['/expense-form', id]);
  }

  // Chart update methods
  updateCharts(): void {
    this.updatePieChart();
    this.updateBarChart();
    this.updateLineChart();
  }

  updatePieChart(): void {
    const categoryData = Object.entries(this.summary.expensesByCategory)
      .filter(([_, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);

    // Le prime 8 categorie, le altre raggruppate: il grafico resta leggibile
    const top = categoryData.slice(0, 8);
    const rest = categoryData.slice(8).reduce((s, [, amount]) => s + amount, 0);
    if (rest > 0) top.push(['Altre categorie', rest]);

    this.pieChartData = {
      labels: top.map(([name]) => name),
      datasets: [{
        data: top.map(([, amount]) => amount),
        backgroundColor: top.map((_, i) => i === 8 ? '#c4c9d4' : CHART_PALETTE[i % CHART_PALETTE.length]),
        borderWidth: 0,
        hoverOffset: 4
      }]
    };
  }

  updateBarChart(): void {
    // Entrate e uscite reali per mese (ultimi 12 mesi con movimenti)
    const monthly: { [key: string]: { income: number; expenses: number; count: number } } = {};
    this.allMovements.forEach(e => {
      const income = isRealIncome(e);
      if (!income && !isRealExpense(e)) return;
      const d = new Date(e.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthly[key] ??= { income: 0, expenses: 0, count: 0 };
      if (income) monthly[key].income += e.amount;
      else monthly[key].expenses += e.amount;
      monthly[key].count++;
    });

    // Tabella mensile: tutti i mesi, dal più recente, con totale in fondo
    const fullMonthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    this.monthlyRows = Object.keys(monthly).sort().reverse().map(k => {
      const [y, m] = k.split('-');
      const v = monthly[k];
      return { label: `${fullMonthNames[parseInt(m) - 1]} ${y}`, income: v.income, expenses: v.expenses, balance: v.income - v.expenses, count: v.count };
    });
    this.monthlyTotals = this.monthlyRows.reduce(
      (t, r) => ({ income: t.income + r.income, expenses: t.expenses + r.expenses, balance: t.balance + r.balance, count: t.count + r.count }),
      { income: 0, expenses: 0, balance: 0, count: 0 }
    );

    const months = Object.keys(monthly).sort().slice(-12);
    const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

    this.barChartData = {
      labels: months.map(m => {
        const [year, monthNum] = m.split('-');
        return `${monthNames[parseInt(monthNum) - 1]} ${year.slice(2)}`;
      }),
      datasets: [
        { label: 'Entrate', data: months.map(m => monthly[m].income), backgroundColor: CHART_COLORS.income, borderRadius: 3, maxBarThickness: 22 },
        { label: 'Uscite', data: months.map(m => monthly[m].expenses), backgroundColor: CHART_COLORS.expense, borderRadius: 3, maxBarThickness: 22 }
      ]
    };
  }

  updateLineChart(): void {
    // Calcola trend giornaliero per gli ultimi 30 giorni
    const dailyData: { [key: string]: number } = {};
    const now = new Date();
    // Le date dei movimenti sono a mezzanotte UTC: anche le chiavi dei giorni
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Inizializza ultimi 30 giorni a 0
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = 0;
    }

    // Aggiungi spese effettive
    this.allExpenses.forEach(expense => {
      const dateKey = new Date(expense.date).toISOString().split('T')[0];
      if (dailyData.hasOwnProperty(dateKey)) {
        dailyData[dateKey] += expense.amount;
      }
    });

    const sortedDates = Object.keys(dailyData).sort();

    this.lineChartData = {
      labels: sortedDates.map(date => {
        const d = new Date(date);
        return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      }),
      datasets: [{
        label: 'Uscite',
        data: sortedDates.map(date => dailyData[date]),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primarySoft,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.3
      }]
    };
  }
}
