/**
 * Test-data seed. Runs the same base reference data the production seed
 * loads (projects, CBS master, piping groups/factors, roles), then layers
 * a populated demo dataset on top of project 1 (FIME Engineering) so the
 * app looks like a real in-flight project the moment you sign in:
 *
 *   - 2 sample users (one admin, one approver) with fake Clerk ids
 *   - 3 areas + 2 subcontractors assigned to project 1
 *   - 60 FEF rows across TAKE_OFF / SUPPORT_LABOR / MATERIALS for project 1
 *   - 10 CVRs spanning every status (so the Change Log dashboard fills out)
 *   - 10 FCOs spanning every status (so the FCO Log dashboard fills out)
 *   - 10 RFIs across draft / open (some past due) / answered / closed, with
 *     two FCOs linked back to their source RFI via `linkedRfiId`
 *   - 10 Trends spanning every status (IDENTIFIED / PROBABLE / CONVERTED /
 *     REJECTED / VOID), several linked to RFIs/FCOs/CVRs, sized so the AFC
 *     column on the reporting page lights up across multiple buckets
 *   - 1 baseline EstimateSnapshot ("As-bid 2026-01-15") with cached totals
 *   - 5 monthly ReportingPeriods (Jan–May 2026) with per-bucket measurements
 *     producing a meaningful EVM S-curve with mild over/under variance
 *
 * Run via `npm run seed-test`. Idempotent: re-running wipes the
 * project-scoped tables via project cascade and upserts users/subs.
 *
 * The fake users CANNOT actually sign in — Clerk doesn't know their ids.
 * They exist so workflow records (`createdById`) reference real rows.
 */

// `npm run seed-test` runs this directly via tsx, bypassing the Prisma CLI
// path that normally loads dotenv via prisma.config.ts. Load it ourselves
// before importing anything that reads `process.env.DATABASE_URL`.
import "dotenv/config";

import { prisma } from "../src/server/db";
import { Prisma } from "../src/generated/prisma/client";
import { accumulateProjectTotals, type ProjectTotalsRow } from "../src/lib/project-totals";
import { seedBaseData } from "./seed";

// ── demo constants ───────────────────────────────────────────────────────

const DEMO_PROJECT_ID = 1;
const DEMO_PROJECT_START = new Date("2026-01-01");
const DEMO_PROJECT_END = new Date("2026-12-31");

const DEMO_USERS = [
  {
    clerkId: "seed-test-admin",
    email: "seed-admin@example.test",
    role: "ADMINISTRATOR" as const,
  },
  {
    clerkId: "seed-test-approver",
    email: "seed-approver@example.test",
    role: "APPROVER" as const,
  },
  {
    clerkId: "seed-test-user",
    email: "seed-user@example.test",
    role: "USER" as const,
  },
];

const DEMO_SUBCONTRACTORS = [
  {
    displayId: "DEMO-PIPE",
    name: "Northwest Piping LLC",
    description: "Demo: industrial piping installer (seed-test)",
    disciplines: ["piping"],
  },
  {
    displayId: "DEMO-ELEC",
    name: "Cascade Electric Co",
    description: "Demo: electrical contractor (seed-test)",
    disciplines: ["electric"],
  },
];

const DEMO_AREAS = [
  { displayId: "PHA", name: "Pump House A" },
  { displayId: "PHB", name: "Pump House B" },
  { displayId: "TF", name: "Tank Farm" },
];

// ── FEF row templates ────────────────────────────────────────────────────

/**
 * Builds an array of TAKE_OFF row templates that aggregate to ~$1.4M of
 * direct labor across three discipline digits. Each row supplies enough
 * structure for `accumulateProjectTotals` to bucket it correctly.
 */
type TakeOffTemplate = {
  discipline: string;
  cbsCode: string;
  name: string;
  quantity: string;
  unit: string;
  laborHours: string;
  laborRate: string;
};

function takeOffTemplates(): TakeOffTemplate[] {
  const piping: TakeOffTemplate[] = [
    { discipline: "piping", cbsCode: "611-A", name: "4\" CS pipe, sched 40", quantity: "1200", unit: "LF", laborHours: "240", laborRate: "85" },
    { discipline: "piping", cbsCode: "611-A", name: "4\" CS pipe, sched 80", quantity: "400", unit: "LF", laborHours: "100", laborRate: "85" },
    { discipline: "piping", cbsCode: "611-B", name: "6\" CS pipe, sched 40", quantity: "800", unit: "LF", laborHours: "200", laborRate: "85" },
    { discipline: "piping", cbsCode: "611-B", name: "8\" CS pipe, sched 40", quantity: "600", unit: "LF", laborHours: "180", laborRate: "85" },
    { discipline: "piping", cbsCode: "612-A", name: "4\" CS 90° elbow", quantity: "60", unit: "EA", laborHours: "120", laborRate: "85" },
    { discipline: "piping", cbsCode: "612-A", name: "6\" CS 90° elbow", quantity: "40", unit: "EA", laborHours: "100", laborRate: "85" },
    { discipline: "piping", cbsCode: "612-B", name: "4\" CS tee", quantity: "30", unit: "EA", laborHours: "75", laborRate: "85" },
    { discipline: "piping", cbsCode: "613-A", name: "4\" gate valve, 150#", quantity: "20", unit: "EA", laborHours: "80", laborRate: "95" },
    { discipline: "piping", cbsCode: "613-A", name: "6\" gate valve, 150#", quantity: "10", unit: "EA", laborHours: "50", laborRate: "95" },
    { discipline: "piping", cbsCode: "613-B", name: "4\" check valve, 150#", quantity: "12", unit: "EA", laborHours: "36", laborRate: "95" },
    { discipline: "piping", cbsCode: "614-A", name: "Pipe support, large", quantity: "40", unit: "EA", laborHours: "120", laborRate: "80" },
    { discipline: "piping", cbsCode: "614-A", name: "Pipe support, small", quantity: "80", unit: "EA", laborHours: "120", laborRate: "80" },
    { discipline: "piping", cbsCode: "615-A", name: "Field weld, 4\"", quantity: "200", unit: "EA", laborHours: "400", laborRate: "110" },
    { discipline: "piping", cbsCode: "615-A", name: "Field weld, 6\"", quantity: "120", unit: "EA", laborHours: "300", laborRate: "110" },
    { discipline: "piping", cbsCode: "615-B", name: "Shop weld, 4\"", quantity: "80", unit: "EA", laborHours: "120", laborRate: "100" },
    { discipline: "piping", cbsCode: "616-A", name: "Hydrotest, 4\" line", quantity: "8", unit: "EA", laborHours: "80", laborRate: "90" },
    { discipline: "piping", cbsCode: "616-A", name: "Hydrotest, 6\" line", quantity: "4", unit: "EA", laborHours: "48", laborRate: "90" },
    { discipline: "piping", cbsCode: "619-A", name: "Misc small bore tie-ins", quantity: "30", unit: "EA", laborHours: "90", laborRate: "85" },
  ];
  const electric: TakeOffTemplate[] = [
    { discipline: "electric", cbsCode: "711-A", name: "1\" EMT conduit run", quantity: "2400", unit: "LF", laborHours: "240", laborRate: "85" },
    { discipline: "electric", cbsCode: "711-A", name: "2\" EMT conduit run", quantity: "1200", unit: "LF", laborHours: "168", laborRate: "85" },
    { discipline: "electric", cbsCode: "711-B", name: "Cable tray, 12\" wide", quantity: "400", unit: "LF", laborHours: "100", laborRate: "85" },
    { discipline: "electric", cbsCode: "712-A", name: "MCC bucket, sz 1", quantity: "16", unit: "EA", laborHours: "64", laborRate: "95" },
    { discipline: "electric", cbsCode: "712-A", name: "MCC bucket, sz 2", quantity: "8", unit: "EA", laborHours: "40", laborRate: "95" },
    { discipline: "electric", cbsCode: "713-A", name: "Pull wire, #12", quantity: "8000", unit: "LF", laborHours: "120", laborRate: "80" },
    { discipline: "electric", cbsCode: "713-A", name: "Pull wire, #4", quantity: "4000", unit: "LF", laborHours: "120", laborRate: "80" },
    { discipline: "electric", cbsCode: "714-A", name: "Termination, control wire", quantity: "400", unit: "EA", laborHours: "100", laborRate: "85" },
    { discipline: "electric", cbsCode: "714-A", name: "Termination, power wire", quantity: "200", unit: "EA", laborHours: "100", laborRate: "85" },
    { discipline: "electric", cbsCode: "719-A", name: "Misc electrical install", quantity: "40", unit: "EA", laborHours: "80", laborRate: "85" },
  ];
  const civil: TakeOffTemplate[] = [
    { discipline: "civil", cbsCode: "111-A", name: "Site excavation", quantity: "800", unit: "CY", laborHours: "200", laborRate: "75" },
    { discipline: "civil", cbsCode: "111-A", name: "Backfill / compaction", quantity: "600", unit: "CY", laborHours: "150", laborRate: "75" },
    { discipline: "civil", cbsCode: "121-A", name: "Foundation pour, mat slab", quantity: "120", unit: "CY", laborHours: "240", laborRate: "85" },
    { discipline: "civil", cbsCode: "121-A", name: "Foundation pour, equipment pad", quantity: "60", unit: "CY", laborHours: "120", laborRate: "85" },
    { discipline: "civil", cbsCode: "121-B", name: "Rebar install, slab", quantity: "12", unit: "TON", laborHours: "180", laborRate: "80" },
    { discipline: "civil", cbsCode: "122-A", name: "Form & strip, foundation", quantity: "1200", unit: "SF", laborHours: "180", laborRate: "78" },
    { discipline: "civil", cbsCode: "131-A", name: "Concrete sidewalk", quantity: "400", unit: "SF", laborHours: "40", laborRate: "75" },
    { discipline: "civil", cbsCode: "139-A", name: "Misc civil work", quantity: "20", unit: "EA", laborHours: "60", laborRate: "75" },
  ];
  return [...piping, ...electric, ...civil]; // 36 take-off rows
}

