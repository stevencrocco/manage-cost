import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';
import { UI_ICONS } from '../../icons/ui-icons';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of toasts$ | async"
           class="toast"
           [class.success]="toast.type === 'success'"
           [class.error]="toast.type === 'error'"
           [class.info]="toast.type === 'info'"
           [class.warning]="toast.type === 'warning'">
        <lucide-icon class="toast-icon" [img]="getIcon(toast.type)" [size]="18" />
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" (click)="close(toast.id)" aria-label="Chiudi"><lucide-icon [img]="closeIcon" [size]="14" /></button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 72px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 380px;
      max-width: calc(100vw - 32px);
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 12px 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--text-3);
      border-radius: var(--radius);
      box-shadow: var(--shadow-md);
      animation: toastIn 0.2s ease-out;
    }
    @keyframes toastIn {
      from { transform: translateY(-6px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .toast.success { border-left-color: var(--pos); }
    .toast.error { border-left-color: var(--neg); }
    .toast.info { border-left-color: var(--primary); }
    .toast.warning { border-left-color: var(--warn); }
    .toast-icon { flex-shrink: 0; display: inline-flex; margin-top: 1px; color: var(--text-3); }
    .toast.success .toast-icon { color: var(--pos); }
    .toast.error .toast-icon { color: var(--neg); }
    .toast.info .toast-icon { color: var(--primary); }
    .toast.warning .toast-icon { color: var(--warn); }
    .toast-message { flex: 1; color: var(--text); font-size: 13.5px; line-height: 1.45; }
    .toast-close {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      color: var(--text-3);
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .toast-close:hover { background: var(--surface-hover); color: var(--text); }
    @media (max-width: 768px) {
      .toast-container { right: 16px; left: 16px; width: auto; }
    }
  `]
})
export class ToastComponent {
  toasts$;

  constructor(private toastService: ToastService) {
    this.toasts$ = this.toastService.toasts$;
  }

  readonly closeIcon = UI_ICONS.close;

  getIcon(type: Toast['type']): LucideIconData {
    switch (type) {
      case 'success': return UI_ICONS.success;
      case 'error': return UI_ICONS.error;
      case 'warning': return UI_ICONS.warning;
      default: return UI_ICONS.info;
    }
  }

  close(id: number): void {
    this.toastService.remove(id);
  }
}
