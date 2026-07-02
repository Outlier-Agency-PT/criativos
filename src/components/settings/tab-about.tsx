"use client";


import { Info, ShieldCheck, FileText } from "lucide-react";

export function TabAbout() {
  return (
    <div className="space-y-6">
      {/* Identidade do sistema */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">Sobre</h3>
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-text-primary">Criativos</p>
          <p className="text-sm text-text-secondary">Desenvolvido por Torriani</p>
          <p className="text-xs text-text-muted">
            Software proprietário licenciado — uso restrito.
          </p>
        </div>
      </div>

      {/* Resumo dos termos */}
      <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">
            Licença e confidencialidade
          </h3>
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-text-secondary">
          <p>
            O Criativos é licenciado, não vendido. Você pode usá-lo nos seus
            próprios projetos e disponibilizar o acesso aos seus alunos e
            colaboradores, sob sua conta e responsabilidade.
          </p>
          <p>
            É proibido revender, sublicenciar ou distribuir o software,
            distribuir o código-fonte (confidencial, sob NDA) ou criar
            assinatura, SaaS ou cobrança recorrente tendo o software como base.
          </p>
        </div>
        <a
          href="/LICENSE.txt"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent-champagne hover:underline"
        >
          <FileText className="w-3.5 h-3.5" />
          Ver licença completa
        </a>
      </div>
    </div>
  );
}
