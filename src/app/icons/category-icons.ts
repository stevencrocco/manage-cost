import {
  ArrowLeftRight, Baby, Banknote, Bike, BookOpen, Briefcase, Building2, Bus, Car, CircleDollarSign, Clapperboard,
  Coffee, CreditCard, Droplet, Dumbbell, Ellipsis, FileText, Flame, Fuel, Gamepad2, Gift, GraduationCap, Hammer,
  Handshake, Heart, HeartPulse, House, Landmark, LucideIconData, Music, Package, PawPrint, PiggyBank, Pill, Plane,
  Receipt, Repeat, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Tag,
  Ticket, TrainFront, TrendingUp, Tv, Undo2, Utensils, Wallet, Wifi, Wrench, Zap
} from 'lucide-angular';

/**
 * Icone delle categorie (Lucide, licenza ISC).
 * Nella categoria si salva la chiave (es. "shopping-cart"); le vecchie emoji vengono convertite.
 */
export const CATEGORY_ICONS: { [key: string]: LucideIconData } = {
  'shopping-cart': ShoppingCart,
  'utensils': Utensils,
  'coffee': Coffee,
  'fuel': Fuel,
  'car': Car,
  'bus': Bus,
  'train-front': TrainFront,
  'bike': Bike,
  'plane': Plane,
  'zap': Zap,
  'flame': Flame,
  'droplet': Droplet,
  'wifi': Wifi,
  'smartphone': Smartphone,
  'house': House,
  'sofa': Sofa,
  'hammer': Hammer,
  'wrench': Wrench,
  'heart-pulse': HeartPulse,
  'stethoscope': Stethoscope,
  'pill': Pill,
  'sparkles': Sparkles,
  'scissors': Scissors,
  'shield': Shield,
  'landmark': Landmark,
  'building-2': Building2,
  'receipt': Receipt,
  'package': Package,
  'shopping-bag': ShoppingBag,
  'shirt': Shirt,
  'clapperboard': Clapperboard,
  'tv': Tv,
  'ticket': Ticket,
  'music': Music,
  'gamepad-2': Gamepad2,
  'dumbbell': Dumbbell,
  'repeat': Repeat,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  'baby': Baby,
  'paw-print': PawPrint,
  'gift': Gift,
  'heart': Heart,
  'handshake': Handshake,
  'banknote': Banknote,
  'credit-card': CreditCard,
  'wallet': Wallet,
  'piggy-bank': PiggyBank,
  'circle-dollar-sign': CircleDollarSign,
  'trending-up': TrendingUp,
  'briefcase': Briefcase,
  'file-text': FileText,
  'undo-2': Undo2,
  'arrow-left-right': ArrowLeftRight,
  'tag': Tag,
  'ellipsis': Ellipsis
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

/** Vecchie emoji -> icona */
const EMOJI_TO_ICON: { [emoji: string]: string } = {
  '🛒': 'shopping-cart', '🍕': 'utensils', '🍔': 'utensils', '☕': 'coffee', '⛽': 'fuel', '🚗': 'car',
  '✈️': 'plane', '💡': 'zap', '📱': 'smartphone', '🏠': 'house', '🔑': 'house', '🔧': 'wrench',
  '⚕️': 'heart-pulse', '💊': 'pill', '🛡️': 'shield', '🏛️': 'landmark', '🏦': 'building-2', '🧾': 'receipt',
  '💻': 'package', '📦': 'ellipsis', '🛍️': 'shopping-bag', '👕': 'shirt', '🎬': 'clapperboard', '🎮': 'gamepad-2',
  '🎵': 'music', '🎨': 'sparkles', '🌟': 'sparkles', '⚽': 'dumbbell', '🏋️': 'dumbbell', '🔄': 'repeat',
  '📚': 'book-open', '🎓': 'graduation-cap', '🎁': 'gift', '💶': 'banknote', '💳': 'credit-card',
  '🔁': 'arrow-left-right', '💼': 'briefcase', '📄': 'file-text', '↩️': 'undo-2', '💰': 'wallet'
};

/** Categorie note -> icona (vale anche per quelle create a mano, es. "Cura persona") */
const NAME_TO_ICON: { [name: string]: string } = {
  'alimentari': 'shopping-cart', 'ristoranti': 'utensils', 'carburante': 'fuel', 'trasporti': 'car',
  'bollette': 'zap', 'telefonia': 'smartphone', 'casa': 'house', 'salute': 'heart-pulse',
  'assicurazioni': 'shield', 'tasse e pa': 'landmark', 'acquisti online': 'package', 'shopping': 'shopping-bag',
  'intrattenimento': 'clapperboard', 'sport': 'dumbbell', 'abbonamenti': 'repeat', 'finanziamenti': 'receipt',
  'istruzione': 'graduation-cap', 'regali': 'gift', 'contanti': 'banknote', 'carta di credito': 'credit-card',
  'spese bancarie': 'building-2', 'trasferimenti': 'arrow-left-right', 'altro': 'ellipsis',
  'stipendio': 'briefcase', 'inps e contributi': 'file-text', 'rimborsi': 'undo-2', 'regali ricevuti': 'gift',
  'altre entrate': 'wallet', 'cura persona': 'sparkles', 'animali': 'paw-print', 'figli': 'baby',
  'viaggi': 'plane', 'abbigliamento': 'shirt', 'bar': 'coffee', 'farmacia': 'pill'
};

/** Chiave dell'icona da mostrare per una categoria */
export function resolveCategoryIcon(icon?: string, name?: string): string {
  if (icon && CATEGORY_ICONS[icon]) return icon;
  if (icon && EMOJI_TO_ICON[icon]) return EMOJI_TO_ICON[icon];
  const byName = name ? NAME_TO_ICON[name.trim().toLowerCase()] : undefined;
  return byName ?? 'tag';
}
