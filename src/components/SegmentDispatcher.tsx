/**
 * Dispatches the first URL segment to the right page:
 * - /employer{publicId}/...  → EmployerPanel (path picked up by its own parser)
 * - /candidate{publicId}/... → CandidateFlow
 * - everything else          → CompanyLanding (slug-based public page)
 *
 * This sidesteps React Router v6's "param must be a full segment" limitation
 * and lets the app keep clean concatenated URLs like /employerempa597a5/profile.
 */
import React from "react";
import { useParams } from "react-router-dom";
import EmployerPanel from "../pages/EmployerPanel";
import CandidateFlow from "../pages/CandidateFlow";
import CompanyLanding from "../pages/CompanyLanding";

export default function SegmentDispatcher() {
  const { firstSeg = "" } = useParams();
  if (/^employer[A-Za-z0-9_-]+$/.test(firstSeg)) return <EmployerPanel />;
  if (/^candidate[A-Za-z0-9_-]+$/.test(firstSeg)) return <CandidateFlow />;
  return <CompanyLanding />;
}