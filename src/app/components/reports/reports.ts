import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService } from '../../services/expense.service';
import { Expense, isRealExpense, isRealIncome } from '../../models/expense.model';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { formatEuro } from '../../utils/format';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { CategoryIconComponent } from '../../icons/category-icon.component';
import { CHART_COLORS, CHART_PALETTE, euroTick } from '../../charts/chart-theme';

interface MonthlyData {
  month: string;
  year: number;
  total: number;
  count: number;
  byCategory: { [key: string]: number };
  byMember: { [key: string]: number };
}

interface MemberStats {
  name: string;
  total: number;
  count: number;
  average: number;
  percentage: number;
}

interface Budget {
  category: string;
  limit: number;
  spent: number;
  percentage: number;
  isOverBudget: boolean;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, LucideAngularModule, CategoryIconComponent],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsComponent implements OnInit {
  readonly I = UI_ICONS;

  expenses: Expense[] = [];
  monthlyData: MonthlyData[] = [];
  memberStats: MemberStats[] = [];
  budgets: Budget[] = [];
  incomeByMonth = new Map<string, number>();

  // Filtri periodo
  selectedMonths: number = 6;

  // Grafici comparativi
  public comparisonChartData: ChartConfiguration['data'] = { datasets: [] };
  public comparisonChartOptions: ChartConfiguration['options'] = {};
  public comparisonChartType: ChartType = 'bar';

  // Grafico trend per membro
  public memberTrendChartData: ChartConfiguration['data'] = { datasets: [] };
  public memberTrendChartOptions: ChartConfiguration['options'] = {};
  public memberTrendChartType: ChartType = 'line';

  constructor(private expenseService: ExpenseService) {}

  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.expenseService.getExpenses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(expenses => {
      // Report sulle uscite reali: ricariche carta e trasferimenti esclusi
      this.expenses = expenses.filter(isRealExpense);
      this.incomeByMonth = this.buildIncomeByMonth(expenses);
      this.calculateMonthlyData();
      this.calculateMemberStats();
      this.loadBudgets();
      this.updateComparisonChart();
      this.updateMemberTrendChart();
    });
  }

  calculateMonthlyData(): void {
    const monthsMap = new Map<string, MonthlyData>();
    const now = new Date();

    this.expenses.forEach(expense => {
      const expenseDate = new Date(expense.date);
      const monthKey = `${expenseDate.getUTCFullYear()}-${String(expenseDate.getUTCMonth() + 1).padStart(2, '0')}`;

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          month: this.getMonthName(expenseDate.getUTCMonth()),
          year: expenseDate.getUTCFullYear(),
          total: 0,
          count: 0,
          byCategory: {},
          byMember: {}
        });
      }

      const monthData = monthsMap.get(monthKey)!;
      monthData.total += expense.amount;
      monthData.count++;

      monthData.byCategory[expense.category] = (monthData.byCategory[expense.category] || 0) + expense.amount;
      monthData.byMember[expense.paidBy] = (monthData.byMember[expense.paidBy] || 0) + expense.amount;
    });

    this.monthlyData = Array.from(monthsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, this.selectedMonths)
      .map(([_, data]) => data)
      .reverse();
  }

  calculateMemberStats(): void {
    const memberMap = new Map<string, { total: number; count: number }>();
    let grandTotal = 0;

    this.expenses.forEach(expense => {
      if (!memberMap.has(expense.paidBy)) {
        memberMap.set(expense.paidBy, { total: 0, count: 0 });
      }
      const stats = memberMap.get(expense.paidBy)!;
      stats.total += expense.amount;
      stats.count++;
      grandTotal += expense.amount;
    });

    this.memberStats = Array.from(memberMap.entries())
      .map(([name, stats]) => ({
        name,
        total: stats.total,
        count: stats.count,
        average: stats.total / stats.count,
        percentage: grandTotal > 0 ? (stats.total / grandTotal) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);
  }

  loadBudgets(): void {
    let budgetLimits: { [key: string]: number } = {};
    try {
      budgetLimits = JSON.parse(localStorage.getItem('budgets') || '{}') || {};
    } catch {
      budgetLimits = {};
    }

    // Mantiene tutti i budget salvati (anche con limite 0, es. appena aggiunti)
    this.budgets = this.expenseService.getCategories()
      .filter(cat => cat.name in budgetLimits)
      .map(cat => this.buildBudget(cat.name, Number(budgetLimits[cat.name]) || 0));
  }

  private buildBudget(category: string, limit: number): Budget {
    const now = new Date();
    const spent = this.expenses
      .filter(e => {
        const expDate = new Date(e.date);
        return e.category === category &&
               expDate.getUTCMonth() === now.getMonth() &&
               expDate.getUTCFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    return { category, limit, spent, percentage, isOverBudget: limit > 0 && spent > limit };
  }

  // Ricalcola il budget modificato senza ricaricare la lista (che faceva sparire la card)
  onBudgetChange(index: number): void {
    const budget = this.budgets[index];
    const limit = Number(budget.limit) || 0;
    this.budgets[index] = this.buildBudget(budget.category, limit);
    this.saveBudgets();
  }

  // Categorie selezionabili per un budget: la sua più quelle non ancora usate
  getAvailableCategories(current: string): string[] {
    const used = new Set(this.budgets.map(b => b.category));
    return this.expenseService.getCategories()
      .map(c => c.name)
      .filter(name => name === current || !used.has(name));
  }

  saveBudgets(): void {
    const budgetLimits: { [key: string]: number } = {};
    this.budgets.forEach(b => {
      budgetLimits[b.category] = Number(b.limit) || 0;
    });
    localStorage.setItem('budgets', JSON.stringify(budgetLimits));
  }

  /** Entrate reali per mese, con la stessa etichetta dei dati mensili ("Nov 2026") */
  private buildIncomeByMonth(all: Expense[]): Map<string, number> {
    const map = new Map<string, number>();
    all.filter(isRealIncome).forEach(e => {
      const d = new Date(e.date);
      const label = `${this.getMonthName(d.getUTCMonth())} ${d.getUTCFullYear()}`;
      map.set(label, (map.get(label) ?? 0) + e.amount);
    });
    return map;
  }

  updateComparisonChart(): void {
    const labels = this.monthlyData.map(m => `${m.month} ${m.year}`);
    const totals = this.monthlyData.map(m => m.total);

    this.comparisonChartData = {
      labels,
      datasets: [
        {
          label: 'Entrate',
          data: labels.map(l => this.incomeByMonth.get(l) ?? 0),
          backgroundColor: CHART_COLORS.income,
          borderRadius: 3,
          maxBarThickness: 28
        },
        {
          label: 'Uscite',
          data: totals,
          backgroundColor: CHART_COLORS.expense,
          borderRadius: 3,
          maxBarThickness: 28
        }
      ]
    };

    this.comparisonChartOptions = {
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
  }

  updateMemberTrendChart(): void {
    const members = Array.from(new Set(this.expenses.map(e => e.paidBy)));
    const labels = this.monthlyData.map(m => `${m.month} ${m.year}`);

    const datasets = members.map((member, index) => ({
      label: member,
      data: this.monthlyData.map(m => m.byMember[member] || 0),
      borderColor: CHART_PALETTE[index % CHART_PALETTE.length],
      backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false
    }));

    this.memberTrendChartData = { labels, datasets };

    this.memberTrendChartOptions = {
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
  }

  onMonthsChange(): void {
    this.calculateMonthlyData();
    this.updateComparisonChart();
    this.updateMemberTrendChart();
  }

  exportToPDF(): void {
    window.print();
  }

  getMonthName(month: number): string {
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return months[month];
  }

  categoryIcon(name: string): string | undefined {
    return this.expenseService.getCategory(name)?.icon;
  }

  categoryColor(name: string): string | undefined {
    return this.expenseService.getCategory(name)?.color;
  }

  /** Totali della tabella per membro */
  memberTotal(): number {
    return this.memberStats.reduce((s, m) => s + m.total, 0);
  }

  memberCount(): number {
    return this.memberStats.reduce((s, m) => s + m.count, 0);
  }

  /** Totali della tabella mensile */
  monthlyGrandTotal(): number {
    return this.monthlyData.reduce((s, m) => s + m.total, 0);
  }

  monthlyCount(): number {
    return this.monthlyData.reduce((s, m) => s + m.count, 0);
  }

  formatCurrency(amount: number): string {
    return formatEuro(amount);
  }

  getBudgetColor(budget: Budget): string {
    if (budget.percentage >= 100) return 'var(--neg)';
    if (budget.percentage >= 80) return 'var(--warn)';
    return 'var(--pos)';
  }

  addBudget(): void {
    const categories = this.expenseService.getCategories();
    const existingCategories = this.budgets.map(b => b.category);
    const availableCategories = categories.filter(c => !existingCategories.includes(c.name));

    if (availableCategories.length > 0) {
      this.budgets.push(this.buildBudget(availableCategories[0].name, 0));
      this.saveBudgets();
    }
  }

  removeBudget(index: number): void {
    this.budgets.splice(index, 1);
    this.saveBudgets();
  }
}
