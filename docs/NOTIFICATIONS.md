# Notification rules

This file is the product source of truth for portal emails.

## Recipient policy

- `admin@brightlearnersacademy.net` is the only recipient of operational reports, completion records, and exception summaries.
- Directors receive only actionable reminders for inspections assigned to their location.
- Employees do not receive administrative reports.
- Do not copy every director, executive, payroll address, or the technical owner on routine messages.
- The technical owner may inspect notification records in the backend but is not a routine email recipient.

## Emails to the admin

- Individual orientation completion: employee name, location, province, completion time, completed-module checklist, final certificate, and audit/report download.
- Individual inspection completion: director name, location, inspection type, completion time, outstanding corrective actions, and secure report/ZIP download.
- Overdue orientation digest: grouped list of employees who have not completed required training, with location, assignment date, due date, and days overdue.
- Overdue inspection digest: grouped list of required inspections not submitted, with director/location, due date, and days overdue.
- Corrective-action and exception summaries when configured.
- New-account or access events only if the admin enables them; these are not required as routine emails.

## Emails to directors

- Upcoming inspection reminder for their assigned location.
- Due-today inspection reminder.
- Overdue inspection reminder until the inspection is submitted or an administrator changes the assignment.
- Every inspection reminder sent to a director must CC `admin@brightlearnersacademy.net`, including upcoming, due-today, and overdue reminders.
- A director must never receive another location's reminder unless an administrator has assigned that location to them.

## Employees

- No completion, reporting, inspection, or administrative emails by default.
- Course reminders can be added later only if Bright Learners explicitly requests them. Until then, overdue course information appears in the admin digest and in the employee's portal dashboard.

## Delivery behavior

- Completion emails are sent individually after a successful final course completion or submitted inspection.
- Overdue reports are digests, not one email per overdue person.
- Every generated email event must be recorded with recipient, template/type, related user/location/record, created time, attempted time, delivery status, and provider message ID when available.
- Download links must be secure and time-limited. Sensitive reports and photographs must not be attached to broadly distributed messages.
- Scheduled reminders use the daycare location's local time. Current locations use Alberta or Saskatchewan time as applicable.
- Failed or retried deliveries must not create duplicate completion records.

## Course-content review

The Alberta and Saskatchewan modules are built from the supplied onboarding material and official sources, with official requirements taking priority over internal material. Bright Learners will review the completed course and can request additions or corrections before it is treated as final. Every lesson and quiz question must retain its source citation so updates can be made without guessing.
