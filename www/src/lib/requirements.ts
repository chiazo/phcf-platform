import { DueState } from "../models/enums";

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const WORKFLOW_NOTES = /^(Update needs|Recently|Approved|Updated directly|Created from)/;

export function displayNotes(info: Record<string, any>) {
  const notes = String(info?.notes ?? "");
  return notes && !WORKFLOW_NOTES.test(notes) ? notes : "";
}

export function summarizeRequirements(
  member: Record<string, any>,
  formula: Record<string, any> | null,
) {
  const info = member.member_info ?? {};
  const req = info.requirements ?? {};
  const dues = info.dues ?? {};

  const meetingsRequired = toNumber(req.meetingsRequired);
  const meetingsAttended = toNumber(req.meetingsCompleted);
  const meetingsRemaining = Math.max(0, meetingsRequired - meetingsAttended);

  const workRequired = toNumber(formula?.work_hours_required ?? req.serviceHoursRequired);
  const workDone = formula
    ? toNumber(formula.work_hours_completed)
    : (req.serviceRequirements ?? []).reduce(
        (sum: number, s: any) => sum + toNumber(s.hoursCompleted),
        0,
      );
  const openRequired = toNumber(formula?.open_hours_required);
  const openDone = toNumber(formula?.open_hours_completed);

  // Open hours can cover work hours, but work hours never cover open hours
  const surplusOpen = Math.max(0, openDone - openRequired);
  const openRemaining = Math.max(0, openRequired - openDone);
  const workRemaining = Math.max(0, workRequired - workDone - surplusOpen);

  const duesPaid = dues.dueState === DueState.COMPLETE || dues.dueState === "PAID";
  const hoursMet = workRemaining === 0 && openRemaining === 0;

  return {
    meetingsRequired,
    meetingsAttended,
    meetingsRemaining,
    workRequired,
    workDone,
    workRemaining,
    openRequired,
    openDone,
    openRemaining,
    duesPaid,
    hoursMet,
    goodStanding: duesPaid && meetingsRemaining === 0 && hoursMet,
    standingLabel: duesPaid && meetingsRemaining === 0 && hoursMet ? "Yes" : "In Progress"
  };
}