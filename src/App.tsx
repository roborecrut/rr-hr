/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import DemoInterviewPage from "./pages/DemoInterviewPage";
import VacancyCatalogPage from "./pages/VacancyCatalogPage";
import BlogListPage from "./pages/BlogListPage";
import BlogPostPage from "./pages/BlogPostPage";
import FaqPage from "./pages/FaqPage";
import EmployerPanel from "./pages/EmployerPanel";
import CandidateFlow from "./pages/CandidateFlow";
import AdminPanel from "./pages/AdminPanel";
import JobVacancyLanding from "./pages/JobVacancyLanding";
import CompanyLanding from "./pages/CompanyLanding";
import NotFoundPage from "./pages/NotFoundPage";
import OfferPage from "./pages/OfferPage";
import { PaymentSuccessPage, PaymentFailPage } from "./pages/PaymentResultPage";
import SegmentDispatcher from "./components/SegmentDispatcher";
import SessionBootstrap from "./components/SessionBootstrap";
import { AIWaitProvider } from "./components/AIWaitProvider";
import { AIRestartGate } from "./components/AIRestartGate";

export default function App() {
  return (
    <BrowserRouter>
      <AIWaitProvider>
        <SessionBootstrap />
        <AIRestartGate />
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/main" element={<LandingPage />} />
        <Route path="/demo" element={<DemoInterviewPage />} />
        <Route path="/vacancy" element={<VacancyCatalogPage />} />
        <Route path="/vacancies" element={<VacancyCatalogPage />} />
        <Route path="/blog" element={<BlogListPage />} />
        <Route path="/blog/:pid" element={<BlogPostPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/job" element={<JobVacancyLanding />} />
        <Route path="/auth" element={<LandingPage />} />
        <Route path="/setup" element={<EmployerPanel />} />
        <Route path="/employer" element={<EmployerPanel />} />
        <Route path="/employer/*" element={<EmployerPanel />} />
        <Route path="/candidate" element={<CandidateFlow />} />
        <Route path="/candidate/*" element={<CandidateFlow />} />
        <Route path="/company/:slug" element={<CompanyLanding />} />
        <Route path="/offer" element={<OfferPage />} />
        <Route path="/payment/success" element={<PaymentSuccessPage />} />
        <Route path="/payment/fail" element={<PaymentFailPage />} />
        {/* Concatenated dynamic segment: /employer{id}/..., /candidate{id}/..., or company slug */}
        <Route path="/:firstSeg" element={<SegmentDispatcher />} />
        <Route path="/:firstSeg/*" element={<SegmentDispatcher />} />
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AIWaitProvider>
    </BrowserRouter>
  );
}