type SupportLaborTemplate = {
  discipline: string;
  cbsCode: string;
  name: string;
  laborHours: string;
  laborRate: string;
};

function supportLaborTemplates(): SupportLaborTemplate[] {
  return [
    { discipline: "piping", cbsCode: "602-A", name: "Piping supervision", laborHours: "320", laborRate: "115" },
    { discipline: "piping", cbsCode: "602-B", name: "Piping safety", laborHours: "200", laborRate: "85" },
    { discipline: "piping", cbsCode: "632-A", name: "Piping rigging crew", laborHours: "400", laborRate: "95" },
    { discipline: "electric", cbsCode: "702-A", name: "Electrical supervision", laborHours: "200", laborRate: "115" },
    { discipline: "electric", cbsCode: "732-A", name: "Electrical helper", laborHours: "320", laborRate: "65" },
    { discipline: "civil", cbsCode: "102-A", name: "Civil supervision", laborHours: "160", laborRate: "115" },
    { discipline: "civil", cbsCode: "132-A", name: "Site cleanup crew", laborHours: "240", laborRate: "55" },
    { discipline: "general", cbsCode: "002-A", name: "Project mgmt support", laborHours: "400", laborRate: "125" },
  ]; // 8 support-labor rows
}

type MaterialsTemplate = {
  discipline: string; // = L1 code (matches MATERIALS section convention)
  cbsCode: string;
  name: string;
  quantity: string;
  unit: string;
  materialCost: string;
};

function materialsTemplates(): MaterialsTemplate[] {
  return [
    { discipline: "601", cbsCode: "601-A", name: "4\" CS pipe (bulk)", quantity: "1600", unit: "LF", materialCost: "42" },
    { discipline: "601", cbsCode: "601-B", name: "6\" CS pipe (bulk)", quantity: "800", unit: "LF", materialCost: "78" },
    { discipline: "601", cbsCode: "601-C", name: "8\" CS pipe (bulk)", quantity: "600", unit: "LF", materialCost: "112" },
    { discipline: "601", cbsCode: "612-A", name: "4\" elbows", quantity: "60", unit: "EA", materialCost: "85" },
    { discipline: "601", cbsCode: "613-A", name: "4\" gate valves", quantity: "20", unit: "EA", materialCost: "1100" },
    { discipline: "701", cbsCode: "711-A", name: "EMT conduit, 1\"", quantity: "2400", unit: "LF", materialCost: "4.5" },
    { discipline: "701", cbsCode: "713-A", name: "Wire, #12 THHN", quantity: "8000", unit: "LF", materialCost: "0.6" },
    { discipline: "701", cbsCode: "712-A", name: "MCC bucket equipment", quantity: "24", unit: "EA", materialCost: "1850" },
    { discipline: "101", cbsCode: "121-A", name: "Ready-mix concrete", quantity: "180", unit: "CY", materialCost: "190" },
    { discipline: "101", cbsCode: "121-B", name: "Rebar #6", quantity: "12", unit: "TON", materialCost: "1250" },
    { discipline: "101", cbsCode: "122-A", name: "Plyform sheathing", quantity: "1200", unit: "SF", materialCost: "3.2" },
  ]; // 11 materials rows
}

// ── CVRs ─────────────────────────────────────────────────────────────────

type DemoCvr = {
  cvrNumber: string;
  title: string;
  description: string;
  status:
    | "REQUESTED"
    | "IN_REVIEW"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED"
    | "EXECUTED";
  type: "SCOPE" | "COST" | "SCHEDULE" | "ENGINEERING" | "REGULATORY" | "OTHER";
  discipline: string;
  cbsCodes: string[];
  costImpact: number;
  scheduleDaysImpact: number;
  laborHoursImpact: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasonCode: string;
  daysAgoRequested: number;
  approver?: string;
  approvedDaysAgo?: number;
};

