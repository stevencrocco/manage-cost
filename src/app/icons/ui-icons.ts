import {
  Archive, ArrowDownRight, ArrowLeftRight, ArrowUpRight, ChartColumn, ChevronRight, CircleAlert, CircleCheck, CircleX,
  Database, Download, FileSpreadsheet, Info, LayoutDashboard, List, Moon, Pencil, Plus, Printer, RefreshCw, Scale,
  Search, Settings, SlidersHorizontal, Sun, Tags, Trash2, TrendingDown, TrendingUp, TriangleAlert, Upload, Users,
  Wallet, X, FolderOpen, Save, ChevronLeft
} from 'lucide-angular';

/**
 * Icone dell'interfaccia (Lucide). Nei componenti: `readonly I = UI_ICONS;`
 * e nel template `<lucide-icon [img]="I.edit" [size]="16" />`.
 */
export const UI_ICONS = {
  dashboard: LayoutDashboard,
  movements: List,
  reports: ChartColumn,
  settings: Settings,
  add: Plus,
  moon: Moon,
  sun: Sun,
  edit: Pencil,
  delete: Trash2,
  transfer: ArrowLeftRight,
  search: Search,
  filters: SlidersHorizontal,
  warning: TriangleAlert,
  chevron: ChevronRight,
  chevronLeft: ChevronLeft,
  close: X,
  print: Printer,
  income: TrendingUp,
  expense: TrendingDown,
  balance: Scale,
  wallet: Wallet,
  incomeArrow: ArrowUpRight,
  expenseArrow: ArrowDownRight,
  archive: Archive,
  spreadsheet: FileSpreadsheet,
  refresh: RefreshCw,
  download: Download,
  upload: Upload,
  users: Users,
  tags: Tags,
  database: Database,
  success: CircleCheck,
  error: CircleX,
  info: Info,
  alert: CircleAlert,
  folder: FolderOpen,
  save: Save
};
