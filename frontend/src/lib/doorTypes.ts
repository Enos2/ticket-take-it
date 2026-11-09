// ==========================================
// FILE: frontend/src/lib/doorTypes.ts
// PURPOSE: Types and API calls for the door team: scanning tickets, gates, door staff and live attendance.
// ==========================================
import { api } from "./api";

// ---- scanning ----

// What the server says about a scanned code.
export type ScanStatus = "valid" | "already_used" | "invalid" | "wrong_event";

export interface ScanResult {
  status: ScanStatus;
  holderName?: string;
  tierName?: string;
  checkedInAt?: string; // set when the ticket was already used
  gate?: string | null; // the gate it was used at
}

// An event the signed-in person may scan for (as door staff or as the organiser).
export interface DoorEvent {
  id: string;
  title: string;
  startsAt: string;
  gates: string[];
}

// ---- door team ----

export interface DoorMember {
  id: string;
  name: string | null;
  email: string;
}

export interface EventDoorStaff extends DoorMember {
  gate: string | null; // null means any gate
}

export interface EventDoorConfig {
  gates: string[];
  staff: EventDoorStaff[];
}

// ---- live attendance ----

export interface LiveAttendanceData {
  eventTitle: string;
  checkedIn: number;
  total: number;
  byGate: { gate: string | null; count: number }[];
  recent: { id: string; holderName: string; tierName: string; checkedInAt: string; gate: string | null }[];
}

export const NO_GATE_LABEL = "No gate";

// Every door endpoint is here, so they are easy to match to the backend.
export const doorApi = {
  // scanner
  events: () => api.get<DoorEvent[]>("/door/events"),
  scan: (body: { code: string; eventId: string; gate: string | null }) => api.post<ScanResult>("/door/scan", body),
  live: (eventId: string) => api.get<LiveAttendanceData>(`/door/events/${eventId}/live`),

  // an organiser's door team
  team: () => api.get<DoorMember[]>("/seller/door-team"),
  addMember: (email: string) => api.post<DoorMember>("/seller/door-team", { email }),
  removeMember: (id: string) => api.delete(`/seller/door-team/${id}`),

  // door setup for one event
  eventDoor: (eventId: string) => api.get<EventDoorConfig>(`/seller/events/${eventId}/door`),
  saveGates: (eventId: string, gates: string[]) => api.patch(`/seller/events/${eventId}/door/gates`, { gates }),
  assignStaff: (eventId: string, staffId: string, gate: string | null) =>
    api.post(`/seller/events/${eventId}/door/staff`, { staffId, gate }),
  unassignStaff: (eventId: string, staffId: string) => api.delete(`/seller/events/${eventId}/door/staff/${staffId}`),
};
// ==========================================
// END OF FILE: frontend/src/lib/doorTypes.ts
// ==========================================