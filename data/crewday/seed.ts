/**
 * Crewday Demo Workspace: a fictional workforce-scheduling SaaS for restaurants and retail chains.
 * Demo data only. Stable `key`s make seeding idempotent.
 */

export interface SeedAccount {
  key: string;
  name: string;
  plan: string;
  segment: string;
  size: string;
}

export interface SeedFeatureRequest {
  account: string;
  actor: { name: string; type: "agent" | "staff" };
  description: string;
  key: string;
  requester: { name: string; role: string };
  title: string;
  underlyingNeed: string;
}

export interface SeedSupport {
  account: string;
  actor: string;
  key: string;
  quote: string;
  request: string;
  requester: string;
}

export interface SeedComment {
  account?: string;
  actor: string;
  body: string;
  key: string;
  request: string;
}

export interface SeedRelatedLink {
  a: string;
  b: string;
  key: string;
  reason: string;
  sharedDimension: string;
}

export const workspace = { name: "Crewday Demo", slug: "crewday" };

export const seedAccounts: SeedAccount[] = [
  {
    key: "harbor",
    name: "Harbor Bistro Group",
    plan: "Pro",
    segment: "restaurant",
    size: "8 locations",
  },
  { key: "cedar", name: "Cedar Market", plan: "Enterprise", segment: "retail", size: "24 stores" },
  { key: "lumen", name: "Lumen Coffee Co", plan: "Starter", segment: "cafe", size: "5 locations" },
  {
    key: "northwind",
    name: "Northwind Outfitters",
    plan: "Enterprise",
    segment: "retail",
    size: "40 stores",
  },
  {
    key: "saffron",
    name: "Saffron & Sage",
    plan: "Starter",
    segment: "restaurant",
    size: "2 locations",
  },
  {
    key: "pacific",
    name: "Pacific Grocers",
    plan: "Enterprise",
    segment: "grocery",
    size: "60 stores",
  },
  {
    key: "tidewater",
    name: "Tidewater Diner",
    plan: "Starter",
    segment: "restaurant",
    size: "1 location",
  },
  { key: "urban", name: "Urban Threads", plan: "Pro", segment: "retail", size: "12 stores" },
  {
    key: "goldenwok",
    name: "Golden Wok Express",
    plan: "Pro",
    segment: "quick service",
    size: "18 locations",
  },
  {
    key: "maple",
    name: "Maple & Main Bakery",
    plan: "Starter",
    segment: "bakery",
    size: "3 locations",
  },
  {
    key: "summit",
    name: "Summit Sports",
    plan: "Enterprise",
    segment: "retail",
    size: "30 stores",
  },
  {
    key: "bluefin",
    name: "Bluefin Sushi Bar",
    plan: "Pro",
    segment: "restaurant",
    size: "6 locations",
  },
];

const staff = (name: string) => ({ name, type: "staff" as const });
const agent = (name: string) => ({ name, type: "agent" as const });

