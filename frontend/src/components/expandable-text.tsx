import { useState } from "react"

import { useT } from "@/lib/i18n"

// Descriptions from bank statements are often long, boilerplate-heavy lines
// (POS terminal id, reference numbers, CAU codes...). Truncating them by
// default keeps tables scannable, but the full text still needs to be
// reachable without relying on a hover tooltip (doesn't work on touch, and
// disappears before you can select/copy text).
const COLLAPSE_THRESHOLD = 45

export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const t = useT()
  const collapsible = text.length > COLLAPSE_THRESHOLD

  return (
    <div className={className}>
      <span
        className={expanded ? "whitespace-normal break-words" : "block truncate"}
        title={!expanded && collapsible ? text : undefined}
      >
        {text}
      </span>
      {collapsible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  )
}