const DEMO_CVRS: DemoCvr[] = [
  { cvrNumber: "CVR-001", title: "Add corrosion-resistant coating to underground piping", description: "Owner requested coating spec change after soil report.", status: "EXECUTED", type: "SCOPE", discipline: "piping", cbsCodes: ["611-A"], costImpact: 42000, scheduleDaysImpact: 3, laborHoursImpact: 180, riskLevel: "MEDIUM", reasonCode: "OWNER_REQUEST", daysAgoRequested: 120, approver: "seed-approver@example.test", approvedDaysAgo: 100 },
  { cvrNumber: "CVR-002", title: "Replace 4\" valves with stainless steel", description: "Process group flagged compatibility concern.", status: "EXECUTED", type: "ENGINEERING", discipline: "piping", cbsCodes: ["613-A"], costImpact: 18500, scheduleDaysImpact: 0, laborHoursImpact: 0, riskLevel: "LOW", reasonCode: "DESIGN_CHANGE", daysAgoRequested: 95, approver: "seed-approver@example.test", approvedDaysAgo: 85 },
  { cvrNumber: "CVR-003", title: "Reroute conduit around new equipment pad", description: "Existing run conflicts with revised civil layout.", status: "APPROVED", type: "ENGINEERING", discipline: "electric", cbsCodes: ["711-A"], costImpact: 24000, scheduleDaysImpact: 5, laborHoursImpact: 90, riskLevel: "MEDIUM", reasonCode: "FIELD_CONDITION", daysAgoRequested: 70, approver: "seed-approver@example.test", approvedDaysAgo: 55 },
  { cvrNumber: "CVR-004", title: "Upsize MCC feeder for future expansion", description: "Owner directive for spare capacity.", status: "APPROVED", type: "SCOPE", discipline: "electric", cbsCodes: ["712-A"], costImpact: 31500, scheduleDaysImpact: 2, laborHoursImpact: 40, riskLevel: "LOW", reasonCode: "OWNER_REQUEST", daysAgoRequested: 60, approver: "seed-approver@example.test", approvedDaysAgo: 45 },
  { cvrNumber: "CVR-005", title: "Additional rebar for foundation expansion", description: "Geotech recommended denser reinforcement.", status: "APPROVED", type: "ENGINEERING", discipline: "civil", cbsCodes: ["121-B"], costImpact: 14750, scheduleDaysImpact: 1, laborHoursImpact: 60, riskLevel: "MEDIUM", reasonCode: "FIELD_CONDITION", daysAgoRequested: 50, approver: "seed-approver@example.test", approvedDaysAgo: 40 },
  { cvrNumber: "CVR-006", title: "Concrete cure-time extension", description: "Cold-weather concreting required extended cure.", status: "APPROVED", type: "SCHEDULE", discipline: "civil", cbsCodes: ["121-A"], costImpact: 8200, scheduleDaysImpact: 7, laborHoursImpact: 0, riskLevel: "LOW", reasonCode: "WEATHER", daysAgoRequested: 35, approver: "seed-approver@example.test", approvedDaysAgo: 28 },
  { cvrNumber: "CVR-007", title: "Premium for after-hours pipe welding", description: "Owner needed weekend work to meet tie-in window.", status: "PENDING_APPROVAL", type: "COST", discipline: "piping", cbsCodes: ["615-A"], costImpact: 22000, scheduleDaysImpact: -3, laborHoursImpact: 80, riskLevel: "MEDIUM", reasonCode: "OWNER_REQUEST", daysAgoRequested: 14 },
  { cvrNumber: "CVR-008", title: "Replace damaged cable tray section", description: "Found damaged during pre-install inspection.", status: "PENDING_APPROVAL", type: "SCOPE", discipline: "electric", cbsCodes: ["711-B"], costImpact: 6400, scheduleDaysImpact: 1, laborHoursImpact: 24, riskLevel: "LOW", reasonCode: "FIELD_CONDITION", daysAgoRequested: 8 },
  { cvrNumber: "CVR-009", title: "Substitute alternate pipe support style", description: "Originally specified supports not available.", status: "REQUESTED", type: "ENGINEERING", discipline: "piping", cbsCodes: ["614-A"], costImpact: -3200, scheduleDaysImpact: 0, laborHoursImpact: 0, riskLevel: "LOW", reasonCode: "PROCUREMENT", daysAgoRequested: 3 },
  { cvrNumber: "CVR-010", title: "Add backup generator hookup", description: "Initial scope; owner pulled it.", status: "REJECTED", type: "SCOPE", discipline: "electric", cbsCodes: ["712-A"], costImpact: 48000, scheduleDaysImpact: 10, laborHoursImpact: 120, riskLevel: "HIGH", reasonCode: "OWNER_REQUEST", daysAgoRequested: 40, approver: "seed-approver@example.test", approvedDaysAgo: 30 },
];

// ── FCOs ─────────────────────────────────────────────────────────────────

type DemoFco = {
  fcoNumber: string;
  title: string;
  description: string;
  status: "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "IMPLEMENTED" | "CLOSED" | "LINKED_TO_CVR";
  originType: "FIELD_CONDITION" | "RFI_RESPONSE" | "DESIGN_OMISSION" | "OWNER_DIRECTIVE" | "WEATHER" | "SUBCONTRACTOR" | "OTHER";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  discipline: string;
  cbsCodes: string[];
  estimatedCost: number;
  estimatedHours: number;
  workStopped: boolean;
  initiatedBy: string;
  reasonNarrative: string;
  daysAgoInitiated: number;
  /** When set, links to the matching CVR. The LINKED_TO_CVR status is
   *  applied automatically when present. */
  linkedCvrNumber?: string;
  /** When set, this FCO was promoted from the named RFI (linkedRfiId on FCO). */
  linkedRfiNumber?: string;
};

const DEMO_FCOS: DemoFco[] = [
  { fcoNumber: "FCO-001", title: "Unexpected utility conflict during excavation", description: "Hit unmarked irrigation line at SE corner.", status: "CLOSED", originType: "FIELD_CONDITION", priority: "HIGH", discipline: "civil", cbsCodes: ["111-A"], estimatedCost: 4200, estimatedHours: 24, workStopped: false, initiatedBy: "L. Whitfield (Foreman)", reasonNarrative: "Crew exposed an active irrigation line not shown on civil dwgs.", daysAgoInitiated: 130 },
  { fcoNumber: "FCO-002", title: "Coating spec mismatch on underground pipe", description: "Spec'd coating different from owner's standard.", status: "LINKED_TO_CVR", originType: "DESIGN_OMISSION", priority: "NORMAL", discipline: "piping", cbsCodes: ["611-A"], estimatedCost: 38000, estimatedHours: 160, workStopped: false, initiatedBy: "M. Cruz (PE)", reasonNarrative: "Soil report received post-IFC indicates owner-standard coating required.", daysAgoInitiated: 125, linkedCvrNumber: "CVR-001" },
  { fcoNumber: "FCO-003", title: "Process valve material change request", description: "Process group flagged 4\" gate valve material.", status: "LINKED_TO_CVR", originType: "RFI_RESPONSE", priority: "NORMAL", discipline: "piping", cbsCodes: ["613-A"], estimatedCost: 16000, estimatedHours: 0, workStopped: false, initiatedBy: "K. Olesen (Process Eng)", reasonNarrative: "RFI-042 response specifies SS over CS for these tags.", daysAgoInitiated: 100, linkedCvrNumber: "CVR-002", linkedRfiNumber: "RFI-042" },
  { fcoNumber: "FCO-004", title: "Concrete pour delayed by cold front", description: "Daily report 04-12: temp dropped below 40°F overnight.", status: "IMPLEMENTED", originType: "WEATHER", priority: "NORMAL", discipline: "civil", cbsCodes: ["121-A"], estimatedCost: 7500, estimatedHours: 0, workStopped: false, initiatedBy: "B. Tessmann (Super)", reasonNarrative: "Extended cure required; equipment + cure blankets rental added.", daysAgoInitiated: 40 },
  { fcoNumber: "FCO-005", title: "MCC layout conflict with HVAC duct", description: "MCC location collides with new HVAC main.", status: "IN_REVIEW", originType: "FIELD_CONDITION", priority: "HIGH", discipline: "electric", cbsCodes: ["712-A"], estimatedCost: 12500, estimatedHours: 40, workStopped: false, initiatedBy: "R. Tanaka (Foreman)", reasonNarrative: "Need MCC shifted or HVAC duct rerouted; engineering review pending.", daysAgoInitiated: 12 },
  { fcoNumber: "FCO-006", title: "Sub-supplied pipe support style not approved", description: "Sub showed up with non-spec pipe supports.", status: "IN_REVIEW", originType: "SUBCONTRACTOR", priority: "NORMAL", discipline: "piping", cbsCodes: ["614-A"], estimatedCost: -2500, estimatedHours: 0, workStopped: false, initiatedBy: "J. Park (QC)", reasonNarrative: "Sub claims spec'd type unavailable; proposing alternate.", daysAgoInitiated: 5 },
  { fcoNumber: "FCO-007", title: "Tank Farm soil heave after thaw", description: "Soil heave noted across Tank Farm grade.", status: "DRAFT", originType: "FIELD_CONDITION", priority: "URGENT", discipline: "civil", cbsCodes: ["111-A"], estimatedCost: 28000, estimatedHours: 120, workStopped: true, initiatedBy: "B. Tessmann (Super)", reasonNarrative: "Grade differential >2\" across pad. Holding pour until geotech responds.", daysAgoInitiated: 2 },
  { fcoNumber: "FCO-008", title: "Cable tray damaged in shipping", description: "Section arrived with crushed sidewall.", status: "DRAFT", originType: "OTHER", priority: "NORMAL", discipline: "electric", cbsCodes: ["711-B"], estimatedCost: 5800, estimatedHours: 20, workStopped: false, initiatedBy: "S. Adler (Material Mgr)", reasonNarrative: "Damaged in transit; replacement section ordered.", daysAgoInitiated: 1 },
  { fcoNumber: "FCO-009", title: "Cold-weather welding procedure clarification", description: "Required preheat per WPS not stated for ambient <40°F.", status: "SUBMITTED", originType: "RFI_RESPONSE", priority: "NORMAL", discipline: "piping", cbsCodes: ["615-A"], estimatedCost: 0, estimatedHours: 0, workStopped: false, initiatedBy: "M. Cruz (PE)", reasonNarrative: "RFI generated; awaiting engineer response.", daysAgoInitiated: 7, linkedRfiNumber: "RFI-047" },
  { fcoNumber: "FCO-010", title: "Owner directive: add convenience receptacle", description: "Walk-down request from owner rep.", status: "APPROVED", originType: "OWNER_DIRECTIVE", priority: "LOW", discipline: "electric", cbsCodes: ["713-A"], estimatedCost: 600, estimatedHours: 4, workStopped: false, initiatedBy: "R. Tanaka (Foreman)", reasonNarrative: "Add 120V receptacle near control panel per owner walk-down.", daysAgoInitiated: 18 },
];

