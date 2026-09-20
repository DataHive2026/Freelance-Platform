/**
 * Every meeting provider (Zoom now, per Section 13 — "keep this behind
 * a service abstraction so another provider can be added later")
 * implements this interface. MeetingService only ever talks to this
 * interface, never a provider SDK directly.
 */
export interface MeetingProviderAdapter {
  createMeeting(input: {
    topic: string;
    startTime: string; // ISO 8601
    durationMinutes: number;
  }): Promise<{ providerMeetingId: string; joinUrl: string }>;

  cancelMeeting(providerMeetingId: string): Promise<void>;
}
