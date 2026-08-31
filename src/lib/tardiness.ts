export interface TardinessRule {
  id: string;
  nameAr: string;
  nameEn: string;
  thresholdMinutes: number;
  tardiesPerAbsence: number;
}

export const TARDINESS_RULES: TardinessRule[] = [
  {
    id: "standard",
    nameAr: "عام (١٥ دقيقة، ٣ تأخيرات = غياب)",
    nameEn: "Standard (15 min, 3 tardies = 1 absence)",
    thresholdMinutes: 15,
    tardiesPerAbsence: 3,
  },
  {
    id: "strict",
    nameAr: "صارم (١٠ دقائق، ٢ تأخيرات = غياب)",
    nameEn: "Strict (10 min, 2 tardies = 1 absence)",
    thresholdMinutes: 10,
    tardiesPerAbsence: 2,
  },
  {
    id: "lenient",
    nameAr: "مرن (٢٠ دقيقة، ٤ تأخيرات = غياب)",
    nameEn: "Lenient (20 min, 4 tardies = 1 absence)",
    thresholdMinutes: 20,
    tardiesPerAbsence: 4,
  },
  {
    id: "direct",
    nameAr: "مباشر (أي تأخير = غياب)",
    nameEn: "Direct (any tardy = absence)",
    thresholdMinutes: 1,
    tardiesPerAbsence: 1,
  },
  {
    id: "none",
    nameAr: "بدون حساب تأخير",
    nameEn: "No tardiness tracking",
    thresholdMinutes: 0,
    tardiesPerAbsence: 0,
  },
];

export const DEFAULT_RULE_ID = "standard";

export function getRuleById(id: string): TardinessRule {
  return TARDINESS_RULES.find((r) => r.id === id) ?? TARDINESS_RULES[0];
}

export function buildCustomRule(thresholdMinutes: number, tardiesPerAbsence: number): TardinessRule {
  return {
    id: "custom",
    nameAr: `مخصص (${thresholdMinutes} د، ${tardiesPerAbsence} تأخيرات = غياب)`,
    nameEn: `Custom (${thresholdMinutes} min, ${tardiesPerAbsence} tardies = 1 absence)`,
    thresholdMinutes,
    tardiesPerAbsence,
  };
}

export function resolveTardinessRule(sem?: { tardinessRuleId?: string; customTardinessThreshold?: number; customTardiesPerAbsence?: number } | null): TardinessRule {
  const ruleId = sem?.tardinessRuleId ?? DEFAULT_RULE_ID;
  return ruleId === "custom"
    ? buildCustomRule(sem?.customTardinessThreshold ?? 15, sem?.customTardiesPerAbsence ?? 3)
    : getRuleById(ruleId);
}

export function tardinessToAbsenceMinutes(
  tardies: { minutesLate: number; sessionMinutes: number }[],
  rule: TardinessRule
): number {
  if (!tardies.length || rule.id === "none") return 0;

  let absenceMinutes = 0;

  const sessionGroups = new Map<number, number>();
  for (const t of tardies) {
    if (t.minutesLate >= rule.thresholdMinutes) {
      absenceMinutes += t.sessionMinutes;
    } else if (t.minutesLate > 0) {
      sessionGroups.set(
        t.sessionMinutes,
        (sessionGroups.get(t.sessionMinutes) ?? 0) + 1
      );
    }
  }

  if (rule.tardiesPerAbsence > 1) {
    for (const [sessionMin, count] of sessionGroups) {
      absenceMinutes += Math.floor(count / rule.tardiesPerAbsence) * sessionMin;
    }
  }

  return absenceMinutes;
}
