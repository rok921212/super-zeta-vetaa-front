// `import { … } from 'scoresync'` inside a code layer. The same shared hooks
// and helpers the built-in themes (Theme1-8) use, so a theme component can be
// pasted into a code layer and give the same numbers.
//
// Bundled into /code-sdk/v1/runtime.js only (sdk-src/codeRuntime.tsx). The
// ranking pager's socket is stubbed there: pages turn on their timer.

export {
  computeRankedStandings, buildOverallStandings, computeMatchStandings, buildStandings,
  compareOfficialStandings, pickStandingTeam, isMatchPlayed,
} from '../../Themes/shared/hooks/officialStandings.ts';
export { useSortedTeams, deriveTeams, isPlayerDead, isRondoMap, toAlertTeam } from '../../Themes/shared/hooks/unsortteams.ts';
export { computeMatchTotals } from '../../Themes/shared/hooks/matchTotals.ts';
export { useLiveKillFeed } from '../../Themes/shared/hooks/liveKillFeed.ts';
export { useKillMilestones } from '../../Themes/shared/hooks/killMilestones.ts';
export { useRecallEvents, useRecallBanner } from '../../Themes/shared/hooks/recallEvents.ts';
export { wwcdChance } from '../../Themes/shared/hooks/liveDerived.ts';
export { computeFraggerScores, buildFraggerPool } from '../../Themes/shared/hooks/fraggerScore.ts';
export { useRankingPager, rankingPageCount } from '../../Themes/shared/hooks/rankingPager.ts';
export { useLogoFlagPhase } from '../../Themes/shared/hooks/logoFlagSwitch.ts';
export { TeamLogo, TeamLogoSvg } from '../../Themes/shared/components/TeamLogo.tsx';
export { teamSlotColor } from '../../Themes/shared/teamColor.ts';
export { applyFormatter as format } from '../bindings/formatters.ts';
export { fillTokens } from '../bindings/tokens.ts';
export { useData, useEvent } from './runtimeStore.ts';
export { default as TeamRecallOverlay } from '../../Themes/shared/components/TeamRecallOverlay.tsx';
export { default as RecalledOverlay } from '../../Themes/shared/components/RecalledOverlay.tsx';