// ── RFIs ─────────────────────────────────────────────────────────────────

type DemoRfi = {
  rfiNumber: string;
  subject: string;
  question: string;
  status: "DRAFT" | "OPEN" | "ANSWERED" | "CLOSED" | "SUPERSEDED" | "VOID";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  discipline: string;
  cbsCodes: string[];
  drawingRefs: string[];
  specRefs: string[];
  suspectsCostImpact: boolean;
  suspectsScheduleImpact: boolean;
  initiatedBy: string;
  assignedTo: string;
  daysAgoInitiated: number;
  /**
   * Days after `initiatedAt` the RFI is due. Combined with daysAgoInitiated
   * to compute dueDate, so "initiated 20 days ago, due 10 days after that"
   * means due 10 days ago → past due. Null for drafts without a due date.
   */
  dueOffsetDays: number | null;
  // For ANSWERED / CLOSED entries:
  daysAgoAnswered?: number;
  response?: string;
  answeredBy?: string;
  // For CLOSED entries:
  daysAgoClosed?: number;
};

const DEMO_RFIS: DemoRfi[] = [
  { rfiNumber: "RFI-001", subject: "Verify rebar coverage for pier caps", question: "S-201 detail 2 shows 2\" clear but spec calls for 3\". Which governs for exterior exposure?", status: "DRAFT", priority: "NORMAL", discipline: "civil", cbsCodes: ["121-B"], drawingRefs: ["S-201"], specRefs: ["03 20 00"], suspectsCostImpact: false, suspectsScheduleImpact: false, initiatedBy: "B. Tessmann (Super)", assignedTo: "Structural EOR", daysAgoInitiated: 1, dueOffsetDays: null },
  { rfiNumber: "RFI-042", subject: "Process valve material clarification", question: "Is 4\" carbon steel acceptable for the slurry-service tags, or is stainless required?", status: "CLOSED", priority: "NORMAL", discipline: "piping", cbsCodes: ["613-A"], drawingRefs: ["P-301", "P-302"], specRefs: ["15 05 13"], suspectsCostImpact: true, suspectsScheduleImpact: false, initiatedBy: "K. Olesen (Process Eng)", assignedTo: "Process EOR", daysAgoInitiated: 110, dueOffsetDays: 14, daysAgoAnswered: 102, response: "All slurry-service 4\" valves must be 316 SS; revised valve list attached.", answeredBy: "process-eor@firm.example", daysAgoClosed: 98 },
  { rfiNumber: "RFI-047", subject: "Cold-weather welding preheat requirement", question: "WPS-301 doesn't specify preheat below 40°F ambient. Confirm preheat / interpass requirements.", status: "ANSWERED", priority: "NORMAL", discipline: "piping", cbsCodes: ["615-A"], drawingRefs: [], specRefs: ["WPS-301"], suspectsCostImpact: false, suspectsScheduleImpact: true, initiatedBy: "M. Cruz (PE)", assignedTo: "Welding Engineer", daysAgoInitiated: 12, dueOffsetDays: 7, daysAgoAnswered: 5, response: "Preheat to 100°F minimum for ambient <40°F; maintain interpass 60–150°F. See WPS supplement.", answeredBy: "weld-eng@firm.example" },
  { rfiNumber: "RFI-051", subject: "Allowable ambient temp for cure blankets", question: "What ambient temp threshold removes the cure-blanket requirement under spec 03 30 00?", status: "CLOSED", priority: "LOW", discipline: "civil", cbsCodes: ["121-A"], drawingRefs: [], specRefs: ["03 30 00"], suspectsCostImpact: false, suspectsScheduleImpact: false, initiatedBy: "B. Tessmann (Super)", assignedTo: "Concrete Engineer", daysAgoInitiated: 42, dueOffsetDays: 5, daysAgoAnswered: 39, response: "Blankets are not required above 50°F sustained ambient with normal-set mix.", answeredBy: "concrete-eng@firm.example", daysAgoClosed: 37 },
  { rfiNumber: "RFI-056", subject: "MCC clearance conflict with HVAC main", question: "Per FCO-005, MCC location conflicts with revised HVAC main routing. Reroute MCC or HVAC?", status: "OPEN", priority: "HIGH", discipline: "electric", cbsCodes: ["712-A"], drawingRefs: ["E-401", "M-201"], specRefs: [], suspectsCostImpact: true, suspectsScheduleImpact: true, initiatedBy: "R. Tanaka (Foreman)", assignedTo: "MEP Coordination", daysAgoInitiated: 20, dueOffsetDays: 10 },
  { rfiNumber: "RFI-058", subject: "Coating spec — owner standard vs IFC drawings", question: "Owner-standard coating doc references System B; IFC drawings still call System A. Which governs?", status: "OPEN", priority: "NORMAL", discipline: "piping", cbsCodes: ["611-A"], drawingRefs: ["P-101"], specRefs: ["09 96 00"], suspectsCostImpact: true, suspectsScheduleImpact: false, initiatedBy: "M. Cruz (PE)", assignedTo: "Project Owner Rep", daysAgoInitiated: 6, dueOffsetDays: 14 },
  { rfiNumber: "RFI-061", subject: "Conduit fill recalc for revised Panel LP-3 loads", question: "Connected loads on Panel LP-3 increased ~15%. Verify conduit fill on feeders remains <40%.", status: "OPEN", priority: "NORMAL", discipline: "electric", cbsCodes: ["711-A"], drawingRefs: ["E-512"], specRefs: [], suspectsCostImpact: false, suspectsScheduleImpact: false, initiatedBy: "R. Tanaka (Foreman)", assignedTo: "Electrical EOR", daysAgoInitiated: 3, dueOffsetDays: 10 },
  { rfiNumber: "RFI-063", subject: "Anchor bolt embedment vs tank pad rebar", question: "Anchor bolt pattern on S-110 interferes with mat-foundation rebar layout on S-111. Confirm or revise pattern.", status: "OPEN", priority: "URGENT", discipline: "civil", cbsCodes: ["121-A"], drawingRefs: ["S-110", "S-111"], specRefs: [], suspectsCostImpact: false, suspectsScheduleImpact: true, initiatedBy: "B. Tessmann (Super)", assignedTo: "Structural EOR", daysAgoInitiated: 8, dueOffsetDays: 3 },
  { rfiNumber: "RFI-065", subject: "Pipe support spacing for SS 4\" lines", question: "Hanger spacing was set for CS; with switch to SS schedule 10, does the spacing change?", status: "ANSWERED", priority: "NORMAL", discipline: "piping", cbsCodes: ["614-A"], drawingRefs: ["P-401"], specRefs: [], suspectsCostImpact: false, suspectsScheduleImpact: false, initiatedBy: "J. Park (QC)", assignedTo: "Piping Stress", daysAgoInitiated: 9, dueOffsetDays: 7, daysAgoAnswered: 2, response: "SS schedule 10 — max 8'-0\" hanger spacing for 4\" line, sketch SK-PS-04 attached.", answeredBy: "piping-stress@firm.example" },
  { rfiNumber: "RFI-067", subject: "Cable tray type in Class I Div 2 area", question: "Ladder or solid-bottom tray in the classified area at TK-201 manifold?", status: "CLOSED", priority: "LOW", discipline: "electric", cbsCodes: ["711-B"], drawingRefs: ["E-201"], specRefs: ["26 05 36"], suspectsCostImpact: false, suspectsScheduleImpact: false, initiatedBy: "R. Tanaka (Foreman)", assignedTo: "Electrical EOR", daysAgoInitiated: 25, dueOffsetDays: 7, daysAgoAnswered: 18, response: "Solid-bottom tray required in Class I Div 2 per NEC 392.10(B)(1).", answeredBy: "electrical-eor@firm.example", daysAgoClosed: 15 },
];

