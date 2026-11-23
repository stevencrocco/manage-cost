import { Chart } from 'chart.js';
import { formatEuroRounded } from '../utils/format';

/**
 * Stile comune dei grafici: palette sobria, font dell'app, griglie leggere.
 * I colori dei grafici seguono il tema (chiaro/scuro) tramite Chart.defaults.
 */

/** Palette categoriale: toni medi, distinguibili, senza colori "da cartone" */
export const CHART_PALETTE = [
  '#3b6fd8', '#2f9e8f', '#d08a2e', '#7a5bc4', '#c4536b',
  '#4f9bd1', '#6b8e3a', '#a0673c', '#8a94a6', '#b85c9e'
];

export const CHART_COLORS = {
  income: '#2f9e6e',
  expense: '#d1524a',
  primary: '#3b6fd8',
  primarySoft: 'rgba(59, 111, 216, 0.12)'
};

/** Etichette degli assi: "1.200 €" */
export function euroTick(value: string | number): string {
  return formatEuroRounded(Number(value));
}

/** Applica font, colori del testo e griglie al tema corrente */
export function applyChartTheme(dark: boolean): void {
  Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = dark ? '#94969c' : '#667085';
  Chart.defaults.borderColor = dark ? 'rgba(255,255,255,0.07)' : '#eef0f3';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = dark ? '#1b2130' : '#101828';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.titleFont = { weight: 600 };
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  refreshCharts();
}

/** Ridisegna i grafici già aperti (cambio tema, font caricato dopo il primo disegno) */
export function refreshCharts(): void {
  Object.values(Chart.instances).forEach(chart => chart.update());
}

// Il font Inter arriva dopo il primo disegno: rimisura le etichette quando è pronto
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready.then(() => refreshCharts());
}
