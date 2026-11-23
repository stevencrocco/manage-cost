import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';
import { CATEGORY_ICONS, resolveCategoryIcon } from './category-icons';

/**
 * Icona di una categoria: simbolo a linea nel colore della categoria, su un riquadro tenue dello stesso colore.
 * Uso: <app-category-icon [icon]="cat.icon" [name]="cat.name" [color]="cat.color" size="sm" />
 */
@Component({
  selector: 'app-category-icon',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="ci" [class.sm]="size === 'sm'" [class.lg]="size === 'lg'" [style.--ci-color]="color || '#667085'" [attr.title]="name || null">
      <lucide-icon [img]="data" [size]="size === 'sm' ? 13 : size === 'lg' ? 18 : 15" [strokeWidth]="2"></lucide-icon>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .ci {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      color: color-mix(in srgb, var(--ci-color) 82%, var(--text));
      background: color-mix(in srgb, var(--ci-color) 13%, transparent);
    }
    .ci.sm { width: 22px; height: 22px; border-radius: 5px; }
    .ci.lg { width: 34px; height: 34px; border-radius: 8px; }
    lucide-icon { display: flex; }
  `]
})
export class CategoryIconComponent {
  @Input() icon?: string;
  @Input() name?: string;
  @Input() color?: string;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get data(): LucideIconData {
    return CATEGORY_ICONS[resolveCategoryIcon(this.icon, this.name)];
  }
}