export const seedFeatureRequests: SeedFeatureRequest[] = [
  {
    account: "harbor",
    actor: staff("Maya (Support)"),
    description:
      "When I swap a shift with a coworker in the app it says done, but my manager's schedule still shows me on it. Last week I got marked no-show for a shift I traded away.",
    key: "swap-sync",
    requester: { name: "Sofia", role: "employee" },
    title: "Shift swaps don't sync reliably",
    underlyingNeed:
      "Employees need a completed shift trade to update everyone's schedule at once so they aren't held responsible for shifts they no longer own.",
  },
  {
    account: "harbor",
    actor: staff("Maya (Support)"),
    description:
      "Staff change shifts between themselves and I find out when someone doesn't show. I want to approve or reject any shift change before it's final.",
    key: "change-approvals",
    requester: { name: "Daniel", role: "store manager" },
    title: "Shift changes need approval workflows",
    underlyingNeed:
      "Managers need control over who covers a shift before a change takes effect, so coverage and skills stay right.",
  },
  {
    account: "pacific",
    actor: staff("Jon (Customer Success)"),
    description:
      "I oversee 12 stores and have to open each one's schedule separately. I need one view of all locations to spot gaps and move people between stores.",
    key: "multi-location-view",
    requester: { name: "Patricia", role: "regional manager" },
    title: "Scheduling visibility across 12 locations",
    underlyingNeed:
      "Regional managers need to see staffing across many locations at once to find coverage gaps and rebalance staff.",
  },
  {
    account: "goldenwok",
    actor: agent("Crewday Support Bot"),
    description:
      "The trade board doesn't refresh. Someone picks up my shift and an hour later it still shows as open to everyone else.",
    key: "trade-board-stale",
    requester: { name: "Kevin", role: "cook" },
    title: "Trade board doesn't update after pickup",
    underlyingNeed:
      "Employees need a completed shift trade to update everyone's schedule at once so they aren't held responsible for shifts they no longer own.",
  },
  {
    account: "northwind",
    actor: staff("Priya (Sales)"),
    description:
      "Store leads want to post an open shift and let people from nearby stores claim it, not just their own team.",
    key: "cross-store-open-shifts",
    requester: { name: "Marcus", role: "district manager" },
    title: "Open shifts across nearby stores",
    underlyingNeed:
      "Multi-location operators need to fill gaps with qualified staff from other locations, not only the home store.",
  },
  {
    account: "lumen",
    actor: staff("Maya (Support)"),
    description:
      "Baristas send time-off requests by text and they get lost. We need requests inside Crewday with an approve button and a calendar.",
    key: "time-off-requests",
    requester: { name: "Lena", role: "owner" },
    title: "Time-off requests in the app",
    underlyingNeed:
      "Managers need time-off requests captured and decided in one place so absences are planned, not discovered.",
  },
  {
    account: "tidewater",
    actor: agent("Crewday Support Bot"),
    description:
      "Let employees set the days and hours they can work so I stop scheduling people when they're in class.",
    key: "availability",
    requester: { name: "Ray", role: "owner" },
    title: "Employee availability preferences",
    underlyingNeed:
      "Managers need to know when each employee can work before building a schedule, so schedules don't need rework.",
  },
  {
    account: "summit",
    actor: staff("Jon (Customer Success)"),
    description:
      "We blow our labor budget every holiday week and only find out at payroll. Show projected labor cost versus budget while we build the schedule.",
    key: "labor-cost-forecast",
    requester: { name: "Dana", role: "operations director" },
    title: "Labor cost vs budget while scheduling",
    underlyingNeed:
      "Operators need to see the cost impact of a schedule before publishing it so they stay within labor budget.",
  },
  {
    account: "goldenwok",
    actor: staff("Priya (Sales)"),
    description:
      "Warn me before I schedule someone into overtime. Right now I only see it after the week closes.",
    key: "overtime-alerts",
    requester: { name: "Wei", role: "general manager" },
    title: "Overtime warnings when scheduling",
    underlyingNeed:
      "Operators need to see the cost impact of a schedule before publishing it so they stay within labor budget.",
  },
  {
    account: "urban",
    actor: staff("Maya (Support)"),
    description: "Push approved hours to ADP so we stop retyping timesheets every two weeks.",
    key: "adp-export",
    requester: { name: "Hannah", role: "payroll admin" },
    title: "ADP payroll integration",
    underlyingNeed:
      "Payroll admins need approved hours to reach payroll without manual re-entry, to save time and avoid errors.",
  },
  {
    account: "saffron",
    actor: agent("Crewday Support Bot"),
    description: "We use Gusto. Can Crewday send hours there automatically?",
    key: "gusto-export",
    requester: { name: "Omar", role: "owner" },
    title: "Gusto integration for hours",
    underlyingNeed:
      "Payroll admins need approved hours to reach payroll without manual re-entry, to save time and avoid errors.",
  },
  {
    account: "bluefin",
    actor: staff("Maya (Support)"),
    description: "Text people an hour before their shift. Half our late arrivals say they forgot.",
    key: "shift-reminders",
    requester: { name: "Aiko", role: "manager" },
    title: "Shift reminders by SMS",
    underlyingNeed: "Employees need timely reminders of upcoming shifts so they arrive on time.",
  },
  {
    account: "pacific",
    actor: staff("Jon (Customer Success)"),
    description:
      "Employees clock in from the parking lot or from home. Only allow clock-in when the phone is at the store.",
    key: "geofenced-clock-in",
    requester: { name: "Patricia", role: "regional manager" },
    title: "Geofenced clock-in",
    underlyingNeed:
      "Operators need clock-ins to reflect real presence at the workplace so paid time matches worked time.",
  },
  {
    account: "maple",
    actor: staff("Maya (Support)"),
    description: "One baker clocks in for another. A photo at clock-in would stop it.",
    key: "photo-clock-in",
    requester: { name: "Claire", role: "owner" },
    title: "Photo verification at clock-in",
    underlyingNeed:
      "Operators need clock-ins to reflect real presence at the workplace so paid time matches worked time.",
  },
  {
    account: "northwind",
    actor: staff("Priya (Sales)"),
    description:
      "Our Oregon and NYC stores fall under predictive scheduling laws. We need to post schedules 14 days ahead and track premium pay when we change them late.",
    key: "fair-workweek",
    requester: { name: "Marcus", role: "district manager" },
    title: "Fair Workweek compliance",
    underlyingNeed:
      "Operators in regulated cities need schedules and late changes to follow predictive scheduling laws to avoid penalties.",
  },
  {
    account: "harbor",
    actor: agent("Crewday Support Bot"),
    description:
      "Remind me when a server is due a meal break under California rules, and flag missed breaks.",
    key: "break-compliance",
    requester: { name: "Daniel", role: "store manager" },
    title: "Meal and rest break compliance",
    underlyingNeed:
      "Managers need to honor required breaks during shifts to protect staff and avoid penalties.",
  },
  {
    account: "goldenwok",
    actor: staff("Jon (Customer Success)"),
    description:
      "Use our Toast sales history to suggest how many cooks and cashiers we need each hour.",
    key: "sales-forecast-scheduling",
    requester: { name: "Wei", role: "general manager" },
    title: "Auto-schedule from POS sales forecast",
    underlyingNeed:
      "Managers need staffing levels that match expected demand so they're neither understaffed nor overspending.",
  },
  {
    account: "lumen",
    actor: staff("Maya (Support)"),
    description:
      "Building next week's schedule takes me 3 hours. Copy last week and let me tweak it.",
    key: "copy-last-week",
    requester: { name: "Lena", role: "owner" },
    title: "Copy previous week's schedule",
    underlyingNeed:
      "Managers need to build recurring schedules quickly instead of from scratch each week.",
  },
  {
    account: "cedar",
    actor: staff("Priya (Sales)"),
    description:
      "Many of our associates read Spanish more easily. The employee app should be available in Spanish.",
    key: "spanish-app",
    requester: { name: "Luis", role: "HR manager" },
    title: "Spanish language support",
    underlyingNeed:
      "Employees need the app in their own language so they understand their schedules and requests.",
  },
  {
    account: "summit",
    actor: staff("Jon (Customer Success)"),
    description:
      "Send a message to everyone working Saturday about the inventory count, inside Crewday.",
    key: "team-announcements",
    requester: { name: "Dana", role: "operations director" },
    title: "Announcements to scheduled staff",
    underlyingNeed:
      "Managers need to reach exactly the staff affected by an event without leaving the scheduling tool.",
  },
  {
    account: "bluefin",
    actor: staff("Maya (Support)"),
    description:
      "Only certified sushi chefs can work the bar station. Block scheduling uncertified people there.",
    key: "skill-based-scheduling",
    requester: { name: "Aiko", role: "manager" },
    title: "Schedule by certification and station",
    underlyingNeed:
      "Managers need every shift covered by people qualified for the role, so service and safety hold.",
  },
  {
    account: "pacific",
    actor: agent("Crewday Support Bot"),
    description: "Alert me 30 days before an employee's food handler card expires.",
    key: "certification-expiry",
    requester: { name: "Patricia", role: "regional manager" },
    title: "Food handler certificate expiry alerts",
    underlyingNeed:
      "Operators need staff certifications kept current so every shift stays compliant.",
  },
  {
    account: "tidewater",
    actor: staff("Maya (Support)"),
    description: "Let me print the week's schedule on one page for the break room wall.",
    key: "print-schedule",
    requester: { name: "Ray", role: "owner" },
    title: "Printable weekly schedule",
    underlyingNeed: "Managers need the schedule visible to staff who don't check the app.",
  },
  {
    account: "saffron",
    actor: staff("Priya (Sales)"),
    description: "Split tips by hours worked per shift and show each server their share.",
    key: "tip-pooling",
    requester: { name: "Omar", role: "owner" },
    title: "Tip pooling by hours worked",
    underlyingNeed:
      "Restaurants need tips distributed fairly and transparently without spreadsheets.",
  },
  {
    account: "urban",
    actor: agent("Crewday Support Bot"),
    description:
      "When I trade a shift, my coworker never gets a notification, so the trade sits for days.",
    key: "trade-notifications",
    requester: { name: "Jasmine", role: "sales associate" },
    title: "Notify coworkers about trade offers",
    underlyingNeed:
      "Employees need trade offers to reach coworkers quickly so trades are completed in time.",
  },
  {
    account: "northwind",
    actor: staff("Jon (Customer Success)"),
    description: "I manage 9 stores. Give me a dashboard of which stores are short-staffed today.",
    key: "district-dashboard",
    requester: { name: "Marcus", role: "district manager" },
    title: "District dashboard of understaffed stores",
    underlyingNeed:
      "Regional managers need to see staffing across many locations at once to find coverage gaps and rebalance staff.",
  },
  {
    account: "cedar",
    actor: staff("Maya (Support)"),
    description:
      "Managers swap shifts on behalf of staff in the back office, and the change never shows on the employee's phone.",
    key: "manager-edits-not-on-phone",
    requester: { name: "Luis", role: "HR manager" },
    title: "Manager edits don't reach employee phones",
    underlyingNeed:
      "Employees need schedule changes made by anyone to appear on their phone right away so they work the right shifts.",
  },
  {
    account: "maple",
    actor: staff("Priya (Sales)"),
    description:
      "Let me set a max of 30 hours a week for part-timers so I don't accidentally make them full time.",
    key: "hour-caps",
    requester: { name: "Claire", role: "owner" },
    title: "Weekly hour limits per employee",
    underlyingNeed:
      "Managers need guardrails on hours per person to control costs and employment status.",
  },
  {
    account: "summit",
    actor: staff("Priya (Sales)"),
    description: "Show managers which employees are close to overtime before they approve a swap.",
    key: "swap-overtime-check",
    requester: { name: "Dana", role: "operations director" },
    title: "Overtime check before approving swaps",
    underlyingNeed:
      "Managers need control over who covers a shift before a change takes effect, so coverage and skills stay right.",
  },
  {
    account: "lumen",
    actor: agent("Crewday Support Bot"),
    description: "Dark mode for the employee app, we close at night and the app is blinding.",
    key: "dark-mode",
    requester: { name: "Theo", role: "barista" },
    title: "Dark mode",
    underlyingNeed: "Employees need the app comfortable to use in low light.",
  },
  {
    account: "bluefin",
    actor: staff("Jon (Customer Success)"),
    description: "Let employees see their earned wages for the week before payday.",
    key: "earnings-preview",
    requester: { name: "Aiko", role: "manager" },
    title: "Earnings preview for employees",
    underlyingNeed:
      "Employees need to know what they've earned before payday to plan their finances.",
  },
  {
    account: "goldenwok",
    actor: staff("Maya (Support)"),
    description:
      "Managers at different locations can't see each other's staff, so we can't borrow a cook for a night.",
    key: "borrow-staff",
    requester: { name: "Wei", role: "general manager" },
    title: "Borrow staff from another location",
    underlyingNeed:
      "Multi-location operators need to fill gaps with qualified staff from other locations, not only the home store.",
  },
  {
    account: "pacific",
    actor: staff("Priya (Sales)"),
    description:
      "Let department leads build their own section of the schedule, with the store manager approving the whole thing.",
    key: "department-schedules",
    requester: { name: "Gina", role: "store manager" },
    title: "Department-level schedule building",
    underlyingNeed:
      "Large stores need scheduling work split across leads while one person stays accountable for the final schedule.",
  },
  {
    account: "harbor",
    actor: staff("Priya (Sales)"),
    description:
      "Show the schedule for all 8 restaurants side by side so I can see who's working where tonight.",
    key: "all-locations-tonight",
    requester: { name: "Elena", role: "operations manager" },
    title: "All locations' schedules side by side",
    underlyingNeed:
      "Regional managers need to see staffing across many locations at once to find coverage gaps and rebalance staff.",
  },
  {
    account: "urban",
    actor: staff("Jon (Customer Success)"),
    description: "Let me export the schedule to Google Calendar for each employee.",
    key: "calendar-sync",
    requester: { name: "Hannah", role: "payroll admin" },
    title: "Google Calendar sync for shifts",
    underlyingNeed:
      "Employees need their shifts in the calendar they already use so they don't miss them.",
  },
  {
    account: "saffron",
    actor: staff("Maya (Support)"),
    description:
      "If a cook calls out sick, let me text all off-duty cooks at once and give the shift to whoever says yes first.",
    key: "callout-fill",
    requester: { name: "Omar", role: "owner" },
    title: "Fill call-outs by texting available staff",
    underlyingNeed:
      "Managers need to fill last-minute absences quickly with someone qualified and available.",
  },
  {
    account: "cedar",
    actor: agent("Crewday Support Bot"),
    description: "Require my approval before an employee can drop a shift onto the open board.",
    key: "drop-approval",
    requester: { name: "Ben", role: "store manager" },
    title: "Approve shift drops before they go to the open board",
    underlyingNeed:
      "Managers need control over who covers a shift before a change takes effect, so coverage and skills stay right.",
  },
  {
    account: "summit",
    actor: staff("Maya (Support)"),
    description:
      "Audit log of every schedule change: who changed what and when. HR needs it for disputes.",
    key: "schedule-audit-log",
    requester: { name: "Dana", role: "operations director" },
    title: "Audit log of schedule changes",
    underlyingNeed:
      "Operators need a trustworthy history of schedule changes to resolve disputes and prove compliance.",
  },
  {
    account: "tidewater",
    actor: agent("Crewday Support Bot"),
    description: "The app logs me out every day and I have to reset my password to see my shifts.",
    key: "login-persistence",
    requester: { name: "Rosa", role: "server" },
    title: "Stay logged in on the employee app",
    underlyingNeed: "Employees need quick access to their schedule without repeated sign-ins.",
  },
  {
    account: "northwind",
    actor: staff("Priya (Sales)"),
    description:
      "Seasonal hires need a simpler onboarding: invite by text, set availability, done.",
    key: "seasonal-onboarding",
    requester: { name: "Marcus", role: "district manager" },
    title: "Fast onboarding for seasonal hires",
    underlyingNeed: "Operators need new short-term staff schedulable within a day of hiring.",
  },
];

