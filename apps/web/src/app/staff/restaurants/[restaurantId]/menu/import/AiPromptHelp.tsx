'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../../../components/ui/Button';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { MENU_AI_PROMPT } from '../../../../../../lib/menu-import/ai-prompt';

/**
 * The manual fallback of the AI import: instructions to paste into any AI chat with the menu photos, so the chat
 * prepares the Excel template. Closed by default, so it does not crowd the upload form.
 */
export function AiPromptHelp() {
  const { t } = useStaffI18n();
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  async function copyPrompt() {
    let next: 'copied' | 'failed' = 'copied';
    try {
      await navigator.clipboard.writeText(MENU_AI_PROMPT);
    } catch {
      next = 'failed';
    }
    setCopy(next);
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopy('idle'), 3_000);
  }

  return (
    <details className="mt-1 rounded-md border border-border bg-card">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground">
        {t('import.ai.summary')}
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
        <p className="text-xs text-muted-foreground">{t('import.ai.body')}</p>
        <textarea
          readOnly
          dir="ltr"
          rows={8}
          value={MENU_AI_PROMPT}
          aria-label={t('import.ai.label')}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y rounded-md border border-input bg-background p-3 text-start font-mono text-xs leading-relaxed text-foreground"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => void copyPrompt()}>
            {t('import.ai.copy')}
          </Button>
          <span role="status" className={copy === 'failed' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {copy === 'copied' ? t('import.ai.copied') : copy === 'failed' ? t('import.ai.copyFailed') : ''}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t('import.ai.noFile')}</p>
      </div>
    </details>
  );
}
