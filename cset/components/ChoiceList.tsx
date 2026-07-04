"use client";

import MathText from "./MathText";

interface Props {
  choices: string[];
  selected: number | null;
  onSelect: (i: number) => void;
  /** when set, reveal correctness: highlight the key green, wrong pick red */
  revealKey?: number | null;
  disabled?: boolean;
}

export default function ChoiceList({ choices, selected, onSelect, revealKey = null, disabled }: Props) {
  return (
    <div className="space-y-2">
      {choices.map((c, i) => {
        const isSelected = selected === i;
        const revealed = revealKey !== null;
        let cls =
          "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-sky-400 dark:hover:border-sky-500";
        if (revealed && i === revealKey) {
          cls = "border-green-500 bg-green-50 dark:bg-green-950/40";
        } else if (revealed && isSelected && i !== revealKey) {
          cls = "border-red-500 bg-red-50 dark:bg-red-950/40";
        } else if (isSelected) {
          cls = "border-sky-500 bg-sky-50 dark:bg-sky-950/40";
        }
        return (
          <button
            key={i}
            onClick={() => !disabled && !revealed && onSelect(i)}
            disabled={disabled || revealed}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors flex gap-3 items-baseline ${cls} ${
              revealed || disabled ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <span className="font-semibold text-slate-500 dark:text-slate-400">{String.fromCharCode(65 + i)}.</span>
            <MathText text={c} className="flex-1" />
          </button>
        );
      })}
    </div>
  );
}
