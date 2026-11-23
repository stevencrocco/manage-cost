import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExpenseService } from '../../services/expense.service';
import { ToastService } from '../../services/toast.service';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { FamilyMember, Category, MovementType } from '../../models/expense.model';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './expense-form.component.html',
  styleUrls: ['./expense-form.component.css']
})
export class ExpenseFormComponent implements OnInit {
  readonly I = UI_ICONS;

  expenseId: string | null = null;
  isEditMode = false;

  expense: {
    type: MovementType;
    description: string;
    amount: number;
    category: string;
    date: string;
    paidBy: string;
    notes: string;
  } = {
    type: 'uscita',
    description: '',
    amount: 0,
    category: '',
    date: new Date().toISOString().split('T')[0],
    paidBy: '',
    notes: ''
  };

  categories: Category[] = [];
  familyMembers: FamilyMember[] = [];

  constructor(
    private expenseService: ExpenseService,
    private router: Router,
    private route: ActivatedRoute,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.categories = this.expenseService.getCategories();
    this.familyMembers = this.expenseService.getFamilyMembers();

    const first = this.getCategoriesForType()[0];
    if (first) {
      this.expense.category = first.name;
    }

    if (this.familyMembers.length > 0) {
      this.expense.paidBy = this.familyMembers[0].name;
    }

    this.route.paramMap.subscribe(params => {
      this.expenseId = params.get('id');
      if (this.expenseId) {
        this.isEditMode = true;
        this.loadExpense(this.expenseId);
      }
    });
  }

  loadExpense(id: string): void {
    const foundExpense = this.expenseService.getExpenseById(id);
    if (foundExpense) {
      this.expense = {
        type: foundExpense.type ?? 'uscita',
        description: foundExpense.description,
        amount: foundExpense.amount,
        category: foundExpense.category,
        date: new Date(foundExpense.date).toISOString().split('T')[0],
        paidBy: foundExpense.paidBy,
        notes: foundExpense.notes || ''
      };
    }
  }

  onSubmit(): void {
    if (this.validateForm()) {
      const expenseData = {
        type: this.expense.type,
        description: this.expense.description,
        amount: Number(this.expense.amount),
        category: this.expense.category,
        date: new Date(this.expense.date),
        paidBy: this.expense.paidBy,
        notes: this.expense.notes
      };

      if (this.isEditMode && this.expenseId) {
        this.expenseService.updateExpense(this.expenseId, expenseData);
        this.toastService.success('Movimento modificato');
      } else {
        this.expenseService.addExpense(expenseData);
        this.toastService.success('Movimento aggiunto');
      }

      this.router.navigate(['/expenses']);
    }
  }

  getCategoriesForType(): Category[] {
    return this.categories.filter(c => (c.type ?? 'uscita') === this.expense.type);
  }

  setType(type: MovementType): void {
    this.expense.type = type;
    // Se la categoria non è del nuovo tipo, prende la prima disponibile
    const options = this.getCategoriesForType();
    if (!options.some(c => c.name === this.expense.category)) {
      this.expense.category = options[0]?.name ?? '';
    }
  }

  validateForm(): boolean {
    if (!this.expense.description.trim()) {
      alert('Inserisci una descrizione');
      return false;
    }
    if (this.expense.amount <= 0) {
      alert('Inserisci un importo valido');
      return false;
    }
    if (!this.expense.paidBy) {
      alert('Seleziona chi ha pagato');
      return false;
    }
    return true;
  }

  cancel(): void {
    this.router.navigate(['/expenses']);
  }
}