// ── Trends ───────────────────────────────────────────────────────────────

type DemoTrend = {
  trendNumber: string;
  title: string;
  description: string;
  status: "IDENTIFIED" | "PROBABLE" | "CONVERTED" | "REJECTED" | "VOID";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  discipline: string;
  cbsCodes: string[];
  /** 0..1. Drives the AFC weight. */
  probability: number;
  costLow: number;
  costLikely: number;
  costHigh: number;
  scheduleDaysImpact: number;
  reasonNarrative: string;
  notes: string;
  daysAgoIdentified: number;
  /** Days after identifiedAt the trend is due. Null for trends without a deadline. */
  neededByOffsetDays: number | null;
  /** Days ago the trend reached a terminal state (CONVERTED / REJECTED / VOID).
   *  Required for terminal statuses; ignored for active ones. */
  daysAgoClosed?: number;
  /** Optional cross-links — names; resolved to IDs at seed time so order of
   *  insertion doesn't matter and missing references log a warning. */
  linkedRfiNumber?: string;
  linkedFcoNumber?: string;
  /** Only meaningful for status=CONVERTED (the CVR raised from this trend). */
  linkedCvrNumber?: string;
  initiatedBy: string;
};

/**
 * Ten trends shaped to exercise the full AFC story:
 *   - active trends (IDENTIFIED + PROBABLE) across three disciplines so the
 *     pending-trend column shows up on multiple reporting buckets
 *   - several linked to in-flight RFIs / FCOs so the dialog's cross-link
 *     panel renders the connection
 *   - one CONVERTED trend pointing at CVR-006, demonstrating the closed
 *     loop (trend → CVR; no longer counted toward AFC because its cost is
 *     already in budgetRevisions)
 *   - one REJECTED + one VOID for filter / badge coverage
 */
