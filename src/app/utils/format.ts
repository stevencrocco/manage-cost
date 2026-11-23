/**
 * Formattazione degli importi in euro, uguale in tutta l'app.
 * useGrouping 'always': anche le migliaia a 4 cifre hanno il punto ("2.683,60 €"),
 * che in it-IT di default verrebbe omesso.
 */
const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', useGrouping: 'always'
} as unknown as Intl.NumberFormatOptions);

const euroRounded = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always'
} as unknown as Intl.NumberFormatOptions);

export function formatEuro(value: number): string {
  return euro.format(value || 0);
}

export function formatEuroRounded(value: number): string {
  return euroRounded.format(value || 0);
}
