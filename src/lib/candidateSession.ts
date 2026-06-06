/**
 * Lightweight candidate session stored in localStorage.
 * Candidates authenticate via email/password (not Supabase Auth) and
 * receive an opaque token from the candidate_email_signup / login RPCs.
 */
export type CandidateSession = {
  token: string;
  candidate_id: string;
  public_id: string | null;
  project_id?: string | null;
  company_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  applications?: CandidateApplication[];
};

export type CandidateApplication = {
  candidate_id: string;
  public_id: string | null;
  project_id: string | null;
  company_id: string | null;
  role_name?: string | null;
  company_name?: string | null;
  company_slug?: string | null;
  current_stage?: string | null;
};

const KEY = "cand_session";

export function saveCandidateSession(s: CandidateSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    // Backwards-compat for CandidateFlow which reads `cand_session_id`.
    localStorage.setItem("cand_session_id", s.public_id ? `candidate${s.public_id}` : s.candidate_id);
    localStorage.setItem("cand_role", "candidate");
  } catch {}
}

export function getCandidateSession(): CandidateSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CandidateSession;
  } catch {
    return null;
  }
}

export function clearCandidateSession() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("cand_session_id");
    localStorage.removeItem("cand_role");
  } catch {}
}