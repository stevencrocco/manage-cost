import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ExpenseService, BankImportOutcome } from '../../services/expense.service';
import { ToastService } from '../../services/toast.service';
import { ProjectFolderService, SaveResult } from '../../services/project-folder.service';
import { FamilyMember, Category } from '../../models/expense.model';
import { formatEuro } from '../../utils/format';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { CategoryIconComponent } from '../../icons/category-icon.component';
import { CATEGORY_ICON_KEYS, resolveCategoryIcon } from '../../icons/category-icons';
import { BankParseResult, parseBankRows, readXlsxRows } from '../../services/bank-import';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, CategoryIconComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  readonly I = UI_ICONS;

  editingMemberId: string | null = null;
  editingMemberName: string = '';
  editingMemberColor: string = '';

  showAddMemberForm: boolean = false;
  newMemberName: string = '';
  newMemberColor: string = '#FF6B6B';

  availableColors: string[] = [
    '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
    '#A8E6CF', '#FFA07A', '#87CEEB', '#DDA0DD',
    '#F0E68C', '#FFB6C1', '#98D8C8', '#FFDAB9'
  ];

  // Category management
  editingCategoryId: string | null = null;
  editingCategoryName: string = '';
  editingCategoryIcon: string = '';
  editingCategoryColor: string = '';

  showAddCategoryForm: boolean = false;
  newCategoryName: string = '';
  newCategoryIcon: string = 'tag';
  newCategoryColor: string = '#607D8B';

  /** Icone a linea disponibili per le categorie (Lucide) */
  availableIcons: string[] = CATEGORY_ICON_KEYS;

  // Import movimenti bancari
  bankPreview: BankParseResult | null = null;
  bankFileName = '';
  bankLoading = false;
  bankError = '';
  lastBankImport: BankImportOutcome | null = null;

  constructor(
    private expenseService: ExpenseService,
    private router: Router,
    private toastService: ToastService,
    readonly folder: ProjectFolderService
  ) {}

  // ---------------------------------------------------------------------------
  // Archivio e import dalla banca
  // ---------------------------------------------------------------------------

  /** Dove è finito il file, da mostrare nel messaggio */
  private savedWhere(r: SaveResult): string {
    if (r.where === 'project') return `in ${r.path.replace(/\/[^/]+$/, '')}`;
    return r.where === 'folder' ? `nella cartella "${r.folder}"` : 'nella cartella Download del browser';
  }

  async chooseExportFolder(): Promise<void> {
    if (await this.folder.chooseFolder()) {
      this.toastService.success(`Gli export verranno salvati in "${this.folder.folderName()}"`);
    }
  }

  getMovementsCount(): number {
    return this.expenseService.exportAllData().expenses.length;
  }

  async archiveAndClear(): Promise<void> {
    const count = this.getMovementsCount();
    if (count === 0) {
      this.toastService.info('Non ci sono movimenti da archiviare');
      return;
    }
    if (!confirm(`Salvo un file di storico con i ${count} movimenti attuali e poi li cancello dall'app.

Membri, categorie, regole e budget restano.

Procedo?`)) {
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    // Prima il salvataggio, poi la cancellazione
    const saved = await this.folder.saveJson(this.expenseService.exportAllData(), `storico-spese-${today}.json`);
    this.expenseService.archiveAndClearExpenses();
    this.refreshCards();
    this.toastService.success(`Archiviati ${count} movimenti in ${saved.fileName}, ${this.savedWhere(saved)}`, 6000);
    this.folder.checkServer();
  }

  triggerBankInput(): void {
    (document.getElementById('bank-input') as HTMLInputElement | null)?.click();
  }

  async onBankFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.bankError = '';
    this.bankPreview = null;
    this.lastBankImport = null;
    if (!/\.xlsx$/i.test(file.name)) {
      this.bankError = 'Seleziona il file .xlsx esportato dalla banca (Movimenti).';
      return;
    }

    this.bankLoading = true;
    try {
      const rows = await readXlsxRows(await file.arrayBuffer());
      const members = this.expenseService.getFamilyMembers();
      this.bankPreview = parseBankRows(rows, {
        customRules: this.expenseService.getCategoryRules(),
        cardOwners: this.expenseService.getCardOwners(),
        defaultMember: members[0]?.name ?? 'Famiglia'
      });
      this.bankFileName = file.name;
      this.stats = this.computePreviewStats();
    } catch (e) {
      this.bankError = e instanceof Error ? e.message : 'Impossibile leggere il file';
    } finally {
      this.bankLoading = false;
    }
  }

  stats: ReturnType<SettingsComponent['computePreviewStats']> | null = null;

  private computePreviewStats() {
    const m = this.bankPreview?.movements ?? [];
    const sum = (xs: typeof m) => xs.reduce((s, x) => s + x.amount, 0);
    const expenses = m.filter(x => x.type === 'uscita' && !x.isTransfer);
    const transfers = m.filter(x => x.isTransfer);
    const income = m.filter(x => x.type === 'entrata');
    return {
      total: m.length,
      expenses: expenses.length, expensesSum: sum(expenses),
      income: income.length, incomeSum: sum(income),
      transfers: transfers.length, transfersSum: sum(transfers),
      toReview: m.filter(x => x.needsReview).length,
      pending: m.filter(x => x.bankStatus === 'Autorizzato').length
    };
  }

  confirmBankImport(): void {
    if (!this.bankPreview) return;
    this.lastBankImport = this.expenseService.importBankMovements(this.bankPreview);
    this.bankPreview = null;
    this.refreshCards();
    const r = this.lastBankImport;
    this.toastService.success(`Importati ${r.added} movimenti` + (r.alreadyPresent ? ` (${r.alreadyPresent} già presenti)` : ''), 6000);
  }

  cancelBankImport(): void {
    this.bankPreview = null;
  }

  /** Elenco carte in cache: ricrearlo a ogni change detection fa ripartire i select all'infinito */
  cards: { card: string; count: number }[] = [];

  ngOnInit(): void {
    this.refreshCards();
  }

  private refreshCards(): void {
    this.cards = this.expenseService.getCards();
  }

  trackCard(_: number, c: { card: string }): string {
    return c.card;
  }

  getCardLabel(card: string): string {
    if (card === 'Conto') return 'Operazioni sul conto (bonifici, addebiti, prelievi…)';
    if (card === '2581') return 'Carta ricaricabile …2581';
    return card.length === 3 ? `Bancomat …${card}` : `Carta …${card}`;
  }

  getCardOwner(card: string): string {
    return this.expenseService.getCardOwners()[card] ?? this.expenseService.getFamilyMembers()[0]?.name ?? '';
  }

  setCardOwner(card: string, member: string): void {
    const n = this.expenseService.setCardOwner(card, member);
    this.toastService.success(`${this.getCardLabel(card)} → ${member}` + (n ? ` (${n} movimenti aggiornati)` : ''));
  }

  getRulesCount(): number {
    return Object.keys(this.expenseService.getCategoryRules()).length;
  }

  reapplyRules(): void {
    const n = this.expenseService.reapplyRules();
    this.toastService.info(n ? `Ricategorizzati ${n} movimenti` : 'Nessun movimento da aggiornare');
  }

  formatCurrency(amount: number): string {
    return formatEuro(amount);
  }

  formatDate(date: Date | null): string {
    return date ? date.toLocaleDateString('it-IT', { timeZone: 'UTC' }) : '-';
  }

  resetAllData(): void {
    const confirmMessage = 'Sei sicuro di voler cancellare TUTTI i dati? Questa operazione è irreversibile!';

    if (confirm(confirmMessage)) {
      const doubleConfirm = 'ATTENZIONE: Stai per eliminare tutte le spese. Confermi?';

      if (confirm(doubleConfirm)) {
        this.expenseService.resetAllData();
        alert('Tutti i dati sono stati cancellati con successo!');
        this.router.navigate(['/dashboard']);
      }
    }
  }

  async exportData(): Promise<void> {
    const fileName = `spese-familiari-${new Date().toISOString().split('T')[0]}.json`;
    const saved = await this.folder.saveJson(this.expenseService.exportAllData(), fileName);
    this.toastService.success(`Dati esportati in ${saved.fileName}, ${this.savedWhere(saved)}`, 6000);
  }

  getFamilyMembers(): any[] {
    return this.expenseService.getFamilyMembers();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    // Verifica che sia un file JSON
    if (!file.name.endsWith('.json')) {
      alert('Per favore seleziona un file JSON valido');
      return;
    }

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        const result = this.expenseService.importAllData(data);

        if (result.success) {
          alert(result.message);
          this.router.navigate(['/dashboard']);
        } else {
          alert('Errore durante l\'importazione:\n\n' + result.message);
        }
      } catch (error) {
        alert('Errore: il file non è un JSON valido');
      }

      // Reset input per permettere di selezionare lo stesso file di nuovo
      input.value = '';
    };

    reader.onerror = () => {
      alert('Errore durante la lettura del file');
      input.value = '';
    };

    reader.readAsText(file);
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    fileInput?.click();
  }

  // Gestione membri famiglia
  startEditMember(member: FamilyMember): void {
    this.editingMemberId = member.id;
    this.editingMemberName = member.name;
    this.editingMemberColor = member.color;
  }

  saveEditMember(): void {
    if (this.editingMemberId && this.editingMemberName.trim()) {
      this.expenseService.updateFamilyMember(this.editingMemberId, {
        name: this.editingMemberName.trim(),
        color: this.editingMemberColor
      });
      this.cancelEditMember();
    }
  }

  cancelEditMember(): void {
    this.editingMemberId = null;
    this.editingMemberName = '';
    this.editingMemberColor = '';
  }

  deleteMember(member: FamilyMember): void {
    const confirmMessage = `Sei sicuro di voler eliminare ${member.name}?`;

    if (confirm(confirmMessage)) {
      const success = this.expenseService.deleteFamilyMember(member.id);

      if (!success) {
        alert(`Impossibile eliminare ${member.name} perché ha delle spese associate.`);
      }
    }
  }

  toggleAddMemberForm(): void {
    this.showAddMemberForm = !this.showAddMemberForm;
    if (!this.showAddMemberForm) {
      this.newMemberName = '';
      this.newMemberColor = '#FF6B6B';
    }
  }

  addNewMember(): void {
    if (this.newMemberName.trim()) {
      this.expenseService.addFamilyMember({
        name: this.newMemberName.trim(),
        color: this.newMemberColor
      });
      this.toggleAddMemberForm();
      alert(`${this.newMemberName} è stato aggiunto con successo!`);
    }
  }

  isEditing(memberId: string): boolean {
    return this.editingMemberId === memberId;
  }

  // Gestione categorie
  getCategories(): Category[] {
    return this.expenseService.getCategories();
  }

  newCategoryType: 'uscita' | 'entrata' = 'uscita';

  startEditCategory(category: Category): void {
    this.editingCategoryId = category.id;
    this.editingCategoryName = category.name;
    this.editingCategoryIcon = resolveCategoryIcon(category.icon, category.name);
    this.editingCategoryColor = category.color;
  }

  saveEditCategory(): void {
    if (this.editingCategoryId && this.editingCategoryName.trim()) {
      this.expenseService.updateCategory(this.editingCategoryId, {
        name: this.editingCategoryName.trim(),
        icon: this.editingCategoryIcon,
        color: this.editingCategoryColor
      });
      this.cancelEditCategory();
    }
  }

  cancelEditCategory(): void {
    this.editingCategoryId = null;
    this.editingCategoryName = '';
    this.editingCategoryIcon = '';
    this.editingCategoryColor = '';
  }

  deleteCategory(category: Category): void {
    const confirmMessage = `Sei sicuro di voler eliminare la categoria "${category.name}"?`;

    if (confirm(confirmMessage)) {
      const success = this.expenseService.deleteCategory(category.id);

      if (!success) {
        alert(`Impossibile eliminare "${category.name}" perché ci sono spese associate a questa categoria.`);
      }
    }
  }

  toggleAddCategoryForm(): void {
    this.showAddCategoryForm = !this.showAddCategoryForm;
    if (!this.showAddCategoryForm) {
      this.newCategoryName = '';
      this.newCategoryIcon = 'tag';
      this.newCategoryColor = '#607D8B';
    }
  }

  addNewCategory(): void {
    if (this.newCategoryName.trim()) {
      this.expenseService.addCategory({
        name: this.newCategoryName.trim(),
        icon: this.newCategoryIcon,
        color: this.newCategoryColor,
        type: this.newCategoryType
      });
      this.toggleAddCategoryForm();
      alert(`La categoria "${this.newCategoryName}" è stata aggiunta con successo!`);
    }
  }

  isEditingCategory(categoryId: string): boolean {
    return this.editingCategoryId === categoryId;
  }
}