const DEMO_TRENDS: DemoTrend[] = [
  {
    trendNumber: "TR-001",
    title: "Piping productivity drift on field welds",
    description: "Field welds running ~12% over baseline hours per joint in PHA.",
    status: "PROBABLE",
    priority: "HIGH",
    discipline: "piping",
    cbsCodes: ["615-A"],
    probability: 0.7,
    costLow: 18000,
    costLikely: 35000,
    costHigh: 55000,
    scheduleDaysImpact: 0,
    reasonNarrative:
      "PF on 4\" and 6\" CS field welds tracking 1.12 across last 3 daily reports. Crew is new to this rig — productivity may recover, but worth booking the exposure.",
    notes: "Watch through next reporting period before pushing to PROBABLE on the CVR side.",
    daysAgoIdentified: 22,
    neededByOffsetDays: 30,
    initiatedBy: "M. Cruz (PE)",
  },
  {
    trendNumber: "TR-002",
    title: "Owner-driven coating system change",
    description: "Owner-standard coating doc references System B; IFC drawings call System A.",
    status: "PROBABLE",
    priority: "HIGH",
    discipline: "piping",
    cbsCodes: ["611-A"],
    probability: 0.8,
    costLow: 55000,
    costLikely: 80000,
    costHigh: 110000,
    scheduleDaysImpact: 5,
    reasonNarrative:
      "If owner enforces System B (likely, per their walk-down) we re-bid coatings on the entire UG pipe run. Cost band sized off vendor budgetary quote.",
    notes: "Tracking RFI-058 response. Will likely convert to CVR within the next 2 weeks.",
    daysAgoIdentified: 6,
    neededByOffsetDays: 14,
    linkedRfiNumber: "RFI-058",
    initiatedBy: "M. Cruz (PE)",
  },
  {
    trendNumber: "TR-003",
    title: "MCC/HVAC re-route — cost band wider than FCO estimate",
    description: "FCO-005 carries $12.5k; PM thinks the true number is closer to $30k after MEP coordination.",
    status: "PROBABLE",
    priority: "HIGH",
    discipline: "electric",
    cbsCodes: ["712-A"],
    probability: 0.9,
    costLow: 22000,
    costLikely: 32000,
    costHigh: 48000,
    scheduleDaysImpact: 7,
    reasonNarrative:
      "FCO-005 sized the field cost of moving the MCC bucket alone. The engineering rework + extended cable pulls were not in the FCO estimate. AFC should carry the higher number until engineering responds to RFI-056.",
    notes: "When the FCO is approved, the CVR will likely come in at this trend's likely band, not the FCO's.",
    daysAgoIdentified: 11,
    neededByOffsetDays: 21,
    linkedFcoNumber: "FCO-005",
    linkedRfiNumber: "RFI-056",
    initiatedBy: "R. Tanaka (Foreman)",
  },
  {
    trendNumber: "TR-004",
    title: "Cold-weather welding preheat premium",
    description: "WPS supplement requires 100°F preheat — added labor + propane.",
    status: "IDENTIFIED",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: ["615-A"],
    probability: 0.4,
    costLow: 8000,
    costLikely: 22000,
    costHigh: 40000,
    scheduleDaysImpact: 3,
    reasonNarrative:
      "Per RFI-047 response, preheat is required for all ambient <40°F welding. Cost band depends on how many of the remaining welds fall in cold-weather windows.",
    notes: "Sub may absorb part of this; not pushing to PROBABLE until we have field counts.",
    daysAgoIdentified: 5,
    neededByOffsetDays: 30,
    linkedRfiNumber: "RFI-047",
    initiatedBy: "B. Tessmann (Super)",
  },
  {
    trendNumber: "TR-005",
    title: "Tank Farm soil heave — remediation",
    description: "Grade differential after thaw may require partial sub-grade rework.",
    status: "PROBABLE",
    priority: "URGENT",
    discipline: "civil",
    cbsCodes: ["111-A"],
    probability: 0.75,
    costLow: 28000,
    costLikely: 55000,
    costHigh: 95000,
    scheduleDaysImpact: 10,
    reasonNarrative:
      "Cost depends on geotech recommendation. Likely band assumes partial recompaction + targeted excavation. High band assumes full sub-grade replacement.",
    notes: "Work-stopped on FCO-007 until geotech responds.",
    daysAgoIdentified: 2,
    neededByOffsetDays: 7,
    linkedFcoNumber: "FCO-007",
    initiatedBy: "B. Tessmann (Super)",
  },
  {
    trendNumber: "TR-006",
    title: "Anchor bolt / rebar conflict redesign",
    description: "Pattern on S-110 interferes with mat-foundation rebar on S-111.",
    status: "IDENTIFIED",
    priority: "HIGH",
    discipline: "civil",
    cbsCodes: ["121-A"],
    probability: 0.5,
    costLow: 6000,
    costLikely: 18000,
    costHigh: 35000,
    scheduleDaysImpact: 4,
    reasonNarrative:
      "Pending structural EOR response (RFI-063). If they revise the pattern we eat field rework on partial anchor sets already cast.",
    notes: "",
    daysAgoIdentified: 8,
    neededByOffsetDays: 10,
    linkedRfiNumber: "RFI-063",
    initiatedBy: "B. Tessmann (Super)",
  },
  {
    trendNumber: "TR-007",
    title: "Schedule recovery overtime — Q2",
    description: "Overtime to recover ~10 days of cumulative weather/RFI slip.",
    status: "IDENTIFIED",
    priority: "NORMAL",
    discipline: "piping",
    cbsCodes: ["619-A"],
    probability: 0.3,
    costLow: 15000,
    costLikely: 30000,
    costHigh: 65000,
    scheduleDaysImpact: -10,
    reasonNarrative:
      "Not yet committed. PM's view: if mech-complete slips past mid-July, we'll fund a 6-week OT push. Owner has signaled willingness to share.",
    notes: "Booked at 30% — not a high-conviction trend yet.",
    daysAgoIdentified: 15,
    neededByOffsetDays: 45,
    initiatedBy: "L. Whitfield (Foreman)",
  },
  {
    trendNumber: "TR-008",
    title: "Imported MCC equipment tariff escalation",
    description: "Vendor flagged potential tariff bump on Q2 shipment.",
    status: "PROBABLE",
    priority: "NORMAL",
    discipline: "electric",
    cbsCodes: ["712-A"],
    probability: 0.6,
    costLow: 12000,
    costLikely: 25000,
    costHigh: 42000,
    scheduleDaysImpact: 0,
    reasonNarrative:
      "Vendor's PO carries an escalation clause keyed to HTS code 8537. Trade rules in flux; likely band reflects 8% escalation on remaining $312k of MCC equipment.",
    notes: "Not a field event — pure procurement risk. PM-logged.",
    daysAgoIdentified: 18,
    neededByOffsetDays: 60,
    initiatedBy: "S. Adler (Material Mgr)",
  },
  {
    trendNumber: "TR-009",
    title: "Concrete cure-time extension (converted)",
    description: "Cold-weather concreting extended cure — promoted to CVR-006.",
    status: "CONVERTED",
    priority: "NORMAL",
    discipline: "civil",
    cbsCodes: ["121-A"],
    probability: 1.0,
    costLow: 6000,
    costLikely: 8200,
    costHigh: 12000,
    scheduleDaysImpact: 7,
    reasonNarrative:
      "Originally identified as a trend; promoted to CVR-006 once the schedule slip was confirmed.",
    notes: "Closed-loop example: trend → CVR. AFC no longer counts it; the CVR carries the cost in currentBudget.",
    daysAgoIdentified: 42,
    neededByOffsetDays: 14,
    daysAgoClosed: 30,
    linkedCvrNumber: "CVR-006",
    initiatedBy: "B. Tessmann (Super)",
  },
  {
    trendNumber: "TR-010",
    title: "Owner-requested spare parts package",
    description: "Trend that owner subsequently withdrew during budget review.",
    status: "REJECTED",
    priority: "LOW",
    discipline: "electric",
    cbsCodes: ["712-A"],
    probability: 0.5,
    costLow: 18000,
    costLikely: 28000,
    costHigh: 45000,
    scheduleDaysImpact: 0,
    reasonNarrative:
      "Owner asked for a spare-parts package during March walk-down; pulled it at the April finance review.",
    notes: "Kept for traceability — useful when the owner re-asks in 6 months.",
    daysAgoIdentified: 55,
    neededByOffsetDays: 30,
    daysAgoClosed: 25,
    initiatedBy: "K. Olesen (Process Eng)",
  },
];

// ── reporting period definitions ─────────────────────────────────────────

type DemoPeriod = {
  label: string;
  /** Calendar period end (data date). */
  dataDate: Date;
  /** % complete per bucket. Drives EV. */
  pctByBucket: Record<string, number>;
  /** $ actually incurred per bucket through dataDate. Drives AC. */
  acByBucket: Record<string, number>;
};

/**
 * Five monthly cutoffs through May 2026 with a deliberately mixed picture:
 * civil (bucket "1") runs slightly over; electric (bucket "7") is slightly
 * under; piping (bucket "6") is right on. CPI lands just below 1.0.
 */
function demoPeriods(bacByBucket: Record<string, number>): DemoPeriod[] {
  // Progress fractions for each period across the three live buckets.
  const progress: Array<Record<string, number>> = [
    { "1": 0.10, "6": 0.05, "7": 0.06 }, // Jan 31
    { "1": 0.24, "6": 0.14, "7": 0.16 }, // Feb 28
    { "1": 0.42, "6": 0.27, "7": 0.30 }, // Mar 31
    { "1": 0.60, "6": 0.43, "7": 0.46 }, // Apr 30
    { "1": 0.75, "6": 0.58, "7": 0.62 }, // May 31
  ];
  // Cost multipliers per bucket — civil 1.10× (over), piping 1.00×, electric 0.93× (under).
  const costFactor: Record<string, number> = { "1": 1.1, "6": 1.0, "7": 0.93 };

  const dates = [
    new Date("2026-01-31"),
    new Date("2026-02-28"),
    new Date("2026-03-31"),
    new Date("2026-04-30"),
    new Date("2026-05-31"),
  ];
  const labels = ["January 2026", "February 2026", "March 2026", "April 2026", "May 2026"];

  return progress.map((pct, i) => {
    const acByBucket: Record<string, number> = {};
    for (const [bucket, p] of Object.entries(pct)) {
      const bac = bacByBucket[bucket] ?? 0;
      acByBucket[bucket] = Math.round(bac * p * (costFactor[bucket] ?? 1));
    }
    return {
      label: labels[i],
      dataDate: dates[i],
      pctByBucket: pct,
      acByBucket,
    };
  });
}

