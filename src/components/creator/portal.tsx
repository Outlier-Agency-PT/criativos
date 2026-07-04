"use client";


import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renderiza children direto no document.body, escapando de qualquer ancestor
 * com `backdrop-filter`, `transform` ou `filter` (que quebrariam `position: fixed`).
 *
 * Usado pelas modais do wizard de criação — sem isso, ao rolar a página, a modal
 * fica desalinhada do viewport porque o `.theme-panel` ancestral cria um novo
 * containing block.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