export const seedSupports: SeedSupport[] = [
  {
    account: "goldenwok",
    actor: "Crewday Support Bot",
    key: "s-swap-goldenwok",
    quote: "Traded shifts still show under the old person.",
    request: "swap-sync",
    requester: "Kevin",
  },
  {
    account: "urban",
    actor: "Maya (Support)",
    key: "s-swap-urban",
    quote: "Our associates get blamed for no-shows after valid trades.",
    request: "swap-sync",
    requester: "Jasmine",
  },
  {
    account: "cedar",
    actor: "Ben (Store Manager)",
    key: "s-approvals-cedar",
    quote: "Swaps without my sign-off leave the floor without a key holder.",
    request: "change-approvals",
    requester: "Ben",
  },
  {
    account: "summit",
    actor: "Jon (Customer Success)",
    key: "s-approvals-summit",
    quote: "We need manager approval on every shift change for audit reasons.",
    request: "change-approvals",
    requester: "Dana",
  },
  {
    account: "northwind",
    actor: "Priya (Sales)",
    key: "s-multi-northwind",
    quote: "Expansion deal blocked until district managers get a multi-store view.",
    request: "multi-location-view",
    requester: "Marcus",
  },
  {
    account: "harbor",
    actor: "Priya (Sales)",
    key: "s-multi-harbor",
    quote: "Ops opens eight tabs every Friday.",
    request: "multi-location-view",
    requester: "Elena",
  },
  {
    account: "goldenwok",
    actor: "Jon (Customer Success)",
    key: "s-multi-goldenwok",
    quote: "Wants to move cooks between kitchens on busy nights.",
    request: "multi-location-view",
    requester: "Wei",
  },
  {
    account: "pacific",
    actor: "Jon (Customer Success)",
    key: "s-cross-pacific",
    quote: "Would fill weekend gaps from the next town over.",
    request: "cross-store-open-shifts",
    requester: "Patricia",
  },
  {
    account: "bluefin",
    actor: "Maya (Support)",
    key: "s-timeoff-bluefin",
    quote: "Requests come in on Instagram DMs.",
    request: "time-off-requests",
    requester: "Aiko",
  },
  {
    account: "maple",
    actor: "Maya (Support)",
    key: "s-timeoff-maple",
    quote: "Paper forms get lost in the bakery.",
    request: "time-off-requests",
    requester: "Claire",
  },
  {
    account: "goldenwok",
    actor: "Priya (Sales)",
    key: "s-labor-goldenwok",
    quote: "Labor is 32% of sales; budget is 28%.",
    request: "labor-cost-forecast",
    requester: "Wei",
  },
  {
    account: "pacific",
    actor: "Jon (Customer Success)",
    key: "s-labor-pacific",
    quote: "Finance asks for projected labor before we publish.",
    request: "labor-cost-forecast",
    requester: "Patricia",
  },
  {
    account: "summit",
    actor: "Jon (Customer Success)",
    key: "s-overtime-summit",
    quote: "Overtime surprise every holiday week.",
    request: "overtime-alerts",
    requester: "Dana",
  },
  {
    account: "northwind",
    actor: "Priya (Sales)",
    key: "s-adp-northwind",
    quote: "Payroll spends a day a cycle retyping hours.",
    request: "adp-export",
    requester: "Marcus",
  },
  {
    account: "harbor",
    actor: "Maya (Support)",
    key: "s-reminders-harbor",
    quote: "Late arrivals dropped when we texted manually.",
    request: "shift-reminders",
    requester: "Daniel",
  },
  {
    account: "cedar",
    actor: "Priya (Sales)",
    key: "s-fww-cedar",
    quote: "Seattle stores need predictive scheduling compliance.",
    request: "fair-workweek",
    requester: "Luis",
  },
  {
    account: "lumen",
    actor: "Maya (Support)",
    key: "s-copy-lumen-tidewater",
    quote: "Same schedule every week, rebuilt by hand.",
    request: "copy-last-week",
    requester: "Lena",
  },
  {
    account: "tidewater",
    actor: "Maya (Support)",
    key: "s-copy-tidewater",
    quote: "Copy and tweak would save my Sunday.",
    request: "copy-last-week",
    requester: "Ray",
  },
  {
    account: "pacific",
    actor: "Jon (Customer Success)",
    key: "s-spanish-pacific",
    quote: "40% of our associates prefer Spanish.",
    request: "spanish-app",
    requester: "Patricia",
  },
  {
    account: "harbor",
    actor: "Maya (Support)",
    key: "s-trade-notify-harbor",
    quote: "Trades sit unanswered because nobody sees them.",
    request: "trade-notifications",
    requester: "Sofia",
  },
];

