// ==========================================
// FILE: frontend/src/lib/engagementTypes.ts
// PURPOSE: Types for organiser pages, followed organisers and email settings.
// ==========================================
export interface Organizer {
  id: string;
  businessName: string;
  memberSince: string;
  followers: number;
  upcomingEvents: number;
  hostedEvents: number;
}

export interface FollowedOrganizer {
  id: string;
  businessName: string;
  followers: number;
  upcomingEvents: number;
}

export interface NotificationPrefs {
  notifyReminders: boolean;
  notifyNewEvents: boolean;
}
// ==========================================
// END OF FILE: frontend/src/lib/engagementTypes.ts
// ==========================================