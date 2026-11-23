import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Expense, ExpenseSummary, FamilyMember, Category, ExportData, MovementType,
  isRealExpense, isRealIncome, isCardTopUp
} from '../models/expense.model';
import { DEFAULT_CARD_OWNERS, DEFAULT_CATEGORIES, DEFAULT_MEMBERS } from './default-data';
import { BankParseResult, reclassify, repairBankSpacing } from './bank-import';
import { resolveCategoryIcon } from '../icons/category-icons';

type StringMap = { [key: string]: string };

export interface BankImportOutcome {
  added: number;
  alreadyPresent: number;
  replacedPending: number;
  toReview: number;
  transfers: number;
}

const KEYS = {
  expenses: 'familyExpenses',
  members: 'familyMembers',
  categories: 'expenseCategories',
  budgets: 'budgets',
  rules: 'categoryRules',
  cardOwners: 'cardOwners',
  spacingFixed: 'bankSpacingFixed'
};

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private expenses: Expense[] = [];
  private expensesSubject = new BehaviorSubject<Expense[]>([]);
  public expenses$ = this.expensesSubject.asObservable();

  private familyMembers: FamilyMember[] = DEFAULT_MEMBERS.map(m => ({ ...m }));
  private categories: Category[] = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  private categoryRules: StringMap = {};
  private cardOwners: StringMap = {};

  constructor() {
    this.loadExpenses();
    this.loadFamilyMembers();
    this.loadCategories();
    this.categoryRules = this.readJson(KEYS.rules, {});
    this.cardOwners = this.readJson(KEYS.cardOwners, {});
    this.applyDefaultCardOwners();
    this.repairSpacingOnce();
  }

  /** Una volta sola: ripara le parole spezzate dalla banca nei movimenti già importati ("PIZZ ERIA") */
  private repairSpacingOnce(): void {
    if (localStorage.getItem(KEYS.spacingFixed) === '1') return;
    const { expenses, changed, renamedKeys } = repairBankSpacing(this.expenses);
    if (changed > 0) {
      for (const [oldKey, newKey] of renamedKeys) {
        if (this.categoryRules[oldKey] && !this.categoryRules[newKey]) this.categoryRules[newKey] = this.categoryRules[oldKey];
      }
      localStorage.setItem(KEYS.rules, JSON.stringify(this.categoryRules));
      this.expenses = expenses;
      this.saveExpenses();
      console.info(`Riparati gli spazi in ${changed} movimenti della banca`);
    }
    localStorage.setItem(KEYS.spacingFixed, '1');
  }

  /** Assegna le carte di default (es. …2581 a Rita) se l'utente non le ha ancora assegnate */
  private applyDefaultCardOwners(): void {
    for (const [card, member] of Object.entries(DEFAULT_CARD_OWNERS)) {
      if (!this.cardOwners[card] && this.familyMembers.some(m => m.name === member)) {
        this.setCardOwner(card, member);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Persistenza
  // -------------------------------------------------------------------------

  private readJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private loadExpenses(): void {
    const parsed: Expense[] = this.readJson<any[]>(KEYS.expenses, []).map(exp => ({
      ...exp,
      date: new Date(exp.date)
    }));

    // Rimuove i doppioni con lo stesso id creati da import ripetuti in passato
    const seen = new Set<string>();
    this.expenses = parsed.filter(exp => {
      if (seen.has(exp.id)) return false;
      seen.add(exp.id);
      return true;
    });

    // Le ricariche della prepagata sono sempre trasferimenti (anche se segnate diversamente in passato)
    let fixedTopUps = 0;
    this.expenses = this.expenses.map(exp => {
      if (isCardTopUp(exp) && !exp.isTransfer) { fixedTopUps++; return { ...exp, isTransfer: true }; }
      return exp;
    });

    if (this.expenses.length !== parsed.length || fixedTopUps > 0) {
      console.info(`Rimosse ${parsed.length - this.expenses.length} spese duplicate, ${fixedTopUps} ricariche escluse dai totali`);
      this.saveExpenses();
    }
    this.expensesSubject.next(this.expenses);
  }

  private loadFamilyMembers(): void {
    const saved = this.readJson<FamilyMember[] | null>(KEYS.members, null);
    if (saved) {
      this.familyMembers = saved;
    } else {
      this.saveFamilyMembers();
    }
  }

  private loadCategories(): void {
    const saved = this.readJson<Category[] | null>(KEYS.categories, null);
    if (saved) {
      // Migrazione: tipo mancante e nuove categorie di default
      this.categories = saved.map(c => ({
        ...c,
        type: c.type ?? DEFAULT_CATEGORIES.find(d => d.name === c.name)?.type ?? 'uscita'
      }));
      const names = new Set(this.categories.map(c => c.name));
      const ids = new Set(this.categories.map(c => c.id));
      for (const def of DEFAULT_CATEGORIES) {
        if (!names.has(def.name)) {
          this.categories.push({ ...def, id: ids.has(def.id) ? this.generateId() : def.id });
        }
      }
    }
    // Icone: le vecchie emoji diventano icone a linea (chiavi Lucide)
    this.categories = this.categories.map(c => ({ ...c, icon: resolveCategoryIcon(c.icon, c.name) }));
    this.saveCategories();
  }

  private saveExpenses(): void {
    localStorage.setItem(KEYS.expenses, JSON.stringify(this.expenses));
    this.expensesSubject.next(this.expenses);
  }

  private saveFamilyMembers(): void {
    localStorage.setItem(KEYS.members, JSON.stringify(this.familyMembers));
  }

  private saveCategories(): void {
    localStorage.setItem(KEYS.categories, JSON.stringify(this.categories));
  }

  // -------------------------------------------------------------------------
  // Movimenti
  // -------------------------------------------------------------------------

  getExpenses(): Observable<Expense[]> {
    return this.expenses$;
  }

  getExpenseById(id: string): Expense | undefined {
    return this.expenses.find(exp => exp.id === id);
  }

  addExpense(expense: Omit<Expense, 'id'>): void {
    const newExpense: Expense = {
      source: 'manuale',
      ...expense,
      id: this.generateId()
    };
    this.expenses.unshift(newExpense);
    this.saveExpenses();
  }

  updateExpense(id: string, expense: Partial<Expense>): void {
    const index = this.expenses.findIndex(exp => exp.id === id);
    if (index !== -1) {
      const current = this.expenses[index];
      const reviewed = expense.category !== undefined && expense.category !== current.category;
      const updated: Expense = { ...current, ...expense, ...(reviewed ? { needsReview: false } : {}), updatedAt: new Date().toISOString() };
      // Le ricariche della prepagata restano sempre fuori dai totali
      if (isCardTopUp(updated)) updated.isTransfer = true;
      this.expenses[index] = updated;
      this.saveExpenses();
    }
  }

  deleteExpense(id: string): void {
    this.expenses = this.expenses.filter(exp => exp.id !== id);
    this.saveExpenses();
  }

  /**
   * Cambia la categoria di un movimento. Con `applyToMerchant` la scelta diventa una regola:
   * vale per tutti i movimenti dello stesso esercente (già presenti e futuri import).
   * Restituisce quanti movimenti sono stati aggiornati.
   */
  setCategory(id: string, category: string, applyToMerchant: boolean): number {
    const target = this.getExpenseById(id);
    if (!target) return 0;

    if (!applyToMerchant || !target.merchant) {
      this.updateExpense(id, { category });
      return 1;
    }

    this.categoryRules[target.merchant] = category;
    localStorage.setItem(KEYS.rules, JSON.stringify(this.categoryRules));

    let count = 0;
    const type = target.type ?? 'uscita';
    const now = new Date().toISOString();
    this.expenses = this.expenses.map(e => {
      if (e.merchant === target.merchant && (e.type ?? 'uscita') === type && !e.isTransfer) {
        count++;
        return { ...e, category, needsReview: false, updatedAt: now };
      }
      return e;
    });
    this.saveExpenses();
    return count;
  }

  /** Segna o toglie un movimento come trasferimento interno (escluso dai totali) */
  setTransfer(id: string, isTransfer: boolean): void {
    this.updateExpense(id, { isTransfer });
  }

  getSummary(): ExpenseSummary {
    const real = this.expenses.filter(isRealExpense);
    const income = this.expenses.filter(isRealIncome);
    const totalExpenses = real.reduce((sum, exp) => sum + exp.amount, 0);
    const totalIncome = income.reduce((sum, exp) => sum + exp.amount, 0);

    const expensesByCategory: { [key: string]: number } = {};
    this.categories.filter(c => (c.type ?? 'uscita') === 'uscita').forEach(cat => {
      expensesByCategory[cat.name] = 0;
    });

    const expensesByMember: { [key: string]: number } = {};
    real.forEach(exp => {
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amount;
      expensesByMember[exp.paidBy] = (expensesByMember[exp.paidBy] || 0) + exp.amount;
    });

    const months = this.countMonths();
    return {
      totalExpenses,
      totalIncome,
      expensesByCategory,
      expensesByMember,
      monthlyAverage: months ? totalExpenses / months : 0,
      monthlyIncomeAverage: months ? totalIncome / months : 0
    };
  }

  private countMonths(): number {
    if (this.expenses.length === 0) return 0;
    const dates = this.expenses.map(exp => exp.date.getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const months = (maxDate.getFullYear() - minDate.getFullYear()) * 12
                   + (maxDate.getMonth() - minDate.getMonth()) + 1;
    return Math.max(months, 1);
  }

  getExpensesByDateRange(startDate: Date, endDate: Date): Expense[] {
    return this.expenses.filter(exp => exp.date >= startDate && exp.date <= endDate);
  }

  getExpensesByCategory(categoryName: string): Expense[] {
    return this.expenses.filter(exp => exp.category === categoryName);
  }

  /** Carte/conti presenti nei movimenti della banca */
  getCards(): { card: string; count: number }[] {
    const counts = new Map<string, number>();
    this.expenses.forEach(e => {
      if (e.card) counts.set(e.card, (counts.get(e.card) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([card, count]) => ({ card, count }))
      .sort((a, b) => b.count - a.count);
  }

  // -------------------------------------------------------------------------
  // Import dalla banca
  // -------------------------------------------------------------------------

  getCategoryRules(): StringMap {
    return { ...this.categoryRules };
  }

  getCardOwners(): StringMap {
    return { ...this.cardOwners };
  }

  /** Assegna una carta a un membro e aggiorna i movimenti già importati */
  setCardOwner(card: string, memberName: string): number {
    this.cardOwners[card] = memberName;
    localStorage.setItem(KEYS.cardOwners, JSON.stringify(this.cardOwners));
    let count = 0;
    this.expenses = this.expenses.map(e => {
      if (e.source === 'banca' && e.card === card && e.paidBy !== memberName) {
        count++;
        return { ...e, paidBy: memberName };
      }
      return e;
    });
    if (count) this.saveExpenses();
    return count;
  }

  importBankMovements(result: BankParseResult): BankImportOutcome {
    // I movimenti "Autorizzato" sono provvisori: nel periodo coperto dal nuovo file vale il file
    let replacedPending = 0;
    if (result.from && result.to) {
      const from = result.from.getTime() - 7 * 86400000;
      const to = result.to.getTime() + 86400000;
      const before = this.expenses.length;
      this.expenses = this.expenses.filter(e => !(
        e.source === 'banca' && e.bankStatus === 'Autorizzato' &&
        e.date.getTime() >= from && e.date.getTime() <= to
      ));
      replacedPending = before - this.expenses.length;
    }

    const existing = new Set(this.expenses.map(e => e.id));
    const fresh = result.movements.filter(m => !existing.has(m.id));
    this.expenses = [...fresh, ...this.expenses].sort((a, b) => b.date.getTime() - a.date.getTime());
    this.saveExpenses();

    return {
      added: fresh.length,
      alreadyPresent: result.movements.length - fresh.length,
      replacedPending,
      toReview: fresh.filter(m => m.needsReview).length,
      transfers: fresh.filter(m => m.isTransfer).length
    };
  }

  /** Riapplica le regole a tutti i movimenti della banca non corretti a mano */
  reapplyRules(): number {
    let count = 0;
    this.expenses = this.expenses.map(e => {
      if (e.source !== 'banca' || e.needsReview === false) return e;
      const c = reclassify(e, this.categoryRules);
      if (!c || (c.category === e.category && !!c.isTransfer === !!e.isTransfer)) return e;
      count++;
      return { ...e, category: c.category, isTransfer: c.isTransfer || undefined, needsReview: c.needsReview || undefined };
    });
    if (count) this.saveExpenses();
    return count;
  }

  // -------------------------------------------------------------------------
  // Membri
  // -------------------------------------------------------------------------

  getFamilyMembers(): FamilyMember[] {
    return this.familyMembers;
  }

  addFamilyMember(member: Omit<FamilyMember, 'id'>): void {
    this.familyMembers.push({ ...member, id: this.generateId() });
    this.saveFamilyMembers();
  }

  updateFamilyMember(id: string, member: Partial<FamilyMember>): void {
    const index = this.familyMembers.findIndex(m => m.id === id);
    if (index !== -1) {
      const oldName = this.familyMembers[index].name;
      const newName = member.name;

      this.familyMembers[index] = { ...this.familyMembers[index], ...member };
      this.saveFamilyMembers();

      if (newName && oldName !== newName) {
        this.expenses.forEach(exp => {
          if (exp.paidBy === oldName) exp.paidBy = newName;
        });
        this.saveExpenses();
        Object.keys(this.cardOwners).forEach(card => {
          if (this.cardOwners[card] === oldName) this.cardOwners[card] = newName;
        });
        localStorage.setItem(KEYS.cardOwners, JSON.stringify(this.cardOwners));
      }
    }
  }

  deleteFamilyMember(id: string): boolean {
    const name = this.familyMembers.find(m => m.id === id)?.name;
    if (this.expenses.some(exp => exp.paidBy === name)) {
      return false;
    }
    this.familyMembers = this.familyMembers.filter(m => m.id !== id);
    this.saveFamilyMembers();
    return true;
  }

  // -------------------------------------------------------------------------
  // Categorie
  // -------------------------------------------------------------------------

  getCategories(type?: MovementType): Category[] {
    // Sempre in ordine alfabetico (tendine, filtri, impostazioni)
    const list = type ? this.categories.filter(c => (c.type ?? 'uscita') === type) : [...this.categories];
    return list.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }

  getCategory(name: string): Category | undefined {
    return this.categories.find(c => c.name === name);
  }

  addCategory(category: Omit<Category, 'id'>): void {
    this.categories.push({ type: 'uscita', ...category, id: this.generateId() });
    this.saveCategories();
  }

  updateCategory(id: string, category: Partial<Category>): void {
    const index = this.categories.findIndex(c => c.id === id);
    if (index !== -1) {
      const oldName = this.categories[index].name;
      const newName = category.name;

      this.categories[index] = { ...this.categories[index], ...category };
      this.saveCategories();

      if (newName && oldName !== newName) {
        this.expenses.forEach(exp => {
          if (exp.category === oldName) exp.category = newName;
        });
        this.saveExpenses();
        Object.keys(this.categoryRules).forEach(k => {
          if (this.categoryRules[k] === oldName) this.categoryRules[k] = newName;
        });
        localStorage.setItem(KEYS.rules, JSON.stringify(this.categoryRules));
      }
    }
  }

  deleteCategory(id: string): boolean {
    const name = this.categories.find(c => c.id === id)?.name;
    if (this.expenses.some(exp => exp.category === name)) {
      return false;
    }
    this.categories = this.categories.filter(c => c.id !== id);
    this.saveCategories();
    return true;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // -------------------------------------------------------------------------
  // Reset, archivio, export/import JSON
  // -------------------------------------------------------------------------

  resetAllData(): void {
    this.expenses = [];
    localStorage.removeItem(KEYS.expenses);
    this.expensesSubject.next(this.expenses);

    this.familyMembers = DEFAULT_MEMBERS.map(m => ({ ...m }));
    this.saveFamilyMembers();

    this.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
    this.saveCategories();
  }

  /**
   * Restituisce l'export completo e poi cancella tutti i movimenti.
   * Membri, categorie, regole, carte e budget restano.
   */
  archiveAndClearExpenses(): ExportData {
    const archive = this.exportAllData();
    this.expenses = [];
    this.saveExpenses();
    return archive;
  }

  exportAllData(): ExportData {
    return {
      expenses: this.expenses,
      categories: this.categories,
      members: this.familyMembers,
      exportDate: new Date().toISOString(),
      version: '3.0',
      budgets: this.readJson(KEYS.budgets, {}),
      categoryRules: this.categoryRules,
      cardOwners: this.cardOwners
    };
  }

  importAllData(data: any): { success: boolean; message: string; counts: { expenses: number; categories: number; members: number } } {
    try {
      const counts = { expenses: 0, categories: 0, members: 0 };

      if (data && !Array.isArray(data) && (data.version === '2.0' || data.version === '3.0')) {
        if (Array.isArray(data.categories)) {
          data.categories.forEach((cat: any) => {
            const existing = cat.name ? this.categories.find(c => c.name === cat.name) : undefined;
            if (existing) {
              // Stessa categoria: prende icona e colore del file
              if ((cat.icon && cat.icon !== existing.icon) || (cat.color && cat.color !== existing.color)) {
                this.updateCategory(existing.id, { icon: cat.icon || existing.icon, color: cat.color || existing.color });
              }
            } else if (cat.name) {
              this.addCategory({
                name: cat.name,
                icon: cat.icon || '📦',
                color: cat.color || '#607D8B',
                type: cat.type === 'entrata' ? 'entrata' : 'uscita'
              });
              counts.categories++;
            }
          });
        }

        if (Array.isArray(data.members)) {
          data.members.forEach((member: any) => {
            if (member.name && !this.familyMembers.find(m => m.name === member.name)) {
              this.addFamilyMember({ name: member.name, color: member.color || '#FF6B6B' });
              counts.members++;
            }
          });
        }

        // Regole e carte: vince il file importato (è il lavoro fatto sull'altro browser)
        if (data.categoryRules && typeof data.categoryRules === 'object') {
          this.categoryRules = { ...this.categoryRules, ...data.categoryRules };
          localStorage.setItem(KEYS.rules, JSON.stringify(this.categoryRules));
        }
        if (data.cardOwners && typeof data.cardOwners === 'object') {
          this.cardOwners = { ...this.cardOwners, ...data.cardOwners };
          localStorage.setItem(KEYS.cardOwners, JSON.stringify(this.cardOwners));
        }

        let duplicatesMsg = '';
        if (Array.isArray(data.expenses)) {
          const result = this.importExpenses(data.expenses);
          counts.expenses = result.count;
          duplicatesMsg = result.message;
        }

        return {
          success: true,
          message: `Importazione completata!\n\nMovimenti: ${counts.expenses}\nCategorie: ${counts.categories}\nMembri: ${counts.members}` +
            (duplicatesMsg ? `\n\n${duplicatesMsg}` : ''),
          counts
        };
      }

      // Vecchio formato (solo spese)
      const result = this.importExpenses(Array.isArray(data) ? data : data?.expenses || []);
      counts.expenses = result.count;
      return { success: result.success, message: result.message, counts };
    } catch (error) {
      return {
        success: false,
        message: 'Errore durante l\'importazione: file non valido',
        counts: { expenses: 0, categories: 0, members: 0 }
      };
    }
  }

  private importExpenses(expenses: any[]): { success: boolean; message: string; count: number } {
    if (!Array.isArray(expenses)) {
      return { success: false, message: 'Il file deve contenere un array di spese', count: 0 };
    }

    const validExpenses: Expense[] = [];
    const errors: string[] = [];
    // Id già presenti: non si duplicano, ma si aggiornano con le modifiche del file (categoria, note, ecc.)
    const byId = new Map(this.expenses.map((e, i) => [e.id, i] as const));
    const seenInFile = new Set<string>();
    let duplicates = 0;
    let updated = 0;

    expenses.forEach((exp, index) => {
      if (!exp || !exp.description || !exp.amount || !exp.category || !exp.date || !exp.paidBy) {
        errors.push(`Movimento ${index + 1}: campi obbligatori mancanti`);
        return;
      }
      if (exp.id && seenInFile.has(exp.id)) return;

      const validExpense: Expense = {
        ...exp,
        id: exp.id || this.generateId(),
        description: String(exp.description),
        amount: Math.abs(Number(exp.amount)),
        category: String(exp.category),
        date: new Date(exp.date),
        paidBy: String(exp.paidBy),
        notes: exp.notes || '',
        type: exp.type === 'entrata' ? 'entrata' : 'uscita'
      };

      if (isNaN(validExpense.date.getTime()) || isNaN(validExpense.amount)) {
        errors.push(`Movimento ${index + 1}: data o importo non validi`);
        return;
      }

      seenInFile.add(validExpense.id);

      const pos = byId.get(validExpense.id);
      if (pos !== undefined) {
        const current = this.expenses[pos];
        if (this.importWins(validExpense, current)) {
          const merged: Expense = { ...current, ...validExpense };
          if (isCardTopUp(merged)) merged.isTransfer = true;
          this.expenses[pos] = merged;
          updated++;
        } else {
          duplicates++;
        }
        return;
      }
      validExpenses.push(validExpense);
    });

    if (validExpenses.length === 0 && updated === 0) {
      if (duplicates > 0 && errors.length === 0) {
        return { success: true, message: `Nessuna novità: i ${duplicates} movimenti del file sono già presenti, uguali o modificati più di recente qui.`, count: 0 };
      }
      return { success: false, message: 'Nessun movimento valido trovato nel file.\n' + errors.join('\n'), count: 0 };
    }

    this.expenses = [...validExpenses, ...this.expenses];
    this.saveExpenses();

    let message = `${validExpenses.length} movimenti nuovi importati.`;
    if (updated > 0) message += `\n${updated} movimenti già presenti aggiornati (categoria, note, revisione…).`;
    if (duplicates > 0) message += `\n${duplicates} movimenti già uguali o più recenti qui: lasciati come sono.`;
    if (errors.length > 0) message += `\n\n${errors.length} movimenti ignorati per errori di validazione.`;
    return { success: true, message, count: validExpenses.length + updated };
  }

  /** Campi che l'utente può cambiare: se coincidono il movimento è già aggiornato */
  private static readonly EDITABLE: (keyof Expense)[] =
    ['description', 'amount', 'category', 'paidBy', 'notes', 'type', 'isTransfer', 'needsReview'];

  /**
   * La versione del file sostituisce quella presente se è diversa e non più vecchia.
   * Con le date di modifica vince la più recente; senza (export fatti prima di questa versione)
   * vince il file, perché importarlo è una scelta esplicita.
   */
  private importWins(fromFile: Expense, current: Expense): boolean {
    const differs = ExpenseService.EDITABLE.some(k => (fromFile[k] ?? '') !== (current[k] ?? '')) ||
      new Date(fromFile.date).getTime() !== new Date(current.date).getTime();
    if (!differs) return false;
    if (fromFile.updatedAt && current.updatedAt) return fromFile.updatedAt >= current.updatedAt;
    if (current.updatedAt && !fromFile.updatedAt) return false;
    return true;
  }
}