export const seedComments: SeedComment[] = [
  {
    account: "lumen",
    actor: "Maya (Support)",
    body: "Counterpoint from Lumen: they do NOT want approvals on swaps. Their baristas trade constantly and an approval step would slow everything down.",
    key: "c-approvals-against",
    request: "change-approvals",
  },
  {
    actor: "Jon (Customer Success)",
    body: "Engineering note from a support escalation: sync failures cluster around trades made within 2 hours of shift start.",
    key: "c-swap-timing",
    request: "swap-sync",
  },
  {
    account: "pacific",
    actor: "Jon (Customer Success)",
    body: "Patricia clarified she mostly needs to see gaps, not edit other stores' schedules.",
    key: "c-multi-clarify",
    request: "multi-location-view",
  },
  {
    account: "saffron",
    actor: "Maya (Support)",
    body: "Two-location owner says a multi-store view would be nice but isn't worth paying more for.",
    key: "c-multi-small",
    request: "multi-location-view",
  },
  {
    actor: "Priya (Sales)",
    body: "Northwind's renewal mentions this alongside cross-store open shifts.",
    key: "c-fww-renewal",
    request: "fair-workweek",
  },
];

export const seedRelatedLinks: SeedRelatedLink[] = [
  {
    a: "swap-sync",
    b: "change-approvals",
    key: "l-swap-approvals",
    reason:
      "Both concern how a shift change becomes final: one asks that trades propagate reliably, the other that a manager signs off first.",
    sharedDimension: "how shift changes become final",
  },
  {
    a: "change-approvals",
    b: "multi-location-view",
    key: "l-approvals-multi",
    reason: "Both are about managers keeping control of coverage, at one store versus across many.",
    sharedDimension: "manager control of coverage",
  },
  {
    a: "swap-sync",
    b: "multi-location-view",
    key: "l-swap-multi",
    reason:
      "Both depend on an accurate, current schedule; one for employees, one aggregated across locations.",
    sharedDimension: "accurate, current schedule data",
  },
  {
    a: "multi-location-view",
    b: "cross-store-open-shifts",
    key: "l-multi-crossstore",
    reason:
      "Seeing gaps across locations is the first step to filling them with staff from another store.",
    sharedDimension: "multi-location staffing",
  },
  {
    a: "labor-cost-forecast",
    b: "overtime-alerts",
    key: "l-labor-overtime",
    reason: "Overtime is one driver of labor cost; both want cost visible before publishing.",
    sharedDimension: "labor cost before publishing",
  },
];
