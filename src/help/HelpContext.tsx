import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { HelpCircle, Search, X } from 'lucide-react';
import { helpRegistry, helpSlug, resolveControlHelp } from './registry';
import type { ControlHelp } from './types';

interface HelpContextValue {
  helpMode: boolean;
  panelOpen: boolean;
  active: ControlHelp | null;
  openHelp(
    id: string,
    label?: string,
    reset?: (() => void) | null,
    selectedValue?: string,
    override?: ControlHelp,
  ): void;
  closeHelp(): void;
  toggleHelpMode(): void;
  togglePanel(): void;
  registerHelp(help: ControlHelp): void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp(): HelpContextValue {
  const context = useContext(HelpContext);
  if (!context) throw new Error('useHelp must be used inside HelpProvider.');
  return context;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const [helpMode, setHelpMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [active, setActive] = useState<ControlHelp | null>(null);
  const [activeOptionValue, setActiveOptionValue] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    help: ControlHelp;
    left: number;
    top: number;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [registered, setRegistered] = useState<Record<string, ControlHelp>>(() => ({
    ...helpRegistry,
  }));
  const resetRef = useRef<(() => void) | null>(null);

  const registerHelp = useCallback((help: ControlHelp) => {
    setRegistered((current) => (current[help.id] ? current : { ...current, [help.id]: help }));
  }, []);
  const openHelp = useCallback(
    (
      id: string,
      label?: string,
      reset?: (() => void) | null,
      selectedValue?: string,
      override?: ControlHelp,
    ) => {
      const help = override ?? registered[id] ?? resolveControlHelp(id, label);
      registerHelp(help);
      resetRef.current = reset ?? null;
      setTooltip(null);
      setActiveOptionValue(selectedValue ?? null);
      setActive(help);
    },
    [registerHelp, registered],
  );
  const closeHelp = useCallback(() => {
    setActive(null);
    setActiveOptionValue(null);
    resetRef.current = null;
  }, []);
  const toggleHelpMode = useCallback(() => {
    setHelpMode((value) => !value);
    setPanelOpen(true);
  }, []);
  const togglePanel = useCallback(() => setPanelOpen((value) => !value), []);

  useEffect(() => {
    document.body.classList.toggle('help-mode-active', helpMode);
    return () => document.body.classList.remove('help-mode-active');
  }, [helpMode]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.help-root');
    if (!root) return;
    let timer: number | null = null;
    let currentTarget: HTMLElement | null = null;
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const closeTooltip = () => {
      clearTimer();
      currentTarget = null;
      setTooltip(null);
    };
    const tooltipTarget = (target: EventTarget | null) => {
      const element =
        target instanceof HTMLElement
          ? target.closest<HTMLElement>(
              '[data-tooltip-id], [data-tooltip], button:not(.help-button), input:not([type="file"]), textarea',
            )
          : null;
      if (!element || element.closest('.help-panel, .help-popover, .shared-control-tooltip'))
        return null;
      if (element.matches('select') || element.closest('.canvas-stage')) return null;
      return element;
    };
    const helpFor = (element: HTMLElement): ControlHelp => {
      const label =
        element.dataset.tooltipLabel ||
        element.getAttribute('aria-label') ||
        element.title ||
        element.closest('label')?.querySelector(':scope > span')?.textContent?.trim() ||
        element.textContent?.trim().replace(/\s+/g, ' ') ||
        element.getAttribute('name') ||
        'Control';
      const id = element.dataset.tooltipId || `action.${helpSlug(label).slice(0, 70) || 'control'}`;
      if (element.dataset.tooltip) {
        return {
          id,
          title: label,
          short: element.dataset.tooltip,
          description: element.dataset.tooltip,
        };
      }
      if (element.matches('button') && !element.dataset.tooltipId) {
        const text = element.title || `${label} activates this action.`;
        return { id, title: label, short: text, description: text };
      }
      if (element.matches('input[type="checkbox"]') && !element.dataset.tooltipId) {
        const text = `Turns ${label.toLowerCase()} on or off.`;
        return { id, title: label, short: text, description: text };
      }
      return resolveControlHelp(id, label);
    };
    const show = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 170, Math.max(170, rect.left + rect.width / 2));
      const top = rect.bottom + 10 < window.innerHeight - 90 ? rect.bottom + 10 : rect.top - 10;
      setTooltip({ help: helpFor(element), left, top });
    };
    const pointerOver = (event: Event) => {
      const element = tooltipTarget(event.target);
      if (!element || element === currentTarget) return;
      clearTimer();
      currentTarget = element;
      timer = window.setTimeout(() => {
        if (currentTarget === element) show(element);
      }, 420);
    };
    const pointerOut = (event: MouseEvent) => {
      const element = tooltipTarget(event.target);
      if (!element || element !== currentTarget) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      closeTooltip();
    };
    const focusIn = (event: FocusEvent) => {
      const element = tooltipTarget(event.target);
      if (!element) return;
      clearTimer();
      currentTarget = element;
      show(element);
    };
    const focusOut = (event: FocusEvent) => {
      const element = tooltipTarget(event.target);
      if (!element || element !== currentTarget) return;
      closeTooltip();
    };
    const pointerDown = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest('.canvas-stage')) closeTooltip();
    };
    root.addEventListener('pointerover', pointerOver);
    root.addEventListener('pointerout', pointerOut);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);
    root.addEventListener('pointerdown', pointerDown, true);
    return () => {
      clearTimer();
      root.removeEventListener('pointerover', pointerOver);
      root.removeEventListener('pointerout', pointerOut);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
      root.removeEventListener('pointerdown', pointerDown, true);
    };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (active) closeHelp();
      else if (helpMode) setHelpMode(false);
      else if (panelOpen) setPanelOpen(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, closeHelp, helpMode, panelOpen]);

  const interceptHelpMode = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (active && !(event.target as HTMLElement).closest('.help-popover, .help-button')) {
      closeHelp();
    }
    if (!helpMode) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-help-id]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openHelp(target.dataset.helpId!, target.dataset.helpLabel);
  };

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const all = Object.values(registered);
    if (!normalized) return all.slice(0, 80);
    return all
      .filter((help) =>
        [help.id, help.title, help.short, help.description, ...(help.keywords ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 80);
  }, [query, registered]);

  const value = useMemo<HelpContextValue>(
    () => ({
      helpMode,
      panelOpen,
      active,
      openHelp,
      closeHelp,
      toggleHelpMode,
      togglePanel,
      registerHelp,
    }),
    [active, closeHelp, helpMode, openHelp, panelOpen, registerHelp, toggleHelpMode, togglePanel],
  );

  return (
    <HelpContext.Provider value={value}>
      <div className="help-root" onClickCapture={interceptHelpMode}>
        {children}
      </div>
      {panelOpen && (
        <aside className="help-panel" aria-label="Searchable help">
          <header>
            <span>
              <HelpCircle size={16} />
              <strong>HELP MODE</strong>
            </span>
            <button className={helpMode ? 'active' : ''} onClick={toggleHelpMode}>
              {helpMode ? 'Exit inspect' : 'Inspect controls'}
            </button>
            <button
              className="icon-button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close help panel"
            >
              <X size={14} />
            </button>
          </header>
          <label className="help-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search datamosh, retouch, alpha, spacing…"
            />
          </label>
          <div className="help-results">
            {matches.map((help) => (
              <button key={help.id} onClick={() => openHelp(help.id, help.title)}>
                <strong>{help.title}</strong>
                <small>{help.short}</small>
              </button>
            ))}
            {!matches.length && <p>No matching controls.</p>}
          </div>
        </aside>
      )}
      {tooltip && !active && (
        <div
          className="shared-control-tooltip"
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong>{tooltip.help.title}</strong>
          <span>{tooltip.help.short}</span>
          {(tooltip.help.low || tooltip.help.high) && (
            <small>
              {[
                tooltip.help.low && `Low: ${tooltip.help.low}`,
                tooltip.help.high && `High: ${tooltip.help.high}`,
              ]
                .filter(Boolean)
                .join(' ')}
            </small>
          )}
        </div>
      )}
      {active && (
        <div
          className="help-popover"
          role="dialog"
          aria-modal="false"
          aria-label={`${active.title} help`}
        >
          <header>
            <span>
              <HelpCircle size={16} />
              <strong>{active.title.toUpperCase()}</strong>
            </span>
            <button className="icon-button" onClick={closeHelp} aria-label="Close contextual help">
              <X size={14} />
            </button>
          </header>
          <p>{active.description}</p>
          {active.options?.length ? (
            <div className="help-option-list">
              {active.options.map((option) => (
                <section
                  key={option.value}
                  className={option.value === activeOptionValue ? 'current' : ''}
                >
                  <strong>
                    {option.label}
                    {option.value === activeOptionValue ? ' · CURRENT' : ''}
                  </strong>
                  <span>{option.description}</span>
                </section>
              ))}
            </div>
          ) : null}
          {active.low && (
            <dl>
              <dt>Low</dt>
              <dd>{active.low}</dd>
            </dl>
          )}
          {active.high && (
            <dl>
              <dt>High</dt>
              <dd>{active.high}</dd>
            </dl>
          )}
          {active.performance && (
            <dl>
              <dt>Performance</dt>
              <dd>{active.performance}</dd>
            </dl>
          )}
          {active.output && (
            <dl>
              <dt>Output</dt>
              <dd>{active.output}</dd>
            </dl>
          )}
          {active.example && (
            <dl>
              <dt>Example</dt>
              <dd>{active.example}</dd>
            </dl>
          )}
          {active.defaultValue && (
            <dl>
              <dt>Default</dt>
              <dd>{active.defaultValue}</dd>
            </dl>
          )}
          {active.related?.length ? (
            <dl>
              <dt>Related</dt>
              <dd>{active.related.join(', ')}</dd>
            </dl>
          ) : null}
          {resetRef.current && (
            <button className="help-reset" onClick={() => resetRef.current?.()}>
              Reset to default
            </button>
          )}
        </div>
      )}
    </HelpContext.Provider>
  );
}
