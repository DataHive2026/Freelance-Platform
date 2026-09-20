import type { MeetingProviderAdapter } from "./provider";

/**
 * Zoom's Server-to-Server OAuth app type — no user-facing OAuth consent
 * screen, just account-level credentials exchanged for a short-lived
 * access token per request. Talks to Zoom's REST API directly rather
 * than pulling in their SDK, same reasoning as RazorpayAdapter: the
 * surface used here (create/cancel a meeting, get a token) is small
 * enough to keep fully visible in one file.
 */
export class ZoomAdapter implements MeetingProviderAdapter {
  private accountId: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    if (!accountId || !clientId || !clientSecret) {
      throw new Error("ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET not set — see .env.example");
    }
    this.accountId = accountId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${this.accountId}`,
      { method: "POST", headers: { Authorization: `Basic ${auth}` } }
    );
    if (!res.ok) {
      throw new Error(`Zoom OAuth token request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.access_token as string;
  }

  async createMeeting(input: { topic: string; startTime: string; durationMinutes: number }) {
    const token = await this.getAccessToken();
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // scheduled meeting
        start_time: input.startTime,
        duration: input.durationMinutes,
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    if (!res.ok) {
      throw new Error(`Zoom meeting creation failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { providerMeetingId: String(data.id), joinUrl: data.join_url as string };
  }

  async cancelMeeting(providerMeetingId: string): Promise<void> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://api.zoom.us/v2/meetings/${providerMeetingId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // Zoom returns 204 on success, 404 if it's already gone — treat both
    // as "cancelled" rather than throwing on the 404 case.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Zoom meeting cancellation failed: ${res.status} ${await res.text()}`);
    }
  }
}
