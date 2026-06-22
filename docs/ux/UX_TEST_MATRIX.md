# UX Test Matrix — Ghayth

This file defines the minimum journey matrix for the UX gate.

## Priority levels

| Level | Meaning | Failure impact |
|---|---|---|
| P0 | Core path | Blocks acceptance |
| P1 | Important path | Blocks final release |
| P2 | Usability improvement | Tracked as issue |
| P3 | Visual note | Tracked as issue |

## Core journeys

| Path | Journey | Level | Required effect |
|---|---|---|---|
| HR | Create employee | P0 | Employee record + Audit/Event |
| HR | Submit leave | P0 | Leave request + state |
| HR | Approve leave | P0 | Approved state + report |
| HR | Run payroll | P0 | Payroll run + finance service request |
| Finance | Create invoice | P0 | Invoice + receivable effect |
| Finance | Create voucher | P0 | Finance movement + report |
| Finance | Create journal entry | P0 | Balanced entry + audit log |
| Fleet | Add vehicle | P0 | Vehicle + state |
| Fleet | Create trip | P0 | Trip + driver + vehicle |
| Fleet | Close trip | P0 | Closed state + report |
| Documents | Upload and link document | P0 | Document + linked entity + permission |
| Admin communications | Register inbound/outbound | P1 | Number + referral + Audit |
| Notifications | Send notification | P1 | Channel log |

## Automated route smoke list

- `/`
- `/employees`
- `/employees/create`
- `/hr/leaves`
- `/hr/leaves/create`
- `/hr/payroll`
- `/hr/payroll/create`
- `/finance`
- `/fleet`
- `/documents`

## Manual success definition

A journey is successful only when the user can finish it without external explanation and can see the operational effect after the action.
