"use client";


import { FileText, Sparkles } from "lucide-react";
import { StepCopy } from "./step-copy";
import { StepVisual } from "./step-visual";

export function StepCopyVisual() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent-champagne" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Copy</h3>
            <p className="text-xs text-text-muted">Defina a mensagem principal do criativo.</p>
          </div>
        </div>
        <div className="theme-panel rounded-[26px] p-4 lg:p-5">
          <StepCopy />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-champagne" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Visual</h3>
            <p className="text-xs text-text-muted">Escolha fotos, brand kit, logo e tema visual.</p>
          </div>
        </div>
        <div className="theme-panel rounded-[26px] p-4 lg:p-5">
          <StepVisual />
        </div>
      </section>
    </div>
  );
}

