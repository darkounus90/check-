"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/app/(dashboard)/nav-config";
import { cn } from "@/lib/utils";

/** Navegación del dashboard (resalta la ruta activa). Recibe sólo los ítems del rol. */
export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="Navegación principal">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
