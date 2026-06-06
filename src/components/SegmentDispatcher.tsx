/**
 * Dispatches the first URL segment to the right page:
 * - /employer{publicId}/...  → EmployerPanel (path picked up by its own parser)
 * - /candidate{publicId}/... → CandidateFlow
 * - everything else          → CompanyLanding (slug-based public page)
 *
 * This sidesteps React Router v6's "param must be a full segment" limitation
 * and lets the app keep clean concatenated URLs like /employerempa597a5/profile.
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useRouter } from "./RouterContext";
import { supabase } from "@/integrations/supabase/client";
import EmployerPanel from "../pages/EmployerPanel";
import CandidateFlow from "../pages/CandidateFlow";
import CompanyLanding from "../pages/CompanyLanding";

export default function SegmentDispatcher() {
  const { firstSeg = "" } = useParams();
  const { navigate, path } = useRouter();
  const [resolved, setResolved] = useState<"checking" | "render" | "candidate">("checking");

  // New + legacy URL prefixes
  if (/^(emp|employer)[A-Za-z0-9_-]+$/.test(firstSeg)) return <EmployerPanel />;
  if (/^(cand|candidate)[A-Za-z0-9_-]+$/.test(firstSeg)) return <CandidateFlow />;
  if (/^com\d+$/.test(firstSeg)) {
    // /com{cid}/vac{vid}/cand{pid}/... should render the candidate cabinet,
    // not the company landing (otherwise the landing treats `cand…` as an
    // unknown sub-tab and redirects back to the company tab).
    const segments = path.split("/").filter(Boolean);
    if (segments.some((s) => /^(cand|candidate)[A-Za-z0-9_-]+$/.test(s))) {
      return <CandidateFlow />;
    }
    return <CompanyLanding />;
  }

  // Bare candidate public_id (e.g. /200002/...), or legacy company slug.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolved("checking");

      // Bare numeric → maybe a candidate public_id.
      if (/^\d{4,}$/.test(firstSeg)) {
        const { data: cand } = await supabase
          .from("candidates")
          .select("public_id")
          .eq("public_id", firstSeg)
          .maybeSingle();
        if (cancelled) return;
        if (cand?.public_id) {
          setResolved("candidate");
          return;
        }
      }

      const { data } = await supabase
        .from("companies")
        .select("public_id, slug, legacy_slug")
        .or(`legacy_slug.eq.${firstSeg},slug.eq.${firstSeg}`)
        .maybeSingle();
      if (cancelled) return;
      if (data?.public_id) {
        const rest = path.split("/").slice(2).join("/");
        navigate(`/com${data.public_id}${rest ? "/" + rest : ""}`);
      } else {
        setResolved("render");
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSeg]);

  if (resolved === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Загрузка…
      </div>
    );
  }
  if (resolved === "candidate") return <CandidateFlow />;
  return <CompanyLanding />;
}