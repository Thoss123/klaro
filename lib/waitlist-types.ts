export type WaitlistStatus = 'partial' | 'completed' | 'abandoned';

export type WaitlistFormData = {
  prozesse?: string;
  unternehmensgroesse?: string;
  tools?: string;
  vorname?: string;
  firmenname?: string;
  email?: string;
  telefon?: string;
};

export type WaitlistUpsertBody = {
  sessionToken: string;
  step: number;
  status?: WaitlistStatus;
  source?: string;
  referrer?: string;
  data?: WaitlistFormData;
};

export type WaitlistSignupRow = WaitlistFormData & {
  id: string;
  session_token: string;
  step_reached: number;
  status: WaitlistStatus;
  source: string;
  referrer: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