// ── orchestration ────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function seedDemoData() {
  console.log("\nSeeding demo data for project", DEMO_PROJECT_ID);

  // 1. Users — upsert so re-runs don't collide. Real Clerk-backed accounts
  //    are unaffected because the demo ids start with `seed-test-`.
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { clerkId: u.clerkId },
      create: u,
      update: { email: u.email, role: u.role },
    });
  }
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { clerkId: "seed-test-admin" },
    select: { id: true, email: true },
  });
  const approverUser = await prisma.user.findUniqueOrThrow({
    where: { clerkId: "seed-test-approver" },
    select: { id: true, email: true },
  });
  console.log(`  Upserted ${DEMO_USERS.length} demo users`);

  // 2. Project — set schedule dates, grant the demo users access, and
  //    connect every CBS item to the project's `allowedFefCbsItems` set.
  //    The Sidebar filters discipline links by which L1 codes the project
  //    has access to (set on the Setup page); without this, the demo
  //    disciplines appear in the Summary numbers but their take-off / FEF
  //    pages aren't reachable from the left nav.
  const allCbsItems = await prisma.cbsItem.findMany({ select: { id: true } });
  await prisma.project.update({
    where: { id: DEMO_PROJECT_ID },
    data: {
      startDate: DEMO_PROJECT_START,
      endDate: DEMO_PROJECT_END,
      users: { connect: [{ id: adminUser.id }, { id: approverUser.id }] },
      allowedFefCbsItems: { set: allCbsItems.map((c) => ({ id: c.id })) },
    },
  });
  console.log(`  Allowed ${allCbsItems.length} CBS items on demo project`);

  // 3. Subcontractors — upsert by displayId, link to demo project.
  for (const s of DEMO_SUBCONTRACTORS) {
    await prisma.subcontractor.upsert({
      where: { displayId: s.displayId },
      create: {
        ...s,
        projects: { connect: [{ id: DEMO_PROJECT_ID }] },
      },
      update: {
        name: s.name,
        description: s.description,
        disciplines: s.disciplines,
        projects: { connect: [{ id: DEMO_PROJECT_ID }] },
      },
    });
  }
  console.log(`  Upserted ${DEMO_SUBCONTRACTORS.length} subcontractors`);

  // 4. Areas. Project cascade already wiped any prior demo areas.
  const areas = await Promise.all(
    DEMO_AREAS.map((a) =>
      prisma.area.create({
        data: { projectId: DEMO_PROJECT_ID, ...a },
      }),
    ),
  );
  console.log(`  Created ${areas.length} areas`);

  // 5. Basis inputs for the demo project.
  await prisma.basisInputs.upsert({
    where: { projectId: DEMO_PROJECT_ID },
    create: {
      projectId: DEMO_PROJECT_ID,
      estimateFactor: "1.08",
      compositeLaborRate: "92.50",
      milestones: [
        { label: "Mobilization", date: "2026-01-15" },
        { label: "Foundations complete", date: "2026-03-31" },
        { label: "Mechanical complete", date: "2026-07-31" },
        { label: "Pre-commissioning", date: "2026-10-15" },
        { label: "Substantial completion", date: "2026-12-15" },
      ],
    },
    update: {
      estimateFactor: "1.08",
      compositeLaborRate: "92.50",
    },
  });

  // 6. FEF rows — round-robin area assignment so each area has data.
  const takeOffs = takeOffTemplates();
  const supportLabors = supportLaborTemplates();
  const materials = materialsTemplates();
  const allFefRows: Prisma.FefRowCreateManyInput[] = [];
  const blankFields = {
    description: "",
    shopField: "",
    weldGroupDescription: "",
    size: "",
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    taskCode: "",
    materialCost: "",
    equipment: "",
    notes: "",
    sub: "",
  };

  // Group by (discipline, section) so positions stay sequential per group —
  // required by the (projectId, discipline, section, position) unique index.
  const positionCursors = new Map<string, number>();
  const nextPos = (key: string) => {
    const p = positionCursors.get(key) ?? 0;
    positionCursors.set(key, p + 1);
    return p;
  };

  takeOffs.forEach((t, i) => {
    const key = `${t.discipline}|TAKE_OFF`;
    allFefRows.push({
      projectId: DEMO_PROJECT_ID,
      discipline: t.discipline,
      section: "TAKE_OFF",
      position: nextPos(key),
      cbsCode: t.cbsCode,
      name: t.name,
      quantity: t.quantity,
      unit: t.unit,
      laborHours: t.laborHours,
      laborRate: t.laborRate,
      area: String(areas[i % areas.length].id),
      ...blankFields,
    });
  });
  supportLabors.forEach((s, i) => {
    const key = `${s.discipline}|SUPPORT_LABOR`;
    allFefRows.push({
      projectId: DEMO_PROJECT_ID,
      discipline: s.discipline,
      section: "SUPPORT_LABOR",
      position: nextPos(key),
      cbsCode: s.cbsCode,
      name: s.name,
      laborHours: s.laborHours,
      laborRate: s.laborRate,
      area: String(areas[i % areas.length].id),
      quantity: "",
      unit: "",
      ...blankFields,
    });
  });
  materials.forEach((m, i) => {
    const key = `${m.discipline}|MATERIALS`;
    allFefRows.push({
      projectId: DEMO_PROJECT_ID,
      discipline: m.discipline,
      section: "MATERIALS",
      position: nextPos(key),
      cbsCode: m.cbsCode,
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
      materialCost: m.materialCost,
      area: String(areas[i % areas.length].id),
      laborHours: "",
      laborRate: "",
      description: "",
      shopField: "",
      weldGroupDescription: "",
      size: "",
      metallurgyCode: "",
      boreSize: "",
      role: "",
      schedule: "",
      taskCode: "",
      equipment: "",
      notes: "",
      sub: "",
    });
  });

  await prisma.fefRow.createMany({ data: allFefRows });
  console.log(`  Created ${allFefRows.length} FEF rows`);

  // 7. Compute baseline totals from the rows we just inserted — same shape
  //    `accumulateProjectTotals` consumes via SNAPSHOT_ROW_SELECT.
  const baselineRows: ProjectTotalsRow[] = allFefRows.map((r) => ({
    discipline: r.discipline,
    section: r.section as string,
    cbsCode: r.cbsCode ?? "",
    area: r.area,
    name: r.name,
    description: r.description,
    shopField: r.shopField,
    weldGroupDescription: r.weldGroupDescription,
    quantity: r.quantity ?? "",
    size: r.size,
    unit: r.unit ?? "",
    metallurgyCode: r.metallurgyCode,
    boreSize: r.boreSize,
    role: r.role,
    schedule: r.schedule,
    taskCode: r.taskCode,
    laborHours: r.laborHours ?? "",
    laborRate: r.laborRate ?? "",
    materialCost: r.materialCost ?? "",
    equipment: r.equipment,
    notes: r.notes,
    sub: r.sub,
  }));
  const baselineTotals = accumulateProjectTotals(baselineRows);

  // 8. CVRs.
  const cvrIdByNumber = new Map<string, number>();
  for (const c of DEMO_CVRS) {
    const requestedAt = daysAgo(c.daysAgoRequested);
    const cvr = await prisma.changeLog.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        cvrNumber: c.cvrNumber,
        title: c.title,
        description: c.description,
        status: c.status,
        type: c.type,
        discipline: c.discipline,
        cbsCodes: c.cbsCodes,
        originator: approverUser.email,
        costImpact: c.costImpact,
        scheduleDaysImpact: c.scheduleDaysImpact,
        laborHoursImpact: c.laborHoursImpact,
        riskLevel: c.riskLevel,
        reasonCode: c.reasonCode,
        requestedAt,
        approver: c.approver ?? "",
        approvedAt: c.approvedDaysAgo ? daysAgo(c.approvedDaysAgo) : null,
        area: String(areas[cvrIdByNumber.size % areas.length].id),
        createdById: approverUser.id,
      },
    });
    cvrIdByNumber.set(c.cvrNumber, cvr.id);
  }
  console.log(`  Created ${DEMO_CVRS.length} CVRs`);

  // 8.5. RFIs — must precede FCOs so promoted FCOs can resolve linkedRfiId.
  const rfiIdByNumber = new Map<string, number>();
  for (let i = 0; i < DEMO_RFIS.length; i++) {
    const r = DEMO_RFIS[i];
    const initiatedAt = daysAgo(r.daysAgoInitiated);
    const dueDate =
      r.dueOffsetDays !== null
        ? new Date(initiatedAt.getTime() + r.dueOffsetDays * 24 * 60 * 60 * 1000)
        : null;
    const rfi = await prisma.rfi.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        rfiNumber: r.rfiNumber,
        subject: r.subject,
        question: r.question,
        status: r.status,
        priority: r.priority,
        discipline: r.discipline,
        cbsCodes: r.cbsCodes,
        locationArea: String(areas[i % areas.length].id),
        drawingRefs: r.drawingRefs,
        specRefs: r.specRefs,
        suspectsCostImpact: r.suspectsCostImpact,
        suspectsScheduleImpact: r.suspectsScheduleImpact,
        initiatedBy: r.initiatedBy,
        assignedTo: r.assignedTo,
        dueDate,
        initiatedAt,
        response: r.response ?? "",
        answeredBy: r.answeredBy ?? "",
        answeredAt:
          r.daysAgoAnswered !== undefined ? daysAgo(r.daysAgoAnswered) : null,
        closedAt:
          r.daysAgoClosed !== undefined ? daysAgo(r.daysAgoClosed) : null,
        createdById: adminUser.id,
      },
    });
    rfiIdByNumber.set(r.rfiNumber, rfi.id);
  }
  console.log(`  Created ${DEMO_RFIS.length} RFIs`);

  // 9. FCOs — link those that target a specific CVR and/or RFI. The ids are
  //    captured into `fcoIdByNumber` so Trend rows (next step) can resolve
  //    `linkedFcoNumber` → linkedFcoId without re-querying.
  const fcoIdByNumber = new Map<string, number>();
  for (let i = 0; i < DEMO_FCOS.length; i++) {
    const f = DEMO_FCOS[i];
    const linkedCvrId = f.linkedCvrNumber
      ? (cvrIdByNumber.get(f.linkedCvrNumber) ?? null)
      : null;
    const linkedRfiId = f.linkedRfiNumber
      ? (rfiIdByNumber.get(f.linkedRfiNumber) ?? null)
      : null;
    const fco = await prisma.fieldChangeOrder.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        fcoNumber: f.fcoNumber,
        title: f.title,
        description: f.description,
        status: f.status,
        originType: f.originType,
        priority: f.priority,
        discipline: f.discipline,
        cbsCodes: f.cbsCodes,
        locationArea: String(areas[i % areas.length].id),
        initiatedBy: f.initiatedBy,
        estimatedCost: f.estimatedCost,
        estimatedHours: f.estimatedHours,
        workStopped: f.workStopped,
        reasonNarrative: f.reasonNarrative,
        initiatedAt: daysAgo(f.daysAgoInitiated),
        linkedCvrId,
        linkedRfiId,
        createdById: adminUser.id,
      },
    });
    fcoIdByNumber.set(f.fcoNumber, fco.id);
  }
  console.log(`  Created ${DEMO_FCOS.length} FCOs`);

  // 9.5. Trends. Created after CVR/RFI/FCO so cross-links resolve. AFC math
  //      reads these live on every period fetch — no measurements to seed.
  for (let i = 0; i < DEMO_TRENDS.length; i++) {
    const t = DEMO_TRENDS[i];
    const identifiedAt = daysAgo(t.daysAgoIdentified);
    const neededBy =
      t.neededByOffsetDays !== null
        ? new Date(identifiedAt.getTime() + t.neededByOffsetDays * 86_400_000)
        : null;
    const closedAt =
      t.daysAgoClosed !== undefined ? daysAgo(t.daysAgoClosed) : null;
    const linkedRfiId = t.linkedRfiNumber
      ? (rfiIdByNumber.get(t.linkedRfiNumber) ?? null)
      : null;
    const linkedFcoId = t.linkedFcoNumber
      ? (fcoIdByNumber.get(t.linkedFcoNumber) ?? null)
      : null;
    const linkedCvrId = t.linkedCvrNumber
      ? (cvrIdByNumber.get(t.linkedCvrNumber) ?? null)
      : null;
    if (t.linkedRfiNumber && linkedRfiId === null) {
      console.warn(`  Trend ${t.trendNumber}: linkedRfiNumber "${t.linkedRfiNumber}" did not resolve`);
    }
    if (t.linkedFcoNumber && linkedFcoId === null) {
      console.warn(`  Trend ${t.trendNumber}: linkedFcoNumber "${t.linkedFcoNumber}" did not resolve`);
    }
    if (t.linkedCvrNumber && linkedCvrId === null) {
      console.warn(`  Trend ${t.trendNumber}: linkedCvrNumber "${t.linkedCvrNumber}" did not resolve`);
    }
    await prisma.trend.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        trendNumber: t.trendNumber,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        discipline: t.discipline,
        cbsCodes: t.cbsCodes,
        locationArea: String(areas[i % areas.length].id),
        probability: t.probability,
        costLow: t.costLow,
        costLikely: t.costLikely,
        costHigh: t.costHigh,
        scheduleDaysImpact: t.scheduleDaysImpact,
        reasonNarrative: t.reasonNarrative,
        notes: t.notes,
        identifiedAt,
        neededBy,
        closedAt,
        linkedRfiId,
        linkedFcoId,
        linkedCvrId,
        initiatedBy: t.initiatedBy,
        createdById: approverUser.id,
      },
    });
  }
  console.log(`  Created ${DEMO_TRENDS.length} Trends`);

  // 10. Baseline snapshot — also stamps the cached `totals` so the
  //     dashboard EVM card and S-curve don't hit the legacy fallback path.
  const snapshot = await prisma.estimateSnapshot.create({
    data: {
      projectId: DEMO_PROJECT_ID,
      label: "As-bid 2026-01-15",
      notes: "Baseline submitted to owner for review on 2026-01-15.",
      fefRows: baselineRows as unknown as object,
      basisInputs: {
        estimateFactor: "1.08",
        compositeLaborRate: "92.50",
        milestones: [],
      } as unknown as object,
      totals: baselineTotals as unknown as object,
      rowCount: baselineRows.length,
      createdById: adminUser.id,
      createdAt: new Date("2026-01-15"),
    },
  });
  console.log(`  Created baseline snapshot id=${snapshot.id} (${snapshot.label})`);

  // 11. Reporting periods + per-bucket measurements driving the S-curve.
  const bacByBucket: Record<string, number> = {};
  for (const b of new Set([
    ...Object.keys(baselineTotals.laborByDigit),
    ...Object.keys(baselineTotals.materialsByDigit),
  ])) {
    bacByBucket[b] =
      (baselineTotals.laborByDigit[b] ?? 0) +
      (baselineTotals.materialsByDigit[b] ?? 0);
  }
  const periods = demoPeriods(bacByBucket);

  for (const pd of periods) {
    const period = await prisma.reportingPeriod.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        label: pd.label,
        dataDate: pd.dataDate,
        baselineSnapshotId: snapshot.id,
        createdById: adminUser.id,
        createdAt: pd.dataDate, // pretend the period was created at its data date
      },
    });
    const measurementRows = Object.keys(pd.pctByBucket).map((bucket) => ({
      periodId: period.id,
      bucket,
      percentComplete: pd.pctByBucket[bucket],
      actualCost: pd.acByBucket[bucket],
      plannedValueOverride: null,
      notes: "",
    }));
    await prisma.periodMeasurement.createMany({ data: measurementRows });
  }
  console.log(`  Created ${periods.length} reporting periods (with measurements)`);

  console.log("\nDemo data seed complete.\n");
  console.log("  Sign in (using a real Clerk-managed account) and select");
  console.log("  project 1 (1901 - FIME Engineering) to see the populated app.");
}

async function main() {
  await seedBaseData();
  await seedDemoData();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
