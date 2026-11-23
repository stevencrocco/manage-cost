import { Category, FamilyMember } from '../models/expense.model';

export const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: '1', name: 'Steven Crocco', color: '#FF6B6B' },
  { id: '2', name: 'Rita Lucanto', color: '#4ECDC4' },
  { id: '3', name: 'Nicole Crocco', color: '#FFE66D' },
  { id: '4', name: 'Riccardo Crocco', color: '#95E1D3' }
];

/** Categorie di default. Gli id sono stabili: servono a riconoscere quelle mancanti. */
export const DEFAULT_CATEGORIES: Category[] = [
  // Uscite
  { id: '1', name: 'Alimentari', icon: 'shopping-cart', color: '#4CAF50', type: 'uscita' },
  { id: '10', name: 'Ristoranti', icon: 'utensils', color: '#FF7043', type: 'uscita' },
  { id: '11', name: 'Carburante', icon: 'fuel', color: '#795548', type: 'uscita' },
  { id: '2', name: 'Trasporti', icon: 'car', color: '#2196F3', type: 'uscita' },
  { id: '3', name: 'Bollette', icon: 'zap', color: '#FF9800', type: 'uscita' },
  { id: '12', name: 'Telefonia', icon: 'smartphone', color: '#3F51B5', type: 'uscita' },
  { id: '4', name: 'Casa', icon: 'house', color: '#9C27B0', type: 'uscita' },
  { id: '5', name: 'Salute', icon: 'heart-pulse', color: '#F44336', type: 'uscita' },
  { id: '13', name: 'Assicurazioni', icon: 'shield', color: '#009688', type: 'uscita' },
  { id: '14', name: 'Tasse e PA', icon: 'landmark', color: '#546E7A', type: 'uscita' },
  { id: '15', name: 'Acquisti online', icon: 'package', color: '#673AB7', type: 'uscita' },
  { id: '8', name: 'Shopping', icon: 'shopping-bag', color: '#FFC107', type: 'uscita' },
  { id: '6', name: 'Intrattenimento', icon: 'clapperboard', color: '#E91E63', type: 'uscita' },
  { id: '21', name: 'Sport', icon: 'dumbbell', color: '#26A69A', type: 'uscita' },
  { id: '22', name: 'Abbonamenti', icon: 'repeat', color: '#7E57C2', type: 'uscita' },
  { id: '23', name: 'Finanziamenti', icon: 'receipt', color: '#8E24AA', type: 'uscita' },
  { id: '7', name: 'Istruzione', icon: 'graduation-cap', color: '#00BCD4', type: 'uscita' },
  { id: '16', name: 'Regali', icon: 'gift', color: '#EC407A', type: 'uscita' },
  { id: '17', name: 'Contanti', icon: 'banknote', color: '#8D6E63', type: 'uscita' },
  { id: '18', name: 'Carta di credito', icon: 'credit-card', color: '#5C6BC0', type: 'uscita' },
  { id: '19', name: 'Spese bancarie', icon: 'building-2', color: '#78909C', type: 'uscita' },
  { id: '20', name: 'Trasferimenti', icon: 'arrow-left-right', color: '#B0BEC5', type: 'uscita' },
  { id: '9', name: 'Altro', icon: 'ellipsis', color: '#607D8B', type: 'uscita' },
  // Entrate
  { id: '30', name: 'Stipendio', icon: 'briefcase', color: '#2E7D32', type: 'entrata' },
  { id: '31', name: 'INPS e contributi', icon: 'file-text', color: '#00897B', type: 'entrata' },
  { id: '32', name: 'Rimborsi', icon: 'undo-2', color: '#43A047', type: 'entrata' },
  { id: '33', name: 'Regali ricevuti', icon: 'gift', color: '#7CB342', type: 'entrata' },
  { id: '34', name: 'Altre entrate', icon: 'wallet', color: '#9E9D24', type: 'entrata' }
];

/**
 * Proprietari di default delle carte (ultime cifre -> nome membro).
 * Valgono finché l'utente non sceglie diversamente in Impostazioni.
 */
export const DEFAULT_CARD_OWNERS: { [card: string]: string } = {
  '2581': 'Rita Lucanto'
};

export const UNCATEGORIZED_EXPENSE = 'Altro';
export const UNCATEGORIZED_INCOME = 'Altre entrate';
