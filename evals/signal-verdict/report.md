# Signal verdict eval: held-out

Run: 2026-10-28T23:51:48.950Z

- Pairs: 25 (correct 19, absent 7, unknown 0)
- Same-Need Precision: 100.0% (10/10 predicted same_need)
- Same-Need Recall: 100.0% (10/10 expected same_need)
- Related-Need Precision: 62.5% (5/8 predicted related_need)
- Kill line: at or above 85%. About 25 pairs is a first reading, not a verdict.

| id    | target                     | expected     | predicted    |      |
| ----- | -------------------------- | ------------ | ------------ | ---- |
| ho-01 | swap-sync                  | same_need    | same_need    | ok   |
| ho-02 | change-approvals           | same_need    | same_need    | ok   |
| ho-03 | swap-sync                  | related_need | absent       | MISS |
| ho-04 | multi-location-view        | same_need    | same_need    | ok   |
| ho-05 | change-approvals           | related_need | absent       | MISS |
| ho-06 | time-off-requests          | same_need    | same_need    | ok   |
| ho-07 | availability               | same_need    | same_need    | ok   |
| ho-08 | adp-export                 | same_need    | same_need    | ok   |
| ho-09 | shift-reminders            | same_need    | same_need    | ok   |
| ho-10 | geofenced-clock-in         | same_need    | same_need    | ok   |
| ho-11 | copy-last-week             | same_need    | same_need    | ok   |
| ho-12 | labor-cost-forecast        | same_need    | same_need    | ok   |
| ho-13 | swap-sync                  | related_need | absent       | MISS |
| ho-14 | overtime-alerts            | related_need | related_need | ok   |
| ho-15 | shift-reminders            | related_need | related_need | ok   |
| ho-16 | skill-based-scheduling     | related_need | related_need | ok   |
| ho-17 | cross-store-open-shifts    | related_need | related_need | ok   |
| ho-18 | tip-pooling                | related_need | related_need | ok   |
| ho-19 | trade-notifications        | different    | absent       | ok   |
| ho-20 | manager-edits-not-on-phone | different    | absent       | ok   |
| ho-21 | team-announcements         | different    | related_need | MISS |
| ho-22 | swap-sync                  | different    | absent       | ok   |
| ho-23 | earnings-preview           | different    | related_need | MISS |
| ho-24 | overtime-alerts            | different    | related_need | MISS |
| ho-25 | login-persistence          | different    | absent       | ok   |
