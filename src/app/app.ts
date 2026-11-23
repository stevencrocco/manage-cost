import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';
import { ExpenseDetailComponent } from './components/expense-detail/expense-detail.component';
import { ThemeService } from './services/theme.service';
import { CommonModule } from '@angular/common';
import { applyChartTheme } from './charts/chart-theme';
import { LucideAngularModule } from 'lucide-angular';
import { UI_ICONS } from './icons/ui-icons';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, ExpenseDetailComponent, CommonModule, LucideAngularModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('Gestione Spese Familiari');
  readonly I = UI_ICONS;
  isDarkMode = false;

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeService.darkMode$.subscribe(isDark => {
      this.isDarkMode = isDark;
      applyChartTheme(isDark);
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
