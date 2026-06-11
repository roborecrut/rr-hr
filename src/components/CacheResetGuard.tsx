/**
 * Следит за сменой раздела (employer / candidate / public) и сбрасывает
 * прикладной кэш так, чтобы устаревшие данные одной роли не «протекали» в
 * другую. Сохраняет Supabase-токены и активные сессии ролей (см. cacheReset).
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { resetForScope, routeScope, type RouteScope } from "@/lib/cacheReset";

export default function CacheResetGuard() {
  const { pathname } = useLocation();
  const prev = useRef<RouteScope | null>(null);

  useEffect(() => {
    const scope = routeScope(pathname);
    if (prev.current === null) {
      prev.current = scope;
      return;
    }
    if (prev.current !== scope) {
      resetForScope(scope);
      prev.current = scope;
    }
  }, [pathname]);

  return null;
}