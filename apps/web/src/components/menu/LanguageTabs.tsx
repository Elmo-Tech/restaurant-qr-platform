export interface LanguageTabOption {
  locale: string;
  label: string;
  /** Short plain-text state marker, e.g. "Default", "Translated", "Not translated yet" -- never a completion percentage (FT-1, Section 15). */
  stateLabel: string;
}

export interface LanguageTabsProps {
  options: LanguageTabOption[];
  activeLocale: string;
  onSelect: (locale: string) => void;
}

/**
 * One consistent translation-language tab bar shared by the Menu Dialog,
 * Category Dialog, and Product Editor (FT-1, Section 15). Plain, native
 * `<button>`s -- keyboard-accessible and focusable with no custom ARIA
 * widget needed (Section 22); the state marker is always visible text, never
 * conveyed by color alone.
 */
export function LanguageTabs({ options, activeLocale, onSelect }: LanguageTabsProps) {
  if (options.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = option.locale === activeLocale;
        return (
          <button
            key={option.locale}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(option.locale)}
            className={`rounded-lg border px-3 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#7A5138] focus-visible:ring-offset-1 ${
              isActive
                ? 'border-[#7A5138] bg-[#7A5138]/10 text-[#7A5138]'
                : 'border-[#E5DED6] bg-white text-[#655D56] hover:border-[#AFA397]'
            }`}
          >
            <span className="block font-medium">{option.label}</span>
            <span className="block text-xs opacity-80">{option.stateLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
