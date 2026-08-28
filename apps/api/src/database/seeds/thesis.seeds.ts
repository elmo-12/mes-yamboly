import { ThesisAlertsSeeder } from './thesis-alerts.seed';
import { ThesisAnalyticsSeeder } from './thesis-analytics.seed';
import { ThesisEvidenceSeeder } from './thesis-evidence.seed';
import { ThesisReportsSeeder } from './thesis-reports.seed';
import type { Seeder } from './seeder.interface';

export const thesisReportsSeeder = new ThesisReportsSeeder();
export const thesisAlertsSeeder = new ThesisAlertsSeeder();
export const thesisAnalyticsSeeder = new ThesisAnalyticsSeeder();
export const thesisEvidenceSeeder = new ThesisEvidenceSeeder();

/**
 * Seeders de los módulos de tesis (B2). Se añaden al final de `SEEDERS`
 * porque dependen de las líneas y causas cargadas por los seeders base.
 */
export const THESIS_SEEDERS: Seeder[] = [
  thesisReportsSeeder,
  thesisAlertsSeeder,
  thesisAnalyticsSeeder,
  thesisEvidenceSeeder,
];
