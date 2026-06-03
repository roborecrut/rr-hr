/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Тонкий адаптер поверх react-router-dom, сохраняющий прежний API useRouter()
 * (path, query, navigate(to, queryParams?)) — чтобы существующие страницы
 * не пришлось переписывать.
 */

import React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

interface RouterContextType {
  path: string;
  query: Record<string, string>;
  navigate: (toPath: string, queryParams?: Record<string, string>) => void;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  // BrowserRouter уже стоит в main.tsx — здесь обёртка не нужна.
  return <>{children}</>;
}

export function useRouter(): RouterContextType {
  const location = useLocation();
  const navigateRR = useNavigate();
  const [searchParams] = useSearchParams();

  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const navigate = (toPath: string, queryParams?: Record<string, string>) => {
    const serializedQuery = queryParams
      ? "?" + new URLSearchParams(queryParams).toString()
      : "";
    navigateRR(toPath + serializedQuery);
  };

  return {
    path: location.pathname,
    query,
    navigate,
  };
}
