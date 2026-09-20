import type { MeetingProviderAdapter } from "./provider";

/**
 * Used automatically when Zoom credentials aren't set (see getProvider()
 * in index.ts). Every call is console-logged so a "scheduled meeting"
 * during local development is never mistaken for a real Zoom meeting —
 * the join URL it returns doesn't go anywhere real.
 */
export class MockMeetingProvider implements MeetingProviderAdapter {
  async createMeeting(input: { topic: string; startTime: string; durationMinutes: number }) {
    console.warn(`[MockMeetingProvider] Creating a FAKE Zoom meeting: "${input.topic}" at ${input.startTime}.`);
    const fakeId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { providerMeetingId: fakeId, joinUrl: `https://zoom.example/mock-join/${fakeId}` };
  }

  async cancelMeeting(providerMeetingId: string): Promise<void> {
    console.warn(`[MockMeetingProvider] Cancelling FAKE meeting ${providerMeetingId}.`);
  }
}
