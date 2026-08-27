export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

// V1.7 VB-41. The docked nav's controls: a Button with a wrapper the focus
// ring can hug once the container is gone. See NavButton.tsx.
export { NavButton } from './NavButton';
export type { NavButtonProps, NavDirection } from './NavButton';

// V1.9 VB-53. The band those controls stand in, and the melt it plays when a
// question is replaced. See NavCluster.tsx.
export {
  NavCluster,
  NAV_MELT_LAYER_CLASS,
  NAV_MELT_CLASS,
  NAV_RISE_CLASS,
  NAV_CONTROL_ATTR,
  NAV_FATE_ATTR,
  NAV_INDEX_PROP,
} from './NavCluster';
export type { NavClusterProps } from './NavCluster';

export { Pill, PillGroup } from './Pill';
export type { PillProps, PillOption, PillGroupProps } from './Pill';

/** V2.0 VB-60 — the same choice group, drawn as the brain's own orbs. Which
 * questions get it is core/choice/orbs.ts's `usesOrbChoice`, never an `if` at
 * a call site. */
export { OrbGroup } from './OrbGroup';
export type { OrbGroupProps, OrbOption } from './OrbGroup';

/** V2.5 VB-118 — the vertical pick as icon tiles with a modern radio mark.
 * Which questions stand this way is core/choice/verticalPick.ts's
 * `usesVerticalPick`; VB-123's merged role screen reuses the same grammar
 * (core/choice/pairedPick.ts). */
export { VerticalPick } from './VerticalPick';
export type { VerticalPickProps } from './VerticalPick';

/** V2.5 VB-122 — the divided line: options wait dim on the left; crossing
 * the divider (drag, click, or Space/Enter — FLAG 4) is the answer. Which
 * questions are drawn this way is core/choice/dividedLine.ts's
 * `usesDividedLine`. */
export { DividedLine } from './DividedLine';
export type { DividedLineProps } from './DividedLine';

export { Field } from './Field';
export type { FieldProps } from './Field';

export { ReadOnlyBlock } from './ReadOnlyBlock';
export type { ReadOnlyBlockProps } from './ReadOnlyBlock';

/** V2.4 VB-107 — the anchored, non-modal popover (FLAG 1's settlement).
 * Floats above its caller's positioned container; Escape and outside-press
 * dismiss it; it never traps focus. See Popover.tsx for the whole contract. */
export { Popover } from './Popover';
export type { PopoverProps, PopoverDismissReason } from './Popover';

export { FileRow } from './FileRow';
export type { FileRowProps, BadgeTone } from './FileRow';

export { Banner } from './Banner';
export type { BannerProps, BannerVariant } from './Banner';

export { Meter } from './Meter';
export type { MeterProps, MeterStepData } from './Meter';

export { FlowProgress, STATUS_MARK_SPIN } from './FlowProgress';
export type { FlowProgressProps } from './FlowProgress';

export { NarratorToggle, NARRATOR_ICON } from './NarratorToggle';

export { Toast } from './Toast';
export type { ToastProps } from './Toast';

export { Sheet } from './Sheet';
export type { SheetProps } from './Sheet';

export { DeepDive, CHIP_SHIMMER } from './DeepDive';
export type { DeepDiveProps } from './DeepDive';

// V1.8 VB-49. One line pointing at the dictation the person's own computer
// already has. There is no microphone in this product — see DictationHint.tsx.
export { DictationHint } from './DictationHint';
export type { DictationHintProps } from './DictationHint';

export { BrandMark } from './BrandMark';
export type { BrandMarkProps, BrandMarkSpin, BrandMarkVariant } from './BrandMark';

export { Beats } from './Beats';
export type { BeatsProps } from './Beats';

export { TypedHeading, TypedModuleLabel } from './Typed';
export type { TypedHeadingProps, TypedModuleLabelProps } from './Typed';

export { FileTree } from './FileTree';
export type { FileTreeProps } from './FileTree';

export { BrainGlobe } from './BrainGlobe';
export type { BrainGlobeProps } from './BrainGlobe';

// V2.0 VB-71. The disc on the stage that says the globe can be turned, once.
// Rendered by BrainGlobe, which owns where it sits and which stage is showing;
// this is the cue itself, and it owns whether there is anything left to say.
export { BrainTurnCue } from './BrainTurnCue';
export type { BrainTurnCueProps } from './BrainTurnCue';

// V1.5 VB-27. The floating summary a sub-node shows on hover, focus and
// activation. Rendered by BrainGlobe, which owns where it sits and when it is
// open; this is the card itself.
export { NodeSummaryCard } from './NodeSummary';
export type { NodeSummaryCardProps } from './NodeSummary';

// V1.5 VB-28. Exported rather than kept private to Home because VB-27's node
// summary renders the same recommendations against the same copy.
export { RecommendationRow, RecommendationHide, recommendationCopy } from './Recommendation';
export type { RecommendationRowProps, RecommendationHideProps, RecommendationCopy } from './Recommendation';
