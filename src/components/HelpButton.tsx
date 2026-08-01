import { useEffect, type MouseEvent } from 'react';
import { HelpCircle } from 'lucide-react';
import { genericControlHelp, resolveControlHelp } from '../help/registry';
import { useHelp } from '../help/HelpContext';
import type { ControlHelpOption } from '../help/types';

export function HelpButton({
  helpId,
  label,
  onReset,
  value,
  options,
}: {
  helpId: string;
  label?: string;
  onReset?: () => void;
  value?: string;
  options?: ReadonlyArray<ControlHelpOption>;
}) {
  const { openHelp, registerHelp } = useHelp();
  const resolved = resolveControlHelp(helpId, label);
  const help = options?.length ? { ...resolved, options } : resolved;
  useEffect(() => {
    registerHelp(help ?? genericControlHelp(helpId, label ?? helpId));
  }, [help, helpId, label, registerHelp]);
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const select = event.currentTarget.closest('label')?.querySelector('select');
    const inferredOptions = options?.length
      ? options
      : [...(select?.options ?? [])].map((option) => ({
          value: option.value,
          label: option.textContent?.trim() || option.value,
          description:
            option.dataset.help ||
            `Uses “${option.textContent?.trim() || option.value}” for ${help.title.toLowerCase()}.`,
        }));
    const contextualHelp = inferredOptions.length ? { ...help, options: inferredOptions } : help;
    openHelp(helpId, label, onReset, value ?? select?.value, contextualHelp);
  };
  return (
    <button
      type="button"
      className="help-button"
      aria-label={`Help: ${help.title}`}
      data-help-id={helpId}
      data-help-label={label ?? help.title}
      data-help-short={help.short}
      title={help.short}
      onClick={open}
    >
      <HelpCircle size={12} aria-hidden="true" />
    </button>
  );
}
