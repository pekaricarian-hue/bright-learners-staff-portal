export type InspectionCycle = {
  due: Date;
  opens: Date;
  secondReminder: Date;
  nextOpens: Date;
};

const atEndOfDay = (year: number, month: number, day: number) => new Date(year, month, day, 23, 59, 59, 999);

export function inspectionCycleFor(date: Date, dueDay: number): InspectionCycle {
  const safeDueDay = Math.min(28, Math.max(1, dueDay));
  const currentDue = atEndOfDay(date.getFullYear(), date.getMonth(), safeDueDay);
  const currentOpens = new Date(currentDue);
  currentOpens.setDate(currentOpens.getDate() - 14);
  const due = date >= currentOpens ? currentDue : atEndOfDay(date.getFullYear(), date.getMonth() - 1, safeDueDay);
  const opens = new Date(due);
  opens.setDate(opens.getDate() - 14);
  const secondReminder = new Date(due);
  secondReminder.setDate(secondReminder.getDate() - 5);
  const nextDue = atEndOfDay(due.getFullYear(), due.getMonth() + 1, safeDueDay);
  const nextOpens = new Date(nextDue);
  nextOpens.setDate(nextOpens.getDate() - 14);
  return { due, opens, secondReminder, nextOpens };
}

export function inspectionCompletedInCycle(completedAt: Date | null | undefined, cycle: InspectionCycle) {
  return Boolean(completedAt && completedAt >= cycle.opens && completedAt < cycle.nextOpens);
}
