/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import TelegramMiniAppBoot from "./components/TelegramMiniAppBoot";
import AuthRecover from "./components/AuthRecover";
import LandingPage from "./pages/LandingPage";
import MainCatalogPage from "./pages/MainCatalogPage";
import EmployerPanel from "./pages/EmployerPanel";
import CandidateFlow from "./pages/CandidateFlow";
import AdminPanel from "./pages/AdminPanel";
import AdminGuard from "./components/AdminGuard";
import JobVacancyLanding from "./pages/JobVacancyLanding";
import CompanyLanding from "./pages/CompanyLanding";
import NotFoundPage from "./pages/NotFoundPage";
import SegmentDispatcher from "./components/SegmentDispatcher";
import AuthCallback from "./pages/AuthCallback";

export default function App() {
  return (
    <BrowserRouter>
      <TelegramMiniAppBoot />
      <AuthRecover />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/main" element={<LandingPage />} />
        <Route path="/vacancy" element={<MainCatalogPage />} />
        <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
        <Route path="/job" element={<JobVacancyLanding />} />
        <Route path="/auth" element={<LandingPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/setup" element={<EmployerPanel />} />
        <Route path="/employer" element={<EmployerPanel />} />
        <Route path="/employer/*" element={<EmployerPanel />} />
        <Route path="/candidate" element={<CandidateFlow />} />
        <Route path="/candidate/*" element={<CandidateFlow />} />
        {/* Concatenated dynamic segment:
            /employer{id}/..., /candidate{id}/...,
            /com{id}, /com{id}/vac{id}/...,
            or legacy company slug. */}
        <Route path="/:firstSeg" element={<SegmentDispatcher />} />
        <Route path="/:firstSeg/*" element={<SegmentDispatcher />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
